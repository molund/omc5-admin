// A change is one edit to status.yaml, and one commit. The desk keeps a list of them on top of its copy of the file, and the
// push session applies the same list, with this same code (tools/apply-changes.mjs), to whatever is on main by then, so
// anything committed in the meantime is kept.
//
//   { id, kind: "move",          time, span, complete, noteToSelf? }
//   { id, kind: "update",        time, span, complete, title, blocks, retitle: [{ key, title, slug }] }
//   { id, kind: "followup",      noteKey, time, blocks, gantry: { span, complete } | null }
//   { id, kind: "followup-edit", noteKey, fuKey, time, blocks }
//   { id, kind: "blog",          date, title, blocks }
//
// update, blog and follow-up changes can carry  memo: { noteKey, text }  the note to self of one entry: the new note, or the
// parent of a follow-up. One per entry; "" removes it.
//
// A position has no entry of its own. With a noteToSelf it makes one: a note at the position's time stamp with no title and
// no summary, only the note to self. The site shows only notes that have a summary (Trackside, the card, giscus and the
// sitemap all go by status.history and status.latest), so it appears nowhere, as with the workflow's `note: "-"`.
//
// blocks: [{ type: "summary", text }, { type: "text", text }, { type: "photo", file, caption, photoId }, …], the summary
// always first.

import { parseStatus, headerOf } from "./statusFile.js";
import { compareKeys, clock, shortDate, longDate } from "./time.js";

const DATE_TITLE = /^Clayton Clipper construction update for /;
/** "Nov. 4", for commit messages */
const monthDay = (key) => longDate(key).replace(/^\w+, /, "").replace(/, \d{4}$/, "");
/** How a commit message names a note. */
const nameOf = (key, title) =>
  !title ? `the ${monthDay(key)} update` : DATE_TITLE.test(title) ? `the ${monthDay(key)} construction update` : `"${title}"`;

export class Conflict extends Error {}

/** One line of text as a double-quoted YAML scalar (the file's style), on one line. */
const q = (s) => JSON.stringify(String(s).replace(/\s+/g, " ").trim());

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
        out.push(
          `${sp(n + 2)}- photo:`,
          `${sp(n + 6)}file: ${b.file}`,
          `${sp(n + 6)}caption: ${q(b.caption)}`,
        );
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
    const h = header[k];
    if (!h) throw new Conflict(`status.yaml has no "${k}:" line.`);
    const line = `${k}: ${v}`;
    if (doc.lines[h.line] !== line) doc.replace(h.line, 1, [line]);
  }
}

/** Sets, changes or removes an entry's note to self: one line, right under its key line. */
function setMemo(doc, noteKey, text) {
  const note = findNote(doc.parsed, noteKey);
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const line = `    note-to-self: ${q(clean)}`;
  if (note.memoLine >= 0) {
    if (!clean) doc.replace(note.memoLine, 1, []);
    else if (doc.lines[note.memoLine] !== line) doc.replace(note.memoLine, 1, [line]);
  } else if (clean) doc.replace(note.start + 1, 0, [line]);
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
  const at = next ? next.start : (parsed.notes.length ? parsed.notes[parsed.notes.length - 1].end : parsed.notesLine) + 1;
  doc.replace(at, 0, lines);
}

const later = (a, b) => (!b || compareKeys(a, b) >= 0 ? a : b);

/**
 * Applies one change to the file's text.
 * @returns {{ text: string, hunks: object[] }}
 * @throws {Conflict} when the change no longer fits the file.
 */
export function applyChange(text, change) {
  const doc = new Doc(text);
  const head = headerOf(doc.parsed);
  switch (change.kind) {
    case "move":
      setHeader(doc, { updated: change.time, span: change.span, complete: change.complete });
      if (change.noteToSelf?.trim())
        insertNote(doc, change.time, [`  - ${change.time}: ""`, `    note-to-self: ${q(change.noteToSelf)}`]);
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
    default:
      throw new Conflict(`Unknown change "${change.kind}".`);
  }
  if (change.memo) setMemo(doc, change.memo.noteKey, change.memo.text);
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
      const memo = change.noteToSelf?.trim() ? " and add a note to self" : "";
      if (change.span !== head.span) return `Move the Clayton Clipper to span ${change.span}${memo}`;
      if (change.complete && !head.complete) return `Mark span ${change.span} as complete${memo}`;
      if (!change.complete && head.complete) return `Mark span ${change.span} as not complete${memo}`;
      return `Update the progress time to ${clock(change.time)} on ${shortDate(change.time)}${memo}`;
    }
    case "update":
      return DATE_TITLE.test(change.title) ? `Add ${nameOf(change.time, change.title)}` : `Add the update "${change.title}"`;
    case "blog":
      return `Add the blog post "${change.title}"`;
    case "followup":
      return `Add a follow-up to ${named}`;
    case "followup-edit":
      return `Edit the ${clock(change.fuKey)} follow-up to ${named}`;
    default:
      return "Update status.yaml";
  }
}
