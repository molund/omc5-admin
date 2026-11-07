// The Clayton Clipper's velocity: the working days it takes per span, from the steps tagged in desk.yaml, and the spans
// per week that makes once a week's shutdown is allowed for.
//
// A span's cycle is the time from its arrival to the next span's. An arrival that wasn't logged is estimated from the steps
// that were: the recent gaps between steps give each stage's share of the cycle, in shift hours (no time passes in a shift
// break or the shutdown), and that places every step along the gantry's progress, to read the arrival off between them.
// Working time leaves out only the weekly shutdown: Saturday night and Sunday's day shift, 6 p.m. Saturday to 6 p.m. Sunday,
// BC time. The velocity is the average of the last three spans' cycles.
import { parseKey, toKey } from "./time.js";
import { STAGES } from "./stages.js";

export const WINDOW = 3;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// the shutdown, in hours from the start of a BC week (Sunday 00:00): Saturday 18:00 to Sunday 18:00 the next day
const SHUTDOWN_START = 6 * 24 + 18; // Saturday 18:00
const SHUTDOWN_HOURS = 24;
const WORKING_DAYS_PER_WEEK = 7 - SHUTDOWN_HOURS / 24;
// BC time is UTC−7 all year in status.yaml's time stamps
const bc = (d) => new Date(d.getTime() - 7 * HOUR);
// the shifts, in hours from a BC midnight: Saturday's night shift and Sunday's day shift are the shutdown
const DAY_SHIFT = [7, 17];
const NIGHT_SHIFT = [20, 30];
// the stages' shares come from the steps since here: the ones before it were filled in from old posts, before the desk tagged steps
export const SHARES_SINCE = "2026-11-03";
// the shift hours from a stage to the next, where the job says how long it should be: most of these are nearly one moment
const KNOWN_HOURS = { "arrived at span": 0.5, hung: 1, glued: 1, "cables down": 2.5, "hangers down": 1 };
// how hard a segment's length is pulled toward that, or toward the average; the gaps logged are worth 1 each
const FIRM = 10;
const LIGHT = 0.05;
const QUARTER = HOUR / 4;

/** Hours between two Dates that aren't in a shutdown. */
export function workingHours(from, to) {
  if (to <= from) return 0;
  let total = (to - from) / HOUR;
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

/** The shifts as [start, end] in milliseconds, in order, the first of them no later than any shift under way at `from`. */
function* shiftsFrom(from) {
  const f = bc(from);
  // the day before: its night shift runs into this morning
  let midnight = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()) + 7 * HOUR - DAY;
  for (; ; midnight += DAY) {
    const weekday = bc(new Date(midnight)).getUTCDay();
    if (weekday !== 0) yield DAY_SHIFT.map((h) => midnight + h * HOUR);
    if (weekday !== 6) yield NIGHT_SHIFT.map((h) => midnight + h * HOUR);
  }
}

/** Hours between two Dates that are inside a shift. */
export function shiftHours(from, to) {
  let total = 0;
  for (const [start, end] of shiftsFrom(from)) {
    if (start >= to.getTime()) break;
    total += Math.max(0, Math.min(end, to.getTime()) - Math.max(start, from.getTime()));
  }
  return total / HOUR;
}

/** The Date some shift hours after a Date. */
export function afterShiftHours(from, hours) {
  let left = hours * HOUR;
  for (const [shiftStart, end] of shiftsFrom(from)) {
    const start = Math.max(shiftStart, from.getTime());
    if (end <= start) continue;
    if (left <= end - start) return new Date(start + left);
    left -= end - start;
  }
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
 * The days each span took, from its arrival to the next span's arrival: { [span]: { start, end, shutdown } }. `end` is null
 * for the newest span (or one whose next arrival wasn't logged), `shutdown` whether the weekly shutdown fell inside it.
 * A span with no logged arrival isn't in it.
 */
export function spanDays(entries) {
  const by = stepsBySpan(entries);
  const out = {};
  for (const [span, steps] of Object.entries(by)) {
    const start = steps[STAGES[0]];
    if (!start) continue;
    const end = by[Number(span) + 1]?.[STAGES[0]] ?? null;
    const [a, b] = [parseKey(start), end && parseKey(end)];
    out[span] = { start, end, shutdown: !!end && workingHours(a, b) < (b - a) / HOUR };
  }
  return out;
}

/** Every step, in the order logged: [{ span, index (in STAGES), at (a Date) }]. */
function allSteps(entries) {
  const out = [];
  for (const [span, steps] of Object.entries(stepsBySpan(entries)))
    for (const [stage, key] of Object.entries(steps)) {
      const index = STAGES.indexOf(stage);
      if (index >= 0) out.push({ span: Number(span), index, at: parseKey(key) });
    }
  return out.sort((a, b) => a.at - b.at || a.span - b.span || a.index - b.index);
}

/**
 * How the cycle divides up: [{ stage, position, share }] in cycle order, `position` how far through the cycle the stage
 * comes and `share` how much of it runs from there to the next stage, both as fractions.
 *
 * The cycle is a loop of one segment per stage. Each gap between neighbouring steps since SHARES_SINCE, on the spans the
 * velocity covers, says what the segments it crosses add up to in shift hours, and the lengths are the non-negative least
 * squares fit of those gaps. A segment with a known length is pulled firmly to it, the rest lightly to the average, which fills
 * in what was never logged.
 */
export function stageShares(entries) {
  const steps = allSteps(entries);
  const top = Math.max(0, ...steps.map((t) => t.span));
  const since = parseKey(SHARES_SINCE);
  const used = steps.filter((t) => t.at >= since && t.span >= top - WINDOW);
  const n = STAGES.length;
  const gaps = [];
  for (let i = 0; i + 1 < used.length; i++) {
    const [a, b] = [used[i], used[i + 1]];
    const crossed = (b.span - a.span) * n + b.index - a.index;
    // reported out of order: it says nothing about the length
    if (crossed <= 0) continue;
    const counts = Array(n).fill(0);
    for (let c = 0; c < crossed; c++) counts[(a.index + c) % n]++;
    gaps.push({ counts, hours: shiftHours(a.at, b.at) });
  }
  const segments = gaps.reduce((t, g) => t + g.counts.reduce((x, y) => x + y, 0), 0);
  // with no gaps yet there's nothing to average: about a day and a half a cycle
  const average = gaps.reduce((t, g) => t + g.hours, 0) / segments || 4;
  const target = STAGES.map((stage) => KNOWN_HOURS[stage] ?? average);
  const weight = STAGES.map((stage) => (stage in KNOWN_HOURS ? FIRM : LIGHT));
  // coordinate descent: each length in turn, given the others, until they stop moving
  const lengths = Array(n).fill(average);
  for (let round = 0, moved = 1; round < 800 && moved > 1e-6; round++) {
    moved = 0;
    for (let k = 0; k < n; k++) {
      let sum = weight[k] * target[k];
      let bottom = weight[k];
      for (const g of gaps) {
        if (!g.counts[k]) continue;
        const others = g.counts.reduce((t, c, j) => (j === k ? t : t + c * lengths[j]), 0);
        sum += g.counts[k] * (g.hours - others);
        bottom += g.counts[k] * g.counts[k];
      }
      const length = Math.max(0, sum / bottom);
      moved = Math.max(moved, Math.abs(length - lengths[k]));
      lengths[k] = length;
    }
  }
  const total = lengths.reduce((a, b) => a + b, 0);
  let sofar = 0;
  return STAGES.map((stage, k) => {
    const position = sofar / total;
    sofar += lengths[k];
    return { stage, position, share: lengths[k] / total };
  });
}

/**
 * When each span's arrival was: { [span]: { key, estimated } }. A logged arrival as logged. A missing one is read off the
 * gantry's progress, in shift hours, between the nearest steps either side of it, to the quarter hour. With no step on one
 * side, the span isn't in it.
 */
export function arrivals(entries, shares = stageShares(entries)) {
  const steps = allSteps(entries);
  if (!steps.length) return {};
  const by = stepsBySpan(entries);
  const origin = steps[0].at;
  const progress = steps
    .map((t) => ({ position: t.span + shares[t.index].position, hours: shiftHours(origin, t.at) }))
    .sort((a, b) => a.position - b.position);
  const spans = steps.map((t) => t.span);
  const out = {};
  for (let span = Math.min(...spans); span <= Math.max(...spans); span++) {
    const logged = by[span]?.[STAGES[0]];
    if (logged) {
      out[span] = { key: logged, estimated: false };
      continue;
    }
    const before = progress.filter((p) => p.position <= span).at(-1);
    const after = progress.find((p) => p.position > span);
    if (!before || !after) continue;
    const part = (span - before.position) / (after.position - before.position);
    const when = afterShiftHours(origin, before.hours + (after.hours - before.hours) * part);
    out[span] = { key: toKey(new Date(Math.round(when.getTime() / QUARTER) * QUARTER)), estimated: true };
  }
  return out;
}

/**
 * The cycles measured, newest first: { from: span, to: span, start, end, startEstimated, endEstimated, hours }.
 * Only consecutive spans, each arrival to the next, logged or estimated, in working time.
 */
export function cycles(entries, arrived = arrivals(entries)) {
  const out = [];
  for (const n of Object.keys(arrived)
    .map(Number)
    .sort((a, b) => b - a)) {
    const [a, b] = [arrived[n - 1], arrived[n]];
    if (!a) continue;
    out.push({
      from: n - 1,
      to: n,
      start: a.key,
      end: b.key,
      startEstimated: a.estimated,
      endEstimated: b.estimated,
      hours: workingHours(parseKey(a.key), parseKey(b.key)),
    });
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
 * @returns {{ days: number, spansPerWeek?: number, cycles: object[], shares: object[], current: { span: number, since: string, days: number }|null }|null}
 */
export function velocity(entries, now = new Date()) {
  const shares = stageShares(entries);
  const used = cycles(entries, arrivals(entries, shares)).slice(0, WINDOW);
  const by = stepsBySpan(entries);
  const top = Math.max(0, ...Object.keys(by).map(Number));
  const since = top ? by[top]["arrived at span"] : null;
  const current = since ? { span: top, since, days: workingHours(parseKey(since), now) / 24 } : null;
  if (!used.length) return current ? { days: null, cycles: [], shares, current } : null;
  const days = used.reduce((t, c) => t + c.hours, 0) / used.length / 24;
  return { days, spansPerWeek: WORKING_DAYS_PER_WEEK / days, cycles: used, shares, current };
}
