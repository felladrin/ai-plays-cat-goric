"use strict";
// Blast radius of the portal-exemption fix in survival.cjs (docs/flash-l13-analysis.md):
// old (git HEAD) vs new pruneFatal over every decision of every archive, on the same
// menu. Reports per level how many archived decisions get a DIFFERENT kept set.
// The fix can only change airborne gemsCollected>=3 states; anything else changing
// is a bug in the fix.
const fs = require("fs");
const path = require("path");
const OLD = require("../survival_old_scratch.cjs");
const NEW = require("../survival.cjs");

const MENU = { left: "l", right: "r", none: "n", jump: "j", jump_left: "jl", jump_right: "jr" };
const OUT = path.resolve(__dirname, "..", "..", "out");
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p);
  }
})(OUT);

const per = {};
let n = 0, diffs = 0, gc3air = 0;
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length) continue;
  const li = d.levelIndex;
  per[li] = per[li] || { n: 0, diff: 0 };
  for (const e of d.log) {
    if (!e.cat) continue;
    const mf = e.movingFrames != null ? e.movingFrames : 0;
    const snap = {
      level: li, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
      cat: { x: e.cat.x, y: e.cat.y, dy: e.cat.dy || 0, height: e.cat.h || 18 },
      drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 0 }, bl: { x: 1 + 0.2 * mf, y: 310 }, br: { x: 360, y: 310 - 0.2 * mf } },
    };
    let a, b;
    try {
      a = Object.keys(OLD.pruneFatal(snap, MENU)).sort().join(",");
      b = Object.keys(NEW.pruneFatal(snap, MENU)).sort().join(",");
    } catch { continue; }
    n++;
    per[li].n++;
    if (!e.onPlatform && e.gemsCollected >= 3) gc3air++;
    if (a !== b) {
      diffs++;
      per[li].diff++;
      if (per[li].diff <= 2) console.log(`L${li} step ${e.step} gc=${e.gemsCollected} ${e.onPlatform ? "grounded" : "air"}: [${a}] -> [${b}]`);
    }
  }
}
console.log(`decisions compared: ${n}, airborne gc>=3: ${gc3air}, menu diffs: ${diffs}`);
for (const [l, v] of Object.entries(per)) if (v.diff) console.log(`  L${l}: ${v.diff}/${v.n}`);
