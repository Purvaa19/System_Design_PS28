var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var updateFlag_exports = {};
__export(updateFlag_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(updateFlag_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_sns = require("@aws-sdk/client-sns");
var import_node_crypto = __toESM(require("node:crypto"), 1);
const ddbClient = new import_client_dynamodb.DynamoDBClient({});
const docClient = import_lib_dynamodb.DynamoDBDocumentClient.from(ddbClient);
const snsClient = new import_client_sns.SNSClient({});
const FLAGS_TABLE = process.env.FLAGS_TABLE || "ps28-feature-flags";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,x-admin-key",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Max-Age": "86400"
};
const FLAG_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return import_node_crypto.default.timingSafeEqual(bufA, bufB);
}
const handler = async (event) => {
  const httpMethod = event.requestContext?.http?.method || event.httpMethod;
  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ""
    };
  }
  const t0 = performance.now();
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
  const requiredApiKey = (process.env.ADMIN_API_KEY || ADMIN_API_KEY || "").trim();
  if (!requiredApiKey) {
    console.error("Server configuration error: ADMIN_API_KEY environment variable is not configured.");
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "ConfigurationError",
        message: "Server authentication is not configured. Mutation requests are rejected by policy (fail-closed)."
      })
    };
  }
  const incomingKey = event.headers?.["x-admin-key"] || event.headers?.["X-Admin-Key"];
  if (!incomingKey || !safeCompare(incomingKey, requiredApiKey)) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Unauthorized",
        message: "Missing or invalid x-admin-key header for mutation."
      })
    };
  }
  let desiredValue;
  if (event.body) {
    try {
      const parsed = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      if (typeof parsed.desiredValue === "boolean") {
        desiredValue = parsed.desiredValue;
      }
    } catch {
    }
  }
  try {
    const existing = await docClient.send(
      new import_lib_dynamodb.GetCommand({
        TableName: FLAGS_TABLE,
        Key: { flagId }
      })
    );
    const currentItem = existing.Item || {
      flagId,
      name: "new_checkout",
      description: "Switches mobile checkout between standard form and 1-Click Express Checkout.",
      value: false,
      version: 0
    };
    const newValue = desiredValue !== void 0 ? desiredValue : !currentItem.value;
    const newVersion = (currentItem.version || 0) + 1;
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const updatedItem = {
      flagId,
      name: currentItem.name || "new_checkout",
      description: currentItem.description || "Switches mobile checkout experience.",
      value: newValue,
      version: newVersion,
      updatedAt,
      updatedBy: "admin@systemdesign.lab"
    };
    await docClient.send(
      new import_lib_dynamodb.PutCommand({
        TableName: FLAGS_TABLE,
        Item: updatedItem
      })
    );
    if (SNS_TOPIC_ARN) {
      await snsClient.send(
        new import_client_sns.PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject: `FlagUpdate:${flagId}`,
          Message: JSON.stringify({
            type: "FLAG_DELTA_PUSH",
            flagId,
            value: newValue,
            version: newVersion,
            updatedAt,
            source: "AWS_SNS_BROADCAST",
            timestamp: Date.now()
          })
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
        propagationStatus: "synchronized"
      })
    };
  } catch (error) {
    console.error("Error updating flag in DynamoDB/SNS:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Failed to update flag", details: error.message })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
