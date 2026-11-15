// How far through a step it was, as a small donut with no number (a plain record: gantry-cycles.yaml's `progress`, 0 to 99).
// Donut.web.js draws the same as an <svg>.
import Svg, { Circle } from "react-native-svg";
import { DONUT_ARC, DONUT_TRACK, donutDash } from "../lib/donut.js";

/** @param {{ percent: number, size?: number }} props */
export function Donut({ percent, size = 16 }) {
  const { radius, stroke, circumference, filled } = donutDash(percent);
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" accessibilityLabel={`${percent}% through the step`}>
      <Circle cx={11} cy={11} r={radius} fill="none" stroke={DONUT_TRACK} strokeWidth={stroke} />
      {filled > 0 && (
        <Circle
          cx={11}
          cy={11}
          r={radius}
          fill="none"
          stroke={DONUT_ARC}
          strokeWidth={stroke}
          strokeDasharray={[filled, circumference]}
          rotation={-90}
          origin="11, 11"
        />
      )}
    </Svg>
  );
}
