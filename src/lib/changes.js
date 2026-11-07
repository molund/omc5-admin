// A change is one edit to status.yaml (and desk.yaml, through lib/deskChanges.js), and one commit. The desk keeps a list of
// them on top of its copy of the files, and the push applies the same list, with this same code (tools/apply-changes.mjs
// and services/github.js), to whatever is on main by then, so anything committed in the meantime is kept.
//
//   { id, kind: "move",          time, span, complete, noteToSelf?, stage }
//   { id, kind: "update",        time, span, complete, title, blocks, retitle? }
//       retitle: [{ key, title, slug }] is only on older waiting changes: the desk no longer asks to retitle another update
//   { id, kind: "followup",      noteKey, time, blocks, gantry: { span, complete } | null }
//   { id, kind: "followup-edit", noteKey, fuKey, time, blocks }
//   { id, kind: "blog",          date, title, blocks }
//   { id, kind: "note-edit",     noteKey, title, blocks }   the note's own text; its time stamp is locked (comments follow it)
//   { id, kind: "note-delete",   noteKey }                  the note and its follow-ups
//   { id, kind: "followup-delete", noteKey, fuKey }
//   { id, kind: "desk-edit",     key, stage, noteToSelf }   a record in desk.yaml with no post: only desk.yaml changes
//   { id, kind: "desk-delete",   key }                      the same, gone; the gantry's span and hung stay
//
// update, blog and follow-up changes can carry  memo: { noteKey, text }  the note to self of one entry: the new note, or the
// parent of a follow-up. One per entry; "" removes it. Notes to self and the stage are written to desk.yaml, not here.
//
// blocks: [{ type: "summary", text }, { type: "text", text }, { type: "photo", file, caption, photoId }, …], the summary
// always first.

import { cleanText } from "./cleanText.js";
import { parseStatus, headerOf } from "./statusFile.js";
import { compareKeys, clock, shortDate, longDate } from "./time.js";
import { slugsOf } from "./titles.js";
import { stageOf } from "./stages.js";

const DATE_TITLE = /^Clayton Clipper construction update for /;
/** "Nov. 4", for commit messages */
const monthDay = (key) =>
  longDate(key)
    .replace(/^\w+, /, "")
    .replace(/, \d{4}$/, "");
/** How a commit message names a note. */
const nameOf = (key, title) =>
  !title
    ? `the ${monthDay(key)} update`
    : DATE_TITLE.test(title)
      ? `the ${monthDay(key)} construction update`
      : `"${title}"`;

export class Conflict extends Error {}

/** One line of text as a double-quoted YAML scalar (the file's style), on one line. */
const q = (s) => JSON.stringify(cleanText(s).replace(/\s+/g, " ").trim());

/** The blocks that will be written: no empty paragraphs, no photo without a file. */
export function cleanBlocks(blocks) {
  return blocks.filter((b) => (b.type === "photo" ? b.file : b.type === "summary" || b.text.trim()));
}

/**
 * A note's or follow-up's fields as lines. A photo right after the summary is its `photo:`; everything after that goes
 * under `block:`.
 * @param {object[]} blocks
 * @param {number} n How far in the fields go (4 for a note, 10 for a follow-up).
 * @param {string[]} [extra] Lines that go straight after the summary (`post: true`).
 */
function fieldLines(blocks, n, extra = []) {
  const sp = (k) => " ".repeat(k);
  const [summary, ...rest] = cleanBlocks(blocks);
  const out = [`${sp(n)}summary: ${q(summary?.text ?? "")}`, ...extra];
  let i = 0;
  if (rest[0]?.type === "photo") {
    out.push(`${sp(n)}photo:`, `${sp(n + 2)}file: ${rest[0].file}`, `${sp(n + 2)}caption: ${q(rest[0].caption)}`);
    i = 1;
  }
  if (i < rest.length) {
    out.push(`${sp(n)}block:`);
    for (const b of rest.slice(i)) {
      if (b.type === "photo")
        out.push(`${sp(n + 2)}- photo:`, `${sp(n + 6)}file: ${b.file}`, `${sp(n + 6)}caption: ${q(b.caption)}`);
      else out.push(`${sp(n + 2)}- ${q(b.text)}`);
    }
  }
  return out;
}

export const noteLines = (key, title, blocks, post = false) => [
  `  - ${key}: ${q(title)}`,
  ...fieldLines(blocks, 4, post ? ["    post: true"] : []),
];

export const followUpLines = (key, blocks) => [`      - ${key}:`, ...fieldLines(blocks, 10)];

/** The lines of a file, with a record of what was changed, for the review. */
class Doc {
  constructor(text) {
    this.lines = text.split("\n");
    this.hunks = [];
  }
  get parsed() {
    return parseStatus(this.lines.join("\n"));
  }
  replace(start, count, added) {
    const before = this.lines[start - 1] ?? null;
    const removed = this.lines.splice(start, count, ...added);
    this.hunks.push({ start, before, removed, added });
  }
  get text() {
    return this.lines.join("\n");
  }
}

function setHeader(doc, values) {
  const { header } = doc.parsed;
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    // the change's `complete` is the file's `hung:` line (`complete:` in a file from before Nov. 6, 2026)
    const name = k === "complete" && !header.complete ? "hung" : k;
    const h = header[name];
    if (!h) throw new Conflict(`status.yaml has no "${name}:" line.`);
    const line = `${name}: ${v}`;
    if (doc.lines[h.line] !== line) doc.replace(h.line, 1, [line]);
  }
}

const VELOCITY_COMMENT = [
  "# the Clayton Clipper's velocity, written by the Status Desk on every push from desk.yaml: working days per span and",
  "# spans per week, from how far the gantry got in the week up to the latest step reported (the weekly shutdown allowed",
  "# for), each with its value before it last changed (-previous)",
];
// the comments as they were written before, replaced by the one above where they're found: before the velocity was taken
// over a week, and while its keys had underscores (both Nov. 7, 2026)
const OLD_VELOCITY_COMMENTS = [
  [
    "# the Clayton Clipper's velocity, written by the Status Desk on every push from desk.yaml: working days per span over the",
    "# last three spans, and spans per week once the weekly shutdown is allowed for",
  ],
  [...VELOCITY_COMMENT.slice(0, 2), "# for), each with its value before it last changed (_previous)"],
];
// the keys, with the names they had before Nov. 7, 2026, renamed where they're found
const VELOCITY_KEYS = {
  "days-per-span": "days_per_span",
  "days-per-span-previous": "days_per_span_previous",
  "spans-per-week": "spans_per_week",
  "spans-per-week-previous": "spans_per_week_previous",
};

/**
 * Writes the velocity's two figures into the file's header, after `hung:`, or updates them where they already are. A
 * figure that changes keeps the one before it, in `days-per-span-previous` or `spans-per-week-previous` on the line after
 * it; one that doesn't change leaves that as it is. Keys still named the old way (with underscores) are renamed.
 * @param {string} text
 * @param {{ days: number|null, spansPerWeek?: number }|null} v From lib/velocity.js; with no days the file is left as it is.
 * @returns {{ text: string, hunks: object[] }}
 */
export function setVelocity(text, v) {
  const doc = new Doc(text);
  if (v?.days == null) return { text, hunks: [] };
  for (const [key, old] of Object.entries(VELOCITY_KEYS)) {
    const h = doc.parsed.header[old];
    if (h && !doc.parsed.header[key]) doc.replace(h.line, 1, [`${key}: ${h.value}`]);
  }
  const values = { "days-per-span": v.days.toFixed(2), "spans-per-week": v.spansPerWeek.toFixed(2) };
  const { header } = doc.parsed;
  if (header["days-per-span"] && header["spans-per-week"]) {
    for (const [k, value] of Object.entries(values)) {
      const was = doc.parsed.header[k];
      if (was.value === value) continue;
      doc.replace(was.line, 1, [`${k}: ${value}`]);
      const prev = doc.parsed.header[`${k}-previous`];
      if (prev) doc.replace(prev.line, 1, [`${k}-previous: ${was.value}`]);
      else doc.replace(was.line + 1, 0, [`${k}-previous: ${was.value}`]);
    }
    const first = Math.min(doc.parsed.header["days-per-span"].line, doc.parsed.header["spans-per-week"].line);
    for (const old of OLD_VELOCITY_COMMENTS) {
      const at = first - old.length;
      if (old.every((l, i) => doc.lines[at + i] === l)) {
        doc.replace(at, old.length, VELOCITY_COMMENT);
        break;
      }
    }
    return { text: doc.text, hunks: doc.hunks };
  }
  const after = header.hung ?? header.complete;
  if (!after) throw new Conflict(`status.yaml has no "hung:" line.`);
  doc.replace(after.line + 1, 0, [
    ...VELOCITY_COMMENT,
    ...Object.entries(values).map(([k, value]) => `${k}: ${value}`),
  ]);
  return { text: doc.text, hunks: doc.hunks };
}

function findNote(parsed, key) {
  const note = parsed.notes.find((n) => n.key === key);
  if (!note) throw new Conflict(`The note from ${shortDate(key)} isn't in status.yaml any more.`);
  return note;
}

function insertNote(doc, key, lines) {
  const parsed = doc.parsed;
  if (parsed.notesLine < 0) throw new Conflict('status.yaml has no "notes:" line.');
  if (parsed.notes.some((n) => n.key === key)) throw new Conflict(`status.yaml already has a note at ${key}.`);
  // newest first: before the first note that is older
  const next = parsed.notes.find((n) => compareKeys(n.key, key) < 0);
  const at = next
    ? next.start
    : (parsed.notes.length ? parsed.notes[parsed.notes.length - 1].end : parsed.notesLine) + 1;
  doc.replace(at, 0, lines);
}

const later = (a, b) => (!b || compareKeys(a, b) >= 0 ? a : b);

/** A note's own part (up to `follow-up:`) with new text. Its `slug:`, `post:`, any `note-to-self:` and comments stay. */
function editNote(doc, note, title, blocks) {
  let last = note.fuLine >= 0 ? note.fuLine - 1 : note.end;
  while (last > note.start && doc.lines[last].trim() === "") last--;
  const own = doc.lines.slice(note.start + 1, last + 1);
  const kept = (l) => /^ {4}(slug|post|note-to-self):/.test(l) || /^\s*#/.test(l);
  const at = own.findIndex((l) => /^ {4}summary:/.test(l));
  const [summary, ...rest] = fieldLines(blocks, 4);
  const lines = [
    title === note.title ? doc.lines[note.start] : `  - ${note.key}: ${q(title)}`,
    ...own.filter((l, i) => kept(l) && i < at),
    summary,
    ...own.filter((l, i) => kept(l) && i > at),
    ...rest,
  ];
  const count = last - note.start + 1;
  if (lines.join("\n") !== doc.lines.slice(note.start, last + 1).join("\n")) doc.replace(note.start, count, lines);
}

/** Takes lines out, and the blank lines after them, so the file never has two blank lines in a row. */
function removeLines(doc, start, end) {
  while (doc.lines[end + 1] === "" && end + 2 < doc.lines.length) end++;
  doc.replace(start, end - start + 1, []);
}

/** The site works out addresses from titles, so an edit or delete can shift them: any that moved gets its old one back. */
function keepAddresses(doc, before) {
  for (let i = 0; i < before.size; i++) {
    const notes = doc.parsed.notes;
    const after = slugsOf(notes);
    const moved = notes.find((n) => !n.fields.slug && before.has(n.key) && after.get(n.key) !== before.get(n.key));
    if (!moved) return;
    doc.replace(moved.start + 1, 0, [`    slug: ${before.get(moved.key)}`]);
  }
}

/**
 * When what the card showed is gone, `updated` goes back to the newest time left: a status update, a follow-up or a
 * record in desk.yaml (a position). Blog posts never set it. With nothing left, it stays. Span and hung don't change.
 */
function fallBack(doc, removed, updated, deskKeys) {
  if (!removed.includes(updated)) return;
  const { notes } = doc.parsed;
  const left = [
    ...notes.filter((n) => !n.fields.post).map((n) => n.key),
    ...notes.flatMap((n) => n.followUps.map((f) => f.key)),
    ...deskKeys,
  ].filter((k) => k.includes("T") && !removed.includes(k));
  const newest = left.reduce((a, b) => (a && compareKeys(a, b) >= 0 ? a : b), null);
  if (newest) setHeader(doc, { updated: newest });
}

/**
 * Applies one change to the file's text.
 * @param {string} text
 * @param {object} change
 * @param {{ deskKeys?: string[] }} [context] desk.yaml's time stamps, for where `updated` goes back to after a delete.
 * @returns {{ text: string, hunks: object[] }}
 * @throws {Conflict} when the change no longer fits the file.
 */
export function applyChange(text, change, { deskKeys = [] } = {}) {
  const doc = new Doc(text);
  const head = headerOf(doc.parsed);
  switch (change.kind) {
    case "move":
      setHeader(doc, { updated: change.time, span: change.span, complete: change.complete });
      break;
    case "update": {
      setHeader(doc, { updated: change.time, span: change.span, complete: change.complete });
      for (const r of change.retitle ?? []) {
        const note = findNote(doc.parsed, r.key);
        const lines = [`  - ${note.key}: ${q(r.title)}`];
        // keep its address: its current slug, unless it already has one
        if (!note.fields.slug && r.slug) lines.push(`    slug: ${r.slug}`);
        doc.replace(note.start, 1, lines);
      }
      insertNote(doc, change.time, noteLines(change.time, change.title, change.blocks));
      break;
    }
    case "blog":
      insertNote(doc, change.date, noteLines(change.date, change.title, change.blocks, true));
      break;
    case "followup": {
      if (change.gantry) setHeader(doc, { span: change.gantry.span, complete: change.gantry.complete });
      // the newest word moves the card's time stamp; a back-dated follow-up doesn't
      setHeader(doc, { updated: later(change.time, head.updated) });
      const note = findNote(doc.parsed, change.noteKey);
      if (note.followUps.some((f) => f.key === change.time))
        throw new Conflict(`That note already has a follow-up at ${clock(change.time)}.`);
      const lines = followUpLines(change.time, change.blocks);
      if (note.fuLine >= 0) doc.replace(note.fuEnd + 1, 0, lines);
      else doc.replace(note.end + 1, 0, ["    follow-up:", ...lines]);
      break;
    }
    case "followup-edit": {
      const note = findNote(doc.parsed, change.noteKey);
      const fu = note.followUps.find((f) => f.key === change.fuKey);
      if (!fu) throw new Conflict(`The ${clock(change.fuKey)} follow-up isn't in status.yaml any more.`);
      if (change.time !== change.fuKey && note.followUps.some((f) => f.key === change.time))
        throw new Conflict(`That note already has a follow-up at ${clock(change.time)}.`);
      doc.replace(fu.start, fu.end - fu.start + 1, followUpLines(change.time, change.blocks));
      // it was the card's newest word: the card follows its new time
      if (change.fuKey === head.updated && change.time !== change.fuKey) setHeader(doc, { updated: change.time });
      break;
    }
    case "note-edit": {
      const addresses = slugsOf(doc.parsed.notes);
      editNote(doc, findNote(doc.parsed, change.noteKey), change.title, change.blocks);
      keepAddresses(doc, addresses);
      break;
    }
    case "note-delete": {
      const addresses = slugsOf(doc.parsed.notes);
      const note = findNote(doc.parsed, change.noteKey);
      removeLines(doc, note.start, note.end);
      addresses.delete(note.key);
      keepAddresses(doc, addresses);
      fallBack(doc, [note.key, ...note.followUps.map((f) => f.key)], head.updated, deskKeys);
      break;
    }
    case "followup-delete": {
      const note = findNote(doc.parsed, change.noteKey);
      const fu = note.followUps.find((f) => f.key === change.fuKey);
      if (!fu) throw new Conflict(`The ${clock(change.fuKey)} follow-up isn't in status.yaml any more.`);
      // the last one takes the list's `follow-up:` line with it
      removeLines(doc, note.followUps.length === 1 ? note.fuLine : fu.start, fu.end);
      fallBack(doc, [fu.key], head.updated, deskKeys);
      break;
    }
    case "desk-edit":
      break;
    case "desk-delete":
      fallBack(doc, [change.key], head.updated, deskKeys);
      break;
    default:
      throw new Conflict(`Unknown change "${change.kind}".`);
  }
  return { text: doc.text, hunks: doc.hunks };
}

/**
 * Applies a list of changes in order, skipping (and reporting) any that no longer fit.
 * @returns {{ text: string, results: Map<string, { ok: boolean, error?: string, hunks?: object[] }> }}
 */
export function applyAll(text, changes) {
  const results = new Map();
  for (const c of changes) {
    try {
      const r = applyChange(text, c);
      text = r.text;
      results.set(c.id, { ok: true, hunks: r.hunks });
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      results.set(c.id, { ok: false, error: e.message });
    }
  }
  return { text, results };
}

/** The photos a change adds: [{ file, caption, photoId, asset }]. */
export const photosOf = (change) => (change.blocks ?? []).filter((b) => b.type === "photo" && b.file);

/** A suggested commit message, in the repo's style (a plain summary of what changed on the site). */
export function commitMessage(change, before) {
  const head = before ? headerOf(parseStatus(before)) : {};
  const note = before && change.noteKey ? parseStatus(before).notes.find((n) => n.key === change.noteKey) : null;
  const named = note ? nameOf(note.key, note.title) : "";
  switch (change.kind) {
    case "move": {
      // the stage the move itself implies (arrived at a new span, hung when marked so) isn't worth saying
      const implied = change.span !== head.span ? "arrived at span" : change.complete && !head.complete ? "hung" : null;
      const stage = stageOf(change);
      const logged = stage && stage !== implied ? ` and log ${stage}` : "";
      const memo = logged + (change.noteToSelf?.trim() ? " and add a note to self" : "");
      if (change.span !== head.span) return `Move the Clayton Clipper to span ${change.span}${memo}`;
      if (change.complete && !head.complete) return `Mark span ${change.span} as hung${memo}`;
      if (!change.complete && head.complete) return `Mark span ${change.span} as not hung${memo}`;
      return `Update the progress time to ${clock(change.time)} on ${shortDate(change.time)}${memo}`;
    }
    case "update":
      return DATE_TITLE.test(change.title)
        ? `Add ${nameOf(change.time, change.title)}`
        : `Add the update "${change.title}"`;
    case "blog":
      return `Add the blog post "${change.title}"`;
    case "followup":
      return `Add a follow-up to ${named}`;
    case "followup-edit":
      return `Edit the ${clock(change.fuKey)} follow-up to ${named}`;
    case "note-edit":
      return `Edit ${named}`;
    case "note-delete":
      return `Delete ${named}`;
    case "followup-delete":
      return `Delete the ${clock(change.fuKey)} follow-up to ${named}`;
    case "desk-edit":
      return `Edit the ${clock(change.key)} position record from ${monthDay(change.key)}`;
    case "desk-delete":
      return `Delete the ${clock(change.key)} position record from ${monthDay(change.key)}`;
    default:
      return "Update status.yaml";
  }
}
