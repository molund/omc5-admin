// The push session's half of the desk: applies the desk's changes to status.yaml as it is on main, with the same code the
// desk uses (src/lib/changes.js), so the result is what the desk showed, on top of anything committed since.
//
//   node apply-changes.mjs changes.json status.yaml [--only <id>]
//
// Prints "APPLIED <id>: <message>" or "CONFLICT <id>: <why>" per change, and exits 2 if any conflicted.
import { readFileSync, writeFileSync } from "node:fs";
import { applyChange, Conflict } from "../src/lib/changes.js";

const args = process.argv.slice(2);
const [json, file] = args;
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
if (!json || !file) {
  console.error("usage: node apply-changes.mjs changes.json status.yaml [--only <id>]");
  process.exit(1);
}
const { changes } = JSON.parse(readFileSync(json, "utf8"));
let text = readFileSync(file, "utf8");
let conflicts = 0;
const todo = only ? changes.filter((c) => c.id === only) : changes;
if (!todo.length) {
  console.error(`No change with id ${only}.`);
  process.exit(1);
}
for (const c of todo) {
  try {
    text = applyChange(text, c).text;
    console.log(`APPLIED ${c.id}: ${c.message}`);
  } catch (e) {
    if (!(e instanceof Conflict)) throw e;
    conflicts++;
    console.log(`CONFLICT ${c.id}: ${e.message}`);
  }
}
writeFileSync(file, text);
process.exit(conflicts ? 2 : 0);
