// An icon drawn with react-native-svg, in the colour it's given. The shapes are in iconShapes.js; Icon.web.js draws the same
// ones as an <svg> on the web.
import Svg, { Circle, Path } from "react-native-svg";
import { ICONS } from "./iconShapes";

const SHAPES = { circle: Circle, path: Path };

/**
 * @param {{ name: keyof typeof ICONS, color: string, size?: number }} props
 */
export function Icon({ name, color, size = 16 }) {
  const shapes = ICONS[name];
  if (!shapes) return null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      color={color}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      {shapes.map(([tag, attrs], i) => {
        const Shape = SHAPES[tag];
        return <Shape key={i} {...attrs} />;
      })}
    </Svg>
  );
}
