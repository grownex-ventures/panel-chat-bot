import "dotenv/config";

const isTest =
  process.env.NODE_ENV === "test" ||
  process.argv.some((arg) => arg.includes("test"));

if (isTest) {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || "123456789:test_token";
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || "";
  process.env.LLM_API_KEY = process.env.LLM_API_KEY || "test_llm_key";
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }
} else {
  // DB_PASSWORD is allowed to be empty string for local MySQL/MariaDB installations
  const required = ["BOT_TOKEN", "ENCRYPTION_KEY", "LLM_API_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Missing env var: ${key} — check your .env file`);
      process.exit(1);
    }
  }

  if (process.env.DB_PASSWORD === undefined) {
    process.env.DB_PASSWORD = "";
  }

  if (process.env.ENCRYPTION_KEY.length !== 64) {
    console.error("❌ ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
    process.exit(1);
  }
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  providerBaseUrl: process.env.PROVIDER_BASE_URL || "https://indianprovider.com/api/v2",
  db: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "provider_bot",
  },
  llm: {
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  },
  encryptionKey: process.env.ENCRYPTION_KEY,
  memorySize: 12,
  cooldownMs: 3000,
};
