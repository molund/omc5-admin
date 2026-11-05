// What the Entries tab lists: every update and blog post in status.yaml, each with its follow-ups, and the position records:
// a desk.yaml record with no post at its time stamp, or a note with no summary (an older position's note to self, which the
// site doesn't show). Plain JS, no React.
import { compareKeys } from "./time.js";
import { followUpsNewestFirst } from "./statusFile.js";
import { STAGE_LABELS, splitStages } from "./stages.js";

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

/** How a position record reads: its span, its steps and its note to self. */
export function positionName({ note, record }) {
  const steps = (record?.stages ?? []).map((s) => STAGE_LABELS[s]).join(", ");
  const memo = record?.noteToSelf || note?.fields.memo || "";
  return [record?.span ? `Span ${record.span}` : "", steps, shorten(memo)].filter(Boolean).join(" · ") || "No details";
}

/** The list with one change swapped for its new version, in the same place, under the same id. */
export const replaceChangeIn = (changes, id, change, message, savedAt) =>
  changes.map((c) => (c.id === id ? { ...change, id, message, savedAt } : c));

/** Whether a waiting change can be reopened. A delete has nothing to edit: it can only be discarded. */
export const canReopen = (change) => !/-delete$/.test(change.kind);

/**
 * The draft a waiting change reopens as, in the form its screen keeps: { screen, seed, target? }. `target` is for the changes
 * that edit something saved, which reopen in the entry editor.
 */
export function reopenAs(change, head) {
  const memo = change.memo?.text;
  const stages = change.stages;
  switch (change.kind) {
    case "move":
      return {
        screen: "move",
        seed: {
          time: change.time,
          span: change.span,
          complete: change.complete,
          memo: change.noteToSelf ?? "",
          stages,
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
          stages,
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
          stages,
        },
      };
    case "blog":
      return {
        screen: "blog",
        seed: { date: change.date, title: change.title, blocks: change.blocks, memo: memo ?? "" },
      };
    case "followup-edit": {
      const { kept, reported } = splitStages(stages);
      return {
        screen: "entry",
        target: { type: "followup", key: change.fuKey, noteKey: change.noteKey },
        seed: { time: change.time, blocks: change.blocks, memo: memo ?? "", kept, stages: reported },
      };
    }
    case "note-edit": {
      const { kept, reported } = splitStages(stages);
      return {
        screen: "entry",
        // "blog" or "update" is settled against the note itself when it opens
        target: { type: "note", key: change.noteKey },
        seed: { title: change.title, blocks: change.blocks, memo: memo ?? "", kept, stages: reported },
      };
    }
    case "desk-edit": {
      const { kept, reported } = splitStages(stages);
      return {
        screen: "entry",
        target: { type: "position", key: change.key },
        seed: { memo: change.noteToSelf ?? "", kept, stages: reported },
      };
    }
    default:
      return null;
  }
}
