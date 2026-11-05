import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseEvent, verifySignature } from "../src/domain.js";
import { simulate } from "../src/simulation.js";

test("signatures authenticate exact request bytes", () => {
  const body = '{"id":"evt-1","type":"order.created"}';
  const signature = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifySignature(body, signature, "secret"), true);
  assert.equal(verifySignature(body + " ", signature, "secret"), false);
  assert.equal(verifySignature(body, "sha256=nope", "secret"), false);
  assert.equal(parseEvent(body).id, "evt-1");
  assert.throws(() => parseEvent('{"id":"","type":"x"}'));
});
test("a buffer absorbs a burst without amplifying attempts", () => {
  const naive = simulate("immediate"), buffered = simulate("buffered");
  assert.equal(naive.completed, 50); assert.equal(buffered.completed, 50);
  assert.equal(naive.attempts, 275); assert.equal(buffered.attempts, 50);
});
