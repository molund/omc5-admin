// The Leash Log's icons: thin-line drawings on a 24-unit grid, as lists of ["circle" or "path", its attributes]. Add one by
// giving its shapes a name here. Icon.web.js draws them as an <svg> and Icon.native.js with react-native-svg.
export const ICONS = {
  // "where it is now", as on Google Maps' my-location button
  crosshair: [
    ["circle", { cx: 12, cy: 12, r: 7, fill: "none" }],
    ["circle", { cx: 12, cy: 12, r: 2.5, fill: "currentColor", stroke: "none" }],
    ["path", { d: "M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5", fill: "none" }],
  ],
  // the Update tab (a post's page of text, like Font Awesome's file-lines) and the Follow-up tab (a speech bubble with an
  // arrow down into it, like message-arrow-down)
  fileLines: [
    ["path", { d: "M5.5 2.5h8.5l4.5 4.5v14.5h-13zM14 2.5V7h4.5M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5", fill: "none" }],
  ],
  // a blog post, in the list of entries: the same page without its lines, like Font Awesome's file
  file: [["path", { d: "M5.5 2.5h8.5l4.5 4.5v14.5h-13zM14 2.5V7h4.5", fill: "none" }]],
  // an entry's paragraphs and photos, counted under it in the list of entries
  paragraph: [["path", { d: "M4 6h16M4 10.5h16M4 15h16M4 19.5h10", fill: "none" }]],
  photo: [
    ["path", { d: "M3 5h18v14H3zM3 16.5l5-5 4.5 4.5 3-3L21 18", fill: "none" }],
    ["circle", { cx: 15.5, cy: 9, r: 1.5, fill: "none" }],
  ],
  messageArrowDown: [["path", { d: "M4 3.5h16.5v13h-9L5 21V3.5zM12.25 6.5v6.5M9.25 10l3 3 3-3", fill: "none" }]],
  // "copy a prompt for an AI"
  sparkle: [["path", { d: "M10 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 3v4M17 5h4", fill: "none" }]],
  // reading glasses, round, with a bridge and a stub at each side instead of arms: make a text box bigger, and back (the button shows it's on by its colour);
  // 85% as tall as the sparkle, so wider than the grid (see WIDTHS)
  glasses: [
    [
      "path",
      {
        d: "M5.06 11.5a7.225 7.225 0 1 0 14.45 0a7.225 7.225 0 1 0 -14.45 0M23.49 11.5a7.225 7.225 0 1 0 14.45 0a7.225 7.225 0 1 0 -14.45 0M18.79 8.43c1.62-1.45 3.79-1.45 5.42 0M1.99 11.5h3.07M37.94 11.5h3.06",
        fill: "none",
      },
    ],
  ],
  // a stage with a set length, in the stage shares: a plain line hourglass (the colour one, `hourglass`, is for shutdowns)
  hourglassLine: [["path", { d: "M6 3h12M6 21h12M7 3v3.5l5 5.5-5 5.5V21M17 3v3.5L12 12l5 5.5V21", fill: "none" }]],
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
  // a warning: a triangle with an exclamation mark
  warning: [["path", { d: "M12 3.5L21.5 20h-19zM12 10v4.5M12 17.4v.1", fill: "none" }]],
  // a link, for the rich text boxes' toolbar
  link: [
    [
      "path",
      {
        d: "M10 13.5a4.5 4.5 0 0 0 6.36.36l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.5 1.5M14 10.5a4.5 4.5 0 0 0-6.36-.36l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.5-1.5",
        fill: "none",
      },
    ],
  ],

  // full colour, for the shutdowns on the Velocity page: each shape has its own fill and stroke, so these ignore the colour an
  // icon is given (see COLOUR_ICONS). A palm tree for a holiday, a calendar for the weekly shutdown, a wrench for a mechanical
  // failure and an hourglass for waiting on work ahead
  palm: [
    ["path", { d: "M3.5 22c2.2-2.4 5.3-3 8.5-3s6.3.6 8.5 3z", fill: "#ecd29a", stroke: "none" }],
    [
      "path",
      { d: "M11.2 20c.1-3.7.9-6.8 2-9.8", fill: "none", stroke: "#9a6a38", strokeWidth: 2.3, strokeLinecap: "round" },
    ],
    ["path", { d: "M13.2 10.2Q8.85 6.38 3.42 11.32Q7.77 13.26 13.2 10.2z", fill: "#2a8a47", stroke: "none" }],
    ["path", { d: "M13.2 10.2Q18.79 10.69 22.60 9.98Q17.01 7.61 13.2 10.2z", fill: "#2a8a47", stroke: "none" }],
    ["path", { d: "M13.2 10.2Q11.30 4.57 6.31 5.41Q8.21 10.05 13.2 10.2z", fill: "#35a556", stroke: "none" }],
    ["path", { d: "M13.2 10.2Q18.19 8.25 20.09 5.41Q15.10 6.37 13.2 10.2z", fill: "#35a556", stroke: "none" }],
    ["path", { d: "M13.2 10.2Q15.10 5.60 13.20 3.40Q11.30 7.40 13.2 10.2z", fill: "#3fb862", stroke: "none" }],
    ["path", { d: "M13.2 10.2Q8.99 10.05 6.15 18.27Q10.36 15.61 13.2 10.2z", fill: "#23783d", stroke: "none" }],
    ["path", { d: "M13.2 10.2Q16.04 13.81 20.25 18.27Q17.41 11.85 13.2 10.2z", fill: "#23783d", stroke: "none" }],
    ["circle", { cx: 12.3, cy: 11.5, r: 1.15, fill: "#7a4b22", stroke: "none" }],
    ["circle", { cx: 14.4, cy: 11.6, r: 1.15, fill: "#7a4b22", stroke: "none" }],
  ],
  calendar: [
    ["rect", { x: 3, y: 4.5, width: 18, height: 16.5, rx: 2.5, fill: "#ffffff", stroke: "#aeb7c0", strokeWidth: 1 }],
    ["path", { d: "M3 7a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7v2.8H3z", fill: "#e5483d", stroke: "none" }],
    ["rect", { x: 7.2, y: 2.3, width: 2.2, height: 4.4, rx: 1.1, fill: "#4b5560", stroke: "none" }],
    ["rect", { x: 14.6, y: 2.3, width: 2.2, height: 4.4, rx: 1.1, fill: "#4b5560", stroke: "none" }],
    ["circle", { cx: 8, cy: 13.3, r: 1.05, fill: "#8a949e", stroke: "none" }],
    ["circle", { cx: 12, cy: 13.3, r: 1.05, fill: "#8a949e", stroke: "none" }],
    ["circle", { cx: 16, cy: 13.3, r: 1.05, fill: "#8a949e", stroke: "none" }],
    ["circle", { cx: 8, cy: 17.2, r: 1.05, fill: "#8a949e", stroke: "none" }],
    ["circle", { cx: 12, cy: 17.2, r: 1.05, fill: "#8a949e", stroke: "none" }],
  ],
  wrench: [
    ["path", { d: "M5.2 18.8L9.4 14.6", fill: "none", stroke: "#f08a24", strokeWidth: 3.8, strokeLinecap: "round" }],
    ["path", { d: "M9.4 14.6L14 10", fill: "none", stroke: "#8794a3", strokeWidth: 3.2, strokeLinecap: "round" }],
    [
      "path",
      { d: "M20 9.6A4.3 4.3 0 1 1 14.4 4", fill: "none", stroke: "#8794a3", strokeWidth: 3, strokeLinecap: "round" },
    ],
  ],
  hourglass: [
    [
      "path",
      {
        d: "M7 4.7h10c0 4-2.6 5.6-4 7.3 1.4 1.7 4 3.3 4 7.3H7c0-4 2.6-5.6 4-7.3-1.4-1.7-4-3.3-4-7.3z",
        fill: "#d4eaf7",
        stroke: "#7aaed0",
        strokeWidth: 1,
      },
    ],
    ["path", { d: "M9 6.3h6c-.3 1.8-1.6 2.9-3 4-1.4-1.1-2.7-2.2-3-4z", fill: "#f0b84a", stroke: "none" }],
    ["rect", { x: 11.55, y: 11, width: 0.9, height: 4.4, fill: "#f0b84a", stroke: "none" }],
    ["path", { d: "M8.4 18.6h7.2c-.5-2.2-2-3.3-3.6-3.3s-3.1 1.1-3.6 3.3z", fill: "#f0b84a", stroke: "none" }],
    ["rect", { x: 5, y: 2.4, width: 14, height: 2.4, rx: 1.1, fill: "#8a5a2b", stroke: "none" }],
    ["rect", { x: 5, y: 19.2, width: 14, height: 2.4, rx: 1.1, fill: "#8a5a2b", stroke: "none" }],
  ],
  // the weather on a day bar in Velocity: a cloud with two drops for rain, four longer ones for heavy rain, and flakes for snow
  rain: [
    ["path", { d: "M7 14a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.5a3.75 3.75 0 0 1 0 7.5z", fill: "none" }],
    ["path", { d: "M10 17l-1 3M15 17l-1 3", fill: "none" }],
  ],
  heavyRain: [
    ["path", { d: "M7 14a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.5a3.75 3.75 0 0 1 0 7.5z", fill: "none" }],
    ["path", { d: "M7 16.5l-1.5 4.5M11 16.5l-1.5 4.5M15 16.5l-1.5 4.5M19 16.5l-1.5 4.5", fill: "none" }],
  ],
  snow: [
    ["path", { d: "M7 14a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 6.5a3.75 3.75 0 0 1 0 7.5z", fill: "none" }],
    ["circle", { cx: 8, cy: 18, r: 1.1, fill: "currentColor", stroke: "none" }],
    ["circle", { cx: 12, cy: 20.5, r: 1.1, fill: "currentColor", stroke: "none" }],
    ["circle", { cx: 16, cy: 18, r: 1.1, fill: "currentColor", stroke: "none" }],
  ],
};

// The width of an icon's grid when it isn't the usual 24 (it's always 24 tall); it's drawn that much wider than its size.
export const WIDTHS = { glasses: 43 };

// Icons in full colour: each shape carries its own fill and stroke, so they're drawn without the colour an icon is given.
export const COLOUR_ICONS = new Set(["palm", "calendar", "wrench", "hourglass"]);
