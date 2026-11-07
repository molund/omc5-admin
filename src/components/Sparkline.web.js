// The velocity chart as an <svg>, as the site draws it (lib/card.js's chartFor): a line, and the area under it fading to
// nothing. Sparkline.native.js draws the same on the phone.
import { useId } from "react";

/**
 * @param {{ chart: { line: string, area: string }, color: string, width?: number, height?: number }} props
 */
export function Sparkline({ chart, color, width = 48, height = 16 }) {
  const id = `fade${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={chart.area} fill={`url(#${id})`} />
      <path d={chart.line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
