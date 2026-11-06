// What the map's progress card shows for a version of status.yaml, by the new rule: the newest status update's latest word
// (its newest follow-up, else the update itself) shows only when its time stamp is `updated`. Otherwise the card has no
// text, and a Trackside button in place of Comments.

import { parseStatus, headerOf, newestFirst, followUpsNewestFirst } from "./statusFile.js";
import { compareKeys } from "./time.js";

/** The card's figures that aren't in status.yaml: the site works them out from its map (src/MapView/gantryProgress.js in
 * molund/omc5). Update these if the map's spans change. */
export const TOTAL_SPANS = 105;
export const CRANE_BUILT = [11, 29, 30, 31, 32, 33, 34, 35, 36, 37, 43, 44, 45, 46, 47, 52, 53, 54];

/** "38 (+8) / 105" and the bar: the crane-built spans past the gantry, and how far along it is, not counting those. */
export const figuresFor = (span) => ({
  ahead: CRANE_BUILT.filter((n) => n > (span ?? 0)).length,
  total: TOTAL_SPANS,
  percent: Math.min(100, ((span ?? 0) / TOTAL_SPANS) * 100),
});

/**
 * @returns {{ updated: string, span: number|null, complete: boolean, text: string, button: "comments"|"trackside",
 *   ahead: number, total: number, percent: number }}
 */
export function cardFor(text) {
  const parsed = parseStatus(text);
  const head = headerOf(parsed);
  const latest = newestFirst(parsed.notes).find((n) => n.fields.summary && !n.fields.post);
  const fu = latest && followUpsNewestFirst(latest).find((f) => f.fields.summary);
  const word = fu ?? latest;
  const current = !!word && !!head.updated && compareKeys(word.key, head.updated) === 0;
  return {
    ...head,
    ...figuresFor(head.span),
    text: current ? word.fields.summary : "",
    button: current ? "comments" : "trackside",
  };
}
