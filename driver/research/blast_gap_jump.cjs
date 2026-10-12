// GAP_JUMP blast: (a) gate OFF must be byte-identical to git HEAD's decision.cjs
// over every archived grounded state (the jumpUpNote edit touches a shared line);
// (b) gate ON must differ ONLY by the appended crossing sentence (pure append).
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
// decision.cjs snapshots some flags at module load (JUMP_FACTS), so the env must
// be set BEFORE the requires.
process.env.JUMP_FACTS = "1"; // the gap-jump sentence lives on the JUMP_FACTS line
for (const k of ["PRUNE_FATAL", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.ROUTE_ASCENT;
const CUR = require("../decision.cjs");
const HEAD = require("../decision_head_tmp.cjs");
const CLAUSE_RE = / From this floor, (?:a jump to the (?:RIGHT|LEFT) crosses to platform x [\d.]+\.\.[\d.]+ at y [\d.]+)(?:; a jump to the (?:RIGHT|LEFT) crosses to platform x [\d.]+\.\.[\d.]+ at y [\d.]+)*\./g;
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
let n = 0, fired = 0, badHead = 0, badPure = 0, err = 0;
const perLevel = {};
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !Array.isArray(d.log)) continue;
  const level = d.levelIndex != null ? d.levelIndex : Number(path.basename(f).match(/^run_level_(\d+)_/)[1]);
  const GEMS = loadGemTable(); const levelGems = GEMS[level]; if (!levelGems) continue;
  const S = (perLevel[level] = perLevel[level] || { scanned: 0, fired: 0 });
  for (const entry of d.log) {
    if (!entry.onPlatform || !entry.objective || entry.movingFrames == null || !entry.cat) continue;
    try {
      const mf = entry.movingFrames, inset = 0.2 * mf;
      const snap = { level, gemsCollected: entry.gemsCollected, aliveGems: entry.gemPositions ? entry.gemPositions.length : 3,
        gemPositions: entry.gemPositions || [], moving: false, onPlatform: true,
        cat: { x: entry.cat.x, y: entry.cat.y, dx: 0, dy: 0, height: 18 },
        drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } } };
      delete process.env.GAP_JUMP;
      const off = CUR.buildMoveCall(snap, levelGems, entry.objective, []).state;
      const head = HEAD.buildMoveCall(snap, levelGems, entry.objective, []).state;
      process.env.GAP_JUMP = "1";
      const on = CUR.buildMoveCall(snap, levelGems, entry.objective, []).state;
      delete process.env.GAP_JUMP;
      n++; S.scanned++;
      if (off !== head) { badHead++; if (badHead <= 3) console.log("HEAD DIFF:", f, entry.cat.x, entry.cat.y); }
      if (off === on) continue;
      fired++; S.fired++;
      if (on.replace(CLAUSE_RE, "") !== off) { badPure++; if (badPure <= 3) console.log("NON-PURE:", f, entry.cat.x, entry.cat.y); }
    } catch { err++; }
  }
}
console.log(`scanned ${n} (errors ${err})`);
console.log(`gate-off vs git HEAD diffs: ${badHead} (must be 0)`);
console.log(`GAP_JUMP fired ${fired}; non-pure diffs: ${badPure} (must be 0)`);
for (const lv of Object.keys(perLevel).map(Number).sort((a, b) => a - b)) {
  const S = perLevel[lv]; if (S.fired) console.log(`L${String(lv).padStart(2)}: ${S.scanned} scanned / ${S.fired} fired`);
}
