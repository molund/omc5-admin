// The phone's push (src/services/github.js), against a fake GitHub that keeps blobs, trees, commits and refs: one commit
// per change on top of main, by the Status Desk, with its photos, then the desk branch pointed at the last one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { applyChange } from "../src/lib/changes.js";
import { parseStatus } from "../src/lib/statusFile.js";
import { dateTitle } from "../src/lib/titles.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
// bundled, as the app is, so it can read desk.config.json
mkdirSync(here("./.out"), { recursive: true });
await build({
  entryPoints: [here("../src/services/github.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: here("./.out/github.mjs"),
  logLevel: "silent",
});
const { checkToken, landingStatus, parseExpiry, pushChanges, AUTHOR } = await import(here("./.out/github.mjs"));
const BASE = readFileSync(here("./fixtures/status.yaml"), "utf8");
const API = "https://api.github.com/repos/molund/omc5";
const T = "2026-11-05T08:30-07:00";
const PIXEL = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==";

/** A fake GitHub: main at a commit holding BASE; records every call. */
function fakeGitHub({ deskExists = false, status = 200, expiry = "2027-02-03 12:00:00 -0800", runs = [] } = {}) {
  const objects = new Map([["main1", { tree: "tree0", parents: [] }]]);
  const files = new Map([["tree0", { "status.yaml": BASE }]]);
  const refs = new Map([["main", "main1"], ...(deskExists ? [["desk", "old"]] : [])]);
  const blobs = new Map();
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const path = String(url).replace(API, "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path, body, auth: init.headers?.Authorization ?? null, accept: init.headers?.Accept });
    const reply = (code, json, text) => ({
      ok: code < 300,
      status: code,
      headers: { get: (h) => (h === "github-authentication-token-expiration" ? expiry : null) },
      json: async () => json,
      text: async () => text ?? JSON.stringify(json),
    });
    if (status !== 200) return reply(status, { message: "nope" });
    if (path.startsWith("/actions/runs")) return reply(200, { workflow_runs: runs });
    if (method === "GET" && path === "") return reply(200, { full_name: "molund/omc5" });
    if (method === "GET" && path === "/git/ref/heads/main") return reply(200, { object: { sha: refs.get("main") } });
    if (method === "GET" && path.startsWith("/git/commits/"))
      return reply(200, { tree: { sha: objects.get(path.split("/").pop()).tree } });
    if (method === "GET" && path.startsWith("/contents/status.yaml?ref=")) {
      const sha = path.split("=").pop();
      return reply(200, null, files.get(objects.get(sha).tree)["status.yaml"]);
    }
    if (method === "POST" && path === "/git/blobs") {
      const sha = `blob${++n}`;
      blobs.set(sha, body);
      return reply(201, { sha });
    }
    if (method === "POST" && path === "/git/trees") {
      const sha = `tree${++n}`;
      const out = { ...files.get(body.base_tree) };
      for (const e of body.tree) out[e.path] = e.content ?? blobs.get(e.sha);
      files.set(sha, out);
      return reply(201, { sha });
    }
    if (method === "POST" && path === "/git/commits") {
      const sha = `commit${++n}`;
      objects.set(sha, { tree: body.tree, parents: body.parents, message: body.message, author: body.author });
      return reply(201, { sha });
    }
    if (method === "PATCH" && path === "/git/refs/heads/desk") {
      if (!refs.has("desk")) return reply(422, { message: "Reference does not exist" });
      refs.set("desk", body.sha);
      return reply(200, {});
    }
    if (method === "POST" && path === "/git/refs") {
      refs.set(body.ref.replace("refs/heads/", ""), body.sha);
      return reply(201, {});
    }
    return reply(404, { message: `no ${method} ${path}` });
  };
  return { calls, objects, files, refs, blobs };
}

const move = { id: "c1", kind: "move", time: T, span: 38, complete: false, message: "Move to span 38" };
const update = {
  id: "c2",
  kind: "update",
  time: "2026-11-05T10:30-07:00",
  span: 38,
  complete: false,
  title: dateTitle("2026-11-05T10:30-07:00"),
  message: "Post an update with a photo",
  blocks: [
    { type: "summary", text: "On span 38." },
    { type: "photo", file: "2026-11-05-span-38.jpg", caption: "Span 38.", photoId: "p1" },
  ],
};
const photos = { p1: { dataUrl: `data:image/jpeg;base64,${PIXEL}` } };

test("each change is its own commit on top of main, by the Status Desk, and desk points at the last", async () => {
  const gh = fakeGitHub();
  const r = await pushChanges({ token: "github_pat_x", changes: [move, update], photos });
  assert.deepEqual(r.pushed, ["c1", "c2"]);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.base, "main1");
  assert.equal(gh.refs.get("desk"), r.head, "desk branch created at the last commit");
  assert.equal(gh.refs.get("main"), "main1", "main is left to the site's workflow");

  const last = gh.objects.get(r.head);
  const first = gh.objects.get(last.parents[0]);
  assert.deepEqual(first.parents, ["main1"]);
  assert.equal(first.message, "Move to span 38");
  assert.equal(last.message, "Post an update with a photo");
  for (const c of [first, last]) {
    assert.equal(c.author.name, AUTHOR.name);
    assert.equal(c.author.email, AUTHOR.email);
  }
  // the files are the desk's own result, change by change
  const once = applyChange(BASE, move).text;
  assert.equal(gh.files.get(first.tree)["status.yaml"], once);
  assert.equal(gh.files.get(last.tree)["status.yaml"], applyChange(once, update).text);
  // desk.yaml, started on a main without one: the move logs "arrived" at span 38 in the same commit
  assert.match(
    gh.files.get(first.tree)["desk.yaml"],
    /- 2026-11-05T08:30-07:00:\n {6}span: 38\n {6}stages: \[arrived\]/,
  );
  const photo = gh.files.get(last.tree)["public/images/sorry-im-a-shitty-photographer/2026-11-05-span-38.jpg"];
  assert.deepEqual(photo, { content: PIXEL, encoding: "base64" });
  assert.equal(
    gh.files.get(first.tree)["public/images/sorry-im-a-shitty-photographer/2026-11-05-span-38.jpg"],
    undefined,
  );

  // the token goes only to api.github.com, in the Authorization header
  for (const c of gh.calls) assert.equal(c.auth, "Bearer github_pat_x");
  assert.ok(gh.calls.every((c) => !JSON.stringify(c.body ?? "").includes("github_pat_x")));
  assert.equal(r.expiresAt, "2027-02-03T20:00:00.000Z");
});

test("an existing desk branch is moved (force), and a change that doesn't fit main is skipped", async () => {
  const gh = fakeGitHub({ deskExists: true });
  const taken = parseStatus(BASE).notes.find((x) => !/^\d{4}-\d\d-\d\d$/.test(x.key)).key;
  const clash = { ...update, id: "c3", time: taken, message: "Clashes" };
  const r = await pushChanges({ token: "github_pat_x", changes: [clash, move], photos });
  assert.deepEqual(r.pushed, ["c1"]);
  assert.equal(r.skipped[0].id, "c3");
  assert.match(r.skipped[0].why, /already has a note/);
  assert.equal(gh.refs.get("desk"), r.head);
  const patch = gh.calls.find((c) => c.method === "PATCH");
  assert.deepEqual(patch.body, { sha: r.head, force: true });
  assert.deepEqual(gh.objects.get(r.head).parents, ["main1"]);
});

test("nothing that fits, a missing photo, and GitHub's refusals stop the push with plain words", async () => {
  fakeGitHub();
  const taken = parseStatus(BASE).notes.find((x) => !/^\d{4}-\d\d-\d\d$/.test(x.key)).key;
  await assert.rejects(
    pushChanges({ token: "t", changes: [{ ...update, time: taken }], photos }),
    (e) => e.code === "nothing_fits",
  );
  await assert.rejects(pushChanges({ token: "t", changes: [update], photos: {} }), (e) => e.code === "photo_missing");
  fakeGitHub({ status: 401 });
  await assert.rejects(pushChanges({ token: "t", changes: [move], photos }), (e) => e.code === "token_rejected");
  fakeGitHub({ status: 403 });
  await assert.rejects(pushChanges({ token: "t", changes: [move], photos }), (e) => e.code === "no_write");
  globalThis.fetch = async () => {
    throw new Error("Network request failed");
  };
  await assert.rejects(pushChanges({ token: "t", changes: [move], photos }), (e) => e.code === "offline");
});

test("a pasted token is checked: fine-grained, can see the repo, and its expiry read", async () => {
  fakeGitHub({ expiry: "2027-02-03 12:00:00 UTC" });
  const info = await checkToken("  github_pat_11ABCDwxyz  ");
  assert.equal(info.last4, "wxyz");
  assert.equal(info.expiresAt, "2027-02-03T12:00:00.000Z");
  await assert.rejects(checkToken("ghp_classic"), (e) => e.code === "classic");
  await assert.rejects(checkToken("hello"), (e) => e.code === "not_a_token");
  await assert.rejects(checkToken(""), (e) => e.code === "empty");
  fakeGitHub({ status: 404 });
  await assert.rejects(checkToken("github_pat_x"), (e) => e.code === "no_repo");
  fakeGitHub({ status: 401 });
  await assert.rejects(checkToken("github_pat_x"), (e) => e.code === "token_rejected");
});

test("expiry headers, with UTC or an offset; none means it never expires", () => {
  assert.equal(parseExpiry("2027-02-03 12:00:00 UTC"), "2027-02-03T12:00:00.000Z");
  assert.equal(parseExpiry("2027-02-03 12:00:00 -0800"), "2027-02-03T20:00:00.000Z");
  assert.equal(parseExpiry(null), null);
  assert.equal(parseExpiry("soon"), null);
});

test("the landing is followed through the desk workflow's run, without the token", async () => {
  const run = (status, conclusion) => ({
    path: ".github/workflows/desk.yml",
    status,
    conclusion,
    html_url: "https://github.com/molund/omc5/actions/runs/1",
  });
  const other = { path: ".github/workflows/deploy.yml", status: "completed", conclusion: "success", html_url: "x" };
  let gh = fakeGitHub({ runs: [other] });
  assert.deepEqual(await landingStatus("abc"), { state: "waiting", url: null });
  assert.equal(gh.calls[0].auth, null);
  assert.match(gh.calls[0].path, /head_sha=abc/);
  fakeGitHub({ runs: [other, run("in_progress", null)] });
  assert.equal((await landingStatus("abc")).state, "running");
  fakeGitHub({ runs: [run("completed", "success")] });
  assert.equal((await landingStatus("abc")).state, "landed");
  fakeGitHub({ runs: [run("completed", "failure")] });
  assert.deepEqual(await landingStatus("abc"), {
    state: "failed",
    url: "https://github.com/molund/omc5/actions/runs/1",
  });
});
