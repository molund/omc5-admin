// What claude.web.js gives the desk in the Claude app, for the phone. There's no Claude app around the desk here: no
// capabilities (so no saving into an outbox), and the desk's copy of status.yaml is read straight from main on GitHub. The
// repo is public, so no token is needed. The last copy read is kept, so the desk still opens when the phone is offline.
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

/**
 * main's status.yaml and desk.yaml, at the commit main is on now (so a file the API's cache is behind on can't be mixed with
 * a newer commit's name). When GitHub can't be reached, the last copy kept on the phone. A main without desk.yaml has none.
 */
async function readMain() {
  try {
    const sha = (await get(`${API}/commits/main`, "application/vnd.github.sha")).trim();
    const text = await get(`${API}/contents/status.yaml?ref=${sha}`, "application/vnd.github.raw+json");
    const desk = await get(`${API}/contents/desk.yaml?ref=${sha}`, "application/vnd.github.raw+json").catch(() => null);
    const copy = { text, desk, meta: { commit: sha, syncedAt: new Date().toISOString() } };
    save("copy", copy);
    return copy;
  } catch (e) {
    const kept = load("copy", null);
    if (kept) return kept;
    throw e;
  }
}

/** The desk's files: status.yaml, desk.yaml and copy.json (where they came from). There's no pushed.json on the phone. */
export async function ownFile(path) {
  if (path === "status.yaml") {
    latest = await readMain();
    return latest.text;
  }
  if (path === "desk.yaml") {
    const desk = (latest ?? (await readMain())).desk;
    if (desk == null) throw new Error("main has no desk.yaml");
    return desk;
  }
  if (path === "copy.json") return JSON.stringify((latest ?? (await readMain())).meta);
  throw new Error(`${path} isn't on the phone`);
}
