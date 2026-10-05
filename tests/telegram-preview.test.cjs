const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-ts.cjs");

const { buildExtractPreviewMessage, buildLinkKeyboard } = load("lib/telegram/templates.ts", {
  "../extract": { LEDGER_TYPES: ["inventory", "revenue", "expense", "maintenance"] },
});

test("extraction preview shows inventory rows, escapes content, and stays within Telegram's limit", () => {
  const text = buildExtractPreviewMessage({
    summary: "📦 Inventory — 1 row",
    dateKey: "2026-10-05",
    mode: "inventory",
    lines: [{ category: "sand", particular: "<Sand Shwe>", in: "10", out: "2", balance: "8", unit: "sud" }],
    unreadableFields: [],
  });
  assert.match(text, /<b>sand<\/b>/);
  assert.match(text, /&lt;Sand Shwe&gt;/);
  assert.match(text, /Confirm sends this upload to the dashboard/);
  assert.ok(text.length <= 3500);
});

test("link keyboard exposes a one-tap /link command", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(buildLinkKeyboard())), {
    keyboard: [[{ text: "/link" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  });
});
