// The prompt a field's sparkle icon copies, to paste into Claude or Copilot, and the walk notes' prompt (walkPrompt), which
// turns everything written on a walk into a whole update or blog post. The style rules started as the "Writing style"
// section of molund/omc5's AGENTS.md, but they're these prompts' own now.

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

const ABOUT =
  "my personal blog about the Clayton Clipper, the gantry building the SkyTrain extension along Fraser Highway";

const VOICE = `Keep my voice: first person, casual, with whatever opinions and jokes are already there. It should sound like me on a good day, not a news report or a press release. Fix spelling and grammar, but keep my wording where it works.`;

const NO_INVENTION = `Don't add anything I didn't say: no new facts, numbers, reasons, feelings or opinions, and no wrap-up sentence. If something's unclear, leave it as I wrote it rather than guessing.`;

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

// my bold kept but none added (that's the Bold button's job), and a link only to an address in my own text, so a model
// can't make one up
const MARKDOWN = `write links as [text](url) and bold as **text**, and no other markdown. Keep my bold as it is, but don't add any. Only link to web addresses that are in my text: you can turn one into a [text](url) link, but never add a link to anything else. Don't add escape characters: never put a backslash before _, *, [, ], ( or ), in a link's address or anywhere else.`;

const REPLY_TWICE = `Return it twice: first as readable text, then as a code block with no formatting. Each version must be one paragraph with no line breaks.

In the code block, ${MARKDOWN}`;

const REPLY_ALONE = `Reply with the edited paragraph only: one paragraph with no line breaks, and nothing before or after it.

In it, ${MARKDOWN}`;

/**
 * @param {string} writes What to turn the text into: "a blog intro paragraph", say.
 * @param {string} text The field's text.
 * @param {object} [context] The rest of the post, as postContext's inputs, when the text is part of one.
 * @param {boolean} [alone] Ask for the paragraph alone (links and bold allowed), for the kept prompts (promptLog.js), instead of twice
 *   with a code block, which is only there to make copying easy in the Gemini and Copilot iPhone apps.
 * @returns {string}
 */
export function writingPrompt(writes, text, context, alone = false) {
  const post = context && postContext(context);
  const around =
    post && post !== HERE
      ? `Here's the rest of the post, for context. Don't repeat it or rewrite it; just make my text fit where it goes (marked ${HERE}):\n\n${post}\n\n`
      : "";
  return `Tidy this up into ${writes} for ${ABOUT}.

${VOICE}

${NO_INVENTION}

Style:

${STYLE_GUIDE}

${around}${alone ? REPLY_ALONE : REPLY_TWICE}

Here's my text:

${text}`;
}

// the walk notes are cut down, not tidied, so their prompt doesn't ask for my wording to be kept as the sparkle one does
const WALK_VOICE = `Write it in my voice: first person, casual, with my opinions and jokes where they're good. It should sound like me on a good day, not a news report or a press release. You're the editor: rewrite freely, as long as it still sounds like me.`;

const WALK_NO_INVENTION = `Don't add anything I didn't say: no new facts, numbers, reasons, feelings or opinions, and no wrap-up sentence. Cutting is fine; inventing isn't.`;

/**
 * The walk notes' prompt: everything Mike wrote on a walk, and his captions for its photos, to be cut down into a whole update
 * or blog post. The reply comes back in a tagged format, one item per line (walkReply.js reads it).
 * @param {object} w
 * @param {"update" | "blog"} w.kind
 * @param {string} [w.standardTitle] An update's date title, for the model to keep or replace.
 * @param {string} w.notes
 * @param {string[]} w.captions Mike's caption for each photo, in order.
 * @param {boolean} [alone] Ask for the reply with nothing around it, for the kept prompts (promptLog.js), instead of in a
 *   code block, which is only there to make copying easy in the Gemini and Copilot iPhone apps.
 * @returns {string}
 */
export function walkPrompt({ kind, standardTitle, notes, captions }, alone = false) {
  const update = kind === "update";
  const title = update
    ? `- A title. The standard title is "${standardTitle}". Keep it unless something from this walk stands out enough for a title of its own, like "Clayton Clipper finishes hanging span 35; new girder arrives" or "Surrey Sprinter hangs its first span past Green Timbers".`
    : `- A title, like "The curious case of Clayton Clipper span 50" or "I found someone who posts Clayton Clipper videos on TikTok".`;
  const photos = captions.length
    ? `\n- My photos, each with a caption. My captions are rough notes: rewrite each one from scratch as one short, clear sentence saying what the photo shows. Use what my notes say about it, and fix the grammar. Put each photo after the paragraph it goes with.`
    : "";
  const format = [
    update ? "TITLE: keep (or TITLE: the new title)" : "TITLE: the title",
    "SUMMARY: the summary",
    "PARAGRAPH: a paragraph",
    ...(captions.length ? ["PHOTO 1: its caption", "PARAGRAPH: another paragraph"] : ["PARAGRAPH: another paragraph"]),
  ].join("\n");
  const mine = captions.length
    ? `My photos, with my captions for them:\n\n${captions.map((c, i) => `PHOTO ${i + 1}: ${c.trim() || "(no caption)"}`).join("\n")}\n\n`
    : "";
  return `Turn my walk notes into ${update ? "a construction update" : "a blog post"} for ${ABOUT}.

My notes hold far too much on purpose. Keep the post to about 100 words, not counting the title or captions: the summary and one or two short paragraphs. Pick the one to three most interesting things and drop everything else without mentioning it. Lead with the most interesting thing.

Interesting: something new or unusual, a first or a milestone, something people passing by would notice or wonder about, and my best jokes or opinions. Boring, so leave it out unless it's unusual: the routine steps of the gantry's cycle (segments hung, gluing, post-tensioning, hangers), which the site already tracks; where exactly I stood or walked; and things that look the same as last time.

The notes mix what I saw with instructions to you, like "include a link to https://…" (usually an earlier post of mine) or "mention this in the summary". Follow the instructions, but never put them in the post.

${WALK_VOICE}

${WALK_NO_INVENTION}

The post has:

${title}
- A summary: one sentence, short enough for the status card on the site's home page. It's a hook to get readers to open the full post, so give them the most interesting thing without giving it all away.
- Paragraphs after the summary.${photos}

Style:

${STYLE_GUIDE}

Reply in exactly this format, one item per line, in the order they go in the post, with no line breaks inside an item:

${format}
${captions.length ? "\nUse every photo exactly once, by its number.\n" : ""}
In every item, ${MARKDOWN}

${alone ? "Reply with nothing before or after it." : "Put the whole reply in one code block, with nothing before or after it."}

${mine}My walk notes:

${notes}`;
}
