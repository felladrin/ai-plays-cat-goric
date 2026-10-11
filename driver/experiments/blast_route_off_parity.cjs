// Explicit off-arm check: current decision.cjs with ROUTE_ASCENT unset must be
// BYTE-identical to git HEAD's decision.cjs over every archived grounded state
// (the distToCollector edit touches shared code; prove the gate-off build is inert).
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const CUR = require("../decision.cjs");
const HEAD = require("../decision_head_tmp.cjs");
function loadGemTable() {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"), "utf8");
  const at = src.indexOf("gemsPositionsPerLevel"); const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2; let dep = 0, i = st;
  for (; i < seg.length; i++) { if (seg[i] === "[") dep++; else if (seg[i] === "]") { dep--; if (!dep) break; } }
  return eval(seg.slice(st, i + 1));
}
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) w(p); else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p); } })(CFG.OUT_DIR);
delete process.env.ROUTE_ASCENT;
let n = 0, diff = 0, err = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(path.basename(f).match(/^run_level_(\d+)_/)[1]);
  const GEMS = loadGemTable(); const levelGems = GEMS[level]; if (!levelGems) continue;
  for (const entry of d.log) {
    if (!entry.onPlatform || !entry.objective || entry.movingFrames == null || !entry.cat) continue;
    try {
      const mf = entry.movingFrames, inset = 0.2 * mf;
      const snap = { level, gemsCollected: entry.gemsCollected, aliveGems: entry.gemPositions ? entry.gemPositions.length : 3,
        gemPositions: entry.gemPositions || [], moving: false, onPlatform: true,
        cat: { x: entry.cat.x, y: entry.cat.y, dx: 0, dy: 0, height: 18 },
        drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } } };
      const a = CUR.buildMoveCall(snap, levelGems, entry.objective, []).state;
      const b = HEAD.buildMoveCall(snap, levelGems, entry.objective, []).state;
      n++;
      if (a !== b) { diff++; if (diff <= 3) console.log("DIFF:", f, entry.cat.x, entry.cat.y, entry.objective); }
    } catch { err++; }
  }
}
console.log(`off-arm parity: ${n} states compared, ${diff} diffs, ${err} errors`);
process.exit(diff ? 1 : 0);
