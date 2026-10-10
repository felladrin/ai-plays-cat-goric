// L13 s5 climb oscillation: diff the reconstructed move state between
// consecutive oscillating decisions. Census-style snap from archive entries.
//   node experiments/l13_oscillation.cjs [seed] [stepA] [stepB]
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const GEMS = require("./gem_table.cjs")()[13];
const seed = process.argv[2] || "s5";
const steps = process.argv.slice(3).map(Number);

function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}

const d = JSON.parse(fs.readFileSync(path.join(ROOT, `out/byom/PurpleMIST-Flash-1.0-EXIT/${seed}/run_level_13_systemone.json`), "utf8"));
const states = {};
for (const e of d.log) {
  if (!steps.includes(e.step)) continue;
  const mf = e.movingFrames || 0;
  const snap = {
    level: 13, gemsCollected: e.gemsCollected, aliveGems: e.gemPositions.length,
    gemPositions: e.gemPositions, onPlatform: e.onPlatform, moving: true,
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: dronesAt(mf),
  };
  const mc = dec.buildMoveCall(snap, GEMS, e.objective, []);
  states[e.step] = mc.state;
  console.log(`\n===== step ${e.step} cat (${e.cat.x},${e.cat.y}) dy ${e.cat.dy} mf ${mf} obj=${e.objective} move=${e.move} =====`);
  console.log(mc.state);
}
if (steps.length === 2) {
  const [a, b] = steps.map((s) => states[s]);
  const la = a.split("\n"), lb = b.split("\n");
  console.log("\n===== DIFF step " + steps[0] + " -> step " + steps[1] + " =====");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) { console.log(`- ${la[i]}`); console.log(`+ ${lb[i]}`); }
  }
}
