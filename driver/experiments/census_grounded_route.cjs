// Grounded move-fact census (L11 candidate): the GROUNDED sibling of negHold.
// The L11 loop is grounded: on floor(145..197@231) the bearing to floating
// gem_a(180,76) pulls right/jump_right (back UP to dist 4) while the productive
// route continues LEFT (231 -> 211 -> 152 -> 114 -> jump_right collects).
// negHold is airborne-only and cannot speak there; FLOAT_EXIT (rejected) named a
// SIDE, not a move, and its single-move route vocabulary misfired.
//
// Predicate: score each of the five grounded moves by the route length from its
// HELD landing to the gem's COLLECTOR set (platforms whose jump arcs touch the
// gem box; 0 = the arc itself collects). Fire shapes:
//   A  exactly one move strictly WORST, the other four EQUAL-BEST  (negHold shape)
//   B  exactly one move strictly BEST, the other four EQUAL-WORSE
//   Arel/Brel: same but the other four need not tie.
// Scope (supervisor): grounded + objective at or ABOVE the cat's y - the
// complement of EXIT_FACT, so the two facts never double-count the same state.
//
// Run: node experiments/census_grounded_route.cjs
//      GDUMP=<level> node experiments/census_grounded_route.cjs <ep-substr> <n>
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");
const { simulate } = require("../arc.cjs");

const DUMP = process.env.GDUMP
  ? { level: +process.env.GDUMP, ep: process.argv[2], n: +(process.argv[3] || 8) }
  : null;
const ROOT = path.resolve(__dirname, "..", "..");
const GEM_SPAWNS = require("./gem_table.cjs")();

// Collector floors, same convention as census_float_exit.cjs / negHoldTargets:
// platforms from which some grounded jump's traced arc passes the gem's 16x16 box.
const collectCache = new Map();
function collectPlatforms(level, gx, gy, h) {
  const ck = `${level}:${gx},${gy}:${h}`;
  if (collectCache.has(ck)) return collectCache.get(ck);
  const hit = (cx, cy) => cx < gx + 8 && cx + 1 > gx - 8 && cy - h < gy + 8 && cy > gy - 8;
  const set = new Set();
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
  collectCache.set(ck, set);
  return set;
}

function bfsDistToSet(edges, src, targets) {
  if (targets.has(src)) return 0;
  const seen = new Set([src]);
  let front = [src];
  for (let d = 0; front.length; d++) {
    const next = [];
    for (const u of front) for (const v of (edges[u] || [])) {
      if (targets.has(v)) return d + 1;
      if (seen.has(v)) continue;
      seen.add(v); next.push(v);
    }
    front = next;
  }
  return Infinity;
}

const ACTS = ["left", "right", "jump", "jump_left", "jump_right"];
function groundedMoveFact(snap, gx, gy, mf) {
  const catX = snap.cat.x, catY = snap.cat.y, h = snap.cat.height || 18;
  if (gy > catY) return { reason: "objBelow" }; // EXIT_FACT's scope, skip
  const targets = collectPlatforms(snap.level, gx, gy, h);
  if (!targets.size) return { reason: "unreachable" };
  const here = REACH.platformKeyUnder(snap.level, catX, catY);
  if (!here) return { reason: "noFloor" };
  if (targets.has(here)) return { reason: "collectFromHere" };
  const g4 = REACH.graph(snap.level, h);
  const hit = (cx, cy) => cx < gx + 8 && cx + 1 > gx - 8 && cy - h < gy + 8 && cy > gy - 8;
  const score = {};
  for (const act of ACTS) {
    let touch = false;
    const r = simulate(snap.level, catX, catY, 0, h, act, mf, { grounded: true, onFrame: (fx, fy) => { if (hit(fx, fy)) touch = true; } });
    if (touch) { score[act] = 0; continue; }
    if (r.outcome !== "landed") { score[act] = Infinity; continue; }
    const lk = REACH.platformKeyUnder(snap.level, r.x, r.y);
    score[act] = !lk ? Infinity : targets.has(lk) ? 0 : bfsDistToSet(g4.edges, lk, targets);
  }
  const vals = ACTS.map((a) => score[a]);
  const min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) return { reason: "allEqual", score };
  const nMin = vals.filter((v) => v === min).length, nMax = vals.filter((v) => v === max).length;
  const bad = ACTS[vals.indexOf(max)], best = ACTS[vals.indexOf(min)];
  return {
    score, bad, best,
    A: nMax === 1 && nMin === vals.length - 1,
    B: nMin === 1 && nMax === vals.length - 1,
    Arel: nMax === 1,
    Brel: nMin === 1,
  };
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

function endpointName(arch) {
  const m = arch.match(/run_level_\d+_(.+)\.json$/);
  const byom = arch.match(/byom\/([^/]+)\//);
  const ep = m ? m[1] : "?";
  return byom ? `${byom[1]}/${ep}` : ep;
}

function evaluate(e, level) {
  if (!e.onPlatform) return { reason: "airborne" };
  if (!/^gem_[abc]$/.test(e.objective)) return { reason: "notGem" };
  const idx = { gem_a: 0, gem_b: 1, gem_c: 2 }[e.objective];
  const gs = GEM_SPAWNS[level] && GEM_SPAWNS[level][idx];
  if (!gs) return { reason: "notGem" };
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const dd = 0.2 * mf;
  const snap = {
    level, onPlatform: true, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 0, height: e.cat.h || 18 },
    drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
  };
  const r = groundedMoveFact(snap, gs[0], gs[1], mf);
  if (r.reason) return r;
  return { ...r, fire: true, move: e.move };
}

const byKey = {};
const reason = {};
const SH = ["A", "B", "Arel", "Brel"];
const tot = {}; for (const s of SH) tot[s] = { fire: 0, follow: 0 };
let nDec = 0;
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (DUMP) {
    if (!endpointName(arch).includes(DUMP.ep) || d.levelIndex !== DUMP.level) continue;
    for (const e of d.log) {
      const r = evaluate(e, d.levelIndex);
      if (!r.fire) continue;
      const sc = Object.entries(r.score).map(([k, v]) => `${k}=${v === Infinity ? "X" : v}`).join(" ");
      console.log(`${path.dirname(arch).split("/").slice(-1)} step ${e.step} (${e.cat.x},${e.cat.y}) mf${e.movingFrames} obj ${e.objective} [${sc}] A=${+r.A} B=${+r.B} BAD=${r.bad} BEST=${r.best} move=${e.move}`);
      if (--DUMP.n <= 0) process.exit(0);
    }
    continue;
  }
  // Archives carry no `cleared` field: an isolated run cleared iff it observed
  // the advance out of the target level (sawAdvance) or won the game.
  const key = `${endpointName(arch)}:${d.levelIndex}:${!!(d.sawAdvance || d.won)}`;
  if (!byKey[key]) byKey[key] = { total: 0, A: [0, 0], B: [0, 0], Arel: [0, 0], Brel: [0, 0] };
  for (const e of d.log) {
    nDec++;
    const r = evaluate(e, d.levelIndex);
    if (r.reason === "airborne" || r.reason === "notGem") continue;
    byKey[key].total++;
    reason[r.reason || "fired"] = (reason[r.reason || "fired"] || 0) + 1;
    if (!r.fire) continue;
    for (const s of SH) {
      if (!r[s]) continue;
      tot[s].fire++;
      byKey[key][s][0]++;
      const ok = s.startsWith("A") ? r.move !== r.bad : r.move === r.best;
      if (ok) { tot[s].follow++; byKey[key][s][1]++; }
    }
  }
}
if (DUMP) process.exit(0);
const pct = (a, b) => (b ? ((100 * a / b).toFixed(1) + "%") : "-");
console.log(`decisions: ${nDec}; grounded gem-obj-at-or-above tallied: ${Object.values(reason).reduce((a, b) => a + b, 0)}`);
console.log("reason tallies:", JSON.stringify(reason));
for (const s of SH) console.log(`shape ${s}: fire ${tot[s].fire}, follow ${tot[s].follow} (${pct(tot[s].follow, tot[s].fire)})`);
console.log("\nby endpoint:level:cleared (tallied >= 20, any shape fires):");
for (const [k, v] of Object.entries(byKey).filter(([k, v]) => v.total >= 20 && (SH.some((s) => v[s][0] > 0) || k.endsWith(":true"))).sort((a, b) => b[1].total - a[1].total))
  console.log(`  ${k.padEnd(46)} n=${String(v.total).padStart(5)} ` + SH.map((s) => `${s} ${v[s][0]}/${v.total}(${pct(v[s][1], v[s][0])})`).join(" "));
