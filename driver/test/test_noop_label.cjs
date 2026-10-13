"use strict";
// NOOP_LABEL: a straight jump that lands back on the same spot and touches no gem keeps its
// place on the menu with a true label (PRUNE_NOOP removed it, and the removal reordered the
// other options at L13 (80.5,249): docs/results.md). Pins the labelled L11 state from the
// wording probe, a jump that reaches gem_a and keeps its plain label, the menu size, and =0.
const assert = require("assert");

for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.PRUNE_NOOP;
const D = require("../decision.cjs");
const T = require("../research/gem_table.cjs")();

function call(level, x, y, mf, objective) {
  const all = T[level];
  const snap = { level, gemsCollected: 0, aliveGems: all.length, gemPositions: all.map(([gx, gy]) => ({ x: gx, y: gy })),
    moving: false, onPlatform: true, cat: { x, y, dx: 0, dy: 0, height: 18 },
    drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
  return D.buildMoveCall(snap, all, objective, []).questions.move.criteria;
}

const LABEL = "jump straight up: lands back where it started, collects nothing, and uses time";
for (const v of [undefined, "0"]) {
  if (v === undefined) delete process.env.NOOP_LABEL; else process.env.NOOP_LABEL = v;
  assert.strictEqual(call(11, 106.25, 114, 142, "gem_a").jump, "jump straight up", `NOOP_LABEL=${v} must leave the label alone`);
}
process.env.NOOP_LABEL = "1";
const c = call(11, 106.25, 114, 142, "gem_a");
assert.strictEqual(c.jump, LABEL, "the L11 no-op jump from the probe is labelled");
assert.deepStrictEqual(Object.keys(c).sort(), ["jump", "jump_left", "jump_right", "left", "right"], "the option stays on the menu");
assert.strictEqual(call(0, 66, 290, 0, "gem_a").jump, "jump straight up", "a jump under gem_a is not a no-op and keeps its plain label");

console.log("test_noop_label: all assertions passed");
