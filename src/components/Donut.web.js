// How far through a step it was, as a small donut with no number, as an <svg> (Donut.native.js draws the same on the phone).
import { DONUT_ARC, DONUT_TRACK, donutDash } from "../lib/donut.js";

/** @param {{ percent: number, size?: number }} props */
export function Donut({ percent, size = 16 }) {
  const { radius, stroke, circumference, filled } = donutDash(percent);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      role="img"
      aria-label={`${percent}% through the step`}
      style={{ display: "block", flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r={radius} fill="none" stroke={DONUT_TRACK} strokeWidth={stroke} />
      {filled > 0 && (
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          stroke={DONUT_ARC}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 11 11)"
        />
      )}
    </svg>
  );
}
