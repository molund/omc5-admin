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

const REFS = "https://github.com/molund/omc5.git/info/refs?service=git-upload-pack";
const RAW = "https://raw.githubusercontent.com/molund/omc5";
const API = "https://api.github.com/repos/molund/omc5";

/**
 * A fake GitHub: main at `sha`. git's branch list and raw.githubusercontent.com answer unless `noGit`; the API answers too.
 */
function fakeGitHub({ sha = "a".repeat(40), text = "span: 37\n", down = false, noGit = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, accept: init.headers?.Accept ?? null });
    if (down) throw new Error("Network request failed");
    const ok = (body) => ({ ok: true, status: 200, text: async () => body });
    const missing = { ok: false, status: 404, text: async () => "" };
    if (url === REFS)
      return noGit
        ? missing
        : ok(`001e# service=git-upload-pack\n0000003f${"b".repeat(40)} HEAD\n003d${sha} refs/heads/main\n`);
    if (url.startsWith(RAW) && !noGit) {
      if (url === `${RAW}/${sha}/status.yaml`) return ok(text);
      if (url === `${RAW}/${sha}/desk.yaml`) return ok("records: []\n");
    }
    if (url.startsWith(RAW)) return missing;
    if (url === `${API}/commits/main`) return ok(sha);
    if (url === `${API}/contents/status.yaml?ref=${sha}`) return ok(text);
    return missing;
  };
  return calls;
}

test("the phone has no Claude capabilities, and the desk's own config", async () => {
  assert.equal(await capability("artifact"), null);
  assert.match(config().repoUrl, /github\.com\/molund\/omc5$/);
});

test("status.yaml is read at main's commit, without the API, and copy.json names that commit", async () => {
  const sha = "c".repeat(40);
  const calls = fakeGitHub({ sha, text: "span: 38\n" });
  assert.equal(await ownFile("status.yaml"), "span: 38\n");
  const meta = JSON.parse(await ownFile("copy.json"));
  assert.equal(meta.commit, sha);
  assert.ok(!isNaN(new Date(meta.syncedAt)));
  assert.deepEqual(
    calls.map((c) => c.url),
    [REFS, `${RAW}/${sha}/status.yaml`, `${RAW}/${sha}/desk.yaml`],
  );
});

test("when git's list or the raw files can't be had, the API is used instead", async () => {
  const sha = "d".repeat(40);
  const calls = fakeGitHub({ sha, text: "span: 39\n", noGit: true });
  assert.equal(await ownFile("status.yaml"), "span: 39\n");
  assert.ok(calls.some((c) => c.url === `${API}/commits/main` && c.accept === "application/vnd.github.sha"));
  assert.ok(calls.some((c) => c.url === `${API}/contents/status.yaml?ref=${sha}`));
});

test("refreshing looks at main once, and reads the files again only when main moves", async () => {
  const one = "e".repeat(40),
    two = "f".repeat(40);
  fakeGitHub({ sha: one, text: "span: 41\n" });
  assert.equal(await ownFile("status.yaml"), "span: 41\n");
  const before = JSON.parse(await ownFile("copy.json")).syncedAt;
  await new Promise((r) => setTimeout(r, 5));
  // main hasn't moved: one look at git's list, no files read, and checked as of now
  let calls = fakeGitHub({ sha: one, text: "span: 41\n" });
  assert.equal(await ownFile("status.yaml"), "span: 41\n");
  assert.deepEqual(
    calls.map((c) => c.url),
    [REFS],
  );
  const meta = JSON.parse(await ownFile("copy.json"));
  assert.equal(meta.commit, one);
  assert.ok(new Date(meta.syncedAt) > new Date(before));
  // main moved: both files read at its new commit
  calls = fakeGitHub({ sha: two, text: "span: 42\n" });
  assert.equal(await ownFile("status.yaml"), "span: 42\n");
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(await ownFile("copy.json")).commit, two);
});

test("offline, the last copy read is used; a file the phone doesn't have is an error", async () => {
  const sha = "1".repeat(40);
  fakeGitHub({ sha, text: "span: 40\n" });
  assert.equal(await ownFile("status.yaml"), "span: 40\n");
  fakeGitHub({ down: true });
  assert.equal(await ownFile("status.yaml"), "span: 40\n", "kept copy");
  assert.equal(JSON.parse(await ownFile("copy.json")).commit, sha);
  await assert.rejects(() => ownFile("pushed.json"), /isn't on the phone/);
});
