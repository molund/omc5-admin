// Gentle checks from the writing style in molund/omc5's AGENTS.md. They never block a save.

const RULES = [
  [/\brocks?\b/i, 'Call them "segments", never "rocks".'],
  [/\bbeams?\b/i, 'A precast concrete or steel one is a "girder", not a "beam".'],
  [/\b\d+(st|nd|rd|th)\s+(St|Street|Ave|Avenue)\b/i, 'Roads in Surrey\'s style: "176 St", no "th".'],
  [/\b\d+\s+Street\b(?! Station)/, 'Roads in Surrey\'s style: "176 St".'],
  [/(?:^|[^.!?:"\s]\s+)Spans? \d+/, 'Lowercase "span" except at the start of a sentence.'],
  [/\b\d{1,2}(:\d\d)?\s?(am|pm|AM|PM)\b/, 'Times are written "a.m." and "p.m."'],
  [/\bFraser Hwy\b/, 'In text it\'s "Fraser Highway".'],
  [/\b(the|The) (Clipper|Sprinter)\b/, null], // handled below: full name first
];

/**
 * Hints for a note's text.
 * @param {string[]} texts The title, summary, paragraphs and captions, in order.
 * @returns {string[]}
 */
export function styleHints(texts) {
  const all = texts.filter(Boolean).join("\n");
  const out = [];
  for (const [re, msg] of RULES) if (msg && re.test(all)) out.push(msg);
  for (const [short, full] of [
    ["Clipper", "Clayton Clipper"],
    ["Sprinter", "Surrey Sprinter"],
  ]) {
    const i = all.search(new RegExp(`\\b[Tt]he ${short}\\b`));
    const j = all.indexOf(full);
    if (i >= 0 && (j < 0 || j > i)) out.push(`Use the full name first: "${full}", then "the ${short}".`);
  }
  return out;
}
