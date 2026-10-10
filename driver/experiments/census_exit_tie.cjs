// EXIT_FACT tie census: exitDirection returns exitsAmbiguous when the two
// shortest-route exits TIE (L13 live finding: gem_c collected on
// floor(156..208@63), portal (180,150) under the MIDDLE - both ends equally
// short, the fact goes silent, the cat dithers on the floor and the life ends).
// How often does the both-sides tie happen, on which levels, and what does the
// model do at those states? Predicate: decision.cjs exitDirection (v1, the live
// gate), ONE SOURCE OF TRUTH; the tie fields (sides/minD/routes) ride on the
// exitsAmbiguous return.
//
// Run: node experiments/census_exit_tie.cjs
//      TIEDUMP=<level> node experiments/census_exit_tie.cjs <ep-substr> <n>
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

// The predicate is the LIVE decision.cjs exitDirection (ONE SOURCE OF TRUTH,
// called as exported). exitsAmbiguous ALREADY means the both-sides tie: routes
// are only built when they reach the holder, and sides can only be left/right,
// so sides.size > 1 <=> left and right tie at the same route length. No tie
// fields are needed from the predicate and decision.cjs stays untouched.

const DUMP = process.env.TIEDUMP
  ? { level: +process.env.TIEDUMP, ep: process.argv[2], n: +(process.argv[3] || 8) }
  : null;
const ROOT = path.resolve(__dirname, "..", "..");
const GEM_SPAWNS = require("./gem_table.cjs")();
const PORTAL = { x: 180, y: 150 };

function evaluate(e, level) {
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
  return dec.exitDirection(snap, GEM_SPAWNS[level], objName, gx, gy, mf, "v1");
}

function endpointName(arch) {
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}

const archives = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) archives.push(p);
  }
})(path.join(ROOT, "out"));

const byKey = {};
let nDec = 0, nTie = 0;
const moves = {};
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (DUMP) {
    if (!endpointName(arch).includes(DUMP.ep) || d.levelIndex !== DUMP.level) continue;
    for (const e of d.log) {
      const r = evaluate(e, d.levelIndex);
      if (r.reason !== "exitsAmbiguous") continue;
      console.log(`${path.dirname(arch).split("/").slice(-1)} step ${e.step} (${e.cat.x},${e.cat.y}) mf${e.movingFrames} obj ${e.objective} gc${e.gemsCollected} TIE move=${e.move}`);
      if (--DUMP.n <= 0) process.exit(0);
    }
    continue;
  }
  const key = `${endpointName(arch)}:${d.levelIndex}:${!!(d.sawAdvance || d.won)}`;
  if (!byKey[key]) byKey[key] = { grounded: 0, tie: 0 };
  for (const e of d.log) {
    nDec++;
    const r = evaluate(e, d.levelIndex);
    if (r.reason === "notGrounded") continue;
    byKey[key].grounded++;
    if (r.reason !== "exitsAmbiguous") continue;
    byKey[key].tie++; nTie++;
    moves[e.move] = (moves[e.move] || 0) + 1;
  }
}
if (DUMP) process.exit(0);
const pct = (a, b) => (b ? ((100 * a / b).toFixed(1) + "%") : "-");
console.log(`decisions: ${nDec}; both-sides ties: ${nTie}`);
console.log("model moves at tie states:", JSON.stringify(moves));
console.log("\nby endpoint:level:cleared (grounded >= 20, tie > 0):");
for (const [k, v] of Object.entries(byKey).filter(([, v]) => v.grounded >= 20 && v.tie > 0).sort((a, b) => b[1].tie - a[1].tie))
  console.log(`  ${k.padEnd(46)} tie ${String(v.tie).padStart(4)}/${String(v.grounded).padStart(5)} (${pct(v.tie, v.grounded).padStart(6)})`);
