// AIR_ROUTE census: the airborne twin of EXIT_FACT. For every AIRBORNE decision,
// score each hold {left, right, none} by its exact held arc's remaining route
// length to the objective (0 = collected mid-air or lands on the holder floor,
// else BFS hops from the landing floor, Infinity = dies); fire when exactly one
// hold is the strict minimum. Both predicates live in THIS file (rejected for
// the live prompt; docs/dead-ends.md).
//
// Compliance: the archived move equals the winning hold (airborne legal moves
// are exactly left/right/none).
//
// Run: node research/census_air_route.cjs
//      AIR_MODE=survival node research/census_air_route.cjs   (narrow fact:
//        exactly one hold SURVIVES when held to landing; objective-independent,
//        decision.cjs airSurvival)
//      node research/census_air_route.cjs --dump <level> <ep-substr> <n>
const DUMP = process.argv[2] === "--dump"
  ? { level: +process.argv[3], ep: process.argv[4], n: +process.argv[5] }
  : null;
const MODE = process.env.AIR_MODE || "route";
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "out");
const PORTAL = { x: 180, y: 150 };

// BFS hop distance over g4 edges (copy of decision.cjs' private helper; the
// predicates below are census-only, so the helper is copied, not exported).
function bfsEdgeDist(edges, from, to) {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const k of frontier)
      for (const t of edges[k] || []) {
        if (t === to) return d;
        if (!seen.has(t)) { seen.add(t); next.push(t); }
      }
    frontier = next;
  }
  return null;
}

// The AIR_ROUTE predicate: the airborne twin of EXIT_FACT. The cat is airborne;
// for each steering hold in {left, right, none} take the EXACT held arc from the
// current airborne state (arc.simulate, as reachHolds does), map its landing to
// a floor (REACH.platformKeyUnder), and score the remaining route length to the
// objective's holder (BFS on the g4 edges; 0 if the arc itself collects the gem
// or lands on the holder floor; Infinity if the arc dies). Fire when EXACTLY ONE
// hold gives the strict minimum - no bearing or prior-side condition: in the L13
// climb the model answers left against a right-hand gem, so a bearing filter
// would suppress the very case the fact exists for (supervisor, 2026-10-10).
// The census (research/census_air_route.cjs) decides breadth by fire rate and
// compliance. REJECTED for the live prompt (see docs/dead-ends.md); the
// predicate lives HERE, in the census, because nothing else may use it.
function airRoute(snap, objName, objX, objY, mf) {
  if (snap.onPlatform) return { reason: "grounded" };
  if (objName === "portal" && snap.gemsCollected < 3) return { reason: "portalNotLive" };
  if (!/^gem_[abc]$/.test(objName) && objName !== "portal") return { reason: "waypoint" };
  const REACH = require("../reachability.cjs");
  const { simulate } = require("../arc.cjs");
  const h = snap.cat.height || 18;
  const holder = REACH.platformHolding(snap.level, objX, objY);
  if (!holder) return { reason: "noHolder" };
  // Gem/portal collision boxes exactly as reachHolds documents them from source.
  const half = objName === "portal" ? 16 : 8;
  const bx0 = objX - half, bx1 = objX + half, by0 = objY - half, by1 = objY + half;
  const hits = (cx, cy) => cx < bx1 && cx + 1 > bx0 && cy - h < by1 && cy > by0;
  const g4 = REACH.graph(snap.level, h);
  const results = {};
  for (const hold of ["left", "right", "none"]) {
    let collect = false;
    const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, hold, mf, {
      grounded: false,
      onFrame: (x, y) => { if (!collect && hits(x, y)) collect = true; },
    });
    if (collect) { results[hold] = { d: 0, via: "collect" }; continue; }
    if (r.outcome !== "landed") { results[hold] = { d: Infinity, via: r.outcome }; continue; }
    const lk = REACH.platformKeyUnder(snap.level, r.x, r.y);
    if (!lk) { results[hold] = { d: Infinity, via: "void" }; continue; }
    const hops = lk === holder ? 0 : bfsEdgeDist(g4.edges, lk, holder);
    results[hold] = hops == null
      ? { d: Infinity, via: "unreachable" }
      : { d: hops, via: "land", floor: lk };
  }
  const holds = ["left", "right", "none"];
  const min = Math.min(...holds.map((k) => results[k].d));
  if (!Number.isFinite(min)) return { reason: "allDie", results };
  const best = holds.filter((k) => results[k].d === min);
  if (best.length !== 1) return { reason: "tie", results };
  return { fire: true, hold: best[0], results };
}

// The NARROW airborne survival fact (supervisor, 2026-10-10, after the broad
// AIR_ROUTE census failed the EXIT_FACT bar: 31.8% of airborne decisions fire,
// no winner/loser gap on the L13 climb). Airborne; for each hold in
// {left, right, none} simulate the EXACT held arc to its end; fire when exactly
// ONE hold survives (lands) and the other two end in a laser or the void. This
// is a survival fact, not a route preference: at the L13 bounce state (s5 step
// 116) left and right both die when held and the model answers left - and
// isFatal does NOT prune left, because it allows free steering after the
// committed frames; the sentence is the only thing that says which hold survives
// WHEN HELD. Objective-independent. ONE SOURCE OF TRUTH:
// research/census_air_route.cjs (AIR_MODE=survival) is its only user.
function airSurvival(snap, mf) {
  if (snap.onPlatform) return { reason: "grounded" };
  const { simulate } = require("../arc.cjs");
  const h = snap.cat.height || 18;
  // A win is survival too: same rule as the portal prune in survival.cjs - the
  // 32x32 box centred on (180,150), live only at gemsCollected >= 3. Without
  // this the sentence would steer the cat away from the L13 winning hold (the
  // last decision of both wins is airborne left INTO the portal).
  const portalLive = snap.gemsCollected >= 3;
  const px0 = 180 - 16, px1 = 180 + 16, py0 = 150 - 16, py1 = 150 + 16;
  const results = {};
  for (const hold of ["left", "right", "none"]) {
    let portal = false;
    const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, hold, mf, {
      grounded: false,
      onFrame: (x, y) => { if (!portal && portalLive && x < px1 && x + 1 > px0 && y - h < py1 && y > py0) portal = true; },
    });
    results[hold] = portal ? "portal" : r.outcome;
  }
  const alive = ["left", "right", "none"].filter((k) => results[k] === "landed" || results[k] === "portal");
  if (alive.length === 1) return { fire: true, hold: alive[0], results };
  return { reason: alive.length ? "multipleSurvive" : "noneSurvive", results };
}

const GEM_SPAWNS = require("./gem_table.cjs")();

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
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}

function evaluate(e, level) {
  if (e.onPlatform) return { reason: "grounded" };
  const objName = e.objective;
  let gx, gy;
  if (/^gem_[abc]$/.test(objName)) {
    const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[objName];
    gx = GEM_SPAWNS[level][idx][0]; gy = GEM_SPAWNS[level][idx][1];
  } else if (objName === "portal") { gx = PORTAL.x; gy = PORTAL.y; }
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const dd = 0.2 * mf;
  const snap = {
    level, onPlatform: false, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
  };
  const r = MODE === "survival" ? airSurvival(snap, mf) : airRoute(snap, objName, gx, gy, mf);
  if (!r.fire) return r;
  return { fire: true, hold: r.hold, comply: e.move === r.hold, results: r.results, move: e.move };
}

if (DUMP) {
  let printed = 0;
  for (const arch of archives) {
    if (!endpointName(arch).includes(DUMP.ep)) continue;
    let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
    if (d.levelIndex !== DUMP.level) continue;
    for (const e of d.log) {
      const r = evaluate(e, d.levelIndex);
      if (!r.fire) continue;
      const res = ["left", "right", "none"].map((k) => `${k}:${MODE === "survival" ? r.results[k] : r.results[k].d + (r.results[k].via ? "(" + r.results[k].via + ")" : "")}`).join(" ");
      console.log(`step ${e.step} cat (${e.cat.x},${e.cat.y}) dy ${e.cat.dy} mf ${e.movingFrames} obj ${e.objective} | ${res} | HOLD=${r.hold} move=${e.move} comply=${r.comply}`);
      if (++printed >= DUMP.n) { console.log(`printed ${printed}`); process.exit(0); }
    }
  }
  console.log(`printed ${printed} firing records`);
  process.exit(0);
}

const byKey = {}; // ep:level:cleared -> {total, fire, comply}
const reason = {};
let nArch = 0, nDec = 0;
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  nArch++;
  const ep = endpointName(arch);
  const key = `${ep}:${d.levelIndex}:${!!d.cleared}`;
  if (!byKey[key]) byKey[key] = { total: 0, fire: 0, comply: 0 };
  for (const e of d.log) {
    nDec++;
    const r = evaluate(e, d.levelIndex);
    if (r.reason === "grounded") continue;
    byKey[key].total++;
    reason[r.reason || "fired"] = (reason[r.reason || "fired"] || 0) + 1;
    if (!r.fire) continue;
    byKey[key].fire++;
    if (r.comply) byKey[key].comply++;
  }
}
console.log(`archives: ${nArch}, decisions: ${nDec} (airborne tallied only)`);
console.log("reason tallies:", JSON.stringify(reason));
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : "-";
const rows = Object.entries(byKey).filter(([, v]) => v.total >= 20);
console.log("\nby endpoint:level:cleared (airborne decisions >= 20):");
for (const [k, v] of rows.sort((a, b) => b[1].fire / b[1].total - a[1].fire / a[1].total)) {
  if (!v.fire) continue;
  console.log(`  ${k.padEnd(46)} fire ${String(v.fire).padStart(4)}/${String(v.total).padStart(5)} (${pct(v.fire, v.total).padStart(5)}) comply=${pct(v.comply, v.fire).padStart(5)}`);
}

// L13 winners vs losers (EXIT archives): compliance inside the climb window
// (gc==2, obj gem_c) and outside it.
console.log("\nL13 EXIT archives, airborne firings: climb window (gc2/gem_c) vs rest:");
for (const s of ["s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"]) {
  const p = path.join(ROOT, `out/byom/PurpleMIST-Flash-1.0-EXIT/${s}/run_level_13_systemone.json`);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const t = { climb: [0, 0], rest: [0, 0] }; // [fire, comply]
  for (const e of d.log) {
    const r = evaluate(e, 13);
    if (!r.fire) continue;
    const w = e.gemsCollected === 2 && e.objective === "gem_c" ? "climb" : "rest";
    t[w][0]++; if (r.comply) t[w][1]++;
  }
  console.log(`  ${s.padEnd(4)} won=${d.won ? "Y" : "n"} climb ${t.climb[0]} fire comply=${pct(t.climb[1], t.climb[0])} | rest ${t.rest[0]} fire comply=${pct(t.rest[1], t.rest[0])}`);
}
