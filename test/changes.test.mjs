// Applies each kind of change to a copy of the real status.yaml and reads the result back with the site's own reader
// (src/lib/status.js, copied into fixtures/), so a change the Leash Log writes is one the site understands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import prettier from "prettier";
import { applyChange, applyAll, commitMessage } from "../src/lib/changes.js";
import { parseStatus, newestFirst, headerOf } from "../src/lib/statusFile.js";
import { slugFor, slugsOf, titleAdvice, dateTitle } from "../src/lib/titles.js";
import { cardAsOf, compareKeys, pageHeading, parseKey, toKey } from "../src/lib/time.js";
import { cardFor, chartFor, figuresFor, velocityPoints } from "../src/lib/card.js";

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

/** A note's or follow-up's fields as the Leash Log's blocks, as the editors load them. */
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

test("the Leash Log reads every note the site does", async () => {
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
  let s = await site(text);
  assert.equal(s.span, 38);
  assert.equal(s.complete, false);
  assert.equal(+s.updated, +new Date("2026-11-04T11:15-07:00"));
  // the newest update is from the day before, so by now (the move's time) the card has no text
  const card = cardFor(text, undefined, "2026-11-04T11:15-07:00");
  assert.equal(card.text, "");
  assert.equal(card.button, "trackside");
  // a move with card text: on the card until the end of its last day, with the Trackside button, and the site reads it
  const said = applyChange(text, {
    kind: "move",
    time: "2026-11-04T21:00-07:00",
    span: 38,
    complete: false,
    cardText: "  Still waiting.  ",
    cardTextUntil: "2026-11-05",
  }).text;
  const lines = said.split("\n");
  assert.equal(lines[lines.findIndex((l) => /^(hung|complete): /.test(l)) + 4], 'card-text: "Still waiting."');
  assert.deepEqual(cardFor(said, undefined, "2026-11-05T23:45-07:00"), {
    ...cardFor(text, undefined, "2026-11-05T23:45-07:00"),
    updated: "2026-11-04T21:00-07:00",
    cardText: "Still waiting.",
    cardTextUntil: "2026-11-05",
    text: "Still waiting.",
  });
  assert.equal(cardFor(said, undefined, "2026-11-06T00:00-07:00").text, "");
  s = await site(said);
  assert.deepEqual([s.cardText, s.cardTextUntil, s.cardTextFrom], ["Still waiting.", "2026-11-05", null]);
  assert.equal(
    commitMessage({ kind: "move", span: 38, complete: false, time: T, cardText: "Still waiting." }, BASE),
    "Move the Clayton Clipper to span 38 with card text",
  );
  // a later move without any takes it away, and the file is as it was
  const quiet = applyChange(said, { kind: "move", time: "2026-11-04T11:15-07:00", span: 38, complete: false }).text;
  assert.equal(quiet, text);
  assert.equal(
    commitMessage({ kind: "move", span: 38, complete: false, time: T }, BASE),
    "Move the Clayton Clipper to span 38",
  );
});

test("an update or addendum writes its summary as the card text, until the end of its day, from its update", async () => {
  const update = { kind: "update", time: T, span: 38, complete: false, title: dateTitle(T), blocks };
  const withNote = applyChange(BASE, update).text;
  let s = await site(withNote);
  assert.deepEqual(
    [s.cardText, s.cardTextUntil, s.cardTextFrom],
    [blocks[0].text, "2026-11-04", "construction-update-for-wednesday-nov-4-2026"],
  );
  // after the velocity's place, just under hung:, with its comment
  const lines = withNote.split("\n");
  assert.match(lines[lines.findIndex((l) => /^(hung|complete): /.test(l)) + 1], /^# the progress card's text/);
  const fu = {
    kind: "followup",
    noteKey: T,
    time: "2026-11-05T07:00-07:00",
    blocks: [{ type: "summary", text: "Five segments are hung." }],
    gantry: null,
  };
  const withFu = applyChange(withNote, fu).text;
  s = await site(withFu);
  assert.deepEqual(
    [s.cardText, s.cardTextUntil, s.cardTextFrom],
    ["Five segments are hung.", "2026-11-05", "construction-update-for-wednesday-nov-4-2026"],
  );
  assert.equal(withFu.match(/^card-text: /gm).length, 1);
  // a blog post, an edit and a delete leave it
  const blog = { kind: "blog", date: "2026-11-05", title: "A post", blocks: blocks.slice(0, 1) };
  const card = (text) => headerOf(parseStatus(text));
  const pick = ({ cardText, cardTextUntil, cardTextFrom }) => ({ cardText, cardTextUntil, cardTextFrom });
  assert.deepEqual(pick(card(applyChange(withFu, blog).text)), pick(card(withFu)));
  const deleted = applyChange(withNote, { kind: "note-delete", noteKey: T }).text;
  assert.deepEqual(pick(card(deleted)), pick(card(withNote)));
  // its update gone, the card has the Trackside button
  assert.equal(cardFor(deleted, undefined, T).button, "trackside");
  assert.equal(cardFor(withNote, undefined, T).button, "comments");
});

test("the card text can be edited on its own, keeping the update it came from, or taken away", async () => {
  const withNote = applyChange(BASE, {
    kind: "update",
    time: T,
    span: 38,
    complete: false,
    title: dateTitle(T),
    blocks,
  }).text;
  const edit = { kind: "card-text", text: "Fewer words.", until: "2026-11-06" };
  const edited = applyChange(withNote, edit).text;
  const s = await site(edited);
  assert.deepEqual(
    [s.cardText, s.cardTextUntil, s.cardTextFrom],
    ["Fewer words.", "2026-11-06", "construction-update-for-wednesday-nov-4-2026"],
  );
  assert.equal(+s.updated, +new Date(T), "the card's time stamp stays");
  assert.equal(cardFor(edited, undefined, "2026-11-06T23:00-07:00").button, "comments");
  assert.equal(commitMessage(edit, withNote), "Edit the progress card's text");
  // the same again changes nothing
  assert.equal(applyChange(edited, edit).hunks.length, 0);
  const cleared = applyChange(edited, { kind: "card-text", text: " ", until: "2026-11-06" }).text;
  assert.equal(headerOf(parseStatus(cleared)).cardText, "");
  assert.doesNotMatch(cleared, /card-text|progress card's text/);
  assert.equal(commitMessage({ kind: "card-text", text: "" }, edited), "Clear the progress card's text");
});

test("an update or addendum older than the card leaves the card as it is", () => {
  const old = "2026-11-01T09:00-07:00";
  const before = headerOf(parseStatus(BASE));
  const update = { kind: "update", time: old, span: 36, complete: false, title: dateTitle(old), blocks };
  const after = parseStatus(applyChange(BASE, update).text);
  assert.deepEqual(headerOf(after), before);
  assert.ok(after.notes.some((n) => n.key === old));
  const note = newestFirst(parseStatus(BASE).notes).find((n) => n.fields.summary && compareKeys(n.key, old) < 0);
  const addendum = { kind: "followup", noteKey: note.key, time: old, blocks, gantry: { span: 36, complete: false } };
  assert.deepEqual(headerOf(parseStatus(applyChange(BASE, addendum).text)), before);
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
  const card = cardFor(text, undefined, T);
  assert.equal(card.text, blocks[0].text);
  assert.equal(card.button, "comments");
});

test("an older waiting update that retitles another note still keeps that note's address", async () => {
  const first = { id: "a", kind: "update", time: T, span: 38, complete: false, title: dateTitle(T), blocks };
  const after = applyChange(BASE, first).text;
  const t2 = "2026-11-04T19:00-07:00";
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
  assert.equal(cardFor(applyChange(BASE, add).text, undefined, "2026-11-03T22:00-07:00").text, blocks[0].text);

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
  assert.equal(commitMessage(edit, withFu), "Edit the 8:45pm addendum to the Nov. 4 construction update");
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
  assert.deepEqual([head.updated, head.span, head.complete], [T1, 40, true]);

  // to a follow-up, when that's newer
  const withFu = applyChange(text, {
    kind: "followup",
    noteKey: T1,
    time: T3,
    blocks: [{ type: "summary", text: "Later." }],
  }).text;
  const fixed = applyChange(withFu, { kind: "move", time: T2, span: 40, complete: true }).text;
  assert.equal(headerOf(parseStatus(applyChange(fixed, { kind: "note-delete", noteKey: T2 }).text)).updated, T3);

  // to a position in gantry-cycles.yaml, when that's newer still
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
  // the fixture's `updated` is older than its newest entry, so it goes back to that entry, not to the old value; the card
  // text the addendum wrote stays (a delete leaves it)
  const newest = "2026-11-03T20:30-07:00";
  const head = headerOf(parseStatus(undone.text));
  assert.deepEqual(head, {
    ...before,
    updated: newest,
    cardText: "x",
    cardTextUntil: "2026-11-20",
    cardTextFrom: head.cardTextFrom,
  });
  assert.equal(
    applyChange(undone.text, { kind: "move", time: newest, span: before.span, complete: before.complete }).text,
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

test("the date title is fine on every update of a day, and the second one's address gets -2", async () => {
  const add = (text, time) =>
    applyChange(text, {
      kind: "update",
      time,
      span: 40,
      complete: false,
      title: dateTitle(time),
      blocks: [{ type: "summary", text: `Words at ${time}.` }],
    }).text;
  const A = "2026-11-20T09:00-07:00";
  const B = "2026-11-20T15:00-07:00";
  assert.deepEqual(titleAdvice("update", B, dateTitle(B)).problems, []);
  const notes = parseStatus(add(BASE, A)).notes;
  assert.equal(slugFor(dateTitle(B), B, notes), "construction-update-for-friday-nov-20-2026-2");
  const text = add(add(BASE, A), B);
  const slugs = slugsOf(parseStatus(text).notes);
  assert.equal(slugs.get(A), "construction-update-for-friday-nov-20-2026");
  assert.equal(slugs.get(B), "construction-update-for-friday-nov-20-2026-2");
  // and the site agrees
  const s = await site(text);
  assert.deepEqual(
    [A, B].map((k) => s.history.find((h) => h.time.getTime() === parseKey(k).getTime()).slug),
    [slugs.get(A), slugs.get(B)],
  );
});

test("a blog post still needs a title of its own", () => {
  assert.equal(titleAdvice("blog", "2026-11-20", "").problems.length, 1);
  assert.equal(titleAdvice("blog", "2026-11-20", dateTitle("2026-11-20")).problems.length, 1);
  assert.deepEqual(titleAdvice("blog", "2026-11-20", "A title").problems, []);
});

test("the page heading reads as the site writes it, in every month", async () => {
  globalThis.__STATUS = BASE;
  const { asOf } = await import(`./.out/site-status.mjs?${n++}`);
  for (let m = 1; m <= 12; m++) {
    const key = `2027-${String(m).padStart(2, "0")}-14T09:30-07:00`;
    const [time, date] = asOf(parseKey(key)).split(" on ");
    assert.equal(pageHeading(key), `${date} at ${time}`, key);
  }
});

test("the card's figures match what the site works out from its map", () => {
  // from running the site's gantryProgress() on its map, for every span; 38 is the live card's "38 (+8) / 105", 36%
  const want = {
    3: 18,
    10: 18,
    11: 17,
    28: 17,
    29: 16,
    37: 8,
    38: 8,
    42: 8,
    43: 7,
    47: 3,
    51: 3,
    52: 2,
    53: 1,
    54: 0,
    105: 0,
  };
  for (const [span, ahead] of Object.entries(want)) assert.equal(figuresFor(+span).ahead, ahead, span);
  assert.equal(Math.round(figuresFor(38).percent), 36);
  assert.equal(figuresFor(38).total, 105);
});

test("the card's time reads as the site words it, today, recently and further back", async () => {
  globalThis.__STATUS = BASE;
  const { asOf } = await import(`./.out/site-status.mjs?${n++}`);
  const q = 15 * 60 * 1000;
  const now = Math.floor(Date.now() / q) * q;
  for (const back of [0, 1, 2, 3, 40, 200]) {
    const date = new Date(now - back * 24 * 3600 * 1000);
    assert.equal(cardAsOf(toKey(date)), asOf(date, true), `${back} days back`);
  }
});

test("the card's spans per week, from status.yaml's copy, and its chart, from gantry-cycles.yaml's earlier values", () => {
  // none written yet: no line on the card
  assert.equal(cardFor(BASE).pace, null);
  const status = BASE.replace(/^((?:hung|complete): .*)$/m, "$1\nspans-per-week: 2.83");
  // gantry-cycles.yaml: the velocity, its earlier values newest first, and its entries (the newest at 10:45 a.m. on Nov. 7)
  const desk = (now, earlier) =>
    [
      "# desk",
      `spans-per-week: ${now}`,
      "spans-per-week-previous:",
      ...earlier.flatMap(([key, value]) => [`  - ${key}: ${value}`, "    span: 38", "    stage: hung"]),
      "entries:",
      "  - 2026-11-07T10:45-07:00:",
      "      span: 38",
      "      stage: supports started",
    ].join("\n");
  const rising = desk("2.83", [
    ["2026-11-06T22:00-07:00", "2.81"],
    ["2026-11-05T10:00-07:00", "2.59"],
  ]);
  // the points, oldest first, the figure now at the newest entry's time
  assert.deepEqual(velocityPoints(rising), [
    { key: "2026-11-05T10:00-07:00", value: 2.59 },
    { key: "2026-11-06T22:00-07:00", value: 2.81 },
    { key: "2026-11-07T10:45-07:00", value: 2.83 },
  ]);
  const card = cardFor(status, rising);
  assert.equal(card.pace, "2.83");
  assert.equal(card.chart.way, "up");
  // across the whole box, by time; the y axis zoomed to the values, the lowest at the bottom, the highest at the top
  const xy = [...card.chart.line.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  assert.equal(xy.length, 3);
  assert.equal(xy[0][0], 0);
  assert.equal(xy[2][0], 48);
  assert.ok(xy[0][1] > 12 && xy[2][1] < 4, card.chart.line);
  assert.match(card.chart.area, / L48 16 L0 16 Z$/);
  // the last value against the first: red going down, grey when the same, a flat line through the middle
  assert.equal(cardFor(status, desk("2.40", [["2026-11-06T22:00-07:00", "2.81"]])).chart.way, "down");
  const flat = cardFor(status, desk("2.83", [["2026-11-06T22:00-07:00", "2.83"]])).chart;
  assert.equal(flat.way, "flat");
  assert.equal(flat.line, "M0 8 L48 8");
  // fewer than two points, or no gantry-cycles.yaml velocity yet: no chart
  assert.equal(cardFor(status, desk("2.83", [])).chart, null);
  assert.equal(cardFor(status, "entries:\n").chart, null);
  assert.equal(cardFor(status).chart, null);
  assert.equal(chartFor([]), null);
});

test("the review's diff shows only the lines that changed, each run with the line before it", async () => {
  const { diff } = await import("../src/lib/deskChanges.js");
  const before = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
  const after = ["a", "B", "c", "d", "e", "f2", "g", "h"].join("\n");
  assert.deepEqual(diff(before, after), [
    { start: 1, before: "a", removed: ["b"], added: ["B"] },
    { start: 5, before: "e", removed: ["f"], added: ["f2"] },
    { start: 7, before: "g", removed: [], added: ["h"] },
  ]);
  // a block written again the same, around one changed line: only that line
  const block = ["x: 1", "  - one", "  - two", "  - three"];
  assert.deepEqual(diff(block.join("\n"), [...block.slice(0, 2), "  - TWO", block[3]].join("\n")), [
    { start: 2, before: "  - one", removed: ["  - two"], added: ["  - TWO"] },
  ]);
  assert.deepEqual(diff("same", "same"), []);
});

test("a new update or blog post can have its comments off, and the site reads it", async () => {
  const blocks = [{ type: "summary", text: "Words." }];
  const off = applyChange(BASE, { kind: "blog", date: "2027-01-02", title: "Quiet one", blocks, comments: "off" });
  assert.match(off.text, /  - 2027-01-02: "Quiet one"\n    summary: "Words."\n    post: true\n    comments: off\n/);
  assert.equal((await site(off.text)).history.find((h) => h.title === "Quiet one").comments, "off");
  const on = applyChange(BASE, { kind: "blog", date: "2027-01-02", title: "Loud one", blocks, comments: "on" });
  assert.doesNotMatch(on.text, /comments:/);
});

test("editing a note can make its comments read-only and back on; left out, its comments line stays", async () => {
  const n = parseStatus(BASE).notes.find((x) => x.followUps.length);
  const ro = applyChange(BASE, { ...noteEdit(n), comments: "readonly" });
  assert.equal(parseStatus(ro.text).notes.find((x) => x.key === n.key).fields.comments, "readonly");
  assert.equal(
    (await site(ro.text)).history.find((h) => h.time.getTime() === parseKey(n.key).getTime())?.comments,
    "readonly",
  );
  const n2 = parseStatus(ro.text).notes.find((x) => x.key === n.key);
  assert.deepEqual(applyChange(ro.text, noteEdit(n2)).hunks, [], "left out: nothing changes");
  assert.deepEqual(
    applyChange(ro.text, { ...noteEdit(n2), comments: "readonly" }).hunks,
    [],
    "the same: nothing changes",
  );
  const back = applyChange(ro.text, { ...noteEdit(n2), comments: "on" });
  assert.equal(back.text, BASE);
});

test("a Trackside page batch sets several notes' comments in one change, and the site reads them", async () => {
  const notes = parseStatus(BASE).notes.filter((n) => n.fields.summary);
  const post = notes.find((n) => n.fields.post);
  const update = notes.find((n) => !n.fields.post && n.followUps.length);
  const change = {
    kind: "comments",
    settings: [
      { noteKey: post.key, comments: "off" },
      { noteKey: update.key, comments: "readonly" },
    ],
  };
  const r = applyChange(BASE, change);
  const after = parseStatus(r.text);
  assert.equal(after.notes.find((n) => n.key === post.key).fields.comments, "off");
  assert.equal(after.notes.find((n) => n.key === update.key).fields.comments, "readonly");
  assert.equal(r.hunks.length, 2, "one line added under each");
  assert.match(r.text, new RegExp(`  - ${post.key}: .*\\n    summary: .*\\n    post: true\\n    comments: off\\n`));
  const s = await site(r.text);
  assert.equal(s.history.find((h) => h.time.getTime() === parseKey(update.key).getTime()).comments, "readonly");
  assert.equal(commitMessage(change, BASE), "Change the comments on 2 updates and blog posts");
  // back on: the lines come out again, leaving the file as it was
  const back = applyChange(r.text, {
    kind: "comments",
    settings: [
      { noteKey: post.key, comments: "on" },
      { noteKey: update.key, comments: "on" },
    ],
  });
  assert.equal(back.text, BASE);
  // read-only to off: the line changes in place
  const swap = applyChange(r.text, { kind: "comments", settings: [{ noteKey: update.key, comments: "off" }] });
  assert.equal(swap.hunks.length, 1);
  assert.equal(parseStatus(swap.text).notes.find((n) => n.key === update.key).fields.comments, "off");
});

test("a Trackside page batch can feature notes and stop featuring them, and the site reads it", async () => {
  const notes = parseStatus(BASE).notes.filter((n) => n.fields.summary);
  const post = notes.find((n) => n.fields.post);
  const update = notes.find((n) => !n.fields.post && n.followUps.length);
  const out = { kind: "comments", settings: [{ noteKey: update.key, featured: true }] };
  const r = applyChange(BASE, out);
  assert.equal(r.hunks.length, 1);
  assert.equal(parseStatus(r.text).notes.find((n) => n.key === update.key).fields.featured, true);
  const s = await site(r.text);
  assert.equal(s.history.find((h) => h.time.getTime() === parseKey(update.key).getTime()).featured, true);
  assert.equal(s.history.filter((h) => h.featured && !h.post).length, 1);
  assert.match(commitMessage(out, BASE), /^Feature .* on Trackside$/);
  // both settings on one note: the featured line goes after the comments line
  const both = applyChange(BASE, {
    kind: "comments",
    settings: [{ noteKey: post.key, comments: "off", featured: false }],
  });
  assert.match(
    both.text,
    new RegExp(`  - ${post.key}: .*\\n    summary: .*\\n    post: true\\n    comments: off\\n    featured: false\\n`),
  );
  assert.equal(
    commitMessage({ kind: "comments", settings: [{ noteKey: post.key, comments: "off", featured: false }] }, BASE),
    `Change the Trackside settings on ${commitMessage({ kind: "comments", settings: [{ noteKey: post.key, comments: "off" }] }, BASE).replace(/^Turn comments off on /, "")}`,
  );
  // an edit keeps the line; unfeaturing takes it out, leaving the file as it was
  const edited = applyChange(r.text, noteEdit(parseStatus(r.text).notes.find((n) => n.key === update.key)));
  assert.equal(parseStatus(edited.text).notes.find((n) => n.key === update.key).fields.featured, true);
  const back = applyChange(r.text, { kind: "comments", settings: [{ noteKey: update.key, featured: false }] });
  assert.equal(back.text, BASE);
  assert.match(
    commitMessage({ kind: "comments", settings: [{ noteKey: update.key, featured: false }] }, BASE),
    /^Stop featuring .* on Trackside$/,
  );
});

test("a blog post is featured unless it says featured: false", async () => {
  const post = parseStatus(BASE).notes.find((n) => n.fields.summary && n.fields.post);
  assert.equal(post.fields.featured, true);
  const off = { kind: "comments", settings: [{ noteKey: post.key, featured: false }] };
  const r = applyChange(BASE, off);
  assert.match(r.text, new RegExp(`  - ${post.key}: .*\\n    summary: .*\\n    post: true\\n    featured: false\\n`));
  assert.equal(parseStatus(r.text).notes.find((n) => n.key === post.key).fields.featured, false);
  const s = await site(r.text);
  assert.equal(s.history.find((h) => h.time.getTime() === parseKey(post.key).getTime()).featured, false);
  assert.equal(s.history.filter((h) => h.post && h.featured).length, s.history.filter((h) => h.post).length - 1);
  assert.match(commitMessage(off, BASE), /^Stop featuring .* on Trackside$/);
  // featured again is the default: the line comes out, leaving the file as it was
  const back = applyChange(r.text, { kind: "comments", settings: [{ noteKey: post.key, featured: true }] });
  assert.equal(back.text, BASE);
});

test("a Trackside page batch's commit message names what it did", () => {
  const notes = parseStatus(BASE).notes.filter((n) => n.fields.summary && !n.fields.post);
  const two = notes.slice(0, 2).map((n) => ({ noteKey: n.key, comments: "readonly" }));
  assert.equal(commitMessage({ kind: "comments", settings: two }, BASE), "Make the comments read-only on 2 updates");
  const one = [{ noteKey: notes[0].key, comments: "on" }];
  assert.match(commitMessage({ kind: "comments", settings: one }, BASE), /^Turn comments back on for (the|")/);
});
