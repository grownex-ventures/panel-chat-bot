export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Converts a raw Markdown table (e.g. | Rank | Service ID | ... |)
 * into clean, professional, aligned Telegram card blocks.
 */
export function convertMarkdownTableToCards(tableLines) {
  if (!tableLines || tableLines.length < 2) return tableLines ? tableLines.join("\n") : "";

  const parseCells = (line) =>
    line
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, "|").trim());

  const rawHeaders = parseCells(tableLines[0]);
  const headers = rawHeaders.map((h) => h.replace(/\*\*/g, "").toLowerCase());

  // Filter out table divider rows (|---|---|...)
  const dataRows = tableLines.slice(1).filter((l) => !/^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(l));

  const badges = ["🥇", "🥈", "🥉", "🔹", "🔹", "🔹", "🔹", "🔹", "🔹", "🔹"];
  const cards = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = parseCells(dataRows[i]);
    if (cells.length === 0 || cells.every((c) => !c)) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (cells[idx] || "").replace(/\*\*/g, "").trim();
    });

    let rank = String(i + 1);
    let serviceId = "";
    let name = "";
    let rate = "";
    let min = "";
    let max = "";
    let notes = "";
    const extraFields = [];

    for (const [rawKey, val] of Object.entries(rowObj)) {
      if (!val) continue;
      const key = rawKey.toLowerCase();
      if (key === "rank" || key === "#" || key === "no" || key === "no.") {
        rank = val;
      } else if (key.includes("service id") || key === "id" || key === "service_id" || key === "service") {
        serviceId = val;
      } else if (key.includes("name") || key.includes("title")) {
        name = val;
      } else if (key.includes("rate") || key.includes("price") || key.includes("cost")) {
        rate = val;
      } else if (key.includes("min")) {
        min = val;
      } else if (key.includes("max")) {
        max = val;
      } else if (
        key.includes("note") ||
        key.includes("detail") ||
        key.includes("category") ||
        key.includes("desc") ||
        key.includes("feature")
      ) {
        notes = val;
      } else {
        extraFields.push({ label: rawKey, value: val });
      }
    }

    const badge = badges[i] || "🔹";

    let card = `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (serviceId) {
      card += `${badge} <b>#${escapeHtml(rank)} • Service ID:</b> <code>${escapeHtml(serviceId)}</code>\n`;
    } else {
      card += `${badge} <b>#${escapeHtml(rank)}</b>\n`;
    }

    if (name) {
      card += `📌 <b>Name:</b> ${escapeHtml(name)}\n`;
    }
    if (rate) {
      const rateLabel = rate.startsWith("₹") || rate.startsWith("$") ? rate : `₹${rate}`;
      card += `💰 <b>Rate:</b> <b>${escapeHtml(rateLabel)}</b> / 1k\n`;
    }
    if (min || max) {
      card += `📊 <b>Min / Max:</b> ${escapeHtml(min || "1")} — ${escapeHtml(max || "Unlimited")}\n`;
    }
    if (notes) {
      card += `⚡ <b>Details:</b> ${escapeHtml(notes)}\n`;
    }
    for (const ef of extraFields) {
      card += `• <b>${escapeHtml(ef.label)}:</b> ${escapeHtml(ef.value)}\n`;
    }
    if (serviceId) {
      card += `🛒 <i>Quick Order:</i> <code>/order ${escapeHtml(serviceId)} 1000 &lt;link&gt;</code>\n`;
    }

    cards.push(card.trimEnd());
  }

  if (cards.length === 0) return tableLines.join("\n");

  return cards.join("\n\n") + "\n━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Tap any Service ID or command above to copy it directly!</i>";
}

/**
 * Transforms Markdown formatting to safe Telegram HTML, converts tables into cards,
 * and escapes unsafe HTML tags to prevent Telegram entity parse errors.
 */
export function formatTelegramMessage(text) {
  if (!text) return "";

  // 1. Detect and convert Markdown pipe tables
  const lines = text.split("\n");
  const processedLines = [];
  let currentTable = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableLine = line.startsWith("|") && line.split("|").length >= 3;

    if (isTableLine) {
      currentTable.push(line);
    } else {
      if (currentTable.length > 0) {
        processedLines.push(convertMarkdownTableToCards(currentTable));
        currentTable = [];
      }
      processedLines.push(lines[i]);
    }
  }

  if (currentTable.length > 0) {
    processedLines.push(convertMarkdownTableToCards(currentTable));
  }

  let formatted = processedLines.join("\n");

  // 2. Protect existing valid Telegram HTML tags
  const allowedTagRegex = /<\/?(b|i|code|pre|a(\s+href="[^"]*")?|s|u)>/gi;
  const tagPlaceholders = [];
  formatted = formatted.replace(allowedTagRegex, (match) => {
    const id = `\uE000TAG${tagPlaceholders.length}\uE000`;
    tagPlaceholders.push({ id, tag: match });
    return id;
  });

  // Escape any raw < and > to prevent Telegram 400 Bad Request
  formatted = formatted.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Convert Markdown **bold** or __bold__ to <b>...</b>
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  formatted = formatted.replace(/__(.+?)__/g, "<b>$1</b>");

  // Convert Markdown `code` to <code>...</code>
  formatted = formatted.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Convert Markdown *italic* or _italic_ to <i>...</i>
  formatted = formatted.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "<i>$1</i>");
  formatted = formatted.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>");

  // Restore allowed Telegram tags
  tagPlaceholders.forEach(({ id, tag }) => {
    formatted = formatted.replaceAll(id, tag);
  });

  // Clean unescaped markdown backslashes (e.g. \|, \_, \*)
  formatted = formatted.replace(/\\([|*_`])/g, "$1");

  return formatted;
}

/**
 * Formats an array of service objects into clean, aligned card blocks.
 */
export function formatServicesList(services, header = "Featured Services") {
  if (!services || services.length === 0) {
    return "⚠️ No matching services found. Try another search keyword.";
  }

  const badges = ["🥇", "🥈", "🥉", "🔹", "🔹", "🔹", "🔹", "🔹", "🔹", "🔹"];
  let out = `📋 <b>${escapeHtml(header)}:</b>\n\n`;

  services.forEach((s, i) => {
    const badge = badges[i] || "🔹";
    out += `━━━━━━━━━━━━━━━━━━━━━\n`;
    out += `${badge} <b>#${i + 1} • Service ID:</b> <code>${escapeHtml(s.service)}</code>\n`;
    out += `📌 <b>Name:</b> ${escapeHtml(s.name)}\n`;
    out += `💰 <b>Rate:</b> <b>₹${escapeHtml(s.rate)}</b> / 1k\n`;
    out += `📊 <b>Min / Max:</b> ${escapeHtml(s.min)} — ${escapeHtml(s.max)}\n`;
    if (s.category) {
      out += `📂 <b>Category:</b> ${escapeHtml(s.category)}\n`;
    }
    out += `🛒 <i>Quick Order:</i> <code>/order ${escapeHtml(s.service)} 1000 &lt;link&gt;</code>\n\n`;
  });

  out += `━━━━━━━━━━━━━━━━━━━━━\n💡 <i>Tap any Service ID or command above to copy it directly!</i>`;
  return out;
}

/**
 * Safe Telegram reply sender with HTML parse mode and plain text fallback.
 */
export async function replySafe(ctx, text) {
  if (!text) return;
  const formatted = formatTelegramMessage(text);
  try {
    return await ctx.reply(formatted, { parse_mode: "HTML" });
  } catch (err) {
    if (err.message && (err.message.includes("can't parse entities") || err.message.includes("Bad Request"))) {
      console.warn("Telegram HTML parse failed, falling back to plain text:", err.message);
      const plain = formatted.replace(/<[^>]+>/g, "");
      return await ctx.reply(plain);
    }
    throw err;
  }
}
