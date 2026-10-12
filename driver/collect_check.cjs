"use strict";
// Can a gem be collected from a floor in one move? A move is any way off the floor
// the cat can take from a decision there: walking off either end, or a jump
// (straight, left or right) from anywhere along it, each with ONE mid-air switch
// of horizontal input (left / none / right) at any frame. Interception is the
// game's own (arc.simulate). Used to state "cannot be collected" only when it is
// true (JUMP_NOCOLLECT): the claim must hold at the most permissive laser states,
// so it is checked at clock 0 with full-width floors and at the current clock
// (both ends of its 25-frame bucket) and 100 frames later with the live,
// shrinking widths (a shrunk floor can stop intercepting a fall).
const A = require("./arc.cjs");
const CAT_H = 18;
const SWITCH_MAX = 60;
const X_STEP = 3.5;
const cache = new Map(); // per (level, floor, gem, clock bucket)

function touches(level, run, gem, mf, half) {
  const hit = (cx, cy) => cx < gem.x + half && cx + 1 > gem.x - half && cy - CAT_H < gem.y + half && cy > gem.y - half;
  const tryOne = (x, action, steer) => {
    let t = false;
    A.simulate(level, x, run.y, 0, CAT_H, action, mf, { grounded: true, steerAt: steer, onFrame: (fx, fy) => { if (hit(fx, fy)) t = true; } });
    return t;
  };
  const switches = (base) => {
    const out = [null];
    for (let n = 1; n <= SWITCH_MAX; n++) for (const s2 of ["left", "none", "right"]) if (s2 !== base) out.push((f) => (f <= n ? base : s2));
    return out;
  };
  for (let x = run.left; x <= run.right + 1e-9; x += X_STEP) if (hit(x, run.y)) return true;
  for (const [x, dir] of [[run.left, "left"], [run.right, "right"]])
    for (const st of switches(dir)) if (tryOne(x, dir, st)) return true;
  for (let x = run.left; x <= run.right + 1e-9; x += X_STEP)
    for (const act of ["jump", "jump_left", "jump_right"]) {
      const base = act === "jump" ? "none" : act.slice(5);
      for (const st of switches(base)) if (tryOne(x, act, st)) return true;
    }
  return false;
}

// true when some one-move schedule from `run` touches the gem's box at any of
// the checked clocks; false only when none does.
const MF_BUCKET = 25;
function touchesCached(level, run, gem, mf, half, shrink) {
  const key = `${level}|${run.left},${run.right}@${run.y}|${gem.x},${gem.y}|${half}|${shrink ? mf : "full"}`;
  if (cache.has(key)) return cache.get(key);
  const prev = process.env.SHRINK_GEOM;
  let out;
  try {
    if (shrink) process.env.SHRINK_GEOM = "1"; else delete process.env.SHRINK_GEOM;
    out = touches(level, run, gem, mf, half);
  } finally {
    if (prev === undefined) delete process.env.SHRINK_GEOM; else process.env.SHRINK_GEOM = prev;
  }
  cache.set(key, out);
  return out;
}

function collectableFrom(level, run, gem, mfNow, half = 8) {
  const b = Math.floor(mfNow / MF_BUCKET) * MF_BUCKET;
  return touchesCached(level, run, gem, 0, half, false) ||
    touchesCached(level, run, gem, b, half, true) ||
    touchesCached(level, run, gem, b + MF_BUCKET, half, true) ||
    touchesCached(level, run, gem, b + 100, half, true);
}

module.exports = { collectableFrom };
