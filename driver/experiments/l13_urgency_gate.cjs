// L13 spawn-life URGENCY gate census. Every life every seed takes gem_b(72,152)
// then gem_a(129,200), then gem_c(180,51) BURNS (deadline ~250) -> unwinnable
// reset. gem_c is DESTROYED FIRST and should go first; the question is why the
// DESTROYED FIRST annotation never moves the objective at the spawn life.
// Rebuilds the REAL buildObjectiveCall from each archive entry (census-style
// snap: drones from movingFrames, gemPositions verbatim) and reports whether
// the annotation landed in the crit; URG_DEBUG in decision.cjs prints the gates.
//   node experiments/l13_urgency_gate.cjs [maxStep] [level]
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const LEVEL = +(process.argv[3] || 13);
const GEMS = require("./gem_table.cjs")()[LEVEL];
const MAXSTEP = +(process.argv[2] || 48);

const archives = fs.readdirSync(path.join(ROOT, "out/byom"))
  .filter((m) => /^PurpleMIST-Flash-1.0-EXIT$/.test(m))
  .flatMap((m) => fs.readdirSync(path.join(ROOT, "out/byom", m))
    .filter((s) => /^s\d+$/.test(s))
    .map((s) => path.join(ROOT, "out/byom", m, s, `run_level_${LEVEL}_systemone.json`)))
  .filter((p) => fs.existsSync(p));

function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}

let n = 0, fired = 0;
const blocked = {};
for (const arch of archives) {
  const seed = path.basename(path.dirname(arch));
  const d = JSON.parse(fs.readFileSync(arch, "utf8"));
  for (const e of d.log) {
    if (e.step > MAXSTEP) break;
    if (e.gemsCollected !== 0) continue; // spawn life only
    const mf = e.movingFrames || 0;
    const snap = {
      level: LEVEL, gemsCollected: e.gemsCollected, aliveGems: (e.gemPositions || []).length,
      gemPositions: e.gemPositions || [], onPlatform: e.onPlatform, moving: true,
      cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      drones: dronesAt(mf),
    };
    n++;
    process.env.URG_DEBUG = "1";
    let oc;
    try { oc = dec.buildObjectiveCall(snap, GEMS, []); } catch (err) { console.log(`${seed} step ${e.step}: buildObjectiveCall threw: ${err.message}`); continue; }
    delete process.env.URG_DEBUG;
    const crits = oc.questions.objective.criteria;
    const urg = Object.entries(crits).find(([, c]) => c.includes("DESTROYED FIRST"));
    if (urg) fired++;
    console.log(`${seed} step ${String(e.step).padStart(3)} cat (${e.cat.x},${e.cat.y}) mf ${mf} obj=${e.objective} urgency=${urg ? urg[0] : "NONE"}`);
  }
}
console.log(`\nspawn-life decisions (<= step ${MAXSTEP}, gc=0): ${n}, URGENCY annotated: ${fired}`);
