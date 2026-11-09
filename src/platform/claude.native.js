// What claude.web.js gives the Leash Log in the Claude app, for the phone. There's no Claude app around the Leash Log here: no
// capabilities (so no saving into an outbox), and the Leash Log's copy of status.yaml is read straight from main on GitHub, and
// looked at again every minute (state/desk.js). The repo is public, so no token is needed. The last copy read is kept, so
// the Leash Log still opens when the phone is offline.
import deskConfig from "../../desk.config.json";
import { load, save } from "./storage";

const [, OWNER, REPO] = deskConfig.repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

/** No Claude capabilities on the phone. */
export const capability = () => Promise.resolve(null);

export const config = () => deskConfig;

async function get(url, accept) {
  const res = await fetch(url, { headers: { Accept: accept, "X-GitHub-Api-Version": "2022-11-28" } });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  return res.text();
}

// the copy last read, so status.yaml and copy.json (read one after the other) describe the same commit
let latest = null;

// The Leash Log looks at main every minute, so the look avoids GitHub's API, which allows only 60 requests an hour without a
// token (counting even an "unchanged" answer): main's commit comes from git's own list of the repo's branches (a few
// hundred bytes), and a file at a commit from raw.githubusercontent.com. Either falls back to the API if it fails.

/** The commit main is on now. */
async function mainCommit() {
  try {
    const res = await fetch(`https://github.com/${OWNER}/${REPO}.git/info/refs?service=git-upload-pack`);
    const sha = res.ok && (await res.text()).match(/([0-9a-f]{40}) refs\/heads\/main\b/)?.[1];
    if (sha) return sha;
  } catch {
    // the API below
  }
  return (await get(`${API}/commits/main`, "application/vnd.github.sha")).trim();
}

/** A file as it is at a commit. */
async function fileAt(sha, path) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${path}`);
    if (res.ok) return res.text();
  } catch {
    // the API below
  }
  return get(`${API}/contents/${path}?ref=${sha}`, "application/vnd.github.raw+json");
}

/**
 * main's status.yaml and gantry-cycles.yaml, at the commit main is on now (so a file a cache is behind on can't be mixed with a
 * newer commit's name), read again only when main has moved. When GitHub can't be reached, the last copy kept on the
 * phone. A main without gantry-cycles.yaml has none.
 */
async function readMain() {
  try {
    const sha = await mainCommit();
    // main hasn't moved: the same copy, as of now
    const same = latest?.meta.commit === sha ? latest : load("copy", null)?.meta?.commit === sha ? load("copy") : null;
    if (same) {
      const copy = { ...same, meta: { ...same.meta, syncedAt: new Date().toISOString() } };
      save("copy", copy);
      return copy;
    }
    const text = await fileAt(sha, "status.yaml");
    const desk = await fileAt(sha, "gantry-cycles.yaml").catch(() => null);
    const copy = { text, desk, meta: { commit: sha, syncedAt: new Date().toISOString() } };
    save("copy", copy);
    return copy;
  } catch (e) {
    const kept = load("copy", null);
    if (kept) return kept;
    throw e;
  }
}

/** The Leash Log's files: status.yaml, gantry-cycles.yaml and copy.json (where they came from). There's no pushed.json on the phone. */
export async function ownFile(path) {
  if (path === "status.yaml") {
    latest = await readMain();
    return latest.text;
  }
  if (path === "gantry-cycles.yaml") {
    const desk = (latest ?? (await readMain())).desk;
    if (desk == null) throw new Error("main has no gantry-cycles.yaml");
    return desk;
  }
  if (path === "copy.json") return JSON.stringify((latest ?? (await readMain())).meta);
  throw new Error(`${path} isn't on the phone`);
}
