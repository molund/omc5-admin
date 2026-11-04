// Time stamps are read by our own parser, not the engine's: the same answers as a standards-following engine, so iOS's
// engine can't read one differently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKey, toKey, shiftKey, dayOf } from "../src/lib/time.js";

test("parseKey agrees with the engine on the forms status.yaml uses", () => {
  for (const key of [
    "2026-11-04T16:30-07:00",
    "2026-11-03T07:15-07:00",
    "2026-10-31T00:00-07:00",
    "2026-11-04T19:33:14.043Z",
    "2026-11-04T19:33:14Z",
    "2026-01-01T00:00+05:30",
    "2026-12-31T23:45-0700",
  ])
    assert.equal(+parseKey(key), +new Date(key), key);
});

test("a date alone is the start of that day in BC time, and a time with no zone is BC time", () => {
  assert.equal(+parseKey("2026-11-01"), +new Date("2026-11-01T00:00-07:00"));
  assert.equal(+parseKey("2026-11-04T16:30"), +new Date("2026-11-04T16:30-07:00"));
});

test("parseKey rejects what isn't a date, and days that don't exist", () => {
  for (const bad of [
    "",
    "tomorrow",
    "2026-13-01",
    "2026-02-30",
    "2026-11-04T24:00-07:00",
    "2026-11-04T16:60-07:00",
    "11/04/2026",
  ])
    assert.ok(isNaN(parseKey(bad)), bad);
  assert.ok(!isNaN(parseKey("2028-02-29")), "leap day");
});

test("keys round-trip", () => {
  const key = "2026-11-04T16:30-07:00";
  assert.equal(toKey(parseKey(key)), key);
  assert.equal(shiftKey(key, 15), "2026-11-04T16:45-07:00");
  assert.equal(shiftKey("2026-11-04", 1440), "2026-11-05");
  assert.equal(dayOf("2026-11-05T00:30-07:00"), "2026-11-05");
});
