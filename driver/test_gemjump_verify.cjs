"use strict";
// GEMJUMP_VERIFY: a gem jump window claims only launches whose held jump touches the gem.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.GEMJUMP_VERIFY;
const D = require("./decision.cjs");
const GEMS = require("./experiments/gem_table.cjs")();
const at = (level, x, y, mf, obj, keep) => {
  const all = GEMS[level];
  const gp = (keep || all.map((_, i) => i)).map((i) => ({ x: all[i][0], y: all[i][1] }));
  const snap = { level, gemsCollected: all.length - gp.length, aliveGems: gp.length, gemPositions: gp, moving: false, onPlatform: true,
    cat: { x, y, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
  return D.buildMoveCall(snap, all, obj, []).state;
};
// L11 floor x 222..274 at y 228, gem_c: the envelope claims a jump_left window; every held one lands on y 187 first.
assert.ok(at(11, 249.75, 228, 225, "gem_c", [2]).includes("A jump from this floor collects gem_c"), "gate off: today's (false) line");
process.env.GEMJUMP_VERIFY = "1";
assert.ok(!at(11, 249.75, 228, 225, "gem_c", [2]).includes("collects gem_c"), "verified: no held jump collects it");
// True windows survive: L11 gem_a from y 114, L10 gem_c from the tower at y 140.
assert.ok(at(11, 125.5, 114, 150, "gem_a").includes("A jump from this floor collects gem_a: jump and steer right from x 120..139."));
assert.ok(at(10, 323, 140, 100, "gem_c").includes("A jump from this floor collects gem_c: jump and steer left from x 304..330."));
delete process.env.GEMJUMP_VERIFY;
console.log("test_gemjump_verify: Failed: 0");
