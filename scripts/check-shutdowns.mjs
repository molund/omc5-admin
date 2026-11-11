// Checks the irregular shutdowns in a gantry-cycles.yaml, for the site's workflows (molund/omc5's deploy.yml and desk.yml run it
// before building), so a mistake in the list fails the run: it isn't deployed, and GitHub emails the failure.
//
//   node scripts/check-shutdowns.mjs gantry-cycles.yaml
//
// Every problem is printed as a GitHub annotation on its line of the file, and the exit code is 1 if there are any. Warnings
// fail too (a typo'd type, a typo'd field, end and hours that disagree, a holiday over 24 hours, two shutdowns that overlap),
// since a silent typo is what this is for. Needs only Node, no packages.
import { readFileSync } from "node:fs";
import { checkShutdowns } from "../src/lib/shutdowns.js";

const file = process.argv[2] ?? "gantry-cycles.yaml";
const problems = checkShutdowns(readFileSync(file, "utf8"));
// annotation text has to escape these (GitHub's workflow command format)
const escape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
for (const p of problems) console.log(`::error file=${file},line=${p.line}::${escape(p.message)}`);
if (problems.length) {
  console.log(
    `${file}: ${problems.length} problem${problems.length === 1 ? "" : "s"} in the irregular shutdowns, so nothing is deployed.`,
  );
  process.exit(1);
}
console.log(`${file}: the irregular shutdowns are fine.`);
