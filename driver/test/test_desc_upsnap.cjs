"use strict";
// DESC_UPSNAP: a step-off that snaps the cat up onto a neighbour's side is not a descent.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.DESC_UPSNAP;
const D = require("../decision.cjs");
const all = require("../research/gem_table.cjs")()[12];
const mf = 150;
// L12, floor x 247..299 at y 125: off its left end the cat lands on floor x 193..245 at y 108.
const snap = { level: 12, gemsCollected: 1, aliveGems: 2, gemPositions: [0, 2].map((i) => ({ x: all[i][0], y: all[i][1] })), moving: false, onPlatform: true,
  cat: { x: 281, y: 125, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const move = () => D.buildMoveCall(snap, all, "gem_c", []).state;
const menu = () => D.buildObjectiveCall(snap, all, []).objectiveNames;
assert.ok(move().includes("Step off the LEFT end (x 247) and you steer to land on platform x 255..307 at y 209"), "gate off: today's text");
assert.ok(menu().includes("descent_left"));
process.env.DESC_UPSNAP = "1";
const s = move();
assert.ok(s.includes("The ONLY descent from this floor is at its right end: x 299."), s);
assert.ok(s.includes("Step off the LEFT end (x 247) and you snap up onto platform x 193..245 at y 108"), s);
assert.ok(!menu().includes("descent_left") && menu().includes("descent_right"));
delete process.env.DESC_UPSNAP;
console.log("test_desc_upsnap: Failed: 0");
