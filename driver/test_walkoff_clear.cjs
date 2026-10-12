"use strict";
// WALKOFF_CLEAR: after a walk-off, stepBatch releases the keys once and steps
// until the cat is clear of the floor's side (or lands), instead of handing the
// airborne decision back after the walk budget.
const assert = require("assert");
const { stepBatch, WALK_FRAMES, walkOffDropSafe } = require("./cadence.cjs");
const mk = (lv, x, y, dy, mf, on) => ({ level: lv, onPlatform: on, cat: { x, y, dy, height: 18 }, drones: { tl: { y: 1 + 0.2 * mf } } });

(async () => {
  // A walk-off at frame 2 of the walk: y falls 0.4, 1.2, 2.4, ... from the L2 left end.
  const fall = (k) => { let y = 64, dy = 0; for (let i = 0; i < k; i++) { dy += 0.4; y += dy; } return y; };
  const script = (i) => (i < 2 ? { done: false, airborne: false, snap: mk(2, 74 - 1.75 * i, 64, 0, 81, true) }
    : { done: false, airborne: true, snap: mk(2, 72.5, fall(i - 1), 0.4 * (i - 1), 81, false) });

  // Without walkOff: unchanged, the walk budget (K frames).
  let calls = 0;
  const n0 = await stepBatch({ grounded: true, isJump: false, K: WALK_FRAMES, step: async (i) => { calls++; return script(i); } });
  assert.strictEqual(n0, WALK_FRAMES);
  assert.strictEqual(calls, WALK_FRAMES);

  // With walkOff: one release, then steps until the head is below y 64 + 9.6 (the floor's underside).
  let released = 0, last = null;
  const n1 = await stepBatch({ grounded: true, isJump: false, K: WALK_FRAMES,
    step: async (i) => { last = script(i); return last; },
    walkOff: { floorY: 64, release: async () => { released++; } } });
  assert.strictEqual(released, 1);
  assert.ok(last.snap.cat.y - 18 > 64 + 9.6, `stopped at y ${last.snap.cat.y}`);
  assert.ok(n1 > WALK_FRAMES, `batch ran ${n1} frames`);

  // A jump never takes the walk-off path.
  released = 0;
  await stepBatch({ grounded: true, isJump: true, K: WALK_FRAMES, step: async (i) => script(i), walkOff: { floorY: 64, release: async () => { released++; } } });
  assert.strictEqual(released, 0);

  // Safety: the drops the gate exists for are allowed (they clear the side before any death).
  assert.strictEqual(walkOffDropSafe(mk(2, 72.5, 64.4, 0.4, 81, false), 64), true);
  assert.strictEqual(walkOffDropSafe(mk(8, 338, 42.4, 0.4, 78, false), 42), true);
  // Strict (=2): only a no-input fall that lands lower. L12's y108 right end qualifies;
  // L6's y79 right end (x 180) and L2's left end (both need steering) do not.
  assert.strictEqual(walkOffDropSafe(mk(12, 246.75, 108.4, 0.4, 203, false), 108, true), true);
  assert.strictEqual(walkOffDropSafe(mk(6, 180, 79.4, 0.4, 84, false), 79, false), true, "=1 releases it");
  assert.strictEqual(walkOffDropSafe(mk(6, 180, 79.4, 0.4, 84, false), 79, true), false, "=2 does not");
  assert.strictEqual(walkOffDropSafe(mk(2, 72.5, 64.4, 0.4, 81, false), 64, true), false);
  console.log("test_walkoff_clear: Failed: 0");
})().catch((e) => { console.error(e); process.exit(1); });
