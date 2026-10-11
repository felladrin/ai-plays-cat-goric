"use strict";
// COLLECT_LAND: a step-off landing the objective can be collected from is named, one side only.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.COLLECT_LAND;
const D = require("./decision.cjs");
const all = require("./experiments/gem_table.cjs")()[12];
const mf = 177;
// L12 fork: on floor x 58..215 at y 165, heading for gem_a; off the right end the cat
// lands on x 220..272 at y 231, a gem_a collector. The left end's landings collect nothing.
const snap = { level: 12, gemsCollected: 1, aliveGems: 2, gemPositions: [0, 2].map((i) => ({ x: all[i][0], y: all[i][1] })), moving: false, onPlatform: true,
  cat: { x: 179.25, y: 165, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const move = (obj) => D.buildMoveCall(snap, all, obj, []).state;
const MARK = "can be collected from there";
assert.ok(!move("gem_a").includes(MARK), "gate off: no mark");
process.env.COLLECT_LAND = "1";
const s = move("gem_a");
assert.ok(s.includes("Step off the RIGHT end (x 215) and you steer to land on platform x 220..272 at y 231 (gem_a can be collected from there)"), s);
assert.strictEqual(s.split(MARK).length - 1, 1, "one landing marked");
assert.ok(!/Step off the LEFT end[^\n]*?can be collected/.test(s.split("Step off the RIGHT")[0]), "left end not marked");
delete process.env.COLLECT_LAND;
console.log("test_collect_land: Failed: 0");
