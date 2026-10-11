"use strict";
// FLOOR_FIX and GAP_WALK: the floor block names the right floor and its real ends.
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.FLOOR_FIX; delete process.env.GAP_WALK;
const D = require("./decision.cjs");
const GEMS = require("./experiments/gem_table.cjs")();
const at = (level, x, y, dy, on, mf, obj, keep) => {
  const all = GEMS[level];
  const gp = (keep || all.map((_, i) => i)).map((i) => ({ x: all[i][0], y: all[i][1] }));
  const snap = { level, gemsCollected: all.length - gp.length, aliveGems: gp.length, gemPositions: gp, moving: !on, onPlatform: on,
    cat: { x, y, dx: 0, dy, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } };
  return D.buildMoveCall(snap, all, obj, []).state;
};
// FLOOR_FIX: L8, airborne by the right spawn floor x 284..336 at y 42.
assert.ok(at(8, 339.75, 43.2, 0.8, false, 78, "gem_c").includes("continuous from x 24 to x 76 at y 42"), "gate off: the far floor (today)");
process.env.FLOOR_FIX = "1";
assert.ok(at(8, 339.75, 43.2, 0.8, false, 78, "gem_c").includes("continuous from x 284 to x 336 at y 42"));
delete process.env.FLOOR_FIX;
// GAP_WALK: L12 floor x 58..215 at y 165 is three platforms with 1px gaps, walked across.
assert.ok(at(12, 148, 165, 0, true, 144, "gem_c", [0, 2]).includes("The gap to the RIGHT is 1px wide; walking cannot cross it"), "gate off: today's false sentence");
process.env.GAP_WALK = "1";
const s = at(12, 148, 165, 0, true, 144, "gem_c", [0, 2]);
assert.ok(s.includes("continuous from x 58 to x 215 at y 165") && !s.includes("1px wide"), s);
delete process.env.GAP_WALK;
console.log("test_floor_text: Failed: 0");
