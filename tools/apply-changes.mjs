// The push session's half of the Leash Log: applies the Leash Log's changes to status.yaml and gantry-cycles.yaml as they are on main, with
// the same code the Leash Log uses (src/lib/changes.js and src/lib/deskChanges.js), so the result is what the Leash Log showed, on
// top of anything committed since.
//
//   node apply-changes.mjs changes.json status.yaml [gantry-cycles.yaml] [--only <id>]
//
// gantry-cycles.yaml is created if it doesn't exist yet. Prints "APPLIED <id>: <message>" or "CONFLICT <id>: <why>" per change, and
// exits 2 if any conflicted.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Conflict } from "../src/lib/changes.js";
import { applyBoth } from "../src/lib/deskChanges.js";
import { EMPTY_DESK } from "../src/lib/deskFile.js";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const [json, file, deskFile = file.replace(/status\.yaml$/, "gantry-cycles.yaml")] = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--only",
);
if (!json || !file) {
  console.error("usage: node apply-changes.mjs changes.json status.yaml [gantry-cycles.yaml] [--only <id>]");
  process.exit(1);
}
const { changes } = JSON.parse(readFileSync(json, "utf8"));
let status = readFileSync(file, "utf8");
let desk = existsSync(deskFile) ? readFileSync(deskFile, "utf8") : EMPTY_DESK;
let conflicts = 0;
const todo = only ? changes.filter((c) => c.id === only) : changes;
if (!todo.length) {
  console.error(`No change with id ${only}.`);
  process.exit(1);
}
for (const c of todo) {
  try {
    ({ status, desk } = applyBoth({ status, desk }, c));
    console.log(`APPLIED ${c.id}: ${c.message}`);
  } catch (e) {
    if (!(e instanceof Conflict)) throw e;
    conflicts++;
    console.log(`CONFLICT ${c.id}: ${e.message}`);
  }
}
writeFileSync(file, status);
writeFileSync(deskFile, desk);
process.exit(conflicts ? 2 : 0);
