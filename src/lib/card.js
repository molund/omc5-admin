// What the map's progress card shows for a version of status.yaml, by the new rule: the newest status update's latest word
// (its newest follow-up, else the update itself) shows only when its time stamp is `updated`. Otherwise the card has no
// text, and a Trackside button in place of Comments.

import { parseStatus, headerOf, newestFirst, followUpsNewestFirst } from "./statusFile.js";
import { compareKeys, parseKey } from "./time.js";
import { parseDesk } from "./deskFile.js";

/** The card's figures that aren't in status.yaml: the site works them out from its map (src/MapView/gantryProgress.js in
 * molund/omc5). Update these if the map's spans change. */
export const TOTAL_SPANS = 105;
export const CRANE_BUILT = [11, 29, 30, 31, 32, 33, 34, 35, 36, 37, 43, 44, 45, 46, 47, 52, 53, 54];

/** "38 (+8) / 105" and the bar: the crane-built spans past the gantry, and how far along it is, not counting those. */
export const figuresFor = (span) => ({
  ahead: CRANE_BUILT.filter((n) => n > (span ?? 0)).length,
  total: TOTAL_SPANS,
  percent: Math.min(100, ((span ?? 0) / TOTAL_SPANS) * 100),
});

/**
 * The velocity chart's points, oldest first: gantry-cycles.yaml's earlier values, then the figure now at its newest entry's time
 * stamp, as the site's build draws them (src/lib/velocityChart.js in molund/omc5). A gantry-cycles.yaml without the velocity yet
 * (before Nov. 8, 2026) has none.
 * @returns {{ key: string, value: number }[]}
 */
export function velocityPoints(deskText) {
  const h = parseStatus(deskText ?? "").header;
  const now = h["spans-per-week"]?.value;
  const newest = parseDesk(deskText ?? "")[0]?.key;
  if (now == null || !newest) return [];
  const earlier = (h["spans-per-week-previous"]?.list ?? []).map((i) => ({ key: i.key, value: +i.value })).reverse();
  return [...earlier, { key: newest, value: +now }];
}

/**
 * The chart for those points, as the site draws it: a line spaced by time across `width`, the y axis zoomed to the values
 * (their range, a tenth more each side; a flat line through the middle when they're all the same), and the area under it.
 * `way` is the last value against the first, for its colour. Null with fewer than two points.
 * @returns {{ line: string, area: string, way: "up"|"down"|"flat" }|null} `line` and `area`: SVG path data.
 */
export function chartFor(points, width = 48, height = 16) {
  if (points.length < 2) return null;
  const times = points.map((p) => parseKey(p.key).getTime());
  const values = points.map((p) => p.value);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const pad = (hi - lo) / 10;
  // the line's own width kept inside the box
  const inset = 1;
  const x = (t, i) => (t1 > t0 ? ((t - t0) / (t1 - t0)) * width : (i / (points.length - 1)) * width);
  const y = (v) => (hi > lo ? inset + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (height - 2 * inset) : height / 2);
  const xy = points.map((p, i) => [x(times[i], i), y(p.value)].map((n) => +n.toFixed(2)));
  const line = xy.map(([a, b], i) => `${i ? "L" : "M"}${a} ${b}`).join(" ");
  const first = values[0],
    last = values.at(-1);
  return {
    line,
    area: `${line} L${xy.at(-1)[0]} ${height} L${xy[0][0]} ${height} Z`,
    way: last > first ? "up" : last < first ? "down" : "flat",
  };
}

/**
 * @param {string} text status.yaml
 * @param {string} [deskText] gantry-cycles.yaml, for the velocity chart
 * @returns {{ updated: string, span: number|null, complete: boolean, text: string, button: "comments"|"trackside",
 *   ahead: number, total: number, percent: number, pace: string|null, chart: object|null }}
 *   `pace`: the spans per week, as written (status.yaml's copy); `chart`: chartFor's, from gantry-cycles.yaml's earlier values.
 */
export function cardFor(text, deskText) {
  const parsed = parseStatus(text);
  const head = headerOf(parsed);
  const latest = newestFirst(parsed.notes).find((n) => n.fields.summary && !n.fields.post);
  const fu = latest && followUpsNewestFirst(latest).find((f) => f.fields.summary);
  const word = fu ?? latest;
  const current = !!word && !!head.updated && compareKeys(word.key, head.updated) === 0;
  // (named with underscores on Nov. 7, 2026, as the site still reads too)
  const h = parsed.header;
  const pace = (h["spans-per-week"] ?? h.spans_per_week)?.value ?? null;
  return {
    ...head,
    ...figuresFor(head.span),
    text: current ? word.fields.summary : "",
    button: current ? "comments" : "trackside",
    pace,
    chart: pace ? chartFor(velocityPoints(deskText)) : null,
  };
}
