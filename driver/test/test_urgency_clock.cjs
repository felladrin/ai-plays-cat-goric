"use strict";
// URGENCY_CLOCK: "DESTROYED FIRST" only when route_clock proves every other first pick dead.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.URGENCY_CLOCK;
const D = require("../decision.cjs");
const RC = require("../route_clock.cjs");
const T = require("../research/gem_table.cjs")();
const mf = 6;
const snap = { level: 6, gemsCollected: 0, aliveGems: 3, gemPositions: T[6].map((g) => ({ x: g[0], y: g[1] })), moving: false, onPlatform: true,
  cat: { x: 67.75, y: 75, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
const urgent = () => Object.entries(D.buildObjectiveCall(snap, T[6], []).questions.objective.criteria).filter(([, v]) => /DESTROYED FIRST/.test(v)).map(([k]) => k);
// L6 spawn: gem_c has the earliest deadline, but a-b-c collects it in time.
assert.strictEqual(RC.orderFeasibleN(6, T[6], [0, 1, 2], "floor(33..85@75)", 68, mf, 0).collectTimes.length, 3);
assert.deepStrictEqual(urgent(), ["gem_c"], "gate off: today's sentence");
process.env.URGENCY_CLOCK = "1";
assert.deepStrictEqual(urgent(), [], "gate on: not proven, not said");
delete process.env.URGENCY_CLOCK;
console.log("test_urgency_clock: Failed: 0");
