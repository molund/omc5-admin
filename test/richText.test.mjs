// The rich text boxes' model (src/lib/richText.js): markdown to runs and back, typing, bold and links
import { test } from "node:test";
import assert from "node:assert/strict";
import { inline } from "../src/lib/inline.js";
import {
  applyEdit,
  cleanHref,
  fromMarkdown,
  isBold,
  linkAt,
  plainOf,
  removeLink,
  setLink,
  toMarkdown,
  toggleBold,
} from "../src/lib/richText.js";

const round = (md) => toMarkdown(fromMarkdown(md));

test("markdown comes back as it went in", () => {
  for (const md of [
    "plain",
    "a **bold** b",
    "see [the map](https://clayton-clipper.olund.ca/?span=38) now",
    "**[Trackside](?post=x)** and **two [links](/a) in bold**",
    "line one\n\n**line** two",
    "",
  ])
    assert.equal(round(md), md);
  assert.equal(round("__x__"), "**x**");
});

test("bold keeps to the site's rules", () => {
  // spaces go outside the marks, and bold stops at a line break
  assert.equal(toMarkdown([{ text: "a" }, { text: " b c ", bold: true }, { text: "d" }]), "a **b c** d");
  assert.equal(toMarkdown([{ text: "one\ntwo", bold: true }]), "**one**\n**two**");
  assert.equal(toMarkdown([{ text: "  ", bold: true }]), "  ");
  // a link half bold is saved plain
  assert.equal(
    toMarkdown([
      { text: "ab", href: "/x", bold: true },
      { text: "c", href: "/x" },
    ]),
    "[abc](/x)",
  );
  // what's saved reads back the same
  const runs = [{ text: "x " }, { text: "y ", bold: true }, { text: "z", bold: true, href: "/q" }];
  assert.deepEqual(inline(toMarkdown(runs)), [
    { text: "x " },
    { text: "y ", bold: true },
    { text: "z", bold: true, href: "/q" },
  ]);
});

test("typing takes the style before it, but doesn't run on past a link", () => {
  let r = fromMarkdown("a **b** c");
  r = applyEdit(r, "a bx c", { start: 3, end: 3 });
  assert.equal(toMarkdown(r), "a **bx** c");
  r = fromMarkdown("go [here](/x)");
  r = applyEdit(r, "go here now", { start: 7, end: 7 });
  assert.equal(toMarkdown(r), "go [here](/x) now");
  r = applyEdit(fromMarkdown("go [here](/x)"), "go hXere", { start: 5, end: 5 });
  assert.equal(toMarkdown(r), "go [hXere](/x)");
  // a correction keeps the word's style
  r = applyEdit(fromMarkdown("the **teh** end"), "the the end", { start: 4, end: 7 });
  assert.equal(toMarkdown(r), "the **the** end");
  // a bold cursor types bold; with no selection known, the change is found
  assert.equal(toMarkdown(applyEdit(fromMarkdown("ab"), "aXb", { start: 1, end: 1 }, true)), "a**X**b");
  assert.equal(toMarkdown(applyEdit(fromMarkdown("**ab** cd"), "ab c d")), "**ab** c d");
});

test("bold on and off", () => {
  let { runs, start, end } = toggleBold(fromMarkdown("one two three"), 4, 7);
  assert.equal(toMarkdown(runs), "one **two** three");
  assert.ok(isBold(runs, 4, 7));
  assert.equal(toMarkdown(toggleBold(runs, 4, 7).runs), "one two three");
  // half a link takes the whole link
  ({ runs, start, end } = toggleBold(fromMarkdown("a [link](/x) b"), 3, 4));
  assert.equal(toMarkdown(runs), "a **[link](/x)** b");
  assert.deepEqual([start, end], [2, 6]);
});

test("links: added from the selection, edited, removed", () => {
  const r = fromMarkdown("The gantry has moved to span 37.");
  assert.equal(linkAt(r, 15, 20), null);
  let { runs, cursor } = setLink(r, 15, 20, "moved", "http://www.google.ca");
  assert.equal(toMarkdown(runs), "The gantry has [moved](http://www.google.ca) to span 37.");
  assert.equal(cursor, 20);
  const l = linkAt(runs, 17);
  assert.deepEqual(l, { start: 15, end: 20, href: "http://www.google.ca", text: "moved" });
  assert.deepEqual(linkAt(runs, 20)?.start, 15); // a cursor at its end is in it
  ({ runs } = setLink(runs, l.start, l.end, "shifted", "/trackside/"));
  assert.equal(toMarkdown(runs), "The gantry has [shifted](/trackside/) to span 37.");
  assert.equal(toMarkdown(removeLink(runs, 17, 17)), plainOf(runs));
  // a bold word keeps its bold as a link
  assert.equal(toMarkdown(setLink(fromMarkdown("**a**"), 0, 1, "a", "/x").runs), "**[a](/x)**");
});

test("typed addresses", () => {
  assert.equal(cleanHref(" www.google.ca "), "https://www.google.ca");
  assert.equal(cleanHref("http://www.google.ca"), "http://www.google.ca");
  assert.equal(cleanHref("/trackside/"), "/trackside/");
  assert.equal(cleanHref("?span=38"), "?span=38");
  assert.equal(cleanHref("javascript:alert(1)"), null);
  assert.equal(cleanHref("two words"), null);
  assert.equal(cleanHref(""), null);
});
