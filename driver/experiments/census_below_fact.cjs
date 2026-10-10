"use strict";
// BELOW_FACT census: grounded decision where the TARGET (objective gem, or the
// portal when gc>=3) lies BELOW the cat's floor and its x is INSIDE the floor's
// span - the target is under the floor, so only stepping off an end can reach it
// and the horizontal bearing (0px-ish) is a trap. Same shape as the L12 @125
// pacing floor and the L13 endgame dither.
//
// Reports per level x outcome x endpoint: fire rate, the move mix at firing
// states (heading to an end vs pacing), compliance with an end that leads down
// (exitDirection v1.1 names the side; exitsAmbiguous means either end), and the
// overlap with EXIT_FACT v1.1 firings (does v1.1 already cover it?).
//
//   node experiments/census_below_fact.cjs
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const dec = require("../decision.cjs");
const REACH = require("../reachability.cjs");

const GEM_SPAWNS = [
  [[66,235],[112,195],[160,165]],[[76,215],[121,140],[254,215]],[[180,188],[260,189],[90,188]],
  [[186,118],[216,103],[242,119]],[[289,156],[105,164],[182,226]],[[81,71],[260,147],[170,71]],
  [[135,143],[225,181],[221,108]],[[52,159],[139,269],[142,68]],[[74,231],[123,198],[301,251]],
  [[66,235],[112,101],[202,101]],[[229,123],[253,91],[287,68]],[[180,76],[180,110],[191,212]],
  [[279,169],[43,129],[207,203]],[[129,200],[72,152],[180,51]],
];
const PORTAL = { x: 180, y: 150 };
const KEYRE = /^floor\((-?\d+)\.\.(-?\d+)@(-?\d+)\)$/;

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p);
  }
})(CFG.OUT_DIR);

function endpointName(arch) {
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}

// tally key: `${level}|${cleared}|${endpoint}` -> stats
const T = {};
let fired = 0, total = 0;
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length || !GEM_SPAWNS[d.levelIndex]) continue;
  const level = d.levelIndex;
  const cleared = !!(d.sawAdvance || d.won);
  const ep = endpointName(f);
  const key = `${level}|${cleared}|${ep}`;
  if (!T[key]) T[key] = { total: 0, fired: 0, toEnd: 0, pace: 0, jumpOrNone: 0, comply: 0, v11fire: 0, v11side: 0, descentObj: 0 };
  for (const e of d.log) {
    if (!e.onPlatform || !e.cat) continue;
    const here = REACH.platformKeyUnder(level, e.cat.x, e.cat.y);
    if (!here) continue;
    const hm = KEYRE.exec(here);
    if (!hm) continue;
    const [, fl, fr, fy] = hm.map(Number);
    // target
    let tx, ty;
    if (/^gem_[abc]$/.test(e.objective)) { const i = { gem_a: 0, gem_b: 1, gem_c: 2 }[e.objective]; [tx, ty] = GEM_SPAWNS[level][i]; }
    else if (e.objective === "portal" && e.gemsCollected >= 3) { tx = PORTAL.x; ty = PORTAL.y; }
    else continue;
    total++;
    const st = T[key]; st.total++;
    // BELOW + inside span
    const holder = e.objective === "portal" ? null : REACH.platformHolding(level, tx, ty);
    const holderY = e.objective === "portal" ? ty : (holder ? parseFloat(holder.slice(holder.lastIndexOf("@") + 1)) : null);
    if (holderY == null || holderY <= fy) continue; // not below
    if (tx < fl || tx > fr) continue;              // not under this floor
    st.fired++; fired++;
    if (/^descent_/.test(e.objective)) st.descentObj++;
    // move classification
    const m = e.move;
    if (m === "left" || m === "right") {
      // "pacing in the middle" = heading AWAY from both ends is impossible on a
      // floor; heading to an end = moving toward the nearer... classify by
      // whether the move carries the cat toward AN END that leads down.
      const mv = m; // toward left or right end
      st.toEnd++;
      // v1.1 overlap
      const mf = e.movingFrames || 0, dd = 0.2 * mf, h = e.cat.h || 18;
      const snap = {
        level, onPlatform: true, gemsCollected: e.gemsCollected, gemPositions: e.gemPositions || [],
        cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 0, height: h },
        drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
      };
      let r; try { r = dec.exitDirection(snap, GEM_SPAWNS[level], e.objective, tx, ty, mf, "v1.1"); } catch { r = {}; }
      if (r && r.fire) { st.v11fire++; st.v11side++; if (r.side === mv) st.comply++; }
      else if (r && r.reason === "exitsAmbiguous") { st.v11fire++; st.comply++; } // either end leads down
    } else { st.jumpOrNone++; }
  }
}

console.log(`decisions with a below-and-inside target: ${fired} of ${total} (${(100 * fired / total).toFixed(1)}%)`);
console.log("level | cleared | endpoint | fired/total | move: toEnd / jumpOrNone | descent-as-obj | v1.1 overlap | comply(v1.1 side or either)");
for (const [k, s] of Object.entries(T).sort()) {
  if (!s.fired) continue;
  const [level, cleared, ep] = k.split("|");
  const rate = (100 * s.fired / s.total).toFixed(1);
  const comp = s.toEnd ? (100 * s.comply / s.toEnd).toFixed(1) : "-";
  const ov = s.fired ? (100 * s.v11fire / s.fired).toFixed(1) : "-";
  console.log(`${level.padStart(3)} | ${cleared === "true" ? "W" : "L"} | ${ep.padEnd(30)} | ${String(s.fired).padStart(4)}/${String(s.total).padStart(5)} (${rate.padStart(5)}%) | ${String(s.toEnd).padStart(4)} / ${String(s.jumpOrNone).padStart(4)} | ${String(s.descentObj).padStart(3)} | ${ov.padStart(5)}% | ${comp.padStart(5)}%`);
}
