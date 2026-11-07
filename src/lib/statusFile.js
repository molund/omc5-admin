// Reads status.yaml the way the site does (src/lib/status.js in molund/omc5), but also keeps the line range of every note
// and follow-up, so a change can be spliced into the file without rewriting it: the long comment at the top, and anything
// edited by hand, stay exactly as they are.
//
//   updated: 2026-11-03T20:30-07:00            header lines, at the start of a line
//   span: 37
//   hung: true                                  (complete: before Nov. 6, 2026; still read and written)
//   notes:
//     - 2026-11-03T07:15-07:00: "Title"        a note, two spaces in, its fields four spaces in
//       summary: "…"
//       post: true
//       slug: words
//       note-to-self: "…"                        only in the repo: the site's reader ignores it
//       photo:
//         file: x.jpg
//         caption: "…"
//       block:
//         - "A paragraph"
//         - photo:
//             file: y.jpg
//             caption: "…"
//       follow-up:
//         - 2026-11-03T13:30-07:00:            a follow-up, six spaces in, its fields ten spaces in
//             summary: "…"

import { parseKey, compareKeys } from "./time.js";

/** A YAML scalar without its quotes, as the site reads it. */
export function unquote(v) {
  if (/^".*"$/.test(v)) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/**
 * A note's or follow-up's own fields, from its lines.
 * @param {string[]} lines The lines under its key line.
 * @param {number} indent How far in its fields are (4 for a note, 10 for a follow-up).
 */
function parseFields(lines, indent) {
  const out = { summary: "", post: false, slug: "", memo: "", photo: null, block: [] };
  const at = (n) => new RegExp(`^ {${n}}(\\S.*)$`);
  let mode = null, // "photo" | "block"
    photo = null;
  for (const line of lines) {
    const own = line.match(at(indent));
    if (own) {
      const kv = own[1].match(/^([A-Za-z-]+):\s*(.*?)\s*$/);
      photo = null;
      mode = null;
      if (!kv) continue;
      const [, k, v] = kv;
      if (k === "summary") out.summary = unquote(v);
      else if (k === "post") out.post = v === "true";
      else if (k === "slug") out.slug = unquote(v);
      else if (k === "note-to-self") out.memo = unquote(v);
      else if (k === "photo") {
        mode = "photo";
        photo = out.photo = { file: "", caption: "" };
      } else if (k === "block") mode = "block";
      else if (k === "follow-up") mode = "skip";
      continue;
    }
    if (mode === "skip") continue;
    if (mode === "block") {
      const item = line.match(/^ +-\s+(.*?)\s*$/);
      if (item) {
        if (/^photo:$/.test(item[1])) {
          photo = { file: "", caption: "" };
          out.block.push({ photo });
        } else {
          photo = null;
          out.block.push({ text: unquote(item[1]) });
        }
        continue;
      }
    }
    const pf = photo && line.match(/^\s+(file|caption):\s*(.*?)\s*$/);
    if (pf) photo[pf[1]] = unquote(pf[2]);
  }
  return out;
}

/**
 * The file, read.
 * @param {string} text
 * @returns {{ lines: string[], header: Record<string, {line:number, end:number, value:string, list?:{key:string,
 *   value:string, line:number}[]}>, notesLine: number, notes: Note[] }} A header key with a "- time: value" list under it
 *   (the velocity's earlier values) has it as `list`, each item with any keys under it too (`span`, `stage`), and `end` is
 *   its last line.
 *
 * @typedef {object} FollowUp
 * @property {string} key Its time stamp, as written.
 * @property {number} start Its key line.
 * @property {number} end Its last line.
 * @property {object} fields summary, photo and block.
 *
 * @typedef {object} Note
 * @property {string} key Its time stamp (or date), as written.
 * @property {string} title
 * @property {number} start Its key line.
 * @property {number} end Its last non-blank line.
 * @property {number} fuLine Its `follow-up:` line, or -1.
 * @property {object} fields summary, post, slug, photo and block.
 * @property {FollowUp[]} followUps In file order.
 */
export function parseStatus(text) {
  const lines = text.split("\n");
  const header = {};
  const notes = [];
  let notesLine = -1,
    note = null,
    body = null,
    inFU = false,
    fu = null;
  // the key above `notes:` whose "- time: value" list the lines below are (the velocity's earlier values)
  let listOf = null;
  lines.forEach((line, i) => {
    let m;
    if ((m = line.match(/^([A-Za-z][A-Za-z_-]*):\s*(.*?)\s*$/))) {
      if (!(m[1] in header)) header[m[1]] = { line: i, end: i, value: unquote(m[2]) };
      listOf = notesLine < 0 && header[m[1]].line === i ? header[m[1]] : null;
      if (m[1] === "notes") notesLine = i;
      note = null;
      return;
    }
    if (notesLine < 0 && listOf && (m = line.match(/^ {2}-\s+(\S+):\s*(.*?)\s*$/))) {
      (listOf.list ??= []).push({ key: m[1], value: unquote(m[2]), line: i });
      listOf.end = i;
      return;
    }
    // an item's own keys under it, four spaces in: `span:` and `stage:`
    if (notesLine < 0 && listOf?.list && (m = line.match(/^ {4}([A-Za-z][A-Za-z_-]*):\s*(.*?)\s*$/))) {
      listOf.list.at(-1)[m[1]] = unquote(m[2]);
      listOf.end = i;
      return;
    }
    if (notesLine >= 0 && (m = line.match(/^ {2}-\s+(\S+):\s+(.*?)\s*$/))) {
      note = { key: m[1], title: unquote(m[2]), start: i, end: i, fuLine: -1, memoLine: -1, body: [], followUps: [] };
      notes.push(note);
      body = note.body;
      inFU = false;
      fu = null;
      return;
    }
    if (!note || line.trim() === "" || /^\s*#/.test(line)) return;
    note.end = i;
    if (/^ {4}note-to-self:/.test(line)) note.memoLine = i;
    if (/^ {4}follow-up:\s*$/.test(line)) {
      inFU = true;
      note.fuLine = i;
      fu = null;
      body.push(line);
      return;
    }
    if (/^ {4}\S/.test(line)) {
      inFU = false;
      fu = null;
    }
    if (inFU && (m = line.match(/^ {6}-\s+(\d{4}-\d\d-\d\d\S*):\s*$/))) {
      fu = { key: m[1], start: i, end: i, body: [] };
      note.followUps.push(fu);
      return;
    }
    if (fu) {
      fu.end = i;
      fu.body.push(line);
    } else body.push(line);
  });
  for (const n of notes) {
    n.fields = parseFields(n.body, 4);
    for (const f of n.followUps) f.fields = parseFields(f.body, 10);
    // the follow-up list ends with its last item
    n.fuEnd = n.followUps.length ? n.followUps[n.followUps.length - 1].end : n.fuLine;
  }
  return { lines, header, notesLine, notes };
}

/** The notes, newest first (by time stamp, whatever order the file has them in). */
export const newestFirst = (notes) => [...notes].sort((a, b) => compareKeys(b.key, a.key));

/** A note's follow-ups, newest first. */
export const followUpsNewestFirst = (note) => [...note.followUps].sort((a, b) => compareKeys(b.key, a.key));

/** The header values the desk edits. */
export function headerOf(parsed) {
  const h = parsed.header;
  return {
    updated: h.updated?.value ?? "",
    span: h.span ? +h.span.value : null,
    // `hung:` (or `complete:`, its old name): whether all the span's segments are hung
    complete: (h.hung ?? h.complete)?.value === "true",
  };
}

/** Whether a key is a valid time stamp. */
export const validKey = (key) => !isNaN(parseKey(key));
