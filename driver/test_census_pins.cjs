// Pins the census harness (experiments/census_simulate_clock.cjs) to its audited
// output: deterministic across runs, and the four site verdicts and counts match
// the corrected methodology (site-5 offer gate + site-6 held-arc pick, 2026-10-09).
// The census had two methodology bugs found the hard way (nearest-landing-only
// enumeration; envelope-edge pick instead of the real nearest-to-cat held-arc
// pick). This test is the tripwire: any change to the census output fails here,
// on purpose. When a methodology change is merged deliberately, update the pins
// in the same commit and say why in the commit message.

"use strict";

const { execFileSync } = require("child_process");
const assert = require("assert");
const path = require("path");

const CENSUS = path.join(__dirname, "experiments", "census_simulate_clock.cjs");

function run() {
  return execFileSync(process.execPath, [CENSUS], { encoding: "utf8", timeout: 120000 });
}

const a = run();
const b = run();
assert.strictEqual(a, b, "census output must be byte-identical across runs (determinism)");

// Verdict lines, pinned to the corrected audit (docs/simulate-clock-audit.md).
const PINS = [
  "  Site 5: DEFECT-THEORETICAL",
  "  Site 6: DEFECT-LIVE",
  "  Site 7: DEFECT-LIVE",
  "  Site 8: DEFECT-LIVE",
];
for (const line of PINS) {
  assert.ok(a.includes(line), `census output missing verdict line: ${JSON.stringify(line)}`);
}

// Counts, pinned to the corrected census (docs/results.md census table).
const COUNTS = [
  "  States examined (descent offered at some real mf): 97",
  "  States with mf=0 vs real-mf divergence in LOST-GEM SET: 0",
  "  States examined (alive-at-start filter): 194",
  "  States with mf=1 vs real-mf divergence in namedX pick or survival: 194",
  "  States examined (deduped by level,floor,endX,side, alive-at-start): 230",
  "  States examined (deduped, alive-at-start, walk fatal only): 107",
  "  Direction: false-safe (mf=0 lands, real laser)=74, false-fatal (mf=0 laser, real lands)=0",
  "  Direction: false-safe escape (mf=0 lands, real laser)=10, false-fatal escape (mf=0 laser, real lands)=0",
];
for (const line of COUNTS) {
  assert.ok(a.includes(line), `census output missing pinned count line: ${JSON.stringify(line)}`);
}

console.log("census pins: deterministic, 4 verdicts + 6 count lines match ✓");
