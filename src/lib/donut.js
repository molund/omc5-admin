// The donut that shows how far through a step it was (components/Donut.*), in a 22-point box.
// Not the theme's colours: the orange and the pale grey were picked in the mockup (Nov. 15, 2026), the grey light enough for the
// orange to stand out on either theme.
export const DONUT_ARC = "#D4600A";
export const DONUT_TRACK = "#EDEBE4";

const RADIUS = 7;
const STROKE = 4;

/**
 * The circle's numbers for a completion: its radius and stroke, the whole circumference, and how much of it is filled.
 * @param {number} percent 0 to 99
 */
export function donutDash(percent) {
  const circumference = 2 * Math.PI * RADIUS;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return { radius: RADIUS, stroke: STROKE, circumference, filled };
}
