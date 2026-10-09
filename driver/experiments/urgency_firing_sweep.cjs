"use strict";
// urgency_firing_sweep.cjs — blast-radius check for the DESTROYED-FIRST gate.
//
// For every level, every floor run, and sample x positions with all 3 gems alive,
// build the patched objective call and record whether the URGENCY sentence fires
// and on which gem. A level that fires on many states is high blast radius; the
// gate (reachable + not one-way + not nearest) is what keeps it off the levels
// that already clear.
//
// Usage: node experiments/urgency_firing_sweep.cjs

const path = require("path");
const fs = require("fs");
const DRIVER = path.join(__dirname, "..");
const PATCH = require(path.join(DRIVER, "decision.patched_urgency.cjs"));
const REACH = require(path.join(DRIVER, "reachability.cjs"));

const src = fs.readFileSync(
  path.join(DRIVER, "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"),
  "utf8"
);
const GEMS = JSON.parse(src.match(/gemsPositionsPerLevel[^=]*=\s*(\[[\s\S]*?\n\]);/)[1].replace(/,(\s*[\]\}])/g, "$1"));
const nameOf = ["gem_a", "gem_b", "gem_c"];

function snapAt(level, run, x, mf, aliveIdx) {
  const inset = 0.2 * mf;
  return {
    level,
    gemsCollected: 0,
    gemPositions: aliveIdx.map((i) => ({ x: GEMS[level][i][0], y: GEMS[level][i][1] })),
    moving: false,
    onPlatform: true,
    cat: { x, y: run.y, dx: 0, dy: 0, height: 18 },
    drones: {
      tl: { x: 0, y: 1 + inset },
      tr: { x: 359 - inset, y: 0 },
      bl: { x: 1 + inset, y: 310 },
      br: { x: 360, y: 310 - inset },
    },
  };
}

for (let level = 0; level < 14; level++) {
  const runs = REACH.runsOf(level);
  const fires = {};
  let states = 0, fired = 0;
  for (const run of runs) {
    const xs = [run.left + 4, (run.left + run.right) / 2, run.right - 4];
    for (const x of xs) {
      for (const mf of [30, 120, 220]) {
        states++;
        const snap = snapAt(level, run, x, mf, [0, 1, 2]);
        let call;
        try { call = PATCH.buildObjectiveCall(snap, GEMS[level], []); } catch (_) { continue; }
        const crits = call.questions.objective.criteria;
        const hit = Object.entries(crits).find(([, c]) => /DESTROYED FIRST/.test(c));
        if (hit) { fired++; fires[hit[0]] = (fires[hit[0]] || 0) + 1; }
      }
    }
  }
  console.log(`L${level}: ${fired}/${states} states fire URGENCY  ${JSON.stringify(fires)}`);
}
