import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { parseEvent, verifySignature } from "./domain.js";

const sqs = new SQSClient({});
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body ?? "";
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error("WEBHOOK_SECRET is not configured");
  if (!verifySignature(body, event.headers["x-webhook-signature"], secret)) return { statusCode: 401, body: "Invalid signature" };
  let webhook;
  try { webhook = parseEvent(body); } catch { return { statusCode: 400, body: "Invalid event" }; }
  // Acknowledge only after durable enqueue; an SQS failure returns a server error to the sender.
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify(webhook) }));
  return { statusCode: 202, body: "Accepted" };
}
