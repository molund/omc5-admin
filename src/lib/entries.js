// What the Entries tab lists: every update and blog post in status.yaml, each with its follow-ups, and the position records:
// a desk.yaml record with no post at its time stamp, or a note with no summary (an older position's note to self, which the
// site doesn't show). Plain JS, no React.
import { compareKeys } from "./time.js";
import { followUpsNewestFirst } from "./statusFile.js";

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
