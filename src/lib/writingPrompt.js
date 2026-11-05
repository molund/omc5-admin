// The prompt a field's sparkle icon copies, to paste into Claude or Copilot. The rules are the "Writing style" section of
// molund/omc5's CLAUDE.md: change them here when they change there.

export const WRITES_INTRO = "a blog intro paragraph";
export const WRITES_SECONDARY = "a blog secondary paragraph";
export const WRITES_FOLLOW_UP = "a follow-up to the attached blog post";

const STYLE_GUIDE = `- Spans: lowercase, "span 50", like "page 5"; capitalised only at the start of a sentence.
- Spans and girders: a span is the space between two supports, numbered along the route; a girder is a precast concrete or steel one connecting two supports, as opposed to the segmental spans the gantry builds from segments. Always call a precast concrete or steel one a "girder" and avoid "span" or "beam" for it; use the span's number only to say where it goes ("both precast concrete girders for span 34").
- Complete: a span is marked as complete by the progress card's rules (all its segments hung), whether or not its girders are in yet, so "span 34 is complete" can be true while its girders are still missing.
- Titles: sentence case for everything, posts included ("The curious case of Clayton Clipper span 50").
- Gantries: the full name first ("Clayton Clipper", "Surrey Sprinter"); "the Clipper", "the Sprinter" or "the gantry" after.
- Segments: always "segments", never "rocks". When all of a span's segments are hung, the span is "marked as complete".
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

Return it as a code block with no formatting.

Here's the text:

${text}`;
}
