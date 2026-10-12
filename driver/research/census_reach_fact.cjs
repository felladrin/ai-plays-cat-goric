"use strict";
// Census for the REACH_FACT predicate (docs/research/flash-l13-analysis.md): airborne
// decisions where EXACTLY ONE steering hold reaches the objective's collision box
// before landing or dying. Fire rate and COMPLIANCE (did the archived move take
// the reaching hold?), split by level, cleared/failed, and model. The predicate
// itself is decision.cjs reachHolds - one source of truth with the live gate.
//
//   node research/census_reach_fact.cjs
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const OUT = path.resolve(__dirname, "..", "..", "out");
// Optional filters: node research/census_reach_fact.cjs [level] [endpoint-substring]
const ONLY_LEVEL = process.argv[2] != null ? +process.argv[2] : null;
const ONLY_EP = process.argv[3] || null;
const archives = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) archives.push(p);
  }
})(OUT);
if (ONLY_EP !== null || ONLY_LEVEL !== null) {
  for (let i = archives.length - 1; i >= 0; i--) {
    if (ONLY_EP !== null && !archives[i].includes(ONLY_EP)) { archives.splice(i, 1); continue; }
    if (ONLY_LEVEL !== null && !new RegExp(`run_level_${ONLY_LEVEL}_`).test(archives[i])) archives.splice(i, 1);
  }
}

function endpointName(arch) {
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}

const GEM_SPAWNS = [
  [[66,235],[112,195],[160,165]],
  [[76,215],[121,140],[254,215]],
  [[180,188],[260,189],[90,188]],
  [[186,118],[216,103],[242,119]],
  [[289,156],[105,164],[182,226]],
  [[81,71],[260,147],[170,71]],
  [[135,143],[225,181],[221,108]],
  [[52,159],[139,269],[142,68]],
  [[74,231],[123,198],[301,251]],
  [[66,235],[112,101],[202,101]],
  [[229,123],[253,91],[287,68]],
  [[180,76],[180,110],[191,212]],
  [[279,169],[43,129],[207,203]],
  [[129,200],[72,152],[180,51]],
];
const PORTAL = { x: 180, y: 150 };

function evaluate(e, level) {
  if (e.onPlatform) return { reason: "grounded" };
  // A menu with one option is not a choice: the archived moveProbs are a softmax
  // over the offered options, and PRUNE_FATAL had already deleted the others -
  // compliance is meaningless there (the L13 lesson: {"right":1} at steps
  // 2144/2162 was a one-option menu, not a refusal).
  if (e.moveProbs && Object.keys(e.moveProbs).length <= 1) return { reason: "singleOptionMenu" };
  const objName = e.objective;
  let gx, gy;
  if (/^gem_[abc]$/.test(objName)) {
    const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[objName];
    gx = GEM_SPAWNS[level][idx][0]; gy = GEM_SPAWNS[level][idx][1];
  } else if (objName === "portal") {
    gx = PORTAL.x; gy = PORTAL.y;
  } else {
    return { reason: "waypoint" };
  }
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const snap = {
    level, onPlatform: false, gemsCollected: e.gemsCollected,
    cat: { x: e.cat.x, y: e.cat.y, dy: e.cat.dy || 0, height: e.cat.h || 18 },
  };
  const r = dec.reachHolds(snap, objName, gx, gy, mf);
  if (!r.fire) return r;
  // Airborne jump_* is steering (the HOLD_FIX semantics in arc.cjs).
  const map = { jump_left: "left", jump_right: "right", jump: "none" };
  const held = map[e.move] || e.move;
  return { fire: true, hold: r.hold, frames: r.frames, comply: held === r.hold };
}

const per = {}; // `${level}:${cleared}` -> {total, air, fire, comply}
const reason = {};
// Blast radius of the PRUNE_FATAL portal bug: airborne gc>=3 decisions where some
// hold crosses the portal box (dec.reachHolds traces) but NO reaching hold was
// on the offered menu (moveProbs keys). The runner deleted a winning move.
const pruned = {}; // `${level}:${endpoint}` -> {n, steps:[]}
for (const arch of archives) {
  let d;
  try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length) continue;
  const level = d.levelIndex;
  const cleared = !!(d.sawAdvance || d.won);
  const key = `${level}:${cleared}`;
  if (!per[key]) per[key] = { total: 0, air: 0, fire: 0, comply: 0, endpoint: endpointName(arch) };
  for (const e of d.log) {
    per[key].total++;
    if (!e.onPlatform) per[key].air++;
    if (!e.onPlatform && e.gemsCollected >= 3) {
      const mf = e.movingFrames != null ? e.movingFrames : 0;
      const rs = dec.reachHolds({
        level, onPlatform: false, gemsCollected: e.gemsCollected,
        cat: { x: e.cat.x, y: e.cat.y, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      }, "portal", PORTAL.x, PORTAL.y, mf);
      const reaching = rs.results ? Object.entries(rs.results).filter(([, v]) => v.frames).map(([k]) => k) : [];
      const offered = e.moveProbs ? Object.keys(e.moveProbs) : [];
      if (reaching.length && !reaching.some((k) => offered.includes(k))) {
        const pk = `${level}:${endpointName(arch)}`;
        if (!pruned[pk]) pruned[pk] = { n: 0, steps: [] };
        pruned[pk].n++;
        if (pruned[pk].steps.length < 6) pruned[pk].steps.push(e.step);
      }
    }
    const r = evaluate(e, level);
    if (r.reason) { reason[r.reason] = (reason[r.reason] || 0) + 1; continue; }
    per[key].fire++;
    reason.fired = (reason.fired || 0) + 1;
    if (r.comply) per[key].comply++;
  }
}

const tot = Object.values(per).reduce((a, f) => a + f.total, 0);
console.log(`archives: ${archives.length}, decisions: ${tot}`);
console.log("reason tallies:", JSON.stringify(reason));
console.log("");
console.log("level | cleared: fire/total (comply%) | failed: fire/total (comply%)");
for (let lvl = 0; lvl < 14; lvl++) {
  for (const ok of [true, false]) {
    const f = per[`${lvl}:${ok}`];
    if (!f) continue;
    const rate = f.total ? (100 * f.fire / f.total).toFixed(1) : "-";
    const comp = f.fire ? (100 * f.comply / f.fire).toFixed(1) : "-";
    console.log(`${String(lvl).padStart(5)} | ${ok ? "" : "     "}${String(f.fire).padStart(4)}/${String(f.total).padStart(5)} (${rate.padStart(5)}%) comply=${comp.padStart(5)}% [${f.endpoint}]`);
  }
}
console.log("");
console.log("by endpoint:");
const byEp = {};
for (const f of Object.values(per)) {
  if (!byEp[f.endpoint]) byEp[f.endpoint] = { total: 0, fire: 0, comply: 0 };
  byEp[f.endpoint].total += f.total; byEp[f.endpoint].fire += f.fire; byEp[f.endpoint].comply += f.comply;
}
for (const [ep, s] of Object.entries(byEp)) {
  const rate = s.total ? (100 * s.fire / s.total).toFixed(1) : "-";
  const comp = s.fire ? (100 * s.comply / s.fire).toFixed(1) : "-";
  console.log(`  ${ep.padEnd(30)} ${String(s.fire).padStart(5)}/${String(s.total).padStart(6)} (${rate.padStart(5)}%) comply=${comp.padStart(5)}%`);
}
console.log("");
console.log("pruned portal-reaching holds (blast radius of the PRUNE_FATAL bug):");
let prunedTotal = 0;
for (const [k, v] of Object.entries(pruned)) {
  prunedTotal += v.n;
  console.log(`  L${k.padEnd(36)} ${String(v.n).padStart(3)} decisions, steps [${v.steps.join(",")}${v.n > v.steps.length ? ",..." : ""}]`);
}
console.log(`  TOTAL: ${prunedTotal}`);
