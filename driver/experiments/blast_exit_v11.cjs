"use strict";
// Blast-radius differential: EXIT_FACT v1 vs v1.1 (v1.1 = v1 minus descent exits
// whose exact step-off lands on a HIGHER floor - the up-snap). v1.1 may only
// REMOVE a v1 firing (or move it to the other side); every diff must be
// explained by the exact step-off from just past the v1-named edge landing
// above the cat's floor. Run: node experiments/blast_exit_v11.cjs
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const dec = require("../decision.cjs");
const REACH = require("../reachability.cjs");
const { simulate } = require("../arc.cjs");

const GEM_SPAWNS = [
  [[66,235],[112,195],[160,165]],[[76,215],[121,140],[254,215]],[[180,188],[260,189],[90,188]],
  [[186,118],[216,103],[242,119]],[[289,156],[105,164],[182,226]],[[81,71],[260,147],[170,71]],
  [[135,143],[225,181],[221,108]],[[52,159],[139,269],[142,68]],[[74,231],[123,198],[301,251]],
  [[66,235],[112,101],[202,101]],[[229,123],[253,91],[287,68]],[[180,76],[180,110],[191,212]],
  [[279,169],[43,129],[207,203]],[[129,200],[72,152],[180,51]],
];
const PORTAL = { x: 180, y: 150 };

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p);
  }
})(CFG.OUT_DIR);

// Does the exact step-off (held toward the edge from just past it) land HIGHER?
function stepOffLandsHigher(level, catY, h, here, edgeX, side, mf) {
  const step = side === "left" ? -0.25 : 0.25;
  let ex = null;
  for (let x = edgeX + step; Math.abs(x - edgeX) <= 8; x += step) {
    if (REACH.platformKeyUnder(level, x, catY) !== here) { ex = x; break; }
  }
  if (ex == null) return false;
  const r = simulate(level, ex, catY, 0, h, side, mf, { grounded: false });
  if (r.outcome !== "landed") return false;
  const t = REACH.platformKeyUnder(level, r.x, r.y);
  if (!t || t === here) return false;
  return parseFloat(t.slice(t.lastIndexOf("@") + 1)) < catY;
}

let n = 0, diffs = 0, explained = 0;
const unexplained = [];
const perLevel = {};
const cats = {}; // level -> {removed, added, sideChanged}
function cat(level) { return cats[level] || (cats[level] = { removed: 0, added: 0, sideChanged: 0 }); }
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length || !GEM_SPAWNS[d.levelIndex]) continue;
  for (const e of d.log) {
    if (!e.onPlatform || !e.cat) continue;
    const obj = e.objective;
    let ox, oy;
    if (/^gem_[abc]$/.test(obj)) { const i = { gem_a: 0, gem_b: 1, gem_c: 2 }[obj]; ox = GEM_SPAWNS[d.levelIndex][i][0]; oy = GEM_SPAWNS[d.levelIndex][i][1]; }
    else if (obj === "portal" && e.gemsCollected >= 3) { ox = PORTAL.x; oy = PORTAL.y; }
    else continue;
    const mf = e.movingFrames || 0, dd = 0.2 * mf, h = e.cat.h || 18;
    const snap = {
      level: d.levelIndex, onPlatform: true, gemsCollected: e.gemsCollected,
      gemPositions: e.gemPositions || [],
      cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 0, height: h },
      drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
    };
    let r1, r11;
    try {
      r1 = dec.exitDirection(snap, GEM_SPAWNS[d.levelIndex], obj, ox, oy, mf, "v1");
      r11 = dec.exitDirection(snap, GEM_SPAWNS[d.levelIndex], obj, ox, oy, mf, "v1.1");
    } catch { continue; }
    n++;
    const s1 = r1 && r1.fire ? r1.side : "-";
    const s11 = r11 && r11.fire ? r11.side : "-";
    if (s1 === s11) continue;
    diffs++;
    perLevel[d.levelIndex] = (perLevel[d.levelIndex] || 0) + 1;
    if (s1 === "-") cat(d.levelIndex).added++;
    else if (s11 === "-") cat(d.levelIndex).removed++;
    else cat(d.levelIndex).sideChanged++;
    if (s1 === "-") {
      // v1 silent (ambiguous pair) -> v1.1 fires: explained if the OTHER side's
      // step-off lands higher, i.e. v1.1 dropped the up-snap half of the pair.
      const here = REACH.platformKeyUnder(d.levelIndex, e.cat.x, e.cat.y);
      const other = s11 === "left" ? "right" : "left";
      const dpO = dec.descentPoints(snap, GEM_SPAWNS[d.levelIndex]).find((p) => p.name === `descent_${other}`);
      if (r1 && r1.reason === "exitsAmbiguous" && dpO && stepOffLandsHigher(d.levelIndex, e.cat.y, h, here, dpO.x, other, mf)) explained++;
      else if (unexplained.length < 5) unexplained.push(`${path.basename(f)} step ${e.step}: v1 silent (${r1 && r1.reason}) but v1.1 fires ${s11} - not an ambiguity collapse`);
      continue;
    }
    // Explain via the v1-named side's descent edge x (same source exitDirection used).
    const here = REACH.platformKeyUnder(d.levelIndex, e.cat.x, e.cat.y);
    const dp = dec.descentPoints(snap, GEM_SPAWNS[d.levelIndex]).find((p) => p.name === `descent_${s1}`);
    if (dp && stepOffLandsHigher(d.levelIndex, e.cat.y, h, here, dp.x, s1, mf)) explained++;
    else if (unexplained.length < 5) unexplained.push(`${path.basename(f)} step ${e.step} cat (${e.cat.x},${e.cat.y}) obj ${obj}: v1=${s1} v1.1=${s11} NOT explained by up-snap`);
  }
}
console.log(`compared ${n}, v1-vs-v1.1 firing diffs ${diffs}, explained by up-snap ${explained}, per level ${JSON.stringify(perLevel)}`);
console.log("per level (removed/added/sideChanged):", JSON.stringify(cats));
for (const u of unexplained) console.log("  " + u);
