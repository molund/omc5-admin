// Asking Claude which steps of the gantry's cycle a piece of text reports, for wording lib/stages.js's rules don't know.
// Only in the Claude app (its `sample` capability, on Mike's own Claude account, asked on a button press); elsewhere it's
// null and the Leash Log offers the rules and the picker alone.
import { capability } from "../platform/claude";
import { STAGES, STAGE_LABELS } from "../lib/stages.js";

/** Whether Claude can be asked here. */
export const canAskClaude = () => capability("sample").then((s) => !!s);

const prompt = (
  text,
) => `You read construction updates about the Clayton Clipper, a launching gantry building a SkyTrain guideway one span at a time, and say which steps of its cycle an update reports as having happened by the time it was written.

The steps, in cycle order (the tag, then what it means):
${STAGES.map((s) => `- ${s}: ${STAGE_LABELS[s]}`).join("\n")}

What each step looks like:
- arrived at span: the gantry has moved to a new span and rests on its own forward support there ("moved to span 38", "made it across to span 32").
- hanging started: some segments are hung, or the crane is lifting them ("three segments hung", "about to lift the last segment").
- hung: all the span's segments (usually 11 or 12) are hung (older updates say the span is "marked as complete").
- gluing started / glued: epoxy joins the segments; plastic is laid over the road while it's under way and lifted after.
- post-tensioning started: the span is post-tensioned after it's glued. This is the only tag for it, so use it when post-tensioning is under way or done.
- cables down: the cables attached to the hangers come down. hangers down: all the hangers are lifted down.
- supports started: the gantry's supports are being moved forward, before it launches to the next span. There is no tag for finishing: the next arrival says they're all moved.

Rules:
- Only the Clayton Clipper. Another gantry (the Surrey Sprinter, the Fleetwood Flyer) doesn't count.
- Only what the text says has happened. "Still up", "not yet", "about to" for a step means that step hasn't.
- A later step implies nothing about earlier ones: list only what the text reports.
- Precast concrete or steel girders installed by cranes are not steps of the cycle.

Answer with a JSON array of tags from the list, in cycle order, and nothing else. [] if none.

The update:
"""
${text}
"""`;

/**
 * @returns {Promise<string[]>} The tags Claude found.
 * @throws {{ code: string, message: string }} When Claude can't be asked or doesn't answer.
 */
export async function askClaude(text) {
  const sample = await capability("sample");
  if (!sample) throw { code: "unavailable", message: "Claude can't be asked from here." };
  const answer = await sample.json(prompt(text), { modelTier: "quick" });
  return STAGES.filter((s) => Array.isArray(answer) && answer.includes(s));
}
