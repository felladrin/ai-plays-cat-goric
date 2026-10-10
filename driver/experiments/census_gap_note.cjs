// census_gap_note.cjs — how often does the move-prompt gap warning fire while the
// objective is actually reached by stepping off THAT SAME edge (the case where the
// warning argues against the productive move)? Offline reconstruction only; no
// endpoint. Death history is ASSUMED empty: the gap sentence and the step-off
// landing sentences do not read it, so the census is exact for what it counts.
// See docs/flash-l4-analysis.md (L4 dither: gap note removal flips left 0.26->0.92).
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const dec = require("../decision.cjs");

const DRIVER = path.join(__dirname, "..");
const DRONE_SPEED = 0.2, CANVAS = 360, MAX_LASER_Y = 310, CAT_H = 18;

function loadGemTable() {
  const p = path.join(DRIVER, "..", "cat-goric-game", "src", "scripts", "constants", "config.ts");
  const src = fs.readFileSync(p, "utf8");
  const at = src.indexOf("gemsPositionsPerLevel");
  const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2;
  let dep = 0, i = st;
  for (; i < seg.length; i++) {
    if (seg[i] === "[") dep++;
    else if (seg[i] === "]") { dep--; if (!dep) break; }
  }
  return eval(seg.slice(st, i + 1));
}

const files = [];
(function w(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) w(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p);
  }
})(CFG.OUT_DIR);

// "x 156..208 at y 241" occurrences in the state text.
const PLAT_RE = /x (\d+)\.\.(\d+) at y (\d+)/g;
// The step-off landing sentence for one side (dots inside ranges are never
// followed by a space, so the boundary is the first ". ").
function landingsFor(state, SIDE) {
  const i = state.indexOf(`Step off the ${SIDE} end (x `);
  if (i < 0) return null;
  const m = state.slice(i).match(/platform ((?:(?!\. ).)*?)\. /);
  return m ? m[1] : null;
}

const stats = {}; // level -> {scanned, fired, sameEdge, otherEdge, noLand}
let scanned = 0, fired = 0, sameEdge = 0, err = 0, skipped = 0;
const examples = [];

for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(f.match(/^run_level_(\d+)_/)[1]);
  const GEMS = loadGemTable();
  const levelGems = GEMS[level];
  if (!levelGems) continue;
  const cleared = !!(d.sawAdvance || d.won);
  const S = (stats[level] = stats[level] || { scanned: 0, fired: 0, sameEdge: 0, W: 0, L: 0, Wfire: 0, Lfire: 0 });
  for (const entry of d.log) {
    if (!entry.onPlatform || !entry.objective || entry.movingFrames == null || !entry.cat) { skipped++; continue; }
    let call;
    try {
      const mf = entry.movingFrames, inset = DRONE_SPEED * mf;
      const snap = {
        level,
        gemsCollected: entry.gemsCollected,
        aliveGems: entry.gemPositions ? entry.gemPositions.length : 3,
        gemPositions: entry.gemPositions || [],
        moving: false,
        onPlatform: true,
        cat: { x: entry.cat.x, y: entry.cat.y, dx: 0, dy: 0, height: CAT_H },
        drones: {
          tl: { x: 0, y: 1 + inset },
          tr: { x: CANVAS - 1 - inset, y: 0 },
          bl: { x: 1 + inset, y: MAX_LASER_Y },
          br: { x: CANVAS, y: MAX_LASER_Y - inset },
        },
      };
      call = dec.buildMoveCall(snap, levelGems, entry.objective, []);
    } catch { err++; continue; }
    scanned++; S.scanned++;
    const state = call.state;
    const g = state.match(/The gap to the (LEFT|RIGHT) is (\d+)px wide/);
    if (!g) continue;
    fired++; S.fired++;
    if (cleared) S.Wfire++; else S.Lfire++;
    const SIDE = g[1], side = SIDE.toLowerCase();
    const land = landingsFor(state, SIDE);
    const t = call.target;
    if (!land || !t || t.y == null) continue;
    // The objective's floor: the platform whose span contains target.x with top y
    // at or below the target (game y grows downward), nearest one.
    let best = null, m;
    PLAT_RE.lastIndex = 0;
    while ((m = PLAT_RE.exec(state))) {
      const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (t.x >= a && t.x <= b && y >= t.y - 1 && (!best || y < best.y)) best = { a, b, y };
    }
    if (!best) continue;
    const tag = `x ${best.a}..${best.b} at y ${best.y}`;
    if (land.includes(tag)) { sameEdge++; S.sameEdge++; if (examples.length < 12) examples.push(`L${level} ${cleared ? "W" : "L"} x${entry.cat.x} obj=${entry.objective} edge=${side} target=(${t.x},${t.y}) floor=${tag}`); }
  }
}

console.log(`scanned ${scanned} grounded decisions (skipped ${skipped}, errors ${err})`);
console.log(`gap note fired ${fired}; objective reached by stepping off THAT edge: ${sameEdge}`);
console.log("per level: scanned / fired / same-edge-reached / firedW / firedL");
for (const lv of Object.keys(stats).map(Number).sort((a, b) => a - b)) {
  const S = stats[lv];
  if (S.fired) console.log(`L${String(lv).padStart(2)}: ${S.scanned} / ${S.fired} / ${S.sameEdge} / ${S.Wfire} / ${S.Lfire}`);
}
console.log("\nexamples (same-edge):");
for (const e of examples) console.log(" ", e);
