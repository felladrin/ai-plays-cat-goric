"use strict";
// OVERSHOT_FIX: "OVERSHOT ... on your platform" only for a gem at the floor's height.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.OVERSHOT_FIX;
const D = require("./decision.cjs");
const all = require("./experiments/gem_table.cjs")()[11];
const mf = 191;
// L11: cat on floor x 181..233 at y 187, gem_c (191,212) 25px below it.
const snap = { level: 11, gemsCollected: 2, aliveGems: 1, gemPositions: [{ x: all[2][0], y: all[2][1] }], moving: false, onPlatform: true,
  cat: { x: 192, y: 187, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const line = () => D.buildObjectiveCall(snap, all, []).state.split("\n").find((l) => l.includes("gem_c at"));
assert.ok(line().includes("OVERSHOT"), "gate off: today's flag");
process.env.OVERSHOT_FIX = "1";
assert.ok(!line().includes("OVERSHOT"), line());
// A gem at the floor's height, behind the cat, keeps the flag (cat further right on the same floor, gem raised to its height).
snap.gemPositions = [{ x: 191, y: 180 }];
assert.ok(D.buildObjectiveCall(snap, [all[0], all[1], [191, 180]], []).state.includes("OVERSHOT"));
delete process.env.OVERSHOT_FIX;
console.log("test_overshot_fix: Failed: 0");
