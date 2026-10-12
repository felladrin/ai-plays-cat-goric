// A gate set to "0" must be OFF, like every older gate in decision.cjs (=== "1").
// A/B scripts set the off arm explicitly (ROUTE_ASCENT=0 in the L11 A/B), so a
// truthiness check would quietly run both arms with the lever ON.
const assert = require("assert");
process.env.JUMP_FACTS = "1";
for (const k of ["PRUNE_FATAL", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
const FB = require("../fall_blame.cjs");
const CUR = require("../decision.cjs");
const GEMS = require("../research/gem_table.cjs")();

process.env.FALL_BLAME = "0";
const fb = FB.createFallBlame();
fb.observe("130,90", 93, "right");
fb.observe("200,240", 241, "left");
assert.deepStrictEqual(fb.blameKeys(241), [], "FALL_BLAME=0 must add no blame");

process.env.MISS_BLAME = "0";
const mb = FB.createMissBlame();
mb.observeAll(127.25, 112.4, "left", [{ name: "gem_a", x: 135, y: 143 }]);
assert.deepStrictEqual(mb.lines(), [], "MISS_BLAME=0 must add no line");

process.env.GAP_JUMP = "0";
const snap = {
  level: 4, gemsCollected: 0, aliveGems: GEMS[4].length,
  gemPositions: GEMS[4].map((p) => ({ x: p[0], y: p[1] })),
  moving: false, onPlatform: true,
  cat: { x: 140.25, y: 93, dx: 0, dy: 0, height: 18 },
  drones: { tl: { x: 0, y: 1 }, tr: { x: 359, y: 0 }, bl: { x: 1, y: 310 }, br: { x: 360, y: 310 } },
};
assert.ok(!CUR.buildMoveCall(snap, GEMS[4], "gem_a", []).state.includes("crosses to platform"), "GAP_JUMP=0 must name no crossing");

console.log("test_gate_off_values: all assertions passed");
