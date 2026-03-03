import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const TABLE_NAME = "SuperBowl2026PoolSubmissions"; // ← change if needed
console.log("Target table:", TABLE_NAME);

// DynamoDB client setup
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

export const handler = async (event) => {
  let payload;
  console.log("Received event:", JSON.stringify(event, null, 2));
  try {
    payload = event;
  } catch {
    console.error("Failed to set payload");
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  console.log("Payload set:", JSON.stringify(payload, null, 2));

  const {
    userName,
    submissionTime = new Date().toISOString(),
    answers = [],
    paymentConfirmed = false,
  } = payload;

  console.log("Data validated:", { userName, submissionTime, answers });

  // --- Basic validation ---
  if (!userName || typeof userName !== "string" || userName.trim().length < 2) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Missing or invalid name" }),
    };
  }

  if (!Array.isArray(answers) || answers.length !== 20) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Exactly 20 answers required" }),
    };
  }

  // --- Deep validation ---
  const seenConfidences = new Set();
  for (const ans of answers) {
    const conf = Number(ans.confidence);
    if (
      !ans.id ||
      !ans.question ||
      !ans.answer ||
      isNaN(conf) ||
      conf < 1 ||
      conf > 20
    ) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Invalid answer format" }),
      };
    }
    if (seenConfidences.has(conf)) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Duplicate confidence values" }),
      };
    }
    seenConfidences.add(conf);
  }

  // --- Store in DynamoDB ---
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: randomUUID(),
          name: userName,
          submissionTime,
          paymentConfirmed,
          answers,
        },
      }),
    );

    console.log(`Stored submission for ${userName}`);
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "Prediction locked in — good luck!",
      }),
    };
  } catch (err) {
    console.error("DynamoDB error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to save submission" }),
    };
  }
};
