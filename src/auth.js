import { query } from "./db.js";
import { hashApiKey, encryptApiKey, decryptApiKey, generateSessionToken } from "./crypto.js";
import { verifyApiKey, providerApi } from "./provider.js";

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function findUser(telegramId) {
  const rows = await query("SELECT * FROM users WHERE telegram_id = ?", [telegramId]);
  return rows[0] || null;
}

export async function getActiveSession(telegramId) {
  const rows = await query(
    `SELECT s.*, u.provider_username, u.api_key_encrypted
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.telegram_id = ? AND s.revoked = 0
     ORDER BY s.created_at DESC LIMIT 1`,
    [telegramId]
  );
  return rows[0] || null;
}

export async function handleAuth(ctx, user, text) {
  const telegramId = ctx.from.id;

  try {
    if (!user) {
      await query(
        `INSERT INTO users (telegram_id, auth_state)
         VALUES (?, 'awaiting_api_key')
         ON DUPLICATE KEY UPDATE auth_state = IF(auth_state = 'done', 'done', 'awaiting_api_key')`,
        [telegramId]
      );
      return ctx.reply(
        "👋 Welcome to <b>Indian Provider Bot</b>!\n\n" +
        "To get started, please send your <b>Indian Provider API Token</b>.\n\n" +
        "<i>(You can find it in your panel under API section)</i>",
        { parse_mode: "HTML" }
      );
    }

    if (user.auth_state === "awaiting_api_key") {
      const apiKeyCandidate = text.trim();
      const check = await verifyApiKey(apiKeyCandidate);
      if (!check.ok) {
        return ctx.reply(
          `❌ <b>Invalid API key</b> (${escapeHtml(check.error)}).\nPlease check and send it again.`,
          { parse_mode: "HTML" }
        );
      }

      // Store pending key encrypted to prevent plaintext leakage in DB
      const encryptedPendingKey = encryptApiKey(apiKeyCandidate);
      await query(
        "UPDATE users SET pending_api_key = ?, auth_state = 'awaiting_username' WHERE telegram_id = ?",
        [encryptedPendingKey, telegramId]
      );
      return ctx.reply(
        `✅ Key verified! Balance: <b>${escapeHtml(check.balance)} ${escapeHtml(check.currency)}</b>\n\nNow please send your <b>username</b> on Indian Provider panel:`,
        { parse_mode: "HTML" }
      );
    }

    if (user.auth_state === "awaiting_username") {
      const username = text.trim().replace(/^@/, "");
      if (username.length < 3) {
        return ctx.reply("⚠️ Username looks too short. Please send your real panel username:");
      }

      if (!user.pending_api_key) {
        await query("UPDATE users SET auth_state = 'awaiting_api_key' WHERE telegram_id = ?", [telegramId]);
        return ctx.reply("⚠️ Registration timed out or was reset. Please send your API key again:");
      }

      const apiKey = decryptApiKey(user.pending_api_key);
      const keyHash = hashApiKey(apiKey);

      // Invalidate conflicting sessions and release unique key hash from older accounts
      const conflictUsers = await query(
        "SELECT id, telegram_id FROM users WHERE api_key_hash = ? AND telegram_id != ?",
        [keyHash, telegramId]
      );
      for (const cu of conflictUsers) {
        await query(
          "UPDATE sessions SET revoked = 1, revoked_at = NOW() WHERE user_id = ? AND revoked = 0",
          [cu.id]
        );
        await query(
          "UPDATE users SET api_key_hash = NULL, api_key_encrypted = NULL, auth_state = 'awaiting_api_key' WHERE id = ?",
          [cu.id]
        );
        await ctx.api.sendMessage(
          cu.telegram_id,
          "🔒 <b>Security alert:</b> Your API key was used to log in from another Telegram account.\nYour session has been <b>revoked completely</b>. If this wasn't you, regenerate your API key immediately.",
          { parse_mode: "HTML" }
        ).catch(() => {});
      }

      // Revoke any previous active session for this telegram ID
      await query("UPDATE sessions SET revoked = 1, revoked_at = NOW() WHERE telegram_id = ? AND revoked = 0", [telegramId]);

      // Update current user
      await query(
        `UPDATE users SET
           provider_username = ?,
           api_key_hash = ?,
           api_key_encrypted = ?,
           auth_state = 'done',
           pending_api_key = NULL
         WHERE telegram_id = ?`,
        [username, keyHash, encryptApiKey(apiKey), telegramId]
      );

      const freshUser = await findUser(telegramId);
      await query(
        "INSERT INTO sessions (token, user_id, telegram_id) VALUES (?, ?, ?)",
        [generateSessionToken(), freshUser.id, telegramId]
      );

      return ctx.reply(
        `🎉 <b>Login successful!</b> Welcome, <b>${escapeHtml(username)}</b>.\n\n` +
        `You can now chat with me, or use commands:\n` +
        `/balance — check your balance\n/logout — end your session`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("Auth error:", err.message);
    return ctx.reply("⚠️ Something went wrong. Please try again or use /start.");
  }
}

export async function handleLogout(ctx) {
  await query("UPDATE sessions SET revoked = 1, revoked_at = NOW() WHERE telegram_id = ? AND revoked = 0", [ctx.from.id]);
  return ctx.reply("👋 Logged out. Send /start to log in again.");
}

export async function handleBalance(ctx, session) {
  try {
    const apiKey = decryptApiKey(session.api_key_encrypted);
    const data = await providerApi(apiKey, "balance");
    if (data.error) return ctx.reply(`❌ Provider error: ${escapeHtml(data.error)}`);
    return ctx.reply(
      `💰 Your balance: <b>${escapeHtml(data.balance)} ${escapeHtml(data.currency || "INR")}</b>`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("Balance error:", err.message);
    return ctx.reply("⚠️ Could not reach provider. Try again later.");
  }
}
