var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var wsBroadcast_exports = {};
__export(wsBroadcast_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(wsBroadcast_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_apigatewaymanagementapi = require("@aws-sdk/client-apigatewaymanagementapi");
const ddbClient = new import_client_dynamodb.DynamoDBClient({});
const docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(ddbClient);
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "ps28-websocket-connections";
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || "";
const REGION = process.env.AWS_REGION || "us-east-1";
let apigwManagementApi = null;
function getApiGwClient() {
  if (!apigwManagementApi) {
    apigwManagementApi = new import_client_apigatewaymanagementapi.ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
      region: REGION
    });
  }
  return apigwManagementApi;
}
const handler = async (event) => {
  console.log("Received SNS Event for WebSocket Broadcast:", JSON.stringify(event));
  const records = event.Records || [];
  if (records.length === 0) {
    return { statusCode: 200, body: "No records to process." };
  }
  const messagePayload = records[0].Sns?.Message;
  if (!messagePayload) {
    return { statusCode: 200, body: "Empty message." };
  }
  try {
    const connectionsResult = await docClient.send(
      new import_lib_dynamodb.ScanCommand({
        TableName: CONNECTIONS_TABLE,
        ProjectionExpression: "connectionId"
      })
    );
    const connections = connectionsResult.Items || [];
    console.log(`Broadcasting flag delta to ${connections.length} active client connection(s)...`);
    if (connections.length === 0) {
      return { statusCode: 200, body: "Zero active connections." };
    }
    const client = getApiGwClient();
    const payloadBuffer = Buffer.from(messagePayload);
    const sendPromises = connections.map(async ({ connectionId }) => {
      try {
        await client.send(
          new import_client_apigatewaymanagementapi.PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: payloadBuffer
          })
        );
      } catch (err) {
        if (err.statusCode === 410 || err.$metadata?.httpStatusCode === 410 || err.name === "GoneException") {
          console.log(`Pruning stale WebSocket connection: ${connectionId}`);
          await docClient.send(
            new import_lib_dynamodb.DeleteCommand({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId }
            })
          );
        } else {
          console.error(`Failed to post to connection ${connectionId}:`, err);
        }
      }
    });
    await Promise.all(sendPromises);
    return { statusCode: 200, body: `Broadcast sent to ${connections.length} clients.` };
  } catch (error) {
    console.error("Fatal broadcast error:", error);
    return { statusCode: 500, body: "Broadcast failed: " + error.message };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
