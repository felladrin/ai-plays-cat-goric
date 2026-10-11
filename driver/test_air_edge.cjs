"use strict";
// AIR_EDGE: airborne just past a floor's end, the floor block says where the cat
// is (not "the floor you stand on") and drops "NO way down at your current x".
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.AIR_EDGE;
const D = require("./decision.cjs");
const all = require("./experiments/gem_table.cjs")()[2];
// L2, the archived left-edge state: (71.5,64.4) dy 0.4 mf 81, objective gem_c.
const mf = 81;
const snap = (x, y, dy, on) => ({ level: 2, gemsCollected: 0, aliveGems: 3, gemPositions: all.map(([gx, gy]) => ({ x: gx, y: gy })), moving: false, onPlatform: on,
  cat: { x, y, dx: 0, dy, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } });
const air = snap(71.5, 64.4, 0.4, false);

const off = D.buildMoveCall(air, all, "gem_c", []).state;
assert.ok(off.includes("The floor you stand on is continuous from x 74"), "gate off keeps today's text");

process.env.AIR_EDGE = "1";
const on = D.buildMoveCall(air, all, "gem_c", []).state;
assert.ok(on.includes("The cat is in the air just past the LEFT end (x 74) of the floor x 74..286 at y 64. Steering right now lands the cat back on this floor."), on);
assert.ok(!on.includes("NO way down at your current x"), "the false sentence is gone");
assert.ok(!on.includes("The floor you stand on"), "no 'stand on' while airborne past the end");
// Grounded on the same floor: unchanged text.
const ground = snap(100, 64, 0, true);
assert.strictEqual(D.buildMoveCall(ground, all, "gem_c", []).state, (() => { delete process.env.AIR_EDGE; const s = D.buildMoveCall(ground, all, "gem_c", []).state; process.env.AIR_EDGE = "1"; return s; })());
delete process.env.AIR_EDGE;
console.log("test_air_edge: Failed: 0");
