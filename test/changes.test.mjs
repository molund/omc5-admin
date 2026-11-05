// Applies each kind of change to a copy of the real status.yaml and reads the result back with the site's own reader
// (src/lib/status.js, copied into fixtures/), so a change the desk writes is one the site understands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { applyChange, applyAll, commitMessage } from "../src/lib/changes.js";
import { parseStatus, newestFirst } from "../src/lib/statusFile.js";
import { slugsOf, titleAdvice, dateTitle } from "../src/lib/titles.js";
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
