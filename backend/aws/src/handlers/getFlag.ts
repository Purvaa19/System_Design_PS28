import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const FLAGS_TABLE = process.env.FLAGS_TABLE || 'ps28-feature-flags';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-admin-key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const FLAG_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

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

  const flagId = event.pathParameters?.flagId || 'new_checkout';

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

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: FLAGS_TABLE,
        Key: { flagId },
      })
    );

    const item = result.Item || {
      flagId,
      name: 'new_checkout',
      description: 'Switches mobile checkout between standard form and 1-Click Express Checkout.',
      value: false,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system@default',
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(item),
    };
  } catch (error: any) {
    console.error('Error fetching flag from DynamoDB:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to retrieve flag', details: error.message }),
    };
  }
};
