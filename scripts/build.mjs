// Builds the desk for the Claude app: dist/index.html (the artifact's page), dist/app.js (the React Native app, through
// react-native-web), dist/tools/apply-changes.mjs (for the push session), and the first copy of status.yaml.
//
//   node scripts/build.mjs [--status path/to/status.yaml] [--commit sha]
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const config = JSON.parse(readFileSync(`${root}desk.config.json`, "utf8"));

mkdirSync(`${root}dist/tools`, { recursive: true });

await build({
  entryPoints: [`${root}index.js`],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: `${root}dist/app.js`,
  alias: { "react-native": "react-native-web" },
  resolveExtensions: [".web.js", ".js", ".jsx", ".json"],
  loader: { ".js": "jsx" },
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', __DEV__: "false", global: "window" },
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
  writeFileSync(
    `${root}dist/copy.json`,
    JSON.stringify({ commit: arg("--commit") ?? "", syncedAt: new Date().toISOString() }) + "\n",
  );
}
console.log("built dist/");
