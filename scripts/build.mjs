// Builds the Leash Log for the Claude app: dist/index.html (the artifact's page), dist/app.js (the React Native app, through
// react-native-web), dist/tools/apply-changes.mjs (for the push session), and the first copy of status.yaml.
//
//   node scripts/build.mjs [--status path/to/status.yaml] [--commit sha]
//
// gantry-cycles.yaml is copied from beside status.yaml when it's there.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promptVersion } from "./promptVersion.cjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const config = JSON.parse(readFileSync(`${root}desk.config.json`, "utf8"));

mkdirSync(`${root}dist/tools`, { recursive: true });

await build({
  entryPoints: [`${root}index.web.js`],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: `${root}dist/app.js`,
  alias: { "react-native": "react-native-web" },
  resolveExtensions: [".web.js", ".js", ".jsx", ".json"],
  // the header's logo goes in the bundle as a data URL, which react-native-web's Image takes as its source
  loader: { ".js": "jsx", ".png": "dataurl" },
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.PROMPT_VERSION": JSON.stringify(promptVersion()),
    __DEV__: "false",
    global: "window",
  },
  legalComments: "none",
  logLevel: "warning",
});

await build({
  entryPoints: [`${root}tools/apply-changes.mjs`],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: `${root}dist/tools/apply-changes.mjs`,
  logLevel: "warning",
});

const page = readFileSync(`${root}web/index.html`, "utf8").replace("/*DESK_CONFIG*/ {}", JSON.stringify(config));
writeFileSync(`${root}dist/index.html`, page);

const status = arg("--status");
if (status) {
  copyFileSync(status, `${root}dist/status.yaml`);
  const desk = status.replace(/status\.yaml$/, "gantry-cycles.yaml");
  if (desk !== status && existsSync(desk)) copyFileSync(desk, `${root}dist/gantry-cycles.yaml`);
  writeFileSync(
    `${root}dist/copy.json`,
    JSON.stringify({ commit: arg("--commit") ?? "", syncedAt: new Date().toISOString() }) + "\n",
  );
}
console.log("built dist/");
