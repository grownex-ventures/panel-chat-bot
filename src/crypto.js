import crypto from "crypto";
import { config } from "./config.js";

function getKey() {
  const hex = config.encryptionKey || process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function hashApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("API key must be a non-empty string");
  }
  return crypto.createHash("sha256").update(apiKey.trim()).digest("hex");
}

export function encryptApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("API key must be a non-empty string");
  }
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptApiKey(stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) {
    throw new Error("Invalid encrypted payload format");
  }
  const [ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Corrupted encrypted payload segments");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
