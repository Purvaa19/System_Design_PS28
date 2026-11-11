import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import crypto from 'node:crypto';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({});

const FLAGS_TABLE = process.env.FLAGS_TABLE || 'ps28-feature-flags';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-admin-key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Safe slug regex
const FLAG_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

function safeCompare(a?: string, b?: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const handler = async (event: any) => {
  // 0. Handle CORS preflight OPTIONS request
  const httpMethod = event.requestContext?.http?.method || event.httpMethod;
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  const t0 = performance.now();
  const flagId = event.pathParameters?.flagId || 'new_checkout';

  // 1. Input validation on flagId
  if (!FLAG_ID_REGEX.test(flagId)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Invalid flag identifier',
        details: 'flagId must be 1-64 alphanumeric characters, underscores, or hyphens.',
      }),
    };
  }

  // 2. Authentication check (x-admin-key) - Fail-Closed Security Policy
  const requiredApiKey = (process.env.ADMIN_API_KEY || ADMIN_API_KEY || '').trim();
  if (!requiredApiKey) {
    console.error('Server configuration error: ADMIN_API_KEY environment variable is not configured.');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'ConfigurationError',
        message: 'Server authentication is not configured. Mutation requests are rejected by policy (fail-closed).',
      }),
    };
  }

  const incomingKey = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
  if (!incomingKey || !safeCompare(incomingKey, requiredApiKey)) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Unauthorized',
        message: 'Missing or invalid x-admin-key header for mutation.',
      }),
    };
  }

  let desiredValue: boolean | undefined;
  if (event.body) {
    try {
      const parsed = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      if (typeof parsed.desiredValue === 'boolean') {
        desiredValue = parsed.desiredValue;
      }
    } catch {
      // fallback to toggle
    }
  }

  try {
    // 3. Read current version from DynamoDB
    const existing = await docClient.send(
      new GetCommand({
        TableName: FLAGS_TABLE,
        Key: { flagId },
      })
    );

    const currentItem = existing.Item || {
      flagId,
      name: 'new_checkout',
      description: 'Switches mobile checkout between standard form and 1-Click Express Checkout.',
      value: false,
      version: 0,
    };

    const newValue = desiredValue !== undefined ? desiredValue : !currentItem.value;
    const newVersion = (currentItem.version || 0) + 1;
    const updatedAt = new Date().toISOString();

    const updatedItem = {
      flagId,
      name: currentItem.name || 'new_checkout',
      description: currentItem.description || 'Switches mobile checkout experience.',
      value: newValue,
      version: newVersion,
      updatedAt,
      updatedBy: 'admin@systemdesign.lab',
    };

    // 4. Persist to DynamoDB (Cloud Configuration Storage)
    await docClient.send(
      new PutCommand({
        TableName: FLAGS_TABLE,
        Item: updatedItem,
      })
    );

    // 5. Publish to Amazon SNS (Pub/Sub Broker)
    if (SNS_TOPIC_ARN) {
      await snsClient.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject: `FlagUpdate:${flagId}`,
          Message: JSON.stringify({
            type: 'FLAG_DELTA_PUSH',
            flagId,
            value: newValue,
            version: newVersion,
            updatedAt,
            source: 'AWS_SNS_BROADCAST',
            timestamp: Date.now(),
          }),
        })
      );
    }

    const t1 = performance.now();
    const durationMs = Math.round((t1 - t0) * 10) / 10;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        flagState: updatedItem,
        processingDurationMs: durationMs,
        propagationStatus: 'synchronized',
      }),
    };
  } catch (error: any) {
    console.error('Error updating flag in DynamoDB/SNS:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to update flag', details: error.message }),
    };
  }
};
