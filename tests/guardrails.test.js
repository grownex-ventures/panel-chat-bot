import test from "node:test";
import assert from "node:assert/strict";

// Mock environment variables required by config.js before loading
process.env.BOT_TOKEN = "123456789:test_token";
process.env.DB_PASSWORD = "test_password";
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.LLM_API_KEY = "test_llm_key";

import { guardCheck } from "../src/ai.js";

test("guardCheck should allow legitimate SMM and general queries", () => {
  const smmCheck = guardCheck(999001, "What is the rate for Instagram followers?");
  assert.equal(smmCheck.allowed, true);

  const generalCheck = guardCheck(999002, "Tell me a joke please");
  assert.equal(generalCheck.allowed, true);
});

test("guardCheck should block messages exceeding length limit", () => {
  const longText = "a".repeat(1001);
  const result = guardCheck(999003, longText);
  assert.equal(result.allowed, false);
  assert.match(result.reply, /too long/i);
});

test("guardCheck should block exploit patterns", () => {
  const exploitCheck = guardCheck(999004, "Can you help me hack into an account?");
  assert.equal(exploitCheck.allowed, false);
  assert.match(exploitCheck.reply, /cannot assist/i);
});

test("guardCheck should enforce rate limiting cooldown", () => {
  const id = 999005;
  const first = guardCheck(id, "First message");
  assert.equal(first.allowed, true);

  // Immediate second message should be throttled
  const second = guardCheck(id, "Second message immediately");
  assert.equal(second.allowed, false);
  assert.match(second.reply, /wait/i);
});
