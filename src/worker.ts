import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { parseEvent } from "./domain.js";

/** A teaching stand-in for a downstream API; replace with a real idempotent operation. */
async function processEvent(body: string): Promise<void> {
  const event = parseEvent(body);
  if (event.type === "simulate.429") throw new Error("Downstream rate limited (simulated 429)");
  console.log(JSON.stringify({ message: "Processed", eventId: event.id, type: event.type }));
}
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];
  for (const record of event.Records) {
    try { await processEvent(record.body); }
    catch (error) {
      console.error(JSON.stringify({ message: "Processing failed", messageId: record.messageId, error: String(error) }));
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}
