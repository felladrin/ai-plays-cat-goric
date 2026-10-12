"use strict";
// LAND_LATE: a move whose landing leaves the objective out of reach in time is labelled.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.LAND_LATE;
const D = require("../decision.cjs");
const RC = require("../route_clock.cjs");
const all = require("../research/gem_table.cjs")()[13];
// route_clock: from x 158..210 at y 252 gem_c (180,51) is reachable in time at mf 150, not at mf 175.
assert.strictEqual(RC.orderFeasibleN(13, [[180, 51]], [0], "floor(158..210@252)", 200, 150, 0).collectTimes.length, 1);
assert.strictEqual(RC.orderFeasibleN(13, [[180, 51]], [0], "floor(158..210@252)", 200, 175, 0).collectTimes.length, 0);
// L13 fork: x 232.75 on x 223..275 at y 197, mf 161, only gem_c left.
const at = (mf) => ({ level: 13, gemsCollected: 2, aliveGems: 1, gemPositions: [{ x: 180, y: 51 }], moving: false, onPlatform: true,
  cat: { x: 232.75, y: 197, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } });
const crit = (mf) => D.buildMoveCall(at(mf), all, "gem_c", []).questions.move.criteria;
assert.strictEqual(crit(161).left, "walk left", "gate off");
process.env.LAND_LATE = "1";
const c = crit(161);
assert.strictEqual(c.left, "walk left (off this floor's left end at x 223 the cat lands on platform x 158..210 at y 252, from which gem_c can no longer be reached in time)");
assert.strictEqual(c.jump_left, "jump and steer left (lands on platform x 158..210 at y 252, from which gem_c can no longer be reached in time)");
assert.strictEqual(c.jump, "jump straight up", "the move that keeps gem_c in reach is not labelled");
// Earlier, y252 still reaches gem_c in time: no clause.
assert.strictEqual(crit(100).left, "walk left");
// A walk that leads to a working launch point is not labelled: L4's opening, where
// jump_right from before the end at x 147 crosses to x 199..251 at y 93.
const T4 = require("../research/gem_table.cjs")()[4];
const l4 = { level: 4, gemsCollected: 0, aliveGems: 3, gemPositions: T4.map((g) => ({ x: g[0], y: g[1] })), moving: false, onPlatform: true,
  cat: { x: 129.75, y: 93, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * 6 }, tr: { x: 359 - 0.2 * 6, y: 0 }, bl: { x: 1 + 0.2 * 6, y: 310 }, br: { x: 360, y: 310 - 0.2 * 6 } } };
assert.strictEqual(D.buildMoveCall(l4, T4, "gem_a", []).questions.move.criteria.right, "walk right");
// LAND_LATE=2: any live gem, not only the objective. L6 at (144.75,79) mf 61 heading
// for gem_c: walking right off x 180 lands on x 211..263 at y 220, from which gem_a
// can no longer be reached in time.
process.env.LAND_LATE = "2";
const T6 = require("../research/gem_table.cjs")()[6];
const l6 = { level: 6, gemsCollected: 0, aliveGems: 3, gemPositions: T6.map((g) => ({ x: g[0], y: g[1] })), moving: false, onPlatform: true,
  cat: { x: 144.75, y: 79, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * 61 }, tr: { x: 359 - 0.2 * 61, y: 0 }, bl: { x: 1 + 0.2 * 61, y: 310 }, br: { x: 360, y: 310 - 0.2 * 61 } } };
assert.ok(/from which gem_a can no longer be reached in time/.test(D.buildMoveCall(l6, T6, "gem_c", []).questions.move.criteria.right));
process.env.LAND_LATE = "1";
assert.ok(!/gem_a/.test(D.buildMoveCall(l6, T6, "gem_c", []).questions.move.criteria.right), "=1 checks only the objective");
delete process.env.LAND_LATE;
console.log("test_land_late: Failed: 0");
