// desk.yaml in molund/omc5: the Status Desk's own records, which the site doesn't read. Entries are keyed by BC time stamps
// like status.yaml's notes, newest first. An entry can have the span it's about, the steps of the gantry's cycle seen by
// then (lib/stages.js) and a note to self. A time stamp can match a note or follow-up in status.yaml, or stand alone (a step
// seen with no post about it). The file is always written whole, in one shape, so it stays easy to read and to diff.
import { compareKeys } from "./time.js";
import { STAGES } from "./stages.js";

export const DESK_FILE = "desk.yaml";

const HEADER = `# The Status Desk's own records (molund/omc5-admin). The site doesn't read this file. Entries are keyed by
# BC time stamps, like status.yaml's notes, newest first. An entry can have:
#   span: the Clayton Clipper span it's about
#   stages: the steps of the gantry's cycle seen by then (see docs/gantry-cycle.md):
#     ${STAGES.slice(0, 5).join(", ")},
#     ${STAGES.slice(5, 9).join(", ")},
#     ${STAGES.slice(9).join(", ")}
#   note-to-self: a memo, one line
# A time stamp can match a note or follow-up in status.yaml, or stand alone (a step seen with no post about it). The
# desk logs every move of the gantry here ("arrived"), and marking a span complete logs "hung".`;

const unquote = (v) => {
  v = v.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
};
const q = (s) => JSON.stringify(String(s));

/**
 * @typedef {{ key: string, span: number|null, stages: string[], noteToSelf: string }} DeskEntry
 * @returns {DeskEntry[]} Newest first.
 */
export function parseDesk(text) {
  const entries = [];
  let cur = null;
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*(#|$)/.test(line)) continue;
    const key = line.match(/^  - (\d{4}-\d\d-\d\d(?:T\d\d:\d\d-07:00)?):\s*$/);
    if (key) {
      cur = { key: key[1], span: null, stages: [], noteToSelf: "" };
      entries.push(cur);
      continue;
    }
    const field = cur && line.match(/^ {6}([a-z-]+):\s*(.*)$/);
    if (!field) continue;
    const [, k, v] = field;
    if (k === "span") cur.span = Number(v) || null;
    else if (k === "stages")
      cur.stages = v
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => STAGES.includes(s));
    else if (k === "note-to-self") cur.noteToSelf = unquote(v);
  }
  return sortEntries(entries);
}

const sortEntries = (entries) => [...entries].sort((a, b) => compareKeys(b.key, a.key));

/** The file's text for these entries. Empty entries are left out. */
export function formatDesk(entries) {
  const lines = [HEADER, "entries:"];
  for (const e of sortEntries(entries)) {
    const stages = STAGES.filter((s) => e.stages?.includes(s));
    const memo = String(e.noteToSelf ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!stages.length && !memo) continue;
    lines.push(`  - ${e.key}:`);
    if (e.span) lines.push(`      span: ${e.span}`);
    if (stages.length) lines.push(`      stages: [${stages.join(", ")}]`);
    if (memo) lines.push(`      note-to-self: ${q(memo)}`);
  }
  return lines.join("\n") + "\n";
}

/** An empty desk.yaml, for a repo that doesn't have one yet. */
export const EMPTY_DESK = formatDesk([]);

/**
 * Changes one entry: adds stages (they're never removed this way), sets the span if given, and sets or clears the note to
 * self if `noteToSelf` is a string. Returns the new entries.
 */
export function setEntry(entries, key, { span, stages = [], noteToSelf } = {}) {
  const out = entries.map((e) => ({ ...e, stages: [...e.stages] }));
  let e = out.find((x) => x.key === key);
  if (!e) {
    e = { key, span: null, stages: [], noteToSelf: "" };
    out.push(e);
  }
  if (span) e.span = span;
  for (const s of stages) if (!e.stages.includes(s)) e.stages.push(s);
  if (typeof noteToSelf === "string") e.noteToSelf = noteToSelf;
  return sortEntries(out);
}

/** Moves an entry to a new time stamp (when a follow-up's time is edited), merging it into one already there. */
export function moveEntry(entries, from, to) {
  const e = entries.find((x) => x.key === from);
  if (!e || from === to) return entries;
  const rest = entries.filter((x) => x.key !== from);
  return setEntry(rest, to, { span: e.span, stages: e.stages, noteToSelf: e.noteToSelf || undefined });
}

/** Sets an entry's stages to exactly these. An entry with no span yet takes the one in force at its time. */
export function replaceStages(entries, key, stages, fallbackSpan) {
  const out = setEntry(entries, key);
  const e = out.find((x) => x.key === key);
  e.stages = [...stages];
  if (!e.span && stages.length) e.span = spanAt(entries, key) ?? fallbackSpan ?? null;
  return out;
}

/** The span of the newest entry at or before a time stamp, or null. */
export function spanAt(entries, key) {
  return sortEntries(entries).find((e) => e.span && compareKeys(e.key, key) <= 0)?.span ?? null;
}

/** Takes these time stamps out altogether. */
export const removeEntries = (entries, keys) => entries.filter((e) => !keys.includes(e.key));

/** The note to self at a time stamp, or "". */
export const memoAt = (entries, key) => entries.find((e) => e.key === key)?.noteToSelf ?? "";
