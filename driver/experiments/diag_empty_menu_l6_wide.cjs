"use strict";
// Widened sweep for the empty L6 objective menu. The first sweep (exact floor-top
// y, height 18, dy 0) found no empty menu across 15066 states, but it held fixed
// the inputs routeBlocked / jumpHitsCeiling / platformKeyUnder depend on:
//   - cat.y within platformKeyUnder's 14px tolerance (a few px above/below the
//     floor top changes which floor the cat is "under"),
//   - cat.height (jumpHitsCeiling's head clearance),
//   - dy (jumpHitsCeiling via catMargins; also the apex-snap class),
//   - apex-snap landings: a jump whose arc touches a platform at its apex snaps
//     the cat onto that platform's anchor y (updateCatSprite side-snap), so the
//     cat can be grounded on a floor arc.simulate's descent-only landing never
//     reports.
// Only gem_a alive (collected=2). Prints every EMPTY menu state, or the count.

const D = require("../decision.cjs");
const P = require("../level_data.cjs");
const REACH = require("../reachability.cjs");
const { simulate } = require("../arc.cjs");

const LEVEL = 6;
const LEVEL_GEMS = [{ x: 135, y: 143 }, { x: 225, y: 181 }, { x: 221, y: 108 }];

const floors = P.platforms(LEVEL);

function snapAt(cx, cy, dy, height, mf, grounded) {
  const d = 1 + 0.2 * mf;
  return {
    level: LEVEL,
    gemsCollected: 2,
    aliveGems: 1,
    gemPositions: [{ x: 135, y: 143 }],
    onPlatform: grounded,
    cat: { x: cx, y: cy, dx: 0, dy, height },
    drones: {
      tl: { x: d, y: d }, tr: { x: d, y: d },
      bl: { x: d, y: d }, br: { x: d, y: d },
    },
  };
}

// Candidate grounded positions: exact floor tops from the first sweep, PLUS
// apex-snap landings. From every x on every floor, simulate each jump; if the
// arc's apex touches another platform (dy crosses 0 with head inside it), the
// cat snaps onto that platform's top. Collect (x, floor) pairs.
const apexPositions = new Set();
for (const [fx, fy] of floors) {
  const e = D.platformEdges(fx);
  for (let x = e.left; x <= e.right; x += 2) {
    for (const act of ["jump", "jump_left", "jump_right"]) {
      for (let mf = 200; mf <= 300; mf += 10) {
        // Trace the arc: simulate() returns the final outcome only, so re-derive
        // the apex by integrating the game's discrete jump (same order as arc.cjs).
        const CFG = require("../physics.cjs");
        let dy = -CFG.catJumpSpeed;
        let y = fy;
        let xx = x;
        const vx = act === "jump_left" ? -CFG.catWalkSpeed : act === "jump_right" ? CFG.catWalkSpeed : 0;
        let apexY = y;
        for (let f = 0; f < 40 && dy < 0; f++) {
          dy += CFG.catFallingAcceleration;
          y += dy;
          xx += vx;
          apexY = Math.min(apexY, y);
        }
        // Apex touch: the head (y - height) crossed a platform top while rising.
        for (const [px, py] of floors) {
          const pe = D.platformEdges(px);
          if (py === fy) continue;
          if (xx >= pe.left - 1 && xx <= pe.right + 1) {
            // The cat's body spans y..y-18; snap if the apex reached above the
            // platform top while inside its span (the game snaps on any touch).
            const bodyTop = apexY; // apex of feet; head is feet - height
            if (bodyTop <= py && (bodyTop - 18) < py) {
              apexPositions.add(px + "," + py + "@" + x.toFixed(1));
            }
          }
        }
      }
    }
  }
}

const empties = [];
let states = 0;
const yOffsets = [-6, -3, 0, 3, 6, 10]; // within platformKeyUnder's 14px tolerance
const heights = [18];
const dys = [0, 1];

// 1) Floor-top grid, widened y/height/dy.
for (const [fx, fy] of floors) {
  const e = D.platformEdges(fx);
  for (let x = e.left; x <= e.right; x += 2) {
    for (const yOff of yOffsets) {
      for (const h of heights) {
        for (const dy of dys) {
          for (let mf = 240; mf <= 300; mf += 2) {
            for (const grounded of [true, false]) {
              const snap = snapAt(x, fy + yOff, dy, h, mf, grounded);
              states++;
              let call;
              try { call = D.buildObjectiveCall(snap, LEVEL_GEMS, []); }
              catch (err) {
                console.log("THROW x=" + x + " y=" + (fy + yOff) + " mf=" + mf +
                  " g=" + grounded + ": " + err.message);
                continue;
              }
              if (call.objectiveNames.length === 0) empties.push({ x, y: fy + yOff, mf, grounded, via: "grid" });
            }
          }
        }
      }
    }
  }
}

// 2) Apex-snap positions: grounded ON the snapped floor.
for (const key of apexPositions) {
  const at = key.indexOf("@");
  const [fxStr, fyStr] = key.slice(0, at).split(",");
  const x = parseFloat(key.slice(at + 1));
  const fy = parseFloat(fyStr);
  for (const yOff of [0, 3]) {
    for (let mf = 240; mf <= 300; mf += 2) {
      const snap = snapAt(x, fy + yOff, 0, 18, mf, true);
      states++;
      let call;
      try { call = D.buildObjectiveCall(snap, LEVEL_GEMS, []); }
      catch (err) {
        console.log("THROW(apex) x=" + x + " y=" + (fy + yOff) + " mf=" + mf + ": " + err.message);
        continue;
      }
      if (call.objectiveNames.length === 0) empties.push({ x, y: fy + yOff, mf, grounded: true, via: "apex" });
    }
  }
}

console.log("states examined: " + states + " (apex positions found: " + apexPositions.size + ")");
console.log("EMPTY menus: " + empties.length);
for (const s of empties.slice(0, 40)) {
  console.log("EMPTY x=" + s.x + " y=" + s.y + " mf=" + s.mf + " grounded=" + s.grounded + " via=" + s.via);
}
if (empties.length) {
  const s = empties[0];
  const snap = snapAt(s.x, s.y, 0, 18, s.mf, s.grounded);
  const here = REACH.platformKeyUnder(LEVEL, s.x, s.y);
  const reachable = here ? REACH.reachableFrom(LEVEL, here, 18) : null;
  const holder = REACH.platformHolding(LEVEL, 135, 143);
  console.log("\ndiag: floorUnder=" + here + " reachable=" + (reachable ? [...reachable].length : null) +
    " gem_a holder=" + holder + " canReach=" + (!reachable ? "?" : holder ? reachable.has(holder) : true) +
    " jumpHitsCeiling=" + D.jumpHitsCeiling(snap));
}
