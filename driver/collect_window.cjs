"use strict";
// COLLECT_WINDOW (gated, off by default): when a gem can be collected only during
// a window that closes long before its own deadline, say how long the window is.
//
// The objective menu's clock is the gem's own deadline (route_clock.gemDeadline).
// Two levels lose to a shorter clock the menu never states, and in both the
// objective chosen early decides the level (docs/results.md, 2026-10-11):
//   - L10 gem_c (deadline mf 335): its only collector floors, the tower at x 330,
//     are destroyed by the right laser by mf 142 (platform_live.scaleAt).
//   - L11 gem_a (deadline mf 375): its only collector is a jump_right from the @114
//     floor, laser-blocked from mf ~179 (docs/results.md, L11 corridor census).
// The window is the last clock at which ANY collector can still touch the gem:
// a floor that still exists under the launch x at that clock, and a held jump
// (or standing) whose arc touches the gem's 16x16 box before the lasers kill it.
//
// Wording, from the objective-call probe (experiments/probe_objective_wording.cjs):
// framed as an opportunity it raised the gem (L11 gem_a 0.113 -> 0.398, L10 gem_c
// 0.194 -> 0.515); framed as a loss it lowered it (ROUTE_BURN, L10 0.587 -> 0.188
// live). The second clause is added only when it is true for every other live gem.
const A = require("./arc.cjs");
const R = require("./reachability.cjs");
const L = require("./level_data.cjs");
const CFG = require("./physics.cjs");
const { scaleAt } = require("./platform_live.cjs");
const RC = require("./route_clock.cjs");

const MIN_LEAD = 100; // the window must close at least this many frames before the gem's deadline
const MAX_AHEAD = 200; // and within this many frames of now
const MF_STEP = 2;
const CAT_H = 18;
const cache = new Map();

// Last movingFrame at which some collector can touch gem (gx, gy), or null if none
// ever can. Cached per level and gem: the answer is geometry and clock only.
function windowClose(level, gx, gy) {
  const ck = `${level}|${gx},${gy}`;
  if (cache.has(ck)) return cache.get(ck);
  const prev = process.env.SHRINK_GEOM;
  delete process.env.SHRINK_GEOM; // the arc runs on full-width floors; floor existence is checked at launch
  let out = null;
  try {
    const hit = (cx, cy) => cx < gx + 8 && cx + 1 > gx - 8 && cy - CAT_H < gy + 8 && cy > gy - 8;
    const plats = L.platforms(level);
    // live under x at clock mf: some platform of this floor still covers x
    const standsAt = (x, y, mf) => plats.some(([px, py]) => py === y && Math.abs(x - px) <= (CFG.platformWidth / 2) * scaleAt(px, py, mf));
    const runs = R.runsOf(level);
    const deadline = Math.floor(RC.gemDeadline(gx, gy));
    outer: for (let mf = deadline - (deadline % MF_STEP); mf >= 0; mf -= MF_STEP) {
      for (const r of runs) {
        for (let x = Math.ceil(r.left); x <= r.right; x += 2) {
          if (!standsAt(x, r.y, mf)) continue;
          if (hit(x, r.y)) { out = mf; break outer; }
          for (const act of ["jump", "jump_left", "jump_right"]) {
            let touched = false;
            const res = A.simulate(level, x, r.y, 0, CAT_H, act, mf, { grounded: true, onFrame: (fx, fy) => { if (hit(fx, fy)) touched = true; } });
            // a touch on the frame the lasers kill the cat still counts (same frame order as the game is not modelled)
            if (touched && res) { out = mf; break outer; }
          }
        }
      }
    }
  } finally {
    if (prev === undefined) delete process.env.SHRINK_GEOM; else process.env.SHRINK_GEOM = prev;
  }
  cache.set(ck, out);
  return out;
}

// The window for one gem: its close, or the gem's own deadline when no earlier
// window binds. Used both for the gem itself and for the "before any other gem"
// comparison.
function effectiveClose(level, gx, gy) {
  const w = windowClose(level, gx, gy);
  const d = RC.gemDeadline(gx, gy);
  return w == null ? d : Math.min(w, d);
}

// Sentence appended to gem (gx, gy)'s menu entry, or "". `others` = the other live gems [{x, y}].
function collectWindowLine(level, gx, gy, mf, others) {
  if (process.env.COLLECT_WINDOW !== "1") return "";
  const w = windowClose(level, gx, gy);
  if (w == null) return "";
  if (w > RC.gemDeadline(gx, gy) - MIN_LEAD) return "";
  const n = Math.round(w - mf);
  if (n <= 0 || n > MAX_AHEAD) return "";
  const first = others.length > 0 && others.every((o) => effectiveClose(level, o.x, o.y) > w);
  return first
    ? ` It can be collected only during the next ${n} moving frames, before any other gem's time runs out.`
    : ` It can be collected only during the next ${n} moving frames.`;
}

module.exports = { windowClose, effectiveClose, collectWindowLine };
