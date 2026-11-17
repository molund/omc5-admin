// gantry-cycles.yaml is the Leash Log's alone: the work schedule (irregular shutdowns, nights off) is in shift-schedule.yaml,
// written by hand, which the Leash Log reads and never writes (lib/scheduleFile.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EMPTY_DESK, formatDesk, parseDesk } from "../src/lib/deskFile.js";
import { applyBoth } from "../src/lib/deskChanges.js";

const STATUS = readFileSync(fileURLToPath(new URL("./fixtures/status.yaml", import.meta.url)), "utf8");
const SCHEDULE = `irregular-shutdowns:
  - label: Remembrance Day
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14
night-shift-off:
  - start: 2026-11-16
`;
const move = { kind: "move", time: "2026-11-06T20:00-07:00", span: 38, complete: false, noteToSelf: "hello" };

test("gantry-cycles.yaml is written with no schedule in it", () => {
  assert.doesNotMatch(formatDesk([]), /^(irregular-shutdowns|night-shift-off):/m);
  assert.equal(EMPTY_DESK, formatDesk([]));
  assert.match(EMPTY_DESK, /shift-schedule\.yaml/, "the header says where the schedule is");
});

test("a push reads the schedule and leaves it alone", () => {
  const out = applyBoth({ status: STATUS, desk: EMPTY_DESK, schedule: SCHEDULE }, move);
  assert.doesNotMatch(out.desk, /^(irregular-shutdowns|night-shift-off):/m);
  const entries = parseDesk(out.desk, SCHEDULE);
  assert.deepEqual([entries.shutdowns.length, entries.nightsOff.length], [1, 1]);
});

test("lists left in gantry-cycles.yaml are neither read nor written back", () => {
  const old = EMPTY_DESK.replace("\nentries:", `\n${SCHEDULE}entries:`);
  const entries = parseDesk(old);
  assert.deepEqual([entries.shutdowns.length, entries.nightsOff.length], [0, 0]);
  const out = applyBoth({ status: STATUS, desk: old }, move).desk;
  assert.doesNotMatch(out, /^(irregular-shutdowns|night-shift-off):/m);
});
