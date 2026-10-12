// ROUTE_ASCENT compliance census: at every fired state, does the move the model
// ACTUALLY chose agree with, contradict, or ignore the clause's route side?
// Contradict = a jump toward the dead-end side (the L11 loop: jump_right while
// the route leaves LEFT). Also reports per-level fire counts split by outcome.
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const DRIVER = path.join(__dirname, "..");
const CLAUSE_RE = /The shortest route to (gem_\w+) leaves this floor by jumping (LEFT|RIGHT).*?(?:do|does) not lead to it\./;
function loadGemTable() {
  const src = fs.readFileSync(path.join(DRIVER, "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"), "utf8");
  const at = src.indexOf("gemsPositionsPerLevel"); const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2; let dep = 0, i = st;
  for (; i < seg.length; i++) { if (seg[i] === "[") dep++; else if (seg[i] === "]") { dep--; if (!dep) break; } }
  return eval(seg.slice(st, i + 1));
}
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) w(p); else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p); } })(CFG.OUT_DIR);
const stats = {}; // level|outcome -> {fired, agree, contradict, neutral}
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(path.basename(f).match(/^run_level_(\d+)_/)[1]);
  const GEMS = loadGemTable(); const levelGems = GEMS[level]; if (!levelGems) continue;
  const cleared = !!(d.sawAdvance || d.won);
  for (const entry of d.log) {
    if (!entry.onPlatform || !entry.objective || entry.movingFrames == null || !entry.cat) continue;
    try {
      const mf = entry.movingFrames, inset = 0.2 * mf;
      const snap = { level, gemsCollected: entry.gemsCollected, aliveGems: entry.gemPositions ? entry.gemPositions.length : 3,
        gemPositions: entry.gemPositions || [], moving: false, onPlatform: true,
        cat: { x: entry.cat.x, y: entry.cat.y, dx: 0, dy: 0, height: 18 },
        drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } } };
      const dec = require("../decision.cjs");
      process.env.JUMP_FACTS = "1"; process.env.ROUTE_ASCENT = "1";
      const on = dec.buildMoveCall(snap, levelGems, entry.objective, []).state;
      delete process.env.ROUTE_ASCENT;
      const m = on.match(CLAUSE_RE); if (!m) continue;
      const routeLeft = m[2] === "LEFT";
      const mv = entry.move;
      const k = `L${level} ${cleared ? "W" : "L"}`;
      const S = (stats[k] = stats[k] || { fired: 0, agree: 0, contradict: 0, neutral: 0 });
      S.fired++;
      if (mv === "jump") S.neutral++;
      else if (mv === "jump_left") routeLeft ? S.agree++ : S.contradict++;
      else if (mv === "jump_right") routeLeft ? S.contradict++ : S.agree++;
      else S.neutral++;
    } catch { continue; }
  }
}
console.log("level outcome | fired | jump agrees route | jump contradicts | neutral/walk/jump");
for (const k of Object.keys(stats).sort((a, b) => Number(a.slice(1, -2)) - Number(b.slice(1, -2)))) {
  const S = stats[k];
  console.log(`${k.padEnd(6)} | ${String(S.fired).padStart(4)} | ${String(S.agree).padStart(3)} | ${String(S.contradict).padStart(4)} | ${S.neutral}`);
}
