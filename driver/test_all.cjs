"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const SUITES = [
  "test_objective_lock.cjs",
  "test_death_history.cjs",
  "test_descent_gate.cjs",
  "test_sticky_objective.cjs",
  "test_cfg_shadow.cjs",
  "test_burn_facts.cjs",
  "test_obj_sample.cjs",
  "test_descent_laser_gate.cjs",
  "test_simulate_clock.cjs",
  "test_runner_parity.cjs",
];

// Every driver/test_*.cjs on disk must be in SUITES or explicitly listed here.
// test_runner_parity stays IN per task spec; no other file needs excluding.
const EXCLUDED = [];

const EXPECTED_RED = "test_objective_lock.cjs";
const EXPECTED_FAILURE_LINE = "jump-landing note fired on level 1 at (50,230) for gem_b; levels 0-3 pass today and must stay untouched";
// test_objective_lock.cjs produces exactly 1 FAIL line today.
const EXPECTED_RED_FAIL_COUNT = 1;

let unexpected = 0;
const results = [];

// 1b. Verify every test_*.cjs on disk is accounted for.
const diskTests = fs.readdirSync(__dirname)
  .filter(f => f.startsWith("test_") && f.endsWith(".cjs") && f !== "test_all.cjs")
  .sort();
const suiteSet = new Set(SUITES);
const excludedSet = new Set(EXCLUDED);
for (const f of diskTests) {
  if (!suiteSet.has(f) && !excludedSet.has(f)) {
    console.log(`FAIL: driver/${f} is not in SUITES or EXCLUDED`);
    unexpected++;
    results.push({ suite: f, status: "UNTRACKED" });
  }
}

for (const suite of SUITES) {
  const full = path.join(__dirname, suite);
  const res = spawnSync("node", [full], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const out = (res.stdout || "") + (res.stderr || "");
  const lastLines = out.trim().split("\n").slice(-5).join("\n");
  // 1a. PASS only on clean exit: status 0, no signal, no error.
  const cleanExit = res.status === 0 && !res.signal && !res.error;

  if (suite === EXPECTED_RED) {
    // 1c. Tighten: pinned line present AND FAIL line count matches.
    const failLines = out.split("\n").filter(l => l.startsWith("FAIL:")).length;
    if (!cleanExit && out.includes(EXPECTED_FAILURE_LINE) && failLines === EXPECTED_RED_FAIL_COUNT) {
      console.log(`EXPECTED-RED ${suite}`);
      results.push({ suite, status: "EXPECTED-RED" });
    } else {
      console.log(`FAIL ${suite} (expected red with specific failure line and fail count)`);
      console.log(`  cleanExit: ${cleanExit}, status: ${res.status}, signal: ${res.signal}, error: ${res.error}`);
      console.log(`  failLines: ${failLines} (expected ${EXPECTED_RED_FAIL_COUNT})`);
      console.log(`  hasPinnedLine: ${out.includes(EXPECTED_FAILURE_LINE)}`);
      console.log(`  output tail:\n${lastLines}`);
      unexpected++;
      results.push({ suite, status: "UNEXPECTED" });
    }
  } else {
    if (cleanExit) {
      console.log(`PASS ${suite}`);
      results.push({ suite, status: "PASS" });
    } else {
      console.log(`FAIL ${suite}`);
      console.log(`  cleanExit: ${cleanExit}, status: ${res.status}, signal: ${res.signal}, error: ${res.error}`);
      console.log(`  output tail:\n${lastLines}`);
      unexpected++;
      results.push({ suite, status: "FAIL" });
    }
  }
}

console.log("\n=== SUMMARY ===");
for (const r of results) {
  console.log(`${r.status} ${r.suite}`);
}
console.log(`\nUnexpected failures: ${unexpected}`);

process.exit(unexpected > 0 ? 1 : 0);