"use strict";
// L13 portal-approach trace (docs/flash-l2-l5-analysis.md). Measured, not hand-
// estimated: every arc below is arc.cjs simulate() from the ARCHIVED launch state
// (exact cat x/y, movingFrames), with opts.onFrame recording each frame.
//
// Portal hit test, from the game source (not assumed):
//   getPortalCollisionObject: {x: px-16, y: py-16, width: 32, height: 32}
//   getCatCollisionObject:    {x: cx, y: cy-h, width: 1, height: h}
//   checkCatCollisionWithPortal: kontra collides() = AABB overlap, once per game
//   loop frame, only when gemsCollected >= 3.
const fs = require("fs");
const path = require("path");
const CFG = require("../physics.cjs");
const { simulate } = require("../arc.cjs");

const PORTAL = { x: 180, y: 150 };
const px0 = PORTAL.x - 16, px1 = PORTAL.x + 16, py0 = PORTAL.y - 16, py1 = PORTAL.y + 16;
const hitsPortal = (cx, cy, h) => cx < px1 && cx + 1 > px0 && cy - h < py1 && cy > py0;
const H = 18;

function traceRun(level, x, y, dy, action, mf, grounded) {
  const frames = [];
  const r = simulate(level, x, y, dy, H, action, mf, { grounded, onFrame: (fx, fy, f, fdy) => frames.push({ f, x: fx, y: fy, dy: fdy }) });
  const hit = frames.findIndex((fr) => hitsPortal(fr.x, fr.y, H));
  // Which bound killed a "laser" outcome: recompute at the death frame.
  let bound = "";
  if (r.outcome === "laser") {
    const mfd = mf + r.frames;
    const top = 1 + CFG.droneSpeed * mfd + CFG.maxLaserHalfSize;
    const bottom = CFG.maximumLaserY - CFG.droneSpeed * mfd - CFG.maxLaserHalfSize;
    const left = 1 + CFG.droneSpeed * mfd + CFG.maxLaserHalfSize;
    const right = 359 - CFG.droneSpeed * mfd - CFG.maxLaserHalfSize;
    if (r.y - H <= top) bound = " TOP";
    if (r.y >= bottom) bound = " BOTTOM";
    if (r.x <= left) bound += " LEFT";
    if (r.x >= right) bound += " RIGHT";
  }
  return { ...r, frames, hit, bound, desc: `${r.outcome}${bound} f${r.frames} (${r.x.toFixed(1)},${r.y.toFixed(1)})` + (hit >= 0 ? ` PORTAL HIT f${frames[hit].f}` : "") };
}

const root = path.resolve(__dirname, "..", "..");
for (const seed of ["s3", "s4"]) {
  const f = path.join(root, "out", "byom", "PurpleMIST-Flash-1.0", seed, "run_level_13_systemone.json");
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const log = d.log;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.objective !== "portal" || !e.onPlatform || e.gemsCollected < 3) continue;
    const mf = e.movingFrames;
    const A = traceRun(13, e.cat.x, e.cat.y, 0, "jump_left", mf, true);   // hold the jump the whole way
    const W = traceRun(13, e.cat.x, e.cat.y, 0, "left", mf, true);        // walk left, step off the edge, keep holding
    const rev = log.slice(i + 1).find((x) => x.objective === "portal" && !x.onPlatform && x.move === "right");
    let obs = "no reversal found";
    if (rev) {
      let bi = 0, best = Infinity;
      A.frames.forEach((fr, k) => { const dd = Math.hypot(fr.x - rev.cat.x, fr.y - rev.cat.y); if (dd < best) { best = dd; bi = k; } });
      const fr = A.frames[bi];
      const B = traceRun(13, fr.x, fr.y, fr.dy, "right", mf + fr.f, false); // the observed apex reversal
      obs = `reversal->right at f${fr.f} (${fr.x.toFixed(1)},${fr.y.toFixed(1)}): ${B.desc}`;
    }
    console.log(`${seed} step ${e.step} (${e.cat.x.toFixed(2)},${e.cat.y}) mf=${Math.round(mf)} move=${e.move}`);
    console.log(`   held jump_left: ${A.desc}`);
    console.log(`   observed       : ${obs}`);
    console.log(`   held left (walk off edge): ${W.desc}`);
  }
}
