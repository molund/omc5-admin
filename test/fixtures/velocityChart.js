// The progress card's velocity chart, drawn when the site is built (trackside/prerender.js writes it as dist/velocity.svg):
// a tiny line, like a stock's in Apple's Stocks app, of the spans per week the Leash Log keeps in gantry-cycles.yaml, from its
// earlier values to the figure now. The desk's card preview draws the same (chartFor in its src/lib/card.js); keep the two
// alike. Plain JS, no Svelte, so the build can run it.

// the card's --up and --down (src/app.css), and its --mute for no change: an SVG shown as an image can't read the page's
// colours, so they're written in, [light, dark]
const COLOURS = { up: ["#4f8a6b", "#7fbf9a"], down: ["#b0564f", "#e0928b"], flat: ["#5b6670", "#a3adb5"] };

/**
 * The chart's points from gantry-cycles.yaml, oldest first: its `spans-per-week-previous` list (newest first in the file, each
 * "- time: value"), then `spans-per-week` at its newest entry's time stamp. None when gantry-cycles.yaml has no velocity.
 * @param {string} text gantry-cycles.yaml
 * @returns {{ time: Date, value: number }[]}
 */
export function velocityPoints(text) {
  let now = null,
    newest = null,
    section = null;
  const earlier = [];
  for (const line of String(text ?? "").split("\n")) {
    const key = line.match(/^([a-z][a-z-]*):\s*(.*?)\s*$/);
    if (key) {
      section = key[1];
      if (section === "spans-per-week") now = +key[2];
      continue;
    }
    // under `spans-per-week-previous:`, "  - time: value"; under `entries:`, "  - time:" (the newest first)
    const item = line.match(/^ {2}-\s+(\S+):\s*(.*?)\s*$/);
    if (item && section === "spans-per-week-previous") earlier.push({ time: new Date(item[1]), value: +item[2] });
    if (item && section === "entries" && !newest) newest = new Date(item[1]);
  }
  if (now == null || isNaN(now) || !newest) return [];
  return [...earlier.reverse(), { time: newest, value: now }];
}

/**
 * The chart as an SVG file, or null with fewer than two points. The points are spaced by time across it, and the y axis is
 * zoomed to their values (their range, a tenth more each side; a flat line through the middle when they're all the same),
 * with no labels; the area under the line fades to nothing. Green when the last value is above the first, red below, grey
 * the same, each a shade lighter in dark mode.
 * @param {{ time: Date, value: number }[]} points Oldest first.
 */
export function velocityChart(points, width = 48, height = 16) {
  if (points.length < 2) return null;
  const times = points.map((p) => +p.time);
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
  const area = `${line} L${xy.at(-1)[0]} ${height} L${xy[0][0]} ${height} Z`;
  const [first, last] = [values[0], values.at(-1)];
  const way = last > first ? "up" : last < first ? "down" : "flat";
  const [light, dark] = COLOURS[way];
  const said = (n) => n.toFixed(2);
  const title =
    way === "flat"
      ? `Spans per week, unchanged at ${said(last)}`
      : `Spans per week, ${way} from ${said(first)} to ${said(last)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="c">
  <title>${title}</title>
  <style>.c{color:${light}}@media (prefers-color-scheme: dark){.c{color:${dark}}}</style>
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="currentColor" stop-opacity="0.35"/>
      <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="${area}" fill="url(#fade)"/>
  <path d="${line}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
`;
}
