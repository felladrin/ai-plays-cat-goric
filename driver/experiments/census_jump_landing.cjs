// Jump-landing note census: where does the (re-enabled, un-gated) note ACTUALLY
// fire in archived play, split by branch: same-floor (empty landings: "reaches no
// platform other than this one") vs window (lands elsewhere, objective lost).
// The historical L2 cost (48 firings -> fail) predates GOALS_ONLY/ROUTE_FIRST;
// the current clearing archives re-measure it.   node experiments/census_jump_landing.cjs
const fs = require("fs");
const path = require("path");
const dec = require("../decision.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const GEMS = require("./gem_table.cjs")();
const SETS = [
  ["base", "out/byom/PurpleMIST-Flash-1.0", ["s1", "s2", "s3", "s4"]],
  ["EXIT", "out/byom/PurpleMIST-Flash-1.0-EXIT", ["s3", "s4", "s6", "s7"]],
];
for (const lvl of [1, 2, 3, 4]) {
  console.log(`\n== L${lvl} ==`);
  for (const [tag, rel, seeds] of SETS) {
    for (const s of seeds) {
      const p = path.join(ROOT, rel, s, `run_level_${lvl}_systemone.json`);
      if (!fs.existsSync(p)) continue;
      let d; try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
      if (!d.log) continue;
      let same = 0, win = 0, tot = 0;
      const where = {};
      for (const e of d.log) {
        if (!e.onPlatform) continue;
        const mf = e.movingFrames || 0, dd = 0.2 * mf;
        const snap = {
          level: lvl, onPlatform: true, gemsCollected: e.gemsCollected,
          gemPositions: e.gemPositions || [],
          cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: 0, height: e.cat.h || 18 },
          drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
        };
        let st; try { st = dec.buildMoveCall(snap, GEMS[lvl], e.objective, []).state; } catch { continue; }
        const note = st.split("\n").find((l) => l.startsWith("A jump from x"));
        tot++;
        if (!note) continue;
        const kind = /reaches no platform other than this one/.test(note) ? "same" : "window";
        if (kind === "same") same++; else win++;
        const k = `${e.objective}@(${Math.round(e.cat.x)},${Math.round(e.cat.y)})`;
        where[k] = (where[k] || 0) + 1;
      }
      const won = d.won || d.sawAdvance;
      const top = Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}x${n}`).join(" ");
      console.log(`  ${tag}/${s} ${won ? "CLEARED" : "failed "} grounded=${tot} same=${same} window=${win} ${top}`);
    }
  }
}
