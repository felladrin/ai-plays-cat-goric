"use strict";
// JUMP_NOCOLLECT: a jump label names a landing the objective cannot be collected from.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.JUMP_NOCOLLECT;
const D = require("./decision.cjs");
const R = require("./reachability.cjs");
const { collectableFrom } = require("./collect_check.cjs");
const all = require("./experiments/gem_table.cjs")()[12];
const gemA = { x: all[0][0], y: all[0][1] };
const run = (y) => R.runsOf(12).find((r) => r.y === y && r.left < 250);
// collect_check: y108 cannot collect gem_a (every one-move schedule misses it); y231 can.
assert.strictEqual(collectableFrom(12, run(108), gemA, 180), false);
assert.strictEqual(collectableFrom(12, run(231), gemA, 180), true);
// L12 fork: x 189.75 on x 58..215 at y 165, objective gem_a.
const mf = 183;
const snap = { level: 12, gemsCollected: 1, aliveGems: 2, gemPositions: [0, 2].map((i) => ({ x: all[i][0], y: all[i][1] })), moving: false, onPlatform: true,
  cat: { x: 189.75, y: 165, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const crit = (obj) => D.buildMoveCall(snap, all, obj, []).questions.move.criteria;
assert.strictEqual(crit("gem_a").jump_right, "jump and steer right", "gate off: plain label");
process.env.JUMP_NOCOLLECT = "1";
assert.strictEqual(crit("gem_a").jump_right, "jump and steer right (lands on platform x 193..245 at y 108, from which gem_a cannot be collected)");
assert.strictEqual(crit("gem_a").right, "walk right", "the walk label is unchanged");
// gem_c can be collected from this floor (off its right end), so no label for it.
assert.strictEqual(crit("gem_c").jump_right, "jump and steer right");
delete process.env.JUMP_NOCOLLECT;
console.log("test_jump_nocollect: Failed: 0");
