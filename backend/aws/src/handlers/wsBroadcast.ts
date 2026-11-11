import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'ps28-websocket-connections';
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || '';
const REGION = process.env.AWS_REGION || 'us-east-1';

let apigwManagementApi: ApiGatewayManagementApiClient | null = null;
function getApiGwClient() {
  if (!apigwManagementApi) {
    apigwManagementApi = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
      region: REGION,
    });
  }
  return apigwManagementApi;
}

export const handler = async (event: any) => {
  console.log('Received SNS Event for WebSocket Broadcast:', JSON.stringify(event));

  const records = event.Records || [];
  if (records.length === 0) {
    return { statusCode: 200, body: 'No records to process.' };
  }

  const messagePayload = records[0].Sns?.Message;
  if (!messagePayload) {
    return { statusCode: 200, body: 'Empty message.' };
  }

  try {
    // 1. Scan DynamoDB Connections table
    const connectionsResult = await docClient.send(
      new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        ProjectionExpression: 'connectionId',
      })
    );

    const connections = connectionsResult.Items || [];
    console.log(`Broadcasting flag delta to ${connections.length} active client connection(s)...`);

    if (connections.length === 0) {
      return { statusCode: 200, body: 'Zero active connections.' };
    }

    const client = getApiGwClient();
    const payloadBuffer = Buffer.from(messagePayload);

    const sendPromises = connections.map(async ({ connectionId }) => {
      try {
        await client.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: payloadBuffer,
          })
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.$metadata?.httpStatusCode === 410 || err.name === 'GoneException') {
          // Connection is closed or expired, prune from table
          console.log(`Pruning stale WebSocket connection: ${connectionId}`);
          await docClient.send(
            new DeleteCommand({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId },
            })
          );
        } else {
          console.error(`Failed to post to connection ${connectionId}:`, err);
        }
      }
    });

    await Promise.all(sendPromises);
    return { statusCode: 200, body: `Broadcast sent to ${connections.length} clients.` };
  } catch (error: any) {
    console.error('Fatal broadcast error:', error);
    return { statusCode: 500, body: 'Broadcast failed: ' + error.message };
  }
};
