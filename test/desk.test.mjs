// desk.yaml: the stage rules on Mike's own wording, the file read and written, what each change writes to it, and the
// velocity worked out from the copy of molund/omc5's desk.yaml in fixtures/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitStages, stagesIn } from "../src/lib/stages.js";
import { formatDesk, parseDesk, memoAt, EMPTY_DESK } from "../src/lib/deskFile.js";
import { applyBoth, applyDeskChange, autoStages } from "../src/lib/deskChanges.js";
import { velocity, workingHours, cycles, stageTimes } from "../src/lib/velocity.js";
import { parseStatus } from "../src/lib/statusFile.js";
import { dateTitle } from "../src/lib/titles.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const STATUS = readFileSync(here("./fixtures/status.yaml"), "utf8");
const DESK = readFileSync(here("./fixtures/desk.yaml"), "utf8");
const at = (s) => new Date(s);

test("the rules read Mike's wording", () => {
  const cases = [
    ["The Clayton Clipper has moved to span 38.", ["arrived"]],
    [
      "Fully glued. Hangers and cables are still up. Post tensioning in progress.",
      ["glued", "post-tensioning started"],
    ],
    ["Span 33 is hung and glued, and marked as complete.", ["hung", "glued"]],
    ["All segments for span 35 are hung.", ["hung"]],
    ["All the segments for span 37 are now in place.", ["hung"]],
    ["Only three segments have been hung for span 36.", ["hanging started"]],
    ["Post-tensioning is done on span 36, and the cables are down.", ["post-tensioned", "cables down"]],
    ["Span 35's segments are glued, and Dywidag is post-tensioning now.", ["glued", "post-tensioning started"]],
    ["The Clayton Clipper has started moving its supports.", ["supports started"]],
    ["Starting to move the gantry supports.", ["supports started"]],
    ["Finished moving the gantry supports.", ["supports moved"]],
    ["Finishing moving the gantry supports.", ["supports moved"]],
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
  assert.equal(entries[0].key, "2026-11-05T10:00-07:00");
  assert.equal(
    memoAt(entries, "2026-11-04T12:30-07:00"),
    "Fully glued. Hangers and cables are still up. Post tensioning in progress.",
  );
  assert.deepEqual(parseDesk(EMPTY_DESK), []);
  // unknown tags are dropped; empty entries aren't written
  const odd = parseDesk(EMPTY_DESK + "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stages: [hung, flying]\n");
  assert.deepEqual(odd[0].stages, ["hung"]);
  assert.equal(formatDesk([{ key: "2026-11-06T08:00-07:00", span: 38, stages: [], noteToSelf: " " }]), EMPTY_DESK);
});

test("a move logs arrived and hung by itself, and a position's note to self goes to desk.yaml only", () => {
  assert.deepEqual(autoStages({ span: 37, complete: true }, { span: 38, complete: false }), ["arrived"]);
  assert.deepEqual(autoStages({ span: 38, complete: false }, { span: 38, complete: true }), ["hung"]);
  assert.deepEqual(autoStages({ span: 38, complete: true }, { span: 38, complete: true }), []);
  const t = "2026-11-06T08:00-07:00";
  const r = applyBoth(
    { status: STATUS, desk: EMPTY_DESK },
    {
      kind: "move",
      time: t,
      span: 38,
      complete: false,
      noteToSelf: "Ask about the\n girders",
      stages: ["supports started"],
    },
  );
  // status.yaml: only the header lines, no empty note any more
  assert.equal(r.status.split("\n").length, STATUS.split("\n").length);
  assert.ok(!r.status.includes("note-to-self"));
  const e = parseDesk(r.desk)[0];
  assert.deepEqual(e, {
    key: t,
    span: 38,
    stages: ["arrived", "supports started"],
    noteToSelf: "Ask about the girders",
  });
  assert.equal(r.deskHunks.length, 1);
});

test("update, follow-up and blog changes write their stages and notes to self to desk.yaml", () => {
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
      stages: ["supports moved"],
    },
  );
  let e = parseDesk(upd.desk);
  assert.deepEqual(e[0].stages, ["arrived", "supports moved"]);
  assert.equal(e[0].noteToSelf, "Check the photo credit");
  assert.ok(!upd.status.includes("note-to-self"));
  // a follow-up: its stages at its own time, the note to self on its parent
  const fu = applyBoth(
    { status: upd.status, desk: upd.desk },
    {
      kind: "followup",
      noteKey: T,
      time: "2026-11-06T15:00-07:00",
      gantry: null,
      blocks: [{ type: "summary", text: "Three segments are hung." }],
      memo: { noteKey: T, text: "Updated" },
      stages: ["hanging started"],
    },
  );
  e = parseDesk(fu.desk);
  assert.deepEqual(e[0], { key: "2026-11-06T15:00-07:00", span: 38, stages: ["hanging started"], noteToSelf: "" });
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
  assert.deepEqual(parseDesk(blog.text), [{ key: "2026-11-06", span: null, stages: [], noteToSelf: "Draft" }]);
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
      [37, 38, "arrived", 44.5],
      [36, 37, "arrived", 62.75],
    ],
  );
  assert.equal(v.days.toFixed(2), "2.23");
  assert.deepEqual(v.current, { span: 38, since: "2026-11-05T10:00-07:00", days: 3 / 24 });
  // with no arrival at 35, span 35 to 36 is measured by the step both have: hung
  const c = cycles(entries).find((x) => x.to === 36);
  assert.equal(c.by, "hung");
  assert.equal(c.hours, 55.25);
  // the stages of span 36 where both ends are logged
  const s36 = stageTimes(entries).filter((t) => t.span === 36);
  assert.deepEqual(
    s36.map((t) => [t.name, t.hours]),
    [
      ["Hanging", 17.25],
      ["Gluing", 17.25],
      ["Post-tensioning", 8.5],
    ],
  );
});

test("editing a note replaces its stages; deleting a note takes its records and those of its follow-ups", () => {
  const notes = parseStatus(STATUS).notes;
  const n = notes.find((x) => x.followUps.length);
  const fu = n.followUps[0];
  const files = {
    status: STATUS,
    desk: formatDesk([
      { key: n.key, span: 30, stages: ["glued", "hung"], noteToSelf: "keep me" },
      { key: fu.key, span: 30, stages: ["cables down"], noteToSelf: "" },
      { key: "2020-01-01T09:00-07:00", span: 3, stages: ["arrived"], noteToSelf: "" },
    ]),
  };
  const edited = parseDesk(
    applyBoth(files, {
      kind: "note-edit",
      noteKey: n.key,
      title: n.title,
      blocks: [{ type: "summary", text: "x" }],
      stages: ["hung"],
    }).desk,
  );
  assert.deepEqual(edited.find((e) => e.key === n.key).stages, ["hung"]);
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
    desk: formatDesk([{ key: "2020-01-01T09:00-07:00", span: 3, stages: ["arrived"], noteToSelf: "" }]),
  };
  const out = parseDesk(
    applyBoth(files, {
      kind: "note-edit",
      noteKey: n.key,
      title: n.title,
      blocks: [{ type: "summary", text: "x" }],
      stages: ["glued"],
    }).desk,
  );
  assert.equal(out.find((e) => e.key === n.key).span, 3);
});

test("a follow-up's stages can be replaced or cleared, and deleting it takes its record", () => {
  const n = parseStatus(STATUS).notes.find((x) => x.followUps.length);
  const fu = n.followUps[0];
  const files = {
    status: STATUS,
    desk: formatDesk([{ key: fu.key, span: 30, stages: ["arrived", "glued"], noteToSelf: "" }]),
  };
  const edit = (stages) => ({
    kind: "followup-edit",
    noteKey: n.key,
    fuKey: fu.key,
    time: fu.key,
    blocks: [{ type: "summary", text: "x" }],
    stages,
  });
  assert.deepEqual(parseDesk(applyBoth(files, edit(["arrived", "cables down"])).desk)[0].stages, [
    "arrived",
    "cables down",
  ]);
  assert.deepEqual(parseDesk(applyBoth(files, edit([])).desk), [], "no stages left and no memo: no record");
  assert.deepEqual(parseDesk(applyBoth(files, edit(undefined)).desk)[0].stages, ["arrived", "glued"], "left alone");
  assert.deepEqual(parseDesk(applyBoth(files, { kind: "followup-delete", noteKey: n.key, fuKey: fu.key }).desk), []);
});

test("an entry's saved stages load as the arrived and hung it keeps, and one reported step", () => {
  assert.deepEqual(splitStages(["hung", "glued", "post-tensioned", "arrived"]), {
    kept: ["arrived", "hung"],
    reported: ["post-tensioned"],
  });
  assert.deepEqual(splitStages(undefined), { kept: [], reported: [] });
});
