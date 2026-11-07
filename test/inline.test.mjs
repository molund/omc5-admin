// The links and bold allowed in summaries, paragraphs and captions (src/lib/inline.js, a copy of the site's)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inline, plainText } from "../src/lib/inline.js";

test("links and bold are read, and nothing else", () => {
  assert.deepEqual(inline("a **bold** b __two__ c"), [
    { text: "a " },
    { text: "bold", bold: true },
    { text: " b " },
    { text: "two", bold: true },
    { text: " c" },
  ]);
  assert.deepEqual(inline("see [the map](https://clayton-clipper.olund.ca/?span=38) and __[Trackside](?post=x)__"), [
    { text: "see " },
    { text: "the map", href: "https://clayton-clipper.olund.ca/?span=38" },
    { text: " and " },
    { text: "Trackside", bold: true, href: "?post=x" },
  ]);
  // anything else shows as typed: a lone mark, other markdown, a link that isn't to a web address
  for (const t of ["2 ** 3", "_italic_ and `code`", "# heading", "[x](javascript:alert(1))", "snake_case __x"])
    assert.deepEqual(inline(t), [{ text: t }]);
  assert.deepEqual(inline(""), []);
  assert.equal(plainText("**Span 38** is [hung](/trackside/)."), "Span 38 is hung.");
});

test("the copy matches the site's, apart from its first line", () => {
  let site;
  try {
    site = readFileSync(new URL("../../omc5/src/lib/inline.js", import.meta.url), "utf8");
  } catch {
    return; // the site isn't checked out beside this repo
  }
  const body = (s) => s.slice(s.indexOf("\nconst BOLD"));
  assert.equal(body(readFileSync(new URL("../src/lib/inline.js", import.meta.url), "utf8")), body(site));
});
