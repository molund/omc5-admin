// gantry-cycles.yaml: the stage rules on Mike's own wording, the file read and written, what each change writes to it, and the
// velocity worked out from the copy of molund/omc5's gantry-cycles.yaml in fixtures/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { atLeast, floorStage, furthest, stageFloor, stageOf, stagesIn } from "../src/lib/stages.js";
import { formatDesk, parseDesk, memoAt, postedStage, EMPTY_DESK } from "../src/lib/deskFile.js";
import { applyBoth, applyDeskChange } from "../src/lib/deskChanges.js";
import { setDeskVelocity, setVelocity } from "../src/lib/changes.js";
import {
  afterShiftHours,
  arrivals,
  velocity,
  workingHours,
  shiftHours,
  stageShares,
  cycles,
  sinceArrival,
  stepsWithEstimates,
  spanDays,
  trendOf,
  velocityHistory,
  HISTORY_HOURS,
} from "../src/lib/velocity.js";
import { headerOf, parseStatus } from "../src/lib/statusFile.js";
import { dateTitle } from "../src/lib/titles.js";
import { canReopen, listEntries, recentUpdates, reopenAs, replaceChangeIn, waitingAt } from "../src/lib/entries.js";
import { parseKey, toKey, weekdayShort } from "../src/lib/time.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const STATUS = readFileSync(here("./fixtures/status.yaml"), "utf8");
const DESK = readFileSync(here("./fixtures/gantry-cycles.yaml"), "utf8");
const at = (s) => new Date(s);
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

test("gantry-cycles.yaml reads back as written, newest first, in one shape", () => {
  const entries = parseDesk(DESK);
  // the entries as the omc5 copy has them (its comment at the top is from before Nov. 8, 2026, when the velocity moved in)
  const fromEntries = (t) => t.slice(t.indexOf("\nentries:"));
  assert.equal(fromEntries(formatDesk(entries)), fromEntries(DESK), "the omc5 copy is in the Leash Log's own shape");
  assert.match(formatDesk(entries), /The site reads only the velocity below/);
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

test("gantry-cycles.yaml's old name for the first stage reads as the new one, and is written back so", () => {
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

test("an entry has one stage, never earlier than hung once its span is, and a note to self goes to gantry-cycles.yaml only", () => {
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
    )[0]?.stage;
  const head = headerOf(parseStatus(STATUS));
  // none picked: what the move implies (arrived at span, or hung with the span marked hung); hung and an earlier one: hung;
  // a later one stays
  assert.equal(stageOfMove({ span: 38, complete: false }), "arrived at span");
  assert.equal(stageOfMove({ span: head.span, complete: head.complete }), undefined, "a move that changes nothing");
  assert.equal(
    postedStage(
      [
        { span: 5, stage: "glued" },
        { span: 5, stage: "hung" },
        { span: 6, stage: "cables down" },
      ],
      5,
    ),
    "glued",
  );
  assert.equal(stageFloor(true, "glued"), "glued");
  assert.equal(stageFloor(true, "arrived at span"), "hung");
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

test("update, follow-up and blog changes write their stage and notes to self to gantry-cycles.yaml", () => {
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

test("working time leaves out Friday 6 p.m. to Saturday 6 a.m., and Saturday 6 p.m. to Sunday 6 p.m.", () => {
  // Friday noon to Monday noon: 72 hours, 36 of them the shutdown
  assert.equal(workingHours(at("2026-10-30T12:00-07:00"), at("2026-11-02T12:00-07:00")), 36);
  // Friday 5 p.m. to Saturday 7 a.m.: one hour before Friday night's, one after
  assert.equal(workingHours(at("2026-10-30T17:00-07:00"), at("2026-10-31T07:00-07:00")), 2);
  // Saturday 5 p.m. to Sunday 7 p.m.: one hour before it, one after
  assert.equal(workingHours(at("2026-10-31T17:00-07:00"), at("2026-11-01T19:00-07:00")), 2);
  // inside it
  assert.equal(workingHours(at("2026-10-31T19:00-07:00"), at("2026-11-01T17:00-07:00")), 0);
  // a weekday stretch
  assert.equal(workingHours(at("2026-11-03T13:30-07:00"), at("2026-11-05T10:00-07:00")), 44.5);
  // two weekends
  assert.equal(workingHours(at("2026-10-30T12:00-07:00"), at("2026-11-09T12:00-07:00")), 240 - 72);
});

test("shift hours count only the day and night shifts, and not the shutdown", () => {
  const monday = (time) => at(`2026-11-09T${time}-07:00`);
  // a whole day shift
  assert.equal(shiftHours(monday("07:00"), monday("17:00")), 10);
  // an hour of the day shift, the break, an hour of the night shift
  assert.equal(shiftHours(monday("16:00"), monday("21:00")), 2);
  // inside the break
  assert.equal(shiftHours(monday("17:30"), monday("19:30")), 0);
  // Thursday's night shift runs into Friday morning, up to 6 a.m.
  assert.equal(shiftHours(at("2026-11-05T23:00-07:00"), at("2026-11-06T07:00-07:00")), 7);
  // no night shift Friday: Friday's day shift, then nothing until Saturday's day shift
  assert.equal(shiftHours(at("2026-11-06T16:00-07:00"), at("2026-11-07T08:00-07:00")), 2);
  // Saturday's day shift, then nothing until Sunday's night shift
  assert.equal(shiftHours(at("2026-11-07T16:00-07:00"), at("2026-11-08T21:00-07:00")), 2);
  // and back: across the break, and starting inside one
  assert.deepEqual(afterShiftHours(monday("16:00"), 2), monday("21:00"));
  assert.deepEqual(afterShiftHours(monday("18:00"), 1), monday("21:00"));
});

// a run of cycles with known shift hours from each stage to the next, the ones with a known length at that length
const LENGTHS = {
  "arrived at span": 0.5,
  "hanging started": 5,
  hung: 1,
  "gluing started": 10,
  glued: 1,
  "post-tensioning started": 8,
  "cables down": 2.5,
  "hangers down": 1,
  "supports started": 9,
};
const CYCLE = Object.values(LENGTHS).reduce((a, b) => a + b, 0);
/** Every step of spans 40 to 43, then the arrival at 44. */
function runOfCycles() {
  const entries = [];
  let t = at("2026-11-09T07:00-07:00");
  for (let span = 40; span < 44; span++)
    for (const [stage, hours] of Object.entries(LENGTHS)) {
      entries.push({ key: toKey(t), span, stage });
      t = afterShiftHours(t, hours);
    }
  entries.push({ key: toKey(t), span: 44, stage: "arrived at span" });
  return entries;
}

test("each stage's share of the cycle comes back from the gaps between steps", () => {
  const shares = stageShares(runOfCycles());
  assert.deepEqual(
    shares.map((s) => s.stage),
    Object.keys(LENGTHS),
  );
  let sofar = 0;
  for (const s of shares) {
    assert.ok(Math.abs(s.share - LENGTHS[s.stage] / CYCLE) < 0.01, `${s.stage}: ${s.share}`);
    assert.ok(Math.abs(s.position - sofar / CYCLE) < 0.01, `${s.stage}: ${s.position}`);
    sofar += LENGTHS[s.stage];
  }
  assert.ok(Math.abs(shares.reduce((t, s) => t + s.share, 0) - 1) < 1e-9);
});

test("a stage never logged gets a share, and a stage known to follow closely stays short", () => {
  const unlogged = stageShares(runOfCycles().filter((e) => e.stage !== "hangers down"));
  assert.ok(unlogged.find((s) => s.stage === "hangers down").share > 0);
  // hanging logged five hours after an arrival: the half hour holds, and the five go to hanging
  const shares = stageShares([
    { key: "2026-11-09T07:00-07:00", span: 40, stage: "arrived at span" },
    { key: "2026-11-09T12:00-07:00", span: 40, stage: "hanging started" },
    { key: "2026-11-10T12:00-07:00", span: 41, stage: "arrived at span" },
  ]);
  assert.ok(shares[0].share < 0.06, `arrival to hanging: ${shares[0].share}`);
});

test("steps before SHARES_SINCE don't change the shares", () => {
  const entries = parseDesk(DESK);
  const older = { key: "2026-11-01T21:00-07:00", span: 36, stage: "glued" };
  assert.deepEqual(stageShares([...entries, older]), stageShares(entries));
});

test("an arrival: as logged if it was, close to the real one if it's estimated, and none without a step either side", () => {
  const entries = runOfCycles();
  const real = entries.find((e) => e.span === 42 && e.stage === "arrived at span");
  assert.deepEqual(arrivals(entries)[42], { key: real.key, estimated: false });
  const hidden = arrivals(entries.filter((e) => e !== real))[42];
  assert.equal(hidden.estimated, true);
  assert.ok(Math.abs(parseKey(hidden.key) - parseKey(real.key)) <= 30 * 60 * 1000, hidden.key);
  // a span with no steps of its own, between two that have them
  const skipped = arrivals(entries.filter((e) => e.span !== 42))[42];
  assert.equal(skipped.estimated, true);
  assert.ok(Math.abs(parseKey(skipped.key) - parseKey(real.key)) <= 60 * 60 * 1000, skipped.key);
  // nothing before the hung to read an arrival from
  assert.deepEqual(arrivals([{ key: "2026-11-09T12:00-07:00", span: 40, stage: "hung" }]), {});
  assert.deepEqual(
    Object.keys(
      arrivals([
        { key: "2026-11-09T12:00-07:00", span: 40, stage: "hung" },
        { key: "2026-11-11T12:00-07:00", span: 41, stage: "arrived at span" },
      ]),
    ),
    ["41"],
  );
  assert.deepEqual(arrivals([]), {});
});

test("the velocity: how far the gantry got in the week up to the step reported last", () => {
  const entries = parseDesk(DESK);
  const v = velocity(entries, at("2026-11-05T13:00-07:00"));
  // the copy's last step is span 38's hung, at 5:15 p.m. on Nov. 5; a week before, the gantry was between span 35's hung
  // (6:45 a.m. on Oct. 29) and its post-tensioning (6:30 p.m.)
  assert.equal(v.stage, "hung");
  assert.equal(v.window.start, "2026-10-29T17:15-07:00");
  assert.equal(v.window.end, "2026-11-05T17:15-07:00");
  assert.equal(v.window.span, 38);
  assert.equal(v.window.from.toFixed(2), "35.54");
  assert.equal(v.window.to.toFixed(2), "38.15");
  assert.equal(v.spansPerWeek.toFixed(2), "2.61");
  // a week holds one shutdown, so spans per week is the distance covered in it
  assert.ok(Math.abs(v.spansPerWeek - (v.window.to - v.window.from)) < 1e-9);
  assert.equal(v.shares.length, 9);
  assert.deepEqual(v.current, { span: 38, since: "2026-11-05T10:00-07:00", days: 3 / 24 });
  // the cycles by arrival are still there: with no arrival at 35, it's estimated from the steps around it (span 35's hung
  // was at 6:45 a.m.)
  const c = cycles(entries).find((x) => x.to === 36);
  assert.equal(c.start, "2026-10-28T23:30-07:00");
  assert.equal(c.end, "2026-10-30T20:45-07:00");
  // each step logged on span 36, once at its earliest, in working time since its arrival: the shutdown doesn't count
  assert.deepEqual(
    sinceArrival(entries)
      .filter((t) => t.span === 36)
      .map((t) => [t.stage, t.hours]),
    [
      ["arrived at span", 0],
      ["hanging started", 3.5],
      ["hung", 8],
      ["post-tensioning started", 27.25],
      ["cables down", 35.75],
      ["supports started", 49.25],
    ],
  );
});

test("steps logged since arrival: highest span first, then shortest first, none without a logged arrival or before it", () => {
  const entries = [
    { key: "2026-11-03T09:00-07:00", span: 41, stage: "hung" },
    { key: "2026-11-03T08:00-07:00", span: 41, stage: "arrived at span" },
    { key: "2026-11-02T12:00-07:00", span: 40, stage: "glued" },
    { key: "2026-11-02T10:00-07:00", span: 40, stage: "hung" },
    { key: "2026-11-02T07:00-07:00", span: 40, stage: "hanging started" },
    { key: "2026-11-02T08:00-07:00", span: 40, stage: "arrived at span" },
    { key: "2026-11-02T06:00-07:00", span: 39, stage: "hung" },
    { key: "2026-11-02T05:00-07:00", span: 39, stage: null },
  ];
  assert.deepEqual(
    sinceArrival(entries).map((t) => [t.span, t.stage, t.hours]),
    [
      [41, "arrived at span", 0],
      [41, "hung", 1],
      [40, "arrived at span", 0],
      [40, "hung", 2],
      [40, "glued", 4],
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

test("a position record can be edited or deleted, and only gantry-cycles.yaml changes unless the card showed it", () => {
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
    /isn't in gantry-cycles.yaml/,
  );
  assert.throws(
    () =>
      applyBoth(
        { status: STATUS, desk: EMPTY_DESK },
        { kind: "desk-edit", key, stage: "arrived at span", noteToSelf: "" },
      ),
    /isn't in gantry-cycles.yaml/,
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
  const entries = parseDesk(DESK);
  // both files as a push leaves them: gantry-cycles.yaml with the velocity and its earlier values, status.yaml with its copy
  const DESK_NOW = setDeskVelocity(formatDesk(entries), velocity(entries), velocityHistory(entries)).text;
  const STATUS_NOW = setVelocity(STATUS, velocity(entries)).text;
  const parsed = parseStatus(STATUS_NOW);
  const files = { status: STATUS_NOW, desk: DESK_NOW };
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
    assert.equal(r.status, STATUS_NOW, n.key);
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
      assert.equal(fr.status, STATUS_NOW, f.key);
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

test("invisible characters a phone slips in are left out of both files", async () => {
  const { applyChange } = await import("../src/lib/changes.js");
  const junk = "￼6/12 segments​ glued﻿";
  // gantry-cycles.yaml: a note to self
  const desk = formatDesk([{ key: "2026-11-05T21:30-07:00", span: 38, stage: null, noteToSelf: junk }]);
  assert.match(desk, /\n {6}note: "6\/12 segments glued"\n/);
  // status.yaml: a summary, and a caption
  const T = "2026-11-06T09:00-07:00";
  const text = applyChange(STATUS, {
    kind: "update",
    time: T,
    span: 38,
    complete: true,
    title: dateTitle(T),
    blocks: [
      { type: "summary", text: junk },
      { type: "photo", file: "x.jpg", caption: "￼A caption" },
    ],
  }).text;
  assert.match(text, /summary: "6\/12 segments glued"/);
  assert.match(text, /caption: "A caption"/);
  assert.doesNotMatch(text, /[￼​﻿]/);
  // emoji built with the zero-width joiner stay whole
  assert.match(formatDesk([{ key: T, span: 38, stage: null, noteToSelf: "Crew \u{1F477}‍♂️" }]), /‍/);
});

test("the days each span took: arrival to the next arrival, open on the newest, and whether the shutdown fell inside", () => {
  const entries = [
    { key: "2026-11-05T10:00-07:00", span: 38, stage: "arrived at span" },
    { key: "2026-11-03T09:00-07:00", span: 37, stage: "arrived at span" },
    { key: "2026-10-30T09:00-07:00", span: 36, stage: "arrived at span" },
  ];
  const d = spanDays(entries);
  assert.deepEqual(d[38], { start: "2026-11-05T10:00-07:00", end: null, shutdown: false });
  assert.equal(d[37].end, "2026-11-05T10:00-07:00");
  assert.equal(d[37].shutdown, false);
  assert.equal(d[36].end, "2026-11-03T09:00-07:00");
  assert.equal(d[36].shutdown, true);
  assert.equal(weekdayShort("2026-11-05T10:00-07:00"), "Thurs");
  assert.equal(weekdayShort("2026-11-03T09:00-07:00"), "Tues");
});

test("status.yaml gets a copy of spans per week after hung:, and nothing more", () => {
  const once = setVelocity(STATUS, { spansPerWeek: 2.83 }).text;
  const h = parseStatus(once).header;
  // (the fixture is from before Nov. 6, 2026, so its hung: line is still complete:) after it, its two lines of comment
  assert.equal(h["spans-per-week"].line, (h.hung ?? h.complete).line + 3);
  assert.equal(h["spans-per-week"].value, "2.83");
  assert.equal(h["spans-per-week-previous"], undefined);
  assert.match(once, /a copy of gantry-cycles\.yaml's/);
  // written again the same: not a character changes; a new figure: in place
  assert.equal(setVelocity(once, { spansPerWeek: 2.83 }).text, once);
  const again = setVelocity(once, { spansPerWeek: 2.86 }).text;
  assert.equal(parseStatus(again).header["spans-per-week"].value, "2.86");
  assert.equal(again.split("\n").length, once.split("\n").length);
  // no velocity yet: left as it is
  assert.equal(setVelocity(STATUS, null).text, STATUS);
});

test("gantry-cycles.yaml gets the velocity above its entries, with its earlier values as a list, newest first", () => {
  const desk = formatDesk(parseDesk(DESK));
  const history = [
    { key: "2026-11-06T22:00-07:00", spansPerWeek: 2.805, span: 38, stage: "hangers down" },
    { key: "2026-11-05T10:00-07:00", spansPerWeek: 2.77, span: 38, stage: "arrived at span" },
  ];
  const once = setDeskVelocity(desk, { spansPerWeek: 2.83 }, history).text;
  const h = parseStatus(once).header;
  assert.equal(h["spans-per-week"].value, "2.83");
  assert.ok(h["spans-per-week"].line < h.entries.line);
  assert.deepEqual(
    h["spans-per-week-previous"].list.map(({ key, value, span, stage }) => [key, value, span, stage]),
    [
      ["2026-11-06T22:00-07:00", "2.81", "38", "hangers down"],
      ["2026-11-05T10:00-07:00", "2.77", "38", "arrived at span"],
    ],
  );
  assert.equal(h["spans-per-week-previous"].end, h.entries.line - 1);
  // the entries read as they were
  assert.deepEqual(parseDesk(once), parseDesk(desk));
  // written again the same: not a character changes
  assert.equal(setDeskVelocity(once, { spansPerWeek: 2.83 }, history).text, once);
  // a newer step: the whole block, in place, with the older value gone
  const later = [{ key: "2026-11-07T08:15-07:00", spansPerWeek: 2.83, span: 38, stage: "supports started" }];
  const again = setDeskVelocity(once, { spansPerWeek: 2.86 }, [...later, history[0]]).text;
  const g = parseStatus(again).header;
  assert.equal(g["spans-per-week"].value, "2.86");
  assert.deepEqual(
    g["spans-per-week-previous"].list.map((i) => i.key),
    ["2026-11-07T08:15-07:00", "2026-11-06T22:00-07:00"],
  );
  assert.equal(again.split("\n").length, once.split("\n").length);
  assert.deepEqual(parseDesk(again), parseDesk(desk));
  // no earlier values: no list; no velocity yet: left as it is
  assert.equal(
    parseStatus(setDeskVelocity(desk, { spansPerWeek: 2.4 }).text).header["spans-per-week-previous"],
    undefined,
  );
  assert.equal(setDeskVelocity(desk, null).text, desk);
});

test("a change keeps gantry-cycles.yaml's velocity, worked out again, and status.yaml's copy matching it", () => {
  const entries = parseDesk(DESK);
  const v = velocity(entries);
  const files = {
    status: setVelocity(STATUS, v).text,
    desk: setDeskVelocity(formatDesk(entries), v, velocityHistory(entries)).text,
  };
  // a note to self on the newest entry: the entries' text changes, the velocity block stays where it is
  const newest = entries[0];
  const r = applyBoth(files, { kind: "move", time: newest.key, span: newest.span, complete: true, noteToSelf: "kept" });
  const h = parseStatus(r.desk).header;
  assert.equal(h["spans-per-week"].value, v.spansPerWeek.toFixed(2));
  assert.equal(parseStatus(r.status).header["spans-per-week"].value, h["spans-per-week"].value);
  assert.equal(parseStatus(r.status).header["spans-per-week-previous"], undefined);
  assert.equal(memoAt(parseDesk(r.desk), newest.key), "kept");
});

test("status.yaml's earlier velocity forms, all from Nov. 7, 2026, become just the copy on the next push", () => {
  const after = (block) => STATUS.replace(/^((?:hung|complete): .*)$/m, ["$1", ...block].join("\n"));
  const comment = (last) => [
    "# the Clayton Clipper's velocity, written by the Leash Log on every push from gantry-cycles.yaml: working days per span and",
    "# spans per week, from how far the gantry got in the week up to the latest step reported (the weekly shutdown allowed",
    last,
  ];
  const olds = [
    // over the last three spans, underscores, no earlier value
    [
      "# the Clayton Clipper's velocity, written by the Leash Log on every push from gantry-cycles.yaml: working days per span over the",
      "# last three spans, and spans per week once the weekly shutdown is allowed for",
      "days_per_span: 2.15",
      "spans_per_week: 2.79",
    ],
    // a single earlier value, underscores
    [
      ...comment("# for), each with its value before it last changed (_previous)"),
      "days_per_span: 2.12",
      "days_per_span_previous: 2.15",
      "spans_per_week: 2.83",
      "spans_per_week_previous: 2.79",
    ],
    // a single earlier value, hyphens
    [
      ...comment("# for), each with its value before it last changed (-previous)"),
      "days-per-span: 2.12",
      "days-per-span-previous: 2.15",
      "spans-per-week: 2.83",
      "spans-per-week-previous: 2.79",
    ],
    // the lists over 96 hours, with span and stage, and days per span
    [
      ...comment(
        "# for), each with its values at the earlier steps of the past 96 hours (-previous), newest first, with the span and",
      ),
      "# stage of the step each was timed by",
      "days-per-span: 2.12",
      "days-per-span-previous:",
      "  - 2026-11-06T22:00-07:00: 2.14",
      "    span: 38",
      "    stage: hangers down",
      "spans-per-week: 2.83",
      "spans-per-week-previous:",
      "  - 2026-11-06T22:00-07:00: 2.81",
      "    span: 38",
      "    stage: hangers down",
    ],
    // spans per week alone, its list for the current span and the one before it
    [
      "# the Clayton Clipper's velocity, written by the Leash Log on every push from gantry-cycles.yaml: spans per week, from how far",
      "# the gantry got in the week up to the latest step reported (the weekly shutdown allowed for), with its values at the",
      "# earlier steps on the current span and the one before it (-previous), newest first, with the span and stage of the",
      "# step each was timed by",
      "spans-per-week: 2.83",
      "spans-per-week-previous:",
      "  - 2026-11-06T22:00-07:00: 2.81",
      "    span: 38",
      "    stage: hangers down",
    ],
  ];
  const want = setVelocity(STATUS, { spansPerWeek: 2.83 }).text;
  for (const old of olds) assert.equal(setVelocity(after(old), { spansPerWeek: 2.83 }).text, want);
  // and until then, each with an earlier value is still read for the arrow
  for (const old of olds.slice(1, 3))
    assert.deepEqual(trendOf("2.83", parseStatus(after(old)).header, "spans-per-week"), {
      way: "up",
      from: old.at(-1).split(": ")[1],
    });
});

test("which way a velocity figure went: against gantry-cycles.yaml's newest earlier value, or its figure when the one shown is newer", () => {
  const desk = formatDesk(parseDesk(DESK));
  const history = [
    { key: "2026-11-06T22:00-07:00", spansPerWeek: 2.6, span: 38, stage: "hangers down" },
    { key: "2026-11-05T10:00-07:00", spansPerWeek: 3.0, span: 38, stage: "arrived at span" },
  ];
  const h = parseStatus(setDeskVelocity(desk, { spansPerWeek: 2.83 }, history).text).header;
  // the file holds the figure shown: against the newest earlier value
  assert.deepEqual(trendOf("2.83", h, "spans-per-week"), { way: "up", from: "2.60" });
  // a figure newer than the file (waiting changes, or worked out a new way): against the file's
  assert.deepEqual(trendOf("2.70", h, "spans-per-week"), { way: "down", from: "2.83" });
  // the same as the newest earlier value: no arrow
  const same = parseStatus(setDeskVelocity(desk, { spansPerWeek: 2.6 }, history).text).header;
  assert.equal(trendOf("2.60", same, "spans-per-week"), null);
  // nothing to compare with
  assert.equal(trendOf("2.83", parseStatus(desk).header, "spans-per-week"), null);
  assert.equal(trendOf("2.83", null, "spans-per-week"), null);
});

test("the velocity's history: as worked out at each earlier step of the last 96 hours, with that step's span and stage", () => {
  const entries = runOfCycles();
  let t = parseKey(entries.at(-1).key);
  const names = Object.keys(LENGTHS);
  for (const stage of names.slice(0, 4)) {
    t = afterShiftHours(t, LENGTHS[stage]);
    entries.push({ key: toKey(t), span: 44, stage: names[names.indexOf(stage) + 1] });
  }
  const last = parseKey(entries.at(-1).key);
  const within = (at) => at < last && last - at <= HISTORY_HOURS * 3600 * 1000;
  const history = velocityHistory(entries);
  assert.ok(history.length > 0);
  // newest first, all before the latest step and within 96 hours of it, whatever their span
  for (const [i, h] of history.entries()) {
    const at = parseKey(h.key);
    assert.ok(within(at), h.key);
    if (i) assert.ok(at < parseKey(history[i - 1].key));
    // the velocity as it was then: only the steps logged by that moment
    const then = velocity(entries.filter((e) => parseKey(e.key) <= at));
    assert.equal(h.spansPerWeek, then.spansPerWeek);
    assert.equal(h.stage, then.stage);
    assert.equal(h.span, then.window.span);
    assert.equal(h.stage, entries.find((e) => e.key === h.key).stage);
  }
  // every earlier step of those 96 hours with a velocity by then is in it, and none older
  const kept = entries.filter(
    (e) =>
      e.stage &&
      within(parseKey(e.key)) &&
      velocity(entries.filter((x) => parseKey(x.key) <= parseKey(e.key)))?.spansPerWeek != null,
  );
  assert.deepEqual(new Set(history.map((h) => h.key)), new Set(kept.map((e) => e.key)));
  assert.ok(new Set(kept.map((e) => e.span)).size > 1);
  const old = entries.filter((e) => e.stage && last - parseKey(e.key) > HISTORY_HOURS * 3600 * 1000);
  assert.ok(old.length > 0);
  assert.ok(old.every((e) => !history.some((h) => h.key === e.key)));
  assert.deepEqual(velocityHistory([]), []);
});

test("steps that weren't logged are estimated close to the real ones, and a step still to come isn't", () => {
  const entries = runOfCycles();
  const hidden = entries.filter((e) => e.span === 42 && e.stage !== "hung");
  const rows = stepsWithEstimates(entries.filter((e) => !hidden.includes(e)));
  for (const real of hidden) {
    const row = rows.find((r) => r.span === 42 && r.stage === real.stage);
    assert.equal(row.estimated, true, real.stage);
    assert.ok(Math.abs(parseKey(row.key) - parseKey(real.key)) <= 60 * 60 * 1000, `${real.stage}: ${row.key}`);
  }
  assert.equal(rows.find((r) => r.span === 42 && r.stage === "hung").estimated, false);
  // each step's time runs to the next, so a span's steps add up to its cycle, and the last step has nowhere to run to
  const arrived = (span) => parseKey(rows.find((r) => r.span === span && r.stage === "arrived at span").key);
  const span41 = rows.filter((r) => r.span === 41).reduce((t, r) => t + r.stepHours, 0);
  assert.equal(span41, workingHours(arrived(41), arrived(42)));
  assert.equal(rows.at(-1).stepHours, null);
  // lowest span first
  assert.deepEqual(
    rows.map((r) => r.span),
    rows.map((r) => r.span).sort((a, b) => a - b),
  );
  // the newest span's arrival is logged, and nothing after it: no estimates past it
  assert.deepEqual(
    rows.filter((r) => r.span === 44).map((r) => r.stage),
    ["arrived at span"],
  );
});

test("a follow-up goes under today's or yesterday's update: not older ones, blog posts or a position's note to self", () => {
  const note = (key, fields) => ({ key, followUps: [], fields: { summary: "Something happened.", ...fields } });
  const parsed = {
    notes: [
      note("2026-11-05T22:00-07:00", {}), // the day before yesterday
      note("2026-11-06T00:15-07:00", {}), // yesterday, just after midnight BC time
      note("2026-11-07T08:45-07:00", {}), // today
      note("2026-11-07", { post: true }), // today's blog post
      note("2026-11-07T10:00-07:00", { summary: "" }), // a position's note to self
    ],
  };
  // 9 a.m. on Nov. 7, BC time
  const now = new Date("2026-11-07T09:00-07:00");
  assert.deepEqual(
    recentUpdates(parsed, now).map((n) => n.key),
    ["2026-11-07T08:45-07:00", "2026-11-06T00:15-07:00"],
  );
  // just after midnight, BC time: yesterday is now Nov. 6
  assert.deepEqual(
    recentUpdates(parsed, new Date("2026-11-07T00:05-07:00")).map((n) => n.key),
    ["2026-11-07T08:45-07:00", "2026-11-06T00:15-07:00"],
  );
  // two days later: none, so the tab is off
  assert.deepEqual(recentUpdates(parsed, new Date("2026-11-09T09:00-07:00")), []);
  assert.deepEqual(recentUpdates(null, now), []);
});

test("the velocity over a week: a steady pace comes back, the window moves with each step, and a week of data is needed", () => {
  // spans 40 to 43 in full, then span 44 up to glued, at LENGTHS' shift hours: a span every CYCLE shift hours, and any
  // week holds 110 (a day shift on six days, a night shift on five), so 110 / CYCLE spans a week
  const entries = runOfCycles();
  let t = parseKey(entries.at(-1).key);
  const names = Object.keys(LENGTHS);
  for (const stage of names.slice(0, 4)) {
    t = afterShiftHours(t, LENGTHS[stage]);
    entries.push({ key: toKey(t), span: 44, stage: names[names.indexOf(stage) + 1] });
  }
  const atArrival = velocity(entries.filter((e) => !(e.span === 44 && e.stage !== "arrived at span")));
  const v = velocity(entries);
  for (const x of [atArrival, v]) assert.ok(Math.abs(x.spansPerWeek - 110 / CYCLE) < 0.05, `${x.spansPerWeek}`);
  // the week ends at the latest step: span 44's glued, logged after its arrival
  assert.equal(atArrival.stage, "arrived at span");
  assert.equal(v.stage, "glued");
  assert.equal(v.window.end, entries.at(-1).key);
  assert.ok(parseKey(v.window.end) > parseKey(atArrival.window.end));
  assert.equal(workingHours(parseKey(v.window.start), parseKey(v.window.end)), 132);
  // less than a week of steps: nothing to read the start off
  const short = entries.filter((e) => e.span >= 43);
  assert.equal(velocity(short).spansPerWeek, null);
});
