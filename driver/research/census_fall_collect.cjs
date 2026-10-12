// FALL_COLLECT census (candidate, offline, no gate): at a falling airborne state,
// does HOLDING a steering direction carry the cat within the collect box of a
// live gem before landing/dying? arc.simulate at the REAL mf, path via onFrame.
// Narrowest true line: "If you hold <dir>, this fall passes through <gem>."
// Motivated by L6: winner steered right at the first fall and passed gem_a free;
// 19/19 ladder lives steered left (argmax) and stranded gem_a behind the
// right-side trap. Dead-ends bar (AIR_ROUTE, line 170): must be RARE and have a
// winner/loser compliance gap. No endpoint calls.
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const arc = require("../arc.cjs");
const GEMS = require("./gem_table.cjs")();
const GEM_NAMES = ["gem_a", "gem_b", "gem_c"];
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) w(p); else if (/^run_(level|full)_.*systemone\.json$/.test(f)) files.push(p); } })(CFG.OUT_DIR);
const stats = {};
const seenFirst6 = new Set();
const modelOf = (f) => (f.split("/byom/")[1] || "?").split("/")[0].replace("PurpleMIST-Flash-1.0", "FLASH").replace("Darwin-27B-ZTC", "DARWIN");
let scanned = 0, fired = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  const logs = d.log ? [["iso", d]] : d.levels ? Object.values(d.levels).map((L) => [L.level, L]) : [];
  for (const [lvlDefault, L] of logs) {
    const log = L.log || L.decisionsLog; if (!log) continue;
    const level = L.levelIndex != null ? L.levelIndex : (typeof lvlDefault === "number" ? lvlDefault : lvlDefault);
    const cleared = !!(L.sawAdvance || L.won || (d.sawAdvance && lvlDefault === "iso"));
    const levelGems = GEMS[level]; if (!levelGems) continue;
    let prevGrounded = true;
    for (const e of log) {
      const firstAir = !e.onPlatform && prevGrounded;
      prevGrounded = !!e.onPlatform;
      if (e.onPlatform || !e.cat || e.movingFrames == null) continue;
      if ((e.cat.dy || 0) <= 0) continue; // falling only
      scanned++;
      const mf = e.movingFrames;
      const live = GEM_NAMES.map((n, i) => ({ name: n, x: levelGems[i][0], y: levelGems[i][1], idx: i }))
        .filter((g) => g.idx >= (e.gemsCollected || 0) && (e.gemPositions || []).some((p) => Math.abs(p.x - g.x) < 2 && Math.abs(p.y - g.y) < 2));
      if (!live.length) continue;
      const named = [];
      for (const hold of ["left", "right", "none"]) {
        const hits = new Set();
        arc.simulate(level, e.cat.x, e.cat.y, e.cat.dy || 0, e.cat.h || 18, hold, mf, {
          grounded: false,
          onFrame: (px, py) => { for (const g of live) if (Math.hypot(px - g.x, py - g.y) < 24) hits.add(g.name); },
        });
        for (const n of hits) named.push({ hold, gem: n });
      }
      if (!named.length) continue;
      fired++;
      const varA = named.some((n) => n.gem === e.objective);
      const varB = varA && firstAir;
      if (level === 6) {
        const life = (L.deathLog || []).filter((dd) => dd.step < e.step).length;
        const firstKey = f + "|" + (L.level ?? lvlDefault) + "|" + life;
        if (!seenFirst6.has(firstKey)) {
          seenFirst6.add(firstKey);
          console.log(`FORK6 | ${f.replace(CFG.OUT_DIR + "/", "")} | step ${e.step} | named ${named.map(n => n.hold + "->" + n.gem).join(",")} | move=${e.move} | probs ${JSON.stringify(e.moveProbs || null)}`);
        }
      }
      const k = `L${String(level).padStart(2)} ${modelOf(f)} ${cleared ? "W" : "L"}`;
      const holds = new Set(named.map((n) => n.hold));
      const ok = holds.has(e.move);
      for (const [tag, on] of [["all", true], ["A", varA], ["B", varB]]) {
        if (!on) continue;
        const S = (stats[tag + "|" + k] = stats[tag + "|" + k] || { fired: 0, comply: 0, contra: 0 });
        S.fired++;
        if (ok) S.comply++; else S.contra++;
      }
    }
  }
}
console.log(`scanned falling states: ${scanned}, fired: ${fired} (${(100*fired/scanned).toFixed(1)}%)`);
for (const tag of ["all", "A", "B"]) {
  const tot = Object.entries(stats).filter(([k]) => k.startsWith(tag + "|")).reduce((a, [, S]) => [a[0] + S.fired, a[1] + S.comply], [0, 0]);
  console.log(`\n=== variant ${tag}: ${tot[0]} fired (${(100*tot[0]/scanned).toFixed(1)}% of ${scanned} falling states) ===`);
  console.log("level model outcome | fired | chose a gem-carrying hold | chose another");
  for (const k of Object.keys(stats).sort()) {
    if (!k.startsWith(tag + "|")) continue;
    const S = stats[k];
    console.log(`${k.slice(4)} | ${String(S.fired).padStart(5)} | ${String(S.comply).padStart(5)} (${(100*S.comply/S.fired).toFixed(0)}%) | ${S.contra}`);
  }
}
