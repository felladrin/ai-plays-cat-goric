"use strict";
// The default preset is the flag set that beat the game, applied by both runners
// before anything reads the environment. A drift in either makes `node run_full.cjs`
// silently run a different build from the one the wins were measured on.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PRESETS, LADDER_CAPS, DEFAULT_PRESET, applyPreset } = require("../preset.cjs");
const { BUILD_FLAGS } = require("../run_stats.cjs");
const { summarizeRun, summaryLine } = require("../benchmark.cjs");

// The winning run's stamped build (docs/results.md, the all2/all3 ladders).
const WINNING = {
  PRUNE_FATAL: "1", MOVE_INSTR: "2", JUMP_FACTS: "1", HOLD_FIX: "1", COL_FACTS: "1", GEM_FACTS: "1",
  STICKY_OBJECTIVE: "1", EXIT_FACT: "1", RISE_LABEL: "1", NEG_HOLD: "1", PORTAL_DESC: "1", GAP_DROP: "1",
  FALL_BLAME: "1", GAP_JUMP: "1", COLLECT_WINDOW: "2", ROUTE_ASCENT: "1", PORTAL_JUMP: "1",
  GEMJUMP_VERIFY: "2", CORRIDOR_CLOCK: "1", GAP_WALK: "1", FLOOR_FIX: "1", OVERSHOT_FIX: "1",
  DESC_UPSNAP: "1", WALKOFF_CLEAR: "3", JUMP_NOCOLLECT: "1", LAND_LATE: "2", STALL_OBJ: "1",
  PORTAL_WALK: "1", LAUNCH_LABEL: "2", HOLD_LIVE: "1",
};

assert.strictEqual(DEFAULT_PRESET, "winning");
assert.deepStrictEqual(Object.keys(PRESETS.winning).sort(), Object.keys(WINNING).sort(), "winning preset keys");
for (const k of Object.keys(WINNING)) assert.strictEqual(PRESETS.winning[k], WINNING[k], `winning preset ${k}`);
assert.deepStrictEqual(LADDER_CAPS.winning, { MAX_DEATHS_PER_LEVEL: "100", MAX_TOTAL_STEPS: "150000" });
for (const k of ["CONF_ARGMAX", "URGENCY_CLOCK", "COLLECT_LAND", "SHRINK_GEOM"]) {
  assert.ok(!(k in PRESETS.winning), `${k} is not part of the winning set`);
}
assert.deepStrictEqual(PRESETS.none, {});
// Every preset flag must reach the run file's build.
for (const k of Object.keys(WINNING).concat("PRESET")) assert.ok(BUILD_FLAGS.includes(k), `${k} is stamped`);

// Fills only what is unset; an explicit value wins; caps only on the ladder.
let env = { FALL_BLAME: "0" };
assert.strictEqual(applyPreset({}, env), "winning");
assert.strictEqual(env.FALL_BLAME, "0");
assert.strictEqual(env.LAND_LATE, "2");
assert.strictEqual(env.PRESET, "winning");
assert.strictEqual(env.MAX_DEATHS_PER_LEVEL, undefined, "run_level gets no ladder caps");
env = { MAX_TOTAL_STEPS: "500" };
applyPreset({ ladder: true }, env);
assert.strictEqual(env.MAX_DEATHS_PER_LEVEL, "100");
assert.strictEqual(env.MAX_TOTAL_STEPS, "500");
env = { PRESET: "none" };
assert.strictEqual(applyPreset({ ladder: true }, env), "none");
assert.deepStrictEqual(env, { PRESET: "none" }, "PRESET=none sets nothing");
assert.throws(() => applyPreset({}, { PRESET: "best" }), /PRESET=best is not a preset/);

// Both runners apply it as their first require, before decision.cjs and every
// other module that reads the environment at load.
for (const [file, call] of [["run_full.cjs", 'require("./preset.cjs").applyPreset({ ladder: true });'],
                            ["run_level.cjs", 'require("./preset.cjs").applyPreset();']]) {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const first = code.indexOf("require(");
  assert.strictEqual(code.slice(first, first + call.length), call, `${file}: the first require must be ${call}`);
}

// beat_the_game.sh runs the default preset, so it cannot drift from it.
const beat = fs.readFileSync(path.join(__dirname, "..", "beat_the_game.sh"), "utf8");
assert.ok(/PRESET=winning/.test(beat) && !/export [A-Z_]+=1/.test(beat), "beat_the_game.sh uses the preset, not its own flag list");

// The benchmark's per-seed result from a run file.
const run = {
  which: "systemone", model: "m", build: { PRESET: "winning", SEED: "9" }, won: false, finalLevel: 10,
  steps: 26002, totalCalls: 3000, stopped: { level: 10, reason: "death_cap" },
  levels: { 0: { level: 0, deaths: 0 }, 10: { level: 10, deaths: 100 }, 3: { level: 3, deaths: 1 } },
};
const r = summarizeRun(run, "6", 61500);
assert.deepStrictEqual(r.deathsPerLevel, { 0: 0, 3: 1, 10: 100 });
assert.strictEqual(r.totalDeaths, 101);
assert.strictEqual(r.won, false);
assert.strictEqual(r.lastLevel, 10);
assert.strictEqual(r.wallSeconds, 62);
assert.strictEqual(r.seed, 6);
assert.strictEqual(summaryLine([r, Object.assign({}, r, { seed: 9, won: true, lastLevel: 14, totalDeaths: 45 })]),
  "m (systemone, preset winning): won 1/2 seeds [s6 L10, s9 won], 146 deaths in total");

console.log("test_preset: winning preset, runner order, beat_the_game.sh and benchmark summary checked. Failed: 0");
