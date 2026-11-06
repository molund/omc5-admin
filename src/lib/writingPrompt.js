// The prompt a field's sparkle icon copies, to paste into Claude or Copilot. The rules are the "Writing style" section of
// molund/omc5's CLAUDE.md: change them here when they change there.

export const WRITES_INTRO = "a blog intro paragraph";
export const WRITES_SECONDARY = "a blog secondary paragraph";
export const WRITES_FOLLOW_UP = "a follow-up to the attached blog post";

const STYLE_GUIDE = `- Spans: lowercase, "span 50", like "page 5"; capitalised only at the start of a sentence.
- Spans and girders: a span is the space between two supports, numbered along the route; a girder is a precast concrete or steel one connecting two supports, as opposed to the segmental spans the gantry builds from segments. Always call a precast concrete or steel one a "girder" and avoid "span" or "beam" for it; use the span's number only to say where it goes ("both precast concrete girders for span 34").
- Avoid "complete" for a span. Nothing marks one as finished: after its segments are hung come gluing, post-tensioning and the hangers coming down (the nearest thing to done is all the hangers lowered), and girders can go in later still. Say which step happened instead: "all the segments for span 38 are hung", "span 38 is post-tensioned", "the hangers are down".
- Titles: sentence case for everything, posts included ("The curious case of Clayton Clipper span 50").
- Gantries: the full name first ("Clayton Clipper", "Surrey Sprinter"); "the Clipper", "the Sprinter" or "the gantry" after. If the text only says "the gantry", it means the Clayton Clipper.
- Segments: always "segments", never "rocks".
- Pillar, support, tulip, hammerhead: use the word as written in the note.
- Supports by name: "where spans 70 and 71 meet" in the text; "70/71" is fine in titles and short form.
- Roads: Surrey's style, "176 St", "152 St" (no "th"); "Highway 15 (176 St)" on first mention; "Fraser Highway" in text.
- Stations: the official names ("Green Timbers Station", "Hillcrest-184 Street Station").
- Times: "a.m." and "p.m.", BC time; posts show the date only.`;

/**
 * @param {string} writes What to turn the text into: "a blog intro paragraph", say.
 * @param {string} text The field's text.
 * @returns {string}
 */
export function writingPrompt(writes, text) {
  return `Turn this into ${writes}.

This is a factual news report based on an actual site visit. Don't invent any details: use only the facts you're given.

Follow this style guide:

${STYLE_GUIDE}

Use good grammar.

Return it twice: first as readable text, then as a code block with no formatting. Each version must be one paragraph with no line breaks.

Here's the text:

${text}`;
}
