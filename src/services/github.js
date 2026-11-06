// Pushing from the phone, straight to GitHub with Mike's fine-grained token (Contents: read and write on molund/omc5 only).
// Each waiting change is applied, in order, to status.yaml as it is on main now (the same code as the desk:
// lib/changes.js), and made into its own commit with its photos, by "Mike Olund (Status Desk)". The desk branch is then
// pointed at the last one. The site's "Land Status Desk changes" workflow (.github/workflows/desk.yml in molund/omc5)
// checks the commits only change status.yaml and add photos, builds the site, moves main up to them and deploys.
// Plain JS: the token is passed in (platform/secrets reads it, after Face ID), and only ever sent to api.github.com.
import deskConfig from "../../desk.config.json";
import { Conflict, photosOf } from "../lib/changes.js";
import { applyBoth } from "../lib/deskChanges.js";
import { EMPTY_DESK } from "../lib/deskFile.js";

const [, OWNER, REPO] = deskConfig.repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
export const REPO_NAME = `${OWNER}/${REPO}`;
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
export const BRANCH = "desk";
export const AUTHOR = { name: "Mike Olund (Status Desk)", email: "mike@oxd.com" };
const PHOTOS = "public/images/sorry-im-a-shitty-photographer";
const WORKFLOW = ".github/workflows/desk.yml";
export const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

export class GitHubError extends Error {
  /**
   * @param {string} code
   * @param {string} message What to do, in plain words.
   * @param {string} [detail] GitHub's own words.
   */
  constructor(code, message, detail = "") {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/**
 * When the token expires, from GitHub's github-authentication-token-expiration header ("2027-02-03 12:00:00 UTC" or
 * "2027-02-03 12:00:00 -0800"), as an ISO string; null when it never expires or there's no header.
 */
export function parseExpiry(header) {
  const m = header?.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) (UTC|[+-]\d{4})$/);
  if (!m) return null;
  const zone = m[3] === "UTC" ? "Z" : `${m[3].slice(0, 3)}:${m[3].slice(3)}`;
  const date = new Date(`${m[1]}T${m[2]}${zone}`);
  return isNaN(date) ? null : date.toISOString();
}

/** One GitHub API call with the token: its JSON, or its text when `raw`. Remembers the token's expiry in `seen`. */
async function call(token, seen, method, path, body, raw = false) {
  let res;
  try {
    res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
  } catch (e) {
    throw new GitHubError("offline", "GitHub couldn't be reached. Check the connection and try again.", e.message);
  }
  const expiry = res.headers?.get?.("github-authentication-token-expiration");
  if (expiry) seen.expiresAt = parseExpiry(expiry);
  if (res.ok) return raw ? res.text() : res.status === 204 ? null : res.json();
  const detail = `${method} ${path}: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300);
  if (res.status === 401)
    throw new GitHubError(
      "token_rejected",
      "GitHub didn't accept the token: it has expired or been revoked. Make a new one and paste it in Settings.",
      detail,
    );
  if (res.status === 403 || (res.status === 404 && method !== "GET"))
    throw new GitHubError(
      "no_write",
      `The token can't write to ${REPO_NAME}. It needs Contents: read and write on that repository.`,
      detail,
    );
  const error = new GitHubError(
    "github",
    `GitHub refused a step of the push (${res.status}). Nothing landed on main.`,
    detail,
  );
  error.status = res.status;
  throw error;
}

/**
 * Checks a pasted token: a fine-grained one that can read the repo. (GitHub doesn't tell an app a fine-grained token's
 * permissions, so write access only shows on the first push.)
 * @returns {Promise<{ last4: string, expiresAt: string|null, checkedAt: string }>}
 */
export async function checkToken(raw) {
  const token = raw.trim();
  if (!token) throw new GitHubError("empty", "Paste the token first.");
  if (/^(ghp|gho|ghu|ghs)_/.test(token))
    throw new GitHubError(
      "classic",
      `That's a classic token, which reaches every repository you have. Make a fine-grained one for ${REPO_NAME} only.`,
    );
  if (!token.startsWith("github_pat_"))
    throw new GitHubError("not_a_token", "That doesn't look like a GitHub token (they start with github_pat_).");
  const seen = {};
  try {
    await call(token, seen, "GET", "");
  } catch (e) {
    if (e.status === 404)
      throw new GitHubError(
        "no_repo",
        `The token can't see ${REPO_NAME}. Give it access to that repository.`,
        e.detail,
      );
    throw e;
  }
  return { last4: token.slice(-4), expiresAt: seen.expiresAt ?? null, checkedAt: new Date().toISOString() };
}

/**
 * Commits the changes on top of main and points the desk branch at the last commit.
 * @param {{ token: string, changes: object[], photos: object }} args The waiting changes, in order, and the desk's photos.
 * @returns {Promise<{ head: string, base: string, pushed: string[], skipped: { id: string, why: string }[], expiresAt: string|null }>}
 */
export async function pushChanges({ token, changes, photos }) {
  const seen = {};
  const api = (method, path, body, raw) => call(token, seen, method, path, body, raw);

  const base = (await api("GET", "/git/ref/heads/main")).object.sha;
  let parent = base;
  let tree = (await api("GET", `/git/commits/${base}`)).tree.sha;
  let text = await api("GET", `/contents/status.yaml?ref=${base}`, undefined, true);
  // the desk's own records; a main without the file yet starts an empty one
  let desk = await api("GET", `/contents/desk.yaml?ref=${base}`, undefined, true).catch((e) => {
    if (e.status === 404) return EMPTY_DESK;
    throw e;
  });

  const pushed = [],
    skipped = [];
  for (const change of changes) {
    let next;
    try {
      next = applyBoth({ status: text, desk }, change);
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      skipped.push({ id: change.id, why: e.message });
      continue;
    }
    const entries = [{ path: "status.yaml", mode: "100644", type: "blob", content: next.status }];
    if (next.desk !== desk) entries.push({ path: "desk.yaml", mode: "100644", type: "blob", content: next.desk });
    for (const b of photosOf(change)) {
      if (!b.photoId) continue; // already on the site
      const photo = photos[b.photoId];
      if (!photo)
        throw new GitHubError(
          "photo_missing",
          `The photo for ${b.file} isn't on this phone any more. Remove it and add it again.`,
        );
      const blob = await api("POST", "/git/blobs", { content: photo.dataUrl.split(",")[1], encoding: "base64" });
      entries.push({ path: `${PHOTOS}/${b.file}`, mode: "100644", type: "blob", sha: blob.sha });
    }
    tree = (await api("POST", "/git/trees", { base_tree: tree, tree: entries })).sha;
    parent = (
      await api("POST", "/git/commits", {
        message: change.message,
        tree,
        parents: [parent],
        author: { ...AUTHOR, date: new Date().toISOString() },
      })
    ).sha;
    text = next.status;
    desk = next.desk;
    pushed.push(change.id);
  }
  if (!pushed.length)
    throw new GitHubError("nothing_fits", "None of the waiting changes fit main as it is now. Nothing was pushed.");

  try {
    await api("PATCH", `/git/refs/heads/${BRANCH}`, { sha: parent, force: true });
  } catch (e) {
    if (e.status !== 422) throw e; // 422: the branch doesn't exist yet
    await api("POST", "/git/refs", { ref: `refs/heads/${BRANCH}`, sha: parent });
  }
  return { head: parent, base, pushed, skipped, expiresAt: seen.expiresAt ?? null };
}

/**
 * How the landing of a push is going, from the site's workflow runs (public, so no token and no Face ID).
 * @returns {Promise<{ state: "waiting"|"running"|"landed"|"failed", url: string|null }>}
 */
export async function landingStatus(head) {
  let res;
  try {
    res = await fetch(`${API}/actions/runs?head_sha=${head}&branch=${BRANCH}&per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
  } catch (e) {
    throw new GitHubError("offline", "GitHub couldn't be reached to check on the push.", e.message);
  }
  if (!res.ok) throw new GitHubError("github", `GitHub didn't say how the push is going (${res.status}).`);
  const run = (await res.json()).workflow_runs?.find((r) => r.path === WORKFLOW);
  if (!run) return { state: "waiting", url: null };
  if (run.status !== "completed") return { state: "running", url: run.html_url };
  return { state: run.conclusion === "success" ? "landed" : "failed", url: run.html_url };
}
