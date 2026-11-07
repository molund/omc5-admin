// The velocity chart drawn with react-native-svg, as the site draws it (lib/card.js's chartFor): a line, and the area under
// it fading to nothing. Sparkline.web.js draws the same as an <svg>.
import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

/**
 * @param {{ chart: { line: string, area: string }, color: string, width?: number, height?: number }} props
 */
export function Sparkline({ chart, color, width = 48, height = 16 }) {
  const id = `fade${useId().replace(/:/g, "")}`;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.35" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={chart.area} fill={`url(#${id})`} />
      <Path d={chart.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
