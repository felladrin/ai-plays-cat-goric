"use strict";
// route_clock.cjs — the route-vs-clock check, driver-side.
//
// The live blocker (docs/open-problems.md #1): the objective layer commits to a
// gem on geometric reachability alone, and the world has a clock. Lasers close
// monotonically with movingFrames, a gem is destroyed when a laser passes it,
// and a route that is available early is gone later. This module answers, for
// each live gem, whether TAKING IT FIRST can still win the level.
//
// BOUND DIRECTION. Every modelling choice is OPTIMISTIC about what the cat can
// do: full air control at catWalkSpeed, interception ignored (a trajectory
// that would side-snap onto an intermediate platform still counts), landing
// cost from the reach envelope rather than a held-action replay, laser
// thickness at the CERTAIN bound (maxLaserHalfSize, same constant arc.cjs
// uses). A DEAD verdict is therefore a proof: even a perfect player misses a
// deadline or dies in the lasers. ALIVE means "not provably lost", not
// "will work".
//
// GRID SOUNDNESS. States are (floor, x) on a 2px grid. The cat's real x is
// continuous, so a DEAD verdict can be wrong by roughly one grid step of
// walking per critical transition. DEAD is therefore only reported when the
// proof survives a DEAD_MARGIN-frame deadline relaxation — measured margins
// on the diagnosed levels are 60+ frames, so the margin costs nothing where
// the verdicts matter.
//
// FIRE GATE. When every first-pick is dead the level is already lost; saying
// so adds a true statement that cannot change anything (rule 4). The caller
// gets `mixed` and should annotate only when some pick is alive and some is
// not.
//
// The offline analysis CLI lives in experiments/route_clock.cjs and
// experiments/firstpick_sweep.cjs; this file is the canonical implementation.

const CFG = require("./physics.cjs");
const REACH = require("./reachability.cjs");

const CAT_H = 18;
const GEM_HALF = 8; // 16x16 sprite, centre anchor (getGemAnimations.ts:9-10)
const PORTAL = { x: 180, y: 150, half: 16 }; // box 164..196 x 134..166
const X_STEP = 2;
const PLAT_TOP = CFG.platformHeight * CFG.platformAnchorY;
const PLAT_BOT = CFG.platformHeight * (1 - CFG.platformAnchorY);
const SP = CFG.droneSpeed;
const INSET = CFG.maxLaserHalfSize; // 1.5 — the CERTAIN bound, per arc.cjs
const DEAD_MARGIN = 10; // frames; grid-soundness cushion on every DEAD proof

function gemDeadline(x, y) {
  return Math.min(
    (y - 1) / SP,
    (CFG.maximumLaserY - y) / SP,
    (x - 1) / SP,
    (359 - x) / SP
  );
}

function movingFramesOf(snap) {
  if (!snap || !snap.drones || !snap.drones.tl) return null;
  return (snap.drones.tl.y - 1) / SP;
}

// Safe box at moving frame mf, same bounds arc.simulate applies.
function stateSafe(fy, x, mf) {
  return (
    fy - CAT_H > 1 + SP * mf + INSET &&
    fy < CFG.maximumLaserY - SP * mf - INSET &&
    x > 1 + SP * mf + INSET &&
    x < 359 - SP * mf - INSET
  );
}

function gridXs(run) {
  const lo = Math.ceil(run.left / X_STEP) * X_STEP;
  const out = [];
  for (let x = lo; x <= run.right; x += X_STEP) out.push(x);
  return out;
}

// ---- base graph per level ---------------------------------------------------
// State record per (run, grid x): walk edges + arc edges, resolved to records
// once so the search loop never parses strings.
//   arc: { rec, x, fy, f, touches, t0max }  or  { portal: true, f, touches, t0max }
//   touches: [{gem, f}] first envelope-touch frame per gem index during the arc.
//   t0max: latest start movingFrame whose vertical path stays in the y-safe
//          box up to this edge's landing frame.

const baseCache = new Map();

function buildBase(level, gems) {
  const runs = REACH.runsOf(level);
  const base = new Map();

  function integrate(x0, y0, jump) {
    let dy = jump ? -CFG.catJumpSpeed : 0;
    let y = y0;
    const windows = new Map();
    const touches = [];
    const touched = new Set();
    let portalTouch = null;
    const yTrace = [y0];
    for (let f = 1; f <= 200; f++) {
      dy += CFG.catFallingAcceleration;
      y += dy;
      if (y > 420) break;
      yTrace[f] = y;
      const span = CFG.catWalkSpeed * (f - 1);
      const lo = x0 - span;
      const hi = x0 + span;
      const head = y - CAT_H;
      gems.forEach((g, gi) => {
        if (touched.has(gi)) return;
        if (hi + 1 > g[0] - GEM_HALF && lo < g[0] + GEM_HALF && head < g[1] + GEM_HALF && y > g[1] - GEM_HALF) {
          touches.push({ gem: gi, f });
          touched.add(gi);
        }
      });
      if (
        portalTouch == null &&
        hi + 1 > PORTAL.x - PORTAL.half && lo < PORTAL.x + PORTAL.half &&
        head < PORTAL.y + PORTAL.half && y > PORTAL.y - PORTAL.half
      ) {
        portalTouch = f;
      }
      if (dy < 0) continue; // snaps only while descending
      for (const r of runs) {
        if (!(head < r.y + PLAT_BOT && y > r.y - PLAT_TOP)) continue;
        if (hi < r.left || lo > r.right) continue;
        const k = REACH.runKey(r);
        if (!windows.has(k)) windows.set(k, { run: r, fStart: f, fEnd: f });
        else windows.get(k).fEnd = f;
      }
    }
    // Cat-clock per landing frame: latest t0 whose whole vertical path to f
    // stays inside the shrinking y-safe box. Must be evaluated to the ACTUAL
    // landing frame, not the window end — the window keeps testing while the
    // body overlaps the band on the way past, frames a landed cat never
    // travels. (Evaluating to fEnd made same-height hops lethal at t0 < 0.)
    function t0maxUpTo(fEnd) {
      let t0max = Infinity;
      for (let f = 1; f <= fEnd; f++) {
        const yf = yTrace[f];
        if (yf == null) break;
        const topLimit = (yf - CAT_H - 1 - INSET - SP * f) / SP;
        const botLimit = (CFG.maximumLaserY - INSET - yf - SP * f) / SP;
        if (topLimit < t0max) t0max = topLimit;
        if (botLimit < t0max) t0max = botLimit;
      }
      return t0max;
    }
    return { windows, touches, portalTouch, t0maxUpTo };
  }

  for (const r of runs) {
    const key = REACH.runKey(r);
    for (const x of gridXs(r)) {
      const walk = [];
      if (x - X_STEP >= r.left) walk.push([`${key}|${x - X_STEP}`, X_STEP / CFG.catWalkSpeed]);
      if (x + X_STEP <= r.right) walk.push([`${key}|${x + X_STEP}`, X_STEP / CFG.catWalkSpeed]);
      const arcs = [];
      const atLeft = Math.abs(x - r.left) < X_STEP;
      const atRight = Math.abs(x - r.right) < X_STEP;
      const isEnd = atLeft || atRight;
      for (const jump of [true, false]) {
        if (!jump && !isEnd) continue; // a grounded cat leaves a floor by jumping or walking off an end
        // Origin kind: lets the waypoint search constrain the FIRST floor change
        // to a specific step-off end (descent_left / descent_right semantics).
        const kind = jump
          ? "jump"
          : atLeft && atRight ? "stepoff_both" : atLeft ? "stepoff_left" : "stepoff_right";
        const { windows, touches, portalTouch, t0maxUpTo } = integrate(x, r.y, jump);
        for (const [bk, w] of windows) {
          if (bk === key) continue;
          const lo = Math.max(w.run.left, x - CFG.catWalkSpeed * (w.fEnd - 1));
          const hi = Math.min(w.run.right, x + CFG.catWalkSpeed * (w.fEnd - 1));
          const gLo = Math.ceil(lo / X_STEP) * X_STEP;
          for (let lx = gLo; lx <= hi; lx += X_STEP) {
            const f = Math.max(w.fStart, Math.ceil(1 + Math.abs(lx - x) / CFG.catWalkSpeed));
            if (f > w.fEnd) continue;
            arcs.push([`${bk}|${lx}`, f, touches, t0maxUpTo(f), kind]);
          }
        }
        if (portalTouch != null) arcs.push(["PORTAL", portalTouch, touches, t0maxUpTo(portalTouch), kind]);
      }
      base.set(`${key}|${x}`, { walk, arcs, fy: r.y, x, keyFloor: key });
    }
  }
  for (const st of base.values()) {
    st.walk = st.walk.map(([k, c]) => {
      const t = base.get(k);
      return { rec: t, x: t.x, fy: t.fy, cost: c };
    });
    st.arcs = st.arcs.map(([k, f, touches, t0max, kind]) => {
      if (k === "PORTAL") return { portal: true, f, touches, t0max, kind };
      const t = base.get(k);
      return { rec: t, x: t.x, fy: t.fy, f, touches, t0max, kind };
    });
  }
  return { base, runs };
}

function getBase(level, gems) {
  const key = level + ":" + JSON.stringify(gems);
  if (!baseCache.has(key)) baseCache.set(key, buildBase(level, gems));
  return baseCache.get(key);
}

// ---- layered Dijkstra -------------------------------------------------------
// `order` = indices into `gems` of the REMAINING gems in the tested order
// (length 1..3); the portal is the layer-n target. `slack` relaxes every gem
// deadline, used to measure how far from the proof a DEAD verdict sits.
function orderFeasibleN(level, gems, order, startKey, startX, mf, slack) {
  const { base } = getBase(level, gems);
  const n = order.length;
  const N = n + 1;
  const dist = Array.from({ length: N + 1 }, () => new Map());
  const heap = makeHeap();
  const startRec = base.get(`${startKey}|${startX}`);
  if (!startRec) return { feasible: false, portalAt: null, collectTimes: [] };
  heap.push({ rec: startRec, k: 0, t: 0 });
  dist[0].set(startRec, 0);
  const collect = (k) => (k < n ? gems[order[k]] : null);
  const deadlineOf = (g) => gemDeadline(g[0], g[1]) - mf + (slack || 0);
  const holders = order.map((gi) => REACH.platformHolding(level, gems[gi][0], gems[gi][1]));
  let best = null;
  const collectTimes = [];

  while (heap.size()) {
    const cur = heap.pop();
    if (cur.t > (dist[cur.k].get(cur.rec) ?? Infinity)) continue;
    if (best != null && cur.t >= best) continue;
    const entry = cur.rec;

    const push = (k, rec, t) => {
      if (t < (dist[k].get(rec) ?? Infinity)) { dist[k].set(rec, t); heap.push({ rec, k, t }); }
    };

    for (const w of entry.walk) {
      const t = cur.t + w.cost;
      if (stateSafe(w.fy, w.x, mf + t)) push(cur.k, w.rec, t);
    }

    const g = collect(cur.k);
    if (g) {
      const holder = holders[cur.k];
      if (holder && cur.rec.keyFloor === holder &&
          entry.x < g[0] + GEM_HALF && entry.x + 1 > g[0] - GEM_HALF) {
        const t = cur.t;
        if (t <= deadlineOf(g)) {
          if (collectTimes[cur.k] == null || t < collectTimes[cur.k]) collectTimes[cur.k] = t;
          push(cur.k + 1, cur.rec, t);
        }
      }
    }

    if (cur.k === n) {
      const fy = entry.fy;
      if (fy - CAT_H < PORTAL.y + PORTAL.half && fy > PORTAL.y - PORTAL.half &&
          entry.x < PORTAL.x + PORTAL.half && entry.x + 1 > PORTAL.x - PORTAL.half) {
        if (best == null || cur.t < best) best = cur.t;
      }
    }

    const need = collect(cur.k);
    const needGi = need != null ? order[cur.k] : -1;
    for (const a of entry.arcs) {
      const t = cur.t + a.f;
      if (mf + cur.t > a.t0max) continue;
      if (a.portal) {
        if (cur.k === n && (best == null || t < best)) best = t;
        continue;
      }
      if (!stateSafe(a.fy, a.x, mf + t)) continue;
      push(cur.k, a.rec, t);
      if (need != null) {
        const tt = a.touches.find((x) => x.gem === needGi);
        if (tt != null && tt.f <= a.f && cur.t + tt.f <= deadlineOf(need)) {
          if (collectTimes[cur.k] == null || cur.t + tt.f < collectTimes[cur.k]) {
            collectTimes[cur.k] = cur.t + tt.f;
          }
          push(cur.k + 1, a.rec, t);
        }
      }
    }
  }
  return { feasible: best != null, portalAt: best, collectTimes };
}

// ---- waypoint first-pick ----------------------------------------------------
// The descent/ascent analogue of firstPickVerdicts. Question: if the cat's
// FIRST floor change from here is a step-off of this side (or a jump), is the
// level still winnable? Walking on the current floor before the transition is
// free; the constraint binds only the first non-walk edge. The gem ordering
// stays existentially quantified over all permutations of the remaining gems.
//
// firstKind: "stepoff_left" | "stepoff_right" | "jump". A "stepoff_both"
// edge (a run one grid step wide) matches either side.
function waypointFeasibleN(level, gems, order, startKey, startX, mf, slack, firstKind) {
  const { base } = getBase(level, gems);
  const n = order.length;
  const N = n + 1;
  const dist = Array.from({ length: (N + 1) * 2 }, () => new Map());
  const heap = makeHeap();
  const startRec = base.get(`${startKey}|${startX}`);
  if (!startRec) return { feasible: false, portalAt: null, collectTimes: [] };
  const idx = (k, u) => k * 2 + u;
  heap.push({ rec: startRec, k: 0, u: 0, t: 0 });
  dist[idx(0, 0)].set(startRec, 0);
  const collect = (k) => (k < n ? gems[order[k]] : null);
  const deadlineOf = (g) => gemDeadline(g[0], g[1]) - mf + (slack || 0);
  const holders = order.map((gi) => REACH.platformHolding(level, gems[gi][0], gems[gi][1]));
  let best = null;
  const collectTimes = [];

  const kindMatches = (kind) => {
    if (kind === firstKind) return true;
    if (kind === "stepoff_both" && (firstKind === "stepoff_left" || firstKind === "stepoff_right")) return true;
    return false;
  };

  while (heap.size()) {
    const cur = heap.pop();
    if (cur.t > (dist[idx(cur.k, cur.u)].get(cur.rec) ?? Infinity)) continue;
    if (best != null && cur.t >= best) continue;
    const entry = cur.rec;

    const push = (k, u, rec, t) => {
      if (t < (dist[idx(k, u)].get(rec) ?? Infinity)) { dist[idx(k, u)].set(rec, t); heap.push({ rec, k, u, t }); }
    };

    for (const w of entry.walk) {
      const t = cur.t + w.cost;
      if (stateSafe(w.fy, w.x, mf + t)) push(cur.k, cur.u, w.rec, t);
    }

    const g = collect(cur.k);
    if (g) {
      const holder = holders[cur.k];
      if (holder && cur.rec.keyFloor === holder &&
          entry.x < g[0] + GEM_HALF && entry.x + 1 > g[0] - GEM_HALF) {
        const t = cur.t;
        if (t <= deadlineOf(g)) {
          if (collectTimes[cur.k] == null || t < collectTimes[cur.k]) collectTimes[cur.k] = t;
          push(cur.k + 1, cur.u, cur.rec, t);
        }
      }
    }

    if (cur.k === n && cur.u === 1) {
      const fy = entry.fy;
      if (fy - CAT_H < PORTAL.y + PORTAL.half && fy > PORTAL.y - PORTAL.half &&
          entry.x < PORTAL.x + PORTAL.half && entry.x + 1 > PORTAL.x - PORTAL.half) {
        if (best == null || cur.t < best) best = cur.t;
      }
    }

    const need = collect(cur.k);
    const needGi = need != null ? order[cur.k] : -1;
    for (const a of entry.arcs) {
      const u2 = cur.u === 0 ? (kindMatches(a.kind) ? 1 : -1) : 1;
      if (u2 < 0) continue; // first floor change must be the constrained kind
      const t = cur.t + a.f;
      if (mf + cur.t > a.t0max) continue;
      if (a.portal) {
        if (cur.k === n && u2 === 1 && (best == null || t < best)) best = t;
        continue;
      }
      if (!stateSafe(a.fy, a.x, mf + t)) continue;
      push(cur.k, u2, a.rec, t);
      if (need != null) {
        const tt = a.touches.find((x) => x.gem === needGi);
        if (tt != null && tt.f <= a.f && cur.t + tt.f <= deadlineOf(need)) {
          if (collectTimes[cur.k] == null || cur.t + tt.f < collectTimes[cur.k]) {
            collectTimes[cur.k] = cur.t + tt.f;
          }
          push(cur.k + 1, u2, a.rec, t);
        }
      }
    }
  }
  return { feasible: best != null, portalAt: best, collectTimes };
}

// Verdicts for the waypoint options from a state. For each side, "dead" means
// EVERY gem ordering whose first floor change is that side's step-off misses a
// deadline by more than DEAD_MARGIN — a proof the descent itself loses the
// level regardless of what is collected afterwards.
function waypointVerdicts(level, gems, aliveNames, floorKey, catX, mf) {
  const nameOf = ["gem_a", "gem_b", "gem_c"];
  const aliveIdx = [];
  for (const nm of aliveNames) {
    const i = nameOf.indexOf(nm);
    if (i >= 0) aliveIdx.push(i);
  }
  const runs = REACH.runsOf(level);
  const run = runs.find((r) => REACH.runKey(r) === floorKey);
  if (!run) return { verdicts: {}, anyAlive: true, allDead: false, mixed: false };
  let sx = Math.round(catX / X_STEP) * X_STEP;
  if (sx < run.left) sx += X_STEP;
  if (sx > run.right) sx -= X_STEP;

  const verdicts = {};
  let anyAlive = false;
  let anyDead = false;
  for (const side of ["left", "right"]) {
    const firstKind = `stepoff_${side}`;
    let alive = false;
    for (const order of perms(aliveIdx)) {
      const r = waypointFeasibleN(level, gems, order, floorKey, sx, mf, 0, firstKind);
      if (r.feasible) { alive = true; break; }
      const rm = waypointFeasibleN(level, gems, order, floorKey, sx, mf, DEAD_MARGIN, firstKind);
      if (rm.feasible) { alive = true; break; } // proof inside the grid-error band
    }
    verdicts[`descent_${side}`] = alive ? "alive" : "dead";
    if (alive) anyAlive = true; else anyDead = true;
  }
  return { verdicts, anyAlive, allDead: anyDead && !anyAlive, mixed: anyDead && anyAlive };
}

function makeHeap() {
  const a = [];
  const push = (item) => {
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].t <= a[i].t) break;
      const t = a[p]; a[p] = a[i]; a[i] = t;
      i = p;
    }
  };
  const pop = () => {
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].t < a[m].t) m = l;
        if (r < a.length && a[r].t < a[m].t) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t;
        i = m;
      }
    }
    return top;
  };
  return { push, pop, size: () => a.length };
}

function perms(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of perms(rest)) out.push([arr[i]].concat(p));
  }
  return out;
}

// ---- the decision-facing API ------------------------------------------------
// level: level index. gems: the level's SPAWN-order gem array [[x,y]x3].
// aliveNames: names of the still-live gems ("gem_a" etc, spawn-order naming).
// floorKey: REACH.platformKeyUnder for the cat. catX: cat x (snapped to grid).
// mf: moving frames now.
// Returns { verdicts: {gem_a: "alive"|"dead"}, doomed: {gem_a: "gem_b"|null},
//           anyAlive, allDead }.
// A verdict is "dead" only when EVERY ordering starting with that gem misses
// some deadline by more than DEAD_MARGIN frames.
function firstPickVerdicts(level, gems, aliveNames, floorKey, catX, mf) {
  const nameOf = ["gem_a", "gem_b", "gem_c"];
  const aliveIdx = [];
  for (const nm of aliveNames) {
    const i = nameOf.indexOf(nm);
    if (i >= 0) aliveIdx.push(i);
  }
  const runs = REACH.runsOf(level);
  const run = runs.find((r) => REACH.runKey(r) === floorKey);
  if (!run) return { verdicts: {}, doomed: {}, anyAlive: true, allDead: false };
  let sx = Math.round(catX / X_STEP) * X_STEP;
  if (sx < run.left) sx += X_STEP;
  if (sx > run.right) sx -= X_STEP;

  const verdicts = {};
  const doomed = {};
  let anyAlive = false;
  let anyDead = false;
  for (const first of aliveIdx) {
    const rest = aliveIdx.filter((i) => i !== first);
    let alive = false;
    let bestReached = -1;
    let bestDoomed = null;
    for (const order of perms([first].concat(rest))) {
      const r = orderFeasibleN(level, gems, order, floorKey, sx, mf, 0);
      if (r.feasible) { alive = true; break; }
      // Dead at slack 0. The verdict ships only if it also holds with every
      // deadline relaxed by DEAD_MARGIN — the grid-soundness cushion.
      const rm = orderFeasibleN(level, gems, order, floorKey, sx, mf, DEAD_MARGIN);
      if (rm.feasible) continue; // proof sits inside the grid-error band
      // The first uncollected gem of the best-reaching ordering is the doomed one.
      const reached = r.collectTimes.filter((t) => t != null).length;
      if (reached > bestReached) {
        bestReached = reached;
        bestDoomed = reached < order.length ? nameOf[order[reached]] : null;
      }
    }
    if (alive) {
      verdicts[nameOf[first]] = "alive";
      doomed[nameOf[first]] = null;
      anyAlive = true;
    } else if (bestReached >= 0) {
      verdicts[nameOf[first]] = "dead";
      doomed[nameOf[first]] = bestDoomed;
      anyDead = true;
    } else {
      // every ordering was ALIVE at +DEAD_MARGIN: the proof is inside the
      // grid-error band. Report alive; do not cry wolf.
      verdicts[nameOf[first]] = "alive";
      doomed[nameOf[first]] = null;
      anyAlive = true;
    }
  }
  return { verdicts, doomed, anyAlive, allDead: anyDead && !anyAlive, mixed: anyDead && anyAlive };
}

module.exports = {
  gemDeadline,
  movingFramesOf,
  stateSafe,
  orderFeasibleN,
  waypointFeasibleN,
  waypointVerdicts,
  firstPickVerdicts,
  DEAD_MARGIN,
  X_STEP,
};
