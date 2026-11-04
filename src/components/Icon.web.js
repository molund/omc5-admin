// The desk's icons: thin-line drawings on a 24-unit grid, in the colour they're given (an SVG doesn't take the text colour
// from React Native styles). Add one by giving its shapes a name below. (A native build would draw the same shapes with
// react-native-svg, in Icon.native.js.)

const ICONS = {
  // "where it is now", as on Google Maps' my-location button
  crosshair: [
    ["circle", { cx: 12, cy: 12, r: 7, fill: "none" }],
    ["circle", { cx: 12, cy: 12, r: 2.5, fill: "currentColor", stroke: "none" }],
    ["path", { d: "M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5", fill: "none" }],
  ],
};

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
