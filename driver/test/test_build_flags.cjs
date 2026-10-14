"use strict";
// Every env var a driver module reads must either be stamped into the run file's
// `build` (run_stats.BUILD_FLAGS) or be listed below as infrastructure that cannot
// change a decision. The stamp is how an archive says which build produced it:
// FALL_BLAME, GAP_JUMP and other gates were read but never stamped, so the
// cmbg_s9 ladder (FALL_BLAME + GAP_JUMP) and fb_s9 (FALL_BLAME alone) carried the
// same `build` (docs/results.md, 2026-10-11).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { BUILD_FLAGS } = require("../run_stats.cjs");

// Endpoints, paths, credentials, run caps, logging and capture: none of them reaches a prompt or a move.
const INFRA = new Set([
  "CHROME", "DECISIONS_API_KEY", "DECISIONS_BASE_URL", "DEMO_BASE_URL", "DEMO_KEEP_LEVELS",
  "DEMO_MAX_DEATHS_PER_LEVEL", "DIAG_NAV", "FRAME_TRACE", "HAL_MAX_TOKENS", "HARNESS_URL", "HEADED",
  "JEV_VERBOSE", "LLAMA_BASE_URL", "OUT_DIR", "PLAYWRIGHT_CHROMIUM", "PLAYWRIGHT_MODULE",
  "PROMPT_DUMP", "REPLAY_DUMP", "REPLAY_JSON", "SHOT_PRE", "SIMPLE_JEV_BASE_URL", "SYSTEMONE_API_KEY",
  "VIDEO", "CEILING_TRACE", "MAX_DEATHS_PER_LEVEL", "MAX_TOTAL_STEPS", "REGRESSION_GATE",
]);

const ENV_READ = new RegExp("process" + "\\.env\\.([A-Z_]+)", "g");
const read = new Set();
for (const f of fs.readdirSync(path.join(__dirname, ".."))) {
  if (!f.endsWith(".cjs") || f.startsWith("test_")) continue;
  for (const m of fs.readFileSync(path.join(__dirname, "..", f), "utf8").matchAll(ENV_READ)) read.add(m[1]);
}
const missing = [...read].filter((v) => !INFRA.has(v) && !BUILD_FLAGS.includes(v)).sort();
assert.deepStrictEqual(missing, [], "env vars read by the driver but not stamped in build: " + missing.join(", "));
console.log(`test_build_flags: ${read.size} env vars read, all stamped or infrastructure. Failed: 0`);
