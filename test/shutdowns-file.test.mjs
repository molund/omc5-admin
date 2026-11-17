// The irregular shutdowns list is written by hand, and the Leash Log writes gantry-cycles.yaml whole on every push: the list, its
// comments and its spacing have to come through untouched, with the velocity block and the entries around it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EMPTY_DESK, formatDesk, parseDesk, rawBlock } from "../src/lib/deskFile.js";
import { applyBoth } from "../src/lib/deskChanges.js";
import { setDeskVelocity } from "../src/lib/changes.js";
import { velocityPoints } from "./fixtures/velocityChart.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const STATUS = readFileSync(here("./fixtures/status.yaml"), "utf8");

// a list as someone might leave it: a comment inside, one at the left edge between items, a spare example, spacing
const LIST = `irregular-shutdowns:
  # added Nov. 11
  - label: Remembrance Day
    type: holiday
    start: 2026-11-11T06:00-07:00
    hours: 14

# a comment at the left edge, in the middle of the list
  - label: "Pump, again"   # fixed by lunch
    type: mechanical
    start: 2026-11-14T10:15-07:00
    end: 2026-11-14T15:15-07:00
  #  - label: Unused example
  #    type: waiting`;

const FILE = `# the file's own header
${LIST}
# the Clayton Clipper's velocity, written by the Leash Log on every push
spans-per-week: 2.81
entries:
  - 2026-11-06T08:00-07:00:
      span: 38
      stage: arrived at span
`;

test("the block is taken whole: from its key to its last indented line, and not the velocity's comment", () => {
  assert.equal(rawBlock(FILE, "irregular-shutdowns").join("\n"), LIST);
  assert.equal(rawBlock("entries:\n", "irregular-shutdowns"), null);
  assert.deepEqual(rawBlock("irregular-shutdowns:\nentries:\n", "irregular-shutdowns"), ["irregular-shutdowns:"]);
  assert.deepEqual(rawBlock("irregular-shutdowns:   # none yet\nentries:\n", "irregular-shutdowns"), [
    "irregular-shutdowns:   # none yet",
  ]);
});

test("the file written fresh has the key, with the examples above it, before the entries", () => {
  const text = formatDesk([]);
  const lines = text.split("\n");
  const at = (line) => lines.indexOf(line);
  assert.ok(at("irregular-shutdowns:") > 0 && at("irregular-shutdowns:") < at("night-shift-off:"));
  assert.equal(at("entries:"), at("night-shift-off:") + 1);
  assert.match(
    text,
    /#   - label: Remembrance Day\n#     type: holiday\n#     start: 2026-11-11T06:00-07:00\n#     hours: 14/,
  );
  assert.match(text, /# Examples \(take out the "# "\):/);
  assert.equal(EMPTY_DESK, text);
  assert.deepEqual(parseDesk(text).shutdowns, [], "the examples are comments, so there are none");
});

test("the examples work: take out the '# ' and they're read", () => {
  // the shutdowns' comment only, up to the night-shift-off list's
  const examples = formatDesk([])
    .split("# night-shift-off:")[0]
    .split("\n")
    .filter(
      (l) =>
        /^#   +(-|[a-z]+:)/.test(l) &&
        !/^#   (label|type|start|end|hours|with)/.test(l) &&
        !/^#     (those|a BC|either)/.test(l),
    )
    .map((l) => l.slice(2));
  const read = parseDesk(`irregular-shutdowns:\n${examples.join("\n")}\nentries:\n`).shutdowns;
  assert.deepEqual(
    read.map((s) => [s.label, s.type, s.errors.length]),
    [
      ["Remembrance Day", "holiday", 0],
      ["Hydraulic pump failure", "mechanical", 0],
      ["Waiting for the caps at span 31", "waiting", 0],
      ["Thunderstorm", "weather", 0],
    ],
  );
});

test("a push writes the list back as it was", () => {
  const change = { kind: "move", time: "2026-11-06T20:00-07:00", span: 38, complete: false, noteToSelf: "hello" };
  const out = applyBoth({ status: STATUS, desk: FILE }, change).desk;
  assert.ok(out.includes(LIST + "\n"), "the list, its comments and its spacing, line for line");
  assert.ok(out.indexOf("\nirregular-shutdowns:") < out.indexOf("\nentries:"));
  assert.deepEqual(
    parseDesk(out).shutdowns.map((s) => [s.label, s.errors.length]),
    [
      ["Remembrance Day", 0],
      ["Pump, again", 0],
    ],
  );
  // the change's own entry is there, newest first
  assert.equal(parseDesk(out)[0].key, "2026-11-06T20:00-07:00");
});

test("the velocity block goes between the list and the entries, and writing it again replaces it", () => {
  const text = formatDesk([{ key: "2026-11-06T08:00-07:00", span: 38, stage: "arrived at span", noteToSelf: "" }], {
    shutdowns: rawBlock(FILE, "irregular-shutdowns"),
  });
  const once = setDeskVelocity(text, { spansPerWeek: 2.81 }, []).text;
  const twice = setDeskVelocity(once, { spansPerWeek: 2.9 }, []).text;
  for (const out of [once, twice]) {
    const at = (re) => out.search(re);
    assert.ok(at(/^irregular-shutdowns:/m) < at(/^spans-per-week:/m), "list before velocity");
    assert.ok(at(/^spans-per-week:/m) < at(/^entries:/m), "velocity before entries");
    assert.ok(out.includes(LIST + "\n"), "the list is as it was");
    assert.equal(out.match(/^spans-per-week:/gm).length, 1);
  }
  assert.match(twice, /^spans-per-week: 2\.90$/m);
  // the site's chart reader still finds the velocity and the first entry with the list in the file
  assert.equal(velocityPoints(twice).at(-1).value, 2.9);
});

test("a second push changes nothing it shouldn't: the list is stable", () => {
  const first = applyBoth(
    { status: STATUS, desk: FILE },
    { kind: "move", time: "2026-11-06T20:00-07:00", span: 38, complete: false, noteToSelf: "hello" },
  );
  const second = applyBoth(
    { status: first.status, desk: first.desk },
    { kind: "move", time: "2026-11-06T21:00-07:00", span: 38, complete: false, noteToSelf: "again" },
  );
  assert.equal(rawBlock(second.desk, "irregular-shutdowns").join("\n"), LIST);
  assert.equal(second.desk.match(/^irregular-shutdowns:/gm).length, 1, "never twice");
});

test("a file with no list gets the key, so entries can be added under it", () => {
  const old =
    EMPTY_DESK.replace(/\nirregular-shutdowns:\n/, "\n") +
    "  - 2026-11-06T08:00-07:00:\n      span: 38\n      stage: arrived at span\n";
  assert.ok(!/^irregular-shutdowns:/m.test(old));
  const out = applyBoth(
    { status: STATUS, desk: old },
    { kind: "move", time: "2026-11-06T20:00-07:00", span: 38, complete: false, noteToSelf: "hello" },
  ).desk;
  assert.match(out, /\nirregular-shutdowns:\n# night-shift-off:/);
});

const NIGHTS = `night-shift-off:
  # the night crew stood down
  - start: 2026-11-16
  - start: 2026-10-05
    end: 2026-10-09`;

test("the night-shift-off list is written back as it was, after the shutdowns, and a second push keeps it", () => {
  const file = FILE.replace("\n# the Clayton Clipper's velocity", `\n${NIGHTS}\n# the Clayton Clipper's velocity`);
  assert.equal(rawBlock(file, "night-shift-off").join("\n"), NIGHTS);
  assert.equal(rawBlock(file, "irregular-shutdowns").join("\n"), LIST, "the shutdowns stop before it");
  const first = applyBoth(
    { status: STATUS, desk: file },
    { kind: "move", time: "2026-11-06T20:00-07:00", span: 38, complete: false, noteToSelf: "hello" },
  );
  const second = applyBoth(
    { status: first.status, desk: first.desk },
    { kind: "move", time: "2026-11-06T21:00-07:00", span: 38, complete: false, noteToSelf: "again" },
  );
  for (const out of [first.desk, second.desk]) {
    assert.ok(out.includes(NIGHTS + "\n"), "line for line");
    assert.ok(out.includes(LIST + "\n"));
    assert.equal(out.match(/^night-shift-off:/gm).length, 1, "never twice");
    assert.ok(out.search(/^irregular-shutdowns:/m) < out.search(/^night-shift-off:/m));
    assert.ok(out.search(/^night-shift-off:/m) < out.search(/^entries:/m));
  }
});

test("a file with no night-shift-off list gets the key", () => {
  const out = applyBoth(
    { status: STATUS, desk: FILE },
    { kind: "move", time: "2026-11-06T20:00-07:00", span: 38, complete: false, noteToSelf: "hello" },
  ).desk;
  assert.deepEqual(rawBlock(out, "night-shift-off"), ["night-shift-off:"]);
});

test("the night-shift-off example works: take out the '# ' and it's read", () => {
  const comment = formatDesk([]).split("# night-shift-off:")[1].split("\nnight-shift-off:")[0];
  const example = comment
    .split("\n")
    .filter((l) => /^#   (- |  )[a-z]+:/.test(l))
    .map((l) => l.slice(2));
  assert.deepEqual(example, ["  - start: 2026-11-16", "    end: 2026-12-04"]);
});
