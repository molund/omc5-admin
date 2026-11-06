// Titles and their ?post= slugs, by the rules in molund/omc5's CLAUDE.md and src/lib/status.js.

import { longDate, parseKey } from "./time.js";

const DATE_TITLE = /^Clayton Clipper construction update for /;

/** "Clayton Clipper construction update for Wednesday, Nov. 4, 2026" */
export const dateTitle = (key) => `Clayton Clipper construction update for ${longDate(key)}`;

export const isDateTitle = (title) => DATE_TITLE.test(title);

/** The site's slugify, copied from src/lib/status.js. */
export function slugify(s) {
  const slug = s
    .normalize("NFKD")
    .replace(/[̀-ͯ'’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^clayton-clipper-(?=construction-update-for-)/, "")
    .replace(/(^|-)clayton-(clippers?)(?=-|$)/g, "$1$2")
    .replace(/^-+|-+$/g, "");
  const cut = slug.slice(0, 81),
    i = cut.lastIndexOf("-");
  return cut.length <= 80 ? cut : cut.slice(0, i > 0 ? i : 80);
}

/** The site's anchor for an untitled note: its UTC time, "2026-10-31t16-30". */
const anchor = (key) => parseKey(key).toISOString().slice(0, 16).replace(/:/g, "-").toLowerCase();

/**
 * Every note's slug, as the site works them out: a `slug:` is kept first, then the oldest notes take the plain words and a
 * later note with the same title gets "-2".
 * @param {{key:string, title:string, fields:{slug:string}}[]} notes
 * @returns {Map<string, string>} key → slug
 */
export function slugsOf(notes) {
  const sorted = [...notes].filter((n) => !isNaN(parseKey(n.key))).sort((a, b) => parseKey(a.key) - parseKey(b.key));
  const taken = new Set(["page"]);
  const out = new Map();
  for (const n of sorted) if (n.fields.slug) taken.add(slugify(n.fields.slug));
  for (const n of sorted) {
    if (n.fields.slug) {
      out.set(n.key, slugify(n.fields.slug));
      continue;
    }
    const base = slugify(n.title) || anchor(n.key);
    let s = base,
      i = 2;
    while (taken.has(s)) s = `${base}-${i++}`;
    taken.add(s);
    out.set(n.key, s);
  }
  return out;
}

/** The slug a new note would get, with the notes already in the file. */
export function slugFor(title, key, notes) {
  return slugsOf([...notes, { key, title, fields: { slug: "" } }]).get(key);
}

const GANTRY = /\b(Clayton Clipper|Surrey Sprinter|Fleetwood Flyer|Clipper|Sprinter|Flyer)\b/;

/**
 * What the title field should say about a title. Any update can have the date title, even with others on its day: the page
 * headings come from the time stamps, and the site makes a repeated title's address unique with "-2".
 * @param {"update"|"blog"} kind
 * @param {string} key The note's time stamp.
 * @param {string} title What's in the field.
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function titleAdvice(kind, key, title) {
  const problems = [],
    warnings = [];
  const t = title.trim();
  if (!t) problems.push(kind === "blog" ? "A blog post needs a title." : "Add a title.");
  else if (isDateTitle(t)) {
    if (kind === "blog") problems.push("A blog post needs its own title, not the date title.");
    else if (t !== dateTitle(key)) warnings.push(`The date title for this time stamp is "${dateTitle(key)}".`);
  } else {
    if (t.length >= 60) warnings.push(`Titles stay under 60 characters (this one is ${t.length}).`);
    if (/\bspans? \d+/i.test(t) && !GANTRY.test(t))
      warnings.push('Name the gantry the span belongs to, e.g. "Clayton Clipper moves to span 38".');
    // sentence case: capitals past the first word, other than names
    const names =
      /^(Clayton|Clipper|Surrey|Sprinter|Fleetwood|Flyer|Highway|Fraser|Green|Timbers|Station|Hillcrest|Street|St|Expo|Line|SkyTrain|Dywidag|Piper|Toby|SFMSF|Langley|Fraggle|Rock|I)$/;
    const caps = t
      .split(/\s+/)
      .slice(1)
      .filter((w) => /^[A-Z][a-z]/.test(w) && !names.test(w.replace(/[^A-Za-z]/g, "")));
    if (caps.length >= 2) warnings.push(`Titles are in sentence case: check ${caps.slice(0, 3).join(", ")}.`);
  }
  return { problems, warnings };
}
