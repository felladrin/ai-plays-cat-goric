// NEG_HOLD census: the NEGATIVE airborne fact. Fire when exactly ONE hold is
// strictly WORSE (dies, or lands strictly farther from the objective) and the
// other two are EQUAL-BEST. The informative sentence is then "steering <bad>
// from here <dies / lands on X, farther>" - the L10 mode-1 apex state is the
// archetype: right and none tie on floor(304..356@140) and left slides off the
// tower and dies, so the strict-minimum predicates (airRoute, KEEP_HOLD) are
// silent there and only a negative fact can speak. Bar (supervisor): rare (low
// single digits % of airborne), losers took the bad hold, winners avoided it.
//
// Scoring per hold: 0 if the held arc touches the objective box (collect);
// else the landing floor's route length to the TARGET SET = the gem's holder
// floor plus the collector floors (floatCollectPlatforms, census_float_exit's
// convention: platforms from which some jump's arc touches the gem box),
// 0 if the landing is in the set else 1+BFS on g4; Infinity if the arc dies.
//
// Run: node experiments/census_neg_hold.cjs
//      NEG_DUMP=<level> <ep-substr> <n> node experiments/census_neg_hold.cjs
const DUMP = process.env.NEG_DUMP
  ? { level: +process.env.NEG_DUMP, ep: process.argv[2], n: +(process.argv[3] || 8) }
  : null;
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "out");
const GEM_SPAWNS = require("./gem_table.cjs")();

function evaluate(e, level, prev) {
  if (e.onPlatform) return { reason: "grounded" };
  const objName = e.objective;
  if (!/^gem_[abc]$/.test(objName)) return { reason: "notGem" };
  const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[objName];
  const gx = GEM_SPAWNS[level][idx][0], gy = GEM_SPAWNS[level][idx][1];
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const dd = 0.2 * mf;
  const snap = {
    level, onPlatform: false, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
  };
  // ONE SOURCE OF TRUTH: the predicate is decision.cjs negHold (the live gate
  // and this census cannot drift apart).
  const r = dec.negHold(snap, objName, gx, gy, mf);
  if (!r.fire) return r;
  const postLaunch = prev && (prev.move === "jump_left" || prev.move === "jump_right") && prev.movingFrames < mf;
  return { fire: true, bad: r.bad, d: r.d, avoid: e.move !== r.bad, postLaunch,
    badDesc: r.badVia === "laser" ? "dies(laser)" : r.badVia === "void" ? "dies(void)" : "lands " + r.badFloor };
}

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

const byKey = {};
const reason = {};
let nDec = 0, nFire = 0, nAvoid = 0, nPost = 0, nPostFire = 0, nPostAvoid = 0;
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (DUMP) {
    if (!endpointName(arch).includes(DUMP.ep) || d.levelIndex !== DUMP.level) continue;
    let prev = null;
    for (const e of d.log) {
      const r = evaluate(e, d.levelIndex, prev); prev = e;
      if (!r.fire) continue;
      console.log(`${path.dirname(arch).split("/").slice(-1)} step ${e.step} (${e.cat.x},${e.cat.y}) dy${e.cat.dy} mf${e.movingFrames} obj ${e.objective} d=${JSON.stringify(r.d)} BAD=${r.bad}(${r.badDesc}) move=${e.move} avoid=${r.avoid} postLaunch=${r.postLaunch}`);
      if (--DUMP.n <= 0) process.exit(0);
    }
    continue;
  }
  const ep = endpointName(arch);
  const key = `${ep}:${d.levelIndex}:${!!(d.sawAdvance || d.won)}`;
  if (!byKey[key]) byKey[key] = { total: 0, fire: 0, avoid: 0 };
  let prev = null;
  for (const e of d.log) {
    nDec++;
    const r = evaluate(e, d.levelIndex, prev);
    prev = e;
    if (r.reason === "grounded" || r.reason === "notGem") continue;
    byKey[key].total++;
    reason[r.reason || "fired"] = (reason[r.reason || "fired"] || 0) + 1;
    if (!r.fire) continue;
    byKey[key].fire++;
    nFire++;
    if (r.avoid) { byKey[key].avoid++; nAvoid++; }
    if (r.postLaunch) { nPost++; if (r.avoid) nPostAvoid++; }
    nPostFire += r.postLaunch ? 1 : 0;
  }
}
console.log(`decisions: ${nDec}; airborne gem-obj tallied; fired ${nFire}`);
console.log("reason tallies:", JSON.stringify(reason));
const pct = (a, b) => (b ? ((100 * a / b).toFixed(1) + "%") : "-");
console.log(`overall fire rate: ${pct(nFire, Object.values(reason).reduce((a, b) => a + b, 0) - (reason.notGem || 0) - (reason.grounded || 0))} of airborne gem-obj; avoid=${pct(nAvoid, nFire)}; post-launch firings ${nPostFire} (avoid ${pct(nPostAvoid, nPostFire)})`);
const rows = Object.entries(byKey).filter(([, v]) => v.total >= 20 && v.fire > 0);
console.log("\nby endpoint:level:cleared (airborne gem-obj >= 20, fire>0):");
for (const [k, v] of rows.sort((a, b) => b[1].fire / b[1].total - a[1].fire / a[1].total))
  console.log(`  ${k.padEnd(46)} fire ${String(v.fire).padStart(4)}/${String(v.total).padStart(5)} (${pct(v.fire, v.total).padStart(6)}) avoid=${pct(v.avoid, v.fire).padStart(6)}`);
