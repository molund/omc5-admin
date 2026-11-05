// A change's half in desk.yaml (lib/deskFile.js): the steps of the gantry's cycle it reports, any move it makes, and the
// note to self. A change writes both files in one commit: status.yaml through lib/changes.js, desk.yaml through this.
//
// What a change can carry for desk.yaml:
//   stages: ["glued", …]          the steps it reports, tagged at its own time stamp
//   noteToSelf: "…"               (move) the note to self at its time stamp
//   memo: { noteKey, text }       (update, blog, follow-up) the note to self of an entry; "" removes it
// and, without asking, every move of the gantry is logged: a new span is "arrived", a span marked complete is "hung".
import { parseStatus, headerOf } from "./statusFile.js";
import { formatDesk, moveEntry, parseDesk, removeEntries, replaceStages, setEntry } from "./deskFile.js";
import { applyChange, Conflict } from "./changes.js";

/** The steps a move of the gantry logs by itself: from the position before to the one after. */
export function autoStages(before, after) {
  if (!after?.span) return [];
  const out = [];
  if (after.span !== before.span) out.push("arrived");
  if (after.complete && !(before.complete && before.span === after.span)) out.push("hung");
  return out;
}

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
  const at = (key, span, stages, noteToSelf) => (entries = setEntry(entries, key, { span, stages, noteToSelf }));
  switch (change.kind) {
    case "move": {
      const after = { span: change.span, complete: change.complete };
      const stages = [...autoStages(before, after), ...(change.stages ?? [])];
      at(change.time, change.span, stages, typeof change.noteToSelf === "string" ? change.noteToSelf : undefined);
      break;
    }
    case "update": {
      const after = { span: change.span, complete: change.complete };
      at(change.time, change.span, [...autoStages(before, after), ...(change.stages ?? [])]);
      break;
    }
    case "followup": {
      const after = change.gantry ?? before;
      at(change.time, after.span, [...autoStages(before, after), ...(change.stages ?? [])]);
      break;
    }
    case "followup-edit":
      entries = moveEntry(entries, change.fuKey, change.time);
      if (change.stages) entries = replaceStages(entries, change.time, change.stages, head.span);
      break;
    case "followup-delete":
      entries = removeEntries(entries, [change.fuKey]);
      break;
    default:
      throw new Conflict(`Unknown change "${change.kind}".`);
  }
  if (change.memo) at(change.memo.noteKey, undefined, [], change.memo.text);
  const text = formatDesk(entries);
  return { text, hunks: diff(deskText, text) };
}

/**
 * Applies a change to both files.
 * @param {{ status: string, desk: string }} files
 * @returns {{ status: string, desk: string, hunks: object[], deskHunks: object[] }}
 * @throws {Conflict} when the change no longer fits status.yaml.
 */
export function applyBoth(files, change) {
  const s = applyChange(files.status, change, { deskKeys: parseDesk(files.desk).map((e) => e.key) });
  const d = applyDeskChange(files.desk, change, files.status);
  return { status: s.text, desk: d.text, hunks: s.hunks, deskHunks: d.hunks };
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
