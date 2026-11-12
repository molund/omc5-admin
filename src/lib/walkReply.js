// Reads the AI's reply to the walk notes' prompt (writingPrompt.js's walkPrompt): one item per line, "TITLE: …", "SUMMARY: …",
// "PARAGRAPH: …" and "PHOTO 1: …", in the order they go in the post. Forgiving about what chat apps do to it: a code fence
// around it, bold or a list dash on the labels, any case, and an item that runs onto more lines.

const LABEL = /^\s*(?:[-*•]\s+)?(\*\*)?(TITLE|SUMMARY|PARAGRAPH|PHOTO\s*#?\s*(\d+))(\*\*)?\s*:\s*(.*)$/i;

/** A title without the quotes a model may put around it. */
const unquote = (s) => s.replace(/^["“'](.*)["”']$/, "$1").trim();

/**
 * @param {string} text The reply, pasted.
 * @param {number} photoCount How many photos the walk has.
 * @returns {{ title?: string, keepTitle: boolean, blocks: object[], problems: string[] }} `blocks` are the summary first,
 *   then paragraphs ({ type: "text", text }) and photos ({ type: "photo", n, caption }) in order. A photo the reply left
 *   out goes at the end with a null caption (the walk's own is used). `title` is missing when there's no TITLE line.
 */
export function parseWalkReply(text, photoCount) {
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) continue;
    const m = line.match(LABEL);
    if (m) {
      // "**TITLE:** …": the label's bold closes after the colon
      const value = m[1] && !m[4] ? m[5].replace(/^\*\*\s*/, "") : m[5];
      items.push({ label: m[3] ? "PHOTO" : m[2].toUpperCase(), n: m[3] ? Number(m[3]) : null, text: value.trim() });
    } else if (line.trim() && items.length) {
      const last = items[items.length - 1];
      last.text = last.text ? `${last.text} ${line.trim()}` : line.trim();
    }
  }

  const problems = [];
  let title;
  let keepTitle = false;
  let summary = null;
  const body = [];
  const placed = new Set();
  for (const it of items) {
    if (it.label === "TITLE") {
      if (/^keep\.?$/i.test(it.text)) keepTitle = true;
      else if (it.text) title = unquote(it.text);
    } else if (it.label === "SUMMARY" && summary === null) summary = it.text;
    else if (it.label === "SUMMARY" || it.label === "PARAGRAPH") {
      if (it.text) body.push({ type: "text", text: it.text });
    } else if (it.n < 1 || it.n > photoCount)
      problems.push(`The reply has a photo ${it.n}, but there's no such photo.`);
    else if (placed.has(it.n)) problems.push(`The reply has photo ${it.n} twice: only the first is used.`);
    else {
      placed.add(it.n);
      body.push({ type: "photo", n: it.n, caption: it.text });
    }
  }
  for (let n = 1; n <= photoCount; n++)
    if (!placed.has(n)) {
      problems.push(`The reply left out photo ${n}, so it's at the end, with your caption.`);
      body.push({ type: "photo", n, caption: null });
    }
  if (!summary) problems.push("The reply has no SUMMARY line.");
  return { title, keepTitle, blocks: [{ type: "summary", text: summary ?? "" }, ...body], problems };
}
