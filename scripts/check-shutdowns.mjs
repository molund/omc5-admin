// Checks the irregular shutdowns and the nights off in shift-schedule.yaml, for the site's workflows (molund/omc5's deploy.yml
// and desk.yml run it before building), so a mistake in either list fails the run: it isn't deployed, and GitHub emails the
// failure.
//
//   node scripts/check-shutdowns.mjs shift-schedule.yaml
//
// Every problem is printed as a GitHub annotation on its line of the file, and the exit code is 1 if there are any. Warnings
// fail too (a typo'd type, a typo'd field, end and hours that disagree, a holiday over 24 hours, two shutdowns or two
// stretches of nights off that overlap), since a silent typo is what this is for. Needs only Node, no packages.
import { readFileSync } from "node:fs";
import { checkShutdowns } from "../src/lib/shutdowns.js";
import { checkNightsOff } from "../src/lib/nightsOff.js";

const file = process.argv[2] ?? "shift-schedule.yaml";
const text = readFileSync(file, "utf8");
const problems = [...checkShutdowns(text), ...checkNightsOff(text)].sort((a, b) => a.line - b.line);
// annotation text has to escape these (GitHub's workflow command format)
const escape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
for (const p of problems) console.log(`::error file=${file},line=${p.line}::${escape(p.message)}`);
if (problems.length) {
  console.log(
    `${file}: ${problems.length} problem${problems.length === 1 ? "" : "s"} in the irregular shutdowns or nights off, so nothing is deployed.`,
  );
  process.exit(1);
}
console.log(`${file}: the irregular shutdowns and nights off are fine.`);
