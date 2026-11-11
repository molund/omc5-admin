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
/**
 * The most of a holiday that's excused, counted from its start. Christmas and Boxing Day are the only consecutive holidays, so
 * they're two holidays, listed as two entries (one per day), not one of 48 hours: the second day would be 24 hours short.
 */
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

const FIELDS = new Set(["label", "type", "start", "end", "hours"]);

const unquote = (v) => {
  v = v.trim();
  // a quoted value, with a comment after it or not
  let m = v.match(/^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/);
  if (m) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1];
    }
  }
  m = v.match(/^'((?:[^']|'')*)'\s*(?:#.*)?$/);
  if (m) return m[1].replace(/''/g, "'");
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
 * @property {number} line The line of the file its entry starts on (1 for the first).
 */

/**
 * What's in the `irregular-shutdowns:` list of a gantry-cycles.yaml, and what can't be read: the shutdowns in the order written,
 * the lines of the file the key is on, and the lines in the list that aren't an entry or a field of one (`- {label: x}`, say),
 * which are left out.
 * @returns {{ shutdowns: Shutdown[], keys: number[], unreadable: { line: number, text: string }[] }}
 */
export function scanShutdowns(text) {
  const items = [],
    keys = [],
    unreadable = [];
  let inList = false,
    cur = null;
  String(text ?? "")
    .split("\n")
    .forEach((line, i) => {
      if (/^irregular-shutdowns:\s*(#.*)?$/.test(line)) {
        inList = true;
        keys.push(i + 1);
        return;
      }
      if (!inList) return;
      // another key at the left edge ends the list; a comment or blank line doesn't
      if (/^[A-Za-z]/.test(line)) {
        inList = false;
        return;
      }
      if (/^\s*(#|$)/.test(line)) return;
      const start = line.match(/^\s*-\s+([a-z-]+):\s*(.*)$/);
      const field = start ?? line.match(/^\s+([a-z-]+):\s*(.*)$/);
      if (!field || (!start && !cur)) {
        unreadable.push({ line: i + 1, text: line });
        return;
      }
      if (start) items.push((cur = { line: i + 1, fields: {}, unknown: [] }));
      if (FIELDS.has(field[1])) cur.fields[field[1]] = unquote(field[2]);
      else cur.unknown.push(field[1]);
    });
  const shutdowns = items.map(shutdownOf);
  flagOverlaps(shutdowns);
  return { shutdowns, keys, unreadable };
}

/** The `irregular-shutdowns:` list of a gantry-cycles.yaml, in the order written. No list gives []. */
export const parseShutdowns = (text) => scanShutdowns(text).shutdowns;

/** Two shutdowns that overlap are probably a mistake (a stretch written twice): each is warned about the other. */
function flagOverlaps(list) {
  const ok = list.filter((s) => s.errors.length === 0);
  for (let i = 0; i < ok.length; i++)
    for (let j = i + 1; j < ok.length; j++) {
      const [a, b] = [ok[i], ok[j]];
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        a.warnings.push(`overlaps ${b.label}`);
        b.warnings.push(`overlaps ${a.label}`);
      }
    }
}

/**
 * Everything wrong with a gantry-cycles.yaml's irregular shutdowns, for the check that stops a bad list being deployed: errors
 * (an entry that's left out of the velocity, a line that can't be read, the key twice) and warnings (a typo'd type or field,
 * end and hours that disagree, a holiday over 24 hours, two that overlap), which the check counts as failures too.
 * @returns {{ line: number, level: "error"|"warning", message: string }[]} In file order.
 */
export function checkShutdowns(text) {
  const { shutdowns, keys, unreadable } = scanShutdowns(text);
  const out = [];
  if (keys.length > 1)
    out.push({ line: keys[1], level: "error", message: "irregular-shutdowns: is in the file more than once" });
  for (const u of unreadable)
    out.push({ line: u.line, level: "error", message: `this line can't be read: ${u.text.trim()}` });
  for (const s of shutdowns) {
    for (const e of s.errors) out.push({ line: s.line, level: "error", message: `${s.label}: ${e}` });
    for (const w of s.warnings) out.push({ line: s.line, level: "warning", message: `${s.label}: ${w}` });
  }
  return out.sort((a, b) => a.line - b.line);
}

function shutdownOf({ line, fields: raw, unknown }) {
  const errors = [],
    warnings = [];
  for (const name of unknown) warnings.push(`unknown field "${name}" is ignored`);
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
  const length = valid && Number.isFinite(endMs) ? (endMs - startMs) / HOUR : null;
  if (info.excused && length > HOLIDAY_CAP_HOURS)
    warnings.push(
      `is ${length}h but a holiday is excused for ${HOLIDAY_CAP_HOURS}h at most: list consecutive holidays (Christmas, Boxing Day) as separate entries`,
    );
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
    length,
    errors,
    warnings,
    line,
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
