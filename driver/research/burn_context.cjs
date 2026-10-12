// Burn context: for each gem BURN (a gem vanishes, gemsCollected did not
// increase, and the alive count does not recover - a death respawn would
// restore it), report the gem, mf, cat position, and the objective/move mix of
// the ~20 preceding decisions. Also prints route_clock.gemDeadline per gem so
// the race is visible.
//   node research/burn_context.cjs <archive.json> [level]
const fs = require("fs");
const REACH = require("../reachability.cjs");
const RC = require("../route_clock.cjs");
const GEMS = require("./gem_table.cjs");

const arch = process.argv[2];
const d = JSON.parse(fs.readFileSync(arch, "utf8"));
const LEVEL = +process.argv[3] || d.levelIndex;
const spawns = GEMS()[LEVEL];
const names = ["gem_a", "gem_b", "gem_c"];
const nameOf = (p) => {
  let bi = -1, bd = 1e9;
  spawns.forEach((sp, i) => { const dd = Math.hypot(p.x - sp[0], p.y - sp[1]); if (dd < bd) { bd = dd; bi = i; } });
  return names[bi];
};
console.log(`${arch} level ${LEVEL} cleared=${!!(d.sawAdvance || d.won)} decisions=${d.log.length}`);
console.log("deadlines:", spawns.map((sp, i) => `${names[i]}(${sp[0]},${sp[1]})=${Math.round(RC.gemDeadline(sp[0], sp[1]))}`).join(" "));

const liveSets = d.log.map((e) => new Set(e.gemPositions.map(nameOf)));
// Burn = gc + alive drops below 3 (or below the previous decision) without a
// collection. Death respawns and unwinnable resets RESTORE the live set, so
// "gone forever" is the wrong test; the count invariant is the right one.
const maxMf = Math.max(...d.log.map((e) => e.movingFrames || 0));
console.log(`max mf in run: ${maxMf}`);
for (let i = 1; i < d.log.length; i++) {
  const e = d.log[i], p = d.log[i - 1];
  const cur = new Set(e.gemPositions.map(nameOf));
  const prev = new Set(p.gemPositions.map(nameOf));
  for (const g of prev) if (!cur.has(g) && e.gemsCollected === p.gemsCollected) {
    const win = d.log.slice(Math.max(0, i - 20), i);
    const objs = {}, mvs = {}, floors = {};
    for (const w of win) {
      objs[w.objective] = (objs[w.objective] || 0) + 1;
      mvs[w.move] = (mvs[w.move] || 0) + 1;
      const k = w.onPlatform ? REACH.platformKeyUnder(LEVEL, w.cat.x, w.cat.y) : "airborne";
      floors[k] = (floors[k] || 0) + 1;
    }
    console.log(`\n${g} BURNED at step ${e.step} mf ${e.movingFrames} cat (${e.cat.x},${e.cat.y}) ${e.onPlatform ? "ground" : "air"} gc=${e.gemsCollected} alive=${cur.size}`);
    console.log(`  prev20 obj: ${JSON.stringify(objs)}`);
    console.log(`  prev20 move: ${JSON.stringify(mvs)}`);
    console.log(`  prev20 floors: ${JSON.stringify(floors)}`);
  }
}
const endSet = liveSets[d.log.length - 1];
const endGc = d.log[d.log.length - 1].gemsCollected;
for (const g of names) if (endSet.has(g) && !d.log.some((e) => e.gemsCollected > 0 && !e.gemPositions.some((p) => nameOf(p) === g) === false && false)) { /* noop */ }
console.log(`\nend state: gc=${endGc} alive=${[...endSet].join(",")}`);
