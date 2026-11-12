// Every prompt the sparkle icon copies, kept with the inputs it was built from, as test data for evaluating models and
// prompts when enhancing the AI writing feature later. Settings shares them as a zip: for each, a .txt with the prompt (as
// copied, but asking for the paragraph alone) and a .json with its inputs, both named by when it was copied. Each is kept under its own key, with a list of
// their ids, so a new one doesn't rewrite them all.
import { load, save } from "../platform/storage";

const LIST = "promptLog";
const one = (id) => `promptLog.${id}`;

/** BC time (UTC−7 all year, as in lib/time.js) to the second: "2026-11-12T08:15:32-07:00". */
export const stampOf = (date) => new Date(date.getTime() - 7 * 3600 * 1000).toISOString().slice(0, 19) + "-07:00";

/**
 * Keeps a copied prompt, unless it's the same as the last one kept.
 * @param {{ prompt: string, version: string, field: string, writes: string, text: string, context?: object }} entry
 */
export function logPrompt(entry, now = new Date()) {
  const ids = load(LIST, []);
  const last = ids.length ? load(one(ids[ids.length - 1]), null) : null;
  if (last && last.prompt === entry.prompt && last.field === entry.field) return;
  const id = `${now.getTime()}`;
  if (!save(one(id), { at: stampOf(now), ...entry })) return;
  save(LIST, [...ids, id]);
}

/** The kept prompts, oldest first. */
export const promptLog = () =>
  load(LIST, [])
    .map((id) => load(one(id), null))
    .filter(Boolean);

export function clearPromptLog() {
  for (const id of load(LIST, [])) save(one(id), undefined);
  save(LIST, undefined);
}

/** JSON with 2-space indents, except that an object of plain values in a list (a block) stays on one line. */
function pretty(v, pad = "", inList = false) {
  const inner = pad + "  ";
  if (Array.isArray(v))
    return v.length ? `[\n${v.map((x) => inner + pretty(x, inner, true)).join(",\n")}\n${pad}]` : "[]";
  if (v && typeof v === "object") {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined && v[k] !== null);
    if (!keys.length) return "{}";
    if (inList && keys.every((k) => typeof v[k] !== "object"))
      return `{ ${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(v[k])}`).join(", ")} }`;
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${pretty(v[k], inner)}`).join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(v);
}

/**
 * The files for the zip: "2026-11-12 08.15.32.txt" (the prompt) and "2026-11-12 08.15.32.json" (its inputs) for each.
 * Two from the same second get " (2)", and so on.
 * @returns {Record<string, string>}
 */
export function promptFiles(log) {
  const out = {};
  const seen = {};
  for (const { prompt, ...inputs } of log) {
    const base = `${inputs.at.slice(0, 10)} ${inputs.at.slice(11, 19).replace(/:/g, ".")}`;
    seen[base] = (seen[base] ?? 0) + 1;
    const name = seen[base] > 1 ? `${base} (${seen[base]})` : base;
    out[`${name}.txt`] = prompt;
    out[`${name}.json`] = pretty(inputs) + "\n";
  }
  return out;
}
