CREATE DATABASE IF NOT EXISTS provider_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE provider_bot;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  provider_username VARCHAR(100) NULL,
  api_key_hash CHAR(64) NULL,
  api_key_encrypted TEXT NULL,
  auth_state VARCHAR(30) NOT NULL DEFAULT 'awaiting_api_key',
  pending_api_key TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_key_hash (api_key_hash)
);

CREATE TABLE IF NOT EXISTS sessions (
  token CHAR(64) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  telegram_id BIGINT NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  INDEX idx_telegram_revoked (telegram_id, revoked),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (telegram_id, id)
);
