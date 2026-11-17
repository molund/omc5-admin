// Nights off: stretches of nights with no night shift, while the day shift still works, listed by hand in gantry-cycles.yaml
// under `night-shift-off:`. Each has a start and maybe an end, both dates: the first and the last night off, the night shift
// from 8 p.m. on each (an open one, with no end, is still going).
//
//   night-shift-off:
//     - start: 2026-11-16
//       end: 2026-12-04
//
// The shift clock (lib/velocity.js), which the stage shares and the estimated steps use, leaves those nights out, so the
// stages aren't stretched by night hours nobody worked. Working time doesn't change: the lost nights count against the pace.
import { isDateOnly, parseKey } from "./time.js";
import { scanList } from "./shutdowns.js";

const DAY = 24 * 3600 * 1000;
const FIELDS = new Set(["start", "end"]);

/**
 * @typedef {object} NightsOff
 * @property {string} label What it's called, for messages: "Night shift off from 2026-11-16".
 * @property {string|null} start As written.
 * @property {string|null} end As written, if it has one.
 * @property {number} startMs BC midnight at the start of `start`'s day; NaN when it isn't a date.
 * @property {number} endMs BC midnight after `end`'s day, Infinity while it's open, NaN when it can't be worked out.
 * @property {boolean} open Still going: no end.
 * @property {number|null} nights How many nights it covers (weekly-shutdown nights included), null while open.
 * @property {string[]} errors What's wrong with it. It's left out of the shift clock while it has any.
 * @property {string[]} warnings What's odd about it, but doesn't stop it counting.
 * @property {number} line The line of the file its entry starts on (1 for the first).
 */

/**
 * What's in the `night-shift-off:` list of a gantry-cycles.yaml, and what can't be read, like scanShutdowns.
 * @returns {{ nightsOff: NightsOff[], keys: number[], unreadable: { line: number, text: string }[] }}
 */
export function scanNightsOff(text) {
  const { items, keys, unreadable } = scanList(text, "night-shift-off", FIELDS);
  const nightsOff = items.map(nightsOffOf);
  const ok = nightsOff.filter((n) => n.errors.length === 0);
  for (let i = 0; i < ok.length; i++)
    for (let j = i + 1; j < ok.length; j++) {
      const [a, b] = [ok[i], ok[j]];
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        a.warnings.push(`overlaps ${b.label}`);
        b.warnings.push(`overlaps ${a.label}`);
      }
    }
  return { nightsOff, keys, unreadable };
}

/** The `night-shift-off:` list of a gantry-cycles.yaml, in the order written. No list gives []. */
export const parseNightsOff = (text) => scanNightsOff(text).nightsOff;

/**
 * Everything wrong with a gantry-cycles.yaml's night-shift-off list, as checkShutdowns gives it for the irregular shutdowns.
 * @returns {{ line: number, level: "error"|"warning", message: string }[]} In file order.
 */
export function checkNightsOff(text) {
  const { nightsOff, keys, unreadable } = scanNightsOff(text);
  const out = [];
  if (keys.length > 1)
    out.push({ line: keys[1], level: "error", message: "night-shift-off: is in the file more than once" });
  for (const u of unreadable)
    out.push({ line: u.line, level: "error", message: `this line can't be read: ${u.text.trim()}` });
  for (const n of nightsOff) {
    for (const e of n.errors) out.push({ line: n.line, level: "error", message: `${n.label}: ${e}` });
    for (const w of n.warnings) out.push({ line: n.line, level: "warning", message: `${n.label}: ${w}` });
  }
  return out.sort((a, b) => a.line - b.line);
}

// a date, "2026-11-16": a time stamp isn't one, since a night is either off or worked
const dateMs = (v) => (isDateOnly(v) ? parseKey(v).getTime() : NaN);

function nightsOffOf({ line, fields: raw, unknown }) {
  const errors = [],
    warnings = [];
  for (const name of unknown) warnings.push(`unknown field "${name}" is ignored`);
  const start = raw.start || null,
    end = raw.end || null;
  const startMs = start ? dateMs(start) : NaN;
  if (isNaN(startMs)) errors.push(start ? `start "${start}" isn't a date (2026-11-16)` : "no start");
  let endMs = Infinity;
  if (end) {
    endMs = dateMs(end) + DAY;
    if (isNaN(endMs)) errors.push(`end "${end}" isn't a date (2026-11-16)`);
    else if (endMs <= startMs) errors.push("end is before start");
  }
  const valid = errors.length === 0;
  return {
    label: `Night shift off from ${start ?? "?"}`,
    start,
    end,
    startMs,
    endMs: valid ? endMs : NaN,
    open: valid && !end,
    nights: valid && end ? Math.round((endMs - startMs) / DAY) : null,
    errors,
    warnings,
    line,
  };
}

/** The ranges the shift clock leaves the night shifts out of, in ms: [first night's BC midnight, the day after the last's). */
export const nightRangesOf = (nightsOff = []) =>
  nightsOff.filter((n) => n.errors.length === 0).map((n) => [n.startMs, n.endMs]);
