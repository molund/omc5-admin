// What the Entries tab lists: every update and blog post in status.yaml, each with its follow-ups, and the position records:
// a gantry-cycles.yaml record with no post at its time stamp, or a note with no summary (an older position's note to self, which the
// site doesn't show). Plain JS, no React.
import { clock, compareKeys, dayOf, parseKey, toKey } from "./time.js";
import { followUpsNewestFirst, newestFirst } from "./statusFile.js";
import { STAGE_LABELS, stageOf } from "./stages.js";

/**
 * @typedef {{ type: "update"|"blog", key: string, note: object, followUps: object[] }
 *   | { type: "position", key: string, note: object|null, record: object|null }} Entry
 * @param {{ notes: object[] }} parsed
 * @param {object[]} deskEntries
 * @returns {Entry[]} Newest first.
 */
export function listEntries(parsed, deskEntries) {
  const recordAt = (key) => deskEntries.find((e) => e.key === key) ?? null;
  const posted = new Set(parsed.notes.flatMap((n) => [n.key, ...n.followUps.map((f) => f.key)]));
  const notes = parsed.notes.map((note) =>
    note.fields.summary
      ? { type: note.fields.post ? "blog" : "update", key: note.key, note, followUps: followUpsNewestFirst(note) }
      : { type: "position", key: note.key, note, record: recordAt(note.key) },
  );
  const records = deskEntries
    .filter((e) => !posted.has(e.key))
    .map((record) => ({ type: "position", key: record.key, note: null, record }));
  return [...notes, ...records].sort((a, b) => compareKeys(b.key, a.key));
}

/** The time stamp a change creates something at, for changes that bring a new entry into the working copy. */
const createdAt = (c) =>
  c.kind === "move" || c.kind === "update" || c.kind === "followup" ? c.time : c.kind === "blog" ? c.date : null;

/** The waiting change that created what's at a time stamp, or undefined: it isn't on the site yet. */
export const waitingAt = (changes, key) => changes.find((c) => createdAt(c) === key);

/** Text cut to a length, for a list. */
export const shorten = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 2)}…` : s);

/** How a position record reads: its span and its step. Its note to self goes on a line of its own (positionMemo). */
export function positionName({ note, record }) {
  const steps = record?.stage ? STAGE_LABELS[record.stage] : "";
  const name = [record?.span ? `Span ${record.span}` : "", steps].filter(Boolean).join(" · ");
  return name || (positionMemo({ note, record }) ? "" : "No details");
}

/** A position record's note to self, shortened for the list, or "". */
export const positionMemo = ({ note, record }) => shorten(record?.noteToSelf || note?.fields.memo || "");

/** The list with one change swapped for its new version, in the same place, under the same id. */
export const replaceChangeIn = (changes, id, change, message, savedAt) =>
  changes.map((c) => (c.id === id ? { ...change, id, message, savedAt } : c));

/** Whether a waiting change can be reopened. A delete has nothing to edit: it can only be discarded. */
export const canReopen = (change) => !/-delete$/.test(change.kind);

/**
 * The updates a new follow-up can go under: today's and yesterday's (BC days), newest first. Not blog posts, nor a position's
 * note to self (no summary).
 */
export function recentUpdates(parsed, now = new Date()) {
  const days = [dayOf(now), dayOf(new Date(now.getTime() - 24 * 3600 * 1000))];
  return newestFirst(parsed?.notes ?? []).filter(
    (n) => n.fields.summary && !n.fields.post && days.includes(dayOf(n.key)),
  );
}

/** How soon after its update or blog post an addendum can be, in minutes. */
export const ADDENDUM_AFTER_MINUTES = 15;

/**
 * What's wrong with an addendum's time stamp, as problems to show (none: it can be saved). It has to be on the same BC day as
 * the update or blog post it's under, at least ADDENDUM_AFTER_MINUTES after it, and not at the same time as another of its
 * addendums. `editing`, the time stamp of the addendum being edited, which doesn't count as another.
 * @returns {string[]}
 */
export function addendumProblems(note, time, editing = null) {
  const what = note.fields.post ? "blog post" : "update";
  const problems = [];
  if (dayOf(time) !== dayOf(note.key)) problems.push(`An addendum has to be on the same day as its ${what}.`);
  else {
    // a date-only blog post starts at midnight
    const earliest = new Date(parseKey(note.key).getTime() + ADDENDUM_AFTER_MINUTES * 60 * 1000);
    if (parseKey(time) < earliest)
      problems.push(
        `An addendum has to be at least ${ADDENDUM_AFTER_MINUTES} minutes after its ${what}: ${clock(toKey(earliest))} or later.`,
      );
  }
  const taken = note.followUps.some(
    (f) => (editing == null || compareKeys(f.key, editing) !== 0) && compareKeys(f.key, time) === 0,
  );
  if (taken) problems.push(`There's already an addendum at ${clock(time)}.`);
  return problems;
}

/**
 * The draft a waiting change reopens as, in the form its screen keeps: { screen, seed, target? }. `target` is for the changes
 * that edit something saved, which reopen in the entry editor.
 */
export function reopenAs(change, head) {
  const memo = change.memo?.text;
  const stage = stageOf(change);
  switch (change.kind) {
    case "move":
      return {
        screen: "move",
        seed: {
          time: change.time,
          span: change.span,
          complete: change.complete,
          memo: change.noteToSelf ?? "",
          stage,
        },
      };
    case "update":
      return {
        screen: "update",
        seed: {
          time: change.time,
          span: change.span,
          complete: change.complete,
          title: change.title,
          titleSet: true,
          blocks: change.blocks,
          memo: memo ?? "",
          stage,
        },
      };
    case "followup":
      return {
        screen: "followup",
        seed: {
          noteKey: change.noteKey,
          editing: null,
          memo,
          time: change.time,
          blocks: change.blocks,
          span: change.gantry?.span ?? head.span,
          complete: change.gantry?.complete ?? head.complete,
          stage,
        },
      };
    case "blog":
      return {
        screen: "blog",
        seed: { date: change.date, title: change.title, blocks: change.blocks, memo: memo ?? "" },
      };
    case "followup-edit":
      return {
        screen: "entry",
        target: { type: "followup", key: change.fuKey, noteKey: change.noteKey },
        seed: { time: change.time, blocks: change.blocks, memo: memo ?? "", stage },
      };
    case "note-edit":
      return {
        screen: "entry",
        // "blog" or "update" is settled against the note itself when it opens
        target: { type: "note", key: change.noteKey },
        seed: { title: change.title, blocks: change.blocks, memo: memo ?? "", stage },
      };
    case "desk-edit":
      return {
        screen: "entry",
        target: { type: "position", key: change.key },
        seed: { memo: change.noteToSelf ?? "", stage },
      };
    default:
      return null;
  }
}
