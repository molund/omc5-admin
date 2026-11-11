// The icons are drawn twice, from the same shapes: as an <svg> on the web and with react-native-svg on the phone. A shape
// with a tag the phone can't draw would vanish there without any error, so the tags are checked here, and a colour icon's
// shapes must each say how they're coloured.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOUR_ICONS, ICONS } from "../src/components/iconShapes.js";

// the tags Icon.native.js has a component for
const NATIVE = new Set(["circle", "path", "rect"]);

test("every icon uses only shapes the phone can draw", () => {
  for (const [name, shapes] of Object.entries(ICONS))
    for (const [tag] of shapes) assert.ok(NATIVE.has(tag), `${name} uses <${tag}>`);
});

test("colour icons exist, and each of their shapes carries its own fill", () => {
  assert.deepEqual([...COLOUR_ICONS].sort(), ["calendar", "hourglass", "palm", "wrench"]);
  for (const name of COLOUR_ICONS)
    for (const [tag, attrs] of ICONS[name]) {
      assert.ok(attrs.fill, `${name}'s ${tag} has no fill`);
      assert.ok(!/currentColor/i.test(JSON.stringify(attrs)), `${name} uses currentColor`);
    }
});

test("line icons don't carry colours of their own, so they follow the colour they're given", () => {
  for (const [name, shapes] of Object.entries(ICONS)) {
    if (COLOUR_ICONS.has(name)) continue;
    for (const [, attrs] of shapes) assert.ok(!/#[0-9a-f]{3,6}/i.test(JSON.stringify(attrs)), `${name} has a colour`);
  }
});
