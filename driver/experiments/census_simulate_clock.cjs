#!/usr/bin/env node
// Census of the LATENT-DEFECT simulate() constant-clock sites.
// Compares mf=0 verdict vs real-mf verdict across synthetic state space.
// Sites:
//   5. buildObjectiveCall descent cost (line 782) - ONE-WAY note on descent points
//   6. jumpLandingNote held scan (line 964) - namedX selection at mf=1
//   7. walkOffFatalNote walk check (line 1073) - walk off floor ends
//   8. walkOffFatalNote jump check (line 1075) - jump escape clause (only when walk is fatal)
//
// Run: node driver/experiments/census_simulate_clock.cjs

"use strict";

const { simulate } = require("../arc.cjs");
const { runsOf, platformKeyUnder, platformHolding, reachableFrom, runKey } = require("../reachability.cjs");
const { movingFramesOf } = require("../route_clock.cjs");
const LEVELS = require("../level_data.cjs");
const CFG = require("../physics.cjs");
const CAD = require("../cadence.cjs");
const fs = require("fs");
const path = require("path");

// Load gems from config.ts
function loadGems() {
  const configPath = path.join(__dirname, "../../cat-goric-game/src/scripts/constants/config.ts");
  const src = fs.readFileSync(configPath, "utf8");
  const m = src.match(/gemsPositionsPerLevel[^=]*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error("could not extract gemsPositionsPerLevel from config.ts");
  return JSON.parse(m[1].replace(/,(\s*[\]\}])/g, "$1"));
}
const GEMS = loadGems();

const CAT_H = 18;
const REACH_END = (CAD.GROUND_DECIDE_FRAMES || 6) * CFG.catWalkSpeed; // 10.5px
const MF_GRID = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600];

// Levels 0..13 are the playable ones
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

function getAliveGems(level, snap) {
  const levelGems = GEMS[level];
  // matchGemsToSpawn logic simplified: live gems at their spawn coordinates
  const alive = [];
  for (let i = 0; i < levelGems.length; i++) {
    alive.push({ name: `gem_${String.fromCharCode(97 + i)}`, x: levelGems[i][0], y: levelGems[i][1] });
  }
  // In synthetic census we assume all gems are alive (synthetic geometry)
  return alive;
}

// Check if a cat position is inside the laser bounds at given mf
function isInsideLaserBounds(x, y, catHeight, mf) {
  const top = 1 + CFG.droneSpeed * mf + CFG.maxLaserHalfSize;
  const bottom = CFG.maximumLaserY - CFG.droneSpeed * mf - CFG.maxLaserHalfSize;
  const left = 1 + CFG.droneSpeed * mf + CFG.maxLaserHalfSize;
  const right = 359 - CFG.droneSpeed * mf - CFG.maxLaserHalfSize;
  return (y >= bottom || y - catHeight <= top || x <= left || x >= right);
}

// Site 5: enumerate descent points EXACTLY as descentPoints() does
// Returns array of {level, runY, runLeft, runRight, side, dpX, dpY, dir, landX, landY, landKey, allLandKeys}
function enumerateDescentPoints(level) {
  const plats = LEVELS.platforms(level);
  const levelGems = GEMS[level];
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

    // General rule per descentPoints: is any REMAINING OBJECTIVE below this floor?
    // In synthetic census we assume all gems are alive and none collected.
    const alive = getAliveGems(level, null);
    const objectives = alive.map(g => ({ x: g.x, y: g.y }));
    const objectiveBelow = objectives.some(o => o.y > y + 20);
    if (!objectiveBelow) continue;

    for (const run of runs) {
      for (const [side, endX] of [["left", run.left], ["right", run.right]]) {
        const dir = side === "left" ? "left" : "right";

        // Compute ALL landings like descentPoints does (geometry only, full air control)
        // descentPoints collects ALL reachable platforms below, not just the nearest.
        const framesToFall = (dist) => {
          let dy = 0, yFall = 0, f = 0;
          while (yFall < dist) { dy += CFG.catFallingAcceleration; yFall += dy; f += 1; }
          return f;
        };
        const allLandKeys = [];
        for (const p of plats) {
          if (p[1] <= y) continue;
          const reach = framesToFall(p[1] - y) * CFG.catWalkSpeed;
          const e = platformEdges(p[0]);
          if (e.right >= endX - reach && e.left <= endX + reach) {
            const landKey = platformKeyUnder(level, p[0], p[1]);
            if (landKey) allLandKeys.push(landKey);
          }
        }
        if (!allLandKeys.length) continue; // no landing = death, not offered as descent

        // For the census we need the landing used by the mf=0 simulate() call
        // which will pick the first landed platform. We'll compute that in the census loop.
        // Store allLandKeys for the offer gate check.

        results.push({
          level,
          runY: y,
          runLeft: run.left,
          runRight: run.right,
          side,
          dpX: endX,
          dpY: y,
          dir,
          allLandKeys
        });
      }
    }
  }
  return results;
}

// Site 6: enumerate jumpLandingNote firing states
// Returns states where the held scan would pick a namedX
function enumerateJumpLandingStates(level) {
  const plats = LEVELS.platforms(level);
  const graphRuns = runsOf(level);
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
      // For each possible catX on this run (grid step 2px)
      for (let catX = Math.ceil(run.left / 2) * 2; catX <= run.right; catX += 2) {
        // Check if there's an objective on a different floor that could trigger jumpLandingNote
        const levelGems = GEMS[level];
        for (let i = 0; i < levelGems.length; i++) {
          const gx = levelGems[i][0], gy = levelGems[i][1];
          const holder = platformHolding(level, gx, gy);
          const here = platformKeyUnder(level, catX, y);
          if (!holder || !here || holder === here) continue;

          // Check if the current x cannot keep the objective reachable (envelope check)
          const { landingsFrom } = require("../reachability.cjs");
          const keeps = (key) => {
            if (key === holder) return true;
            const set = reachableFrom(level, key, CAT_H);
            return set ? set.has(holder) : false;
          };
          const landingsAt = (x) =>
            [...landingsFrom(level, graphRuns, x, y, true, CAT_H)].filter((k) => k !== here);

          const nowLandings = landingsAt(catX);
          if (nowLandings.some(keeps)) continue;

          const good = [];
          for (let x = run.left; x <= run.right; x += CFG.catWalkSpeed) {
            if (landingsAt(x).some(keeps)) good.push(x);
          }
          if (!good.length) continue;

          results.push({
            level,
            runY: y,
            runLeft: run.left,
            runRight: run.right,
            catX,
            targetX: gx,
            targetY: gy,
            targetName: `gem_${String.fromCharCode(97 + i)}`,
            holder,
            here,
            good
          });
        }
      }
    }
  }
  return results;
}

// Alive-at-start filter: check if cat at (x, y) is inside laser bounds at given mf
function isAliveAtStart(x, y, catHeight, mf) {
  return !isInsideLaserBounds(x, y, catHeight, mf);
}

// Pick the namedX per the real code: among good xs, pick the one NEAREST THE CAT
// whose held arc (at mf=1) lands on a keeping floor.
function pickNamedXAtMf1(level, run, catX, good, holder, here, CAT_H) {
  const { landingsFrom } = require("../reachability.cjs");
  const runs = runsOf(level);
  const keeps = (key) => {
    if (key === holder) return true;
    const set = reachableFrom(level, key, CAT_H);
    return set ? set.has(holder) : false;
  };
  const { simulate } = require("../arc.cjs");

  let heldX = null, heldPlat = null;
  // Iterate in order of distance from catX (nearest first), matching the real code
  const sortedGood = [...good].sort((a, b) => Math.abs(a - catX) - Math.abs(b - catX));
  for (const x of sortedGood) {
    for (const dir of ["jump_left", "jump", "jump_right"]) {
      const r = simulate(level, x, run.y, 0, CAT_H, dir, 1, { grounded: true });
      if (r.outcome !== "landed") continue;
      const rKey = platformKeyUnder(level, r.x, r.y);
      if (rKey && rKey !== here && keeps(rKey)) {
        heldX = x;
        heldPlat = rKey;
        break;
      }
    }
    if (heldX != null) break;
  }
  // Fallback per real code: if no held arc works, pick envelope edge nearest the cat
  const namedX = heldX != null ? Math.round(heldX) : (catX > Math.max(...good) ? Math.max(...good) : Math.min(...good));
  const namedPlat = heldPlat;
  return { namedX, namedPlat, heldX, heldPlat };
}

// Site 7&8: enumerate walk-off states, deduped by (level, floor, endX, side)
function enumerateWalkOffStates(level) {
  const plats = LEVELS.platforms(level);
  const states = new Map(); // key: "level|floorY|endX|side"

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
        const key = `${level}|${y}|${endX}|${side}`;
        if (!states.has(key)) {
          states.set(key, {
            level,
            runY: y,
            runLeft: run.left,
            runRight: run.right,
            side,
            endX
          });
        }
      }
    }
  }
  return Array.from(states.values());
}

// Compare simulation outcomes at mf=0 vs real mf grid
function compareSimOutcomes(level, x, y, dy, catHeight, action, mfGrid) {
  const r0 = simulate(level, x, y, dy, catHeight, action, 0, { grounded: true });
  const outcomes = { mf0: r0.outcome };
  let diffCount = 0;
  let firstDiff = null;
  for (const mf of mfGrid) {
    if (mf === 0) continue;
    const r = simulate(level, x, y, dy, catHeight, action, mf, { grounded: true });
    outcomes[`mf${mf}`] = r.outcome;
    if (r.outcome !== r0.outcome) {
      diffCount++;
      if (!firstDiff) firstDiff = { mf, outcome0: r0.outcome, outcomeMf: r.outcome };
    }
  }
  return { outcomes, diffCount, firstDiff };
}

// Site 5: descent cost check (ONE-WAY note)
function censusSite5() {
  console.log("=== Site 5: buildObjectiveCall descent cost (line 782) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];
  let statesNotOfferedAtRealMf = 0; // descent not offered at any real mf -> no ONE-WAY note at all
  let statesMf0NoLand = 0; // mf=0 doesn't land, so no note emitted there either

  for (const level of PLAYABLE_LEVELS) {
    const dps = enumerateDescentPoints(level);
    const aliveGems = getAliveGems(level, null); // synthetic: all gems alive

    for (const dp of dps) {
      // Check if the descent is offered at ANY real mf (the site-4 offer gate)
      // The real code checks: survives(side) || survives("none") at the CURRENT mf (real clock).
      // For census we check across the mf grid: if there exists ANY real mf where the descent is offered,
      // then the ONE-WAY note could be emitted at that mf and we should compare the lost-gem set.
      // If the descent is NEVER offered at any real mf, there is no ONE-WAY note at all - exclude.
      let offeredAtSomeRealMf = false;
      for (const mf of MF_GRID) {
        if (mf === 0) continue;
        const rSide = simulate(level, dp.dpX, dp.runY, 0, CAT_H, dp.dir, mf, { grounded: true });
        if (rSide.outcome === "landed") { offeredAtSomeRealMf = true; break; }
        const rNone = simulate(level, dp.dpX, dp.runY, 0, CAT_H, "none", mf, { grounded: true });
        if (rNone.outcome === "landed") { offeredAtSomeRealMf = true; break; }
      }
      if (!offeredAtSomeRealMf) {
        statesNotOfferedAtRealMf++;
        continue;
      }

      totalStates++;

      // mf=0 simulation - this is what the code actually uses for the ONE-WAY cost
      const r0 = simulate(level, dp.dpX, dp.runY, 0, CAT_H, dp.dir, 0, { grounded: true });
      if (r0.outcome !== "landed") {
        // At mf=0 the descent doesn't land - no ONE-WAY note emitted
        // The real code would also not emit a ONE-WAY note at real mf if the arc dies there
        // (since the offer gate requires survival). The "none" fallback in the old census
        // was an artifact - lasers only close as mf rises, so dead at mf=0 means dead at all mf.
        statesMf0NoLand++;
        continue;
      }

      // mf=0 lands - compute lost gems at mf=0
      const landKey0 = platformKeyUnder(level, r0.x, r0.y);
      const after0 = landKey0 ? reachableFrom(level, landKey0, CAT_H) : null;
      const lostAt0 = new Set();
      if (after0) {
        const originKey = platformKeyUnder(level, dp.dpX, dp.runY);
        const before = originKey ? reachableFrom(level, originKey, CAT_H) : null;
        for (const g of aliveGems) {
          const h = platformHolding(level, g.x, g.y);
          if (h && after0.has(h)) continue; // still reachable
          if (before && h && before.has(h) && !after0.has(h)) {
            lostAt0.add(g.name);
          }
        }
      }

      // Now check real mf grid: only at mf where the descent IS offered
      // The real code computes the ONE-WAY cost at the CURRENT mf (real clock).
      // We compare the mf=0 lost-gem set vs the lost-gem set at each real mf where offered.
      let hasDivergence = false;
      for (const mf of MF_GRID) {
        if (mf === 0) continue;
        // Check if descent is offered at this specific mf
        const rSide = simulate(level, dp.dpX, dp.runY, 0, CAT_H, dp.dir, mf, { grounded: true });
        const survivesSide = rSide.outcome === "landed";
        const rNone = simulate(level, dp.dpX, dp.runY, 0, CAT_H, "none", mf, { grounded: true });
        const survivesNone = rNone.outcome === "landed";
        if (!survivesSide && !survivesNone) continue; // not offered at this mf

        // Descent is offered at this mf - compute lost gems
        const r = survivesSide ? rSide : rNone; // the real code would use whichever survives
        if (r.outcome !== "landed") continue;

        const landKey = platformKeyUnder(level, r.x, r.y);
        const after = landKey ? reachableFrom(level, landKey, CAT_H) : null;
        const lostAtMf = new Set();
        if (after) {
          const originKey = platformKeyUnder(level, dp.dpX, dp.runY);
          const before = originKey ? reachableFrom(level, originKey, CAT_H) : null;
          for (const g of aliveGems) {
            const h = platformHolding(level, g.x, g.y);
            if (h && after.has(h)) continue;
            if (before && h && before.has(h) && !after.has(h)) {
              lostAtMf.add(g.name);
            }
          }
        }

        // Compare lost gem sets
        const lost0Arr = Array.from(lostAt0).sort();
        const lostMfArr = Array.from(lostAtMf).sort();
        if (lost0Arr.join(",") !== lostMfArr.join(",")) {
          hasDivergence = true;
          diffs.push({
            level: dp.level,
            side: dp.side,
            x: dp.dpX,
            y: dp.runY,
            dir: dp.dir,
            mf,
            lostAt0: lost0Arr,
            lostAtMf: lostMfArr,
            landX0: Math.round(r0.x),
            landY0: Math.round(r0.y),
            landXMf: Math.round(r.x),
            landYMf: Math.round(r.y),
            offerMode: survivesSide ? "side" : "none"
          });
          break;
        }
      }
      if (hasDivergence) diffStates++;
    }
  }

  console.log(`  States examined (descent offered at some real mf): ${totalStates}`);
  console.log(`  States with mf=0 vs real-mf divergence in LOST-GEM SET: ${diffStates}`);
  console.log(`  States excluded (descent never offered at any real mf): ${statesNotOfferedAtRealMf}`);
  console.log(`  States where mf=0 descent dies (no ONE-WAY note at mf=0 either): ${statesMf0NoLand}`);
  if (diffs.length) {
    console.log("  Example divergent states (lost-gem set differs):");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} side=${d.side} x=${d.x} y=${d.y} dir=${d.dir} mf=${d.mf} offer=${d.offerMode}`);
      console.log(`      mf=0 lost: [${d.lostAt0.join(",") || "none"}] land@(${d.landX0},${d.landY0})`);
      console.log(`      mf=${d.mf} lost: [${d.lostAtMf.join(",") || "none"}] land@(${d.landXMf},${d.landYMf})`);
    }
  }
  return { site: 5, name: "buildObjectiveCall descent cost", totalStates, diffStates, diffs, statesNotOfferedAtRealMf, statesMf0NoLand };
}

// Site 6: jumpLandingNote held scan
function censusSite6() {
  console.log("\n=== Site 6: jumpLandingNote held scan (line 964) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];
  let filteredDeadStart = 0;

  for (const level of PLAYABLE_LEVELS) {
    const states = enumerateJumpLandingStates(level);

    for (const st of states) {
      // Alive-at-start filter: exclude states where the cat at catX is inside laser at all mf
      let hasValidMf = false;
      for (const mf of MF_GRID) {
        if (isAliveAtStart(st.catX, st.runY, CAT_H, mf)) {
          hasValidMf = true;
          break;
        }
      }
      if (!hasValidMf) {
        filteredDeadStart++;
        continue;
      }

      totalStates++;

      // At mf=1, find the namedX the held scan would pick (nearest to cat)
      const runs = runsOf(level);
      const run = runs.find(r => r.left <= st.runLeft && r.right >= st.runRight && r.y === st.runY);
      if (!run) continue;

      const { namedX: namedX_mf1, namedPlat: namedPlat_mf1, heldX, heldPlat } = pickNamedXAtMf1(
        level, run, st.catX, st.good, st.holder, st.here, CAT_H
      );
      if (namedX_mf1 === null) continue; // no namedX found at mf=1 (fallback case)

      // Determine the heldDir for the picked namedX, matching the real code logic
      let heldDir = null;
      if (heldPlat) {
        const platRun = runs.find(r => runKey(r) === heldPlat);
        if (platRun) heldDir = platRun.left < st.catX ? "left" : "right";
      }
      if (!heldDir) {
        heldDir = st.targetX < st.catX ? "jump_left" : "jump_right";
      }

      // Now check at real mf: does the pick change? would the arc from namedX survive?
      let hasDivergence = false;
      for (const mf of MF_GRID) {
        if (mf === 0 || mf === 1) continue;
        // Re-run the held scan at this mf (nearest-to-cat pick)
        const pickAtMf = pickNamedXAtMf1(level, run, st.catX, st.good, st.holder, st.here, CAT_H);
        const namedX_mf = pickAtMf.namedX;
        const namedPlat_mf = pickAtMf.namedPlat;

        if (namedX_mf !== namedX_mf1 || namedPlat_mf !== namedPlat_mf1) {
          hasDivergence = true;
          diffs.push({
            level: st.level,
            catX: st.catX,
            runY: st.runY,
            target: st.targetName,
            mf1_namedX: Math.round(namedX_mf1),
            mf1_plat: namedPlat_mf1,
            mf_namedX: namedX_mf != null ? Math.round(namedX_mf) : null,
            mf_plat: namedPlat_mf,
            mf,
            type: "pick-shift"
          });
          break;
        }
        // Also check: would the mf=1 picked namedX survive at this mf with the JUMP action?
        // The real code uses the heldDir (direction of the held arc that worked at mf=1)
        if (heldX != null) {
          const r = simulate(level, namedX_mf1, st.runY, 0, CAT_H, heldDir, mf, { grounded: true });
          if (r.outcome !== "landed") {
            hasDivergence = true;
            diffs.push({
              level: st.level,
              catX: st.catX,
              runY: st.runY,
              target: st.targetName,
              mf1_namedX: Math.round(namedX_mf1),
              mf1_plat: namedPlat_mf1,
              mf_namedX: Math.round(namedX_mf1),
              mf_plat: "laser/void",
              mf,
              type: "pick-dies",
              note: `mf=1 pick (held ${heldDir}) dies at real mf`
            });
            break;
          }
        }
      }
      if (hasDivergence) diffStates++;
    }
  }

  console.log(`  States examined (alive-at-start filter): ${totalStates}`);
  console.log(`  States filtered (start inside laser at all mf): ${filteredDeadStart}`);
  console.log(`  States with mf=1 vs real-mf divergence in namedX pick or survival: ${diffStates}`);
  if (diffs.length) {
    const pickShifts = diffs.filter(d => d.type === "pick-shift").length;
    const pickDies = diffs.filter(d => d.type === "pick-dies").length;
    console.log(`  Breakdown: pick shifts=${pickShifts}, pick dies=${pickDies}`);
    console.log("  Example divergent states:");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} catX=${d.catX} y=${d.runY} target=${d.target} mf=${d.mf}`);
      console.log(`      mf=1 pick: x=${d.mf1_namedX} plat=${d.mf1_plat}`);
      console.log(`      mf=${d.mf} pick: x=${d.mf_namedX} plat=${d.mf_plat}`);
      if (d.note) console.log(`      ${d.note}`);
    }
  }
  return { site: 6, name: "jumpLandingNote held scan", totalStates, diffStates, diffs, filteredDeadStart };
}

// Site 7: walkOffFatalNote walk check
function censusSite7() {
  console.log("\n=== Site 7: walkOffFatalNote walk (line 1073) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];
  let filteredDeadStart = 0;

  for (const level of PLAYABLE_LEVELS) {
    const states = enumerateWalkOffStates(level);

    for (const st of states) {
      const dir = st.side;
      const endX = st.endX;

      // Alive-at-start filter: check if the cat at endX (where simulate starts) is inside laser at this mf
      // We need to check at each mf in the grid whether the START position is already dead
      // The simulation is called at endX, so we check if endX is inside laser bounds
      let hasValidMf = false;
      for (const mf of MF_GRID) {
        if (!isInsideLaserBounds(endX, st.runY, CAT_H, mf)) {
          hasValidMf = true;
          break;
        }
      }
      if (!hasValidMf) {
        filteredDeadStart++;
        continue;
      }

      totalStates++;

      const r0 = simulate(level, endX, st.runY, 0, CAT_H, dir, 0, { grounded: true });
      if (r0.outcome !== "landed") {
        // mf=0 says fatal - check if real mf says landed (false-fatal)
        let falseFatal = false;
        for (const mf of MF_GRID) {
          if (mf === 0) continue;
          if (isInsideLaserBounds(endX, st.runY, CAT_H, mf)) continue; // skip dead start
          const r = simulate(level, endX, st.runY, 0, CAT_H, dir, mf, { grounded: true });
          if (r.outcome === "landed") {
            falseFatal = true;
            diffs.push({
              level: st.level,
              side: st.side,
              endX,
              y: st.runY,
              mf,
              outcome0: r0.outcome,
              outcomeMf: r.outcome,
              type: "false-fatal"
            });
            break;
          }
        }
        if (falseFatal) diffStates++;
        continue;
      }

      // mf=0 says landed - check if real mf says laser (false-safe, the dangerous direction)
      let falseSafe = false;
      for (const mf of MF_GRID) {
        if (mf === 0) continue;
        if (isInsideLaserBounds(endX, st.runY, CAT_H, mf)) continue; // skip dead start
        const r = simulate(level, endX, st.runY, 0, CAT_H, dir, mf, { grounded: true });
        if (r.outcome === "laser") {
          falseSafe = true;
          diffs.push({
            level: st.level,
            side: st.side,
            endX,
            y: st.runY,
            mf,
            outcome0: r0.outcome,
            outcomeMf: r.outcome,
            type: "false-safe"
          });
          break;
        }
      }
      if (falseSafe) diffStates++;
    }
  }

  console.log(`  States examined (deduped by level,floor,endX,side, alive-at-start): ${totalStates}`);
  console.log(`  States filtered (start inside laser at all mf): ${filteredDeadStart}`);
  console.log(`  States with mf=0 vs real-mf divergence: ${diffStates}`);
  if (diffs.length) {
    let falseSafe = 0, falseFatal = 0;
    for (const d of diffs) {
      if (d.type === "false-safe") falseSafe++;
      else if (d.type === "false-fatal") falseFatal++;
    }
    console.log(`  Direction: false-safe (mf=0 lands, real laser)=${falseSafe}, false-fatal (mf=0 laser, real lands)=${falseFatal}`);
    console.log("  Example divergent states:");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} side=${d.side} endX=${d.endX} y=${d.y} mf=${d.mf} -> mf=0:${d.outcome0} mf=${d.mf}:${d.outcomeMf} (${d.type})`);
    }
  }
  return { site: 7, name: "walkOffFatalNote walk", totalStates, diffStates, diffs, filteredDeadStart };
}

// Site 8: walkOffFatalNote jump check (only when walk is fatal)
function censusSite8() {
  console.log("\n=== Site 8: walkOffFatalNote jump escape (line 1075) ===");
  let totalStates = 0;
  let diffStates = 0;
  const diffs = [];
  let filteredDeadStart = 0;
  let walkLandedSkipped = 0;

  for (const level of PLAYABLE_LEVELS) {
    const states = enumerateWalkOffStates(level);

    for (const st of states) {
      const dir = st.side;
      const endX = st.endX;
      const action = `jump_${dir}`;

      // Alive-at-start filter
      let hasValidMf = false;
      for (const mf of MF_GRID) {
        if (!isInsideLaserBounds(endX, st.runY, CAT_H, mf)) {
          hasValidMf = true;
          break;
        }
      }
      if (!hasValidMf) {
        filteredDeadStart++;
        continue;
      }

      // First check walk outcome at mf=0 - jump clause only added when walk is NOT landed
      const rWalk0 = simulate(level, endX, st.runY, 0, CAT_H, dir, 0, { grounded: true });
      if (rWalk0.outcome === "landed") {
        walkLandedSkipped++;
        continue; // jump clause not appended, skip this state
      }

      totalStates++;

      // mf=0 jump outcome
      const rJump0 = simulate(level, endX, st.runY, 0, CAT_H, action, 0, { grounded: true });
      if (rJump0.outcome !== "landed") {
        // mf=0 says jump fatal - check if real mf says landed (false-fatal for escape)
        let falseFatal = false;
        for (const mf of MF_GRID) {
          if (mf === 0) continue;
          if (isInsideLaserBounds(endX, st.runY, CAT_H, mf)) continue;
          const r = simulate(level, endX, st.runY, 0, CAT_H, action, mf, { grounded: true });
          if (r.outcome === "landed") {
            falseFatal = true;
            diffs.push({
              level: st.level,
              side: st.side,
              endX,
              y: st.runY,
              mf,
              outcome0: rJump0.outcome,
              outcomeMf: r.outcome,
              type: "false-fatal-escape"
            });
            break;
          }
        }
        if (falseFatal) diffStates++;
        continue;
      }

      // mf=0 says jump lands - check if real mf says laser (false-safe escape)
      let falseSafe = false;
      for (const mf of MF_GRID) {
        if (mf === 0) continue;
        if (isInsideLaserBounds(endX, st.runY, CAT_H, mf)) continue;
        const r = simulate(level, endX, st.runY, 0, CAT_H, action, mf, { grounded: true });
        if (r.outcome === "laser") {
          falseSafe = true;
          diffs.push({
            level: st.level,
            side: st.side,
            endX,
            y: st.runY,
            mf,
            outcome0: rJump0.outcome,
            outcomeMf: r.outcome,
            type: "false-safe-escape"
          });
          break;
        }
      }
      if (falseSafe) diffStates++;
    }
  }

  console.log(`  States examined (deduped, alive-at-start, walk fatal only): ${totalStates}`);
  console.log(`  States filtered (start inside laser at all mf): ${filteredDeadStart}`);
  console.log(`  States skipped (walk lands at mf=0, jump clause not appended): ${walkLandedSkipped}`);
  console.log(`  States with mf=0 vs real-mf divergence: ${diffStates}`);
  if (diffs.length) {
    let falseSafe = 0, falseFatal = 0;
    for (const d of diffs) {
      if (d.type === "false-safe-escape") falseSafe++;
      else if (d.type === "false-fatal-escape") falseFatal++;
    }
    console.log(`  Direction: false-safe escape (mf=0 lands, real laser)=${falseSafe}, false-fatal escape (mf=0 laser, real lands)=${falseFatal}`);
    console.log("  Example divergent states:");
    for (const d of diffs.slice(0, 5)) {
      console.log(`    L${d.level} side=${d.side} endX=${d.endX} y=${d.y} mf=${d.mf} -> mf=0:${d.outcome0} mf=${d.mf}:${d.outcomeMf} (${d.type})`);
    }
  }
  return { site: 8, name: "walkOffFatalNote jump escape", totalStates, diffStates, diffs, filteredDeadStart, walkLandedSkipped };
}

function main() {
  console.log("Census: constant-clock simulate() sites vs real-mf grid");
  console.log("NOTE: 'live' in this output means 'exists in synthetic geometry', not 'fires in play'. No run archives are used.");
  console.log(`Levels: ${PLAYABLE_LEVELS.join(",")}`);
  console.log(`mf grid: ${MF_GRID.join(",")}`);
  console.log(`CAT_H: ${CAT_H}, REACH_END: ${REACH_END.toFixed(1)}px\n`);

  const s5 = censusSite5();
  const s6 = censusSite6();
  const s7 = censusSite7();
  const s8 = censusSite8();

  console.log("\n=== SUMMARY ===");
  console.log(`Site 5 (${s5.name}): ${s5.totalStates} states, ${s5.diffStates} divergent (lost-gem set), ${s5.statesNotOfferedAtRealMf} excluded (never offered), ${s5.statesMf0NoLand} mf=0 no land`);
  console.log(`Site 6 (${s6.name}): ${s6.totalStates} states, ${s6.diffStates} divergent (namedX pick/survival), ${s6.filteredDeadStart} filtered (dead start)`);
  console.log(`Site 7 (${s7.name}): ${s7.totalStates} states, ${s7.diffStates} divergent, ${s7.filteredDeadStart} filtered (dead start)`);
  console.log(`Site 8 (${s8.name}): ${s8.totalStates} states, ${s8.diffStates} divergent, ${s8.filteredDeadStart} filtered, ${s8.walkLandedSkipped} skipped (walk lands)`);

  const verdict5 = s5.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";
  const verdict6 = s6.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";
  const verdict7 = s7.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";
  const verdict8 = s8.diffStates > 0 ? "DEFECT-LIVE" : "DEFECT-THEORETICAL";

  console.log("\nVerdicts:");
  console.log(`  Site 5: ${verdict5}`);
  console.log(`  Site 6: ${verdict6}`);
  console.log(`  Site 7: ${verdict7}`);
  console.log(`  Site 8: ${verdict8}`);

  return { s5, s6, s7, s8, verdicts: { 5: verdict5, 6: verdict6, 7: verdict7, 8: verdict8 } };
}

main();