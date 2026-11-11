// A change's half in gantry-cycles.yaml (lib/deskFile.js): the step of the gantry's cycle it reports, and the note to self. A change
// writes both files in one commit: status.yaml through lib/changes.js, gantry-cycles.yaml through this.
//
// What a change can carry for gantry-cycles.yaml:
//   stage: "glued"                the step it reports, tagged at its own time stamp
//   noteToSelf: "…"               (move) the note to self at its time stamp
//   memo: { noteKey, text }       (update, blog, follow-up) the note to self of an entry; "" removes it
// A move, update or follow-up has a stage only when one is picked (the picker is off until it is switched on), or when the
// change implies one: "arrived at span" for a new span, "hung" for marking the span hung. A stage picked is never earlier than
// "hung" with the span hung (floorStage). Changes waiting on a device from before may have `stages: [...]` instead, read as the furthest.
import { parseStatus, headerOf } from "./statusFile.js";
import { formatDesk, moveEntry, parseDesk, rawShutdowns, removeEntries, replaceStage, setEntry } from "./deskFile.js";
import { applyChange, Conflict, setDeskVelocity, setVelocity } from "./changes.js";
import { velocity, velocityHistory } from "./velocity.js";
import { atLeast, floorStage, stageOf } from "./stages.js";
import { parseKey } from "./time.js";

/**
 * The lines a rewrite changed, for the review: a hunk for each run of changed lines, with the line before it, and none for
 * a line that came out the same (a line-by-line diff, the longest run of lines kept in common).
 */
export function diff(oldText, newText) {
  if (oldText === newText) return [];
  const a = oldText.split("\n"),
    b = newText.split("\n");
  // the same lines at the start and the end are left out before the diff
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length,
    endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(start, endA),
    y = b.slice(start, endB);
  // lcs[i][j]: the most lines x from i and y from j keep in common
  const lcs = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const hunks = [];
  let hunk = null;
  const open = (j) =>
    (hunk ??= hunks[hunks.push({ start: start + j, before: b[start + j - 1] ?? null, removed: [], added: [] }) - 1]);
  let i = 0,
    j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      hunk = null;
      i++;
      j++;
    } else if (j < y.length && (i === x.length || lcs[i][j + 1] >= lcs[i + 1][j])) open(j).added.push(y[j++]);
    else open(j).removed.push(x[i++]);
  }
  return hunks;
}

/**
 * Applies a change's gantry-cycles.yaml half.
 * @param {string} deskText gantry-cycles.yaml as it is.
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
        throw new Conflict(`The record from ${change.key} isn't in gantry-cycles.yaml any more.`);
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
  // the irregular shutdowns list is written by hand: it goes back as it was
  const text = formatDesk(entries, { shutdowns: rawShutdowns(deskText) });
  return { text, hunks: diff(deskText, text) };
}

/**
 * Applies a change to both files, and writes the velocity it leaves: into gantry-cycles.yaml with its earlier values, and a copy of
 * the figure into status.yaml.
 * @param {{ status: string, desk: string }} files
 * @returns {{ status: string, desk: string, hunks: object[], deskHunks: object[] }}
 * @throws {Conflict} when the change no longer fits status.yaml.
 */
export function applyBoth(files, change) {
  const s = applyChange(files.status, change, { deskKeys: parseDesk(files.desk).map((e) => e.key) });
  const d = applyDeskChange(files.desk, change, files.status);
  // the velocity with this change's steps in it, and its values at the earlier steps of the past 96 hours, at the top of
  // gantry-cycles.yaml (applyDeskChange writes the entries alone, so it's put back), and its copy near the top of status.yaml
  const entries = parseDesk(d.text);
  const v = velocity(entries);
  const desk = setDeskVelocity(d.text, v, velocityHistory(entries)).text;
  const status = setVelocity(s.text, v);
  // the review's hunks from the files before and after, so a line rewritten the same isn't shown as changed
  return { status: status.text, desk, hunks: diff(files.status, status.text), deskHunks: diff(files.desk, desk) };
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

/**
 * The steps a change reports that fall inside an irregular shutdown, for the review to warn about: a step reported during one is
 * counted at its start (lib/velocity.js's countedAt), which is wrong if work had resumed, or if the shutdown is still open and
 * should have been closed first. Only steps the change adds or changes are looked at, and one at the very start of a shutdown is
 * fine: it's already counted there.
 * @param {string} deskBefore gantry-cycles.yaml as it is.
 * @param {string} deskAfter gantry-cycles.yaml with the change in it.
 * @returns {{ key: string, stage: string, shutdown: object }[]} `shutdown` as lib/shutdowns.js reads it.
 */
export function shutdownsHit(deskBefore, deskAfter) {
  const was = new Map(parseDesk(deskBefore).map((e) => [e.key, e.stage]));
  const after = parseDesk(deskAfter);
  const hits = [];
  for (const e of after) {
    if (!e.stage || was.get(e.key) === e.stage) continue;
    const t = parseKey(e.key).getTime();
    for (const shutdown of after.shutdowns)
      if (shutdown.errors.length === 0 && shutdown.startMs < t && t < shutdown.endMs)
        hits.push({ key: e.key, stage: e.stage, shutdown });
  }
  return hits;
}
