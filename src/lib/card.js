// What the map's progress card shows for a version of status.yaml, by the new rule: the newest status update's latest word
// (its newest follow-up, else the update itself) shows only when its time stamp is `updated`. Otherwise the card has no
// text, and a Trackside button in place of Comments.

import { parseStatus, headerOf, newestFirst, followUpsNewestFirst } from "./statusFile.js";
import { compareKeys } from "./time.js";

/** @returns {{ updated: string, span: number|null, complete: boolean, text: string, button: "comments"|"trackside" }} */
export function cardFor(text) {
  const parsed = parseStatus(text);
  const head = headerOf(parsed);
  const latest = newestFirst(parsed.notes).find((n) => n.fields.summary && !n.fields.post);
  const fu = latest && followUpsNewestFirst(latest).find((f) => f.fields.summary);
  const word = fu ?? latest;
  const current = !!word && !!head.updated && compareKeys(word.key, head.updated) === 0;
  return {
    ...head,
    text: current ? word.fields.summary : "",
    button: current ? "comments" : "trackside",
  };
}
