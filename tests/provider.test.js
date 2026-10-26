import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyApiKey,
  getOrderStatus,
  cancelOrders,
  requestRefill,
} from "../src/provider.js";

test("verifyApiKey should return error on invalid API key", async () => {
  const result = await verifyApiKey("invalid_dummy_key");
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("getOrderStatus should return response or error for invalid credentials", async () => {
  try {
    const res = await getOrderStatus("dummy_key", "999999");
    assert.ok(res && typeof res === "object");
  } catch (err) {
    assert.ok(err.message.includes("Provider HTTP") || err.message.includes("timed out"));
  }
});

test("cancelOrders should handle response or error for invalid credentials", async () => {
  try {
    const res = await cancelOrders("dummy_key", ["12345"]);
    assert.ok(res && typeof res === "object");
  } catch (err) {
    assert.ok(err.message.includes("Provider HTTP") || err.message.includes("timed out"));
  }
});

test("requestRefill should handle response or error for invalid credentials", async () => {
  try {
    const res = await requestRefill("dummy_key", "12345");
    assert.ok(res && typeof res === "object");
  } catch (err) {
    assert.ok(err.message.includes("Provider HTTP") || err.message.includes("timed out"));
  }
});
