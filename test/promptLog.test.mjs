// The kept sparkle prompts (src/lib/promptLog.js): bundled with the web's storage over a stand-in localStorage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here("./.out"), { recursive: true });
await build({
  entryPoints: [here("../src/lib/promptLog.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: here("./.out/promptLog.mjs"),
  resolveExtensions: [".web.js", ".js"],
  logLevel: "silent",
});
const data = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  },
};
const { logPrompt, notePrompt, promptLog, clearPromptLog, promptFiles, stampOf } = await import(
  here("./.out/promptLog.mjs")
);

const entry = (text, context) => ({
  prompt: `Tidy this up: ${text}`,
  version: "abc1234",
  field: "Paragraph 2",
  writes: "a blog secondary paragraph",
  text,
  context,
});
const at = (s) => new Date(`2026-11-12T${s}-07:00`);

test("stamps are BC time to the second", () => {
  assert.equal(stampOf(at("08:15:32")), "2026-11-12T08:15:32-07:00");
});

test("each copied prompt is kept, a repeat isn't, and Clear empties it", () => {
  clearPromptLog();
  logPrompt(entry("One"), at("08:15:32"));
  logPrompt(entry("One"), at("08:15:40"));
  logPrompt(entry("Two"), at("08:16:00"));
  assert.deepEqual(
    promptLog().map((e) => [e.at, e.text]),
    [
      ["2026-11-12T08:15:32-07:00", "One"],
      ["2026-11-12T08:16:00-07:00", "Two"],
    ],
  );
  clearPromptLog();
  assert.deepEqual(promptLog(), []);
  assert.equal(data.size, 0);
});

test("the files: the prompt as .txt, its inputs as readable .json, the same second numbered", () => {
  clearPromptLog();
  const context = {
    title: "Span 50",
    blocks: [
      { type: "summary", text: "Hi" },
      { type: "photo", caption: "Pad" },
    ],
    at: 0,
  };
  logPrompt(entry("One", context), at("08:15:32"));
  logPrompt(entry("Two"), new Date(at("08:15:32").getTime() + 500));
  const files = promptFiles(promptLog());
  assert.deepEqual(Object.keys(files), [
    "2026-11-12 08.15.32.txt",
    "2026-11-12 08.15.32.json",
    "2026-11-12 08.15.32 (2).txt",
    "2026-11-12 08.15.32 (2).json",
  ]);
  assert.equal(files["2026-11-12 08.15.32.txt"], "Tidy this up: One");
  assert.equal(
    files["2026-11-12 08.15.32.json"],
    `{
  "at": "2026-11-12T08:15:32-07:00",
  "version": "abc1234",
  "field": "Paragraph 2",
  "writes": "a blog secondary paragraph",
  "text": "One",
  "context": {
    "title": "Span 50",
    "blocks": [
      { "type": "summary", "text": "Hi" },
      { "type": "photo", "caption": "Pad" }
    ],
    "at": 0
  }
}
`,
  );
  assert.ok(!files["2026-11-12 08.15.32 (2).json"].includes("context"));
  // zipped as Settings does, and back
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  assert.equal(strFromU8(unzipSync(zip)["2026-11-12 08.15.32.json"]), files["2026-11-12 08.15.32.json"]);
});

test("a prompt sent to a model is kept every time, with the model, its reply and the cost in its .json", () => {
  clearPromptLog();
  const a = logPrompt({ ...entry("One"), model: "anthropic/claude-haiku-5.5" }, at("09:00:00"));
  const b = logPrompt({ ...entry("One"), model: "openai/gpt-6-luna" }, at("09:00:10"));
  notePrompt(a, { reply: "One, tidied.", cost: 0.00026 });
  notePrompt(b, { error: "The model sent back nothing.", cost: 0.0001 });
  const log = promptLog();
  assert.deepEqual(
    log.map((e) => [e.model, e.reply, e.error, e.cost]),
    [
      ["anthropic/claude-haiku-5.5", "One, tidied.", undefined, 0.00026],
      ["openai/gpt-6-luna", undefined, "The model sent back nothing.", 0.0001],
    ],
  );
  const json = JSON.parse(promptFiles(log)["2026-11-12 09.00.00.json"]);
  assert.equal(json.model, "anthropic/claude-haiku-5.5");
  assert.equal(json.reply, "One, tidied.");
  assert.equal(json.cost, 0.00026);
  // copying the same prompt again adds nothing, and is still skipped
  assert.equal(logPrompt(entry("One"), at("09:01:00")), null);
  assert.ok(logPrompt(entry("Two"), at("09:01:05")));
  assert.equal(logPrompt(entry("Two"), at("09:01:10")), null);
  clearPromptLog();
});
