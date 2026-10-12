// DESC_HONEST blast: rebuild the objective crits and the move state for every
// archived decision with the gate OFF and ON; count text diffs per level.
// NOTE: DESC_HONEST was rejected and removed from decision.cjs; running this now
// correctly reports 0 diffs (no gate exists). See dead-ends.md.
// Expectation: diffs only at firing states (census_desc_honest.cjs), so the
// blast equals the firing count; gate-off is the baseline by construction.
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");
const GEM_SPAWNS = require("./gem_table.cjs")();
const ROOT = path.resolve(__dirname, "..", "..");
const archives = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) archives.push(p);
  }
})(path.join(ROOT, "out"));
function dronesAt(F) {
  return { tl: { x: 0, y: 1 + 0.2 * F }, tr: { x: 359 - 0.2 * F, y: 0 }, bl: { x: 1 + 0.2 * F, y: 310 }, br: { x: 360, y: 310 - 0.2 * F } };
}
const perLevel = {};
let total = 0, diffs = 0, errs = 0;
for (const arch of archives) {
  let d; try { d = JSON.parse(fs.readFileSync(arch, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length) continue;
  const lvl = d.levelIndex;
  const spawns = GEM_SPAWNS[lvl];
  for (const e of d.log) {
    const snap = {
      level: lvl, gemsCollected: e.gemsCollected, aliveGems: (e.gemPositions || []).length,
      gemPositions: e.gemPositions || [], onPlatform: e.onPlatform, moving: true,
      cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      drones: dronesAt(e.movingFrames || 0),
    };
    let off, on;
    try {
      delete process.env.DESC_HONEST;
      const ocO = dec.buildObjectiveCall(snap, spawns, []);
      const mcO = dec.buildMoveCall(snap, spawns, e.objective, []);
      process.env.DESC_HONEST = "1";
      const ocN = dec.buildObjectiveCall(snap, spawns, []);
      const mcN = dec.buildMoveCall(snap, spawns, e.objective, []);
      off = JSON.stringify([Object.entries(ocO.questions.objective.criteria).map(([n,c])=>n+": "+c).sort(), mcO.state]);
      on = JSON.stringify([Object.entries(ocN.questions.objective.criteria).map(([n,c])=>n+": "+c).sort(), mcN.state]);
    } catch (err) { errs++; continue; }
    total++;
    if (off !== on) { diffs++; perLevel[lvl] = (perLevel[lvl] || 0) + 1; }
  }
}
delete process.env.DESC_HONEST;
console.log(`rebuilt ${total} decisions (${errs} errors), text diffs: ${diffs}`);
console.log("per level:", JSON.stringify(perLevel));
