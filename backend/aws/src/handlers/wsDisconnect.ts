import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'ps28-websocket-connections';

export const handler = async (event: any) => {
  const connectionId = event.requestContext?.connectionId;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId.' };
  }

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
      })
    );

    return { statusCode: 200, body: 'Disconnected.' };
  } catch (error: any) {
    console.error('WebSocket disconnect error:', error);
    return { statusCode: 500, body: 'Failed to disconnect: ' + error.message };
  }
};
