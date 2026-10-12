// GAP_JUMP census: states where the reachability graph has a SAME-HEIGHT jump
// edge off the current floor (a gap crossing a jump can make). Per level: how
// many grounded decisions sit at such states, and how often the chosen move was
// the crossing jump, split winner vs loser archives. No endpoint calls.
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const REACH = require("../reachability.cjs");
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) w(p); else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p); } })(CFG.OUT_DIR);
const stats = {}; // level|outcome -> {states, crossed, missed, other}
let total = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(path.basename(f).match(/^run_level_(\d+)_/)[1]);
  const cleared = !!(d.sawAdvance || d.won);
  let g = null;
  for (const entry of d.log) {
    if (!entry.onPlatform || entry.movingFrames == null || !entry.cat) continue;
    try {
      if (!g) g = REACH.graph(level, 18);
      const here = REACH.platformKeyUnder(level, entry.cat.x, entry.cat.y);
      if (!here) continue;
      const cur = g.runs.find((r) => REACH.runKey(r) === here);
      if (!cur) continue;
      const crossings = (g.edges[here] || []).map((k) => g.runs.find((r) => REACH.runKey(r) === k))
        .filter((r) => r && r.y === cur.y);
      if (!crossings.length) continue;
      total++;
      const mv = entry.move;
      for (const r of crossings) {
        const dir = (r.left + r.right) / 2 > entry.cat.x ? "jump_right" : "jump_left";
        const k = `L${String(level).padStart(2)} ${cleared ? "W" : "L"}`;
        const S = (stats[k] = stats[k] || { states: 0, crossed: 0, missed: 0, other: 0 });
        S.states++;
        if (mv === dir) S.crossed++;
        else if (mv === "jump_left" || mv === "jump_right") S.missed++;
        else S.other++;
      }
    } catch { continue; }
  }
}
console.log("total crossing-state x crossing-floor pairs:", total);
console.log("level outcome | states | took crossing jump | took OTHER jump | walked/jumped");
for (const k of Object.keys(stats).sort()) {
  const S = stats[k];
  console.log(`${k} | ${String(S.states).padStart(4)} | ${String(S.crossed).padStart(4)} | ${String(S.missed).padStart(4)} | ${S.other}`);
}
