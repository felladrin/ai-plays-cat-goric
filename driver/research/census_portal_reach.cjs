// PORTAL_REACH census: the L13 endgame dither. After the third gem, the cat
// stands on a floor with the portal floating BELOW it (no holder - the same
// noHolder gap as L11's floating gem; the L13 NEG s5 win dithered on
// floor(156..208@63) with the portal at (180,150) under the middle and died).
// Candidate fact: from the standing floor, step off an END and reach the portal.
// Reach oracle (supervisor): survival.canStillLand with the portal exemption -
// pass a hits Set so platform overlaps do NOT return true (they only collect),
// and the ONLY true return is a portal-box touch under free steering.
// Fire iff grounded + obj portal + gemsCollected>=3 + at least one end reaches;
// the fact names the reaching end(s). Census first; gate only if it passes.
//
// Run: node research/census_portal_reach.cjs
//      PRDUMP=<level> node research/census_portal_reach.cjs <ep-substr> <n>
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");
const { platformBoxes } = require("../arc.cjs");
const { canStillLand } = require("../survival.cjs");

const DUMP = process.env.PRDUMP
  ? { level: +process.env.PRDUMP, ep: process.argv[2], n: +(process.argv[3] || 8) }
  : null;
const ROOT = path.resolve(__dirname, "..", "..");

function portalEnds(level, catX, catY, h, mf) {
  const here = REACH.platformKeyUnder(level, catX, catY);
  if (!here) return { reason: "noFloor" };
  const m = /^\w+\(([\d.]+)\.\.([\d.]+)@/.exec(here);
  if (!m) return { reason: "oddKey" };
  const [l, r] = [+m[1], +m[2]];
  const plats = platformBoxes(level);
  const reach = {};
  for (const [side, edgeX] of [["left", l], ["right", r]]) {
    const step = side === "left" ? -0.25 : 0.25;
    let ex = null;
    for (let x = edgeX + step; Math.abs(x - edgeX) <= 8; x += step) {
      if (REACH.platformKeyUnder(level, x, catY) !== here) { ex = x; break; }
    }
    if (ex == null) { reach[side] = false; continue; }
    reach[side] = canStillLand(plats, { x: ex, y: catY, dy: 0, mf }, h, new Set(), side, true);
  }
  return { here, reach, fire: reach.left || reach.right };
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
const reason = {};
const moves = {};
let nDec = 0, nFire = 0;
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  for (const e of d.log) {
    nDec++;
    if (!e.onPlatform || e.objective !== "portal" || (e.gemsCollected || 0) < 3) continue;
    const mf = e.movingFrames || 0;
    const r = portalEnds(d.levelIndex, e.cat.x, e.cat.y, e.cat.h || 18, mf);
    const key = `${endpointName(arch)}:${d.levelIndex}:${!!(d.sawAdvance || d.won)}`;
    if (!byKey[key]) byKey[key] = { n: 0, fire: 0, both: 0 };
    byKey[key].n++;
    reason[r.reason || (r.fire ? "fired" : "noEnds")] = (reason[r.reason || (r.fire ? "fired" : "noEnds")] || 0) + 1;
    if (r.fire) {
      nFire++; byKey[key].fire++;
      if (r.reach.left && r.reach.right) byKey[key].both++;
      moves[e.move] = (moves[e.move] || 0) + 1;
      if (DUMP && endpointName(arch).includes(DUMP.ep) && d.levelIndex === DUMP.level && DUMP.n > 0) {
        console.log(`${path.dirname(arch).split("/").slice(-1)} step ${e.step} (${e.cat.x},${e.cat.y}) mf${mf} floor ${r.here} L=${r.reach.left} R=${r.reach.right} move=${e.move}`);
        DUMP.n--;
      }
    }
  }
}
const pct = (a, b) => (b ? ((100 * a / b).toFixed(1) + "%") : "-");
console.log(`decisions: ${nDec}; grounded portal-obj gc3: ${Object.values(reason).reduce((a, b) => a + b, 0)}; fired: ${nFire}`);
console.log("reason tallies:", JSON.stringify(reason));
console.log("model moves at firing states:", JSON.stringify(moves));
console.log("\nby endpoint:level:cleared (portal-obj gc3 >= 1):");
for (const [k, v] of Object.entries(byKey).filter(([, v]) => v.n >= 1).sort((a, b) => b[1].fire - a[1].fire))
  console.log(`  ${k.padEnd(46)} fire ${String(v.fire).padStart(3)}/${String(v.n).padStart(3)} both-ends ${v.both}`);
