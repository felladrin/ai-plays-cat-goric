// HEAD vs working tree, ALL gates (EXIT_FACT, REACH_FACT, DESC_HONEST) unset:
// every archived objective menu + move state must be byte-identical. Covers all
// three gates. off-state in one check. Expected: state-text diffs 0; menu diffs are the
// ungated routeBlocked fix (gem re-added to shrunken menus), counted separately.
const fs = require("fs");
const path = require("path");
const OLD = (() => {
  // Regenerate OLD from git HEAD every run (same pattern as
  // blast_routefirst_fix.cjs): a hand-copied scratch file can silently compare
  // the module against itself if copied after the edit.
  const cp = require("child_process");
  const os = require("os");
  const src = cp.execSync(`git -C ${path.join(__dirname, "..", "..")} show HEAD:driver/decision.cjs`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Must live in driver/: decision.cjs requires ./config.cjs etc. relatively.
  const tmp = path.join(__dirname, `..`, `.decision_head_${process.pid}.cjs`);
  fs.writeFileSync(tmp, src);
  try { return require(tmp); } finally { fs.unlinkSync(tmp); }
})();
const NEW = require("../decision.cjs");
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
for (const k of ["EXIT_FACT", "REACH_FACT", "DESC_HONEST"]) delete process.env[k];
const perLevel = {};
let total = 0, diffs = 0, errs = 0, menuDiffs = 0, stateDiffs = 0;
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
    let a, b, ma, mb, sa, sb;
    try {
      ma = JSON.stringify(Object.entries(OLD.buildObjectiveCall(snap, spawns, []).questions.objective.criteria).map(([n,c])=>n+": "+c).sort());
      sa = OLD.buildMoveCall(snap, spawns, e.objective, []).state;
      mb = JSON.stringify(Object.entries(NEW.buildObjectiveCall(snap, spawns, []).questions.objective.criteria).map(([n,c])=>n+": "+c).sort());
      sb = NEW.buildMoveCall(snap, spawns, e.objective, []).state;
      a = ma + "\u0000" + sa; b = mb + "\u0000" + sb;
    } catch (err) { errs++; continue; }
    total++;
    if (a !== b) {
      diffs++; perLevel[lvl] = (perLevel[lvl] || 0) + 1;
      if (ma !== mb) menuDiffs++; else stateDiffs++; // menu diffs are the ungated routeBlocked fix; state-text diffs must be 0
    }
  }
}
console.log(`HEAD vs worktree (gates off): rebuilt ${total} (${errs} errors), menu diffs: ${menuDiffs}, state-text diffs: ${stateDiffs}`);
if (diffs) console.log("per level:", JSON.stringify(perLevel));
