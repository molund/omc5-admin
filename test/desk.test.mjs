// desk.yaml: the stage rules on Mike's own wording, the file read and written, what each change writes to it, and the
// velocity worked out from the copy of molund/omc5's desk.yaml in fixtures/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { atLeast, floorStage, furthest, stageOf, stagesIn } from "../src/lib/stages.js";
import { formatDesk, parseDesk, memoAt, EMPTY_DESK } from "../src/lib/deskFile.js";
import { applyBoth, applyDeskChange } from "../src/lib/deskChanges.js";
import { velocity, workingHours, cycles, stageTimes } from "../src/lib/velocity.js";
import { parseStatus } from "../src/lib/statusFile.js";
import { dateTitle } from "../src/lib/titles.js";
import { canReopen, listEntries, reopenAs, replaceChangeIn, waitingAt } from "../src/lib/entries.js";
import { parseKey } from "../src/lib/time.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const STATUS = readFileSync(here("./fixtures/status.yaml"), "utf8");
const DESK = readFileSync(here("./fixtures/desk.yaml"), "utf8");
const at = (s) => new Date(s);
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

test("the rules read Mike's wording", () => {
  const cases = [
    ["The Clayton Clipper has moved to span 38.", ["arrived at span"]],
    [
      "Fully glued. Hangers and cables are still up. Post tensioning in progress.",
      ["glued", "post-tensioning started"],
    ],
    ["Span 33 is hung and glued, and marked as complete.", ["hung", "glued"]],
    ["All segments for span 35 are hung.", ["hung"]],
    ["All the segments for span 37 are now in place.", ["hung"]],
    ["Only three segments have been hung for span 36.", ["hanging started"]],
    ["Post-tensioning is done on span 36, and the cables are down.", ["post-tensioning started", "cables down"]],
    ["Span 35's segments are glued, and Dywidag is post-tensioning now.", ["glued", "post-tensioning started"]],
    ["The Clayton Clipper has started moving its supports.", ["supports started"]],
    ["Starting to move the gantry supports.", ["supports started"]],
    ["Finished moving the gantry supports.", ["supports started"]],
    ["Finishing moving the gantry supports.", ["supports started"]],
    ["The gantry is beginning to move its supports.", ["supports started"]],
    ["All 12 hangers are down.", ["hangers down"]],
    // not these
    ["Six out of twelve hangers are down from the gantry.", []],
    ["The Surrey Sprinter has hung all the segments for its first span.", []],
    ["The Clayton Clipper isn't going anywhere yet: all 12 hangers are still up.", []],
    ["", []],
  ];
  for (const [text, want] of cases) assert.deepEqual(stagesIn(text), want, text);
});

test("desk.yaml reads back as written, newest first, in one shape", () => {
  const entries = parseDesk(DESK);
  assert.equal(formatDesk(entries), DESK, "the omc5 copy is in the desk's own shape");
  assert.equal(entries[0].key, "2026-11-05T17:15-07:00");
  assert.equal(
    memoAt(entries, "2026-11-04T12:30-07:00"),
    "Fully glued. Hangers and cables are still up. Post tensioning in progress.",
  );
  assert.deepEqual(parseDesk(EMPTY_DESK), []);
  // an unknown tag is dropped; an entry with no stage and no note isn't written
  const odd = parseDesk(EMPTY_DESK + "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stage: flying\n");
  assert.equal(odd[0].stage, null);
  assert.equal(formatDesk([{ key: "2026-11-06T08:00-07:00", span: 38, stage: null, noteToSelf: " " }]), EMPTY_DESK);
  // the old "stages: [...]" reads as the furthest of them, and is written back as a stage
  const old = parseDesk(EMPTY_DESK + "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stages: [hung, glued]\n");
  assert.equal(old[0].stage, "glued");
  assert.match(formatDesk(old), /\n {6}stage: glued\n/);
});

test("desk.yaml's old name for the first stage reads as the new one, and is written back so", () => {
  const entries = parseDesk(EMPTY_DESK + "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stage: arrived\n");
  assert.equal(entries[0].stage, "arrived at span");
  assert.match(formatDesk(entries), /\n {6}stage: arrived at span\n/);
  const list = parseDesk(EMPTY_DESK + "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stages: [arrived]\n");
  assert.equal(list[0].stage, "arrived at span");
  // "supports moved" had no time of its own: the next arrival says it, so it reads as "supports started"
  const moved = parseDesk(EMPTY_DESK + "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stage: supports moved\n");
  assert.equal(moved[0].stage, "supports started");
  assert.equal(stageOf({ stage: "supports moved" }), "supports started");
});

test("an entry has one stage, never earlier than hung once its span is, and a note to self goes to desk.yaml only", () => {
  assert.equal(floorStage(false), "arrived at span");
  assert.equal(floorStage(true), "hung");
  assert.equal(furthest(["glued", "hung", "arrived at span"]), "glued");
  assert.equal(furthest([undefined, "nope"]), undefined);
  assert.equal(atLeast("arrived at span", "hung"), "hung");
  assert.equal(atLeast("glued", "hung"), "glued");
  assert.equal(atLeast(undefined, "arrived at span"), "arrived at span");
  assert.equal(stageOf({ stage: "glued", stages: ["hung"] }), "glued");
  assert.equal(stageOf({ stages: ["hung", "glued"] }), "glued", "a change waiting from before");
  assert.equal(stageOf({}), undefined);
  const stageOfMove = (move) =>
    parseDesk(
      applyBoth({ status: STATUS, desk: EMPTY_DESK }, { kind: "move", time: "2026-11-06T08:00-07:00", ...move }).desk,
    )[0].stage;
  // none picked: arrived at span; hung and none picked, or an earlier one: hung; a later one stays
  assert.equal(stageOfMove({ span: 38, complete: false }), "arrived at span");
  assert.equal(stageOfMove({ span: 38, complete: true }), "hung");
  assert.equal(stageOfMove({ span: 38, complete: true, stage: "arrived at span" }), "hung");
  assert.equal(stageOfMove({ span: 38, complete: true, stage: "glued" }), "glued");
  assert.equal(stageOfMove({ span: 38, complete: false, stage: "hanging started" }), "hanging started");
  const t = "2026-11-06T08:00-07:00";
  const r = applyBoth(
    { status: STATUS, desk: EMPTY_DESK },
    {
      kind: "move",
      time: t,
      span: 38,
      complete: false,
      noteToSelf: "Ask about the\n girders",
      stage: "supports started",
    },
  );
  // status.yaml: only the header lines, no empty note any more
  assert.equal(r.status.split("\n").length, STATUS.split("\n").length);
  assert.ok(!r.status.includes("note-to-self"));
  const e = parseDesk(r.desk)[0];
  assert.deepEqual(e, {
    key: t,
    span: 38,
    stage: "supports started",
    noteToSelf: "Ask about the girders",
  });
  assert.equal(r.deskHunks.length, 1);
});

test("update, follow-up and blog changes write their stage and notes to self to desk.yaml", () => {
  const T = "2026-11-06T09:00-07:00";
  const head = parseStatus(STATUS);
  const upd = applyBoth(
    { status: STATUS, desk: EMPTY_DESK },
    {
      kind: "update",
      time: T,
      span: 38,
      complete: false,
      title: dateTitle(T),
      blocks: [{ type: "summary", text: "Moved." }],
      memo: { noteKey: T, text: "Check the photo credit" },
      stage: "supports started",
    },
  );
  let e = parseDesk(upd.desk);
  assert.equal(e[0].stage, "supports started");
  assert.equal(e[0].noteToSelf, "Check the photo credit");
  assert.ok(!upd.status.includes("note-to-self"));
  // a follow-up: its stage at its own time, the note to self on its parent
  const fu = applyBoth(
    { status: upd.status, desk: upd.desk },
    {
      kind: "followup",
      noteKey: T,
      time: "2026-11-06T15:00-07:00",
      gantry: null,
      blocks: [{ type: "summary", text: "Three segments are hung." }],
      memo: { noteKey: T, text: "Updated" },
      stage: "hanging started",
    },
  );
  e = parseDesk(fu.desk);
  assert.deepEqual(e[0], { key: "2026-11-06T15:00-07:00", span: 38, stage: "hanging started", noteToSelf: "" });
  assert.equal(memoAt(e, T), "Updated");
  // editing a follow-up's time moves its entry with it
  const moved = applyDeskChange(
    fu.desk,
    { kind: "followup-edit", noteKey: T, fuKey: "2026-11-06T15:00-07:00", time: "2026-11-06T14:45-07:00", blocks: [] },
    fu.status,
  );
  assert.deepEqual(
    parseDesk(moved.text).map((x) => x.key),
    ["2026-11-06T14:45-07:00", T],
  );
  // a blog post: its note to self only
  const blog = applyDeskChange(
    EMPTY_DESK,
    { kind: "blog", date: "2026-11-06", memo: { noteKey: "2026-11-06", text: "Draft" } },
    STATUS,
  );
  assert.deepEqual(parseDesk(blog.text), [{ key: "2026-11-06", span: null, stage: null, noteToSelf: "Draft" }]);
  assert.ok(head.notes.length > 0);
});

test("working time leaves out Saturday 6 p.m. to Sunday 8 p.m.", () => {
  // Friday noon to Monday noon: 72 hours, 26 of them the shutdown
  assert.equal(workingHours(at("2026-10-30T12:00-07:00"), at("2026-11-02T12:00-07:00")), 46);
  // Saturday 5 p.m. to Sunday 9 p.m.: one hour before it, one after
  assert.equal(workingHours(at("2026-10-31T17:00-07:00"), at("2026-11-01T21:00-07:00")), 2);
  // inside it
  assert.equal(workingHours(at("2026-10-31T19:00-07:00"), at("2026-11-01T19:00-07:00")), 0);
  // a weekday stretch
  assert.equal(workingHours(at("2026-11-03T13:30-07:00"), at("2026-11-05T10:00-07:00")), 44.5);
  // two weekends
  assert.equal(workingHours(at("2026-10-30T12:00-07:00"), at("2026-11-09T12:00-07:00")), 240 - 52);
});

test("the velocity: the last two spans, arrival to arrival", () => {
  const entries = parseDesk(DESK);
  const v = velocity(entries, at("2026-11-05T13:00-07:00"));
  assert.deepEqual(
    v.cycles.map((c) => [c.from, c.to, c.by, c.hours]),
    [
      [37, 38, "arrived at span", 44.5],
      [36, 37, "arrived at span", 62.75],
    ],
  );
  assert.equal(v.days.toFixed(2), "2.23");
  assert.deepEqual(v.current, { span: 38, since: "2026-11-05T10:00-07:00", days: 3 / 24 });
  // with no arrival at 35, span 35 to 36 is measured by the step both have: hung
  const c = cycles(entries).find((x) => x.to === 36);
  assert.equal(c.by, "hung");
  assert.equal(c.hours, 55.25);
  // the stages of span 36 where both ends are logged: with one stage per entry, no glued is left for it
  const s36 = stageTimes(entries).filter((t) => t.span === 36);
  assert.deepEqual(
    s36.map((t) => [t.name, t.hours]),
    [["Hanging", 17.25]],
  );
});

test("post-tensioning is timed from glued to cables down, and hangers down from there", () => {
  const entries = [
    { key: "2026-11-02T08:00-07:00", span: 40, stage: "glued" },
    { key: "2026-11-02T10:00-07:00", span: 40, stage: "cables down" },
    { key: "2026-11-02T13:00-07:00", span: 40, stage: "hangers down" },
  ];
  assert.deepEqual(
    stageTimes(entries).map((t) => [t.name, t.hours]),
    [
      ["Post-tensioning", 2],
      ["Hangers down", 3],
    ],
  );
});

test("editing a note replaces its stage; deleting a note takes its records and those of its follow-ups", () => {
  const notes = parseStatus(STATUS).notes;
  const n = notes.find((x) => x.followUps.length);
  const fu = n.followUps[0];
  const files = {
    status: STATUS,
    desk: formatDesk([
      { key: n.key, span: 30, stage: "glued", noteToSelf: "keep me" },
      { key: fu.key, span: 30, stage: "cables down", noteToSelf: "" },
      { key: "2020-01-01T09:00-07:00", span: 3, stage: "arrived at span", noteToSelf: "" },
    ]),
  };
  const edited = parseDesk(
    applyBoth(files, {
      kind: "note-edit",
      noteKey: n.key,
      title: n.title,
      blocks: [{ type: "summary", text: "x" }],
      stage: "hung",
    }).desk,
  );
  assert.equal(edited.find((e) => e.key === n.key).stage, "hung");
  assert.equal(memoAt(edited, n.key), "keep me");

  const deleted = parseDesk(applyBoth(files, { kind: "note-delete", noteKey: n.key }).desk);
  assert.deepEqual(
    deleted.map((e) => e.key),
    ["2020-01-01T09:00-07:00"],
  );
});

test("a stage on an entry with no record yet takes the span in force at that time", () => {
  const n = parseStatus(STATUS).notes.find((x) => !x.fields.post);
  const files = {
    status: STATUS,
    desk: formatDesk([{ key: "2020-01-01T09:00-07:00", span: 3, stage: "arrived at span", noteToSelf: "" }]),
  };
  const out = parseDesk(
    applyBoth(files, {
      kind: "note-edit",
      noteKey: n.key,
      title: n.title,
      blocks: [{ type: "summary", text: "x" }],
      stage: "glued",
    }).desk,
  );
  assert.equal(out.find((e) => e.key === n.key).span, 3);
});

test("a follow-up's stage can be replaced, and deleting it takes its record", () => {
  const n = parseStatus(STATUS).notes.find((x) => x.followUps.length);
  const fu = n.followUps[0];
  const files = {
    status: STATUS,
    desk: formatDesk([{ key: fu.key, span: 30, stage: "glued", noteToSelf: "" }]),
  };
  const edit = (stage) => ({
    kind: "followup-edit",
    noteKey: n.key,
    fuKey: fu.key,
    time: fu.key,
    blocks: [{ type: "summary", text: "x" }],
    stage,
  });
  assert.equal(parseDesk(applyBoth(files, edit("cables down")).desk)[0].stage, "cables down");
  assert.equal(
    parseDesk(applyBoth(files, edit("arrived at span")).desk)[0].stage,
    "arrived at span",
    "an earlier one replaces it",
  );
  assert.equal(parseDesk(applyBoth(files, edit(undefined)).desk)[0].stage, "glued", "left alone");
  assert.deepEqual(parseDesk(applyBoth(files, { kind: "followup-delete", noteKey: n.key, fuKey: fu.key }).desk), []);
});

test("a position record can be edited or deleted, and only desk.yaml changes unless the card showed it", () => {
  const key = "2026-11-20T09:00-07:00";
  const other = "2026-11-19T09:00-07:00";
  const desk = formatDesk([
    { key, span: 40, stage: "glued", noteToSelf: "Old" },
    { key: other, span: 39, stage: "hung", noteToSelf: "" },
  ]);
  const shown = STATUS.replace(/^updated: .*$/m, `updated: ${key}`);

  const edited = applyBoth(
    { status: shown, desk },
    { kind: "desk-edit", key, stage: "arrived at span", noteToSelf: "New" },
  );
  assert.equal(edited.status, shown);
  const e = parseDesk(edited.desk).find((x) => x.key === key);
  assert.deepEqual([e.span, e.stage, e.noteToSelf], [40, "arrived at span", "New"]);

  const gone = applyBoth({ status: shown, desk }, { kind: "desk-delete", key });
  assert.ok(!parseDesk(gone.desk).some((x) => x.key === key));
  assert.equal(parseStatus(gone.status).header.updated.value, "2026-11-19T09:00-07:00");
  assert.equal(parseStatus(gone.status).header.span.value, parseStatus(shown).header.span.value);

  const notShown = applyBoth({ status: STATUS, desk }, { kind: "desk-delete", key });
  assert.equal(notShown.status, STATUS, "the card showed something else");

  assert.throws(
    () => applyBoth({ status: STATUS, desk: EMPTY_DESK }, { kind: "desk-delete", key }),
    /isn't in desk.yaml/,
  );
  assert.throws(
    () =>
      applyBoth(
        { status: STATUS, desk: EMPTY_DESK },
        { kind: "desk-edit", key, stage: "arrived at span", noteToSelf: "" },
      ),
    /isn't in desk.yaml/,
  );
});

test("the Entries list: posts with their follow-ups, and position records, newest first", () => {
  const parsed = parseStatus(STATUS);
  const n = parsed.notes.find((x) => x.followUps.length);
  const alone = "2030-01-01T09:00-07:00";
  const entries = listEntries(parsed, [
    { key: alone, span: 50, stage: "glued", noteToSelf: "" },
    { key: n.key, span: 30, stage: "hung", noteToSelf: "" },
    { key: n.followUps[0].key, span: 30, stage: "glued", noteToSelf: "" },
  ]);
  assert.equal(entries.length, parsed.notes.length + 1, "a record with a post at its time isn't listed twice");
  assert.deepEqual([entries[0].type, entries[0].key], ["position", alone]);
  assert.deepEqual(
    entries.map((e) => e.key),
    [...entries.map((e) => e.key)].sort((a, b) => parseKey(b) - parseKey(a)),
  );
  assert.equal(entries.find((e) => e.key === n.key).followUps.length, n.followUps.length);
  assert.equal(entries.find((e) => e.type === "blog")?.note.fields.post, true);
});

test("a note with no summary is listed as a position", () => {
  const text = STATUS.replace(/^notes:$/m, `notes:\n  - 2030-01-01T09:00-07:00: ""\n    note-to-self: "Just this"`);
  const [first] = listEntries(parseStatus(text), []);
  assert.deepEqual([first.type, first.note?.fields.memo], ["position", "Just this"]);
});

test("what's waiting is found by the time stamp it created", () => {
  const key = "2030-01-01T09:00-07:00";
  const changes = [
    { id: "a", kind: "note-edit", noteKey: key },
    { id: "b", kind: "move", time: key },
  ];
  assert.equal(waitingAt(changes, key).id, "b");
  assert.equal(waitingAt(changes, "2031-01-01"), undefined);
  assert.equal(waitingAt([{ id: "c", kind: "blog", date: "2031-01-01" }], "2031-01-01").id, "c");
});

test("an edit of every saved entry, as its editor loads it, changes neither file", () => {
  const parsed = parseStatus(STATUS);
  const files = { status: STATUS, desk: DESK };
  const entries = parseDesk(DESK);
  const stageOfEntry = (key) => entries.find((e) => e.key === key)?.stage ?? undefined;
  for (const n of parsed.notes) {
    const stage = n.fields.post ? {} : { stage: stageOfEntry(n.key) };
    const memo = { noteKey: n.key, text: memoAt(entries, n.key) };
    const r = applyBoth(files, {
      kind: "note-edit",
      noteKey: n.key,
      title: n.title,
      blocks: blocksOf(n.fields),
      memo,
      ...stage,
    });
    assert.equal(r.status, STATUS, n.key);
    assert.deepEqual(r.deskHunks, [], n.key);
    for (const f of n.followUps) {
      const fr = applyBoth(files, {
        kind: "followup-edit",
        noteKey: n.key,
        fuKey: f.key,
        time: f.key,
        blocks: blocksOf(f.fields),
        memo,
        stage: stageOfEntry(f.key),
      });
      assert.equal(fr.status, STATUS, f.key);
      assert.deepEqual(fr.deskHunks, [], f.key);
    }
  }
});

test("a waiting change keeps its place when replaced, and later ones stay on top of the new version", () => {
  const changes = [
    { id: "a", kind: "move" },
    { id: "b", kind: "blog", title: "Old" },
    { id: "c", kind: "move" },
  ];
  const out = replaceChangeIn(changes, "b", { kind: "blog", title: "New" }, "Add it", "now");
  assert.deepEqual(
    out.map((c) => c.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(out[1], { kind: "blog", title: "New", id: "b", message: "Add it", savedAt: "now" });
});

test("a waiting change reopens as the draft that makes it again", () => {
  const head = { span: 37, complete: true };
  const blocks = [{ type: "summary", text: "Words." }];
  const T = "2030-01-01T09:00-07:00";
  assert.deepEqual(
    reopenAs({ kind: "move", time: T, span: 38, complete: false, noteToSelf: "m", stage: "glued" }, head),
    {
      screen: "move",
      seed: { time: T, span: 38, complete: false, memo: "m", stage: "glued" },
    },
  );
  // a change waiting from before, with its stages, reopens at the furthest of them
  assert.equal(
    reopenAs({ kind: "move", time: T, span: 38, complete: false, noteToSelf: "", stages: ["hung", "glued"] }, head).seed
      .stage,
    "glued",
  );
  const update = reopenAs(
    {
      kind: "update",
      time: T,
      span: 38,
      complete: false,
      title: "A title",
      blocks,
      retitle: [{ key: "k", title: "Other", slug: "s" }],
      memo: { noteKey: T, text: "m" },
      stage: "arrived at span",
    },
    head,
  );
  assert.equal(update.seed.titleSet, true);
  // a follow-up that didn't move the gantry starts from where the gantry is
  const fu = reopenAs({ kind: "followup", noteKey: "n", time: T, blocks, gantry: null, stage: "hung" }, head);
  assert.deepEqual([fu.seed.span, fu.seed.complete, fu.seed.editing], [37, true, null]);
  assert.equal(reopenAs({ kind: "blog", date: "2030-01-01", title: "T", blocks }, head).screen, "blog");
  // what edits something saved reopens in the entry editor, with its stage
  const edit = reopenAs({ kind: "note-edit", noteKey: T, title: "T", blocks, stage: "glued" }, head);
  assert.deepEqual([edit.screen, edit.target, edit.seed.stage], ["entry", { type: "note", key: T }, "glued"]);
  assert.equal(reopenAs({ kind: "desk-edit", key: T, stage: "arrived at span", noteToSelf: "x" }, head).seed.memo, "x");
  assert.equal(
    reopenAs({ kind: "followup-edit", noteKey: "n", fuKey: T, time: T, blocks, stage: "arrived at span" }, head).target
      .type,
    "followup",
  );
  assert.equal(canReopen({ kind: "note-delete" }), false);
  assert.equal(canReopen({ kind: "followup-delete" }), false);
  assert.equal(canReopen({ kind: "desk-delete" }), false);
  assert.equal(canReopen({ kind: "note-edit" }), true);
});

test("status.yaml's hung: line (complete: in a file from before Nov. 6) is read and written", async () => {
  const { applyChange, commitMessage } = await import("../src/lib/changes.js");
  const { headerOf } = await import("../src/lib/statusFile.js");
  const move = { kind: "move", time: "2026-11-06T08:00-07:00", span: 38, complete: true };
  // an old file: complete:
  const old = STATUS.replace(/^span: .*$/m, "span: 38").replace(/^complete: .*$/m, "complete: false");
  assert.match(applyChange(old, move).text, /^complete: true$/m);
  // a new one: hung:
  const now = old.replace(/^complete: /m, "hung: ");
  assert.equal(headerOf(parseStatus(now)).complete, false);
  const after = applyChange(now, move).text;
  assert.match(after, /^hung: true$/m);
  assert.doesNotMatch(after, /^complete:/m);
  assert.equal(headerOf(parseStatus(after)).complete, true);
  assert.equal(commitMessage(move, now), "Mark span 38 as hung");
});
