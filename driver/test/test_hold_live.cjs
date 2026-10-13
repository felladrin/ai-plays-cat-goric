"use strict";
// HOLD_LIVE: the airborne hold check (heldActionIsSafe) uses live platform widths.
// Pins the archived L10 launch it exists for (ladder_all3_s6: a held jump_right from
// (240.75,150) at mf 160, dead 46 steps later), a launch the gate must not change,
// that the gate leaves SHRINK_GEOM and the prompt geometry alone, and the off values.
const assert = require("assert");

delete process.env.SHRINK_GEOM;
process.env.HOLD_FIX = "1";
const CFG = require("../physics.cjs");
const A = require("../arc.cjs");
const LIVE = require("../platform_live.cjs");

// The cat three frames after a grounded jump_right from (x, 150) at clock mf.
function airborne(x, mf) {
  let at = null;
  A.simulate(10, x, 150, 0, 18, "jump_right", mf, { grounded: true, maxFrames: 3, onFrame: (cx, cy, f, dy) => { at = { x: cx, y: cy, dy }; } });
  const m = mf + 3;
  return { level: 10, onPlatform: false, cat: { x: at.x, y: at.y, dy: at.dy, height: 18 }, drones: { tl: { x: 0, y: 1 + CFG.droneSpeed * m } } };
}

const fatal = airborne(240.75, 160);
for (const v of [undefined, "0"]) {
  if (v === undefined) delete process.env.HOLD_LIVE; else process.env.HOLD_LIVE = v;
  assert.strictEqual(A.heldActionIsSafe(fatal, "jump_right"), true, `HOLD_LIVE=${v}: full widths call the fatal hold safe (the bug)`);
}
process.env.HOLD_LIVE = "1";
assert.strictEqual(A.heldActionIsSafe(fatal, "jump_right"), false, "HOLD_LIVE=1: the shrunk tower floor is missed, so the model is asked");

// Early in the level the tower floors are still whole: the same launch at mf 20 is safe either way.
const early = airborne(240.75, 20);
for (const v of ["0", "1"]) {
  process.env.HOLD_LIVE = v;
  assert.strictEqual(A.heldActionIsSafe(early, "jump_right"), true, `HOLD_LIVE=${v}: an early launch still holds`);
}

// The gate touches only the hold check: SHRINK_GEOM stays off and the static boxes stay full width.
process.env.HOLD_LIVE = "1";
assert.strictEqual(LIVE.enabled(), false);
assert.deepStrictEqual(A.platformBoxes(10).filter((p) => p.y === 140).map((p) => [p.left, p.right]), [[304, 356]]);

console.log("test_hold_live: all assertions passed");
