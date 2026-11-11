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
var getFlag_exports = {};
__export(getFlag_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(getFlag_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
const client = new import_client_dynamodb.DynamoDBClient({});
const docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
const FLAGS_TABLE = process.env.FLAGS_TABLE || "ps28-feature-flags";
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,x-admin-key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const FLAG_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const handler = async (event) => {
  const httpMethod = event.requestContext?.http?.method || event.httpMethod;
  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ""
    };
  }
  const flagId = event.pathParameters?.flagId || "new_checkout";
  if (!FLAG_ID_REGEX.test(flagId)) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Invalid flag identifier",
        details: "flagId must be 1-64 alphanumeric characters, underscores, or hyphens."
      })
    };
  }
  try {
    const result = await docClient.send(
      new import_lib_dynamodb.GetCommand({
        TableName: FLAGS_TABLE,
        Key: { flagId }
      })
    );
    const item = result.Item || {
      flagId,
      name: "new_checkout",
      description: "Switches mobile checkout between standard form and 1-Click Express Checkout.",
      value: false,
      version: 1,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedBy: "system@default"
    };
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(item)
    };
  } catch (error) {
    console.error("Error fetching flag from DynamoDB:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Failed to retrieve flag", details: error.message })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
