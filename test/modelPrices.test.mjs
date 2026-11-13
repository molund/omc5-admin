// The models' prices from OpenRouter (src/services/modelPrices.js), kept on the phone like the weather and fetched again
// only once they're a day old. Bundled for Node with a stand-in for the phone's storage, against a fake OpenRouter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here("./.out"), { recursive: true });
await build({
  entryPoints: [here("../src/services/modelPrices.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: here("./.out/modelPrices.mjs"),
  resolveExtensions: [".native.js", ".js", ".json"],
  alias: { "expo-sqlite/kv-store": here("./stubs/kv-store-stub.js") },
  logLevel: "silent",
});
const { cachedPrices, refreshPrices } = await import(here("./.out/modelPrices.mjs"));

const HOUR = 60 * 60 * 1000;
let calls = 0;
let haikuOut = "0.0000005";
globalThis.fetch = async (url) => {
  calls++;
  assert.equal(String(url), "https://openrouter.ai/api/v1/models");
  return {
    ok: true,
    json: async () => ({
      data: [{ id: "anthropic/claude-haiku-5.5", pricing: { prompt: "0.0000001", completion: haikuOut } }],
    }),
  };
};

test("the prices are fetched and kept, then not fetched again until they're a day old", async () => {
  assert.deepEqual(cachedPrices(), {});
  const t0 = Date.UTC(2026, 10, 12, 18);
  const first = await refreshPrices(t0);
  assert.equal(first["anthropic/claude-haiku-5.5"], "$0.10 / $0.50");
  assert.equal(cachedPrices()["anthropic/claude-haiku-5.5"], "$0.10 / $0.50");
  assert.equal(calls, 1);

  haikuOut = "0.0000006";
  assert.equal(await refreshPrices(t0 + 23 * HOUR), null);
  assert.equal(calls, 1);

  const next = await refreshPrices(t0 + 24 * HOUR);
  assert.equal(next["anthropic/claude-haiku-5.5"], "$0.10 / $0.60");
  assert.equal(calls, 2);
});

test("a failed fetch keeps the prices it had", async () => {
  const before = cachedPrices();
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  assert.equal(await refreshPrices(Date.UTC(2026, 10, 20)), null);
  assert.deepEqual(cachedPrices(), before);
});
