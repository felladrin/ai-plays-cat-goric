// Render every archived grounded state with ONE driver directory and print one
// JSON line per state: the move prompt, the legal-move menu and the objective
// call. Run it once with a reference checkout and once with the candidate, then
// compare the outputs line by line (blast_shrink_geom.py). Loading a whole driver
// directory, not one copied decision.cjs, is the point: a geometry change lives in
// arc.cjs / reachability.cjs / level_data.cjs, which a copied decision.cjs would
// still resolve from the candidate tree.
//   node experiments/render_states.cjs <driverDir> <archiveRoot> > out.jsonl
// Env (flags, SHRINK_GEOM) must be set by the caller: decision.cjs reads some at load.
const fs = require("fs");
const path = require("path");
const DRV = path.resolve(process.argv[2]);
const ROOT = path.resolve(process.argv[3]);
const D = require(path.join(DRV, "decision.cjs"));
const LIVE = fs.existsSync(path.join(DRV, "platform_live.cjs")) ? require(path.join(DRV, "platform_live.cjs")) : null;
const GEMS = require(path.join(DRV, "experiments", "gem_table.cjs"))();
const files = [];
(function w(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f);
  if (fs.statSync(p).isDirectory()) w(p); else if (/^(run_level_\d+_|run_full_).*\.json$/.test(f)) files.push(p); } })(ROOT);
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  const sets = d.log ? [[d.levelIndex, d.log]] : Object.entries(d.levels || {}).map(([k, l]) => [Number(k), l.decisionsLog || []]);
  for (const [level, log] of sets) {
    const levelGems = GEMS[level];
    if (!levelGems || !Array.isArray(log)) continue;
    log.forEach((e, i) => {
      if (!e.onPlatform || !e.objective || e.movingFrames == null || !e.cat) return;
      const mf = e.movingFrames, inset = 0.2 * mf;
      const snap = { level, gemsCollected: e.gemsCollected, aliveGems: e.gemPositions ? e.gemPositions.length : 3,
        gemPositions: e.gemPositions || [], moving: false, onPlatform: true,
        cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 0, height: 18 },
        drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } } };
      if (LIVE) LIVE.setClock(mf);
      const row = { f: path.relative(ROOT, f), level, i };
      try { row.move = D.buildMoveCall(snap, levelGems, e.objective, []).state; } catch (err) { row.move = "ERR " + err.message; }
      try { row.menu = Object.keys(D.legalActions(snap)).join(","); } catch (err) { row.menu = "ERR " + err.message; }
      try { row.obj = JSON.stringify(D.buildObjectiveCall(snap, levelGems, [])); } catch (err) { row.obj = "ERR " + err.message; }
      process.stdout.write(JSON.stringify(row) + "\n");
    });
  }
}
