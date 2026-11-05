// The steps of the Clayton Clipper's cycle, as desk.yaml tags them (see docs/gantry-cycle.md in molund/omc5), and the
// rules that find them in what Mike writes. A tag means "this had happened by this time stamp": the earliest time stamp with
// a tag is the best time the desk has for that step.

/** In cycle order. Each stage of the cycle has a start and an end; arrival starts the cycle. */
export const STAGES = [
  "arrived",
  "hanging started",
  "hung",
  "gluing started",
  "glued",
  "post-tensioning started",
  "post-tensioned",
  "cables down",
  "hangers down",
  "supports started",
  "supports moved",
];

/** How each tag reads in the desk. */
export const STAGE_LABELS = {
  arrived: "Arrived at the span",
  "hanging started": "Hanging started",
  hung: "All segments hung (complete)",
  "gluing started": "Gluing started",
  glued: "Glued",
  "post-tensioning started": "Post-tensioning started",
  "post-tensioned": "Post-tensioned",
  "cables down": "Cables down",
  "hangers down": "Hangers down",
  "supports started": "Moving the supports started",
  "supports moved": "Supports moved",
};

/**
 * What an entry's saved stages load as in an editor: the two a move logs by itself, which the velocity relies on and which
 * stay unless removed, and the one step it reports (the furthest of any others).
 */
export function splitStages(stages = []) {
  const logged = ["arrived", "hung"];
  return {
    kept: STAGES.filter((s) => logged.includes(s) && stages.includes(s)),
    reported: STAGES.filter((s) => !logged.includes(s) && stages.includes(s)).slice(-1),
  };
}

/** The stages of the cycle, each from its start tag to its end tag, for the time each takes. */
export const STEPS = [
  { name: "Hanging", from: "arrived", to: "hung" },
  { name: "Gluing", from: "hung", to: "glued" },
  { name: "Post-tensioning", from: "glued", to: "post-tensioned" },
  { name: "Hangers down", from: "post-tensioned", to: "hangers down" },
  { name: "Moving the supports", from: "hangers down", to: "supports moved" },
  { name: "Launch", from: "supports moved", to: "arrived", next: true },
];

const START = /\b(start(?:ed|s|ing)?|begin(?:s|ning)?|began|beginning|under ?way|in progress|now)\b/;
const NOT = /\b(not|isn't|aren't|hasn't|haven't|still (?:up|on|in))\b/;

/**
 * The stages a piece of text reports, by rule. Plain words, in the ways Mike writes them ("moved to span 37", "all the
 * segments are hung", "fully glued", "post-tensioning is done", "the cables are down", "started moving its supports").
 * Wording the rules don't know returns nothing: the desk then asks Claude, where it can, or leaves the stages to be picked.
 * @returns {string[]} In cycle order.
 */
export function stagesIn(text) {
  const found = new Set();
  // only the Clayton Clipper's steps: a note about another gantry that doesn't name the Clipper has none
  const all = String(text ?? "").toLowerCase();
  if (/\b(sprinter|flyer)\b/.test(all) && !/\b(clipper|the gantry)\b/.test(all)) return [];
  // one sentence at a time, so "the cables are down" and "the hangers are still up" don't mix
  for (const raw of String(text ?? "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/(?<=[.!?;])\s+|\n+/)) {
    const s = raw.trim();
    if (!s) continue;
    if (
      /\b(has |have )?moved to (the next )?span\b|\barrived at span\b|\bis (now )?(at|on|over) span \d+/.test(s) &&
      !NOT.test(s)
    )
      found.add("arrived");
    if (/\bsegments?\b/.test(s)) {
      if (
        /\ball (the |\d+ |of the )?(segments|\d+)\b.*\b(hung|in place|up)\b|\b(hung|finished hanging)\b.*\ball\b/.test(
          s,
        )
      )
        found.add("hung");
      else if (
        /\b(\w+|\d+) segments? (have been |has been |are |were )?hung\b|\bstart(ed)? (lifting|hanging)|\b(lifting|hanging) segments\b/.test(
          s,
        )
      )
        found.add("hanging started");
    }
    if (/\b(marked as complete|is complete)\b/.test(s) && /\bspan\b/.test(s) && !NOT.test(s)) found.add("hung");
    if (/\bglu(e|ed|ing)\b/.test(s)) {
      if (/\bglued\b|\bfinished gluing\b|\bgluing is (done|finished|complete)\b/.test(s) && !NOT.test(s))
        found.add("glued");
      else if (START.test(s) || /\bgluing\b/.test(s)) found.add("gluing started");
    }
    if (/\bpost[- ]?tension/.test(s)) {
      if (/\b(done|finished|complete[d]?)\b/.test(s) && !NOT.test(s)) found.add("post-tensioned");
      else if (START.test(s) || /\bpost[- ]?tensioning\b/.test(s)) found.add("post-tensioning started");
    }
    if (/\bcables?\b.*\b(down|removed)\b/.test(s) && !/\bcables?\b[^.]*\bstill\b/.test(s)) found.add("cables down");
    // "six out of twelve hangers are down" is only some of them
    if (
      /\b(all (the |\d+ )?)hangers?\b.*\bdown\b|\bhangers are (all )?down\b/.test(s) &&
      !NOT.test(s) &&
      !/\b(\w+ (out )?of (the )?\w+|some|half|a few)\b[^.]*\bhangers?\b/.test(s)
    )
      found.add("hangers down");
    if (/\bsupports?\b|\bmove to the next span\b|\bbeginning the move\b/.test(s)) {
      if (/\b(finish(ed|ing)? moving|supports? (are|have been|has been) moved|moved (its|the) supports?)\b/.test(s))
        found.add("supports moved");
      else if (
        /\b(start(ed|ing)?|begin(s|ning)?|began) (moving|to move|the move)\b|\bmoving (its|the) supports?\b|\bbeginning the move\b/.test(
          s,
        )
      )
        found.add("supports started");
    }
  }
  return STAGES.filter((st) => found.has(st));
}
