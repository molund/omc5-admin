// Irregular shutdowns: the list in gantry-cycles.yaml, read by hand-friendly rules, and the time ranges the velocity uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShutdowns, rangesOf, typeInfo, HOLIDAY_CAP_HOURS, HOUR } from "../src/lib/shutdowns.js";
import { parseDesk } from "../src/lib/deskFile.js";
import { parseKey } from "../src/lib/time.js";

const FILE = `# header comments
irregular-shutdowns:
  # a comment inside the list is fine
  - label: Remembrance Day
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14
  - label: "Hydraulic pump failure"
    type: mechanical
    start: 2026-11-14T10:15-07:00
    end: 2026-11-14T15:15-07:00   # fixed by the afternoon crew
  - type: waiting
    start: 2026-11-20T08:00-07:00
  - label: Both given
    type: holiday
    start: 2026-12-25T00:00-07:00
    end: 2026-12-26T00:00-07:00
    hours: 24
spans-per-week: 2.81
entries:
  - 2026-11-11T08:45-07:00:
      span: 40
      stage: hung
`;

test("the list is read: hours, end, open-ended, quoted labels and trailing comments", () => {
  const [day, pump, wait, both] = parseShutdowns(FILE);
  assert.equal(day.label, "Remembrance Day");
  assert.equal(day.type, "holiday");
  assert.equal(day.hours, 14);
  assert.equal(day.length, 14);
  assert.equal(day.endMs - day.startMs, 14 * HOUR);
  assert.equal(day.startMs, +parseKey("2026-11-11T06:00-07:00"));
  assert.deepEqual(day.errors, []);

  assert.equal(pump.label, "Hydraulic pump failure");
  assert.equal(pump.end, "2026-11-14T15:15-07:00", "the trailing comment isn't part of the value");
  assert.equal(pump.length, 5);

  assert.equal(wait.label, "Waiting on work ahead", "no label: the type's name");
  assert.equal(wait.open, true);
  assert.equal(wait.endMs, Infinity);
  assert.equal(wait.length, null);

  assert.equal(both.length, 24);
  assert.deepEqual(both.warnings, [], "end and hours agree");
});

test("the list stops at the next key, and a file without one has none", () => {
  assert.equal(parseShutdowns(FILE).length, 4);
  assert.deepEqual(parseShutdowns("entries:\n  - 2026-11-11T08:45-07:00:\n      span: 40\n"), []);
  assert.deepEqual(parseShutdowns(""), []);
  assert.deepEqual(parseShutdowns(undefined), []);
  assert.deepEqual(parseShutdowns("irregular-shutdowns:\nentries:\n"), []);
});

test("what's wrong is said, and an entry with an error is left out of the ranges", () => {
  const bad = parseShutdowns(`irregular-shutdowns:
  - label: No start
    type: holiday
    hours: 5
  - label: Backwards
    type: holiday
    start: 2026-11-11T20:00-07:00
    end: 2026-11-11T06:00-07:00
  - label: Zero
    type: mechanical
    start: 2026-11-11T06:00-07:00
    hours: 0
  - label: No type
    start: 2026-11-11T06:00-07:00
    hours: 3
  - label: Typo
    type: mecanical
    start: 2026-11-11T06:00-07:00
    hours: 3
  - label: Disagree
    type: mechanical
    start: 2026-11-11T06:00-07:00
    end: 2026-11-11T09:00-07:00
    hours: 5
  - label: Bad time
    type: holiday
    start: tomorrow
    hours: 5
`);
  const by = Object.fromEntries(bad.map((s) => [s.label, s]));
  assert.match(by["No start"].errors[0], /no start/);
  assert.match(by["Backwards"].errors[0], /end isn't after start/);
  assert.match(by["Zero"].errors[0], /hours/);
  assert.equal(by["Zero"].open, false, "bad hours isn't an open shutdown");
  assert.match(by["No type"].errors[0], /no type/);
  assert.match(by["Bad time"].errors[0], /isn't a time stamp/);
  assert.equal(by["Typo"].known, false);
  assert.deepEqual(by["Typo"].errors, []);
  assert.match(by["Typo"].warnings[0], /not a known type/);
  assert.match(by["Disagree"].warnings[0], /end is used/);
  assert.equal(by["Disagree"].length, 3);
  // only the ones without errors count: Typo and Disagree
  assert.equal(rangesOf(bad).off.length, 2);
});

test("ranges: every valid shutdown is off, only a holiday is excused, and a holiday is excused up to 24 hours", () => {
  const list = parseShutdowns(`irregular-shutdowns:
  - label: Long holiday
    type: holiday
    start: 2026-12-24T08:00-07:00
    hours: 38
  - label: Short holiday
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14
  - label: Pump
    type: mechanical
    start: 2026-11-14T10:00-07:00
    hours: 5
  - label: Open wait
    type: waiting
    start: 2026-11-20T08:00-07:00
`);
  const { off, excused } = rangesOf(list);
  assert.equal(off.length, 4);
  assert.equal(off[0][1] - off[0][0], 38 * HOUR);
  assert.equal(off[3][1], Infinity);
  assert.equal(excused.length, 2);
  assert.equal(excused[0][1] - excused[0][0], HOLIDAY_CAP_HOURS * HOUR, "capped");
  assert.equal(excused[1][1] - excused[1][0], 14 * HOUR);
});

test("the types: names, icons and which are excused", () => {
  assert.deepEqual(
    ["holiday", "mechanical", "waiting"].map((t) => [typeInfo(t).icon, typeInfo(t).excused]),
    [
      ["palm", true],
      ["wrench", false],
      ["hourglass", false],
    ],
  );
  assert.deepEqual(typeInfo("weather"), { name: "weather", icon: null, excused: false, known: false });
});

test("parseDesk carries the shutdowns without changing the entries", () => {
  const entries = parseDesk(FILE);
  assert.equal(entries.length, 1);
  assert.equal(entries.shutdowns.length, 4);
  assert.deepEqual(Object.keys(entries), ["0"], "not an enumerable property");
  assert.equal([...entries].length, 1);
  assert.equal(parseDesk("entries:\n").shutdowns.length, 0);
});
