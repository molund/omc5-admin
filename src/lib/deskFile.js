// gantry-cycles.yaml in molund/omc5: the Leash Log's own records, and the velocity with its earlier values above them (written by
// changes.js's setDeskVelocity, read by the site's build for its chart; parseDesk passes over them). Entries are keyed by
// BC time stamps like status.yaml's notes, newest first. An entry can have the span it's about, the one step of the
// gantry's cycle it had reached by then (lib/stages.js), optionally how far through that step it was (0 to 99 per cent, a
// plain record: nothing is worked out from it) and a note to self. A time stamp can match a note or follow-up in
// status.yaml, or stand alone (a step seen with no post about it). The file is always written whole, in one shape, so it
// stays easy to read and to diff.
import { cleanText } from "./cleanText.js";
import { compareKeys } from "./time.js";
import { STAGES, currentName, furthest } from "./stages.js";
import { parseSchedule } from "./scheduleFile.js";

export const DESK_FILE = "gantry-cycles.yaml";

const HEADER = `# The Leash Log's own records (molund/omc5-admin). The site reads only the velocity below, at build time, for the
# progress card's chart. Entries are keyed by BC time stamps, like status.yaml's notes, newest first. An entry can have:
#   span: the Clayton Clipper span it's about
#   stage: the step of the gantry's cycle it had reached by then (see docs/gantry-cycle.md), one of:
#     ${STAGES.slice(0, 5).join(", ")},
#     ${STAGES.slice(5).join(", ")}
#   progress: how far through the step it was, 0 to 99 per cent, when that was recorded
#   note: a memo, one line
# Every entry about the gantry has a stage, and one that marks its span hung is at "hung" or later. A time stamp can match a
# note or follow-up in status.yaml, or stand alone (a step seen with no post about it). The work schedule (irregular
# shutdowns, nights off) is in shift-schedule.yaml, written by hand.`;

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

/** A recorded completion: a whole number from 0 to 99, or null for anything else (nothing recorded). */
export const asProgress = (v) => {
  const n = Math.round(Number(v));
  return v !== "" && v != null && Number.isFinite(n) && n >= 0 && n <= 99 ? n : null;
};

/**
 * @typedef {{ key: string, span: number|null, stage: string|null, progress: number|null, noteToSelf: string }} DeskEntry
 * stage: null only on an entry that is just a note to self (a blog post's). progress: how far through the stage, 0 to 99, or
 * null when none was recorded.
 * @param {string} text gantry-cycles.yaml
 * @param {string} [scheduleText] shift-schedule.yaml (lib/scheduleFile.js), "" when there's none
 * @returns {DeskEntry[]} Newest first. It also carries the schedule's irregular shutdowns (lib/shutdowns.js) as a `shutdowns`
 * property and its nights off (lib/nightsOff.js) as `nightsOff`, which don't show up when it's copied or looped over, which the
 * velocity's calculations read.
 */
export function parseDesk(text, scheduleText = "") {
  const entries = [];
  let cur = null;
  for (const line of String(text ?? "").split("\n")) {
    if (/^\s*(#|$)/.test(line)) continue;
    const key = line.match(/^  - (\d{4}-\d\d-\d\d(?:T\d\d:\d\d-07:00)?):\s*$/);
    if (key) {
      cur = { key: key[1], span: null, stage: null, progress: null, noteToSelf: "" };
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
    else if (k === "progress") cur.progress = asProgress(v);
    else if (k === "note") cur.noteToSelf = unquote(v);
  }
  const sorted = sortEntries(entries);
  const { shutdowns, nightsOff } = parseSchedule(scheduleText);
  Object.defineProperty(sorted, "shutdowns", { value: shutdowns, enumerable: false });
  Object.defineProperty(sorted, "nightsOff", { value: nightsOff, enumerable: false });
  return sorted;
}

const sortEntries = (entries) => [...entries].sort((a, b) => compareKeys(b.key, a.key));

/**
 * The file's text for these entries. Empty entries are left out.
 * @param {DeskEntry[]} entries
 */
export function formatDesk(entries) {
  const lines = [HEADER, "entries:"];
  for (const e of sortEntries(entries)) {
    const stage = furthest([e.stage]);
    const memo = cleanText(e.noteToSelf).replace(/\s+/g, " ").trim();
    if (!stage && !memo) continue;
    lines.push(`  - ${e.key}:`);
    if (e.span) lines.push(`      span: ${e.span}`);
    if (stage) lines.push(`      stage: ${stage}`);
    if (stage && asProgress(e.progress) != null) lines.push(`      progress: ${asProgress(e.progress)}`);
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
export function setEntry(entries, key, { span, stage, progress, noteToSelf } = {}) {
  const out = entries.map((e) => ({ ...e }));
  let e = out.find((x) => x.key === key);
  if (!e) {
    e = { key, span: null, stage: null, progress: null, noteToSelf: "" };
    out.push(e);
  }
  if (span) e.span = span;
  if (stage) {
    const next = furthest([e.stage, stage]);
    // a completion belongs to its step: when the step moves on, it goes, unless a new one comes with it
    if (next !== e.stage) e.progress = null;
    e.stage = next;
  }
  if (progress !== undefined) e.progress = asProgress(progress);
  if (typeof noteToSelf === "string") e.noteToSelf = noteToSelf;
  return sortEntries(out);
}

/** Moves an entry to a new time stamp (when a follow-up's time is edited), merging it into one already there. */
export function moveEntry(entries, from, to) {
  const e = entries.find((x) => x.key === from);
  if (!e || from === to) return entries;
  const rest = entries.filter((x) => x.key !== from);
  return setEntry(rest, to, {
    span: e.span,
    stage: e.stage,
    progress: e.progress,
    noteToSelf: e.noteToSelf || undefined,
  });
}

/**
 * Sets an entry's stage to exactly this one, and its completion to `progress` (none when it isn't a number). An entry with no
 * span yet takes the one in force at its time.
 */
export function replaceStage(entries, key, stage, fallbackSpan, progress) {
  const out = setEntry(entries, key);
  const e = out.find((x) => x.key === key);
  e.stage = stage;
  e.progress = asProgress(progress);
  if (!e.span) e.span = spanAt(entries, key) ?? fallbackSpan ?? null;
  return out;
}

/** The stage of the newest entry with one before a time stamp, or undefined: where the gantry was when that entry was written. */
export const stageBefore = (entries, key) =>
  entries.filter((e) => e.stage && compareKeys(e.key, key) < 0).sort((a, b) => compareKeys(b.key, a.key))[0]?.stage;

/**
 * The completion the last move before a time stamp recorded for this span's step: the newest earlier entry on the same span
 * and step that has one. A new record can't go below it (0 when there is none).
 */
export const progressBefore = (entries, span, stage, key) =>
  sortEntries(entries).find(
    (e) => e.span === span && e.stage === stage && e.progress != null && compareKeys(e.key, key) < 0,
  )?.progress ?? 0;

/** The span of the newest entry at or before a time stamp, or null. */
export function spanAt(entries, key) {
  return sortEntries(entries).find((e) => e.span && compareKeys(e.key, key) <= 0)?.span ?? null;
}

/**
 * The furthest step posted for a span, or undefined. With a time stamp, only the steps posted before it: a back-dated entry
 * (or a position turned into an update) isn't held to steps that came after it.
 */
export const postedStage = (entries, span, before) =>
  furthest(entries.filter((e) => e.span === span && (!before || compareKeys(e.key, before) < 0)).map((e) => e.stage));

/**
 * Keeps gantry-cycles.yaml from growing with every check-in: of a run of entries reporting the same step on the same span,
 * only the first (when the step was reached) and the latest are kept. One in between goes, unless it carries a completion or
 * a note to self. Entries with no step (a blog post's note to self) don't break a run.
 */
export function dropRepeats(entries) {
  const steps = sortEntries(entries)
    .filter((e) => e.stage)
    .reverse();
  const same = (a, b) => a && b && a.span === b.span && a.stage === b.stage;
  const drop = new Set(
    steps
      .filter((e, i) => same(steps[i - 1], e) && same(e, steps[i + 1]) && e.progress == null && !e.noteToSelf)
      .map((e) => e.key),
  );
  return entries.filter((e) => !drop.has(e.key));
}

/** Takes these time stamps out altogether. */
export const removeEntries = (entries, keys) => entries.filter((e) => !keys.includes(e.key));

/** The note to self at a time stamp, or "". */
export const memoAt = (entries, key) => entries.find((e) => e.key === key)?.noteToSelf ?? "";
