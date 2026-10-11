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

// COLLECT_WINDOW=2: the window as seen from the floor the cat stands on. Floors
// shrink and vanish under the lasers (platform_live.cjs), so a gem whose collector
// floors survive can still be cut off from where the cat is: on L6, from the
// right-hand floors (x 211..263 at y 220, x 241..293 at y 176) no route on the
// live graph reaches gem_a's collector floors after mf 220, while gem_a itself
// lasts until mf 670, and the ladder lives that went right first never came back
// for it (docs/results.md, 2026-10-11). reachClose is the first clock (step 5)
// at which the live graph has no route from `floorKey` to any collector floor of
// the gem; null if a route lasts to the gem's deadline. Optimistic like the graph:
// it ignores travel time, so the real window is no longer than this.
const REACH_STEP = 5;
const colCache = new Map();
const reachCache = new Map();
function collectorKeys(level, gx, gy) {
  const ck = `${level}|${gx},${gy}`;
  if (colCache.has(ck)) return colCache.get(ck);
  const prev = process.env.SHRINK_GEOM;
  delete process.env.SHRINK_GEOM;
  const out = new Set();
  try {
    const hit = (cx, cy) => cx < gx + 8 && cx + 1 > gx - 8 && cy - CAT_H < gy + 8 && cy > gy - 8;
    for (const r of R.runsOf(level)) {
      let ok = false;
      for (let x = Math.ceil(r.left); x <= r.right && !ok; x += 2) {
        if (hit(x, r.y)) { ok = true; break; }
        for (const act of ["jump", "jump_left", "jump_right"]) {
          let t = false;
          A.simulate(level, x, r.y, 0, CAT_H, act, 0, { grounded: true, onFrame: (fx, fy) => { if (hit(fx, fy)) t = true; } });
          if (t) { ok = true; break; }
        }
      }
      if (ok) out.add(R.runKey(r));
    }
  } finally {
    if (prev === undefined) delete process.env.SHRINK_GEOM; else process.env.SHRINK_GEOM = prev;
  }
  colCache.set(ck, out);
  return out;
}

function reachClose(level, floorKey, gx, gy) {
  const ck = `${level}|${floorKey}|${gx},${gy}`;
  if (reachCache.has(ck)) return reachCache.get(ck);
  const LIVE = require("./platform_live.cjs");
  const cols = collectorKeys(level, gx, gy);
  const prevGate = process.env.SHRINK_GEOM;
  let prevClock = null;
  try { prevClock = LIVE.clock(); } catch { prevClock = null; }
  process.env.SHRINK_GEOM = "1";
  let out = null;
  try {
    const deadline = RC.gemDeadline(gx, gy);
    for (let mf = 0; mf <= deadline; mf += REACH_STEP) {
      LIVE.setClock(mf);
      const g = R.graph(level, CAT_H);
      // The floor itself vanishing is not a route loss (the cat has to leave it
      // anyway): no floor-specific window then.
      if (!g.runs.some((r) => R.runKey(r) === floorKey)) { out = null; break; }
      if (cols.has(floorKey)) continue;
      const seen = new Set([floorKey]);
      const q = [floorKey];
      let found = false;
      while (q.length && !found) {
        for (const nk of g.edges[q.shift()] || []) {
          if (seen.has(nk)) continue;
          seen.add(nk);
          if (cols.has(nk)) { found = true; break; }
          q.push(nk);
        }
      }
      if (!found) { out = mf; break; }
    }
  } finally {
    if (prevGate === undefined) delete process.env.SHRINK_GEOM; else process.env.SHRINK_GEOM = prevGate;
    LIVE.setClock(prevClock);
  }
  reachCache.set(ck, out);
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

const FLOOR_LEAD = 20; // the floor window must close this much before the gem's own window

// Sentence appended to gem (gx, gy)'s menu entry, or "". `others` = the other live gems [{x, y}].
// floorKey: the floor the cat stands on (COLLECT_WINDOW=2 only; null when airborne).
function collectWindowLine(level, gx, gy, mf, others, floorKey) {
  const gate = process.env.COLLECT_WINDOW;
  if (gate !== "1" && gate !== "2") return "";
  const dl = RC.gemDeadline(gx, gy);
  const own = effectiveClose(level, gx, gy);
  // COLLECT_WINDOW=2: from this floor the route to the gem closes first.
  if (gate === "2" && floorKey) {
    const r = reachClose(level, floorKey, gx, gy);
    if (r != null && r > mf && r <= own - FLOOR_LEAD && r <= dl - MIN_LEAD) {
      const n = Math.round(r - mf);
      if (n <= MAX_AHEAD) {
        const first = others.length > 0 && others.every((o) => effectiveClose(level, o.x, o.y) > r);
        return first
          ? ` From this floor it can be reached only during the next ${n} moving frames, before any other gem's time runs out.`
          : ` From this floor it can be reached only during the next ${n} moving frames.`;
      }
    }
  }
  if (own > dl - MIN_LEAD) return "";
  const n = Math.round(own - mf);
  if (n <= 0 || n > MAX_AHEAD) return "";
  const first = others.length > 0 && others.every((o) => effectiveClose(level, o.x, o.y) > own);
  return first
    ? ` It can be collected only during the next ${n} moving frames, before any other gem's time runs out.`
    : ` It can be collected only during the next ${n} moving frames.`;
}

module.exports = { windowClose, effectiveClose, collectWindowLine, reachClose, collectorKeys };
