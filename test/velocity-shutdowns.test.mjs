// What an irregular shutdown does to the calculations (lib/velocity.js), on a copy of molund/omc5's gantry-cycles.yaml as it was on
// Nov. 11, 2026, Remembrance Day, with the day listed as a holiday from 6 a.m. for 14 hours.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDesk } from "../src/lib/deskFile.js";
import {
  countedAt,
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
  assert.equal(without.spansPerWeek.toFixed(2), "2.79");
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
