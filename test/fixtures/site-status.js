// The Clayton Clipper status from status.yaml: when it was last updated, the span the gantry is on, whether that span is
// complete, and the newest of its time-stamped notes. The file is flat `key: value` lines plus the `notes:` list of
// `  - time: "title"` lines (the title is shown only on a post), each followed by its summary, the note's main text,
// indented under it. Its `?post=` address on Trackside comes from the title
// ("Clayton Clipper completes span 36" is ?post=clipper-completes-span-36; "Clayton" is always left out), or from
// `slug:` if given, which
// keeps the anchor when the title is edited:
//     slug: clipper-completes-span-36
//     summary: "Span 36 is complete."
// a photo, indented under it:
//     photo:
//       file: span-36.jpg
//       caption: "Its own caption, separate from the note"
// a note to self is in desk.yaml now, not here; this reader skips a `note-to-self:` line all the same, so one is never shown
// optionally more blocks, paragraphs and photos, indented under it (shown after the summary and its photo on the Trackside page
// and in its thread; the card shows only the summary):
//     block:
//       - "A second paragraph"
//       - photo:
//           file: span-36-close-up.jpg
//           caption: "Its caption"
// and optionally follow-ups, also indented under it (no thread or entry of their own), each with the same summary, photo and
// block as a note, indented under its time stamp:
//     follow-up:
//       - 2026-10-31T11:45-07:00:
//           summary: "What changed"
//           photo:
//             file: span-36-later.jpg
//             caption: "Its caption"
//           block:
//             - "Another paragraph"
// so a small reader does instead of a YAML library.
import text from "../../status.yaml?raw";
import { anchor } from "./comments.js";

/**
 * @typedef {object} Photo
 * @property {string|null} src The photo's URL on the site (null until a `file:` line gives one).
 * @property {string} caption The photo's caption, or "".
 */

/**
 * @typedef {{ text: string } | { photo: Photo }} BlockItem A further paragraph or photo under a note.
 */

/**
 * @typedef {object} FollowUp
 * @property {Date} time When it was added.
 * @property {string} summary What it says.
 * @property {Photo|null} photo Its photo, if it has one.
 * @property {BlockItem[]} block Further paragraphs and photos, in order.
 */

/**
 * @typedef {object} Note
 * @property {Date} time The note's time stamp (a date alone is the start of that day in BC time).
 * @property {string} summary The note's main text.
 * @property {Photo|null} photo The note's photo, if it has one.
 * @property {BlockItem[]} block Further paragraphs and photos, in order.
 * @property {string} title The title for the note's own Trackside page, or "".
 * @property {string} slug The note's `?post=` slug on Trackside, unique among the notes.
 * @property {boolean} post Whether it is a post rather than a status update.
 * @property {FollowUp[]} followUps Its follow-ups, newest first.
 */

/**
 * @typedef {object} Status
 * @property {Date|null} updated When status.yaml was last updated.
 * @property {number|null} span The span the Clayton Clipper's gantry is on.
 * @property {boolean} complete Whether that span is complete.
 * @property {Note|null} latest The newest status update (not a post).
 * @property {string} note The newest status update's text, or "".
 * @property {Photo|null} photo The newest status update's photo.
 * @property {BlockItem[]} block The newest status update's further paragraphs and photos.
 * @property {FollowUp[]} followUps The newest status update's follow-ups, newest first.
 * @property {Note[]} history Every note with an summary, newest first, for Trackside.
 */

/** Where update photos live (public/images/sorry-im-a-shitty-photographer/), as a URL on the site. */
const PHOTOS = `${import.meta.env.BASE_URL}images/sorry-im-a-shitty-photographer/`;

/**
 * A YAML scalar without its quotes: double-quoted as JSON, single-quoted with '' for an apostrophe, otherwise as is.
 * @param {string} v
 * @returns {string}
 */
function unquote(v) {
  if (/^".*"$/.test(v)) return JSON.parse(v);
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/**
 * A title as a piece of web address: lowercase words joined by hyphens, cut at a word to 80 characters at most, with
 * "Clayton Clipper" shortened to "Clipper" (the site's address already says Clayton), e.g. "Clayton Clipper completes span 36;
 * tulip at 70/71 built" becomes "clipper-completes-span-36-tulip-at-70-71-built". The date titles ("Clayton Clipper
 * construction update for Monday, Nov. 2, 2026") lose it altogether: "construction-update-for-monday-nov-2-2026".
 * @param {string} s
 * @returns {string} "" if nothing is left.
 */
function slugify(s) {
  const slug = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f'\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^clayton-clipper-(?=construction-update-for-)/, "")
    .replace(/(^|-)clayton-(clippers?)(?=-|$)/g, "$1$2")
    .replace(/^-+|-+$/g, "");
  const cut = slug.slice(0, 81),
    i = cut.lastIndexOf("-");
  return cut.length <= 80 ? cut : cut.slice(0, i > 0 ? i : 80);
}

/**
 * Reads status.yaml's flat `key: value` lines and its list of notes.
 * @param {string} src The file's text.
 * @returns {Status}
 */
function parse(src) {
  const out = {},
    notes = [];
  // "block" after a `block:` line, whose "- …" lines are paragraphs and photos
  let list = null,
    // the photo a `file:` or `caption:` line belongs to
    photo = null,
    // under `follow-up:`, and the follow-up the lines below belong to (the note's own keys are four spaces in)
    inFU = false,
    fu = null;
  src.split("\n").forEach((line) => {
    // a note: "  - time: text", two spaces in
    const n = line.match(/^ {2}-\s+(\S+):\s+(.*?)\s*$/);
    if (n) {
      notes.push({
        // a post can have just a date ("2026-11-01"), taken as the start of that day in BC time
        time: new Date(/^\d{4}-\d\d-\d\d$/.test(n[1]) ? `${n[1]}T00:00-07:00` : n[1]),
        title: unquote(n[2]),
        slug: "",
        summary: "",
        photo: null,
        block: [],
        post: false,
        followUps: [],
      });
      list = null;
      photo = null;
      inFU = false;
      fu = null;
      return;
    }
    const last = notes[notes.length - 1];
    // a key four spaces in is the note's own: what follows belongs to the note again
    if (/^ {4}[A-Za-z-]+:/.test(line)) {
      inFU = false;
      fu = null;
    }
    // what summary, photo and block lines belong to: the follow-up they are under, else the note
    const tgt = fu ?? last;
    // a follow-up under the note: "      - time:", after a "    follow-up:" line, its summary, photo and block further in
    const mi = inFU && line.match(/^ {6}-\s+(\d{4}-\d\d-\d\d\S*):\s*$/);
    if (mi) {
      fu = { time: new Date(mi[1]), summary: "", photo: null, block: [] };
      if (last) last.followUps.push(fu);
      list = null;
      photo = null;
      return;
    }
    // under "block:", a photo, "- photo:" with its file and caption under it, or a paragraph, "- text"
    if (list === "block" && /^ {3,}-\s+photo:\s*$/.test(line)) {
      photo = { src: null, caption: "" };
      if (tgt) tgt.block.push({ photo });
      return;
    }
    const mo = list === "block" && line.match(/^ {3,}-\s+(.*?)\s*$/);
    if (mo) {
      if (tgt && unquote(mo[1])) tgt.block.push({ text: unquote(mo[1]) });
      return;
    }
    if (/^\s+block:\s*$/.test(line)) {
      list = "block";
      return;
    }
    if (/^\s+follow-up:\s*$/.test(line)) {
      list = null;
      inFU = true;
      return;
    }
    // a follow-up's summary, further in than the note's
    const fs = fu && line.match(/^\s{7,}summary:\s*(.*?)\s*$/);
    if (fs) {
      list = null;
      photo = null;
      fu.summary = unquote(fs[1]);
      return;
    }
    // "    post: true": a post, not a status update (see `latest` below)
    const po = line.match(/^ {4}post:\s*(.*?)\s*$/);
    if (po) {
      list = null;
      photo = null;
      if (last) last.post = po[1] === "true";
      return;
    }
    // "    slug: words-for-the-address": a note's own address, instead of its title's
    const sl = line.match(/^ {4}slug:\s*(.*?)\s*$/);
    if (sl) {
      list = null;
      photo = null;
      if (last) last.slug = slugify(unquote(sl[1]));
      return;
    }
    // the note's summary, four spaces in
    const ti = line.match(/^ {4}summary:\s*(.*?)\s*$/);
    if (ti) {
      list = null;
      photo = null;
      if (last) last.summary = unquote(ti[1]);
      return;
    }
    // a photo belongs to the note above it: `photo:`, then its `file:` and `caption:` indented under it
    if (/^\s+photo:\s*$/.test(line)) {
      list = null;
      if (tgt) photo = tgt.photo = { src: null, caption: "" };
      return;
    }
    const pf = line.match(/^\s+(file|caption):\s*(.*?)\s*$/);
    if (pf) {
      if (photo) {
        if (pf[1] === "file") photo.src = PHOTOS + unquote(pf[2]);
        else photo.caption = unquote(pf[2]);
      }
      return;
    }
    const m = line.match(/^([A-Za-z_]+):\s*(.*?)\s*$/);
    if (m) out[m[1]] = unquote(m[2]);
  });
  // newest first by time stamp, whatever order the list is in
  // a photo without a file doesn't count
  notes.forEach((n) => {
    if (n.photo && !n.photo.src) n.photo = null;
    n.block = n.block.filter((m) => m.text || m.photo?.src);
  });
  // follow-ups newest first, those with something to show
  notes.forEach((n) => {
    n.followUps.forEach((m) => {
      if (m.photo && !m.photo.src) m.photo = null;
      m.block = m.block.filter((b) => b.text || b.photo?.src);
    });
    n.followUps = n.followUps
      .filter((m) => (m.summary || m.photo || m.block.length) && !isNaN(m.time))
      .sort((a, b) => b.time - a.time);
  });
  const sorted = notes.filter((n) => !isNaN(n.time)).sort((a, b) => b.time - a.time);
  // each note's address: its `slug:`, else its title's, made unique. Those given are kept first, then the oldest notes take
  // the plain words and a later note with the same title gets "-2", so adding an update never changes an old address.
  // "page" is taken by /trackside/page/2/; a note with no title uses its time stamp.
  const taken = new Set(["page"]);
  sorted.forEach((n) => n.slug && taken.add(n.slug));
  [...sorted].reverse().forEach((n) => {
    if (n.slug) return;
    const base = slugify(n.title) || anchor(n.time).toLowerCase();
    let s = base,
      i = 2;
    while (taken.has(s)) s = `${base}-${i++}`;
    taken.add(s);
    n.slug = s;
  });
  // the newest status update; posts are left out
  const latest = sorted.find((n) => n.summary && !n.post) ?? null;
  return {
    updated: out.updated ? new Date(out.updated) : null,
    span: out.span ? +out.span : null,
    complete: out.complete === "true",
    // the newest status update (not a post), or null
    latest,
    note: latest ? latest.summary : "",
    // the newest status update's photo, { src, caption }, or null
    photo: latest ? latest.photo : null,
    // the newest status update's further paragraphs and photos, [{ text } or { photo: { src, caption } }], or []
    block: latest ? latest.block : [],
    // the newest status update's follow-ups, [{ time, summary, photo, block }], newest first
    followUps: latest ? latest.followUps : [],
    // every note with text, newest first, for Trackside (each with its photo or null, and its follow-ups)
    history: sorted.filter((n) => n.summary),
  };
}

/**
 * The Clayton Clipper's status, read from status.yaml.
 * @type {Status}
 */
export const status = parse(text);

/**
 * The calendar day of a time, in the site's time zone, as "2026-10-29". The site's time zone is BC time, UTC−7 all year:
 * America/Dawson_Creek, which has had no daylight saving time since 1972.
 * @param {Date|number} t
 * @returns {string}
 */
const dayOf = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Dawson_Creek" }).format(t);

/**
 * A time as "6:45 a.m. on Oct 29, 2026", BC time, rounded to the nearest quarter hour. With `relative`, a time today or
 * yesterday reads "6:45 a.m. today" or "6:45 a.m. yesterday" instead, and the day before yesterday "6:45 a.m. on Tuesday".
 * @param {Date|null} date
 * @param {boolean} [relative=false] Use today, yesterday and the weekday where they apply.
 * @returns {string} "" if there is no valid time.
 */
export function asOf(date, relative = false) {
  if (!date || isNaN(date)) return "";
  const q = 15 * 60 * 1000,
    d = new Date(Math.round(date.getTime() / q) * q);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Dawson_Creek",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      month: "short",
      day: "numeric",
      year: "numeric",
      weekday: "long",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const period = parts.dayPeriod.toLowerCase().startsWith("a") ? "a.m." : "p.m.";
  const time = `${parts.hour}:${parts.minute} ${period}`;
  if (relative) {
    // BC time has no daylight saving changes, so a day back is always 24 hours
    const now = Date.now(),
      day = 24 * 60 * 60 * 1000;
    if (dayOf(d) === dayOf(now)) return `${time} today`;
    if (dayOf(d) === dayOf(now - day)) return `${time} yesterday`;
    if (dayOf(d) === dayOf(now - 2 * day)) return `${time} on ${parts.weekday}`;
  }
  return `${time} on ${parts.month} ${parts.day}, ${parts.year}`;
}

/**
 * A follow-up's time: just "11:45 a.m." on the same day as its note, otherwise in full (see {@link asOf}).
 * @param {Date} t The follow-up's time.
 * @param {Date} note The time of the note it belongs to.
 * @returns {string}
 */
export function followUpTime(t, note) {
  const full = asOf(t);
  return dayOf(t) === dayOf(note) ? full.replace(/ on .*$/, "") : full;
}
