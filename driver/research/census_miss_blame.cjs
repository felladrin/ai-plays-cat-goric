// MISS_BLAME census: for each life ending with a live gem, find the logged
// decision of CLOSEST APPROACH to that gem over the life, and report the key
// (position), the move held at that decision, and the distance. Line candidate:
// "last life passed within Dpx of gem_X at K holding M and never collected it."
// Question: does the closest approach land on the L6 fork (127.25,112.4) or the
// L4 gap edge (140.25,93) / its landing (~202,93)? Logged positions only.
const fs = require("fs");
const GEMS = require("./gem_table.cjs")();
const GEM_NAMES = ["gem_a", "gem_b", "gem_c"];
const FORK = [127.25, 112.4];
const GAP_EDGE = [140.25, 93];
const GAP_LAND = [202, 93];
const near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
for (const [file, level] of process.argv.slice(2).map((a) => [a.split("@")[0], Number(a.split("@")[1])])) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const L = d.levels[level]; if (!L) { console.log(`${file} L${level}: no level`); continue; }
  const dl = [...L.decisionsLog].sort((a, b) => a.step - b.step);
  const deaths = L.deathLog.map((x) => x.step).sort((a, b) => a - b);
  console.log(`\n=== ${file} L${level} (${deaths.length} lives) ===`);
  let forkHits = 0, gapHits = 0, livesWith = 0;
  for (let i = 0; i < deaths.length; i++) {
    const lo = i === 0 ? -1 : deaths[i - 1];
    const life = dl.filter((x) => x.step > lo && x.step < deaths[i]);
    if (!life.length) continue;
    const last = life[life.length - 1];
    const alive = (last.gemPositions || []).map((p, ) => GEM_NAMES[GEMS[level].findIndex((g) => Math.abs(g[0] - p.x) < 2 && Math.abs(g[1] - p.y) < 2)]).filter((n) => n);
    if (!alive.length) continue;
    livesWith++;
    const parts = [];
    for (const name of alive) {
      const gi = GEM_NAMES.indexOf(name);
      const g = GEMS[level][gi];
      let best = null;
      for (const e of life) {
        const dist = Math.hypot(e.cat.x - g[0], e.cat.y - g[1]);
        if (!best || dist < best.dist) best = { dist, e };
      }
      const p = [best.e.cat.x, best.e.cat.y];
      if (level === 6 && near(p, FORK, 20)) forkHits++;
      if (level === 4 && (near(p, GAP_EDGE, 20) || near(p, GAP_LAND, 20))) gapHits++;
      parts.push(`${name}: ${Math.round(best.dist)}px at ${p} hold=${best.e.move} step ${best.e.step}`);
    }
    console.log(`life ${i}: ${parts.join(" | ")}`);
  }
  console.log(`lives with a live gem at death: ${livesWith}; closest-approach on the FORK (L6): ${forkHits}; on the GAP edge/landing (L4): ${gapHits}`);
}
