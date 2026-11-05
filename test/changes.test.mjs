// Applies each kind of change to a copy of the real status.yaml and reads the result back with the site's own reader
// (src/lib/status.js, copied into fixtures/), so a change the desk writes is one the site understands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import prettier from "prettier";
import { applyChange, applyAll, commitMessage } from "../src/lib/changes.js";
import { parseStatus, newestFirst, headerOf } from "../src/lib/statusFile.js";
import { slugsOf, titleAdvice, dateTitle, headlineFrom } from "../src/lib/titles.js";
import { cardFor } from "../src/lib/card.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const BASE = readFileSync(here("./fixtures/status.yaml"), "utf8");

// the site's reader, built for node: status.yaml?raw reads globalThis.__STATUS
mkdirSync(here("./.out"), { recursive: true });
await build({
  entryPoints: [here("./fixtures/site-status.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: here("./.out/site-status.mjs"),
  define: { "import.meta.env.BASE_URL": '"/"' },
  plugins: [
    {
      name: "raw",
      setup(b) {
        b.onResolve({ filter: /\?raw$/ }, () => ({ path: "status", namespace: "raw" }));
        b.onLoad({ filter: /.*/, namespace: "raw" }, () => ({ contents: "export default globalThis.__STATUS;" }));
      },
    },
  ],
  logLevel: "silent",
});
let n = 0;
async function site(text) {
  globalThis.__STATUS = text;
  return (await import(`./.out/site-status.mjs?${n++}`)).status;
}

/** A note's or follow-up's fields as the desk's blocks, as the editors load them. */
function blocksOf(fields) {
  const out = [{ type: "summary", text: fields.summary }];
  if (fields.photo?.file) out.push({ type: "photo", file: fields.photo.file, caption: fields.photo.caption });
  for (const b of fields.block)
    out.push(
      b.photo ? { type: "photo", file: b.photo.file, caption: b.photo.caption } : { type: "text", text: b.text },
    );
  return out;
}

const T = "2026-11-04T16:30-07:00";
const blocks = [
  { type: "summary", text: "The Clayton Clipper has started lifting segments for span 38." },
  { type: "photo", file: "2026-11-04-span-38.jpg", caption: "The first segment going up." },
  { type: "text", text: "Another paragraph,\nwith a line break." },
  { type: "text", text: "   " },
  { type: "photo", file: "2026-11-04-span-38-close.jpg", caption: 'A "close" look' },
];

test("the desk reads every note the site does", async () => {
  const s = await site(BASE);
  const p = parseStatus(BASE);
  assert.equal(p.notes.length, s.history.length);
  assert.deepEqual(
    newestFirst(p.notes).map((x) => x.fields.summary),
    s.history.map((h) => h.summary),
  );
  // slugs match the site's
  const slugs = slugsOf(p.notes);
  for (const h of s.history) {
    const key = p.notes.find((x) => new Date(x.key.length === 10 ? `${x.key}T00:00-07:00` : x.key) - h.time === 0).key;
    assert.equal(slugs.get(key), h.slug);
  }
  // follow-ups and their summaries
  const nov2 = p.notes.find((x) => x.key === "2026-11-02T09:15-07:00");
  assert.equal(nov2.followUps.length, 2);
  assert.match(nov2.followUps[0].fields.block[0].text, /^Two precast concrete girders/);
});

test("move changes only the three header lines", async () => {
  const { text, hunks } = applyChange(BASE, {
    kind: "move",
    time: "2026-11-04T11:15-07:00",
    span: 38,
    complete: false,
  });
  assert.equal(hunks.length, 3);
  assert.equal(text.split("\n").length, BASE.split("\n").length);
  const s = await site(text);
  assert.equal(s.span, 38);
  assert.equal(s.complete, false);
  assert.equal(+s.updated, +new Date("2026-11-04T11:15-07:00"));
  const card = cardFor(text);
  assert.equal(card.text, "");
  assert.equal(card.button, "trackside");
  assert.equal(
    commitMessage({ kind: "move", span: 38, complete: false, time: T }, BASE),
    "Move the Clayton Clipper to span 38",
  );
});

test("update adds a note the site reads, with its photo and blocks", async () => {
  const change = { kind: "update", time: T, span: 38, complete: false, title: dateTitle(T), blocks };
  const { text } = applyChange(BASE, change);
  const s = await site(text);
  assert.equal(s.latest.title, "Clayton Clipper construction update for Wednesday, Nov. 4, 2026");
  assert.equal(s.latest.slug, "construction-update-for-wednesday-nov-4-2026");
  assert.equal(s.note, blocks[0].text);
  assert.equal(s.photo.src, "/images/sorry-im-a-shitty-photographer/2026-11-04-span-38.jpg");
  assert.equal(s.block.length, 2);
  assert.equal(s.block[0].text, "Another paragraph, with a line break.");
  assert.equal(s.block[1].photo.caption, 'A "close" look');
  assert.equal(+s.updated, +new Date(T));
  // it sits first in the list, under notes:
  const lines = text.split("\n");
  assert.equal(lines[lines.indexOf("notes:") + 1], `  - ${T}: "${dateTitle(T)}"`);
  const card = cardFor(text);
  assert.equal(card.text, blocks[0].text);
  assert.equal(card.button, "comments");
});

test("a second note on a day retitles the first and keeps its address", async () => {
  const first = { id: "a", kind: "update", time: T, span: 38, complete: false, title: dateTitle(T), blocks };
  const after = applyChange(BASE, first).text;
  const t2 = "2026-11-04T19:00-07:00";
  const advice = titleAdvice("update", t2, dateTitle(t2), parseStatus(after).notes);
  assert.equal(advice.needsHeadline, true);
  assert.equal(advice.retitle.length, 1);
  assert.ok(advice.problems.length);
  const oldSlug = slugsOf(parseStatus(after).notes).get(T);
  const second = {
    kind: "update",
    time: t2,
    span: 38,
    complete: true,
    title: "Clayton Clipper completes span 38",
    blocks: [{ type: "summary", text: "Span 38 is marked as complete." }],
    retitle: [{ key: T, title: "Clayton Clipper starts span 38", slug: oldSlug }],
  };
  const s = await site(applyChange(after, second).text);
  const firstNote = s.history.find((h) => +h.time === +new Date(T));
  assert.equal(firstNote.title, "Clayton Clipper starts span 38");
  assert.equal(firstNote.slug, oldSlug);
  assert.equal(s.latest.slug, "clipper-completes-span-38");
});

test("follow-ups: added to a note with a list, to one without, and edited", async () => {
  // the Nov. 3 note has two follow-ups
  const add = {
    kind: "followup",
    noteKey: "2026-11-03T07:15-07:00",
    time: "2026-11-03T22:00-07:00",
    blocks: blocks.slice(0, 3),
    gantry: null,
  };
  let s = await site(applyChange(BASE, add).text);
  assert.equal(s.followUps.length, 3);
  assert.equal(s.followUps[0].summary, blocks[0].text);
  assert.equal(s.followUps[0].photo.src.endsWith("2026-11-04-span-38.jpg"), true);
  assert.equal(+s.updated, +new Date("2026-11-03T22:00-07:00"));
  assert.equal(cardFor(applyChange(BASE, add).text).text, blocks[0].text);

  // a new update has none yet
  const withNote = applyChange(BASE, {
    kind: "update",
    time: T,
    span: 38,
    complete: false,
    title: dateTitle(T),
    blocks,
  }).text;
  const fu = {
    kind: "followup",
    noteKey: T,
    time: "2026-11-04T20:45-07:00",
    blocks: [{ type: "summary", text: "Five segments are hung for span 38." }],
    gantry: { span: 38, complete: false },
  };
  const withFu = applyChange(withNote, fu).text;
  s = await site(withFu);
  assert.equal(s.followUps.length, 1);
  assert.equal(s.followUps[0].summary, "Five segments are hung for span 38.");
  assert.equal(s.block.length, 2, "the note's own blocks are untouched");

  // edit it, moving its time: the card follows
  const edit = {
    kind: "followup-edit",
    noteKey: T,
    fuKey: "2026-11-04T20:45-07:00",
    time: "2026-11-04T21:00-07:00",
    blocks: [{ type: "summary", text: "Six segments are hung for span 38." }],
  };
  const edited = applyChange(withFu, edit).text;
  s = await site(edited);
  assert.equal(s.followUps.length, 1);
  assert.equal(s.followUps[0].summary, "Six segments are hung for span 38.");
  assert.equal(+s.updated, +new Date("2026-11-04T21:00-07:00"));
  assert.equal(commitMessage(edit, withFu), "Edit the 8:45 p.m. follow-up to the Nov. 4 construction update");
});

test("a blog post is dated, filed below the day's updates and leaves the card alone", async () => {
  const withNote = applyChange(BASE, {
    kind: "update",
    time: T,
    span: 38,
    complete: false,
    title: dateTitle(T),
    blocks,
  }).text;
  const blog = {
    kind: "blog",
    date: "2026-11-04",
    title: "How the Clayton Clipper moves between spans",
    blocks: blocks.slice(0, 2),
  };
  const { text } = applyChange(withNote, blog);
  const s = await site(text);
  const post = s.history.find((h) => h.post);
  assert.equal(post.title, blog.title);
  assert.equal(post.slug, "how-the-clipper-moves-between-spans");
  assert.equal(s.latest.title, dateTitle(T));
  assert.deepEqual(cardFor(text), cardFor(withNote));
  const keys = parseStatus(text).notes.map((x) => x.key);
  assert.deepEqual(keys.slice(0, 3), [T, "2026-11-04", "2026-11-03T07:15-07:00"]);
});

test("changes rebase onto a newer main and report what no longer fits", async () => {
  const changes = [
    { id: "1", kind: "move", time: "2026-11-04T11:15-07:00", span: 38, complete: false },
    {
      id: "2",
      kind: "followup",
      noteKey: "2026-11-03T07:15-07:00",
      time: "2026-11-04T12:00-07:00",
      blocks: [{ type: "summary", text: "Moved." }],
      gantry: null,
    },
    {
      id: "3",
      kind: "followup-edit",
      noteKey: "2026-11-03T07:15-07:00",
      fuKey: "2026-11-03T09:99-07:00",
      time: "2026-11-03T10:00-07:00",
      blocks: [{ type: "summary", text: "x" }],
    },
  ];
  // main gained a note in the meantime
  const main = applyChange(BASE, {
    kind: "blog",
    date: "2026-11-04",
    title: "Something new",
    blocks: [{ type: "summary", text: "New." }],
  }).text;
  const { text, results } = applyAll(main, changes);
  assert.equal(results.get("1").ok, true);
  assert.equal(results.get("2").ok, true);
  assert.equal(results.get("3").ok, false);
  const s = await site(text);
  assert.ok(s.history.some((h) => h.title === "Something new"));
  assert.equal(s.followUps.length, 3);
  writeFileSync(here("./.out/rebased.yaml"), text);
});

const noteEdit = (n) => ({
  kind: "note-edit",
  noteKey: n.key,
  title: n.title,
  blocks: blocksOf(n.fields),
});
const prettyYaml = (text) => prettier.check(text, { parser: "yaml", printWidth: 120 });

test("editing a note without changing it changes nothing, for every note", () => {
  for (const n of parseStatus(BASE).notes) {
    const r = applyChange(BASE, noteEdit(n));
    assert.deepEqual(r.hunks, [], n.key);
    assert.equal(r.text, BASE);
  }
});

test("editing a note changes its text and keeps its follow-ups, address and time stamp", async () => {
  const before = parseStatus(BASE);
  const n = before.notes.find((x) => x.followUps.length);
  const address = slugsOf(before.notes).get(n.key);
  const r = applyChange(BASE, {
    ...noteEdit(n),
    title: "A better headline",
    blocks: [{ type: "summary", text: "New words." }],
  });
  const after = parseStatus(r.text);
  const m = after.notes.find((x) => x.key === n.key);
  assert.equal(m.title, "A better headline");
  assert.equal(m.fields.summary, "New words.");
  assert.equal(m.fields.slug, address, "its address is pinned");
  assert.deepEqual(
    m.followUps.map((f) => f.fields),
    n.followUps.map((f) => f.fields),
  );
  assert.equal(slugsOf(after.notes).get(n.key), address);
  assert.equal(headerOf(after).updated, headerOf(before).updated);
  const s = await site(r.text);
  assert.ok(s.history.some((h) => h.summary === "New words."));
});

test("editing a blog post keeps it a post", () => {
  const n = parseStatus(BASE).notes.find((x) => x.fields.post);
  const r = applyChange(BASE, { ...noteEdit(n), blocks: [{ type: "summary", text: "Rewritten." }] });
  const m = parseStatus(r.text).notes.find((x) => x.key === n.key);
  assert.equal(m.fields.post, true);
  assert.equal(m.fields.summary, "Rewritten.");
});

test("deleting a note takes its follow-ups, and the file stays formatted and readable", async () => {
  const n = parseStatus(BASE).notes.find((x) => x.followUps.length);
  const r = applyChange(BASE, { kind: "note-delete", noteKey: n.key });
  const after = parseStatus(r.text);
  assert.ok(!after.notes.some((x) => x.key === n.key));
  assert.equal(after.notes.length, parseStatus(BASE).notes.length - 1);
  assert.ok(!n.followUps.some((f) => r.text.includes(`- ${f.key}:`)));
  assert.equal(await site(r.text).then((s) => s.history.length), after.notes.length);
  assert.equal(await prettyYaml(r.text), await prettyYaml(BASE), "as well formatted as the file it came from");
});

test("deleting every note, one at a time, keeps the file formatted", async () => {
  let text = BASE;
  for (const n of parseStatus(BASE).notes) {
    text = applyChange(text, { kind: "note-delete", noteKey: n.key }).text;
    assert.equal(await prettyYaml(text), await prettyYaml(BASE), n.key);
  }
  assert.equal(parseStatus(text).notes.length, 0);
});

test("deleting a post keeps the address of another post with the same title", () => {
  const post = (date) => ({
    kind: "blog",
    date,
    title: "Same words",
    blocks: [{ type: "summary", text: `Post on ${date}.` }],
  });
  const one = applyChange(BASE, post("2026-11-10")).text;
  const two = applyChange(one, post("2026-11-11")).text;
  assert.equal(slugsOf(parseStatus(two).notes).get("2026-11-11"), "same-words-2");
  const r = applyChange(two, { kind: "note-delete", noteKey: "2026-11-10" });
  assert.equal(slugsOf(parseStatus(r.text).notes).get("2026-11-11"), "same-words-2");
});

test("deleting what the card shows moves `updated` back, and leaves the span and complete", () => {
  const add = (text, time) =>
    applyChange(text, {
      kind: "update",
      time,
      span: 40,
      complete: true,
      title: `At ${time}`,
      blocks: [{ type: "summary", text: "Words." }],
    }).text;
  const T1 = "2026-11-20T09:00-07:00";
  const T2 = "2026-11-21T09:00-07:00";
  const T3 = "2026-11-20T15:00-07:00";
  const text = add(add(BASE, T1), T2);

  // to the newest note left
  let head = headerOf(parseStatus(applyChange(text, { kind: "note-delete", noteKey: T2 }).text));
  assert.deepEqual(head, { updated: T1, span: 40, complete: true });

  // to a follow-up, when that's newer
  const withFu = applyChange(text, {
    kind: "followup",
    noteKey: T1,
    time: T3,
    blocks: [{ type: "summary", text: "Later." }],
  }).text;
  const fixed = applyChange(withFu, { kind: "move", time: T2, span: 40, complete: true }).text;
  assert.equal(headerOf(parseStatus(applyChange(fixed, { kind: "note-delete", noteKey: T2 }).text)).updated, T3);

  // to a position in desk.yaml, when that's newer still
  const pos = "2026-11-20T18:00-07:00";
  assert.equal(
    headerOf(parseStatus(applyChange(text, { kind: "note-delete", noteKey: T2 }, { deskKeys: [pos, T2] }).text))
      .updated,
    pos,
  );

  // and not at all when the card shows something else
  head = headerOf(parseStatus(applyChange(text, { kind: "note-delete", noteKey: T1 }).text));
  assert.equal(head.updated, T2);
});

test("a follow-up waiting on a deleted note is reported, not lost", () => {
  const n = parseStatus(BASE).notes[0];
  const { results } = applyAll(BASE, [
    { id: "a", kind: "note-delete", noteKey: n.key },
    { id: "b", kind: "followup", noteKey: n.key, time: T, blocks: [{ type: "summary", text: "Too late." }] },
  ]);
  assert.equal(results.get("a").ok, true);
  assert.equal(results.get("b").ok, false);
});

test("edit and delete have commit messages", () => {
  const n = parseStatus(BASE).notes.find((x) => x.fields.post);
  assert.equal(commitMessage(noteEdit(n), BASE), `Edit "${n.title}"`);
  assert.equal(commitMessage({ kind: "note-delete", noteKey: n.key }, BASE), `Delete "${n.title}"`);
});

test("deleting a follow-up: one of several, the last one, and the one the card shows", async () => {
  const notes = parseStatus(BASE).notes;
  const many = notes.find((x) => x.followUps.length > 1);
  const r = applyChange(BASE, { kind: "followup-delete", noteKey: many.key, fuKey: many.followUps[0].key });
  const after = parseStatus(r.text).notes.find((x) => x.key === many.key);
  assert.equal(after.followUps.length, many.followUps.length - 1);
  assert.deepEqual(after.fields, many.fields);
  assert.equal(await prettyYaml(r.text), await prettyYaml(BASE));

  const one = notes.find((x) => x.followUps.length === 1);
  const gone = applyChange(BASE, { kind: "followup-delete", noteKey: one.key, fuKey: one.followUps[0].key });
  const left = parseStatus(gone.text).notes.find((x) => x.key === one.key);
  assert.equal(left.fuLine, -1, "no empty follow-up: line");
  assert.equal((await site(gone.text)).history.length, notes.length);

  const fuTime = "2026-11-20T09:00-07:00";
  const added = applyChange(BASE, {
    kind: "followup",
    noteKey: one.key,
    time: fuTime,
    blocks: [{ type: "summary", text: "x" }],
  });
  const before = headerOf(parseStatus(BASE));
  const undone = applyChange(added.text, { kind: "followup-delete", noteKey: one.key, fuKey: fuTime });
  // the fixture's `updated` is older than its newest entry, so it goes back to that entry, not to the old value
  const newest = "2026-11-03T20:30-07:00";
  assert.deepEqual(headerOf(parseStatus(undone.text)), { ...before, updated: newest });
  assert.equal(
    undone.text,
    BASE.replace(`updated: ${before.updated}`, `updated: ${newest}`),
    "the rest goes back exactly",
  );

  assert.throws(
    () => applyChange(BASE, { kind: "followup-delete", noteKey: one.key, fuKey: fuTime }),
    /isn't in status.yaml/,
  );
  assert.equal(
    commitMessage({ kind: "followup-delete", noteKey: one.key, fuKey: one.followUps[0].key }, BASE).startsWith(
      "Delete the ",
    ),
    true,
  );
});

test("a default headline: the summary's first sentence, under 60 characters, naming the gantry of a span", () => {
  const cases = [
    ["The Clayton Clipper has moved to span 37.", "The Clayton Clipper has moved to span 37"],
    ["Span 36 is fully glued. Crews have begun post-tensioning.", "Clayton Clipper: span 36 is fully glued"],
    ["All segments for span 35 are hung.", "Clayton Clipper: all segments for span 35 are hung"],
    ["Crews started at 8 a.m. on 176 St. today.", "Crews started at 8 a.m. on 176 St. today"],
    [
      "The Clayton Clipper is about to lift the last segment for span 37 this morning.",
      "The Clayton Clipper is about to lift the last segment",
    ],
    ["The Surrey Sprinter hung its first segment for span 2.", "The Surrey Sprinter hung its first segment for span 2"],
    ["", ""],
  ];
  for (const [summary, want] of cases) assert.equal(headlineFrom(summary), want, summary);
  for (const n of parseStatus(BASE).notes) {
    const h = headlineFrom(n.fields.summary);
    assert.ok(h.length < 60, h);
    assert.ok(!/[.!?,;:]$/.test(h), h);
    if (/\bspans? \d+/i.test(h)) assert.match(h, /Clipper|Sprinter|Flyer/, h);
  }
});
