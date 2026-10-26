import test from "node:test";
import assert from "node:assert/strict";

// Set a mock 64-char hex key for tests
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
  hashApiKey,
  encryptApiKey,
  decryptApiKey,
  generateSessionToken,
} from "../src/crypto.js";

test("hashApiKey should generate deterministic sha256 hash", () => {
  const key = "test_provider_api_key_12345";
  const hash1 = hashApiKey(key);
  const hash2 = hashApiKey(key);

  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);
  assert.equal(hashApiKey("  " + key + "  "), hash1); // handles trimming
});

test("encryptApiKey and decryptApiKey should correctly roundtrip", () => {
  const secretKey = "api_secret_token_abc_xyz_987";
  const encrypted = encryptApiKey(secretKey);

  assert.ok(encrypted.includes(":"));
  const parts = encrypted.split(":");
  assert.equal(parts.length, 3);

  const decrypted = decryptApiKey(encrypted);
  assert.equal(decrypted, secretKey);
});

test("decryptApiKey should fail on tampered ciphertext or bad auth tag", () => {
  const secretKey = "valid_secret_key";
  const encrypted = encryptApiKey(secretKey);
  const parts = encrypted.split(":");

  // Tamper with data part
  const tamperedData = parts[0] + ":" + parts[1] + ":" + "ff" + parts[2].slice(2);
  assert.throws(() => decryptApiKey(tamperedData));

  // Invalid format
  assert.throws(() => decryptApiKey("not-a-valid-encrypted-string"));
});

test("generateSessionToken should generate a 64-character hex token", () => {
  const token = generateSessionToken();
  assert.equal(typeof token, "string");
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
});
