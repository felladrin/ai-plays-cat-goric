// blast_gap_drop.cjs — GAP_DROP census + blast in one pass. For every grounded
// decision in every archive, rebuild the move state with the gate off and on and
// require: (a) off is the baseline (no env leakage), (b) on differs ONLY by the
// inserted clause "; stepping off this end drops onto <lands>. ". Reports per
// level x archive-outcome (fire rate) and refuses on any non-pure diff.
// Death history is assumed empty: the gap sentence, the drop clause and the
// descent sentences do not read it (the death block is a separate paragraph).
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");

const DRIVER = path.join(__dirname, "..");
const DRONE_SPEED = 0.2, CANVAS = 360, MAX_LASER_Y = 310, CAT_H = 18;
const CLAUSE_RE = /; stepping off this end drops onto (?:(?!\. ).)*?\. /g; // replaces the ". " after the gap sentence

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

const stats = {}; // level -> {scanned, fired, firedW, firedL}
let scanned = 0, fired = 0, bad = 0, err = 0;
const examples = [];

for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(path.basename(f).match(/^run_level_(\d+)_/)[1]);
  const GEMS = loadGemTable();
  const levelGems = GEMS[level];
  if (!levelGems) continue;
  const cleared = !!(d.sawAdvance || d.won);
  const S = (stats[level] = stats[level] || { scanned: 0, fired: 0, firedW: 0, firedL: 0 });
  for (const entry of d.log) {
    if (!entry.onPlatform || !entry.objective || entry.movingFrames == null || !entry.cat) continue;
    let off, on;
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
      const dec = require("../decision.cjs");
      delete process.env.GAP_DROP;
      off = dec.buildMoveCall(snap, levelGems, entry.objective, []).state;
      process.env.GAP_DROP = "1";
      on = dec.buildMoveCall(snap, levelGems, entry.objective, []).state;
      delete process.env.GAP_DROP;
    } catch { err++; continue; }
    scanned++; S.scanned++;
    if (off === on) continue;
    fired++; S.fired++;
    if (cleared) S.firedW++; else S.firedL++;
    const removed = on.replace(CLAUSE_RE, ". "); // the clause absorbed the original ". " separator
    if (removed !== off) {
      bad++;
      if (bad <= 3) console.log(`NON-PURE diff: ${f} x=${entry.cat.x} obj=${entry.objective}`);
    }
    if (examples.length < 10 && /stepping off this end drops onto/.test(on))
      examples.push(`L${level} ${cleared ? "W" : "L"} x${entry.cat.x} obj=${entry.objective}`);
  }
}

console.log(`scanned ${scanned} grounded decisions (errors ${err})`);
console.log(`GAP_DROP fired ${fired}; non-pure diffs ${bad}`);
console.log("per level: scanned / fired / firedW / firedL");
for (const lv of Object.keys(stats).map(Number).sort((a, b) => a - b)) {
  const S = stats[lv];
  if (S.fired) console.log(`L${String(lv).padStart(2)}: ${S.scanned} / ${S.fired} / ${S.firedW} / ${S.firedL}`);
}
console.log("examples:");
for (const e of examples) console.log(" ", e);
