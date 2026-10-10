// L11 route census: gem_a (180,76) has NO holder (floats; collect mid-jump), so
// the exitDirection metric (distance to holder) is undefined here. Instead:
//  1. COLLECT platforms: for every L11 platform and every launch x on it, the
//     exact arc.simulate trace of jump/jump_left/jump_right. arc.simulate and
//     reachability.landingsFrom BOTH model the game's snap (full cat box vs
//     platform box at dy >= 0, apex frame included - updateCatSprite.ts), so no
//     separate apex-snap pass is needed (verified: no snap edge exists from the
//     loop floor to the collect floor at any launch x).
//     A platform COLLECTS gem_a if some action's traced arc passes the gem box
//     (16x16 centered on the spawn; cat box [x, x+1] x [y-h, y]).
//  2. For each Flash L11 decision on a loop floor with obj gem_a: BFS distance
//     (g4 edges) from the cat's floor to the nearest collect platform, and
//     whether any OFFERED move (menu keys in the archive) decreases that
//     distance - via its landing (simulate) or via an offered ascent/descent.
//   node experiments/l11_route_census.cjs
const fs = require("fs");
const { simulate } = require("../arc.cjs");
const REACH = require("../reachability.cjs");
const dec = require("../decision.cjs");
const GEM_A = require("./gem_table.cjs")()[11][0];

const LEVEL = 11, H = 18;
const touchesGem = (x, y) => Math.abs(x + 0.5 - GEM_A[0]) < 9 && y - H < GEM_A[1] + 8 && y > GEM_A[1] - 8;

// 1. collect platforms
const plats = REACH.runsOf(LEVEL); // merged floors: {y,left,right}
const collect = {}; // platformKey -> [actions]
for (const p of plats) {
  const key = REACH.platformKeyUnder(LEVEL, (p.left + p.right) / 2, p.y);
  const y = p.y;
  for (let x = Math.ceil(p.left); x <= Math.floor(p.right); x += 2) {
    for (const act of ["jump", "jump_left", "jump_right"]) {
      let hit = false;
      simulate(LEVEL, x, y, 0, H, act, 150, { grounded: true, onFrame: (fx, fy) => { if (touchesGem(fx, fy)) hit = true; } });
      if (hit) { (collect[key] = collect[key] || new Set()).add(act); }
    }
  }
}
console.log("collect platforms for gem_a:", Object.entries(collect).map(([k, s]) => `${k}:[${[...s].join(",")}]`).join(" "));

// 2. per-decision: distance to nearest collect platform, offered decreasing moves
const d = JSON.parse(fs.readFileSync(process.argv[2] || "../out/byom/PurpleMIST-Flash-1.0/s3/run_level_11_systemone.json", "utf8"));
const g4 = REACH.graph(LEVEL, H);
function bfsDist(edges, src, dsts) {
  const seen = new Set([src]); let f = [src], dep = 0;
  while (f.length) { dep++; const n = []; for (const k of f) for (const t of edges[k] || []) { if (dsts.has(t)) return dep; if (!seen.has(t)) { seen.add(t); n.push(t); } } f = n; }
  return Infinity;
}
const collectSet = new Set(Object.keys(collect));
const tally = { n: 0, dist: {}, decreasingOffered: 0, noDecrease: 0, complied: 0 };
for (const e of d.log) {
  if (!e.onPlatform || e.objective !== "gem_a") continue;
  const here = REACH.platformKeyUnder(LEVEL, e.cat.x, e.cat.y);
  if (!here) continue;
  tally.n++;
  const dist = bfsDist(g4.edges, here, collectSet);
  const db = dist === Infinity ? "inf" : dist;
  tally.dist[`${here}@${db}`] = (tally.dist[`${here}@${db}`] || 0) + 1;
  if (dist === 0 || dist === Infinity) continue;
  // does any offered move land strictly closer?
  const mf = e.movingFrames || 0;
  let dec_by = null;
  for (const act of Object.keys(e.moveProbs || {})) {
    if (act === "none") continue;
    const r = simulate(LEVEL, e.cat.x, e.cat.y, e.cat.dy || 0, H, act, mf, { grounded: !!e.onPlatform });
    if (r.outcome !== "landed") continue;
    const t = REACH.platformKeyUnder(LEVEL, r.x, r.y);
    if (!t || t === here) continue;
    if (bfsDist(g4.edges, t, collectSet) < dist) { dec_by = act; break; }
  }
  if (dec_by) {
    tally.decreasingOffered++;
    // compliance: did the archived move also decrease? (approximate: same key)
    const r2 = simulate(LEVEL, e.cat.x, e.cat.y, e.cat.dy || 0, H, e.move, mf, { grounded: true });
    if (r2.outcome === "landed") {
      const t2 = REACH.platformKeyUnder(LEVEL, r2.x, r2.y);
      if (t2 && bfsDist(g4.edges, t2, collectSet) < dist) tally.complied++;
    }
  } else tally.noDecrease++;
}
console.log("decisions:", tally.n, "| decreasingOffered:", tally.decreasingOffered, "complied:", tally.complied, "| noDecrease:", tally.noDecrease);
console.log("per floor (floor@bfs-dist-to-collect):", JSON.stringify(tally.dist, null, 0));
