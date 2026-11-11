// Irregular shutdowns: stretches with no gantry work that the weekly shutdown doesn't cover, listed by hand in
// gantry-cycles.yaml under `irregular-shutdowns:` (the header there says how). Each has a label, a type, a start, and an end or
// a number of hours (an open shutdown has neither: it's still going, and runs until one is written).
//
//   irregular-shutdowns:
//     - label: Remembrance Day
//       type: holiday
//       start: 2026-11-11T06:00-07:00
//       hours: 14
//
// The type says what it means for the velocity (lib/velocity.js):
//   holiday     excused: the week is extended by its hours, up to HOLIDAY_CAP_HOURS each, and they leave working time
//   mechanical  counts against the pace
//   waiting     counts against the pace (waiting on work ahead to finish)
// Any other type, or a typo, counts against the pace and has no icon, so it can never quietly change the velocity.
//
// Whatever the type, there's no gantry work during a shutdown, so a step reported during one is counted at its start.
import { parseKey } from "./time.js";

export const HOUR = 3600 * 1000;
/** The most of a holiday that's excused, counted from its start. */
export const HOLIDAY_CAP_HOURS = 24;

/** What each type is called, its icon (iconShapes.js, in colour) and whether the velocity excuses it. */
export const TYPES = {
  holiday: { name: "Statutory holiday", icon: "palm", excused: true },
  mechanical: { name: "Mechanical failure", icon: "wrench", excused: false },
  waiting: { name: "Waiting on work ahead", icon: "hourglass", excused: false },
};

/** @returns {{ name: string, icon: string|null, excused: boolean, known: boolean }} */
export function typeInfo(type) {
  const t = TYPES[type];
  return t ? { ...t, known: true } : { name: type || "No type", icon: null, excused: false, known: false };
}

const unquote = (v) => {
  v = v.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  // an unquoted value ends at a trailing comment
  return v.replace(/\s+#.*$/, "").trim();
};

/**
 * @typedef {object} Shutdown
 * @property {string} label What it's called (its type's name when it has none).
 * @property {string} type As written ("" when missing).
 * @property {boolean} known Whether the type is one the code has a rule for.
 * @property {string|null} start As written.
 * @property {string|null} end As written, if it has one.
 * @property {number|null} hours As written, if it has them.
 * @property {number} startMs NaN when the start isn't a time stamp.
 * @property {number} endMs Infinity while it's open (no end or hours), NaN when it can't be worked out.
 * @property {boolean} open Still going: no end or hours.
 * @property {number|null} length Its length in hours, null while open or when it can't be worked out.
 * @property {string[]} errors What's wrong with it. It's left out of the velocity while it has any.
 * @property {string[]} warnings What's odd about it, but doesn't stop it counting.
 */

/** The `irregular-shutdowns:` list of a gantry-cycles.yaml, in the order written. No list gives []. */
export function parseShutdowns(text) {
  const items = [];
  let inList = false,
    cur = null;
  for (const line of String(text ?? "").split("\n")) {
    if (/^irregular-shutdowns:\s*(#.*)?$/.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    // another key at the left edge ends the list; a comment or blank line doesn't
    if (/^[A-Za-z]/.test(line)) break;
    if (/^\s*(#|$)/.test(line)) continue;
    const start = line.match(/^\s*-\s+([a-z-]+):\s*(.*)$/);
    const field = start ?? line.match(/^\s+([a-z-]+):\s*(.*)$/);
    if (!field) continue;
    if (start) items.push((cur = {}));
    if (cur) cur[field[1]] = unquote(field[2]);
  }
  return items.map(shutdownOf);
}

function shutdownOf(raw) {
  const errors = [],
    warnings = [];
  const type = raw.type ?? "";
  const info = typeInfo(type);
  const startMs = raw.start ? parseKey(raw.start).getTime() : NaN;
  if (isNaN(startMs)) errors.push(raw.start ? `start "${raw.start}" isn't a time stamp` : "no start");
  let endMs = Infinity,
    hours = null,
    end = raw.end || null;
  if (raw.hours !== undefined && raw.hours !== "") {
    hours = Number(raw.hours);
    if (!(hours > 0)) {
      errors.push(`hours "${raw.hours}" isn't a number above 0`);
      hours = null;
    }
  }
  if (end) {
    endMs = parseKey(end).getTime();
    if (isNaN(endMs)) errors.push(`end "${end}" isn't a time stamp`);
    else if (endMs <= startMs) errors.push("end isn't after start");
    else if (hours != null && Math.abs((endMs - startMs) / HOUR - hours) > 1 / 60)
      warnings.push(`end and hours disagree, so end is used`);
  } else if (hours != null) endMs = startMs + hours * HOUR;
  const open = !end && hours == null && !errors.some((e) => e.startsWith("hours"));
  if (!type) errors.push("no type");
  else if (!info.known) warnings.push(`"${type}" is not a known type: it counts against the pace`);
  const valid = errors.length === 0;
  return {
    label: raw.label || info.name,
    type,
    known: info.known,
    start: raw.start ?? null,
    end,
    hours,
    startMs,
    endMs: valid ? endMs : NaN,
    open: valid && open,
    length: valid && Number.isFinite(endMs) ? (endMs - startMs) / HOUR : null,
    errors,
    warnings,
  };
}

/**
 * The time ranges the calculations use, in ms: `off` every valid shutdown (no gantry work in it, so the shift clock leaves it
 * out and a step reported in it is counted at its start), `excused` the holidays, each up to HOLIDAY_CAP_HOURS from its start
 * (these leave working time too, and extend the week).
 * @param {Shutdown[]} shutdowns
 * @returns {{ off: [number, number][], excused: [number, number][] }}
 */
export function rangesOf(shutdowns = []) {
  const valid = shutdowns.filter((s) => s.errors.length === 0);
  return {
    off: valid.map((s) => [s.startMs, s.endMs]),
    excused: valid
      .filter((s) => typeInfo(s.type).excused)
      .map((s) => [s.startMs, Math.min(s.endMs, s.startMs + HOLIDAY_CAP_HOURS * HOUR)]),
  };
}
