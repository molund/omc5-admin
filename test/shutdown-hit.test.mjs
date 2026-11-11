// The review warns when a step a change reports falls inside an irregular shutdown, since it will be counted at the shutdown's
// start (shutdownsHit in lib/deskChanges.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EMPTY_DESK, formatDesk, parseDesk } from "../src/lib/deskFile.js";
import { applyBoth, shutdownsHit } from "../src/lib/deskChanges.js";
import { headerOf, parseStatus } from "../src/lib/statusFile.js";

const STATUS = readFileSync(fileURLToPath(new URL("./fixtures/status.yaml", import.meta.url)), "utf8");
const head = headerOf(parseStatus(STATUS));

const desk = (...lines) =>
  formatDesk(parseDesk(EMPTY_DESK), { shutdowns: ["irregular-shutdowns:", ...lines.map((l) => `  ${l}`)] });
const OPEN = desk("- label: Remembrance Day", "  type: holiday", "  start: 2026-11-11T06:00-07:00");
const CLOSED = desk("- label: Remembrance Day", "  type: holiday", "  start: 2026-11-11T06:00-07:00", "  hours: 14");

// a move to the next span at a time: it logs "arrived at span" there
const arrive = (time) => ({ kind: "move", time, span: head.span + 1, complete: false });
const hit = (before, change) => shutdownsHit(before, applyBoth({ status: STATUS, desk: before }, change).desk);

test("a step in an open shutdown is warned about, with the shutdown", () => {
  const [h, ...rest] = hit(OPEN, arrive("2026-11-11T09:00-07:00"));
  assert.equal(rest.length, 0);
  assert.equal(h.key, "2026-11-11T09:00-07:00");
  assert.equal(h.stage, "arrived at span");
  assert.equal(h.shutdown.label, "Remembrance Day");
  assert.equal(h.shutdown.open, true);
  assert.equal(hit(OPEN, arrive("2027-03-01T09:00-07:00")).length, 1, "an open shutdown has no end");
});

test("a closed shutdown: inside is warned about, its start and its end and outside aren't", () => {
  assert.equal(hit(CLOSED, arrive("2026-11-11T19:59-07:00")).length, 1);
  assert.equal(hit(CLOSED, arrive("2026-11-11T06:01-07:00")).length, 1);
  assert.equal(hit(CLOSED, arrive("2026-11-11T06:00-07:00")).length, 0, "at the start it's already counted there");
  assert.equal(hit(CLOSED, arrive("2026-11-11T20:00-07:00")).length, 0, "at the end it's over");
  assert.equal(hit(CLOSED, arrive("2026-11-11T05:59-07:00")).length, 0);
  assert.equal(hit(CLOSED, arrive("2026-11-12T09:00-07:00")).length, 0);
});

test("a change that reports no step, or a step already there, isn't warned about", () => {
  // nothing moves, no step picked: no step is reported
  assert.equal(
    hit(OPEN, { kind: "move", time: "2026-11-11T09:00-07:00", span: head.span, complete: head.complete }).length,
    0,
  );
  // an entry already in the shutdown, given a note: its step isn't new
  const before = applyBoth({ status: STATUS, desk: OPEN }, arrive("2026-11-11T09:00-07:00")).desk;
  assert.equal(hit(before, { kind: "desk-edit", key: "2026-11-11T09:00-07:00", noteToSelf: "checked" }).length, 0);
});

test("a shutdown with a mistake in it isn't warned about, since it's left out of everything", () => {
  const broken = desk("- label: No start", "  type: holiday", "  hours: 14");
  assert.equal(hit(broken, arrive("2026-11-11T09:00-07:00")).length, 0);
  assert.equal(hit(EMPTY_DESK, arrive("2026-11-11T09:00-07:00")).length, 0, "no shutdowns at all");
});
