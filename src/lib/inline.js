// A copy of src/lib/inline.js in molund/omc5: the little markdown allowed in an update's summaries, paragraphs and photo
// captions, links, [text](url), and bold, **text** or __text__. Nothing else is read as markdown; it shows as typed.

// bold, **…** or __…__, on one line, with text right inside the marks
const BOLD = /\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__/g;
// a link: its text in brackets, then a web address (http, https or one on this site) in parentheses
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|\/|\?)[^\s()]+)\)/g;

/**
 * Text cut into pieces: { text, bold?, href? }, in order, with the marks taken out.
 * @param {string} text
 * @returns {{ text: string, bold?: boolean, href?: string }[]}
 */
export function inline(text) {
  const out = [];
  const links = (piece, bold) => {
    let last = 0;
    for (const m of piece.matchAll(LINK)) {
      if (m.index > last) out.push({ text: piece.slice(last, m.index), bold });
      out.push({ text: m[1], bold, href: m[2] });
      last = m.index + m[0].length;
    }
    if (last < piece.length) out.push({ text: piece.slice(last), bold });
  };
  let last = 0;
  for (const m of String(text ?? "").matchAll(BOLD)) {
    if (m.index > last) links(text.slice(last, m.index), false);
    links(m[1] ?? m[2], true);
    last = m.index + m[0].length;
  }
  if (last < String(text ?? "").length) links(String(text).slice(last), false);
  return out.map((p) => ({ text: p.text, ...(p.bold && { bold: true }), ...(p.href && { href: p.href }) }));
}

/**
 * The text as it reads, without the marks: for link previews, image descriptions and the like.
 * @param {string} text
 * @returns {string}
 */
export const plainText = (text) =>
  inline(text)
    .map((p) => p.text)
    .join("");
