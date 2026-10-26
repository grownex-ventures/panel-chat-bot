import { Bot } from "grammy";
import { config } from "./config.js";
import {
  findUser,
  getActiveSession,
  handleAuth,
  handleLogout,
  handleBalance,
  escapeHtml,
} from "./auth.js";
import { replySafe, formatServicesList } from "./format.js";
import { guardCheck, getAIReply } from "./ai.js";
import { query, pool } from "./db.js";
import { decryptApiKey } from "./crypto.js";
import {
  getServices,
  getOrderStatus,
  placeOrder,
  requestRefill,
  cancelOrders,
} from "./provider.js";

const bot = new Bot(config.botToken);

bot.command("start", async (ctx) => {
  const user = await findUser(ctx.from.id);
  if (user && user.auth_state === "done") {
    return ctx.reply(
      `👋 Welcome back, <b>${escapeHtml(user.provider_username)}</b>! You're already logged in.\n\n` +
      `/balance — Check wallet balance\n` +
      `/services — Search services & pricing\n` +
      `/order — Place a new order\n` +
      `/status — Check order status\n` +
      `/refill — Request refill\n` +
      `/help — View all commands & features\n` +
      `/logout — End session`,
      { parse_mode: "HTML" }
    );
  }
  return handleAuth(ctx, user, "");
});

bot.command("logout", handleLogout);

bot.command("help", async (ctx) => {
  return ctx.reply(
    "💡 <b>Indian Provider Bot Help & Commands:</b>\n\n" +
    "<b>⚡ Quick Commands:</b>\n" +
    "• /balance — Check account balance\n" +
    "• /services <i>&lt;keyword&gt;</i> — Search services & rates\n" +
    "• /order <i>&lt;service_id&gt; &lt;quantity&gt; &lt;link&gt;</i> — Place order\n" +
    "• /status <i>&lt;order_id&gt;</i> — Check order status\n" +
    "• /refill <i>&lt;order_id&gt;</i> — Request refill\n" +
    "• /cancel <i>&lt;order_id&gt;</i> — Cancel order\n" +
    "• /logout — Log out of panel\n\n" +
    "💬 <b>Or Just Chat Naturally With Me!</b>\n" +
    "You can ask me anything in plain English, for example:\n" +
    "<i>- 'What is my balance?'</i>\n" +
    "<i>- 'Find cheap Instagram follower services'</i>\n" +
    "<i>- 'Place order for service 105, quantity 1000, link https://...'</i>\n" +
    "<i>- 'Check status of order 54321'</i>\n" +
    "<i>- 'Refill my order 54321'</i>",
    { parse_mode: "HTML" }
  );
});

bot.command("balance", async (ctx) => {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return ctx.reply("🔒 Please log in first. Send /start to begin.");
  return handleBalance(ctx, session);
});

bot.command("services", async (ctx) => {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return ctx.reply("🔒 Please log in first. Send /start to begin.");

  const kw = (ctx.match || "").trim().toLowerCase();
  await ctx.replyWithChatAction("typing");
  try {
    const apiKey = decryptApiKey(session.api_key_encrypted);
    const all = await getServices(apiKey);
    if (!Array.isArray(all)) return ctx.reply("❌ Could not fetch services from provider.");

    const filtered = kw
      ? all
          .filter(
            (s) =>
              (s.name && s.name.toLowerCase().includes(kw)) ||
              (s.category && s.category.toLowerCase().includes(kw))
          )
          .slice(0, 8)
      : all.slice(0, 8);

    if (filtered.length === 0) {
      return ctx.reply(
        `⚠️ No services found matching "<b>${escapeHtml(kw)}</b>". Try another search term.`,
        { parse_mode: "HTML" }
      );
    }

    const headerTitle = kw ? `Services matching "${kw}"` : "Featured Services";
    const msg = formatServicesList(filtered, headerTitle);
    return replySafe(ctx, msg);
  } catch (err) {
    return ctx.reply(`❌ Error: ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

bot.command("order", async (ctx) => {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return ctx.reply("🔒 Please log in first. Send /start to begin.");

  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
    return ctx.reply(
      "📌 <b>How to place an order:</b>\n\n" +
      "<code>/order &lt;service_id&gt; &lt;quantity&gt; &lt;link&gt;</code>\n\n" +
      "<i>Example:</i>\n<code>/order 105 1000 https://instagram.com/p/example</code>",
      { parse_mode: "HTML" }
    );
  }

  const [serviceId, quantity, ...linkParts] = parts;
  const link = linkParts.join(" ");

  await ctx.replyWithChatAction("typing");
  try {
    const apiKey = decryptApiKey(session.api_key_encrypted);
    const res = await placeOrder(apiKey, {
      service: serviceId,
      quantity: Number(quantity),
      link,
    });

    if (res.error) {
      return ctx.reply(`❌ <b>Order failed:</b> ${escapeHtml(res.error)}`, { parse_mode: "HTML" });
    }

    return ctx.reply(
      `🎉 <b>Order Placed Successfully!</b>\n\n` +
      `🆔 <b>Order ID:</b> <code>${res.order}</code>\n` +
      `📦 <b>Service ID:</b> ${escapeHtml(serviceId)}\n` +
      `🔢 <b>Quantity:</b> ${escapeHtml(quantity)}\n` +
      `🔗 <b>Link:</b> ${escapeHtml(link)}\n\n` +
      `<i>Check status anytime: /status ${res.order}</i>`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    return ctx.reply(`❌ Error: ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

bot.command("status", async (ctx) => {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return ctx.reply("🔒 Please log in first. Send /start to begin.");

  const orderId = (ctx.match || "").trim();
  if (!orderId) {
    return ctx.reply("📌 <b>Usage:</b> <code>/status &lt;order_id&gt;</code>\nExample: <code>/status 123456</code>", { parse_mode: "HTML" });
  }

  await ctx.replyWithChatAction("typing");
  try {
    const apiKey = decryptApiKey(session.api_key_encrypted);
    const res = await getOrderStatus(apiKey, orderId);

    if (res.error) {
      return ctx.reply(`❌ <b>Status error:</b> ${escapeHtml(res.error)}`, { parse_mode: "HTML" });
    }

    return ctx.reply(
      `📊 <b>Order Status: #${escapeHtml(orderId)}</b>\n\n` +
      `• <b>Status:</b> ${escapeHtml(res.status || "Unknown")}\n` +
      `• <b>Charge:</b> ${escapeHtml(res.charge || "0")} ${escapeHtml(res.currency || "")}\n` +
      `• <b>Start Count:</b> ${escapeHtml(res.start_count || "0")}\n` +
      `• <b>Remains:</b> ${escapeHtml(res.remains || "0")}`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    return ctx.reply(`❌ Error: ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

bot.command("refill", async (ctx) => {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return ctx.reply("🔒 Please log in first. Send /start to begin.");

  const orderId = (ctx.match || "").trim();
  if (!orderId) {
    return ctx.reply("📌 <b>Usage:</b> <code>/refill &lt;order_id&gt;</code>\nExample: <code>/refill 123456</code>", { parse_mode: "HTML" });
  }

  await ctx.replyWithChatAction("typing");
  try {
    const apiKey = decryptApiKey(session.api_key_encrypted);
    const res = await requestRefill(apiKey, orderId);

    if (res.error) {
      return ctx.reply(`❌ <b>Refill error:</b> ${escapeHtml(res.error)}`, { parse_mode: "HTML" });
    }

    return ctx.reply(
      `🔄 <b>Refill Requested:</b>\n\n` +
      `• <b>Refill ID:</b> <code>${res.refill}</code>\n` +
      `• <b>Order ID:</b> #${escapeHtml(orderId)}`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    return ctx.reply(`❌ Error: ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

bot.command("cancel", async (ctx) => {
  const session = await getActiveSession(ctx.from.id);
  if (!session) return ctx.reply("🔒 Please log in first. Send /start to begin.");

  const orderId = (ctx.match || "").trim();
  if (!orderId) {
    return ctx.reply("📌 <b>Usage:</b> <code>/cancel &lt;order_id&gt;</code>\nExample: <code>/cancel 123456</code>", { parse_mode: "HTML" });
  }

  await ctx.replyWithChatAction("typing");
  try {
    const apiKey = decryptApiKey(session.api_key_encrypted);
    const res = await cancelOrders(apiKey, orderId);

    return ctx.reply(
      `🚫 <b>Cancellation Response:</b>\n<pre>${escapeHtml(JSON.stringify(res, null, 2))}</pre>`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    return ctx.reply(`❌ Error: ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

bot.on("msg:text", async (ctx) => {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();

  const user = await findUser(telegramId);
  if (!user || user.auth_state !== "done") {
    return handleAuth(ctx, user, text);
  }

  const session = await getActiveSession(telegramId);
  if (!session) {
    await query(
      "UPDATE users SET auth_state = 'awaiting_api_key', pending_api_key = NULL WHERE telegram_id = ?",
      [telegramId]
    );
    return handleAuth(ctx, { auth_state: "awaiting_api_key" }, "");
  }

  const guard = guardCheck(telegramId, text);
  if (!guard.allowed) return ctx.reply(guard.reply);

  await ctx.replyWithChatAction("typing");

  let apiKey = null;
  try {
    apiKey = decryptApiKey(session.api_key_encrypted);
  } catch (err) {
    console.error("Failed to decrypt user API key for AI request:", err.message);
  }

  const reply = await getAIReply(telegramId, text, apiKey);
  return replySafe(ctx, reply);
});

bot.on("message", (ctx) => ctx.reply("📝 Please send a text message."));

bot.catch((err) => {
  console.error("Bot error:", err.message);
});

// Graceful shutdown handling
let isShuttingDown = false;
async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);

  try {
    bot.stop();
    console.log("Telegram bot polling stopped.");
    await pool.end();
    console.log("MySQL connection pool closed.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err.message);
    process.exit(1);
  }
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

bot.start();
console.log("🤖 Indian Provider Bot is running...");
