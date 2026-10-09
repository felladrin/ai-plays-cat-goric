#!/usr/bin/env node
// Census of the three LATENT-DEFECT simulate() constant-clock sites.
// Compares mf=0 verdict vs real-mf verdict across synthetic state space.
// Sites:
//   5. buildObjectiveCall descent cost (line 782) - descent point simulations
//   7. walkOffFatalNote walk check (line 1073) - walk off floor ends
//   8. walkOffFatalNote jump check (line 1075) - jump off floor ends
//
// Run: node driver/experiments/census_simulate_clock.cjs

"use strict";

const { simulate } = require("../arc.cjs");
const { runsOf, platformKeyUnder, platformHolding, reachableFrom } = require("../reachability.cjs");
const { movingFramesOf } = require("../route_clock.cjs");
const LEVELS = require("../level_data.cjs");
const CFG = require("../physics.cjs");
const CAD = require("../cadence.cjs");

const CAT_H = 18;
const REACH_END = (CAD.GROUND_DECIDE_FRAMES || 6) * CFG.catWalkSpeed; // 10.5px
const MF_GRID = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600];

// Levels 0..13 are the playable ones (PLATFORMS has 0..17 but 14+ are not in the ladder)
const PLAYABLE_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

// --- helpers ---

function platformEdges(x) {
  const half = CFG.platformWidth / 2;
  return { left: x - half, right: x + half };
}

function mergeRuns(plats, y) {
  const sameY = plats.filter(p => p[1] === y).map(p => platformEdges(p[0])).sort((a, b) => a.left - b.left);
  const runs = [];
  for (const e of sameY) {
    if (runs.length && e.left <= runs[runs.length - 1].right) {
      runs[runs.length - 1].right = Math.max(runs[runs.length - 1].right, e.right);
    } else {
      runs.push({ left: e.left, right: e.right });
    }
  }
  return runs;
}

function findRunAtLevelY(level, catY, catX) {
  const plats = LEVELS.platforms(level);
  const runs = [];
  for (const p of plats) {
    const e = platformEdges(p[0]);
    if (Math.abs(p[1] - catY) <= 14 && catX >= e.left && catX <= e.right) {
      return { y: p[1], left: e.left, right: e.right };
    }
  }
  return null;
}

// Site 5: enumerate descent points for a level
// Returns array of {level, runY, runLeft, runRight, side, dpX, dpY, dir}
function enumerateDescentPoints(level) {
  const plats = LEVELS.platforms(level);
  const results = [];

  // For each floor (merged run) in the level
  const yToRuns = new Map();
  for (const p of plats) {
    if (!yToRuns.has(p[1])) yToRuns.set(p[1], []);
    yToRuns.get(p[1]).push(platformEdges(p[0]));
  }
  for (const [y, edges] of yToRuns) {
    edges.sort((a, b) => a.left - b.left);
    const runs = [];
    for (const e of edges) {
      if (runs.length && e.left <= runs[runs.length - 1].right) {
        runs[runs.length - 1].right = Math.max(runs[runs.length - 1].right, e.right);
      } else {
        runs.push({ left: e.left, right: e.right });
      }
    }

    // For each run, check if there's an objective below (simplified: any platform below)
    const hasBelow = plats.some(p => p[1] > y + 20);
    if (!hasBelow) continue;

    for (const run of runs) {
      for (const [side, endX] of [["left", run.left], ["right", run.right]]) {
        const dir = side === "left" ? "left" : "right";
        // Compute landing like descentPoints does (geometry only)
        let bestLand = null, bestDy = Infinity;
        for (const p of plats) {
          if (p[1] <= y) continue;
          const reach = framesToFall(p[1] - y) * CFG.catWalkSpeed;
          const e = platformEdges(p[0]);
          if (e.right >= endX - reach && e.left <= endX + reach) {
            const dy = p[1] - y;
            if (dy < bestDy) { bestDy = dy; bestLand = { x: p[0], y: p[1] }; }
          }
        }
        if (!bestLand) continue; // no landing = death, not offered as descent

        // The descent point is at the edge of the run
        const dpX = endX;
        const dpY = y;
        results.push({ level, runY: y, runLeft: run.left, runRight: run.right, side, dpX, dpY, dir });
      }
    }
  }
  return results;
}

function framesToFall(dist) {
  let dy = 0, y = 0, f = 0;
  while (y < dist) { dy += CFG.catFallingAcceleration; y += dy; f += 1; }
  return f;
}

// Site 7&8: enumerate walk-off states (cat positions within reachEnd of a floor end)
// Returns array of {level, runY, runLeft, runRight, side, endX, catX}
function enumerateWalkOffStates(level) {
  const plats = LEVELS.platforms(level);
  const results = [];

  const yToRuns = new Map();
  for (const p of plats) {
    if (!yToRuns.has(p[1])) yToRuns.set(p[1], []);
    yToRuns.get(p[1]).push(platformEdges(p[0]));
  }
  for (const [y, edges] of yToRuns) {
    edges.sort((a, b) => a.left - b.left);
    const runs = [];
    for (const e of edges) {
      if (runs.length && e.left <= runs[runs.length - 1].right) {
        runs[runs.length - 1].right = Math.max(runs[runs.length - 1].right, e.right);
      } else {
        runs.push({ left: e.left, right: e.right });
      }
    }

    for (const run of runs) {
      for (const [side, endX] of [["left", run.left], ["right", run.right]]) {
        // Cat can be anywhere within REACH_END of the end
        // Enumerate catX on a grid within that range
        const lo = Math.max(run.left, endX - REACH_END);
        const hi = Math.min(run.right, endX + REACH_END);
        // Step by 2px (like route_clock grid)
        for (let catX = Math.ceil(lo / 2) * 2; catX <= hi; catX += 2) {
          results.push({ level, runY: y, runLeft: run.left, runRight: run.right, side, endX, catX });
        }
      }
    }
  }
  return results;
}

// Run a single simulation comparison for a site
function compareSite(siteName, level, x, y, dy, action, mfGrid) {
  const r0 = simulate(level, x, y, dy, CAT_H, action, 0, { grounded: true });
  const outcomes = { mf0: r0.outcome };
  let diffCount = 0;
  let firstDiff = null;
  for (const mf of mfGrid) {
    if (mf === 0) continue;
    const r = simulate(level, x, y, dy, CAT_H, action, mf, { grounded: true });
    outcomes[`mf${mf}`] = r.outcome;
    if (r.outcome !== r0.outcome) {
      diffCount++;
      if (!firstDiff) firstDiff = { mf, outcome0: r0.outcome, outcomeMf: r.outcome };
    }
  }
  return { site: siteName, level, x, y, action, outcomes, diffCount, firstDiff };
}

// Site 5: descent cost check
// simulate(level, dp.x, snap.cat.y, 0, snap.cat.height, dir, 0, { grounded: true })
function censusSite5() {
  console.log("=== Site 5: buildObjectiveCall descent cost (line 782) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];

  for (const level of PLAYABLE_LEVELS) {
    const dps = enumerateDescentPoints(level);
    for (const dp of dps) {
      totalStates++;
      const res = compareSite("site5", level, dp.dpX, dp.dpY, 0, dp.dir, MF_GRID);
      if (res.diffCount > 0) {
        diffStates++;
        diffs.push({ level: dp.level, x: dp.dpX, y: dp.dpY, dir: dp.dir, firstDiff: res.firstDiff });
      }
    }
  }

  console.log(`  States examined: ${totalStates}`);
  console.log(`  States with mf=0 vs real-mf divergence: ${diffStates}`);
  if (diffs.length) {
    console.log("  Example divergent states:");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} side=${d.side} x=${d.x.toFixed(1)} y=${d.y} dir=${d.dir} -> mf=0:${d.firstDiff.outcome0} mf=${d.firstDiff.mf}:${d.firstDiff.outcomeMf}`);
    }
    // Classify direction
    let falseSafe = 0, falseFatal = 0;
    for (const d of diffs) {
      if (d.firstDiff.outcome0 === "landed" && d.firstDiff.outcomeMf === "laser") falseSafe++;
      else if (d.firstDiff.outcome0 === "laser" && d.firstDiff.outcomeMf === "landed") falseFatal++;
    }
    console.log(`  Direction: false-safe (mf=0 lands, real laser)=${falseSafe}, false-fatal (mf=0 laser, real lands)=${falseFatal}`);
  } else {
    console.log("  Direction: none (zero divergence)");
  }
  return { site: 5, name: "buildObjectiveCall descent cost", totalStates, diffStates, diffs };
}

// Site 7: walkOffFatalNote walk check
// simulate(level, endX, run.y, 0, snap.cat.height, dir, 0, { grounded: true })
function censusSite7() {
  console.log("\n=== Site 7: walkOffFatalNote walk (line 1073) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];

  for (const level of PLAYABLE_LEVELS) {
    const states = enumerateWalkOffStates(level);
    for (const st of states) {
      const dir = st.side;
      totalStates++;
      const res = compareSite("site7", level, st.endX, st.runY, 0, dir, MF_GRID);
      if (res.diffCount > 0) {
        diffStates++;
        diffs.push({ level: st.level, x: st.catX, y: st.runY, endX: st.endX, side: st.side, firstDiff: res.firstDiff });
      }
    }
  }

  console.log(`  States examined: ${totalStates}`);
  console.log(`  States with mf=0 vs real-mf divergence: ${diffStates}`);
  if (diffs.length) {
    console.log("  Example divergent states:");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} side=${d.side} catX=${d.x} endX=${d.endX} y=${d.y} -> mf=0:${d.firstDiff.outcome0} mf=${d.firstDiff.mf}:${d.firstDiff.outcomeMf}`);
    }
    let falseSafe = 0, falseFatal = 0;
    for (const d of diffs) {
      if (d.firstDiff.outcome0 === "landed" && d.firstDiff.outcomeMf === "laser") falseSafe++;
      else if (d.firstDiff.outcome0 === "laser" && d.firstDiff.outcomeMf === "landed") falseFatal++;
    }
    console.log(`  Direction: false-safe (mf=0 lands, real laser)=${falseSafe}, false-fatal (mf=0 laser, real lands)=${falseFatal}`);
  } else {
    console.log("  Direction: none (zero divergence)");
  }
  return { site: 7, name: "walkOffFatalNote walk", totalStates, diffStates, diffs };
}

// Site 8: walkOffFatalNote jump check
// simulate(level, endX, run.y, 0, snap.cat.height, `jump_${dir}`, 0, { grounded: true })
function censusSite8() {
  console.log("\n=== Site 8: walkOffFatalNote jump (line 1075) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];

  for (const level of PLAYABLE_LEVELS) {
    const states = enumerateWalkOffStates(level);
    for (const st of states) {
      const action = `jump_${st.side}`;
      totalStates++;
      const res = compareSite("site8", level, st.endX, st.runY, 0, action, MF_GRID);
      if (res.diffCount > 0) {
        diffStates++;
        diffs.push({ level: st.level, x: st.catX, y: st.runY, endX: st.endX, side: st.side, firstDiff: res.firstDiff });
      }
    }
  }

  console.log(`  States examined: ${totalStates}`);
  console.log(`  States with mf=0 vs real-mf divergence: ${diffStates}`);
  if (diffs.length) {
    console.log("  Example divergent states:");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} side=${d.side} catX=${d.x} endX=${d.endX} y=${d.y} -> mf=0:${d.firstDiff.outcome0} mf=${d.firstDiff.mf}:${d.firstDiff.outcomeMf}`);
    }
    let falseSafe = 0, falseFatal = 0;
    for (const d of diffs) {
      if (d.firstDiff.outcome0 === "landed" && d.firstDiff.outcomeMf === "laser") falseSafe++;
      else if (d.firstDiff.outcome0 === "laser" && d.firstDiff.outcomeMf === "landed") falseFatal++;
    }
    console.log(`  Direction: false-safe (mf=0 lands, real laser)=${falseSafe}, false-fatal (mf=0 laser, real lands)=${falseFatal}`);
  } else {
    console.log("  Direction: none (zero divergence)");
  }
  return { site: 8, name: "walkOffFatalNote jump", totalStates, diffStates, diffs };
}

function main() {
  console.log("Census: constant-clock simulate() sites vs real-mf grid");
  console.log(`Levels: ${PLAYABLE_LEVELS.join(",")}`);
  console.log(`mf grid: ${MF_GRID.join(",")}`);
  console.log(`CAT_H: ${CAT_H}, REACH_END: ${REACH_END.toFixed(1)}px\n`);

  const s5 = censusSite5();
  const s7 = censusSite7();
  const s8 = censusSite8();

  console.log("\n=== SUMMARY ===");
  console.log(`Site 5 (${s5.name}): ${s5.totalStates} states, ${s5.diffStates} divergent`);
  console.log(`Site 7 (${s7.name}): ${s7.totalStates} states, ${s7.diffStates} divergent`);
  console.log(`Site 8 (${s8.name}): ${s8.totalStates} states, ${s8.diffStates} divergent`);

  const verdict5 = s5.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";
  const verdict7 = s7.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";
  const verdict8 = s8.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";
  console.log(`\nVerdicts:`);
  console.log(`  Site 5: ${verdict5}`);
  console.log(`  Site 7: ${verdict7}`);
  console.log(`  Site 8: ${verdict8}`);

  // Return data for potential programmatic use
  return { s5, s7, s8, verdicts: { 5: verdict5, 7: verdict7, 8: verdict8 } };
}

main();