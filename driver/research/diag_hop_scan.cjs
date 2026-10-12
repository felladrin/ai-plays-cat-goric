"use strict";
// Which filter in hopPoints kills the y231 -> y211 landing?
//
// Read-only diagnosis. It re-implements hopPoints' scan loop verbatim (same x
// sequence, same action order, same filters in the same order) and records the
// FIRST line that rejects each (x, action) pair, so the cause is counted rather
// than argued. It calls no endpoint and writes nothing.
const CFG = require("../physics.cjs");
const LEVELS = require("../level_data.cjs");
const { simulate, platformBoxes } = require("../arc.cjs");

const LEVEL = 11;
const boxes = platformBoxes(LEVEL);
const plats = LEVELS.platforms(LEVEL);
const edgesOf = (x) => boxes.find((b) => b.x === x);

function scan(snap) {
  const f = { run: { left: 145, right: 197 }, curY: 231 };
  const { run, curY } = f;
  const h = snap.cat.height;
  const mf = snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
  const tally = {};
  const accepted = [];
  // Every (x, act) that produced a real landing on the y211 platform, whatever
  // filter then rejected it.
  const hit211 = [];
  let tried = 0;
  for (let x = run.left; x <= run.right; x += 2) {
    for (const act of ["jump_left", "jump", "jump_right"]) {
      tried++;
      const r = simulate(LEVEL, x, curY, 0, h, act, mf, { grounded: true });
      let why = null;
      let landed = null;
      if (r.outcome !== "landed") why = "L107 outcome=" + r.outcome;
      else {
        landed = plats.find((p) => Math.abs(p[1] - r.y) < 0.01 && r.x >= edgesOf(p[0]).left - 1 && r.x <= edgesOf(p[0]).right + 1);
        if (!landed) why = "L108 no platform at y " + r.y.toFixed(2) + " x " + r.x.toFixed(2);
        else if (landed[1] === curY && landed[0] >= run.left && landed[0] <= run.right) why = "L110 back on our own run";
        else if (landed[1] >= curY - 20) why = "L116 not strictly higher (y " + landed[1] + " >= " + (curY - 20) + ")";
      }
      if (landed && landed[1] === 211) hit211.push({ x, act, landX: r.x, frames: r.frames, why: why || "ACCEPTED" });
      if (why) tally[why] = (tally[why] || 0) + 1;
      else accepted.push({ x, act, plat: landed, landX: r.x, frames: r.frames });
    }
  }
  return { tally, accepted, hit211, tried };
}

const snap = { level: LEVEL, cat: { x: 153.5, y: 231, height: 18 }, drones: { tl: { y: 1 + 0.2 * 140 } } };
const r = scan(snap);

console.log("L11 y231 run x145..197, mf=140, cat height 18, " + r.tried + " (x,action) pairs\n");
console.log("REJECTION TALLY (first rejecting line wins)");
for (const k of Object.keys(r.tally).sort((a, b) => r.tally[b] - r.tally[a])) console.log("  " + String(r.tally[k]).padStart(4) + "  " + k);
console.log("\nACCEPTED (become candidates): " + r.accepted.length);
for (const a of r.accepted) console.log("  x=" + a.x + " " + a.act + " -> plat " + a.plat + " landX=" + a.landX.toFixed(2) + " frames=" + a.frames);
console.log("\nPAIRS THAT LANDED ON THE y211 PLATFORM: " + r.hit211.length);
for (const h of r.hit211) console.log("  x=" + h.x + " " + h.act + " landX=" + h.landX.toFixed(2) + " frames=" + h.frames + "  " + h.why);

const xs = [...new Set(r.hit211.map((h) => h.x))].sort((a, b) => a - b);
console.log("\ny211 launch x values the scan actually tried: " + (xs.length ? xs[0] + ".." + xs[xs.length - 1] + " (" + xs.length + " values, step " + (xs[1] - xs[0]) + ")" : "none"));
