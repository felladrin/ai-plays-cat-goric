"use strict";
// PORTAL_WALK: say when walking along this floor reaches the exit portal.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.PORTAL_WALK;
const D = require("../decision.cjs");
const all = require("../research/gem_table.cjs")()[12];
const at = (x, y, mf) => ({ level: 12, gemsCollected: 3, aliveGems: 0, gemPositions: [], moving: false, onPlatform: true,
  cat: { x, y, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } });
const call = (x, y) => D.buildMoveCall(at(x, y, 347), all, "portal", []);
const SENT = "Walking left along this floor reaches it: the portal begins 17px to the left, at x 196.";
assert.ok(!call(212.5, 165).state.includes("Walking left along this floor"), "gate off");
process.env.PORTAL_WALK = "1";
assert.ok(call(212.5, 165).state.includes(SENT));
// y231 is below the portal box: no sentence there.
assert.ok(!call(246, 231).state.includes("along this floor reaches it"));
process.env.PORTAL_WALK = "2";
assert.strictEqual(call(212.5, 165).questions.move.criteria.left, "walk left (walking along this floor reaches the exit portal at x 196)");
assert.ok(!call(212.5, 165).state.includes(SENT));
// Off the floor's end: L13, floor x 206..258 at y 136, mf 228; held left off x 206 enters the portal.
const T13 = require("../research/gem_table.cjs")()[13];
const l13 = { ...at(243.25, 136, 228), level: 13 };
process.env.PORTAL_WALK = "1";
assert.ok(D.buildMoveCall(l13, T13, "portal", []).state.includes("Walking left off this floor's left end (x 206) carries the cat into it."));
process.env.PORTAL_WALK = "2";
assert.strictEqual(D.buildMoveCall(l13, T13, "portal", []).questions.move.criteria.left, "walk left (off this floor's left end at x 206 the cat falls into the exit portal)");
delete process.env.PORTAL_WALK;
console.log("test_portal_walk: Failed: 0");
