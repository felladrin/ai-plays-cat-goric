"use strict";
// route_clock.cjs — offline route-vs-clock analyzer.
//
// The live blocker (docs/open-problems.md #1): the objective layer commits to a
// gem on geometric reachability alone, and the world has a clock. This answers,
// per level and per gem-collection ordering, whether a perfect player can
// collect every gem before its laser deadline and reach the portal — and, at
// any decision state (floor, x, movingFrames), which orderings are still alive.
//
// BOUND DIRECTION — the whole point of this file. Every modelling choice is
// OPTIMISTIC (over-approximates what the cat can do): full air control at
// catWalkSpeed, interception ignored (a trajectory that would side-snap earlier
// still counts), landing cost from the reach envelope, not a held-action replay,
// laser thickness at the CERTAIN bound (maxLaserHalfSize, per arc.cjs).
// Therefore an ordering reported DEAD is a PROOF: even the fastest legal player
// misses some deadline or dies in the lasers. A reported-alive ordering may
// still be missed by a worse player. "Never cry wolf" is structural here, per
// rule 4 of docs/rules.md.
//
// Two clocks, both modeled:
//   gem clock   a gem at (x,y) is destroyed at
//               min((y-1)/0.2, (310-y)/0.2, (x-1)/0.2, (359-x)/0.2) moving
//               frames (docs/game-facts.md, from checkGemsCollisionWithLasers).
//   cat clock   the safe box shrinks: x in (2.5+0.2mf, 356.5-0.2mf), head
//               y-18 above the top laser, feet below the bottom one (the
//               arc.simulate bounds with maxLaserHalfSize=1.5 inset). A state,
//               a walk step, an arc, and a landing are each checked against it.
//
// Model:
//   States  (floor, x) with x on a 2px grid inside the floor's run span.
//   Edges   walk +-2px at 1.75 px/frame; jump from any x; step-off from the
//           two run ends only (a grounded cat leaves a floor by jumping or
//           walking off an end — a fall from mid-floor is phantom).
//   Landing from an integration reaching floor B over frame window
//           [fStart, fEnd]: for every grid x in the widened interval, the
//           earliest frame is max(fStart, ceil(1 + |x-x0| / 1.75)) capped at
//           fEnd — exact under the envelope (x in interval_f iff
//           f >= 1+|x-x0|/1.75).
//   Collect walk-under (cat column vs 16x16 gem box, the game's own overlap)
//           or in flight (envelope touches the gem box during an arc).
//   Layers  k = gems collected so far in the tested order; the portal is the
//           layer-3 target, touched by walking into its box or in flight.
//
// Usage:
//   node route_clock.cjs [level ...]        all-ordering report from spawn
//   node route_clock.cjs --state L FLOORKEY X MF   which orderings alive at a state

const path = require("path");
const fs = require("fs");
const CFG = require("../physics.cjs");
const REACH = require("../reachability.cjs");
const LEVELS = require("../level_data.cjs");

const CAT_H = 18;
const GEM_HALF = 8; // 16x16 sprite, centre anchor (getGemAnimations.ts:9-10)
const PORTAL = { x: 180, y: 150, half: 16 }; // box 164..196 x 134..166
const X_STEP = 2;
const PLAT_TOP = CFG.platformHeight * CFG.platformAnchorY;
const PLAT_BOT = CFG.platformHeight * (1 - CFG.platformAnchorY);
const SP = CFG.droneSpeed;
const INSET = CFG.maxLaserHalfSize; // 1.5 — the CERTAIN bound, per arc.cjs

// Safe-box x window at moving frame mf: the cat column x must satisfy
//   x > 1 + SP*mf + INSET   and   x < 359 - SP*mf - INSET
// (arc.simulate: dies at x <= left || x >= right).
function safeXLo(mf) { return 1 + SP * mf + INSET; }
function safeXHi(mf) { return 359 - SP * mf - INSET; }
// A standing cat at floor height fy is alive at mf while
//   fy - CAT_H > 1 + SP*mf + INSET   and   fy < 310 - SP*mf - INSET
function stateSafe(fy, x, mf) {
  return fy - CAT_H > 1 + SP * mf + INSET &&
         fy < CFG.maximumLaserY - SP * mf - INSET &&
         x > safeXLo(mf) && x < safeXHi(mf);
}

function gemDeadline(x, y) {
  return Math.min((y - 1) / SP, (CFG.maximumLaserY - y) / SP, (x - 1) / SP, (359 - x) / SP);
}

// Gems straight from the game's own config.ts — single source, spawn order =
// gem_a, gem_b, gem_c exactly as matchGemsToSpawn names them.
function loadGems() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"),
    "utf8"
  );
  const m = src.match(/gemsPositionsPerLevel[^=]*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error("could not extract gemsPositionsPerLevel from config.ts");
  // TS allows trailing commas; JSON does not.
  return JSON.parse(m[1].replace(/,(\s*[\]\}])/g, "$1"));
}

// ---- base graph per level ---------------------------------------------------
// For each state "runKey|x":
//   walk: [[stateKey, cost], ...]
//   arcs: [[toStateKey|PORTAL, f, touches, t0max], ...]
//     touches: [{gem, f}] first envelope-touch frame per gem during the arc
//     t0max:   latest start movingFrame at which the arc's VERTICAL path stays
//              inside the shrinking y-safe box (x-safety of the landing is
//              checked at relaxation, since it depends on the landing x).

function gridXs(run) {
  const lo = Math.ceil(run.left / X_STEP) * X_STEP;
  const out = [];
  for (let x = lo; x <= run.right; x += X_STEP) out.push(x);
  return out;
}

function buildBase(level, gems) {
  const runs = REACH.runsOf(level);
  const base = new Map();

  function integrate(x0, y0, jump) {
    let dy = jump ? -CFG.catJumpSpeed : 0;
    let y = y0;
    const windows = new Map(); // runKey -> {run, fStart, fEnd}
    const touches = [];
    const touched = new Set();
    let portalTouch = null;
    const yTrace = [y0]; // yTrace[f] = y after frame f
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
      if (portalTouch == null &&
          hi + 1 > PORTAL.x - PORTAL.half && lo < PORTAL.x + PORTAL.half &&
          head < PORTAL.y + PORTAL.half && y > PORTAL.y - PORTAL.half) {
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
    // Vertical cat-clock, PER LANDING WINDOW: latest start movingFrame t0 such
    // that for every frame f <= fEnd of that window the body stays inside the
    // shrinking y-safe box. Frames past the landing do not exist for the cat —
    // computing the min over the whole fall made every arc look lethal because
    // the tail of an unlanded fall always crosses the bottom laser.
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
      const isEnd = Math.abs(x - r.left) < X_STEP || Math.abs(x - r.right) < X_STEP;
      for (const jump of [true, false]) {
        if (!jump && !isEnd) continue; // step-off only from the run ends
        const { windows, touches, portalTouch, t0maxUpTo } = integrate(x, r.y, jump);
        for (const [bk, w] of windows) {
          if (bk === key) continue;
          const lo = Math.max(w.run.left, x - CFG.catWalkSpeed * (w.fEnd - 1));
          const hi = Math.min(w.run.right, x + CFG.catWalkSpeed * (w.fEnd - 1));
          const gLo = Math.ceil(lo / X_STEP) * X_STEP;
          for (let lx = gLo; lx <= hi; lx += X_STEP) {
            const f = Math.max(w.fStart, Math.ceil(1 + Math.abs(lx - x) / CFG.catWalkSpeed));
            if (f > w.fEnd) continue;
            // Cat-clock to the ACTUAL landing frame of this edge, not the window
            // end: the window keeps testing while the body still overlaps the
            // band on the way past, but a cat landing at f never travels the
            // frames after it. Evaluating to fEnd made same-height hops look
            // lethal at t0 < 0 on L9 and killed every ordering.
            arcs.push([`${bk}|${lx}`, f, touches, t0maxUpTo(f)]);
          }
        }
        if (portalTouch != null) arcs.push(["PORTAL", portalTouch, touches, t0maxUpTo(portalTouch)]);
      }
      base.set(`${key}|${x}`, { walk, arcs, fy: r.y, x, keyFloor: key });
    }
  }
  // Resolve walk target keys to records once, so the search loop never parses
  // state strings (the regex-per-pop was 36% of the runtime).
  for (const st of base.values()) {
    st.walk = st.walk.map(([k, c]) => {
      const t = base.get(k);
      return { rec: t, x: t.x, fy: t.fy, cost: c };
    });
    st.arcs = st.arcs.map(([k, f, touches, t0max]) => {
      if (k === "PORTAL") return { portal: true, f, touches, t0max };
      const t = base.get(k);
      return { rec: t, x: t.x, fy: t.fy, f, touches, t0max };
    });
  }
  return { base, runs };
}

const baseCache = new Map();
function buildCache(level, gems) {
  const key = level + ":" + JSON.stringify(gems);
  if (!baseCache.has(key)) baseCache.set(key, buildBase(level, gems));
  return baseCache.get(key);
}

// ---- layered Dijkstra for one ordering --------------------------------------
// Layer k = the first k gems of `order` collected. Collection: walk-under or
// in-flight touch, each checked against the gem deadline AT the touch. Every
// push is checked against the cat clock at its arrival time.
// mf = moving frames already spent when the ordering starts.

// Binary min-heap on t. The O(n) extract-min made the per-decision cost of a
// live annotation impossible (75 ms/call); the heap brings it to ~2 ms.
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

// Generalized: `order` is the list of REMAINING gems in the tested order
// (length 1..3); the portal is the layer-n target. `slack` lets the caller
// relax every gem deadline by N frames to measure how far from the proof a
// DEAD verdict sits (the grid-soundness margin).
function orderFeasibleN(level, gems, order, startKey, startX, mf, slack) {
  const { base } = buildCache(level, gems);
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

function orderFeasible(level, gems, order, startKey, startX, mf) {
  return orderFeasibleN(level, gems, order, startKey, startX, mf, 0);
}

// How many frames of slack a DEAD first-pick verdict has: the smallest
// deadline relaxation that flips it alive. A verdict with a large margin is
// immune to grid coarseness; one under a few frames is not trustworthy.
function deadMargin(level, gems, order, startKey, startX, mf, maxSlack = 400) {
  if (orderFeasibleN(level, gems, order, startKey, startX, mf, 0).feasible) return 0;
  let lo = 1, hi = maxSlack;
  if (orderFeasibleN(level, gems, order, startKey, startX, mf, hi).feasible) {
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (orderFeasibleN(level, gems, order, startKey, startX, mf, mid).feasible) hi = mid;
      else lo = mid + 1;
    }
    return lo; // alive at +lo, dead at +lo-1
  }
  return Infinity; // not a deadline problem — unreachable at all
}

function spawnState(level) {
  const spawnPlat = LEVELS.platforms(level)[0];
  const startKey = REACH.platformKeyUnder(level, spawnPlat[0], spawnPlat[1] - 12);
  // Snap the spawn x onto the 2px grid inside the spawn run (spawns are odd on
  // seven levels; an off-grid start state has no edges and the search dies).
  const runs = REACH.runsOf(level);
  const run = runs.find((r) => REACH.runKey(r) === startKey);
  let sx = Math.round(spawnPlat[0] / X_STEP) * X_STEP;
  if (sx < run.left) sx += X_STEP;
  if (sx > run.right) sx -= X_STEP;
  return { startKey, startX: sx };
}

function allOrders(level, gems) {
  const { startKey, startX } = spawnState(level);
  const names = ["a", "b", "c"];
  const perms = [];
  const perm = (arr, out) => {
    if (!arr.length) { perms.push(out.slice()); return; }
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      out.push(arr[i]); perm(rest, out); out.pop();
    }
  };
  perm([0, 1, 2], []);
  const rows = perms.map((p) => {
    const r = orderFeasible(level, gems, p, startKey, startX, 0);
    return {
      order: p.map((i) => names[i]).join(">"),
      feasible: r.feasible,
      portalAt: r.portalAt != null ? Math.round(r.portalAt) : null,
      times: r.collectTimes.map((t) => (t != null ? Math.round(t) : null)),
      deadlines: p.map((i) => Math.round(gemDeadline(gems[i][0], gems[i][1]))),
    };
  });
  rows.sort((a, b) => (b.feasible - a.feasible) || ((a.portalAt ?? 1e9) - (b.portalAt ?? 1e9)));
  return { startKey, startX, rows };
}

function main() {
  const gemsAll = loadGems();
  const args = process.argv.slice(2);
  if (args[0] === "--state") {
    // node route_clock.cjs --state LEVEL FLOORKEY X MF  [--remaining]
    const lv = Number(args[1]);
    const floorKey = args[2];
    const x = Number(args[3]);
    const mf = Number(args[4]);
    const gems = gemsAll[lv];
    const names = ["a", "b", "c"];
    const perms = [];
    const perm = (arr, out) => {
      if (!arr.length) { perms.push(out.slice()); return; }
      for (let i = 0; i < arr.length; i++) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        out.push(arr[i]); perm(rest, out); out.pop();
      }
    };
    perm([0, 1, 2], []);
    console.log(`state L${lv} ${floorKey} x=${x} mf=${mf}`);
    for (const p of perms) {
      const r = orderFeasible(lv, gems, p, floorKey, x, mf);
      console.log(`  ${r.feasible ? "ALIVE" : "DEAD "} ${p.map((i) => names[i]).join(">")} ` +
        `collect=${JSON.stringify(r.collectTimes.map((t) => t != null ? Math.round(t) : null))} ` +
        `portal=${r.portalAt != null ? Math.round(r.portalAt) : null}`);
    }
    return;
  }
  const levels = args.length ? args.map(Number) : Array.from({ length: 14 }, (_, i) => i);
  for (const lv of levels) {
    const gems = gemsAll[lv];
    if (!gems) continue;
    const t0 = Date.now();
    const { startKey, startX, rows } = allOrders(lv, gems);
    const feas = rows.filter((r) => r.feasible).length;
    console.log(`\nL${lv}  spawn=${startKey}@${startX}  gems=${JSON.stringify(gems)}  (${Date.now() - t0}ms)`);
    for (const r of rows) {
      const slacks = r.times.map((t, i) => (t != null ? r.deadlines[i] - t : "?"));
      console.log(
        `  ${r.feasible ? "OK  " : "DEAD"} ${r.order}  collect=${JSON.stringify(r.times)} ` +
        `deadline=${JSON.stringify(r.deadlines)} slack=${JSON.stringify(slacks)} ` +
        `portal=${r.portalAt}`
      );
    }
    console.log(`  => ${feas}/6 orderings feasible from spawn`);
  }
}

if (require.main === module) main();
module.exports = { gemDeadline, allOrders, orderFeasible, orderFeasibleN, deadMargin, spawnState, loadGems, stateSafe, buildCache };
