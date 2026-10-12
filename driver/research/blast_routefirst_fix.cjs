"use strict";
// Blast-radius differential for the ROUTE_FIRST deferral fix
// (2026-10-10): old rule (git HEAD decision.cjs) vs new rule, order-insensitive
// (sorted criteria map + sorted state lines - see the method trap in
// docs/open-problems.md, the menu RNG desyncs on entry-count changes).
// Walks every decision of every run archive under out/ and reports, per level,
// how many decisions differ in the objective menu (entry set) or in any
// objective prompt text.
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const OLD = (() => {
  // Regenerate OLD from git HEAD every run. The previous pattern (a hand-copied
  // decision_old_scratch.cjs) could silently compare the module against itself
  // if the copy was taken after the edit - which is the suspected source of the
  // invalid "0 of 57,049" result recorded on 2026-10-10.
  const cp = require("child_process");
  const os = require("os");
  const src = cp.execSync(`git -C ${path.join(__dirname, "..", "..")} show HEAD:driver/decision.cjs`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Must live in driver/: decision.cjs requires ./config.cjs etc. relatively.
  const tmp = path.join(__dirname, `..`, `.decision_head_${process.pid}.cjs`);
  fs.writeFileSync(tmp, src);
  try { return require(tmp); } finally { fs.unlinkSync(tmp); }
})();
const NEW = require("../decision.cjs");

function loadGemTable() {
  const p = path.join(__dirname, "..", "..", "cat-goric-game", "src", "scripts", "constants", "config.ts");
  const src = fs.readFileSync(p, "utf8");
  const at = src.indexOf("gemsPositionsPerLevel");
  if (at < 0) throw new Error("gemsPositionsPerLevel not found in " + p);
  const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2;
  let depth = 0, i = st;
  for (; i < seg.length; i++) {
    if (seg[i] === "[") depth++;
    else if (seg[i] === "]") { depth--; if (!depth) break; }
  }
  return eval(seg.slice(st, i + 1));
}
const GEMS = loadGemTable().map((l) => l.map((p) => ({ x: p[0], y: p[1] })));

function walk(d, files) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p);
  }
}
const files = [];
walk(CFG.OUT_DIR, files);

const canonMenu = (call) => call.objectiveNames.slice().sort().join(",");
const canonText = (call) => {
  const crit = Object.entries(call.questions.objective.criteria)
    .map(([n, c]) => n + ": " + c).sort().join("\n");
  return call.state + "\n" + crit;
};

const perLevel = {};
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || d.log.length === 0) continue;
  const li = d.levelIndex;
  if (!GEMS[li]) continue;
  const gems = GEMS[li];
  perLevel[li] = perLevel[li] || { n: 0, menuDiff: 0, textDiff: 0, oldEmpty: 0, newEmpty: 0 };
  for (const e of d.log) {
    const mf = e.movingFrames || 0;
    // Laser walls from the archived clock (0.2 droneSpeed): safeRect reads
    // left=drones.bl.x, right=drones.tr.x, top=drones.tl.y, bottom=drones.br.y;
    // the walls start at 1 and 359 and close inward by 0.2 per frame
    // (measured against the fixture's live drones at mf 273).
    const l = 1 + 0.2 * mf, r = 359 - 0.2 * mf, t = 1 + 0.2 * mf, b = 310 - 0.2 * mf;
    const snap = {
      level: li,
      gemsCollected: e.gemsCollected,
      aliveGems: 3 - e.gemsCollected,
      gemPositions: e.gemPositions,
      onPlatform: e.onPlatform,
      moving: false,
      cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      drones: {
        tl: { x: 0, y: t }, tr: { x: r, y: 0 },
        bl: { x: l, y: b }, br: { x: 360, y: b },
      },
    };
    let o, nw;
    try { o = OLD.buildObjectiveCall(snap, gems, []); } catch { continue; }
    try { nw = NEW.buildObjectiveCall(snap, gems, []); } catch { continue; }
    perLevel[li].n++;
    if (canonMenu(o) !== canonMenu(nw)) {
      perLevel[li].menuDiff++;
      if (o.objectiveNames.length === 0) perLevel[li].oldEmpty++;
      if (nw.objectiveNames.length === 0) perLevel[li].newEmpty++;
    } else if (canonText(o) !== canonText(nw)) {
      perLevel[li].textDiff++;
    }
  }
}

console.log("per-level (decisions compared | menu diff | text-only diff | old-empty | new-empty):");
let totDiff = 0;
for (const li of Object.keys(perLevel).map(Number).sort((a, b) => a - b)) {
  const s = perLevel[li];
  totDiff += s.menuDiff + s.textDiff;
  console.log(`  L${String(li).padStart(2)}: ${String(s.n).padStart(5)} | ${String(s.menuDiff).padStart(4)} | ${String(s.textDiff).padStart(4)} | ${s.oldEmpty} | ${s.newEmpty}`);
}
console.log("total differing decisions:", totDiff);
const CLEARING = [0, 1, 2, 5, 8, 9];
const clearingTouched = CLEARING.filter((li) => perLevel[li] && (perLevel[li].menuDiff || perLevel[li].textDiff));
console.log("clearing levels 0,1,2,5,8,9 touched:", JSON.stringify(clearingTouched));
