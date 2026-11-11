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
var wsDisconnect_exports = {};
__export(wsDisconnect_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(wsDisconnect_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
const client = new import_client_dynamodb.DynamoDBClient({});
const docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "ps28-websocket-connections";
const handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connectionId." };
  }
  try {
    await docClient.send(
      new import_lib_dynamodb.DeleteCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId }
      })
    );
    return { statusCode: 200, body: "Disconnected." };
  } catch (error) {
    console.error("WebSocket disconnect error:", error);
    return { statusCode: 500, body: "Failed to disconnect: " + error.message };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
