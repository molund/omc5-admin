// The night-shift-off list in gantry-cycles.yaml (lib/nightsOff.js): read, checked, and carried by parseDesk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNightsOff, nightRangesOf, parseNightsOff } from "../src/lib/nightsOff.js";
import { EMPTY_DESK, parseDesk } from "../src/lib/deskFile.js";
import { parseKey } from "../src/lib/time.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const DAY = 24 * 3600 * 1000;
const ms = (key) => parseKey(key).getTime();
// a shift-schedule.yaml with this night-shift-off list
const withNights = (list) => `night-shift-off:\n${list}\n`;

test("the list is read: an open stretch and a closed one, the end inclusive", () => {
  const list = parseNightsOff(`night-shift-off:
  # the night crew stood down
  - start: 2026-11-16
  - start: "2026-10-05"   # a week
    end: 2026-10-09
entries:
`);
  assert.equal(list.length, 2);
  const [open, week] = list;
  assert.deepEqual([open.start, open.end, open.open, open.nights, open.errors], ["2026-11-16", null, true, null, []]);
  assert.equal(open.startMs, ms("2026-11-16"));
  assert.equal(open.endMs, Infinity);
  assert.equal(week.endMs, ms("2026-10-10"), "the end's own night is off: up to the next midnight");
  assert.equal(week.nights, 5);
  assert.deepEqual(nightRangesOf(list), [
    [ms("2026-11-16"), Infinity],
    [ms("2026-10-05"), ms("2026-10-05") + 5 * DAY],
  ]);
});

test("a schedule without the list has none, and parseDesk carries it without changing the entries", () => {
  assert.deepEqual(parseNightsOff("entries:\n"), []);
  const desk = parseDesk(EMPTY_DESK, withNights("  - start: 2026-11-16"));
  assert.equal(desk.nightsOff.length, 1);
  assert.ok(!Object.keys(desk).includes("nightsOff"), "not enumerable");
  assert.deepEqual(parseDesk(EMPTY_DESK).nightsOff, [], "no schedule, no nights off");
});

test("what's wrong is said, and a stretch with an error is left out of the ranges", () => {
  const text = `night-shift-off:
  - start: 2026-11-16T20:00-07:00
  - start: tomorrow
  - end: 2026-11-20
  - start: 2026-11-20
    end: 2026-11-19
  - start: 2026-12-01
    end: 2026-12-04
    label: Crew away
  - start: 2026-12-03
    end: 2026-12-10
  - {start: 2027-01-01}
night-shift-off:
entries:
`;
  const lineOf = (needle) => text.split("\n").findIndex((l) => l.includes(needle)) + 1;
  const found = checkNightsOff(text);
  const has = (needle, level, re) =>
    assert.ok(
      found.some((p) => p.line === lineOf(needle) && p.level === level && re.test(p.message)),
      `${needle}: ${re}`,
    );
  has("start: 2026-11-16T20:00", "error", /isn't a date/);
  has("start: tomorrow", "error", /start "tomorrow" isn't a date/);
  has("- end: 2026-11-20", "error", /no start/);
  has("start: 2026-11-20", "error", /end is before start/);
  has("start: 2026-12-01", "warning", /unknown field "label"/);
  has("start: 2026-12-01", "warning", /overlaps Night shift off from 2026-12-03/);
  has("start: 2026-12-03", "warning", /overlaps Night shift off from 2026-12-01/);
  has("{start: 2027-01-01}", "error", /can't be read/);
  assert.ok(found.some((p) => p.level === "error" && /more than once/.test(p.message)));
  assert.deepEqual(
    nightRangesOf(parseNightsOff(text)).map(([s]) => s),
    [ms("2026-12-01"), ms("2026-12-03")],
    "only the two without errors",
  );
});

test("the check script fails on a bad stretch, on its line, and passes a good one", () => {
  const dir = mkdtempSync(join(tmpdir(), "nights-off-"));
  const run = (text) => {
    const file = join(dir, "gantry-cycles.yaml");
    writeFileSync(file, text);
    return spawnSync("node", [here("../scripts/check-shutdowns.mjs"), file], { encoding: "utf8" });
  };
  const bad = withNights("  - start: tomorrow");
  const out = run(bad);
  assert.equal(out.status, 1);
  const line = bad.split("\n").findIndex((l) => l.includes("start: tomorrow")) + 1;
  assert.match(out.stdout, new RegExp(`line=${line}::Night shift off from tomorrow: start "tomorrow" isn't a date`));
  assert.match(out.stdout, /nights off, so nothing is deployed/);
  const good = run(withNights("  - start: 2026-11-16"));
  assert.equal(good.status, 0, good.stdout);
});
