#!/usr/bin/env node
// Offline check of the route hint. Builds the objective call at a real archived
// state under decision.cjs and under the patched copy, and prints the difference.
//
//   node driver/experiments/check_route_hint.cjs
//
// This is the runnable check the hint needs: it fails loudly if the gate stops
// gating (the sentence appears where the objective is already collectable in one
// jump), if the per-direction window collapses back to the envelope (the sentence
// claims a direction that reaches nothing), or if the first hop stops being the
// y211 run. It needs no endpoint and no run, so it is the cheap half of the
// evidence; the probe and the level run are the other half.
const path = require("path");
const DRIVER = path.join(__dirname, "..");
const BASE = require(path.join(DRIVER, "decision.cjs"));
const PATCH = require(path.join(DRIVER, "decision.patched_route.cjs"));

// Level 11, the archived state at decision 141 of
// out/runs/PRE_L11_run_level_11_halogen_20260927-034150.json: grounded on the y231
// run at x=153.5, gems 0, movingFrames 321. The archive logs all of these.
// levelGems is the SPAWN table as [x,y] pairs (config.ts gemsPositionsPerLevel);
// snap.gemPositions is the live list as {x,y} (what the bridge logs).
const SPAWN = [
  [180, 76],
  [180, 110],
  [191, 212],
];
const GEMS = SPAWN.map(([x, y]) => ({ x, y }));
const rectInset = 0.2 * 321; // probe_move.cjs: the drone inset is droneSpeed * mf
const snap = {
  level: 11,
  gemsCollected: 0,
  gemPositions: GEMS,
  moving: false,
  onPlatform: true,
  cat: { x: 153.5, y: 231, dx: 0, dy: 0, height: 18 },
  drones: {
    tl: { x: 0, y: 1 + rectInset },
    tr: { x: 359 - rectInset, y: 0 },
    bl: { x: 1 + rectInset, y: 310 },
    br: { x: 360, y: 310 - rectInset },
  },
};

const gemLine = (state) => state.split("\n").find((l) => l.startsWith("- gem_a"));

const b = gemLine(BASE.buildObjectiveCall(snap, SPAWN, []).state);
const p = gemLine(PATCH.buildObjectiveCall(snap, SPAWN, []).state);
console.log("BASELINE\n  " + b);
console.log("\nPATCHED\n  " + p);

// The gate: standing on the y114 run, gem_a IS one jump away, so the sentence must
// be absent. The y114 run spans 88..140 and gem_a's box is x 172..188, collected
// from x 119..140 holding right.
const onY114 = { ...snap, cat: { ...snap.cat, x: 130, y: 114 } };
const p2 = PATCH.buildObjectiveCall(onY114, SPAWN, []).state;
const gemLine2 = p2.split("\n").find((l) => l.startsWith("- gem_a"));
console.log("\nGATE: same call from the y114 run (one jump from gem_a)\n  " + gemLine2);

const fail = [];
if (p === b) fail.push("the hint did not change the prompt at the y231 state");
if (!/FIRST HOP/.test(p)) fail.push("no FIRST HOP sentence at the y231 state");
if (!/jump LEFT from x 145\.\.171/.test(p)) fail.push("the launch window is not the recorded LEFT-only 145..171");
if (/jump RIGHT/.test(p)) fail.push("the sentence claims RIGHT reaches y211; the direction-specific integration says it never does");
if (!/y 211/.test(p)) fail.push("the first hop is not the y211 run");
if (/FIRST HOP/.test(gemLine2)) fail.push("the gate leaked: the sentence fired where the objective is one jump away");
for (const f of fail) console.log("  FAIL " + f);
console.log(fail.length ? `\n${fail.length} FAILURE(S)` : "\nall checks pass");
process.exit(fail.length ? 1 : 0);
