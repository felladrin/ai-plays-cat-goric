"use strict";
// LAUNCH_LABEL: a jump that, held from here, falls to the bottom laser while it lands higher from elsewhere on the floor.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.LAUNCH_LABEL;
const D = require("../decision.cjs");
const all = require("../research/gem_table.cjs")()[13];
const at = (x, mf) => ({ level: 13, gemsCollected: 2, aliveGems: 1, gemPositions: [{ x: 180, y: 51 }], moving: false, onPlatform: true,
  cat: { x, y: 252, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } });
const jr = (x) => D.buildMoveCall(at(x, 109), all, "ascent_right", []).questions.move.criteria.jump_right;
assert.strictEqual(jr(161), "jump and steer right", "gate off");
process.env.LAUNCH_LABEL = "1";
assert.strictEqual(jr(161), "jump and steer right (from x 161 it falls to the bottom laser; it lands on platform x 223..275 at y 197 only from x 174..209)");
// Inside the window the held jump lands: no label.
assert.strictEqual(jr(190), "jump and steer right");
process.env.LAUNCH_LABEL = "2";
assert.strictEqual(jr(161), "jump and steer right (from here it falls to the bottom laser)");
delete process.env.LAUNCH_LABEL;
console.log("test_launch_label: Failed: 0");
