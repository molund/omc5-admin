// The Clayton Clipper's velocity: the spans per week it builds, from the steps tagged in gantry-cycles.yaml, with a week's shutdown
// allowed for.
//
// The velocity is how far the gantry got in the week (168 hours) up to the step reported most recently, so it moves with
// every step logged. The recent gaps between steps give each stage's share of a span's cycle, in shift hours (no time
// passes in a shift break or the shutdown), and that places every step along the gantry's progress, in spans: the place a
// week before the last step is read off between the steps either side of it, and so is a stage or arrival that wasn't
// logged. Working time leaves out only the weekly shutdown: Friday night, 6 p.m. Friday to 6 a.m. Saturday, and Saturday
// night and Sunday's day shift, 6 p.m. Saturday to 6 p.m. Sunday, BC time.
import { parseKey, toKey } from "./time.js";
import { STAGES } from "./stages.js";

// the spans before the newest that the stage shares are fitted on, and the velocity panel lists steps for
export const WINDOW = 3;
// the velocity's reach back from the latest step: a week, which always holds exactly one shutdown
const WEEK_HOURS = 168;
// how far back gantry-cycles.yaml keeps the velocity's earlier values (velocityHistory), from the latest step
export const HISTORY_HOURS = 96;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// the shutdown, as [start, hours], the start in hours from the start of a BC week (Sunday 00:00): Friday 18:00 to
// Saturday 06:00, and Saturday 18:00 to Sunday 18:00
const SHUTDOWNS = [
  [5 * 24 + 18, 12], // Friday 18:00
  [6 * 24 + 18, 24], // Saturday 18:00
];
const WORKING_DAYS_PER_WEEK = 7 - SHUTDOWNS.reduce((total, [, hours]) => total + hours, 0) / 24;
// BC time is UTC−7 all year in status.yaml's time stamps
const bc = (d) => new Date(d.getTime() - 7 * HOUR);
// the shifts, in hours from a BC midnight: Friday's and Saturday's night shifts and Sunday's day shift are the shutdown
const DAY_SHIFT = [7, 17];
const NIGHT_SHIFT = [20, 30];
// the stages' shares come from the steps since here: the ones before it were filled in from old posts, before the Leash Log tagged steps
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
    for (const [start, hours] of SHUTDOWNS) {
      const s = weekStart + 7 * HOUR + start * HOUR; // back to real time
      const e = s + hours * HOUR;
      const overlap = Math.min(e, to.getTime()) - Math.max(s, from.getTime());
      if (overlap > 0) total -= overlap / HOUR;
    }
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
    if (weekday !== 5 && weekday !== 6) yield NIGHT_SHIFT.map((h) => midnight + h * HOUR);
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
  const at = estimator(steps, shares);
  const spans = steps.map((t) => t.span);
  const out = {};
  for (let span = Math.min(...spans); span <= Math.max(...spans); span++) {
    const logged = by[span]?.[STAGES[0]];
    if (logged) {
      out[span] = { key: logged, estimated: false };
      continue;
    }
    const key = at(span);
    if (key) out[span] = { key, estimated: true };
  }
  return out;
}

/**
 * When the gantry reached a point in its progress (a span number plus how far through that span's cycle), read off between
 * the nearest steps either side of it in shift hours, to the quarter hour: a function of the point, giving a key, or null
 * with no step on one side.
 */
function estimator(steps, shares) {
  const origin = steps[0].at;
  const progress = steps
    .map((t) => ({ position: t.span + shares[t.index].position, hours: shiftHours(origin, t.at) }))
    .sort((a, b) => a.position - b.position);
  return (point) => {
    const before = progress.filter((p) => p.position <= point).at(-1);
    const after = progress.find((p) => p.position > point);
    if (!before || !after) return null;
    const part = (point - before.position) / (after.position - before.position);
    const when = afterShiftHours(origin, before.hours + (after.hours - before.hours) * part);
    return toKey(new Date(Math.round(when.getTime() / QUARTER) * QUARTER));
  };
}

/**
 * Like sinceArrival, but lowest span first, with the steps that weren't logged estimated too, and spans whose arrival is an
 * estimate: [{ span, stage, key, hours, stepHours, estimated }]. `stepHours` is the working time from the step to the next one,
 * a span's last running to the next span's arrival, and null with no next step to run to. A step is estimated the way an arrival is, between the nearest steps either side
 * of it, so a step still to come (nothing logged after it) isn't in it. A logged step also has `offHours`: the working time between
 * it and when it was expected, estimated the same way from the other steps (null with no other step on one side of it).
 */
export function stepsWithEstimates(entries, shares = stageShares(entries)) {
  const steps = allSteps(entries);
  if (!steps.length) return [];
  const by = stepsBySpan(entries);
  const at = estimator(steps, shares);
  const arrived = arrivals(entries, shares);
  const out = [];
  for (const [span, arrival] of Object.entries(arrived)) {
    for (const [index, stage] of STAGES.entries()) {
      const logged = by[span]?.[stage];
      const key = index === 0 ? arrival.key : (logged ?? at(Number(span) + shares[index].position));
      if (!key) continue;
      const hours = workingHours(parseKey(arrival.key), parseKey(key));
      if (hours > 0 || index === 0)
        out.push({ span: Number(span), stage, key, hours, estimated: index === 0 ? arrival.estimated : !logged });
    }
  }
  out.sort((a, b) => a.span - b.span || a.hours - b.hours);
  return out.map((t, i) => {
    const next = out[i + 1];
    const stepHours = next && next.span <= t.span + 1 ? workingHours(parseKey(t.key), parseKey(next.key)) : null;
    return { ...t, stepHours, offHours: t.estimated ? null : offHours(steps, shares, t) };
  });
}

// how far a logged step is from when it was expected: estimated as if it hadn't been logged, from the other steps, in working hours
function offHours(steps, shares, t) {
  const index = STAGES.indexOf(t.stage);
  const others = steps.filter((s) => s.span !== t.span || s.index !== index);
  if (!others.length) return null;
  const expected = estimator(others, shares)(t.span + shares[index].position);
  if (!expected) return null;
  const [a, b] = [parseKey(t.key), parseKey(expected)];
  return a < b ? workingHours(a, b) : workingHours(b, a);
}

/**
 * When each span reached a stage: { [span]: { key, estimated } }, as logged, or read off the gantry's progress between the
 * nearest steps either side, the way a missing arrival is (so the arrival's are `arrivals`). With no step on one side, the
 * span isn't in it.
 */
function stageTimes(entries, shares, stage) {
  if (stage === STAGES[0]) return arrivals(entries, shares);
  const steps = allSteps(entries);
  if (!steps.length) return {};
  const by = stepsBySpan(entries);
  const at = estimator(steps, shares);
  const position = shares[STAGES.indexOf(stage)].position;
  const spans = steps.map((t) => t.span);
  const out = {};
  for (let span = Math.min(...spans); span <= Math.max(...spans); span++) {
    const logged = by[span]?.[stage];
    const key = logged ?? at(span + position);
    if (key) out[span] = { key, estimated: !logged };
  }
  return out;
}

/**
 * The cycles measured, newest first: { from: span, to: span, stage, start, end, startEstimated, endEstimated, hours }.
 * Only consecutive spans, each from a stage on one span to the same stage on the next (arrival, unless another is named),
 * logged or estimated, in working time.
 */
export function cycles(entries, shares = stageShares(entries), stage = STAGES[0]) {
  const times = stageTimes(entries, shares, stage);
  const out = [];
  for (const n of Object.keys(times)
    .map(Number)
    .sort((a, b) => b - a)) {
    const [a, b] = [times[n - 1], times[n]];
    if (!a) continue;
    out.push({
      from: n - 1,
      to: n,
      stage,
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
 * The velocity at each earlier step of the 96 hours before the latest one (`HISTORY_HOURS`), worked out again from the
 * steps logged by then, as if it were that moment: [{ key, spansPerWeek, span, stage }], newest first, `span` and `stage`
 * the step it was timed by. Older ones aren't in it, so a push keeps only the last 96 hours; steps logged late are counted
 * where their time stamps put them.
 */
export function velocityHistory(entries) {
  const steps = allSteps(entries);
  if (!steps.length) return [];
  const last = steps.at(-1).at.getTime();
  const times = [...new Set(steps.map((t) => t.at.getTime()))].filter(
    (t) => t < last && t >= last - HISTORY_HOURS * HOUR,
  );
  const out = [];
  for (const t of times.sort((a, b) => b - a)) {
    const v = velocity(entries.filter((e) => parseKey(e.key).getTime() <= t));
    if (v?.spansPerWeek != null)
      out.push({
        key: toKey(new Date(t)),
        spansPerWeek: v.spansPerWeek,
        span: v.window.span,
        stage: v.stage,
      });
  }
  return out;
}

/**
 * Which way a velocity figure last went, from the header of the file holding its earlier values (gantry-cycles.yaml's; status.yaml's
 * before Nov. 8, 2026): the figure shown (to two decimals) against the value it had before. That's the newest of the
 * file's `-previous` values when the file already holds the figure shown, or else the file's own value (the figure shown
 * is new, with waiting changes or a new way of working it out). The forms status.yaml had on Nov. 7, 2026 are read too:
 * underscores in the keys, and a single `-previous` value.
 * @param {string} shown "2.83"
 * @param {object} header The file's parsed header (statusFile.js's parseStatus reads gantry-cycles.yaml's too)
 * @param {string} key "spans-per-week"
 * @returns {{ way: "up"|"down", from: string }|null} null when there's nothing to compare with, or it didn't move.
 */
export function trendOf(shown, header, key) {
  const field = (k) => header?.[k] ?? header?.[k.replaceAll("-", "_")];
  const now = field(key)?.value;
  const before = field(`${key}-previous`);
  const from = now === shown ? (before?.list?.[0]?.value ?? (before?.value || undefined)) : now;
  if (from == null || +from === +shown) return null;
  return { way: +shown > +from ? "up" : "down", from };
}

/**
 * How far along the gantry was at a moment, in spans (a span number plus how far through that span's cycle), read off
 * between the logged steps either side of it on the shift clock, as an estimated step is. Null with no step on one side.
 * Steps logged out of order don't take it backwards.
 */
function progressAt(steps, shares, when) {
  const origin = steps[0].at;
  let furthest = -Infinity;
  const points = [];
  for (const t of steps) {
    furthest = Math.max(furthest, t.span + shares[t.index].position);
    points.push({ position: furthest, hours: shiftHours(origin, t.at), at: t.at });
  }
  const before = points.filter((p) => p.at <= when).at(-1);
  const after = points.find((p) => p.at > when);
  if (!before || !after) return null;
  const hours = shiftHours(origin, when);
  const part = after.hours > before.hours ? (hours - before.hours) / (after.hours - before.hours) : 0;
  return before.position + (after.position - before.position) * part;
}

/**
 * The velocity now: how far the gantry got in the 168 hours (a week) up to the step reported most recently, so it moves
 * with every step logged. That step's own place is logged; the place a week before it is read off between the steps
 * either side. Spans per week is that distance over the week's working time (a week always holds one shutdown, so 5.5
 * working days).
 * @returns {{ spansPerWeek: number|null, stage: string, window: { start: string, end: string, from: number,
 *   to: number, span: number }|null, shares: object[], current: { span: number, since: string, days: number }|null }|null}
 *   `window`: its start and end (keys), and how far along the gantry was at each, in spans; `span`, the last step's span.
 */
export function velocity(entries, now = new Date()) {
  const shares = stageShares(entries);
  const steps = allSteps(entries);
  // the step logged last (allSteps is in the order logged), and its stage
  const last = steps.at(-1);
  const stage = last ? STAGES[last.index] : STAGES[0];
  const by = stepsBySpan(entries);
  const top = Math.max(0, ...Object.keys(by).map(Number));
  const since = top ? by[top]["arrived at span"] : null;
  const current = since ? { span: top, since, days: workingHours(parseKey(since), now) / 24 } : null;
  const start = last && new Date(last.at.getTime() - WEEK_HOURS * HOUR);
  const from = last && progressAt(steps, shares, start);
  const to = last && last.span + shares[last.index].position;
  if (from == null || !(to > from))
    return current ? { spansPerWeek: null, stage, window: null, shares, current } : null;
  const spansPerWeek = ((to - from) * WORKING_DAYS_PER_WEEK * 24) / workingHours(start, last.at);
  const window = { start: toKey(start), end: toKey(last.at), from, to, span: last.span };
  return { spansPerWeek, stage, window, shares, current };
}
