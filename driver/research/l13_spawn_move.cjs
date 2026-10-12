// L13 spawn-life MOVE reconstruction: what did the move call actually say at
// the spawn-life decisions where the cat walked right off floor(9..61@62) into
// the gap toward gem_c's floor? Census-style snap from the archive entry.
//   node research/l13_spawn_move.cjs [seed]
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const GEMS = require("./gem_table.cjs")()[13];
const seed = process.argv[2] || "s3";

function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}

const d = JSON.parse(fs.readFileSync(path.join(ROOT, `out/byom/PurpleMIST-Flash-1.0-EXIT/${seed}/run_level_13_systemone.json`), "utf8"));
for (const e of d.log) {
  if (e.step > 30 || e.gemsCollected !== 0 || !e.onPlatform) continue;
  const mf = e.movingFrames || 0;
  const snap = {
    level: 13, gemsCollected: e.gemsCollected, aliveGems: e.gemPositions.length,
    gemPositions: e.gemPositions, onPlatform: true, moving: true,
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: dronesAt(mf),
  };
  const oc = dec.buildObjectiveCall(snap, GEMS, []);
  const mc = dec.buildMoveCall(snap, GEMS, e.objective, []);
  console.log(`\n===== step ${e.step} cat (${e.cat.x},${e.cat.y}) mf ${mf} obj=${e.objective} move=${e.move} =====`);
  console.log(`objective menu: ${Object.keys(oc.questions.objective.criteria).join(", ")}`);
  console.log(`MOVE STATE:\n${mc.state}`);
  console.log(`move criteria: ${Object.keys(mc.questions.move.criteria).join(", ")}`);
}
