// MISS_BLAME blast: replay every run_full archive's per-life decision stream
// through the tracker exactly as the runners wire it (observeAll per decision,
// lines at death, reset after) and count prompt-visible history lines. Gate off
// must add ZERO lines to every death; gate on must add lines only after deaths
// that left a gem alive. No endpoint calls.
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const { createMissBlame } = require("../fall_blame.cjs");
const GEMS = require("./gem_table.cjs")();
const files = [];
(function w(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p);
  if (st.isDirectory()) w(p); else if (/^run_full_.*systemone\.json$/.test(f)) files.push(p); } })(CFG.OUT_DIR);
let offLines = 0, onLines = 0, deaths = 0, archives = 0;
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.levels) continue;
  archives++;
  for (const L of Object.values(d.levels)) {
    if (!L.decisionsLog || !L.deathLog) continue;
    const levelGems = GEMS[L.level]; if (!levelGems) continue;
    const NAMES = ["gem_a", "gem_b", "gem_c"];
    const dl = [...L.decisionsLog].sort((a, b) => a.step - b.step);
    const deathsSorted = L.deathLog.map((x) => x.step).sort((a, b) => a - b);
    for (const flag of [false, true]) {
      if (flag) process.env.MISS_BLAME = "1"; else delete process.env.MISS_BLAME;
      const mb = createMissBlame();
      let di = 0;
      for (const e of dl) {
        while (di < deathsSorted.length && deathsSorted[di] < e.step) {
          const n = mb.lines().length;
          if (flag) onLines += n; else offLines += n;
          deaths++;
          mb.reset(); di++;
        }
        const live = NAMES.map((n, i) => ({ name: n, x: levelGems[i][0], y: levelGems[i][1] }))
          .filter((g) => (e.gemPositions || []).some((p) => Math.abs(p.x - g.x) < 2 && Math.abs(p.y - g.y) < 2));
        mb.observeAll(e.cat.x, e.cat.y, e.move, live);
      }
    }
  }
}
console.log(`archives: ${archives}, deaths: ${deaths}`);
console.log(`gate OFF lines: ${offLines} (must be 0)`);
console.log(`gate ON lines: ${onLines}`);
