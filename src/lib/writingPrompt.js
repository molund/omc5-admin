// The prompt a field's sparkle icon copies, to paste into Claude or Copilot. The style rules started as the "Writing style"
// section of molund/omc5's CLAUDE.md, but they're this prompt's own now.

export const WRITES_INTRO = "a blog intro paragraph";
export const WRITES_SECONDARY = "a blog secondary paragraph";
export const WRITES_FOLLOW_UP = "an addendum to the blog post below";

/** Where the text being written sits in its post's context. */
export const HERE = "▶ HERE";

const blockLine = (b) => (b.type === "photo" ? b.caption.trim() && `[Photo: ${b.caption.trim()}]` : b.text.trim());
const titleLine = (title) => title?.trim() && `Title: ${title.trim()}`;

/** A whole post's title and blocks as lines of text, for a prompt's context. Empty ones are left out. */
export const postLines = (title, blocks) => [titleLine(title), ...blocks.map(blockLine)].filter(Boolean);

/**
 * The post around the block being written, with HERE where it goes.
 * @param {object} c
 * @param {string} [c.title]
 * @param {object[]} c.blocks
 * @param {number} c.at The block being written.
 * @param {string[]} [c.above] Lines before the post: for an addendum, the update it goes under and its other addendums.
 * @param {string} [c.heading] A line before the blocks ("This addendum:").
 * @returns {string}
 */
export function postContext({ title, blocks, at, above = [], heading }) {
  const own = blocks.map((b, i) => (i === at ? HERE : blockLine(b)));
  return [...above, heading, titleLine(title), ...own].filter(Boolean).join("\n\n");
}

const STYLE_GUIDE = `- Spans: lowercase, "span 50"; capitalised only at the start of a sentence.
- Girders: a precast concrete or steel one connecting two supports is a "girder", never a "span" or "beam"; use the span's number only to say where it goes ("both precast concrete girders for span 34").
- Don't call a span "complete": say what happened ("all the segments for span 38 are hung").
- Titles: sentence case ("The curious case of Clayton Clipper span 50").
- Gantries: the full name first ("Clayton Clipper", "Surrey Sprinter"); "the Clipper", "the Sprinter" or "the gantry" after. "The gantry" on its own means the Clayton Clipper.
- Pillar, support, tulip, hammerhead, bent: use the word as written.
- Supports: "where spans 70 and 71 meet" in the text; "70/71" is fine in titles.
- Roads and places: keep them as I wrote them ("Hwy 15" stays "Hwy 15"). Numbered streets have no "th": "176 St".
- SkyTrain: always "SkyTrain", never "Skytrain".
- Stations: the official names ("Green Timbers Station", "Hillcrest-184 Street Station").
- Times: "a.m." and "p.m."; posts show the date only.`;

/**
 * @param {string} writes What to turn the text into: "a blog intro paragraph", say.
 * @param {string} text The field's text.
 * @param {object} [context] The rest of the post, as postContext's inputs, when the text is part of one.
 * @returns {string}
 */
export function writingPrompt(writes, text, context) {
  const post = context && postContext(context);
  const around =
    post && post !== HERE
      ? `Here's the rest of the post, for context. Don't repeat it or rewrite it; just make my text fit where it goes (marked ${HERE}):\n\n${post}\n\n`
      : "";
  return `Tidy this up into ${writes} for my personal blog about the Clayton Clipper, the gantry building the SkyTrain extension along Fraser Highway.

Keep my voice: first person, casual, with whatever opinions and jokes are already there. It should sound like me on a good day, not a news report or a press release. Fix spelling and grammar, but keep my wording where it works.

Don't add anything I didn't say: no new facts, numbers, reasons, feelings or opinions, and no wrap-up sentence. If something's unclear, leave it as I wrote it rather than guessing.

Style:

${STYLE_GUIDE}

${around}Return it twice: first as readable text, then as a code block with no formatting. Each version must be one paragraph with no line breaks.

In the code block, write any links as [text](url) and bold as **text**, and no other markdown. Don't add escape characters: never put a backslash before _, *, [, ], ( or ), in a link's address or anywhere else.

Here's my text:

${text}`;
}
