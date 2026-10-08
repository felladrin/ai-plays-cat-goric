"use strict";
// The descent offer must not survive the closing side lasers. descentPoints'
// landOn check integrates geometry only; without the laser-state gate the menu
// kept offering "step off the right end" on L12 after the right laser had
// closed to x 301 (out/exp_combo2/L12_s1.log: the cat held at the edge with
// the death history saying "you chose right and laser" while the menu said
// step off). Run with: node test_descent_laser_gate.cjs
const assert = require("assert");
const dec = require("./decision.cjs");

// L12 floor x 247..299 at y 125; gem_a (279,169) below it keeps the descent
// objective-relevant. Stepping off x 299 lands safely until the right laser
// closes past it (~mf 290), after which both release styles die (measured:
// mf 280 release lands, mf 300 release lasers).
const GEMS = [[279, 169], [43, 129], [207, 203]];
const snapAt = (mf) => ({
  level: 12,
  cat: { x: 270, y: 125, dy: 0, height: 18 },
  onPlatform: true,
  drones: { tl: { x: 1, y: 1 + 0.2 * mf }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
  gemsCollected: 1,
  aliveGems: 2,
  gemPositions: [{ x: 279, y: 169 }, { x: 207, y: 203 }],
});
const offered = (mf) => {
  const call = dec.buildObjectiveCall(snapAt(mf), GEMS, []);
  return Object.keys(call.questions.objective.criteria);
};

const early = offered(200);
assert.ok(early.includes("descent_right"), "descent_right must be offered while the fall survives: " + early);
const late = offered(310);
assert.ok(!late.includes("descent_right"), "descent_right must vanish once stepping off dies at the laser: " + late);
assert.ok(late.length > 0, "the menu must not empty out entirely: " + late);
console.log("test_descent_laser_gate: ok");
