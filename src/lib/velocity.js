// The Clayton Clipper's velocity: the spans per week it builds, from the steps tagged in gantry-cycles.yaml, with a week's shutdown
// allowed for.
//
// The velocity is how far the gantry got in the week (168 hours) up to the step reported most recently, so it moves with
// every step logged. The recent gaps between steps give each stage's share of a span's cycle, in shift hours (no time
// passes in a shift break or the shutdown), and that places every step along the gantry's progress, in spans: the place a
// week before the last step is read off between the steps either side of it, and so is a stage or arrival that wasn't
// logged. Working time leaves out only the weekly shutdown: Friday night, 6 p.m. Friday to 7 a.m. Saturday, and Saturday
// night and Sunday's day shift, 4 p.m. Saturday (a shorter day) to 8 p.m. Sunday, BC time. A step logged in the evening at the start of
// either is overtime: that part of the shutdown starts at the step instead.
import { parseKey, toKey } from "./time.js";
import { STAGES } from "./stages.js";
import { rangesOf } from "./shutdowns.js";

// The irregular shutdowns of the file being worked on (lib/shutdowns.js), as time ranges in ms, while a calculation runs:
// `off` are all of them (no gantry work in them: the shift clock leaves them out, and a step reported in one is counted at its
// start), `excused` the holidays (which leave working time too). It's set from the entries' `shutdowns` (what parseDesk
// returns carries them) by the calculations that take entries; a copy of the entries that has lost them (a filter) keeps
// whatever the caller set.
let calendar = { off: [], excused: [] };
/** Runs a calculation with the entries' irregular shutdowns in force. */
export function withCalendar(entries, fn) {
  if (!entries?.shutdowns) return fn();
  const before = calendar;
  calendar = rangesOf(entries.shutdowns);
  try {
    return fn();
  } finally {
    calendar = before;
  }
}
const scoped =
  (fn) =>
  (entries, ...rest) =>
    withCalendar(entries, () => fn(entries, ...rest));

// the spans before the newest that the stage shares are fitted on, and the velocity panel lists steps for
export const WINDOW = 3;
// the velocity's reach back from the latest step: a week, which always holds exactly one shutdown
const WEEK_HOURS = 168;
// how far back gantry-cycles.yaml keeps the velocity's earlier values (velocityHistory), from the latest step
export const HISTORY_HOURS = 96;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// the shutdown, as [start, hours], the start in hours from the start of a BC week (Sunday 00:00): Friday 18:00 to
// Saturday 07:00, and Saturday 16:00 to Sunday 20:00
const SHUTDOWNS = [
  [5 * 24 + 18, 13], // Friday 18:00
  [6 * 24 + 16, 28], // Saturday 16:00
];
export const WORKING_DAYS_PER_WEEK = 7 - SHUTDOWNS.reduce((total, [, hours]) => total + hours, 0) / 24;
// BC time is UTC−7 all year in status.yaml's time stamps
const bc = (d) => new Date(d.getTime() - 7 * HOUR);
// the shifts, in hours from a BC midnight: Friday's and Saturday's night shifts and Sunday's day shift are the shutdown,
// and Saturday's day shift is shorter
const DAY_SHIFT = [7, 17];
const SATURDAY_DAY_SHIFT = [7, 16];
const NIGHT_SHIFT = [20, 30];
// the stages' shares come from the steps since here: the ones before it were filled in from old posts, before the Leash Log tagged steps
export const SHARES_SINCE = "2026-11-03";
// the shift hours from a stage to the next, where the job says how long it should be: most of these are nearly one moment
const KNOWN_HOURS = { "arrived at span": 0.5, hung: 1, glued: 1, "cables down": 2.5, "hangers down": 1 };
// how hard a segment's length is pulled toward that, or toward the average; the gaps logged are worth 1 each
const FIRM = 10;
const LIGHT = 0.05;
const QUARTER = HOUR / 4;

/**
 * Hours between two Dates that aren't in a shutdown: the weekly one, and the excused irregular ones (holidays), where the two
 * overlap counted once. `logged`, the times of the steps logged (ms): one in a weekly shutdown's evening is overtime, so that
 * shutdown starts at the latest of them instead. `excused` can be given to leave the holidays out of the sum or put others in.
 */
export function workingHours(from, to, logged = [], excused = calendar.excused) {
  if (to <= from) return 0;
  const [a, b] = [from.getTime(), to.getTime()];
  const off = [];
  const add = (s, e) => {
    const [lo, hi] = [Math.max(s, a), Math.min(e, b)];
    if (hi > lo) off.push([lo, hi]);
  };
  // the Sunday 00:00 (BC) on or before `from`, a week back to catch a shutdown already under way
  const f = bc(from);
  let weekStart = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()) - f.getUTCDay() * DAY - 7 * DAY;
  for (; weekStart + 7 * HOUR < b + 7 * DAY; weekStart += 7 * DAY) {
    for (const [start, hours] of SHUTDOWNS) {
      let s = weekStart + 7 * HOUR + start * HOUR; // back to real time
      const e = s + hours * HOUR;
      // the evening, up to midnight: a step logged in it is the day shift's overtime
      const evening = s + (24 - (start % 24)) * HOUR;
      for (const t of logged) if (t > s && t < evening) s = t;
      add(s, e);
    }
  }
  for (const [s, e] of excused) add(s, e);
  off.sort((x, y) => x[0] - y[0]);
  let removed = 0,
    reached = -Infinity;
  for (const [lo, hi] of off) {
    removed += Math.max(0, hi - Math.max(lo, reached));
    reached = Math.max(reached, hi);
  }
  return (b - a - removed) / HOUR;
}

function* rawShiftsFrom(from) {
  const f = bc(from);
  // the day before: its night shift runs into this morning
  let midnight = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()) + 7 * HOUR - DAY;
  for (; ; midnight += DAY) {
    const weekday = bc(new Date(midnight)).getUTCDay();
    if (weekday !== 0) yield (weekday === 6 ? SATURDAY_DAY_SHIFT : DAY_SHIFT).map((h) => midnight + h * HOUR);
    if (weekday !== 5 && weekday !== 6) yield NIGHT_SHIFT.map((h) => midnight + h * HOUR);
  }
}

/** A shift with the irregular shutdowns cut out of it: in pieces, or nothing. */
function* clipped([start, end]) {
  let at = start;
  for (const [s, e] of [...calendar.off].sort((x, y) => x[0] - y[0])) {
    if (e <= at || s >= end) continue;
    if (s > at) yield [at, s];
    at = Math.max(at, e);
    if (at >= end) return;
  }
  if (at < end) yield [at, end];
}

function* shiftsFrom(from) {
  for (const shift of rawShiftsFrom(from)) yield* clipped(shift);
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

/**
 * When a step reported at a time counts as having happened. There's no gantry work in an irregular shutdown, so a step reported
 * during one happened before it: it's counted at the shutdown's start (the report stays as it was written, in the entries).
 * @param {string} key
 * @returns {string} The same key, or the start of the shutdown it fell in.
 */
export function countedAt(key) {
  let t = parseKey(key).getTime();
  const reported = t;
  // moved to a start that's itself inside an earlier shutdown, so on until it isn't
  for (let moved = true; moved;) {
    moved = false;
    for (const [s, e] of calendar.off)
      if (s < t && t < e) {
        t = s;
        moved = true;
      }
  }
  return t === reported ? key : toKey(new Date(t));
}

/** For each span, the earliest time stamp each step was seen: { [span]: { [stage]: key } }. */
export const stepsBySpan = scoped(function stepsBySpan(entries) {
  const out = {};
  for (const e of entries) {
    if (!e.span || !e.stage) continue;
    const s = (out[e.span] ??= {});
    const key = countedAt(e.key);
    if (!s[e.stage] || parseKey(key) < parseKey(s[e.stage])) s[e.stage] = key;
  }
  return out;
});

/**
 * The days each span took, from its arrival to the next span's arrival: { [span]: { start, end, shutdown } }. `end` is null
 * for the newest span (or one whose next arrival wasn't logged), `shutdown` whether the weekly shutdown fell inside it.
 * A span with no logged arrival isn't in it.
 */
export const spanDays = scoped(function spanDays(entries) {
  const by = stepsBySpan(entries);
  const logged = loggedTimes(allSteps(entries));
  const out = {};
  for (const [span, steps] of Object.entries(by)) {
    const start = steps[STAGES[0]];
    if (!start) continue;
    const end = by[Number(span) + 1]?.[STAGES[0]] ?? null;
    const [a, b] = [parseKey(start), end && parseKey(end)];
    out[span] = { start, end, shutdown: !!end && workingHours(a, b, logged) < (b - a) / HOUR };
  }
  return out;
});

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

// the times of the steps logged (ms), for workingHours' overtime
const loggedTimes = (steps) => steps.map((t) => t.at.getTime());

/**
 * How the cycle divides up: [{ stage, position, share }] in cycle order, `position` how far through the cycle the stage
 * comes and `share` how much of it runs from there to the next stage, both as fractions.
 *
 * The cycle is a loop of one segment per stage. Each gap between neighbouring steps since SHARES_SINCE, on the spans the
 * velocity covers, says what the segments it crosses add up to in shift hours, and the lengths are the non-negative least
 * squares fit of those gaps. A segment with a known length is pulled firmly to it, the rest lightly to the average, which fills
 * in what was never logged.
 */
export const stageShares = scoped(function stageShares(entries) {
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
});

/**
 * When each span's arrival was: { [span]: { key, estimated } }. A logged arrival as logged. A missing one is read off the
 * gantry's progress, in shift hours, between the nearest steps either side of it, to the quarter hour. With no step on one
 * side, the span isn't in it.
 */
export const arrivals = scoped(function arrivals(entries, shares = stageShares(entries)) {
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
});

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
 * it and when it was expected, estimated the same way from the other steps, negative when it came earlier (null with no other
 * step on one side of it).
 */
export const stepsWithEstimates = scoped(function stepsWithEstimates(entries, shares = stageShares(entries)) {
  const steps = allSteps(entries);
  if (!steps.length) return [];
  const by = stepsBySpan(entries);
  const at = estimator(steps, shares);
  const arrived = arrivals(entries, shares);
  const logged = loggedTimes(steps);
  const out = [];
  for (const [span, arrival] of Object.entries(arrived)) {
    for (const [index, stage] of STAGES.entries()) {
      const logged = by[span]?.[stage];
      const key = index === 0 ? arrival.key : (logged ?? at(Number(span) + shares[index].position));
      if (!key) continue;
      const hours = workingHours(parseKey(arrival.key), parseKey(key), logged);
      if (hours > 0 || index === 0)
        out.push({ span: Number(span), stage, key, hours, estimated: index === 0 ? arrival.estimated : !logged });
    }
  }
  out.sort((a, b) => a.span - b.span || a.hours - b.hours);
  return out.map((t, i) => {
    const next = out[i + 1];
    const stepHours =
      next && next.span <= t.span + 1 ? workingHours(parseKey(t.key), parseKey(next.key), logged) : null;
    return { ...t, stepHours, offHours: t.estimated ? null : offHours(steps, shares, t) };
  });
});

// how far a logged step is from when it was expected: estimated as if it hadn't been logged, from the other steps, in working hours,
// negative when it came earlier than expected
function offHours(steps, shares, t) {
  const index = STAGES.indexOf(t.stage);
  const others = steps.filter((s) => s.span !== t.span || s.index !== index);
  if (!others.length) return null;
  const expected = estimator(others, shares)(t.span + shares[index].position);
  if (!expected) return null;
  const [a, b] = [parseKey(t.key), parseKey(expected)];
  const logged = loggedTimes(steps);
  return a < b ? -workingHours(a, b, logged) : workingHours(b, a, logged);
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
export const cycles = scoped(function cycles(entries, shares = stageShares(entries), stage = STAGES[0]) {
  const times = stageTimes(entries, shares, stage);
  const logged = loggedTimes(allSteps(entries));
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
      hours: workingHours(parseKey(a.key), parseKey(b.key), logged),
    });
  }
  return out;
});

/**
 * The arrival itself and each step logged after it, once, at its earliest, with the working hours since that arrival:
 * [{ span, stage, key, hours }]. Highest span first, then the shortest since arrival first (the arrival). A span with no logged arrival
 * has none.
 */
export const sinceArrival = scoped(function sinceArrival(entries) {
  const logged = loggedTimes(allSteps(entries));
  const out = [];
  for (const [span, steps] of Object.entries(stepsBySpan(entries))) {
    const arrival = steps[STAGES[0]];
    if (!arrival) continue;
    for (const [stage, key] of Object.entries(steps)) {
      const hours = workingHours(parseKey(arrival), parseKey(key), logged);
      if (hours > 0 || stage === STAGES[0]) out.push({ span: Number(span), stage, key, hours });
    }
  }
  return out.sort((a, b) => b.span - a.span || a.hours - b.hours);
});

/**
 * The velocity at each earlier step of the 96 hours before the latest one (`HISTORY_HOURS`), worked out again from the
 * steps logged by then, as if it were that moment: [{ key, spansPerWeek, span, stage }], newest first, `span` and `stage`
 * the step it was timed by. Older ones aren't in it, so a push keeps only the last 96 hours; steps logged late are counted
 * where their time stamps put them.
 */
export const velocityHistory = scoped(function velocityHistory(entries) {
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
});

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
 * either side. Spans per week is that distance over the week's working time (a week always holds one shutdown, so about 5.29
 * working days).
 * @returns {{ spansPerWeek: number|null, stage: string, window: { start: string, end: string, from: number,
 *   to: number, span: number, extended: number }|null, shares: object[], current: { span: number, since: string, days: number }|null }|null}
 *   `window`: its start and end (keys), and how far along the gantry was at each, in spans; `span`, the last step's span;
 *   `extended`, the hours a holiday in it extended the week by (0 with none).
 */
export const velocity = scoped(function velocity(entries, now = new Date()) {
  const shares = stageShares(entries);
  const steps = allSteps(entries);
  // the step logged last (allSteps is in the order logged), and its stage
  const last = steps.at(-1);
  const stage = last ? STAGES[last.index] : STAGES[0];
  const by = stepsBySpan(entries);
  const top = Math.max(0, ...Object.keys(by).map(Number));
  const since = top ? by[top]["arrived at span"] : null;
  const current = since
    ? { span: top, since, days: workingHours(parseKey(since), now, loggedTimes(steps)) / 24 }
    : null;
  // A holiday in the week extends it: the week reaches back 168 hours that aren't one, so a day off isn't a slow week. What
  // extends it is the holidays' excused hours (up to 24 each) outside the weekly shutdown, which a week already leaves out.
  // Reaching back by them can bring more of a holiday into the week, so it goes on until it stops.
  const excusedIn = (a, b) => workingHours(a, b, [], []) - workingHours(a, b, []);
  let extended = 0;
  for (let i = 0; last && i < 100; i++) {
    const hours = excusedIn(new Date(last.at.getTime() - (WEEK_HOURS + extended) * HOUR), last.at);
    if (Math.abs(hours - extended) < 1e-9) break;
    extended = hours;
  }
  const start = last && new Date(last.at.getTime() - (WEEK_HOURS + extended) * HOUR);
  const from = last && progressAt(steps, shares, start);
  const to = last && last.span + shares[last.index].position;
  if (from == null || !(to > from))
    return current ? { spansPerWeek: null, stage, window: null, shares, current } : null;
  // without overtime: a week's working time is the same every week, so this is the distance covered in it
  const spansPerWeek = ((to - from) * WORKING_DAYS_PER_WEEK * 24) / workingHours(start, last.at);
  const window = { start: toKey(start), end: toKey(last.at), from, to, span: last.span, extended };
  return { spansPerWeek, stage, window, shares, current };
});
