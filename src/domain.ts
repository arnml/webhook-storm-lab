import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the exact bytes received, before parsing or accepting the request. */
export function verifySignature(body: string, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(supplied, "hex"));
}

export interface WebhookEvent { id: string; type: string; }
export function parseEvent(body: string): WebhookEvent {
  const event: unknown = JSON.parse(body);
  if (!event || typeof event !== "object" || !("id" in event) || !("type" in event) ||
      typeof event.id !== "string" || !event.id.trim() || typeof event.type !== "string" || !event.type.trim()) {
    throw new Error("Expected non-empty string id and type");
  }
  return event as WebhookEvent;
}
