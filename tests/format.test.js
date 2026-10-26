import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  convertMarkdownTableToCards,
  formatTelegramMessage,
  formatServicesList,
} from "../src/format.js";

test("escapeHtml should sanitize HTML characters", () => {
  assert.equal(escapeHtml("<b>test & <link></b>"), "&lt;b&gt;test &amp; &lt;link&gt;&lt;/b&gt;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("convertMarkdownTableToCards should turn pipe table into card blocks", () => {
  const table = [
    "| Rank | Service ID | Name | Rate (per 1,000) | Min | Max | Category / Notes |",
    "|---|---|---|---|---|---|---|",
    "| **1** | **4365** | Instagram Followers | **₹161.82** | 10 | 10000 | Fast |",
    "| **2** | **4518** | Bot Followers | **₹155.99** | 10 | 50000 | Instant |",
  ];

  const result = convertMarkdownTableToCards(table);
  assert.ok(result.includes("🥇 <b>#1 • Service ID:</b> <code>4365</code>"));
  assert.ok(result.includes("💰 <b>Rate:</b> <b>₹161.82</b> / 1k"));
  assert.ok(result.includes("🥈 <b>#2 • Service ID:</b> <code>4518</code>"));
  assert.ok(result.includes("🛒 <i>Quick Order:</i> <code>/order 4365 1000 &lt;link&gt;</code>"));
});

test("formatTelegramMessage should convert markdown syntax and tables", () => {
  const input = `Here are the **Top 2 services**:

| Rank | Service ID | Name | Rate (per 1,000) | Min | Max |
|---|---|---|---|---|---|
| 1 | 101 | Likes | ₹10 | 10 | 1000 |

Order with \`/order 101 1000 <link>\`!`;

  const output = formatTelegramMessage(input);

  // Markdown bold should be converted to HTML <b>
  assert.ok(output.includes("<b>Top 2 services</b>"));
  // Raw <link> should be safely escaped to &lt;link&gt;
  assert.ok(output.includes("&lt;link&gt;"));
  // Table converted to card
  assert.ok(output.includes("🥇 <b>#1 • Service ID:</b> <code>101</code>"));
  // Backtick code converted to <code>
  assert.ok(output.includes("<code>/order 101 1000 &lt;link&gt;</code>"));
});

test("formatServicesList should format array of services into cards", () => {
  const services = [
    { service: "105", name: "Instagram Likes", rate: "12.50", min: "10", max: "50000", category: "Likes" },
  ];

  const output = formatServicesList(services, "Search Results");
  assert.ok(output.includes("📋 <b>Search Results:</b>"));
  assert.ok(output.includes("🥇 <b>#1 • Service ID:</b> <code>105</code>"));
  assert.ok(output.includes("💰 <b>Rate:</b> <b>₹12.50</b> / 1k"));
  assert.ok(output.includes("📂 <b>Category:</b> Likes"));
});
