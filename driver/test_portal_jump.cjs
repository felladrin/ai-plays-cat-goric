"use strict";
// PORTAL_JUMP: the gem jump-window note for the exit portal (32x32 box).
const assert = require("assert");
for (const k of ["PRUNE_FATAL", "JUMP_FACTS", "HOLD_FIX", "COL_FACTS", "GEM_FACTS", "STICKY_OBJECTIVE", "EXIT_FACT", "RISE_LABEL", "NEG_HOLD", "PORTAL_DESC", "GAP_DROP"]) process.env[k] = "1";
process.env.MOVE_INSTR = "2";
delete process.env.PORTAL_JUMP;
const D = require("./decision.cjs");
const all = require("./experiments/gem_table.cjs")()[6];
const mf = 260;
const snap = (x, y) => ({ level: 6, gemsCollected: 3, aliveGems: 0, gemPositions: [], moving: false, onPlatform: true,
  cat: { x, y, dx: 0, dy: 0, height: 18 }, drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } } });
const NOTE = "A jump from this floor reaches the exit portal";
// L6, floor x 241..293 at y 176: jump_left from its left end passes through the portal box.
assert.ok(!D.buildMoveCall(snap(270, 176), all, "portal", []).state.includes(NOTE), "gate off: no line");
process.env.PORTAL_JUMP = "1";
const s = D.buildMoveCall(snap(270, 176), all, "portal", []).state;
assert.ok(s.includes("A jump from this floor reaches the exit portal: jump and steer left from x 241..253. The cat is at x 270, right of that range: walk left into it before jumping."), s);
// Floor x 211..263 at y 220 also reaches it (jump left from 211..239): true there too.
assert.ok(D.buildMoveCall(snap(240, 220), all, "portal", []).state.includes("jump and steer left from x 211..239"));
// A floor not below the portal box (x 289..341 at y 136, 166 >= 136): silent, like gems above-only.
assert.ok(!D.buildMoveCall(snap(300, 136), all, "portal", []).state.includes(NOTE));
delete process.env.PORTAL_JUMP;
console.log("test_portal_jump: Failed: 0");
