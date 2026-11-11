import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'ps28-websocket-connections';

export const handler = async (event: any) => {
  const connectionId = event.requestContext?.connectionId;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId in request context.' };
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = now + 7200; // 2 hour TTL for automatic cleanup

  try {
    await docClient.send(
      new PutCommand({
        TableName: CONNECTIONS_TABLE,
        Item: {
          connectionId,
          connectedAt: new Date().toISOString(),
          ip: event.requestContext?.identity?.sourceIp || 'unknown',
          ttl,
        },
      })
    );

    return { statusCode: 200, body: 'Connected.' };
  } catch (error: any) {
    console.error('WebSocket connect error:', error);
    return { statusCode: 500, body: 'Failed to connect: ' + error.message };
  }
};
