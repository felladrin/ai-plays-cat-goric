// DESC_HONEST census: the L4 loop shape, measured everywhere.
// NOTE: DESC_HONEST was rejected (L8 regression) and removed from decision.cjs;
// this census stands as the record and is self-contained. See dead-ends.md.
// Shape: grounded, objective gem below the floor; the NEARER descent advertises
// the objective's floor among its landings but that landing is only reachable
// by REVERSING the hold in the air (or is band-only, reachable by no single
// hold); the OTHER descent reaches the objective's floor by KEEPING the hold or
// by RELEASING. The prompt's "lands on A or B" envelope hides which landing
// needs which execution; the model takes the near descent and dies or loops.
// Compliance: did the archived move head toward the RELIABLE descent's side?
//   node experiments/census_desc_honest.cjs
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");
const dec = require("../decision.cjs");
const { simulate } = require("../arc.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
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

const archives = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) archives.push(p);
  }
})(process.env.CENSUS_DIR || path.join(ROOT, "out"));
function endpointName(arch) {
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}
function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}

// Classify how a landing platform is reachable from a descent edge:
// hold (keep pressing the walk direction), release (none just past the edge),
// reverse (opposite hold just past the edge), or band-only (envelope claim no
// single hold produces). x_past: 1px past the edge, airborne, dy 0.
function reachKinds(level, edgeX, floorY, h, side, mf, landKey) {
  const past = side === "left" ? edgeX - 1 : edgeX + 1;
  const opp = side === "left" ? "right" : "left";
  const kinds = [];
  const tryHold = (act, name) => {
    const r = simulate(level, past, floorY, 0, h, act, mf, { grounded: false });
    if (r.outcome !== "landed") return;
    const k = REACH.platformKeyUnder(level, r.x, r.y);
    if (k === landKey) kinds.push(name);
  };
  tryHold(side, "hold");
  tryHold("none", "release");
  tryHold(opp, "reverse");
  return kinds;
}

function evaluate(e, level) {
  if (!e.onPlatform) return { reason: "notGrounded" };
  if (!/^gem_[abc]$/.test(e.objective)) return { reason: "notGem" };
  if (e.moveProbs && Object.keys(e.moveProbs).length <= 1) return { reason: "oneOptionMenu" };
  const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[e.objective];
  const spawns = GEM_SPAWNS[level];
  if (!spawns) return { reason: "noSpawns" };
  const [gx, gy] = spawns[idx];
  const catX = e.cat.x, catY = e.cat.y, h = e.cat.h || 18;
  const here = REACH.platformKeyUnder(level, catX, catY);
  if (!here) return { reason: "noFloor" };
  const holder = REACH.platformHolding(level, gx, gy);
  if (!holder || holder === here) return { reason: "objNotBelow" };
  const mf = e.movingFrames || 0;
  const snap = {
    level, onPlatform: true, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: catX, y: catY, dx: 0, dy: 0, height: h },
    drones: dronesAt(mf),
  };
  const descents = dec.descentPoints(snap, spawns);
  if (descents.length < 2) return { reason: "ltTwoDescents" };
  const info = descents.map((p) => {
    const side = p.name.endsWith("left") ? "left" : "right";
    const kinds = {};
    for (const k of p.lands || []) kinds[k] = reachKinds(level, p.x, p.y, h, side, mf, k);
    return { side, x: p.x, y: p.y, lands: p.lands || [], kinds };
  });
  const near = info.reduce((a, b) => (Math.abs(a.x - catX) <= Math.abs(b.x - catX) ? a : b));
  const other = info.find((d) => d.side !== near.side);
  if (!other) return { reason: "sameSideOnly" };
  const nearKinds = near.kinds[holder] || [];
  const nearClaimsObj = (near.lands || []).includes(holder);
  const otherKinds = other.kinds[holder] || [];
  const otherReliable = otherClaimsReliable(otherKinds);
  if (!nearClaimsObj) return { reason: "nearMissesObj" };
  if (nearKinds.includes("hold") || nearKinds.includes("release")) return { reason: "nearReliable" };
  if (!otherReliable) return { reason: "otherNotReliable" };
  const move = e.move;
  const comply = (other.side === "left" && (move === "left" || move === "jump_left"))
    || (other.side === "right" && (move === "right" || move === "jump_right"));
  return { fire: true, nearSide: near.side, otherSide: other.side, nearKinds: nearKinds.join("+") || "band-only", comply };
}
function otherClaimsReliable(k) { return k.includes("hold") || k.includes("release"); }

const byEp = {};
const byLevel = {};
const grid = {}; // `${level}|${cleared}|${ep}` -> {total, fire, comply}
const reasons = {};
if (process.env.ARCH_CHECK) {
  const [ap, ix] = process.env.ARCH_CHECK.split(":");
  const d = JSON.parse(fs.readFileSync(ap, "utf8"));
  console.log(JSON.stringify(evaluate(d.log[+ix], d.levelIndex), null, 1));
  process.exit(0);
}
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length) continue;
  const level = d.levelIndex;
  const ep = endpointName(arch);
  const cleared = !!(d.sawAdvance || d.won);
  for (const e of d.log) {
    const gk = `${level}|${cleared}|${ep}`;
    (grid[gk] = grid[gk] || { total: 0, fire: 0, comply: 0 }).total++;
    const r = evaluate(e, level);
    if (!r.fire) { reasons[r.reason] = (reasons[r.reason] || 0) + 1; continue; }
    grid[gk].fire++;
    (byEp[ep] = byEp[ep] || { fire: 0, comply: 0 });
    (byLevel[level] = byLevel[level] || { fire: 0, comply: 0 });
    byEp[ep].fire++; byLevel[level].fire++;
    if (r.comply) { grid[gk].comply++; byEp[ep].comply++; byLevel[level].comply++; }
  }
}
console.log("reason tallies:", JSON.stringify(reasons));
console.log("\nby endpoint:");
for (const [ep, s] of Object.entries(byEp).sort((a, b) => b[1].fire - a[1].fire))
  console.log(`  ${ep.padEnd(34)} fire=${String(s.fire).padStart(4)} comply=${(100 * s.comply / s.fire).toFixed(1)}%`);
console.log("\nby level:");
for (const [lvl, s] of Object.entries(byLevel).sort((a, b) => a[0] - b[0]))
  console.log(`  L${lvl.padStart(2)} fire=${String(s.fire).padStart(4)} comply=${(100 * s.comply / s.fire).toFixed(1)}%`);
console.log("\nlevel | cleared | endpoint | total | fire (rate) | comply");
for (const [k, s] of Object.entries(grid).sort()) {
  if (!s.fire) continue;
  const [lvl, cl, ep] = k.split("|");
  console.log(`  L${lvl.padStart(2)} | ${cl === "true" ? "cleared" : "failed "} | ${ep.padEnd(34)} | ${String(s.total).padStart(5)} | ${String(s.fire).padStart(4)} (${(100 * s.fire / s.total).toFixed(1)}%) | ${(100 * s.comply / s.fire).toFixed(1)}%`);
}
