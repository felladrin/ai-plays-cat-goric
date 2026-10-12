// FLOAT_EXIT census: dec.floatExit over every archived decision (single source
// of truth: the predicate lives in decision.cjs). Fire = all shortest routes to
// the floating gem's COLLECT platforms leave one side, opposite the gem's
// bearing. Compliance = archived move headed to the exit side (walk or jump).
// One-option menus (moveProbs keys <= 1) are excluded from compliance: a
// one-option menu is not a choice (L13 portal-prune lesson).
//   node research/census_float_exit.cjs            -> full table
//   node research/census_float_exit.cjs --dump <level> <ep-substr> <n>
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const GEMS = require("./gem_table.cjs")();
const ROOT = path.resolve(__dirname, "..", "..");

const DUMP = process.argv[2] === "--dump" ? { level: +process.argv[3], ep: process.argv[4], n: +process.argv[5] } : null;
const archives = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) archives.push(p);
  }
})(path.join(ROOT, "out"));

function endpointName(arch) {
  const m = arch.match(/run_level_(\d+)_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\/([^/]+)\//);
  const ep = m ? m[2] : "?";
  return byom ? `${byom[1]}/${byom[2]}` : ep;
}
function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}
// The FLOAT_EXIT predicate (docs/research/flash-l10-l12-analysis.md): the holderless
// sibling of exitDirection. A floating gem (no platform under its spawn - L11's
// gem_a at (180,76)) is collected from the AIR: the target is not a holder but
// the set of platforms from which some jump's traced arc passes the gem's box
// (the COLLECT platforms). Same route machinery as exitDirection - descent
// landings + exact jump arcs, BFS over g4 to the target set - fire iff all
// shortest routes leave on one side and that side is opposite the gem's
// horizontal bearing. Exported for the census; NO prompt wiring until the
// census passes the EXIT_FACT bar (zero-fire on clearing levels).
const floatCollectCache = new Map();
function floatCollectPlatforms(level, gx, gy, h) {
  const ck = `${level}:${gx},${gy}:${h}`;
  if (floatCollectCache.has(ck)) return floatCollectCache.get(ck);
  const REACH = require("../reachability.cjs");
  const { simulate } = require("../arc.cjs");
  const set = new Set();
  // Game boxes (read from source, same convention as reachHolds): cat column
  // [cx, cx+1] x [cy-h, cy]; gem 16x16 centred on the spawn.
  const hit = (cx, cy) => cx < gx + 8 && cx + 1 > gx - 8 && cy - h < gy + 8 && cy > gy - 8;
  for (const p of REACH.runsOf(level)) {
    const key = REACH.platformKeyUnder(level, (p.left + p.right) / 2, p.y);
    if (!key) continue;
    for (let x = Math.ceil(p.left); x <= Math.floor(p.right); x += 2) {
      for (const act of ["jump", "jump_left", "jump_right"]) {
        let touch = false;
        simulate(level, x, p.y, 0, h, act, 150, { grounded: true, onFrame: (fx, fy) => { if (hit(fx, fy)) touch = true; } });
        if (touch) { set.add(key); break; }
      }
      if (set.has(key)) break;
    }
  }
  floatCollectCache.set(ck, set);
  return set;
}

function bfsDistToSet(edges, src, targets) {
  if (targets.has(src)) return 0;
  const seen = new Set([src]);
  let frontier = [src];
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const k of frontier)
      for (const t of edges[k] || []) {
        if (targets.has(t)) return d;
        if (!seen.has(t)) { seen.add(t); next.push(t); }
      }
    frontier = next;
  }
  return null;
}

function floatExit(snap, levelGems, objName, objX, objY, mf) {
  const REACH = require("../reachability.cjs");
  if (!snap.onPlatform) return { reason: "notGrounded" };
  if (!/^gem_[abc]$/.test(objName)) return { reason: "notGem" };
  const catX = snap.cat.x, catY = snap.cat.y, h = snap.cat.height || 18;
  const here = REACH.platformKeyUnder(snap.level, catX, catY);
  if (!here) return { reason: "noFloor" };
  if (REACH.platformHolding(snap.level, objX, objY)) return { reason: "hasHolder" }; // exitDirection's job
  const collect = floatCollectPlatforms(snap.level, objX, objY, h);
  if (!collect.size) return { reason: "unreachable" };
  if (collect.has(here)) return { reason: "collectFromHere" };
  const g4 = REACH.graph(snap.level, h);
  const distOf = (lk) => {
    const d = bfsDistToSet(g4.edges, lk, collect);
    return d == null ? Infinity : 1 + d;
  };
  const routes = [];
  for (const p of dec.descentPoints(snap, levelGems)) {
    const side = p.name.endsWith("left") ? "left" : "right";
    const lands = (p.lands || []).filter((k) => k !== here);
    if (!lands.length) continue;
    let dMax = 0;
    for (const lk of lands) {
      const d = distOf(lk);
      if (d === Infinity) { dMax = Infinity; break; }
      dMax = Math.max(dMax, d);
    }
    if (Number.isFinite(dMax)) routes.push({ side, d: dMax, lands });
  }
  for (const act of ["jump_left", "jump_right"]) {
    const r = require("../arc.cjs").simulate(snap.level, catX, catY, 0, h, act, mf, { grounded: true });
    if (r.outcome !== "landed") continue;
    const t = REACH.platformKeyUnder(snap.level, r.x, r.y);
    if (!t || t === here) continue;
    const d = distOf(t);
    if (Number.isFinite(d)) routes.push({ side: act === "jump_left" ? "left" : "right", d, lands: [t] });
  }
  if (!routes.length) return { reason: "noExits" };
  const minD = Math.min(...routes.map((x) => x.d));
  const sides = new Set(routes.filter((x) => x.d === minD).map((x) => x.side));
  if (sides.size > 1) return { reason: "exitsAmbiguous" };
  const side = [...sides][0];
  const dirToObj = objX > catX ? "right" : objX < catX ? "left" : null;
  if (dirToObj === null || dirToObj === side) return { reason: "sideMatchesDir" };
  return { fire: true, side, dirToObj, routes };
}

function evaluate(e, level) {
  const m = /^gem_([abc])$/.exec(e.objective || "");
  if (!m) return { reason: "notGem" };
  const idx = { a: 0, b: 1, c: 2 }[m[1]];
  const [gx, gy] = GEMS[level][idx];
  const snap = {
    level, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: dronesAt(e.movingFrames || 0),
  };
  const r = floatExit(snap, GEMS[level], e.objective, gx, gy, e.movingFrames || 0);
  if (!r.fire) return r;
  const single = Object.keys(e.moveProbs || {}).length <= 1;
  const comply = (r.side === "left" && (e.move === "left" || e.move === "jump_left"))
    || (r.side === "right" && (e.move === "right" || e.move === "jump_right"));
  return { ...r, comply, single };
}

if (DUMP) {
  let printed = 0;
  for (const arch of archives) {
    if (printed >= DUMP.n) break;
    if (!endpointName(arch).includes(DUMP.ep)) continue;
    let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
    if (!d.log?.length || d.levelIndex !== DUMP.level) continue;
    for (const e of d.log) {
      if (printed >= DUMP.n) break;
      const r = evaluate(e, d.levelIndex);
      if (!r.fire) continue;
      console.log(`\n--- ${path.relative(ROOT, arch)} cleared=${!!(d.sawAdvance || d.won)} ---`);
      console.log(`step ${e.step} cat (${e.cat.x},${e.cat.y}) mf ${e.movingFrames} obj ${e.objective} move=${e.move} probs=${JSON.stringify(e.moveProbs)}`);
      console.log(`D=${r.side} dirToObj=${r.dirToObj} comply=${r.comply}${r.single ? " [single-option menu, excluded]" : ""}`);
      console.log(`routes: ${r.routes.map((x) => `${x.side} d=${x.d}`).join(" | ")}`);
      printed++;
    }
  }
  console.log(`\nprinted ${printed}`);
  process.exit(0);
}

const fire = {}, reason = {};
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (!d.log?.length) continue;
  const key = `${d.levelIndex}:${!!(d.sawAdvance || d.won)}`;
  if (!fire[key]) fire[key] = { total: 0, fire: 0, comply: 0, single: 0, ep: endpointName(arch) };
  for (const e of d.log) {
    fire[key].total++;
    const r = evaluate(e, d.levelIndex);
    if (!r.fire) { reason[r.reason] = (reason[r.reason] || 0) + 1; continue; }
    fire[key].fire++;
    if (r.single) fire[key].single++;
    else if (r.comply) fire[key].comply++;
  }
}
const tot = Object.values(fire).reduce((a, f) => a + f.total, 0);
console.log(`archives: ${archives.length}, decisions: ${tot}`);
console.log("reasons:", JSON.stringify(reason));
console.log("\nlevel | cleared/failed: fire/total (comply%, singleOpt) [endpoint]");
for (let lvl = 0; lvl < 14; lvl++)
  for (const ok of [true, false]) {
    const f = fire[`${lvl}:${ok}`];
    if (!f || !f.fire) continue;
    const comp = f.fire - f.single ? (100 * f.comply / (f.fire - f.single)).toFixed(0) : "-";
    console.log(`${String(lvl).padStart(2)} ${ok ? "CLEARED" : "failed "} ${String(f.fire).padStart(4)}/${String(f.total).padStart(5)} comply=${comp}% singleOpt=${f.single} [${f.ep}]`);
  }
const byEp = {};
for (const [k, f] of Object.entries(fire)) {
  const ep = f.ep;
  (byEp[ep] = byEp[ep] || { fire: 0, total: 0, lvl: +k.split(":")[0] });
  byEp[ep].fire += f.fire; byEp[ep].total += f.total;
}
console.log("\nby endpoint:");
for (const [ep, s] of Object.entries(byEp)) if (s.fire) console.log(`  ${ep}: ${s.fire}/${s.total}`);
