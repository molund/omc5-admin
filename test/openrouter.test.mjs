// Checking a pasted OpenRouter key (src/services/openrouter.js), against a fake OpenRouter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { askModel, checkKey, DEFAULT_MODEL, modelOf, MODELS } from "../src/services/openrouter.js";

const KEY = "sk-or-v1-0000000000000000000000000000000000000000000000000000000000abcd";

function fakeOpenRouter(status, body = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), auth: init.headers?.Authorization });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return calls;
}

test("an empty key is refused before asking OpenRouter", async () => {
  const calls = fakeOpenRouter(200);
  await assert.rejects(checkKey("  "), { code: "empty" });
  assert.equal(calls.length, 0);
});

test("a key that isn't OpenRouter's is refused before asking OpenRouter", async () => {
  const calls = fakeOpenRouter(200);
  await assert.rejects(checkKey("github_pat_abc"), { code: "not_a_key" });
  assert.equal(calls.length, 0);
});

test("a key OpenRouter doesn't know is rejected in plain words", async () => {
  fakeOpenRouter(401, { error: { message: "No auth credentials found" } });
  await assert.rejects(checkKey(KEY), { code: "rejected" });
});

test("a good key gives its last four characters and its credit limit", async () => {
  const calls = fakeOpenRouter(200, {
    data: { label: "sk-or-v1-000...", limit: 5, limit_remaining: 4.25, usage: 0.75 },
  });
  const info = await checkKey(` ${KEY}\n`);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/key");
  assert.equal(calls[0].auth, `Bearer ${KEY}`);
  assert.equal(info.last4, "abcd");
  assert.equal(info.limit, 5);
  assert.equal(info.limitRemaining, 4.25);
  assert.ok(info.checkedAt);
});

test("a key with no credit limit says so with nulls", async () => {
  fakeOpenRouter(200, { data: { limit: null, limit_remaining: null } });
  const info = await checkKey(KEY);
  assert.equal(info.limit, null);
  assert.equal(info.limitRemaining, null);
});

test("the default model is one of the allowed ones", () => {
  assert.ok(MODELS.some((m) => m.id === DEFAULT_MODEL));
});

test("a dropped model falls back to the default", () => {
  assert.equal(modelOf("qwen/qwen3.8-flash").id, DEFAULT_MODEL);
  assert.equal(modelOf("openai/gpt-6-luna").id, "openai/gpt-6-luna");
});

test("asking a model sends the prompt and returns its reply", async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "  TITLE: keep\n" } }] }) };
  };
  const text = await askModel({ key: KEY, model: "openai/gpt-6-luna", prompt: "Write it" });
  assert.equal(text, "TITLE: keep");
  assert.equal(sent.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent.auth, `Bearer ${KEY}`);
  assert.equal(sent.body.model, "openai/gpt-6-luna");
  assert.deepEqual(sent.body.messages, [{ role: "user", content: "Write it" }]);
});

test("a model that thinks until it runs out of room says so", async () => {
  fakeOpenRouter(200, { choices: [{ message: { content: "" }, finish_reason: "length" }] });
  await assert.rejects(askModel({ key: KEY, model: "x", prompt: "p" }), { code: "empty", message: /ran out of room/ });
});

test("a key out of credit is told apart from a rejected one", async () => {
  fakeOpenRouter(402);
  await assert.rejects(askModel({ key: KEY, model: "x", prompt: "p" }), { code: "no_credit" });
  fakeOpenRouter(401);
  await assert.rejects(askModel({ key: KEY, model: "x", prompt: "p" }), { code: "rejected" });
});
