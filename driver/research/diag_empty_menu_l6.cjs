"use strict";
// Reproduces the empty objective menu that killed Darwin-27B-ZTC level 6 at
// step 274 (seeds 1 and 2): the adapter rejected the objective call with
// 422 "'criteria' must be a non-empty object", i.e. a genuinely empty menu.
//
// SWEEP (no endpoint, no GPU): every x on every L6 floor (2px grid),
// every mf in the window, grounded and airborne, with only gem_a live
// (collected=2). Prints every state whose objective menu is EMPTY.

const D = require("../decision.cjs");
const P = require("../level_data.cjs");
const REACH = require("../reachability.cjs");

const LEVEL = 6;
const LEVEL_GEMS = [{ x: 135, y: 143 }, { x: 225, y: 181 }, { x: 221, y: 108 }];
const MF_MIN = 240, MF_MAX = 300, MF_STEP = 2;

function snapAt(cx, cy, mf, grounded) {
  const d = 1 + 0.2 * mf;
  return {
    level: LEVEL,
    gemsCollected: 2,
    aliveGems: 1,
    gemPositions: [{ x: 135, y: 143 }],
    onPlatform: grounded,
    cat: { x: cx, y: cy, dx: 0, dy: grounded ? 0 : 1, height: 18 },
    drones: {
      tl: { x: d, y: d }, tr: { x: d, y: d },
      bl: { x: d, y: d }, br: { x: d, y: d },
    },
  };
}

const floors = P.platforms(LEVEL);
const empties = [];
let states = 0;

for (const [fx, fy] of floors) {
  const e = D.platformEdges(fx);
  for (let x = e.left; x <= e.right; x += 2) {
    for (const grounded of [true, false]) {
      for (let mf = MF_MIN; mf <= MF_MAX; mf += MF_STEP) {
        const snap = snapAt(x, fy, mf, grounded);
        states++;
        let call;
        try {
          call = D.buildObjectiveCall(snap, LEVEL_GEMS, []);
        } catch (err) {
          console.log("THROW  x=" + x + " y=" + fy + " mf=" + mf +
            " grounded=" + grounded + ": " + err.message);
          continue;
        }
        if (call.objectiveNames.length === 0) {
          empties.push({ x, y: fy, mf, grounded });
        }
      }
    }
  }
}

console.log("states examined: " + states);
console.log("EMPTY menus: " + empties.length);
for (const s of empties.slice(0, 60)) {
  const snap = snapAt(s.x, s.y, s.mf, s.grounded);
  const here = REACH.platformKeyUnder(LEVEL, s.x, s.y);
  const desc = D.descentPoints(snap, LEVEL_GEMS).map((p) => p.name);
  const asc = D.ascentPoints(snap, LEVEL_GEMS).map((p) => p.name);
  console.log("EMPTY x=" + s.x + " y=" + s.y + " mf=" + s.mf +
    " grounded=" + s.grounded + " floorUnder=" + here +
    " descents=" + JSON.stringify(desc) + " ascents=" + JSON.stringify(asc));
}

// If any empties exist, diagnose the first one in depth: which filter removed
// each candidate (gems -> routeBlocked, descents, ascents).
if (empties.length) {
  const s = empties[0];
  const snap = snapAt(s.x, s.y, s.mf, s.grounded);
  const call = D.buildObjectiveCall(snap, LEVEL_GEMS, []);
  const alive = call.alive;
  const here = REACH.platformKeyUnder(LEVEL, s.x, s.y);
  const reachable = here ? REACH.reachableFrom(LEVEL, here, 18) : null;
  console.log("\n=== deep dive on " + JSON.stringify(s) + " ===");
  console.log("alive: " + JSON.stringify(alive.map((g) => g.name)));
  for (const g of alive) {
    const holder = REACH.platformHolding(LEVEL, g.x, g.y);
    const canR = !reachable ? true : holder ? reachable.has(holder) : true;
    console.log("  " + g.name + " holder=" + holder + " canReach=" + canR);
  }
  console.log("jumpHitsCeiling: " + D.jumpHitsCeiling(snap));
  console.log("descents: " + JSON.stringify(D.descentPoints(snap, LEVEL_GEMS).length));
  console.log("ascents: " + JSON.stringify(D.ascentPoints(snap, LEVEL_GEMS).length));
}
