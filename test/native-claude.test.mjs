// The phone's version of the desk's files (src/platform/claude.native.js): status.yaml read from main on GitHub at the
// commit main is on, kept for when the phone is offline. Bundled for Node with the phone's platform files and a stand-in
// for its storage, and run against a fake GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here("./.out"), { recursive: true });
await build({
  entryPoints: [here("../src/platform/claude.native.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: here("./.out/claude-native.mjs"),
  resolveExtensions: [".native.js", ".js", ".json"],
  alias: { "expo-sqlite/kv-store": here("./stubs/kv-store-stub.js") },
  logLevel: "silent",
});
const { ownFile, capability, config } = await import(here("./.out/claude-native.mjs"));

function fakeGitHub({ sha = "abc1234def", text = "span: 37\n", down = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), accept: init.headers.Accept });
    if (down) throw new Error("Network request failed");
    const body = String(url).endsWith("/commits/main") ? sha : String(url).includes(`ref=${sha}`) ? text : null;
    return body == null
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => body };
  };
  return calls;
}

test("the phone has no Claude capabilities, and the desk's own config", async () => {
  assert.equal(await capability("artifact"), null);
  assert.match(config().repoUrl, /github\.com\/molund\/omc5$/);
});

test("status.yaml is read at main's commit, and copy.json names that commit", async () => {
  const calls = fakeGitHub({ sha: "abc1234def", text: "span: 38\n" });
  assert.equal(await ownFile("status.yaml"), "span: 38\n");
  const meta = JSON.parse(await ownFile("copy.json"));
  assert.equal(meta.commit, "abc1234def");
  assert.ok(!isNaN(new Date(meta.syncedAt)));
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      "https://api.github.com/repos/molund/omc5/commits/main",
      "https://api.github.com/repos/molund/omc5/contents/status.yaml?ref=abc1234def",
    ],
  );
  assert.equal(calls[0].accept, "application/vnd.github.sha");
  assert.equal(calls[1].accept, "application/vnd.github.raw+json");
});

test("offline, the last copy read is used; a file the phone doesn't have is an error", async () => {
  fakeGitHub({ sha: "1111111", text: "span: 40\n" });
  assert.equal(await ownFile("status.yaml"), "span: 40\n");
  fakeGitHub({ down: true });
  assert.equal(await ownFile("status.yaml"), "span: 40\n", "kept copy");
  assert.equal(JSON.parse(await ownFile("copy.json")).commit, "1111111");
  await assert.rejects(() => ownFile("pushed.json"), /isn't on the phone/);
});
