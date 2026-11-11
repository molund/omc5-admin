// What an irregular shutdown does to the calculations (lib/velocity.js), on a copy of molund/omc5's gantry-cycles.yaml as it was on
// Nov. 11, 2026, Remembrance Day, with the day listed as a holiday from 6 a.m. for 14 hours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDesk } from "../src/lib/deskFile.js";
import {
  afterShiftHours,
  countedAt,
  shutdownEffects,
  shiftHours,
  stepsBySpan,
  stepsWithEstimates,
  velocity,
  withCalendar,
  workingHours,
} from "../src/lib/velocity.js";
import { parseKey } from "../src/lib/time.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const REAL = readFileSync(here("./fixtures/gantry-cycles-2026-11-11.yaml"), "utf8");
const withList = (list) => REAL.replace(/\nentries:/, `\nirregular-shutdowns:\n${list}\nentries:`);
const HOLIDAY = `  - label: Remembrance Day
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14`;
const D = (key) => parseKey(key);

const plain = parseDesk(REAL);
const holiday = parseDesk(withList(HOLIDAY));
const in_ = (entries, fn) => withCalendar(entries, fn);

test("a step reported during a shutdown is counted at its start, whatever the type", () => {
  const at = (entries, key) => in_(entries, () => countedAt(key));
  assert.equal(at(holiday, "2026-11-11T08:45-07:00"), "2026-11-11T06:00-07:00");
  assert.equal(at(holiday, "2026-11-11T19:59-07:00"), "2026-11-11T06:00-07:00");
  assert.equal(at(holiday, "2026-11-11T05:59-07:00"), "2026-11-11T05:59-07:00", "before it");
  assert.equal(at(holiday, "2026-11-11T20:00-07:00"), "2026-11-11T20:00-07:00", "at its end it's over");
  assert.equal(at(holiday, "2026-11-12T09:00-07:00"), "2026-11-12T09:00-07:00", "after it");
  const pump = parseDesk(withList("  - type: mechanical\n    start: 2026-11-11T07:00-07:00\n    hours: 2"));
  assert.equal(at(pump, "2026-11-11T08:00-07:00"), "2026-11-11T07:00-07:00");
  const open = parseDesk(withList("  - type: waiting\n    start: 2026-11-11T07:00-07:00"));
  assert.equal(at(open, "2026-12-30T08:00-07:00"), "2026-11-11T07:00-07:00", "an open shutdown has no end");
  const two = parseDesk(
    withList(
      "  - type: mechanical\n    start: 2026-11-11T07:00-07:00\n    hours: 1\n  - type: mechanical\n    start: 2026-11-11T06:30-07:00\n    hours: 1",
    ),
  );
  assert.equal(at(two, "2026-11-11T07:30-07:00"), "2026-11-11T06:30-07:00", "overlapping: the earliest start");
  assert.equal(
    countedAt("2026-11-11T08:45-07:00"),
    "2026-11-11T08:45-07:00",
    "outside a calculation nothing is in force",
  );
});

test("on the real log, Remembrance Day moves the 8:45 a.m. 'hung' on span 40 to 6:00 a.m.", () => {
  assert.equal(stepsBySpan(plain)[40].hung, "2026-11-11T08:45-07:00");
  assert.equal(stepsBySpan(holiday)[40].hung, "2026-11-11T06:00-07:00");
  // the entry itself is as reported
  assert.equal(holiday[0].key, "2026-11-11T08:45-07:00");
});

test("the shift clock leaves out every irregular shutdown, and working time only the excused ones", () => {
  // Wednesday 5 a.m. to Thursday 6 a.m.: an hour of the night shift, the day shift, the night shift
  const [a, b] = [D("2026-11-11T05:00-07:00"), D("2026-11-12T06:00-07:00")];
  assert.equal(shiftHours(a, b), 21);
  assert.equal(
    in_(holiday, () => shiftHours(a, b)),
    11,
    "the day shift is the holiday",
  );
  const pump = parseDesk(withList("  - type: mechanical\n    start: 2026-11-11T06:00-07:00\n    hours: 14"));
  assert.equal(
    in_(pump, () => shiftHours(a, b)),
    11,
    "a breakdown leaves the shift clock too",
  );
  const [c, d] = [D("2026-11-11T00:00-07:00"), D("2026-11-12T00:00-07:00")];
  assert.equal(workingHours(c, d), 24);
  assert.equal(
    in_(holiday, () => workingHours(c, d)),
    10,
    "14 excused hours are out",
  );
  assert.equal(
    in_(pump, () => workingHours(c, d)),
    24,
    "a breakdown counts against the pace",
  );
});

test("a holiday is excused for 24 hours at most, from its start", () => {
  const long = parseDesk(withList("  - type: holiday\n    start: 2026-11-11T06:00-07:00\n    hours: 38"));
  const [c, d] = [D("2026-11-11T00:00-07:00"), D("2026-11-13T00:00-07:00")];
  assert.equal(workingHours(c, d), 48);
  assert.equal(
    in_(long, () => workingHours(c, d)),
    24,
    "48 hours less 24, not less 38",
  );
});

test("hours that are in the weekly shutdown and an excused holiday are taken out once", () => {
  // Friday Nov. 6, 12:00 to midnight, in a day with the weekly shutdown from 18:00 to 7:00 on Saturday
  const fri = parseDesk(withList("  - type: holiday\n    start: 2026-11-06T12:00-07:00\n    hours: 12"));
  const [c, d] = [D("2026-11-06T00:00-07:00"), D("2026-11-07T12:00-07:00")];
  assert.equal(workingHours(c, d), 36 - 13);
  // the holiday's 12:00 to 24:00 and the weekly 18:00 to 07:00 cover 12:00 to 07:00: 19 hours
  assert.equal(
    in_(fri, () => workingHours(c, d)),
    36 - 19,
  );
});

test("the calendar is in force only during a calculation", () => {
  const [c, d] = [D("2026-11-11T00:00-07:00"), D("2026-11-12T00:00-07:00")];
  in_(holiday, () => velocity(holiday));
  assert.equal(workingHours(c, d), 24);
  assert.equal(shiftHours(c, d), 20);
  // an error inside a calculation doesn't leave it set either
  assert.throws(() =>
    withCalendar(holiday, () => {
      throw new Error("x");
    }),
  );
  assert.equal(workingHours(c, d), 24);
});

test("on the real log: the velocity's week now ends at 6:00 a.m., when the holiday began", () => {
  const without = velocity(plain);
  assert.equal(without.window.end, "2026-11-11T08:45-07:00");
  assert.equal(without.spansPerWeek.toFixed(2), "2.78");
  const v = velocity(holiday);
  assert.equal(v.window.end, "2026-11-11T06:00-07:00");
  assert.equal(v.window.start, "2026-11-04T06:00-07:00");
  assert.equal(v.spansPerWeek.toFixed(2), "2.82");
});

test("the steps list: the step shows at 6:00 a.m., and the stage before it runs to then", () => {
  const rows = stepsWithEstimates(holiday).filter((t) => t.span === 40);
  const hung = rows.find((t) => t.stage === "hung");
  assert.equal(hung.key, "2026-11-11T06:00-07:00");
  // the stage runs from its start to the step, none of it in the holiday
  const hanging = rows.find((t) => t.stage === "hanging started");
  assert.equal(
    hanging.stepHours,
    in_(holiday, () => workingHours(D(hanging.key), D(hung.key))),
  );
  assert.ok(hanging.stepHours < 9, "not the 10.75 hours it was with the 8:45 report");
});

// the real log with one more step after the holiday, so the week ends after it
const LATER = "  - 2026-11-12T07:00-07:00:\n      span: 40\n      stage: gluing started\n";
const later = (list, step = LATER) => parseDesk(withList(list).replace("entries:\n", `entries:\n${step}`));
const H = 3600 * 1000;

test("a holiday in the week extends it by its hours", () => {
  const none = velocity(later(""));
  assert.equal(none.window.end, "2026-11-12T07:00-07:00");
  assert.equal(none.window.start, "2026-11-05T07:00-07:00", "168 hours");
  assert.equal(none.window.extended, 0);

  const entries = later(HOLIDAY);
  const v = velocity(entries);
  assert.equal(v.window.extended, 14);
  assert.equal(v.window.start, "2026-11-04T17:00-07:00");
  assert.equal(parseKey(v.window.end) - parseKey(v.window.start), 182 * H);
  // 182 hours less the weekly shutdown and the holiday is a normal week's working time, so the pace is the distance covered
  assert.equal(
    in_(entries, () => workingHours(D(v.window.start), D(v.window.end))),
    127,
  );
  assert.equal(v.spansPerWeek.toFixed(6), (v.window.to - v.window.from).toFixed(6));
});

test("today, with the week ending where the holiday began, nothing needs extending", () => {
  const v = velocity(holiday);
  assert.equal(v.window.extended, 0);
  assert.equal(v.window.start, "2026-11-04T06:00-07:00");
});

test("a holiday extends the week by 24 hours at most; other types don't extend it", () => {
  // a step after the 38 hours are over (one in them is counted at the start, where the week then ends)
  const after = "  - 2026-11-13T08:00-07:00:\n      span: 40\n      stage: gluing started\n";
  const long = later("  - type: holiday\n    start: 2026-11-11T06:00-07:00\n    hours: 38", after);
  assert.equal(velocity(long).window.end, "2026-11-13T08:00-07:00");
  assert.equal(velocity(long).window.extended, 24);
  const pump = velocity(later("  - type: mechanical\n    start: 2026-11-11T06:00-07:00\n    hours: 14"));
  assert.equal(pump.window.extended, 0);
  assert.equal(pump.window.start, "2026-11-05T07:00-07:00", "a breakdown counts against the pace");
  const wait = velocity(later("  - type: waiting\n    start: 2026-11-11T06:00-07:00\n    hours: 14"));
  assert.equal(wait.window.extended, 0);
});

test("a holiday that starts before the week does: reaching back brings the rest of it in", () => {
  // Thursday Nov. 5, all day: the 168 hours back from Thursday Nov. 12, 7 a.m. start inside it
  const v = velocity(later("  - type: holiday\n    start: 2026-11-05T00:00-07:00\n    hours: 24"));
  assert.equal(v.window.extended, 24);
  assert.equal(v.window.start, "2026-11-04T07:00-07:00");
});

test("hours already in the weekly shutdown don't extend the week", () => {
  // Friday Nov. 6, 12:00 to midnight: 6 of its hours are before the weekly shutdown starts at 18:00
  const v = velocity(later("  - type: holiday\n    start: 2026-11-06T12:00-07:00\n    hours: 12"));
  assert.equal(v.window.extended, 6);
});

test("a step that was moved says when it was reported, and so does the week's last step", () => {
  const rows = stepsWithEstimates(holiday).filter((t) => t.span === 40);
  assert.equal(rows.find((t) => t.stage === "hung").reported, "2026-11-11T08:45-07:00");
  assert.equal(rows.find((t) => t.stage === "arrived at span").reported, null);
  assert.equal(velocity(holiday).window.reported, "2026-11-11T08:45-07:00");
  assert.equal(velocity(plain).window.reported, null);
});

test("a gap's weekly part leaves out a holiday's hours", () => {
  // Saturday's weekly shutdown ends Sunday at 20:00; a holiday on the Monday is a separate gap
  const mon = parseDesk(withList("  - type: holiday\n    start: 2026-11-09T06:00-07:00\n    hours: 14"));
  const none = stepsWithEstimates(plain);
  const some = stepsWithEstimates(mon);
  // no step's weekly gap changes, though the holiday is out of the hours between steps
  assert.deepEqual(
    some.map((t) => t.weeklyGap),
    none.map((t) => t.weeklyGap),
  );
  assert.ok(
    some.some((t, i) => t.stepHours !== none[i].stepHours),
    "the holiday is out of some step's hours",
  );
  // and the weekly shutdown is in a gap, once
  assert.ok(none.some((t) => t.weeklyGap > 20));
});

test("what each shutdown does to the week", () => {
  const now = new Date("2026-11-11T08:45:00-07:00");
  const [today] = shutdownEffects(holiday, velocity(holiday), now);
  assert.equal(today.shutdown.label, "Remembrance Day");
  assert.deepEqual([today.state, today.inWeek, today.extends], ["on", 0, 0], "the week ends where it began");

  const entries = later(`${HOLIDAY}
  - label: Pump
    type: mechanical
    start: 2026-11-08T22:00-07:00
    hours: 2
  - label: Typo
    type: holiday
    hours: 4`);
  const effects = shutdownEffects(entries, velocity(entries), new Date("2026-11-12T09:00:00-07:00"));
  const by = Object.fromEntries(effects.map((e) => [e.shutdown.label, e]));
  assert.deepEqual(
    [by["Remembrance Day"].state, by["Remembrance Day"].inWeek, by["Remembrance Day"].extends],
    ["over", 14, 14],
  );
  assert.deepEqual([by["Pump"].inWeek, by["Pump"].extends], [2, 0], "in the week, but it counts against the pace");
  assert.deepEqual([by["Typo"].state, by["Typo"].inWeek], ["error", 0]);
  assert.deepEqual(
    effects.map((e) => e.shutdown.label),
    ["Remembrance Day", "Pump", "Typo"],
    "newest first, and one with no start last",
  );
});

// an open shutdown has no end, so the shift clock has no shifts after it starts; the walks through the shifts must stop there
// (they once never did). Each test has a time limit so a hang fails quickly.
const OPEN = "  - label: Remembrance Day\n    type: holiday\n    start: 2026-11-11T06:00-07:00";

test("an open shutdown: the shift clock stops where it starts", { timeout: 10000 }, () => {
  const open = parseDesk(withList(OPEN));
  const [a, b] = [D("2026-11-11T00:00-07:00"), D("2027-06-01T00:00-07:00")];
  assert.equal(
    in_(open, () => shiftHours(a, b)),
    6,
    "only the night shift's hours before it began",
  );
  assert.equal(
    in_(open, () => afterShiftHours(D("2026-11-11T05:00-07:00"), 100)),
    undefined,
    "the hours run out",
  );
  assert.equal(
    in_(open, () => afterShiftHours(D("2026-11-11T05:00-07:00"), 1))?.toISOString(),
    D("2026-11-11T06:00-07:00").toISOString(),
  );
  assert.equal(
    in_(open, () => shiftHours(D("2026-12-01T00:00-07:00"), D("2026-12-05T00:00-07:00"))),
    0,
    "after it began",
  );
});

test("an open shutdown: the velocity and the steps are worked out, as with it closed", { timeout: 20000 }, () => {
  const open = parseDesk(withList(OPEN));
  const v = velocity(open);
  assert.equal(v.window.end, "2026-11-11T06:00-07:00");
  assert.equal(v.spansPerWeek.toFixed(2), "2.82", "the same as with the 14 hours written in");
  assert.ok(stepsWithEstimates(open).length > 0);
  const [e] = shutdownEffects(open, v, new Date("2026-11-11T09:00:00-07:00"));
  assert.deepEqual([e.shutdown.open, e.state, e.extends], [true, "on", 0]);
  // a step reported long after is counted at its start
  const later = parseDesk(
    withList(OPEN).replace(
      "entries:\n",
      "entries:\n  - 2026-12-01T09:00-07:00:\n      span: 41\n      stage: arrived at span\n",
    ),
  );
  assert.equal(velocity(later).window.end, "2026-11-11T06:00-07:00");
});
