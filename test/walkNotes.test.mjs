// The walk notes: the prompt (writingPrompt.js's walkPrompt) and reading the AI's reply (walkReply.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHORT_NOTES, walkPrompt, walkTarget } from "../src/lib/writingPrompt.js";
import { parseWalkReply } from "../src/lib/walkReply.js";

const STANDARD = "Clayton Clipper construction update for Thursday, Nov. 12, 2026";

test("an update's prompt offers the standard title, the notes and the captions", () => {
  const p = walkPrompt({ kind: "update", standardTitle: STANDARD, notes: "Lots.", captions: ["The tulip", ""] });
  assert.ok(p.startsWith("Turn my walk notes into a construction update"));
  assert.ok(p.includes(`The standard title is "${STANDARD}"`));
  assert.ok(p.includes("TITLE: keep (or TITLE: the new title)"));
  assert.ok(p.includes("My notes are short. Keep everything in them"));
  assert.ok(p.includes("rewrite each one from scratch as one short, clear sentence"));
  assert.ok(p.includes("You're the editor: rewrite freely"));
  assert.ok(!p.includes("keep my wording where it works") && !p.includes("leave it as I wrote it"));
  assert.ok(p.includes("A summary: one sentence"));
  assert.ok(p.includes("PHOTO 1: The tulip\nPHOTO 2: (no caption)"));
  assert.ok(p.includes("Put the whole reply in one code block"));
  assert.ok(p.endsWith("My walk notes:\n\nLots."));
});

test("a blog post's prompt always asks for a title; with no photos it has no photo lines; kept, no code block", () => {
  const p = walkPrompt({ kind: "blog", notes: "Lots.", captions: [] }, true);
  assert.ok(p.startsWith("Turn my walk notes into a blog post"));
  assert.ok(p.includes("TITLE: the title") && !p.includes("TITLE: keep"));
  assert.ok(!p.includes("PHOTO") && !p.includes("My photos"));
  assert.ok(p.includes("Reply with nothing before or after it.") && !p.includes("code block"));
});

test("a clean reply becomes the summary, paragraphs and photos in order", () => {
  const r = parseWalkReply(
    "TITLE: keep\nSUMMARY: Span 40 is hung.\nPARAGRAPH: First.\nPHOTO 2: Two.\nPARAGRAPH: Second.\nPHOTO 1: One.",
    2,
  );
  assert.equal(r.keepTitle, true);
  assert.equal(r.title, undefined);
  assert.deepEqual(r.blocks, [
    { type: "summary", text: "Span 40 is hung." },
    { type: "text", text: "First." },
    { type: "photo", n: 2, caption: "Two." },
    { type: "text", text: "Second." },
    { type: "photo", n: 1, caption: "One." },
  ]);
  assert.deepEqual(r.problems, []);
});

test("a fenced reply with bold labels, odd case and an item over two lines", () => {
  const r = parseWalkReply(
    '```text\n**TITLE:** "Clayton Clipper reaches Hwy 15"\n- **Summary**: The **big** news.\nparagraph: One line\nand more.\n```',
    0,
  );
  assert.equal(r.title, "Clayton Clipper reaches Hwy 15");
  assert.equal(r.keepTitle, false);
  assert.deepEqual(r.blocks, [
    { type: "summary", text: "The **big** news." },
    { type: "text", text: "One line and more." },
  ]);
});

test("a photo left out goes at the end; a repeat or an unknown one is reported", () => {
  const r = parseWalkReply("SUMMARY: S.\nPHOTO 1: A.\nPHOTO 1: Again.\nPHOTO 3: Who?", 2);
  assert.deepEqual(r.blocks.slice(1), [
    { type: "photo", n: 1, caption: "A." },
    { type: "photo", n: 2, caption: null },
  ]);
  assert.equal(r.problems.length, 3);
});

test("no summary is a problem", () => {
  const r = parseWalkReply("TITLE: keep\nPARAGRAPH: Only this.", 0);
  assert.deepEqual(r.problems, ["The reply has no SUMMARY line."]);
});

test("the post's length slides with the notes': more notes, more cut, at most 120 words", () => {
  const targets = [80, 120, 160, 200, 300, 1000].map(walkTarget);
  assert.deepEqual(targets, [60, 85, 100, 120, 120, 120]);
  assert.equal(walkTarget(50), 40);
  for (let w = 1; w < 400; w++) assert.ok(walkTarget(w + 1) >= walkTarget(w), `shorter at ${w + 1}`);
});

test("short notes are kept whole; longer ones get a word count and are cut to what's interesting", () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  const short = walkPrompt({ kind: "update", standardTitle: STANDARD, notes: words(SHORT_NOTES), captions: [] });
  assert.ok(short.includes("My notes are short. Keep everything in them"));
  assert.ok(!short.includes("Keep the post to about") && !short.includes("Boring, so leave it out"));
  const long = walkPrompt({ kind: "update", standardTitle: STANDARD, notes: words(160), captions: [] });
  assert.ok(long.includes("Keep the post to about 100 words, not counting the title or captions"));
  assert.ok(long.includes("Boring, so leave it out unless it's unusual: the routine steps of the gantry's cycle"));
  assert.ok(walkPrompt({ kind: "blog", notes: words(80), captions: [] }).includes("about 60 words"));
});
