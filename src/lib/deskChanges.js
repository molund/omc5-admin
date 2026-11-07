// A change's half in desk.yaml (lib/deskFile.js): the step of the gantry's cycle it reports, and the note to self. A change
// writes both files in one commit: status.yaml through lib/changes.js, desk.yaml through this.
//
// What a change can carry for desk.yaml:
//   stage: "glued"                the step it reports, tagged at its own time stamp
//   noteToSelf: "…"               (move) the note to self at its time stamp
//   memo: { noteKey, text }       (update, blog, follow-up) the note to self of an entry; "" removes it
// A move, update or follow-up has a stage only when one is picked (the picker is off until it is switched on), or when the
// change implies one: "arrived at span" for a new span, "hung" for marking the span hung. A stage picked is never earlier than
// "hung" with the span hung (floorStage). Changes waiting on a device from before may have `stages: [...]` instead, read as the furthest.
import { parseStatus, headerOf } from "./statusFile.js";
import { formatDesk, moveEntry, parseDesk, removeEntries, replaceStage, setEntry } from "./deskFile.js";
import { applyChange, Conflict, setVelocity } from "./changes.js";
import { velocity, velocityHistory } from "./velocity.js";
import { atLeast, floorStage, stageOf } from "./stages.js";

/** The line ranges a whole-file rewrite changed, as one hunk for the review. */
function diff(oldText, newText) {
  if (oldText === newText) return [];
  const a = oldText.split("\n"),
    b = newText.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1,
    endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  return [{ start, before: a[start - 1] ?? null, removed: a.slice(start, endA + 1), added: b.slice(start, endB + 1) }];
}

/**
 * Applies a change's desk.yaml half.
 * @param {string} deskText desk.yaml as it is.
 * @param {object} change
 * @param {string} statusBefore status.yaml before the change (for the gantry's position before).
 * @returns {{ text: string, hunks: object[] }}
 */
export function applyDeskChange(deskText, change, statusBefore) {
  let entries = parseDesk(deskText);
  const head = headerOf(parseStatus(statusBefore));
  const before = { span: head.span, complete: head.complete };
  const stage = stageOf(change);
  const at = (key, span, stage, noteToSelf) => (entries = setEntry(entries, key, { span, stage, noteToSelf }));
  // never earlier than hung once the span is: the picker keeps to it, and this holds for a change made without it. With no
  // step picked, only what the change itself implies is logged: arriving at a new span, or marking the span hung.
  const reported = (after) =>
    stage
      ? atLeast(stage, floorStage(after.complete))
      : after.span !== before.span || (after.complete && !before.complete)
        ? floorStage(after.complete)
        : undefined;
  switch (change.kind) {
    case "move": {
      const after = { span: change.span, complete: change.complete };
      at(
        change.time,
        change.span,
        reported(after),
        typeof change.noteToSelf === "string" ? change.noteToSelf : undefined,
      );
      break;
    }
    case "update": {
      const after = { span: change.span, complete: change.complete };
      at(change.time, change.span, reported(after));
      break;
    }
    case "followup": {
      const after = change.gantry ?? before;
      at(change.time, after.span, reported(after));
      break;
    }
    case "followup-edit":
      entries = moveEntry(entries, change.fuKey, change.time);
      if (stage) entries = replaceStage(entries, change.time, stage, head.span);
      break;
    case "followup-delete":
      entries = removeEntries(entries, [change.fuKey]);
      break;
    case "desk-edit":
    case "desk-delete": {
      if (!entries.some((e) => e.key === change.key))
        throw new Conflict(`The record from ${change.key} isn't in desk.yaml any more.`);
      if (change.kind === "desk-delete") entries = removeEntries(entries, [change.key]);
      else {
        if (stage) entries = replaceStage(entries, change.key, stage, head.span);
        entries = setEntry(entries, change.key, { noteToSelf: change.noteToSelf });
      }
      break;
    }
    case "blog":
      break;
    case "note-edit":
      if (stage) entries = replaceStage(entries, change.noteKey, stage, head.span);
      break;
    case "note-delete": {
      const note = parseStatus(statusBefore).notes.find((n) => n.key === change.noteKey);
      entries = removeEntries(entries, [change.noteKey, ...(note?.followUps.map((f) => f.key) ?? [])]);
      break;
    }
    default:
      throw new Conflict(`Unknown change "${change.kind}".`);
  }
  if (change.memo) at(change.memo.noteKey, undefined, undefined, change.memo.text);
  const text = formatDesk(entries);
  return { text, hunks: diff(deskText, text) };
}

/**
 * Applies a change to both files, and writes the velocity it leaves into status.yaml.
 * @param {{ status: string, desk: string }} files
 * @returns {{ status: string, desk: string, hunks: object[], deskHunks: object[] }}
 * @throws {Conflict} when the change no longer fits status.yaml.
 */
export function applyBoth(files, change) {
  const s = applyChange(files.status, change, { deskKeys: parseDesk(files.desk).map((e) => e.key) });
  const d = applyDeskChange(files.desk, change, files.status);
  // the velocity with this change's steps in it, and its values at the earlier steps of the past 72 hours, near the top of
  // status.yaml
  const entries = parseDesk(d.text);
  const v = setVelocity(s.text, velocity(entries), velocityHistory(entries));
  return { status: v.text, desk: d.text, hunks: [...s.hunks, ...v.hunks], deskHunks: d.hunks };
}

/**
 * Applies a list of changes in order to both files, skipping (and reporting) any that no longer fit.
 * @returns {{ status: string, desk: string, results: Map<string, object> }}
 */
export function applyAllBoth(files, changes) {
  const results = new Map();
  let { status, desk } = files;
  for (const c of changes) {
    try {
      const r = applyBoth({ status, desk }, c);
      status = r.status;
      desk = r.desk;
      results.set(c.id, { ok: true, hunks: r.hunks, deskHunks: r.deskHunks });
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      results.set(c.id, { ok: false, error: e.message });
    }
  }
  return { status, desk, results };
}
