// The desk's icons: thin-line drawings on a 24-unit grid, as lists of ["circle" or "path", its attributes]. Add one by
// giving its shapes a name here. Icon.web.js draws them as an <svg> and Icon.native.js with react-native-svg.
export const ICONS = {
  // "where it is now", as on Google Maps' my-location button
  crosshair: [
    ["circle", { cx: 12, cy: 12, r: 7, fill: "none" }],
    ["circle", { cx: 12, cy: 12, r: 2.5, fill: "currentColor", stroke: "none" }],
    ["path", { d: "M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5", fill: "none" }],
  ],
  // "copy a prompt for an AI"
  sparkle: [["path", { d: "M10 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 3v4M17 5h4", fill: "none" }]],
  check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5", fill: "none" }]],
};
