// An icon drawn with react-native-svg, in the colour it's given (a colour icon keeps its own). The shapes are in iconShapes.js; Icon.web.js draws the same
// ones as an <svg> on the web.
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { COLOUR_ICONS, ICONS, WIDTHS } from "./iconShapes";

const SHAPES = { circle: Circle, path: Path, rect: Rect };

/**
 * @param {{ name: keyof typeof ICONS, color: string, size?: number }} props
 */
export function Icon({ name, color, size = 16 }) {
  const shapes = ICONS[name];
  if (!shapes) return null;
  const grid = WIDTHS[name] ?? 24;
  return (
    <Svg
      width={(size * grid) / 24}
      height={size}
      viewBox={`0 0 ${grid} 24`}
      {...(COLOUR_ICONS.has(name) ? {} : { color, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" })}
    >
      {shapes.map(([tag, attrs], i) => {
        const Shape = SHAPES[tag];
        return <Shape key={i} {...attrs} />;
      })}
    </Svg>
  );
}
