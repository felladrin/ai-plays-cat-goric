"use strict";
// firstpick_sweep.cjs — blast-radius sweep for the deadline annotation.
//
// For every level, every floor, a grid of x positions and a few moving-frame
// values, answer the decision-relevant question: for each live gem, is
// "take this gem FIRST" still ALIVE (some completion ordering starting with it
// meets every deadline and keeps the cat inside the lasers), assuming the other
// two gems are still live?
//
// This is the offline firing profile the annotation needs before it ships:
// where it fires, how early, and whether it fires on levels that clear today.

const RC = require("./route_clock.cjs");
const REACH = require("../reachability.cjs");

const X_STEP = 8;
const MFS = [20, 100, 200, 300];

function main() {
  const gemsAll = RC.loadGems();
  const names = ["a", "b", "c"];
  for (const lv of Array.from({ length: 14 }, (_, i) => i)) {
    const gems = gemsAll[lv];
    const runs = REACH.runsOf(lv);
    let total = 0, anyDead = 0, allDead = 0;
    const lines = [];
    for (const r of runs) {
      const key = REACH.runKey(r);
      const lo = Math.ceil(r.left / X_STEP) * X_STEP;
      for (let x = lo; x <= r.right; x += X_STEP) {
        for (const mf of MFS) {
          if (!RC.stateSafe(r.y, x, mf)) continue;
          total++;
          const alive = [];
          const dead = [];
          for (let first = 0; first < 3; first++) {
            const rest = [0, 1, 2].filter((i) => i !== first);
            const o1 = [first, rest[0], rest[1]];
            const o2 = [first, rest[1], rest[0]];
            const a1 = RC.orderFeasible(lv, gems, o1, key, x, mf).feasible;
            const a2 = RC.orderFeasible(lv, gems, o2, key, x, mf).feasible;
            (a1 || a2 ? alive : dead).push(names[first]);
          }
          if (dead.length) {
            anyDead++;
            if (!alive.length) allDead++;
            lines.push(`  ${key} x=${x} mf=${mf}: DEAD-first=${dead.join(",")} alive-first=${alive.join(",") || "NONE"}`);
          }
        }
      }
    }
    console.log(`\nL${lv}: ${anyDead}/${total} states have >=1 dead first-pick (${allDead} fully dead)`);
    // print a bounded sample: first 12 lines, then a per-mf summary
    for (const l of lines.slice(0, 12)) console.log(l);
    if (lines.length > 12) console.log(`  ... ${lines.length - 12} more`);
  }
}

main();
