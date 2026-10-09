"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

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

const EXPECTED_RED = "test_objective_lock.cjs";
const EXPECTED_FAILURE_LINE = "jump-landing note fired on level 1 at (50,230) for gem_b; levels 0-3 pass today and must stay untouched";

let unexpected = 0;
const results = [];

for (const suite of SUITES) {
  const full = path.join(__dirname, suite);
  const res = spawnSync("node", [full], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const out = (res.stdout || "") + (res.stderr || "");
  const lastLines = out.trim().split("\n").slice(-5).join("\n");
  const code = res.status ?? 0;

  if (suite === EXPECTED_RED) {
    if (code !== 0 && out.includes(EXPECTED_FAILURE_LINE)) {
      console.log(`EXPECTED-RED ${suite}`);
      results.push({ suite, status: "EXPECTED-RED" });
    } else {
      console.log(`FAIL ${suite} (expected red with specific failure line)`);
      console.log(`  exit code: ${code}`);
      console.log(`  output tail:\n${lastLines}`);
      unexpected++;
      results.push({ suite, status: "UNEXPECTED" });
    }
  } else {
    if (code === 0) {
      console.log(`PASS ${suite}`);
      results.push({ suite, status: "PASS" });
    } else {
      console.log(`FAIL ${suite}`);
      console.log(`  exit code: ${code}`);
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