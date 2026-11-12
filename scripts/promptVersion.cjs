// The writing prompt's version: the short hash of the last commit that changed src/lib/writingPrompt.js, with -dirty when
// the file has changes not committed yet. Read at build time by app.config.js (the phone) and scripts/build.mjs (the Claude
// app), so each kept sparkle prompt says which wording it was copied with.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const FILE = "src/lib/writingPrompt.js";

function promptVersion() {
  const cwd = path.join(__dirname, "..");
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    const hash = git("log", "-1", "--format=%h", "--", FILE).trim();
    if (!hash) return "unknown";
    return git("status", "--porcelain", "--", FILE).trim() ? `${hash}-dirty` : hash;
  } catch {
    return "unknown";
  }
}

module.exports = { promptVersion };
