// The rich text boxes' model: a summary, paragraph or caption as runs of text ({ text, bold?, href? }), read from and
// written back to the little markdown the site allows (inline.js): **bold** and [links](https://…). The boxes show the
// runs and edit them; the markdown is only ever what's saved. Offsets are into the text as it reads, without the marks.
import { inline } from "./inline.js";

const style = (r) => ({ ...(r.bold && { bold: true }), ...(r.href && { href: r.href }) });
const sameStyle = (a, b) => !!a.bold === !!b.bold && (a.href ?? null) === (b.href ?? null);

/** Neighbours in the same style joined, empty runs dropped. */
export function tidy(runs) {
  const out = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else out.push({ text: r.text, ...style(r) });
  }
  return out;
}

export const fromMarkdown = (md) => tidy(inline(md ?? ""));
export const plainOf = (runs) => runs.map((r) => r.text).join("");

// one entry per character, for the edits below: the text is a paragraph at most, so this is cheap
const explode = (runs) =>
  runs.flatMap((r) => Array.from({ length: r.text.length }, (_, i) => ({ ...r, text: r.text[i] })));

/** The style of the character at `i`, or {} past either end. */
const charStyle = (runs, i) => {
  if (i < 0) return {};
  for (const r of runs) {
    if (i < r.text.length) return style(r);
    i -= r.text.length;
  }
  return {};
};

/** [from, to) replaced by `text` in the given style. */
export function replace(runs, from, to, text, st = {}) {
  const chars = explode(runs);
  chars.splice(from, to - from, ...Array.from(text, (c) => ({ text: c, ...style(st) })));
  return tidy(chars);
}

/**
 * The style new text takes at [from, to): a replaced word keeps its own; typing takes the character before's, but a link
 * only carries on when the text is inside it, not at its end or start. `bold` (true or false) overrides the bold.
 */
export function styleFor(runs, from, to, bold) {
  let st;
  if (to > from) st = charStyle(runs, from);
  else {
    st = charStyle(runs, from - 1);
    if (st.href && charStyle(runs, from).href !== st.href) st = { ...st, href: undefined };
  }
  if (bold != null) st = { ...st, bold };
  return style(st);
}

/**
 * The runs after the box's text changed to `next`. The change is taken to be at the selection it had (`sel`, { start, end })
 * when the text agrees with that, as it does for typing, pasting and corrections; otherwise at the one place they differ.
 * `bold` is passed to styleFor, or is a function giving it for where the change is.
 */
export function applyEdit(runs, next, sel, bold) {
  const old = plainOf(runs);
  let from, to, text;
  if (sel) {
    const k = next.length - (old.length - (sel.end - sel.start));
    if (
      k >= 0 &&
      sel.start <= old.length &&
      sel.end <= old.length &&
      next.slice(0, sel.start) === old.slice(0, sel.start) &&
      next.slice(sel.start + k) === old.slice(sel.end)
    ) {
      [from, to, text] = [sel.start, sel.end, next.slice(sel.start, sel.start + k)];
    }
  }
  if (from == null) {
    let a = 0;
    while (a < old.length && a < next.length && old[a] === next[a]) a++;
    let b = 0;
    while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
    [from, to, text] = [a, old.length - b, next.slice(a, next.length - b)];
  }
  return replace(runs, from, to, text, styleFor(runs, from, to, typeof bold === "function" ? bold(from) : bold));
}

/** The link around [start, end), or touching the cursor: { start, end, href, text }, or null. */
export function linkAt(runs, start, end = start) {
  let at = 0;
  const groups = [];
  for (const r of runs) {
    const last = groups[groups.length - 1];
    if (r.href && last && last.href === r.href && last.end === at) last.end += r.text.length;
    else if (r.href) groups.push({ start: at, end: at + r.text.length, href: r.href });
    at += r.text.length;
  }
  const hit = groups.find((g) => (start === end ? g.start <= start && start <= g.end : g.start < end && start < g.end));
  return hit ? { ...hit, text: plainOf(runs).slice(hit.start, hit.end) } : null;
}

/** Whether all of [start, end) is bold; for a cursor, whether typing there would be. */
export function isBold(runs, start, end = start) {
  if (start === end) return !!styleFor(runs, start, start).bold;
  return explode(runs)
    .slice(start, end)
    .every((c) => c.bold);
}

/** [start, end) made bold, or plain when it's all bold already. A link it touches goes all one way, as it's saved. */
export function toggleBold(runs, start, end) {
  for (let l = linkAt(runs, start, end); l && (l.start < start || l.end > end); l = linkAt(runs, start, end)) {
    [start, end] = [Math.min(start, l.start), Math.max(end, l.end)];
  }
  const bold = !isBold(runs, start, end);
  const chars = explode(runs);
  for (let i = start; i < end; i++) chars[i] = { ...chars[i], bold };
  return { runs: tidy(chars), start, end };
}

/** [start, end) replaced by a link, its text keeping the first character's bold. The cursor goes after it. */
export function setLink(runs, start, end, text, href) {
  const bold = (end > start ? charStyle(runs, start) : styleFor(runs, start, start)).bold;
  return { runs: replace(runs, start, end, text, { bold, href }), cursor: start + text.length };
}

/** The link at [start, end) back to plain text. */
export function removeLink(runs, start, end) {
  const l = linkAt(runs, start, end);
  if (!l) return runs;
  const chars = explode(runs);
  for (let i = l.start; i < l.end; i++) chars[i] = { ...chars[i], href: undefined };
  return tidy(chars);
}

const HREF = /^(?:https?:\/\/|\/|\?)[^\s()]+$/;

/** A typed address as one the site will link: "www.x.ca" gets https://. Null when it can't be one. */
export function cleanHref(typed) {
  let h = String(typed ?? "").trim();
  if (h && !/^(?:[a-z][a-z0-9+.-]*:|\/|\?)/i.test(h) && /^[^\s/]+\.[^\s/]+/.test(h)) h = `https://${h}`;
  return HREF.test(h) ? h : null;
}

/** The runs as markdown. Bold can't cross a line or start or end with a space, and a link is bold all through or not. */
export function toMarkdown(runs) {
  // pieces: links whole (one per line of their text), other text cut at its line breaks
  const pieces = [];
  let i = 0;
  while (i < runs.length) {
    const r = runs[i];
    if (!r.href) {
      for (const t of r.text.split(/(\n)/)) if (t) pieces.push({ text: t, bold: !!r.bold && t !== "\n" });
      i++;
      continue;
    }
    let j = i,
      text = "",
      bold = true;
    for (; j < runs.length && runs[j].href === r.href; j++) {
      text += runs[j].text;
      bold &&= !!runs[j].bold;
    }
    text.split(/(\n)/).forEach((t) => {
      if (t === "\n") pieces.push({ text: t, bold: false });
      else if (t) pieces.push({ text: t.replace(/]/g, ""), bold, href: r.href });
    });
    i = j;
  }
  const md = (p) => (p.href ? `[${p.text}](${p.href})` : p.text);
  let out = "";
  for (let k = 0; k < pieces.length;) {
    if (!pieces[k].bold) {
      out += md(pieces[k++]);
      continue;
    }
    const run = [];
    while (k < pieces.length && pieces[k].bold) run.push({ ...pieces[k++] });
    // spaces at the ends go outside the marks
    let lead = "",
      tail = "";
    if (!run[0].href) {
      lead = run[0].text.match(/^\s*/)[0];
      run[0].text = run[0].text.slice(lead.length);
    }
    const last = run[run.length - 1];
    if (!last.href) {
      tail = last.text.match(/\s*$/)[0];
      last.text = last.text.slice(0, last.text.length - tail.length);
    }
    const inner = run.map(md).join("");
    out += inner ? `${lead}**${inner}**${tail}` : lead + tail;
  }
  return out;
}
