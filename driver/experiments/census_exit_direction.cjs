#!/usr/bin/env node
// Census for the "exit-direction" move-prompt predicate (Flash L2 hypothesis).
//
// The paired comparison (Darwin vs Flash, L2 s1): identical state at step 54
// (cat (87.25,64) on floor(74..286@64), objective gem_c at (90,188) below, all
// three gems below), identical prompt, Darwin moves `left` 0.89, Flash `right`
// 0.84. The prompt says "gem_c: 3px right, 124px down" and Flash follows the 3px
// horizontal; the only way down is off the floor's ends.
//
// THE PREDICATE (fires on a grounded decision), see evaluate():
//   routes to the objective's holder are descents (walk off a floor end;
//   descentPoints' `lands`) and the two EXACT arcs from the cat's position
//   (arc.simulate jump_left / jump_right at the archived laser state). Route
//   length = 1 + BFS from the landing to the holder; own-floor landings
//   dropped. FIRE iff every minimum-length route is on ONE side and that side
//   is OPPOSITE the horizontal direction from the cat to the objective.
//   (landingsFrom's band envelope is NOT used: it over-claims through the
//   cat's own floor and makes a gem below the cat reachable from both sides.)
//
// Drone corners are reconstructed from movingFrames as probe.cjs dronesAt(F)
// (verified against the live replay dump at mf=273, out/run_level_6_replay.json:
// tl={0,55.6} tr={304.4,0} bl={55.6,310} br={360,255.4}). A degenerate rectangle
// (all four corners at d) makes the laser-survival gate reject every descent
// exit.
//
// Run: node census_exit_direction.cjs [archive-glob]
//      node census_exit_direction.cjs --dump <level> <endpoint-substring> <n>
//        prints the first <n> firing records for that level/endpoint (state,
//        routes with landing+dist, D, dirToObj, actual move) for hand-checks.
//        The dump and the census call the SAME evaluate(), so a dump firing is
//        exactly a census firing.
const DUMP = process.argv[2] === "--dump"
  ? { level: +process.argv[3], ep: process.argv[4], n: +process.argv[5] }
  : null;
process.env.ROUTE_FIRST = "1";
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");
const dec = require("../decision.cjs");
const { simulate } = require("../arc.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "out");

// Collect archives: every out/**/run_level_*_<endpoint>.json
const archives = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) archives.push(p);
  }
})(OUT);

function endpointName(arch) {
  // byom/<model>/ archives are named run_level_N_systemone.json; the model is
  // in the path segment, so include it or '--dump 2 PurpleMIST' matches nothing.
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}

const PORTAL = { x: 180, y: 150 };

// Static gem spawn table (mirror of config.ts gemsPositionsPerLevel). The
// prompt uses the gem's SPAWN coordinate, so the census uses this, independent
// of the archive's collected-gem bookkeeping. levelGems stay [x,y] tuples
// exactly as the game's gemsPositionsPerLevel shapes them (matchGemsToSpawn
// reads spawn[0]/spawn[1]). Loaded from the game source (experiments/gem_table.cjs);
// verified identical to the previously hardcoded table for levels 0-13.
const GEM_SPAWNS = require("./gem_table.cjs")();

// THE PREDICATE, one function. Called by BOTH the census main loop and the
// --dump hand-check so they cannot drift apart. Returns {fire, side, dirToObj,
// routes, comply} on a firing, or {reason} with a non-firing tally key
// (notGrounded, noFloor, objOnFloor, noHolder, noExits, exitsAmbiguous,
// sideMatchesDir, waypoint) otherwise.
function evaluate(e, level) {
  // The predicate itself lives in decision.cjs exitDirection (ONE SOURCE OF TRUTH:
  // the live EXIT_FACT gate and this census cannot drift apart). The census adds
  // only what the archives require: objective coordinates from the static spawn
  // table (gems are static), and drones reconstructed at the archived
  // movingFrames (dd = 0.2 * mf, verified against the replay dump at mf=273).
  const objName = e.objective;
  let gx, gy;
  if (/^gem_[abc]$/.test(objName)) {
    const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[objName];
    gx = GEM_SPAWNS[level][idx][0]; gy = GEM_SPAWNS[level][idx][1];
  } else if (objName === "portal") {
    gx = PORTAL.x; gy = PORTAL.y;
  }
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const dd = 0.2 * mf;
  const snap = {
    level, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 0, height: e.cat.h || 18 },
    drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
  };
  // CENSUS_EXIT_MODE=v2 evaluates the landingPlatforms version; default v1 is
  // what the live EXIT_FACT=1 gate uses.
  const r = dec.exitDirection(snap, GEM_SPAWNS[level], objName, gx, gy, mf,
    process.env.CENSUS_EXIT_MODE || "v1");
  if (!r.fire) return r;
  // Compliance: did the archived move head toward the shortest-path exit?
  // The exit is a floor END the cat must walk to, so the compliant moves are
  // the walk and the jump that carry the cat to that side.
  const move = e.move;
  const comply = (r.side === "left" && (move === "left" || move === "jump_left"))
    || (r.side === "right" && (move === "right" || move === "jump_right"));
  return { fire: true, side: r.side, dirToObj: r.dirToObj, routes: r.routes, comply, holder: r.holder, gx, gy };
}

// Tally: predicate firings keyed by (level, cleared)
const fire = {}; // `${level}:${cleared}` -> {total, fire, comply, endpoint}
const reason = { notGrounded: 0, noFloor: 0, objOnFloor: 0, noHolder: 0, noExits: 0, exitsAmbiguous: 0, sideMatchesDir: 0, waypoint: 0, fired: 0 };

for (const arch of archives) {
  let d;
  try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length) continue;
  const level = d.levelIndex;
  const cleared = !!(d.sawAdvance || d.won);
  // Keyed by endpoint too: two endpoints clearing/failing the same level must
  // not merge under the first-seen endpoint label (that silently zeroed the
  // EXIT archives' firings in the by-endpoint table).
  const key = `${endpointName(arch)}:${level}:${cleared}`;
  if (!fire[key]) fire[key] = { total: 0, fire: 0, comply: 0, endpoint: endpointName(arch) };
  for (const e of d.log) {
    fire[key].total++;
    const r = evaluate(e, level);
    if (r.reason) { reason[r.reason] = (reason[r.reason] || 0) + 1; continue; }
    fire[key].fire++;
    reason.fired++;
    if (r.comply) fire[key].comply++;
  }
}

// ---- --dump: hand-check the first n firings for a level/endpoint ----
if (DUMP) {
  console.log(`\n== dump: level ${DUMP.level}, endpoint ~${DUMP.ep}, first ${DUMP.n} firings ==`);
  let printed = 0;
  for (const arch of archives) {
    if (printed >= DUMP.n) break;
    if (!endpointName(arch).includes(DUMP.ep)) continue;
    let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
    if (!d.log || !d.log.length || d.levelIndex !== DUMP.level) continue;
    for (const e of d.log) {
      if (printed >= DUMP.n) break;
      const r = evaluate(e, d.levelIndex);
      if (!r.fire) continue;
      const catX = e.cat.x, catY = e.cat.y;
      const here = REACH.platformKeyUnder(d.levelIndex, catX, catY);
      console.log(`\n--- ${path.basename(arch)} cleared=${!!(d.sawAdvance || d.won)} ---`);
      console.log(`step ${e.step} cat (${catX},${catY}) floor ${here} mf ${e.movingFrames} obj ${e.objective}(${r.gx},${r.gy}) holder ${r.holder}`);
      console.log(`routes: ${r.routes.map((x) => `${x.side} d=${x.d} lands=${(x.lands || []).join(",")}`).join(" | ")}`);
      console.log(`D=${r.side} dirToObj=${r.dirToObj} move=${e.move} comply=${r.comply} probs=${JSON.stringify(e.moveProbs || {})}`);
      printed++;
    }
  }
  console.log(`printed ${printed} firing records`);
  process.exit(0);
}

// ---- report ----
console.log(`archives: ${archives.length}, decisions: ${Object.values(fire).reduce((a, f) => a + f.total, 0)}`);
console.log("reason tallies:", JSON.stringify(reason));
console.log("");

console.log("level | cleared: fire/total (comply%) | failed: fire/total (comply%)");
for (let lvl = 0; lvl < 14; lvl++) {
  for (const ok of [true, false]) {
    // One row per (endpoint, level, cleared): keys are `ep:level:cleared`,
    // and ep contains no colons.
    for (const [key, f] of Object.entries(fire)) {
      const parts = key.split(":"); // ep:level:cleared, ep has no colons
      if (+parts[1] !== lvl || (parts[2] === "true") !== ok) continue;
      const rate = f.total ? (100 * f.fire / f.total).toFixed(1) : "-";
      const comp = f.fire ? (100 * f.comply / f.fire).toFixed(1) : "-";
      console.log(`${String(lvl).padStart(5)} | ${ok ? "" : "     "} ${String(f.fire).padStart(3)}/${String(f.total).padStart(5)} (${rate.padStart(5)}%) comply=${comp.padStart(5)}% [${f.endpoint}]`);
    }
  }
}

// Per-endpoint split (the hypothesis is Flash-specific).
console.log("");
console.log("by endpoint (fire/total over ALL levels): ");
const byEp = {};
for (const f of Object.values(fire)) {
  if (!byEp[f.endpoint]) byEp[f.endpoint] = { fire: 0, total: 0, comply: 0 };
  byEp[f.endpoint].fire += f.fire; byEp[f.endpoint].total += f.total; byEp[f.endpoint].comply += f.comply;
}
for (const [ep, s] of Object.entries(byEp)) {
  const rate = s.total ? (100 * s.fire / s.total).toFixed(1) : "-";
  const comp = s.fire ? (100 * s.comply / s.fire).toFixed(1) : "-";
  console.log(`  ${ep.padEnd(12)} ${String(s.fire).padStart(5)}/${String(s.total).padStart(6)} (${rate.padStart(5)}%) comply=${comp.padStart(5)}%`);
}
