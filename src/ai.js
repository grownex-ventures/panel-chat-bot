import OpenAI from "openai";
import { config } from "./config.js";
import { query } from "./db.js";
import { SYSTEM_PROMPT, GUARDRAILS } from "./prompts/system.js";
import {
  formatTelegramMessage,
  formatServicesList,
  escapeHtml,
} from "./format.js";
import {
  getBalance,
  getServices,
  getOrderStatus,
  getMultipleOrdersStatus,
  placeOrder,
  requestRefill,
  getRefillStatus,
  cancelOrders,
} from "./provider.js";

const client = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseURL,
  timeout: 25000,
});

const lastMsgAt = new Map();

function cleanOldCooldowns() {
  const now = Date.now();
  for (const [id, time] of lastMsgAt.entries()) {
    if (now - time > 60000) {
      lastMsgAt.delete(id);
    }
  }
}

export function guardCheck(telegramId, text) {
  if (text.length > GUARDRAILS.maxLength) {
    return { allowed: false, reply: `✂️ Message too long (max ${GUARDRAILS.maxLength} chars). Please keep it short.` };
  }
  const now = Date.now();
  const last = lastMsgAt.get(telegramId) || 0;
  if (now - last < GUARDRAILS.cooldownMs) {
    return { allowed: false, reply: "⏳ Please wait a couple of seconds before your next message." };
  }
  lastMsgAt.set(telegramId, now);

  if (lastMsgAt.size > 500) {
    cleanOldCooldowns();
  }

  for (const pattern of GUARDRAILS.blockedPatterns) {
    if (pattern.test(text)) {
      return { allowed: false, reply: GUARDRAILS.blockedReply };
    }
  }
  return { allowed: true };
}

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "check_balance",
      description: "Get the current balance and currency for the user's SMM panel account",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_services",
      description: "Search available SMM panel services by platform/category keyword (e.g. instagram followers, youtube views, telegram members). Supports sorting by cheapest or expensive.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search query keyword" },
          query: { type: "string", description: "Alternative search query parameter" },
          sort: {
            type: "string",
            enum: ["cheapest", "expensive"],
            description: "Sort order: 'cheapest' for lowest price per 1000, 'expensive' for highest price per 1000. Defaults to 'cheapest'.",
          },
          limit: {
            type: "number",
            description: "Number of services to return (default 5, max 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_service_details",
      description: "Get complete details, pricing rate, min, max, refill status for a specific service ID",
      parameters: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "The numeric service ID" },
        },
        required: ["service_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "List all categories of services available on the panel (e.g. Instagram Followers, YouTube Views, Telegram Members)",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "place_order",
      description: "Place a new order on the SMM panel using the user's balance",
      parameters: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "Numeric service ID to order" },
          link: { type: "string", description: "Target link (e.g. profile URL, post link, video URL)" },
          quantity: { type: "number", description: "Amount / number of items to order" },
          runs: { type: "number", description: "Optional drip-feed runs count" },
          interval: { type: "number", description: "Optional drip-feed interval in minutes" },
        },
        required: ["service_id", "link", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_order_status",
      description: "Check the status, charge, and remaining count of an order using its order ID",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "The numeric order ID to check" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_multiple_orders_status",
      description: "Check the status of multiple order IDs at once",
      parameters: {
        type: "object",
        properties: {
          order_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of numeric order IDs to check",
          },
        },
        required: ["order_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_refill",
      description: "Request a refill for an order that experienced a drop",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "The order ID to refill" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_refill_status",
      description: "Check the status of a previously submitted refill request",
      parameters: {
        type: "object",
        properties: {
          refill_id: { type: "string", description: "The refill ID returned from request_refill" },
        },
        required: ["refill_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_orders",
      description: "Cancel one or more pending/in-progress orders by order ID",
      parameters: {
        type: "object",
        properties: {
          order_ids: {
            type: "array",
            items: { type: "string" },
            description: "List of order IDs to cancel",
          },
        },
        required: ["order_ids"],
      },
    },
  },
];

function formatToolResultDirectly(name, result) {
  if (result.error) {
    return `❌ ${result.error}`;
  }

  if (name === "check_balance") {
    return (
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>Account Balance:</b> <b>₹${result.balance}</b> ${result.currency || "INR"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Use /services to explore available SMM packages.</i>`
    );
  }

  if (name === "search_services") {
    if (!result.services || result.services.length === 0) {
      return "⚠️ No matching services found. Try another search keyword.";
    }
    return formatServicesList(
      result.services,
      `Found ${result.total_matches} services (${result.sort || "Top Matches"})`
    );
  }

  if (name === "check_order_status") {
    return (
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>Order Status: #${result.order || ""}</b>\n` +
      `• <b>Status:</b> ${result.status || "Unknown"}\n` +
      `• <b>Charge:</b> ₹${result.charge || "0"}\n` +
      `• <b>Start Count:</b> ${result.start_count || "0"}\n` +
      `• <b>Remains:</b> ${result.remains || "0"}\n` +
      `━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  if (name === "place_order") {
    return result.order
      ? `━━━━━━━━━━━━━━━━━━━━━\n🎉 <b>Order Placed Successfully!</b>\n🆔 <b>Order ID:</b> <code>${result.order}</code>\n━━━━━━━━━━━━━━━━━━━━━\n<i>Track anytime: /status ${result.order}</i>`
      : `❌ Failed to place order: ${JSON.stringify(result)}`;
  }

  if (name === "request_refill") {
    return result.refill
      ? `━━━━━━━━━━━━━━━━━━━━━\n🔄 <b>Refill Requested!</b>\n🆔 <b>Refill ID:</b> <code>${result.refill}</code>\n━━━━━━━━━━━━━━━━━━━━━`
      : `❌ Refill error: ${result.error || JSON.stringify(result)}`;
  }

  return JSON.stringify(result, null, 2);
}

async function executeTool(name, args, apiKey) {
  if (!apiKey) {
    return { error: "User is not authenticated with an API key." };
  }

  try {
    switch (name) {
      case "check_balance": {
        return await getBalance(apiKey);
      }
      case "search_services": {
        const allServices = await getServices(apiKey);
        if (!Array.isArray(allServices)) return allServices;

        const rawQuery = (args.keyword || args.query || args.search || "").toLowerCase().trim();
        const tokens = rawQuery.split(/\s+/).filter((t) => t.length > 1);

        const wantsExpensive =
          args.sort === "expensive" ||
          args.sort === "costly" ||
          args.sort_by === "expensive" ||
          args.sort_by === "costly" ||
          args.order === "desc" ||
          /\b(costly|expensive|highest|priciest|premium)\b/i.test(rawQuery);

        // Filter out non-category filter tokens so they don't break keyword matching
        const searchTokens = tokens.filter(
          (t) =>
            ![
              "costly",
              "expensive",
              "highest",
              "priciest",
              "cheapest",
              "lowest",
              "cheap",
              "top",
              "services",
              "service",
              "suggest",
            ].includes(t)
        );

        let matches = [];
        if (searchTokens.length > 0) {
          // Attempt 1: All tokens match
          matches = allServices.filter((s) => {
            const text = `${s.name || ""} ${s.category || ""}`.toLowerCase();
            return searchTokens.every((token) => text.includes(token));
          });

          // Attempt 2: If none match all, match any token
          if (matches.length === 0) {
            matches = allServices.filter((s) => {
              const text = `${s.name || ""} ${s.category || ""}`.toLowerCase();
              return searchTokens.some((token) => text.includes(token));
            });
          }
        } else {
          matches = allServices;
        }

        // Sort by user preference
        if (wantsExpensive) {
          matches.sort((a, b) => (parseFloat(b.rate) || 0) - (parseFloat(a.rate) || 0));
        } else {
          matches.sort((a, b) => (parseFloat(a.rate) || 0) - (parseFloat(b.rate) || 0));
        }

        const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
        const topMatches = matches.slice(0, limit).map((s) => ({
          service: s.service,
          name: s.name,
          category: s.category,
          rate: s.rate,
          min: s.min,
          max: s.max,
        }));
        return {
          total_matches: matches.length,
          sort: wantsExpensive ? "most expensive first" : "cheapest first",
          services: topMatches,
        };
      }
      case "get_service_details": {
        const allServices = await getServices(apiKey);
        if (!Array.isArray(allServices)) return allServices;
        const target = allServices.find((s) => String(s.service) === String(args.service_id).trim());
        if (!target) return { error: `Service ID ${args.service_id} not found.` };
        return target;
      }
      case "list_categories": {
        const allServices = await getServices(apiKey);
        if (!Array.isArray(allServices)) return allServices;
        const categories = [...new Set(allServices.map((s) => s.category).filter(Boolean))];
        return { total_categories: categories.length, categories: categories.slice(0, 15) };
      }
      case "place_order": {
        const res = await placeOrder(apiKey, {
          service: String(args.service_id).trim(),
          link: String(args.link).trim(),
          quantity: Number(args.quantity),
          runs: args.runs ? Number(args.runs) : undefined,
          interval: args.interval ? Number(args.interval) : undefined,
        });
        return res;
      }
      case "check_order_status": {
        return await getOrderStatus(apiKey, String(args.order_id).trim());
      }
      case "check_multiple_orders_status": {
        const ids = Array.isArray(args.order_ids) ? args.order_ids.join(",") : String(args.order_ids);
        return await getMultipleOrdersStatus(apiKey, ids);
      }
      case "request_refill": {
        return await requestRefill(apiKey, String(args.order_id).trim());
      }
      case "check_refill_status": {
        return await getRefillStatus(apiKey, String(args.refill_id).trim());
      }
      case "cancel_orders": {
        const ids = Array.isArray(args.order_ids) ? args.order_ids.join(",") : String(args.order_ids);
        return await cancelOrders(apiKey, ids);
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || "Failed to execute tool" };
  }
}

export async function getAIReply(telegramId, userText, apiKey = null) {
  try {
    const memoryLimit = Number(config.memorySize) || 12;
    const rows = await query(
      "SELECT role, content FROM messages WHERE telegram_id = ? ORDER BY id DESC LIMIT ?",
      [telegramId, memoryLimit]
    );
    const history = rows.reverse().map((r) => ({ role: r.role, content: r.content }));

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userText },
    ];

    const response = await client.chat.completions.create({
      model: config.llm.model,
      messages,
      temperature: 0.3,
      max_tokens: 1000,
      tools: apiKey ? TOOLS : undefined,
    });

    const choice = response.choices[0];
    let reply = choice?.message?.content?.trim();

    // Check if the LLM called a tool natively or returned JSON tool call in content
    let toolCall = null;
    let fnName = null;
    let fnArgs = {};

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCall = choice.message.tool_calls[0];
      fnName = toolCall.function.name;
      try {
        fnArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {}
    } else if (reply && reply.startsWith("{") && reply.endsWith("}")) {
      // Check for inline JSON tool call emitted in content
      try {
        const parsed = JSON.parse(reply);
        if (parsed.tool || parsed.action || parsed.query || parsed.service_id) {
          fnName = parsed.tool || parsed.action;
          if (!fnName && (parsed.query || parsed.keyword)) fnName = "search_services";
          fnArgs = parsed.arguments || parsed;
          toolCall = {
            id: "call_inline_" + Date.now(),
            function: { name: fnName, arguments: JSON.stringify(fnArgs) },
          };
        }
      } catch {}
    }

    if (toolCall && fnName && apiKey) {
      const toolResult = await executeTool(fnName, fnArgs, apiKey);

      try {
        // Send the tool result back to the model for final synthesis with higher token budget
        const followUp = await client.chat.completions.create({
          model: config.llm.model,
          messages: [
            ...messages,
            {
              role: "assistant",
              content: choice.message.content || "",
              tool_calls: [toolCall],
            },
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            },
          ],
          temperature: 0.3,
          max_tokens: 1200,
        });

        const followUpReply = followUp.choices[0]?.message?.content?.trim();
        if (followUpReply) {
          reply = followUpReply;
        } else {
          // Fallback gracefully to direct structured formatter if reasoning truncated
          reply = formatToolResultDirectly(fnName, toolResult);
        }
      } catch (followUpErr) {
        console.warn("Follow-up synthesis failed, using direct tool formatter:", followUpErr.message);
        reply = formatToolResultDirectly(fnName, toolResult);
      }
    }

    if (!reply) throw new Error("Empty AI response");

    // Format into aligned Telegram HTML cards and strip broken tables
    reply = formatTelegramMessage(reply);

    await query(
      "INSERT INTO messages (telegram_id, role, content) VALUES (?, 'user', ?), (?, 'assistant', ?)",
      [telegramId, userText, telegramId, reply]
    );
    return reply;
  } catch (err) {
    console.error("AI error:", err.message);
    return "⚠️ I'm having trouble right now. Please try again in a moment, or use /balance for instant info.";
  }
}
