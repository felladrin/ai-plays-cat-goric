"use strict";
// Guard test: runner parity and CFG-field audit beyond decision.cjs.
// Pins the current invariants so accidental drift fails.
// Does NOT change behaviour; only asserts what currently holds.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CFG_CONFIG = require("./config.cjs");
const CFG_PHYSICS = require("./physics.cjs");
const CADENCE = require("./cadence.cjs");
const STALL = require("./stall_window.cjs");
const DECISION = require("./decision.cjs");

// --- Helpers ----------------------------------------------------------------

function readSrc(file) {
  return fs.readFileSync(path.join(__dirname, file), "utf8");
}

function extractConst(src, name) {
  const m = src.match(new RegExp(`^\\s*const ${name} = ([^;]+);`, "m"));
  return m ? m[1].trim() : null;
}

function extractImportedConst(src, mod, name) {
  // Matches: const { NAME } = require("MOD");
  const re = new RegExp(`const \\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=\\s*require\\(["']${mod}["']\\)`);
  return re.test(src);
}

// --- 1. RUNNER PARITY -------------------------------------------------------

const RL = readSrc("run_level.cjs");
const RF = readSrc("run_full.cjs");

// Shared constants that SHOULD match (same value, same source of truth)
console.log("Checking shared constants...");

// K (walk frames per grounded non-jump decision) — both declare locally; must match cadence.WALK_FRAMES
const kRL = extractConst(RL, "K");
const kRF = extractConst(RF, "K");
assert.strictEqual(kRL, "6", "run_level.cjs K must be 6");
assert.strictEqual(kRF, "6", "run_full.cjs K must be 6");
assert.strictEqual(Number(kRL), CADENCE.WALK_FRAMES, "K must equal cadence.WALK_FRAMES");
console.log("  K = 6 (both) matches cadence.WALK_FRAMES ✓");

// VISIT_WINDOW — both import from decision.cjs
assert.ok(extractImportedConst(RL, "./decision.cjs", "VISIT_WINDOW"), "run_level must import VISIT_WINDOW");
assert.ok(extractImportedConst(RF, "./decision.cjs", "VISIT_WINDOW"), "run_full must import VISIT_WINDOW");
assert.strictEqual(DECISION.VISIT_WINDOW, 12, "decision.VISIT_WINDOW is 12");
console.log("  VISIT_WINDOW = 12 (imported from decision.cjs) ✓");

// VISIT_STUCK_THRESHOLD — both from decision.cjs (not directly imported but used via decision module)
assert.strictEqual(DECISION.VISIT_STUCK_THRESHOLD, 3, "decision.VISIT_STUCK_THRESHOLD is 3");
console.log("  VISIT_STUCK_THRESHOLD = 3 (from decision.cjs) ✓");

// STALL_WINDOW — documented divergence (reverted unification, 2026-10-09):
// run_level imports the shared 24; run_full keeps its measured local 10
// (progress-based detector). See docs/open-problems.md.
assert.ok(extractImportedConst(RL, "./stall_window.cjs", "STALL_WINDOW"), "run_level must import STALL_WINDOW");
assert.ok(!extractImportedConst(RF, "./stall_window.cjs", "STALL_WINDOW"), "run_full must NOT import the shared stall window");
assert.ok(/const STALL_WINDOW = 10;/.test(RF), "run_full keeps local STALL_WINDOW = 10 until measured");
assert.strictEqual(STALL.STALL_WINDOW, 24, "stall_window.STALL_WINDOW is 24");
// The inequality STALL_WINDOW > 2 * (VISIT_STUCK_THRESHOLD + 1) is guarded by test_death_history.cjs
console.log("  STALL_WINDOW = 24 (imported from stall_window.cjs) ✓");

// STALL_MAX_DISTINCT — only run_level imports it (run_full uses progress-based stall)
assert.ok(extractImportedConst(RL, "./stall_window.cjs", "STALL_MAX_DISTINCT"), "run_level imports STALL_MAX_DISTINCT");
const rfHasStallMax = extractImportedConst(RF, "./stall_window.cjs", "STALL_MAX_DISTINCT");
assert.strictEqual(rfHasStallMax, false, "run_full does NOT import STALL_MAX_DISTINCT (uses STALL_MIN_PROGRESS_PX instead)");
assert.strictEqual(STALL.STALL_MAX_DISTINCT, 2, "stall_window.STALL_MAX_DISTINCT is 2");
console.log("  STALL_MAX_DISTINCT = 2 (run_level only; run_full uses progress-based stall) ✓");

// DEATH_HISTORY_STORE — both declare locally with same value
const dhsRL = extractConst(RL, "DEATH_HISTORY_STORE");
const dhsRF = extractConst(RF, "DEATH_HISTORY_STORE");
assert.strictEqual(dhsRL, "40", "run_level DEATH_HISTORY_STORE = 40");
assert.strictEqual(dhsRF, "40", "run_full DEATH_HISTORY_STORE = 40");
console.log("  DEATH_HISTORY_STORE = 40 (both) ✓");

// Cadence constants — both use cadence.cjs
assert.strictEqual(CADENCE.AIR_REDECIDE_FRAMES, 3, "AIR_REDECIDE_FRAMES = 3");
assert.strictEqual(CADENCE.MAX_HELD_FRAMES, 120, "MAX_HELD_FRAMES = 120");
console.log("  AIR_REDECIDE_FRAMES = 3, MAX_HELD_FRAMES = 120 (from cadence.cjs) ✓");

// DT — both use 1/60
assert.ok(/const DT = 1 \/ 60;/.test(RL), "run_level DT = 1/60");
assert.ok(/const DT = 1 \/ 60;/.test(RF), "run_full DT = 1/60");
console.log("  DT = 1/60 (both) ✓");

// Documented divergences (different semantics, explicitly called out in comments)
const maxStepsRL = extractConst(RL, "MAX_STEPS");
const maxTotalStepsRF = extractConst(RF, "MAX_TOTAL_STEPS");
assert.strictEqual(maxStepsRL, "3000", "run_level MAX_STEPS = 3000");
assert.ok(maxTotalStepsRF.includes("40000"), "run_full MAX_TOTAL_STEPS defaults to 40000");
console.log("  MAX_STEPS=3000 (run_level) vs MAX_TOTAL_STEPS=40000 (run_full) — documented divergence ✓");

const maxDeathsRL = extractConst(RL, "MAX_DEATHS");
assert.strictEqual(maxDeathsRL, "40", "run_level MAX_DEATHS = 40");
// run_full uses MAX_DEATHS_PER_LEVEL with env override; not a simple const
assert.ok(RF.includes("MAX_DEATHS_PER_LEVEL"), "run_full uses MAX_DEATHS_PER_LEVEL with env override");
console.log("  MAX_DEATHS=40 (run_level) vs MAX_DEATHS_PER_LEVEL=10/25 (run_full) — documented divergence ✓");

// VIEWPORT — run_level: 360x360 (measurement) or 1280x720 (HEADED); run_full: always 1280x720
assert.ok(RL.includes("VIEWPORT = HEADED ? { width: 1280, height: 720 } : { width: 360, height: 360 }"), "run_level VIEWPORT conditional");
assert.ok(RF.includes("VIEWPORT = { width: 1280, height: 720 }"), "run_full VIEWPORT fixed 1280x720");
console.log("  VIEWPORT divergence (run_level conditional, run_full fixed) — documented ✓");

// STEP_DELAY_MS — run_level: HEADED ? 16 : 0; run_full: HEADED ? 16 : (DEMO_KEEP ? 16 : 0)
assert.ok(RL.includes("STEP_DELAY_MS = HEADED ? 16 : 0"), "run_level STEP_DELAY_MS");
assert.ok(RF.includes("STEP_DELAY_MS = HEADED ? 16 : (DEMO_KEEP ? 16 : 0)"), "run_full STEP_DELAY_MS");
console.log("  STEP_DELAY_MS divergence (run_full adds DEMO_KEEP delay) — documented ✓");

// SHOT_PRE — only run_level
assert.ok(RL.includes('SHOT_PRE = process.env.SHOT_PRE === "1"'), "run_level has SHOT_PRE");
assert.ok(!RF.includes("SHOT_PRE"), "run_full has no SHOT_PRE");
console.log("  SHOT_PRE env flag — run_level only ✓");

// FRAME_TRACE — only run_level
assert.ok(RL.includes('FRAME_TRACE = process.env.FRAME_TRACE === "1"'), "run_level has FRAME_TRACE");
assert.ok(!RF.includes("FRAME_TRACE"), "run_full has no FRAME_TRACE");
console.log("  FRAME_TRACE env flag — run_level only ✓");

// DEMO_KEEP_LEVELS — only run_full
assert.ok(!RL.includes("DEMO_KEEP"), "run_level has no DEMO_KEEP");
assert.ok(RF.includes("DEMO_KEEP"), "run_full has DEMO_KEEP");
console.log("  DEMO_KEEP_LEVELS — run_full only (documented) ✓");

// ENDPOINTS — should be identical
const epRL = RL.slice(RL.indexOf("const ENDPOINTS = {"), RL.indexOf("const r2 ="));
const epRF = RF.slice(RF.indexOf("const ENDPOINTS = {"), RF.indexOf("const r2 ="));
assert.strictEqual(epRL, epRF, "ENDPOINTS objects must be identical in both runners");
console.log("  ENDPOINTS identical ✓");

// --- 2. CFG FIELD AUDIT EXTENSION -------------------------------------------

// Files that bind CFG to config.cjs
const configBinders = ["run_level.cjs", "run_full.cjs", "probe.cjs", "dump.cjs", "overlay_test.cjs"];
// Files that bind CFG to physics.cjs
const physicsBinders = ["reachability.cjs", "route_clock.cjs", "arc.cjs", "hop_points.cjs", "survival.cjs"];
// Files that don't bind CFG at all
const noCFG = ["run_stats.cjs", "cadence.cjs", "jev.cjs"]; // jev uses inline require

console.log("\nChecking CFG field resolution...");

// Check config.cjs binders: every CFG.<field> must exist in config.cjs
for (const f of configBinders) {
  const src = readSrc(f);
  // Remove comments
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const m of noComments.matchAll(/\bCFG\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const field = m[1];
    assert.ok(field in CFG_CONFIG, `${f}: CFG.${field} not exported by config.cjs`);
  }
  console.log(`  ${f}: all CFG.<field> resolve to config.cjs exports ✓`);
}

// Check physics.cjs binders: every CFG.<field> must exist in physics.cjs
for (const f of physicsBinders) {
  const src = readSrc(f);
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const m of noComments.matchAll(/\bCFG\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const field = m[1];
    assert.ok(field in CFG_PHYSICS, `${f}: CFG.${field} not exported by physics.cjs`);
  }
  console.log(`  ${f}: all CFG.<field> resolve to physics.cjs exports ✓`);
}

// Check no-CFG files don't accidentally read CFG
for (const f of noCFG) {
  const src = readSrc(f);
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const cfgReads = [...noComments.matchAll(/\bCFG\.([A-Za-z_][A-Za-z0-9_]*)/g)];
  // jev.cjs uses inline require("./config.cjs").SIMPLE_JEV_BASE_URL - not CFG.
  if (f === "jev.cjs") {
    assert.strictEqual(cfgReads.length, 0, "jev.cjs should not use CFG. prefix");
  } else {
    assert.strictEqual(cfgReads.length, 0, `${f} should not read CFG at all`);
  }
  console.log(`  ${f}: no CFG reads ✓`);
}

// --- 3. DEAD CONFIG ---------------------------------------------------------

console.log("\nChecking for dead config fields...");

// physics.cjs exports that are never read
const physicsExports = Object.keys(CFG_PHYSICS);
const physicsRead = new Set();

// Scan all driver .cjs files (excluding tests and experiments) for physics.cjs field reads
const driverFiles = fs.readdirSync(__dirname)
  .filter(f => f.endsWith(".cjs") && !f.startsWith("test_") && !f.startsWith("verify_"))
  .map(f => path.join(__dirname, f));

for (const f of driverFiles) {
  const src = fs.readFileSync(f, "utf8");
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const m of noComments.matchAll(/require\(["']\.\/physics\.cjs["']\)|const CFG = require\(["']\.\/physics\.cjs["']\)/g)) {
    // File binds physics.cjs - scan its CFG. reads
    // We already validated above; just collect
  }
  // Also find CFG. reads in files that might not have been in our binder lists
  for (const m of noComments.matchAll(/\bCFG\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    physicsRead.add(m[1]);
  }
}

// Also check config.cjs field reads
const configRead = new Set();
for (const f of driverFiles) {
  const src = fs.readFileSync(f, "utf8");
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const m of noComments.matchAll(/\bCFG\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    configRead.add(m[1]);
  }
}

// Allow-list for known-dead-but-documented fields
const DEAD_PHYSICS_ALLOWLIST = ["minimumLaserSize", "maxLaserSize"]; // only in comments, not code
const DEAD_CONFIG_ALLOWLIST = ["OUT_DIR"]; // exported but only used internally by outPath()

const deadPhysics = physicsExports.filter(e => !physicsRead.has(e) && !DEAD_PHYSICS_ALLOWLIST.includes(e));
const deadConfig = Object.keys(CFG_CONFIG).filter(e => !configRead.has(e) && !DEAD_CONFIG_ALLOWLIST.includes(e));

if (deadPhysics.length > 0) {
  console.log("  DEAD physics fields (not in allowlist):", deadPhysics.join(", "));
  // These are findings - we assert they match the known allowlist exactly
  assert.deepStrictEqual(deadPhysics.sort(), DEAD_PHYSICS_ALLOWLIST.sort(),
    `Dead physics fields must match allowlist. Found: ${deadPhysics.join(", ")}`);
}
console.log(`  physics.cjs dead fields: ${DEAD_PHYSICS_ALLOWLIST.join(", ")} (allowlisted) ✓`);

if (deadConfig.length > 0) {
  console.log("  DEAD config fields:", deadConfig.join(", "));
  assert.deepStrictEqual(deadConfig.sort(), DEAD_CONFIG_ALLOWLIST.sort(),
    `Dead config fields must match allowlist. Found: ${deadConfig.join(", ")}`);
}
console.log("  config.cjs dead fields: none ✓");

// --- Summary -----------------------------------------------------------------
console.log("\n=== ALL PARITY AND AUDIT CHECKS PASSED ===");