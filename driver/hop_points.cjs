"use strict";
// Reachable platforms ABOVE the cat's floor, offered as selectable objectives.
// The mirror of descentPoints, which offers the floor's ends when an objective is
// below.
//
// MEASURED, do not widen without re-measuring. Generalising this to "any reachable
// neighbouring platform, level or above" was tried, to give level 4 a name for the
// same-height hop that is the only route to its gem_a. It cost two working levels
// and bought nothing:
//
//   level | narrow (above only)        | widened (level or above)
//   ------|----------------------------|--------------------------
//     2   | cleared, 2 deaths, 126 dec | FAILED, 6 deaths, 258 dec
//     3   | cleared, 3 deaths, 178 dec | FAILED, 13 deaths, 454 dec
//     4   | failed                     | failed, hop offered 82x, chosen 0x
//
// The cause is menu crowding: the narrow gate fires only when an objective is
// above, the wide one fires whenever anything is off-floor, so levels 2 and 3 got
// extra entries in far more situations and the objective classification degraded.
// Level 4 never selected the entry it was given, so the vocabulary was not its
// blocker.
const CFG = require("./physics.cjs");
const LEVELS = require("./level_data.cjs");
const { simulate } = require("./arc.cjs");

const SAME_FLOOR_Y = 40; // an objective within this of the floor, over its span, is "on this floor"

function floorRun(plats, edgesOf, cx, cy, Y_TOL = 14) {
  let cur = null;
  for (const p of plats) {
    const e = edgesOf(p[0]);
    if (cx >= e.left && cx <= e.right && Math.abs(p[1] - cy) <= Y_TOL) { cur = p; break; }
  }
  if (!cur) return null;
  const curY = cur[1];
  const sameY = plats.filter((p) => p[1] === curY).map((p) => edgesOf(p[0])).sort((a, b) => a.left - b.left);
  const runs = [];
  for (const e of sameY) {
    if (runs.length && e.left <= runs[runs.length - 1].right) runs[runs.length - 1].right = Math.max(runs[runs.length - 1].right, e.right);
    else runs.push({ left: e.left, right: e.right });
  }
  return { run: runs.find((r) => cx >= r.left && cx <= r.right) || runs[0], curY };
}

// Scan the current floor run for held jumps that land on a STRICTLY higher
// platform (the same landing filter hopPoints applies). Used by platformMap to
// name the escape floor when both descent ends are dead (Claude round-2, 2026-09-25):
// the both-ends-dead negative is only truthful if the floor is actually escapable,
// and on the y=171 floor of level 4 the model answered 'left' (into the void) to
// a pure negative because nothing named the one thing it could do instead.
function higherLandings(level, run, curY, height, edgesOf, minJumpY = 1, catX = null) {
  const plats = LEVELS.platforms(level);
  const found = new Map();
  for (let x = run.left; x <= run.right; x += 2) {
    for (const act of ["jump_left", "jump", "jump_right"]) {
      const r = simulate(level, x, curY, 0, height, act, minJumpY, { grounded: true });
      if (r.outcome !== "landed") continue;
      const landed = plats.find((p) => Math.abs(p[1] - r.y) < 0.01 && r.x >= edgesOf(p[0]).left - 1 && r.x <= edgesOf(p[0]).right + 1);
      if (!landed) continue;
      if (landed[1] === curY && landed[0] >= run.left && landed[0] <= run.right) continue;
      if (landed[1] >= curY - 20) continue; // strictly higher only
      const key = `${landed[0]},${landed[1]}`;
      const side = landed[0] < run.left ? "left" : "right";
      const dir = act === "jump_left" ? "left" : act === "jump_right" ? "right" : "straight up";
      // Claude r4: nearest launch x to the CAT per side, not the leftmost one the
      // scan meets first. On L4's y=171 floor the window is 263..284 and the cat
      // stands at 289; naming 263 said "walk 26px" while naming 284 says "walk
      // 5px" and matches the escape clause to the walk-then-jump the cat can make.
      const anchor = catX != null ? catX : run.left;
      const got = found.get(side);
      if (!got || Math.abs(x - anchor) < Math.abs(got.x - anchor)) found.set(side, { plat: landed, x, dir });
    }
  }
  return found;
}

// objectives: [{x, y}] still worth going to. edgesOf: platformEdges from decision.cjs.
function hopPoints(snap, objectives, edgesOf) {
  if (!snap.onPlatform) return [];
  const plats = LEVELS.platforms(snap.level);
  const f = floorRun(plats, edgesOf, snap.cat.x, snap.cat.y);
  if (!f) return [];
  const { run, curY } = f;

  // General gate: is anything still worth reaching that is NOT on this floor?
  //
  // Deliberately NOT "and not below it". That tighter gate was tried and it made
  // level 4's gem_a unreachable: the gem sits BELOW this floor, but the only route
  // to it runs through a platform at the SAME height across a 52px gap. Routes are
  // indirect, so the gate cannot key on where the objective sits. The cost is that
  // an upward hop is sometimes offered when everything remaining is below; the cat
  // can ignore it, and a noisy menu entry is a far smaller harm than a gem no
  // sequence of actions can reach.
  const worthHopping = objectives.some((o) => o.y < curY - 20);
  if (!worthHopping) return [];

  const h = snap.cat.height;
  if (!h) throw new Error("hopPoints: snap.cat.height missing; harness is broken");
  const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;

  const found = new Map();
  for (let x = run.left; x <= run.right; x += 2) {
    for (const act of ["jump_left", "jump", "jump_right"]) {
      const r = simulate(snap.level, x, curY, 0, h, act, mf, { grounded: true });
      if (r.outcome !== "landed") continue;
      // Any platform that is not part of the floor we are standing on -- higher,
      // level, or lower. Landing back on our own run is not a hop.
      const landed = plats.find((p) => Math.abs(p[1] - r.y) < 0.01 && r.x >= edgesOf(p[0]).left - 1 && r.x <= edgesOf(p[0]).right + 1);
      if (!landed) continue;
      if (landed[1] === curY && landed[0] >= run.left && landed[0] <= run.right) continue;
      // LEVEL OR ABOVE only. Going down off the ends of this floor is what
      // descentPoints already offers; duplicating it here just crowds the menu,
      // and on level 4 it actively hid the hop that mattered: from x=121 the
      // nearest landing is the platform 148px BELOW, so the same-height platform
      // that is the only route to gem_a never made the one-per-side cut.
      if (landed[1] >= curY - 20) continue;
      const key = `${landed[0]},${landed[1]}`;
      const dist = Math.abs(x - snap.cat.x);
      const got = found.get(key);
      if (!got || dist < got.dist) found.set(key, { plat: landed, launchX: x, landX: r.x, dist });
    }
  }
  if (!found.size) return [];

  const pts = [];
  for (const side of ["left", "right"]) {
    const cands = [...found.values()].filter((c) => (side === "left" ? c.plat[0] < snap.cat.x : c.plat[0] >= snap.cat.x));
    if (!cands.length) continue;
    cands.sort((a, b) => a.dist - b.dist);
    const best = cands[0];
    const e = edgesOf(best.plat[0]);
    const dy = curY - best.plat[1];
    const rel = dy > 5 ? `${Math.round(dy)}px above this floor`
      : dy < -5 ? `${Math.round(-dy)}px below this floor`
      : "level with this floor";
    pts.push({
      name: `ascent_${side}`,
      x: best.landX,
      y: best.plat[1],
      launchX: best.launchX,
      label: `${side} ascent point: the platform at x ${Math.round(e.left)}..${Math.round(e.right)}, y ${best.plat[1]} (${rel}), reachable by jumping ${side} from around x ${Math.round(best.launchX)}`,
    });
  }
  return pts;
}

module.exports = { hopPoints, higherLandings };
