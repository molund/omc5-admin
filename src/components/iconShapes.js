// The desk's icons: thin-line drawings on a 24-unit grid, as lists of ["circle" or "path", its attributes]. Add one by
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
  // reading glasses, round, with a bridge and a stub at each side instead of arms: make a text box bigger, and back (the button shows it's on by its colour)
  glasses: [
    [
      "path",
      {
        d: "M2.9 12.5a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M13.1 12.5a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M10.5 10.8c.9-.8 2.1-.8 3 0M1.2 12.5h1.7M21.1 12.5h1.7",
        fill: "none",
      },
    ],
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
};
