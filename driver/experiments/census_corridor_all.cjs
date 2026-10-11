// CORRIDOR_CLOCK census, all levels: for every archived grounded decision, ask
// the SHIPPED corridorClause whether it fires (exported for exactly this), and
// at firing states classify the chosen move: does it take the route's first hop
// toward the collector (agree), jump the other way, or walk? Split by level x
// archive outcome. No endpoint calls.
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
process.env.CORRIDOR_CLOCK = "1";
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
const dec = require("../decision.cjs");
const REACH = require("../reachability.cjs");
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
const stats = {};
let statsDebug = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(path.basename(f).match(/^run_level_(\d+)_/)[1]);
  const GEMS = loadGemTable(); const levelGems = GEMS[level]; if (!levelGems) continue;
  const cleared = !!(d.sawAdvance || d.won);
  for (const entry of d.log) {
    if (!entry.onPlatform || !entry.objective || entry.movingFrames == null || !entry.cat) continue;
    const mf = entry.movingFrames, inset = 0.2 * mf;
    const snap = { level, gemsCollected: entry.gemsCollected, aliveGems: entry.gemPositions ? entry.gemPositions.length : 3,
      gemPositions: entry.gemPositions || [], moving: false, onPlatform: true,
      cat: { x: entry.cat.x, y: entry.cat.y, dx: entry.cat.dx || 0, dy: entry.cat.dy || 0, height: entry.cat.h || 18 },
      drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } } };
    const gi = "abc".indexOf((entry.objective || "").slice(-1));
    if (gi < 0 || !levelGems[gi]) continue;
    const target = { name: entry.objective, x: levelGems[gi][0], y: levelGems[gi][1] };
    let cl = "";
    try { cl = dec.corridorClause(snap, target); } catch { continue; }
    if (!cl) continue;
    // compliance: first-hop direction toward the collector
    let dir = null;
    try {
      const g = REACH.graph(level, 18);
      const here = REACH.platformKeyUnder(level, entry.cat.x, entry.cat.y);
      const gx = target.x, gy = target.y;
      let collector = null;
      for (const r of g.runs) { if (collector) break; for (const act of ["jump_right", "jump_left"]) {
        const xs = act === "jump_right" ? [r.right - 2, (r.left + r.right) / 2, r.left + 2] : [r.left + 2, (r.left + r.right) / 2, r.right - 2];
        for (const x of xs) { let hit = false;
          require("../arc.cjs").simulate(level, x, r.y, 0, 18, act, mf, { grounded: true, onFrame: (px, py) => { if (!hit && Math.hypot(px - gx, py - gy) < 24) hit = true; } });
          if (hit) { collector = REACH.runKey(r); break; } } } }
      if (collector && collector !== here) {
        const seen = new Set([here]); const q = [[here, null]];
        for (let i = 0; i < q.length && !dir; i++) {
          for (const nk of (g.edges[q[i][0]] || [])) {
            if (seen.has(nk)) continue; seen.add(nk);
            const r = g.runs.find((r) => REACH.runKey(r) === nk);
            const cur = g.runs.find((r) => REACH.runKey(r) === q[i][0]);
            const d2 = r && cur && (r.left + r.right) / 2 > (cur.left + cur.right) / 2 ? "jump_right" : "jump_left";
            const first = q[i][1] || d2;
            if (nk === collector) { dir = first; break; }
            q.push([nk, first]);
          }
        }
      }
    } catch (e) { if (process.env.CC_DEBUG) console.log("DIRERR", e.message); }
    const k = `L${String(level).padStart(2)} ${cleared ? "W" : "L"}`;
    const S = (stats[k] = stats[k] || { fired: 0, agree: 0, contra: 0, walk: 0 });
    S.fired++;
    const mv = entry.move;
    if (!dir) S.walk++;
    else if (mv === dir) S.agree++;
    else if (mv === "jump_left" || mv === "jump_right") S.contra++;
    else S.walk++;
  }
}
console.log("level outcome | fired | took route hop | other jump | walk/jump");
for (const k of Object.keys(stats).sort()) {
  const S = stats[k];
  console.log(`${k} | ${String(S.fired).padStart(4)} | ${String(S.agree).padStart(4)} | ${String(S.contra).padStart(4)} | ${S.walk}`);
}
