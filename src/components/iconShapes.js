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
  // make a text box bigger, and back
  zoomIn: [
    ["circle", { cx: 10.5, cy: 10.5, r: 7, fill: "none" }],
    ["path", { d: "M21 21l-5.5-5.5M10.5 7.5v6M7.5 10.5h6", fill: "none" }],
  ],
  zoomOut: [
    ["circle", { cx: 10.5, cy: 10.5, r: 7, fill: "none" }],
    ["path", { d: "M21 21l-5.5-5.5M7.5 10.5h6", fill: "none" }],
  ],
  // the progress card's, drawn as on the site (src/Icon.svelte in molund/omc5)
  close: [["path", { d: "M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7", fill: "none" }]],
  comment: [
    [
      "path",
      {
        d: "M5 4h14a2.33 2.33 0 0 1 2.33 2.33V15A2.33 2.33 0 0 1 19 17.33h-7.67L6.67 21.33v-4H5A2.33 2.33 0 0 1 2.67 15V6.33A2.33 2.33 0 0 1 5 4z",
        fill: "none",
      },
    ],
  ],
  // Settings
  gear: [
    ["circle", { cx: 12, cy: 12, r: 3, fill: "none" }],
    [
      "path",
      {
        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
        fill: "none",
      },
    ],
  ],
  check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5", fill: "none" }]],
};
