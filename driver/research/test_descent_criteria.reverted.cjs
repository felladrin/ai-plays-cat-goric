"use strict";
// Standalone on purpose: appended to another suite this never runs, because an
// earlier assert there throws and kills the process.
//
// What this pins down. The classifier scores the `crit` string attached to each
// label, NOT the `line` written into the state text. They are built separately,
// and for descents only `line` carried the landing. Standing at (248.75,93) on
// level 4 that left the menu as:
//   descent_right  "straight-line 2px"   -> the (289,171) ledge
//   descent_left   "straight-line 50px"  -> x 156..208 at y 241, gem_c's floor
// The model took the 2px one at p=0.96 on every pass. Once gem_a is collected
// that ledge has no gem and no descent off it, so the run became an exact
// 31-decision limit cycle repeated to the 3000-step cap.
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const d = require("./decision.cjs");

const lg4 = [[289, 156], [105, 164], [182, 226]];
const alive = [{ x: 289, y: 156 }, { x: 105, y: 164 }, { x: 182, y: 226 }];
const snap = {
  level: 4, gemsCollected: 0, aliveGems: 3, gemPositions: alive,
  moving: true, onPlatform: true, cat: { x: 248.75, y: 93, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 9 }, tr: { x: 351, y: 0 }, bl: { x: 9, y: 310 }, br: { x: 360, y: 302 } },
};

const call = d.buildObjectiveCall(snap, lg4, []);
const descents = call.objectiveNames.filter((n) => /^descent_/.test(n));
assert(descents.length === 2, `expected both descents on this floor, got ${descents.join(",")}`);

for (const n of descents) {
  const crit = call.questions.objective.criteria[n];
  assert(/lands on x \d+\.\.\d+ at y \d+/.test(crit),
    `${n} criterion must name where the descent lands, got: ${crit}`);
}

// The whole point: the two descents must be DISTINGUISHABLE by something other
// than their distance from the cat. Equal strings mean the nearer edge wins by
// default, which is the bug.
const [a, b] = descents.map((n) => call.questions.objective.criteria[n].replace(/straight-line \d+px/, ""));
assert(a !== b, "the two descent criteria must differ beyond their distance");

// gem_c sits at (182,226) on the platform spanning x 156..208 at y 241. The
// descent that reaches it must say so, or the model has no way to prefer it.
const left = call.questions.objective.criteria["descent_left"];
assert(left.includes("x 156..208 at y 241"),
  `descent_left must advertise gem_c's floor, got: ${left}`);

// DIRECTION. landOn is symmetric, so before the split "step off the right end"
// also advertised x 156..208 at y 241 -- a platform 45px to the LEFT, reachable
// only by reversing the instant the cat leaves the edge. Both descents then read
// the same destination and the model alternated between them for 20 consecutive
// decisions without executing either. The end a descent is named after decides
// which landing it may claim.
const right = call.questions.objective.criteria["descent_right"];
assert(!right.includes("x 156..208 at y 241"),
  `descent_right must not claim a landing behind it, got: ${right}`);
assert(right.includes("x 263..315 at y 171"),
  `descent_right must name the floor it actually steps onto, got: ${right}`);

// GEM ANNOTATION AND THE ONE-WAY WARNING MUST TRAVEL TOGETHER. Landing
// coordinates alone do not decide the choice: on this floor the model took
// descent_right (13px, the gem_a ledge) over descent_left (39px, gem_c's floor)
// at 0.79 vs 0.14 while its own objective was gem_c. An earlier attempt added the
// gem names to `crit` but left the ONE-WAY stranding warning in `line`, so the
// model scored the advertised gems with the counter-argument invisible, and on
// level 4's start floor it walked into the stranded state. Either both are in the
// scored string or neither is.
assert(/x 156\.\.208 at y 241 \(gem_c is there\)/.test(call.questions.objective.criteria["descent_left"]),
  `descent_left must name the gem on its landing, got: ${call.questions.objective.criteria["descent_left"]}`);

const start = { ...snap, cat: { x: 140.25, y: 93, dy: 0, height: 18 } };
const startCall = d.buildObjectiveCall(start, lg4, []);
const startRight = startCall.questions.objective.criteria["descent_right"];
assert(/\(gem_c is there\)/.test(startRight),
  `the start floor's descent_right must name the gem it lands next to, got: ${startRight}`);
assert(/ONE-WAY/.test(startRight),
  `a one-way descent must carry its stranding warning in the SCORED string, got: ${startRight}`);

console.log("descent criteria name their landing: PASS");
