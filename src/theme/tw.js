// Tailwind for React Native (twrnc). The colours are the site's (src/app.css in molund/omc5), in a light and a dark set
// under the same names, so `tw\`bg-panel text-ink\`` works in both: useTw() hands out the set for the viewer's theme.
import { createContext, useContext } from "react";
import { Platform } from "react-native";
import { create } from "twrnc";

const light = {
  bg: "#f6f5f2",
  panel: "#ffffff",
  ink: "#1f2933",
  mute: "#5b6670",
  line: "#cbd2d9",
  accent: "#0b5fa5",
  "accent-ink": "#ffffff",
  link: "#486d95",
  green: "#3c904b",
  "button-bg": "#eff2f5",
  "button-line": "#818b98",
  "button-ink": "#1f2328",
  progress: "#6d28d9",
  add: "#e6f4ea",
  "add-ink": "#1d6b31",
  del: "#fdecea",
  "del-ink": "#a1261b",
  warn: "#fff4d6",
  "warn-ink": "#6b4a00",
  code: "#eef0f2",
};
const dark = {
  bg: "#14181c",
  panel: "#1d2329",
  ink: "#e6eaed",
  mute: "#a3adb5",
  line: "#39424b",
  accent: "#6cb4f0",
  "accent-ink": "#0c1117",
  link: "#a8c4ea",
  green: "#3c904b",
  "button-bg": "#212830",
  "button-line": "#656c76",
  "button-ink": "#f0f6fc",
  progress: "#8b5cf6",
  add: "#173a22",
  "add-ink": "#8fd6a2",
  del: "#3d1a17",
  "del-ink": "#f2a69d",
  warn: "#3a2f12",
  "warn-ink": "#f0d48a",
  code: "#1a1f24",
};

// the web takes a CSS font stack; iOS takes one font's name (Menlo is on every iPhone)
const fontFamily = {
  sans: Platform.select({ web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', default: "System" }),
  mono: Platform.select({ web: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', default: "Menlo" }),
};

const make = (colors) => create({ theme: { extend: { colors, fontFamily } } });

export const themes = {
  light: { tw: make(light), colors: light },
  dark: { tw: make(dark), colors: dark },
};

// the other one, for the progress card, which is drawn in the opposite theme
themes.light.inverse = themes.dark;
themes.dark.inverse = themes.light;

export const ThemeContext = createContext(themes.light);

/** `const { tw, colors } = useTw()` */
export const useTw = () => useContext(ThemeContext);
