import test from "node:test";
import assert from "node:assert/strict";

import { escapeHtml } from "../src/auth.js";

test("escapeHtml should sanitize HTML special characters to prevent Telegram parse errors", () => {
  assert.equal(escapeHtml("hello & world"), "hello &amp; world");
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml('user "quotes" & \'apostrophes\''), "user &quot;quotes&quot; &amp; &#039;apostrophes&#039;");
});

test("escapeHtml should handle null and undefined safely", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(0), "0");
});
