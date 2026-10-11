// AIR_EDGE blast over archived AIRBORNE states. The archives do not log airborne
// dy, so every state is rendered falling at dy = 1 (the sentence only reads the
// position and the floor; dy only enters the steer-back arc). Compares the move
// prompt of a reference driver directory with this one, gate off (must be 0
// diffs) and on (counted per level, with the first example per level).
//   node experiments/blast_air_edge.cjs <refDriverDir> <archiveRoot>
const fs = require("fs");
const path = require("path");
const REF = require(path.join(path.resolve(process.argv[2]), "decision.cjs"));
const CUR = require("../decision.cjs");
const GEMS = require("./gem_table.cjs")();
const ROOT = path.resolve(process.argv[3]);
const files = [];
(function w(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f);
  if (fs.statSync(p).isDirectory()) w(p); else if (/^(run_level_\d+_|run_full_).*\.json$/.test(f)) files.push(p); } })(ROOT);
let n = 0, offDiff = 0, err = 0;
const per = {}, ex = {};
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  const sets = d.log ? [[d.levelIndex, d.log]] : Object.entries(d.levels || {}).map(([k, l]) => [Number(k), l.decisionsLog || []]);
  for (const [level, log] of sets) {
    const lg = GEMS[level];
    if (!lg || !Array.isArray(log)) continue;
    for (const e of log) {
      if (e.onPlatform || !e.objective || e.movingFrames == null || !e.cat) continue;
      const mf = e.movingFrames;
      const snap = { level, gemsCollected: e.gemsCollected, aliveGems: e.gemPositions ? e.gemPositions.length : 3, gemPositions: e.gemPositions || [],
        moving: true, onPlatform: false, cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 1, height: 18 },
        drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
      try {
        delete process.env.AIR_EDGE;
        const a = REF.buildMoveCall(snap, lg, e.objective, []).state;
        const b = CUR.buildMoveCall(snap, lg, e.objective, []).state;
        process.env.AIR_EDGE = "1";
        const c = CUR.buildMoveCall(snap, lg, e.objective, []).state;
        delete process.env.AIR_EDGE;
        n++;
        if (a !== b) offDiff++;
        const P = (per[level] = per[level] || { n: 0, on: 0 });
        P.n++;
        if (c !== b) { P.on++; if (!ex[level]) ex[level] = c.split("\n").find((l) => l.includes("in the air just past")); }
      } catch { err++; }
    }
  }
}
console.log(`airborne states ${n} (errors ${err}); gate-off vs reference diffs: ${offDiff} (must be 0)`);
for (const lv of Object.keys(per).sort((x, y) => x - y)) if (per[lv].on) console.log(`L${lv}: ${per[lv].on} / ${per[lv].n} changed | ${(ex[lv] || "").slice(0, 160)}`);
