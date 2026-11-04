// An icon as an <svg>, in the colour it's given (an SVG doesn't take the text colour from React Native styles). The shapes are
// in iconShapes.js; Icon.native.js draws the same ones on the phone.
import { ICONS } from "./iconShapes";

/**
 * @param {{ name: keyof typeof ICONS, color: string, size?: number }} props
 */
export function Icon({ name, color, size = 16 }) {
  const shapes = ICONS[name];
  if (!shapes) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ color, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", flexShrink: 0, display: "block" }}
    >
      {shapes.map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  );
}
