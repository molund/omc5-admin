// The check that stops a bad irregular shutdowns list being deployed (scripts/check-shutdowns.mjs, run by molund/omc5's
// workflows): everything wrong with the list is found, on its line, and warnings count as failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkShutdowns } from "../src/lib/shutdowns.js";
import { EMPTY_DESK } from "../src/lib/deskFile.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const GOOD = `irregular-shutdowns:
  - label: Remembrance Day
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14
  - label: Pump
    type: mechanical
    start: 2026-11-14T10:15-07:00
    end: 2026-11-14T15:15-07:00
  - label: Christmas
    type: holiday
    start: 2026-12-25T00:00-07:00
    hours: 24
  - label: Boxing Day
    type: holiday
    start: 2026-12-26T00:00-07:00
    hours: 24
  - label: Waiting for the caps
    type: waiting
    start: 2026-12-28T08:00-07:00
entries:
`;

const BAD = `irregular-shutdowns:
  - label: Good
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14
  - label: Typo in the type
    type: mecanical
    start: 2026-11-14T10:00-07:00
    hours: 2
  - label: Christmas and Boxing Day
    type: holiday
    start: 2026-12-25T00:00-07:00
    hours: 48
  - label: Overlap A
    type: mechanical
    start: 2026-11-20T08:00-07:00
    hours: 4
  - label: Overlap B
    type: mechanical
    start: 2026-11-20T10:00-07:00
    hours: 4
  - label: Typo in a field
    type: waiting
    start: 2026-11-25T08:00-07:00
    end: 2026-11-25T11:00-07:00
    hour: 3
  - {label: Flow style}
  - label: No start
    type: holiday
    hours: 5
  - label: Disagree
    type: mechanical
    start: 2026-11-27T08:00-07:00
    end: 2026-11-27T10:00-07:00
    hours: 5
entries:
`;

const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle)) + 1;

test("a good list has no problems, and neither does a file with no list", () => {
  assert.deepEqual(checkShutdowns(GOOD), []);
  assert.deepEqual(checkShutdowns(EMPTY_DESK), []);
  assert.deepEqual(checkShutdowns(""), []);
  // Christmas and Boxing Day as two holidays of 24 hours, back to back, don't overlap
  assert.deepEqual(
    checkShutdowns(GOOD).filter((p) => /Christmas|Boxing/.test(p.message)),
    [],
  );
});

test("every kind of mistake is found, on its line, errors and warnings alike", () => {
  const problems = checkShutdowns(BAD);
  const at = (needle) => problems.filter((p) => p.line === lineOf(BAD, needle));
  const only = (needle) => {
    const found = at(needle);
    assert.equal(found.length, 1, `${needle}: ${JSON.stringify(found)}`);
    return found[0];
  };
  assert.deepEqual(at("label: Good"), []);
  assert.match(only("label: Typo in the type").message, /"mecanical" is not a known type/);
  assert.equal(only("label: Typo in the type").level, "warning");
  assert.match(only("label: Christmas and Boxing Day").message, /48h but a holiday is excused for 24h at most/);
  assert.match(only("label: Typo in a field").message, /unknown field "hour"/);
  assert.match(only("{label: Flow style}").message, /this line can't be read/);
  assert.equal(only("{label: Flow style}").level, "error");
  assert.match(only("label: No start").message, /no start/);
  assert.equal(only("label: No start").level, "error");
  assert.match(only("label: Disagree").message, /end and hours disagree/);
  // the two that overlap, each about the other
  assert.match(only("label: Overlap A").message, /overlaps Overlap B/);
  assert.match(only("label: Overlap B").message, /overlaps Overlap A/);
  // in file order
  assert.deepEqual(
    problems.map((p) => p.line),
    [...problems.map((p) => p.line)].sort((a, b) => a - b),
  );
});

test("the key twice is an error, and an open shutdown overlaps what comes after it", () => {
  const twice = GOOD.replace(
    "entries:",
    "irregular-shutdowns:\n  - label: Again\n    type: waiting\n    start: 2027-01-05T08:00-07:00\n    hours: 2\nentries:",
  );
  const found = checkShutdowns(twice);
  assert.equal(found.filter((p) => /more than once/.test(p.message)).length, 1);
  assert.equal(
    found.find((p) => /more than once/.test(p.message)).line,
    lineOf(twice, "irregular-shutdowns:") +
      twice
        .split("\n")
        .slice(lineOf(twice, "irregular-shutdowns:"))
        .findIndex((l) => l.startsWith("irregular-shutdowns:")) +
      1,
  );
  // the open wait (from Dec. 28) overlaps the one added after it
  assert.ok(found.some((p) => /Again: overlaps Waiting for the caps/.test(p.message)));
});

test("the script prints annotations and exits 1 when anything's wrong, 0 when not", () => {
  const dir = mkdtempSync(join(tmpdir(), "shutdowns-"));
  const run = (text) => {
    const file = join(dir, "gantry-cycles.yaml");
    writeFileSync(file, text);
    return spawnSync("node", [here("../scripts/check-shutdowns.mjs"), file], { encoding: "utf8" });
  };
  const bad = run(BAD);
  assert.equal(bad.status, 1);
  assert.match(
    bad.stdout,
    new RegExp(`::error file=.*gantry-cycles.yaml,line=${lineOf(BAD, "label: No start")}::No start: no start`),
  );
  assert.match(bad.stdout, /nothing is deployed/);
  const good = run(GOOD);
  assert.equal(good.status, 0);
  assert.doesNotMatch(good.stdout, /::error/);
  assert.match(good.stdout, /are fine/);
  // the real log with Remembrance Day in it passes
  const real = readFileSync(here("./fixtures/gantry-cycles-2026-11-11.yaml"), "utf8").replace(
    "\nentries:",
    "\nirregular-shutdowns:\n  - label: Remembrance Day\n    type: holiday\n    start: 2026-11-11T06:00-07:00\n    hours: 14\nentries:",
  );
  assert.equal(run(real).status, 0);
});
