// The Clayton Clipper's velocity: the working days it takes per span, from the steps tagged in desk.yaml.
//
// A span's cycle is the time from a step at one span to the same step at the next (arrival to arrival, unless an arrival
// wasn't logged; then the next step both spans have). Working time leaves out the weekly shutdown: Saturday night and
// Sunday's day shift, 6 p.m. Saturday to 6 p.m. Sunday, BC time. The velocity is the average of the last two spans' cycles.
import { parseKey } from "./time.js";
import { STAGES } from "./stages.js";

export const WINDOW = 2;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// the shutdown, in hours from the start of a BC week (Sunday 00:00): Saturday 18:00 to Sunday 18:00 the next day
const SHUTDOWN_START = 6 * 24 + 18; // Saturday 18:00
const SHUTDOWN_HOURS = 24;

// which step to measure a cycle by, when both spans have it: arrival first, then the steps most often reported
const PREFERRED = [
  "arrived at span",
  "hanging started",
  "hung",
  "gluing started",
  "glued",
  "post-tensioning started",
  "supports started",
];
const ORDER = [...PREFERRED, ...STAGES.filter((s) => !PREFERRED.includes(s))];

/** Hours between two Dates that aren't in a shutdown. */
export function workingHours(from, to) {
  if (to <= from) return 0;
  let total = (to - from) / HOUR;
  // BC time is UTC−7 all year in status.yaml's time stamps
  const bc = (d) => new Date(d.getTime() - 7 * HOUR);
  // the Sunday 00:00 (BC) on or before `from`, a week back to catch a shutdown already under way
  const f = bc(from);
  let weekStart = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()) - f.getUTCDay() * DAY - 7 * DAY;
  for (; weekStart + 7 * HOUR < to.getTime() + 7 * DAY; weekStart += 7 * DAY) {
    const s = weekStart + 7 * HOUR + SHUTDOWN_START * HOUR; // back to real time
    const e = s + SHUTDOWN_HOURS * HOUR;
    const overlap = Math.min(e, to.getTime()) - Math.max(s, from.getTime());
    if (overlap > 0) total -= overlap / HOUR;
  }
  return total;
}

/** For each span, the earliest time stamp each step was seen: { [span]: { [stage]: key } }. */
export function stepsBySpan(entries) {
  const out = {};
  for (const e of entries) {
    if (!e.span || !e.stage) continue;
    const s = (out[e.span] ??= {});
    if (!s[e.stage] || parseKey(e.key) < parseKey(s[e.stage])) s[e.stage] = e.key;
  }
  return out;
}

/**
 * The cycles measured, newest first: { from: span, to: span, by: stage, start, end, hours }.
 * Only consecutive spans, and only when both have a common step.
 */
export function cycles(entries) {
  const by = stepsBySpan(entries);
  const spans = Object.keys(by)
    .map(Number)
    .sort((a, b) => b - a);
  const out = [];
  for (const n of spans) {
    const a = by[n - 1],
      b = by[n];
    if (!a) continue;
    const stage = ORDER.find((st) => a[st] && b[st]);
    if (!stage) continue;
    const start = a[stage],
      end = b[stage];
    out.push({ from: n - 1, to: n, by: stage, start, end, hours: workingHours(parseKey(start), parseKey(end)) });
  }
  return out;
}

/**
 * The arrival itself and each step logged after it, once, at its earliest, with the working hours since that arrival:
 * [{ span, stage, key, hours }]. Highest span first, then the shortest since arrival first (the arrival). A span with no logged arrival
 * has none.
 */
export function sinceArrival(entries) {
  const out = [];
  for (const [span, steps] of Object.entries(stepsBySpan(entries))) {
    const arrival = steps[STAGES[0]];
    if (!arrival) continue;
    for (const [stage, key] of Object.entries(steps)) {
      const hours = workingHours(parseKey(arrival), parseKey(key));
      if (hours > 0 || stage === STAGES[0]) out.push({ span: Number(span), stage, key, hours });
    }
  }
  return out.sort((a, b) => b.span - a.span || a.hours - b.hours);
}

/**
 * The velocity now.
 * @returns {{ days: number, cycles: object[], current: { span: number, since: string, days: number }|null }|null}
 */
export function velocity(entries, now = new Date()) {
  const all = cycles(entries);
  const used = all.slice(0, WINDOW);
  const by = stepsBySpan(entries);
  const top = Math.max(0, ...Object.keys(by).map(Number));
  const since = top ? by[top]["arrived at span"] : null;
  const current = since ? { span: top, since, days: workingHours(parseKey(since), now) / 24 } : null;
  if (!used.length) return current ? { days: null, cycles: [], current } : null;
  const days = used.reduce((t, c) => t + c.hours, 0) / used.length / 24;
  return { days, cycles: used, current };
}
