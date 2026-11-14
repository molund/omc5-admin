// The writing prompt sends the rest of the post, with a marker where the text being written goes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HERE, postContext, postLines, writingPrompt } from "../src/lib/writingPrompt.js";

const blocks = [
  { type: "summary", text: "The gantry moved." },
  { type: "photo", caption: "" },
  { type: "text", text: "  " },
  { type: "text", text: "It rained." },
  { type: "photo", caption: "Span 50" },
];

test("the context marks the block being written and leaves out empty ones", () => {
  assert.equal(
    postContext({ title: "A day", blocks, at: 3 }),
    "Title: A day\n\nThe gantry moved.\n\n▶ HERE\n\n[Photo: Span 50]",
  );
});

test("an addendum's context has its update above it", () => {
  const above = ["Title: Earlier", ...postLines("", [{ type: "summary", text: "First." }])];
  assert.equal(
    postContext({ blocks: [{ type: "summary", text: "" }], at: 0, above, heading: "This addendum:" }),
    "Title: Earlier\n\nFirst.\n\nThis addendum:\n\n▶ HERE",
  );
});

test("the prompt has the context only when there's more than the text itself", () => {
  assert.ok(!writingPrompt("a paragraph", "Hi").includes("rest of the post"));
  const alone = { blocks: [{ type: "summary", text: "Hi" }], at: 0 };
  assert.ok(!writingPrompt("a paragraph", "Hi", alone).includes("rest of the post"));
  const p = writingPrompt("a paragraph", "Hi", { blocks, at: 3 });
  assert.ok(p.includes(`marked ${HERE}):\n\nThe gantry moved.`));
  assert.ok(p.indexOf("rest of the post") < p.indexOf("Return it twice"));
});

test("the kept prompt asks for the paragraph alone, with no bold added and links only to my own addresses, not twice with a code block", () => {
  const copied = writingPrompt("a paragraph", "Hi");
  const kept = writingPrompt("a paragraph", "Hi", undefined, true);
  assert.ok(copied.includes("Return it twice"));
  assert.ok(!kept.includes("Return it twice") && !kept.includes("code block"));
  assert.ok(kept.includes("Reply with the edited paragraph only:"));
  assert.ok(kept.includes("Keep my bold as it is, but don't add any. Only link to web addresses that are in my text"));
  assert.ok(
    copied.includes("Keep my bold as it is, but don't add any. Only link to web addresses that are in my text"),
  );
  assert.ok(kept.endsWith("Here's my text:\n\nHi"));
});
