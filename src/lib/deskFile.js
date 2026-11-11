// gantry-cycles.yaml in molund/omc5: the Leash Log's own records, and the velocity with its earlier values above them (written by
// changes.js's setDeskVelocity, read by the site's build for its chart; parseDesk passes over them). Entries are keyed by
// BC time stamps like status.yaml's notes, newest first. An entry can have the span it's about, the one step of the
// gantry's cycle it had reached by then (lib/stages.js) and a note to self. A time stamp can match a note or follow-up in
// status.yaml, or stand alone (a step seen with no post about it). The file is always written whole, in one shape, so it
// stays easy to read and to diff.
import { cleanText } from "./cleanText.js";
import { compareKeys } from "./time.js";
import { STAGES, currentName, furthest } from "./stages.js";
import { parseShutdowns } from "./shutdowns.js";

export const DESK_FILE = "gantry-cycles.yaml";

const HEADER = `# The Leash Log's own records (molund/omc5-admin). The site reads only the velocity below, at build time, for the
# progress card's chart. Entries are keyed by BC time stamps, like status.yaml's notes, newest first. An entry can have:
#   span: the Clayton Clipper span it's about
#   stage: the step of the gantry's cycle it had reached by then (see docs/gantry-cycle.md), one of:
#     ${STAGES.slice(0, 5).join(", ")},
#     ${STAGES.slice(5).join(", ")}
#   note: a memo, one line
# Every entry about the gantry has a stage, and one that marks its span hung is at "hung" or later. A time stamp can match a
# note or follow-up in status.yaml, or stand alone (a step seen with no post about it).`;

// above the irregular shutdowns list: how to write one, with examples to uncomment (take out the "# ")
const SHUTDOWNS_COMMENT = `# irregular-shutdowns: stretches with no gantry work that the weekly shutdown doesn't cover, added by hand. Each one has:
#   label: what to call it
#   type: holiday (excused: it extends the week by its hours, up to 24 each), or mechanical, or waiting (on work ahead):
#     those two count against the pace. Any other type does too, and has no icon
#   start: a BC time stamp, like the entries below
#   end: a BC time stamp, or hours: how long it lasted (14, 5.5): either one, whichever saves the arithmetic
#   with neither, it's still going: add one when work starts again
# Write the real stretch: if the crews worked into it, shorten it. A step reported during a shutdown is counted at its start.
# A holiday is excused for 24 hours at most. Christmas and Boxing Day are two holidays: list them as two entries, one for
# each day, not one of 48 hours.
# Examples (take out the "# "):
#   - label: Remembrance Day
#     type: holiday
#     start: 2026-11-11T06:00-07:00
#     hours: 14
#   - label: Hydraulic pump failure
#     type: mechanical
#     start: 2026-11-14T10:15-07:00
#     end: 2026-11-14T15:15-07:00
#   - label: Waiting for the caps at span 31
#     type: waiting
#     start: 2026-09-14T07:00-07:00`;

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
 * @typedef {{ key: string, span: number|null, stage: string|null, noteToSelf: string }} DeskEntry
 * stage: null only on an entry that is just a note to self (a blog post's).
 * @returns {DeskEntry[]} Newest first. It also carries the file's irregular shutdowns (lib/shutdowns.js) as a `shutdowns` property
 * that doesn't show up when it's copied or looped over, which the velocity's calculations read.
 */
export function parseDesk(text) {
  const entries = [];
  let cur = null;
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*(#|$)/.test(line)) continue;
    const key = line.match(/^  - (\d{4}-\d\d-\d\d(?:T\d\d:\d\d-07:00)?):\s*$/);
    if (key) {
      cur = { key: key[1], span: null, stage: null, noteToSelf: "" };
      entries.push(cur);
      continue;
    }
    const field = cur && line.match(/^ {6}([a-z-]+):\s*(.*)$/);
    if (!field) continue;
    const [, k, v] = field;
    if (k === "span") cur.span = Number(v) || null;
    else if (k === "stage") cur.stage = furthest([currentName(unquote(v))]) ?? null;
    // the old "stages: [a, b]" is read as the furthest of them, so an entry written before this isn't lost
    else if (k === "stages")
      cur.stage =
        furthest(
          v
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map((s) => currentName(s.trim())),
        ) ?? null;
    else if (k === "note") cur.noteToSelf = unquote(v);
  }
  const sorted = sortEntries(entries);
  Object.defineProperty(sorted, "shutdowns", { value: parseShutdowns(text), enumerable: false });
  return sorted;
}

const sortEntries = (entries) => [...entries].sort((a, b) => compareKeys(b.key, a.key));

/**
 * The irregular shutdowns block of a gantry-cycles.yaml as it is, line for line (the `irregular-shutdowns:` line, then the list,
 * with the comments and spacing it was written with), so the Leash Log can write the file again without losing it. It runs to
 * its last indented line: a comment at the left edge in the middle of the list is kept, but the comment above the next key isn't
 * taken. Null when the file has no such key.
 * @returns {string[]|null}
 */
export function rawShutdowns(text) {
  const lines = String(text ?? "").split("\n");
  const at = lines.findIndex((l) => /^irregular-shutdowns:\s*(#.*)?$/.test(l));
  if (at < 0) return null;
  let last = at;
  for (let i = at + 1; i < lines.length && !/^[A-Za-z]/.test(lines[i]); i++) if (/^\s+\S/.test(lines[i])) last = i;
  return lines.slice(at, last + 1);
}

/**
 * The file's text for these entries. Empty entries are left out.
 * @param {DeskEntry[]} entries
 * @param {{ shutdowns?: string[]|null }} [keep] The irregular shutdowns block to write back as it was (rawShutdowns). Without
 *   one, the key is written with nothing under it, ready for entries to be added.
 */
export function formatDesk(entries, { shutdowns } = {}) {
  const lines = [HEADER, SHUTDOWNS_COMMENT, ...(shutdowns ?? ["irregular-shutdowns:"]), "entries:"];
  for (const e of sortEntries(entries)) {
    const stage = furthest([e.stage]);
    const memo = cleanText(e.noteToSelf).replace(/\s+/g, " ").trim();
    if (!stage && !memo) continue;
    lines.push(`  - ${e.key}:`);
    if (e.span) lines.push(`      span: ${e.span}`);
    if (stage) lines.push(`      stage: ${stage}`);
    if (memo) lines.push(`      note: ${q(memo)}`);
  }
  return lines.join("\n") + "\n";
}

/** An empty gantry-cycles.yaml, for a repo that doesn't have one yet. */
export const EMPTY_DESK = formatDesk([]);

/**
 * Changes one entry: sets its stage if one is given (and never to an earlier one than it has: a stage isn't taken back this
 * way), sets the span if given, and sets or clears the note to self if `noteToSelf` is a string. Returns the new entries.
 */
export function setEntry(entries, key, { span, stage, noteToSelf } = {}) {
  const out = entries.map((e) => ({ ...e }));
  let e = out.find((x) => x.key === key);
  if (!e) {
    e = { key, span: null, stage: null, noteToSelf: "" };
    out.push(e);
  }
  if (span) e.span = span;
  if (stage) e.stage = furthest([e.stage, stage]);
  if (typeof noteToSelf === "string") e.noteToSelf = noteToSelf;
  return sortEntries(out);
}

/** Moves an entry to a new time stamp (when a follow-up's time is edited), merging it into one already there. */
export function moveEntry(entries, from, to) {
  const e = entries.find((x) => x.key === from);
  if (!e || from === to) return entries;
  const rest = entries.filter((x) => x.key !== from);
  return setEntry(rest, to, { span: e.span, stage: e.stage, noteToSelf: e.noteToSelf || undefined });
}

/** Sets an entry's stage to exactly this one. An entry with no span yet takes the one in force at its time. */
export function replaceStage(entries, key, stage, fallbackSpan) {
  const out = setEntry(entries, key);
  const e = out.find((x) => x.key === key);
  e.stage = stage;
  if (!e.span) e.span = spanAt(entries, key) ?? fallbackSpan ?? null;
  return out;
}

/** The stage of the newest entry with one before a time stamp, or undefined: where the gantry was when that entry was written. */
export const stageBefore = (entries, key) =>
  entries.filter((e) => e.stage && compareKeys(e.key, key) < 0).sort((a, b) => compareKeys(b.key, a.key))[0]?.stage;

/** The span of the newest entry at or before a time stamp, or null. */
export function spanAt(entries, key) {
  return sortEntries(entries).find((e) => e.span && compareKeys(e.key, key) <= 0)?.span ?? null;
}

/** The furthest step posted for a span, or undefined. */
export const postedStage = (entries, span) => furthest(entries.filter((e) => e.span === span).map((e) => e.stage));

/** Takes these time stamps out altogether. */
export const removeEntries = (entries, keys) => entries.filter((e) => !keys.includes(e.key));

/** The note to self at a time stamp, or "". */
export const memoAt = (entries, key) => entries.find((e) => e.key === key)?.noteToSelf ?? "";
