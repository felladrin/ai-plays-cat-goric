"use strict";
// Blast radius of the one-character change to hop_points.cjs:116.
//
// The y231 -> y211 landing is rejected by `landed[1] >= curY - 20` with curY=231:
// the y211 platform sits EXACTLY at the 20px "same level" tolerance, so a platform
// 20px above the floor is discarded as if it were level with it. The alternatives
// (the arc model, the exact-y match, the step-2 x scan) are all disproved by
// diag_hop_scan.cjs.
//
// hop_points.cjs's header records that widening this gate cost L2 and L3, so the
// question is not "is the fix right" but "how much else does it admit". This counts,
// for every run of every level, which platform keys each gate version accepts.
// It calls no endpoint and changes nothing.
//
// mf is held at 0 to isolate geometry from laser pressure, and catHeight at 18.
const CFG = require("../physics.cjs");
const LEVELS = require("../level_data.cjs");
const { simulate, platformBoxes } = require("../arc.cjs");

const HEIGHT = 18;

function runsOfLevel(level) {
  const boxes = platformBoxes(level);
  const byY = new Map();
  for (const b of boxes) {
    if (!byY.has(b.y)) byY.set(b.y, []);
    byY.get(b.y).push(b);
  }
  const out = [];
  for (const [y, bs] of byY) {
    bs.sort((a, b) => a.left - b.left);
    const merged = [];
    for (const b of bs) {
      if (merged.length && b.left <= merged[merged.length - 1].right) merged[merged.length - 1].right = Math.max(merged[merged.length - 1].right, b.right);
      else merged.push({ left: b.left, right: b.right });
    }
    for (const m of merged) out.push({ y, left: m.left, right: m.right });
  }
  return out;
}

// gate "now"   : reject landed[1] >= curY - 20   (the y211 platform dies here)
// gate "flip"  : reject landed[1] >  curY - 20   (admits exactly 20px above)
function keysFor(level, run, gate) {
  const plats = LEVELS.platforms(level);
  const boxes = platformBoxes(level);
  const edgesOf = (x) => boxes.find((b) => b.x === x);
  const keys = new Map();
  for (let x = run.left; x <= run.right; x += 2) {
    for (const act of ["jump_left", "jump", "jump_right"]) {
      const r = simulate(level, x, run.y, 0, HEIGHT, act, 0, { grounded: true });
      if (r.outcome !== "landed") continue;
      const landed = plats.find((p) => Math.abs(p[1] - r.y) < 0.01 && r.x >= edgesOf(p[0]).left - 1 && r.x <= edgesOf(p[0]).right + 1);
      if (!landed) continue;
      if (landed[1] === run.y && landed[0] >= run.left && landed[0] <= run.right) continue;
      const kills = gate === "now" ? landed[1] >= run.y - 20 : landed[1] > run.y - 20;
      if (kills) continue;
      const key = `${landed[0]},${landed[1]}`;
      if (!keys.has(key)) keys.set(key, { plat: landed, launches: [] });
      keys.get(key).launches.push(x);
    }
  }
  return keys;
}

const rows = [];
for (let level = 0; level <= 14; level++) {
  const runs = runsOfLevel(level);
  let grew = 0, totalRuns = 0, lost = 0;
  const gained = [];
  for (const run of runs) {
    const now = keysFor(level, run, "now");
    const flip = keysFor(level, run, "flip");
    if (!now.size && !flip.size) continue;
    totalRuns++;
    const extra = [...flip.keys()].filter((k) => !now.has(k));
    const gone = [...now.keys()].filter((k) => !flip.has(k));
    lost += gone.length;
    if (extra.length) {
      grew++;
      for (const k of extra) {
        const p = flip.get(k).plat;
        gained.push(`y${run.y}[${run.left}..${run.right}] +${k} (${run.y - p[1]}px up)`);
      }
    }
  }
  rows.push({ level, totalRuns, grew, lost, gained });
}

console.log("mf=0, catHeight=18, every run of every level. 'grew' = runs where the flip admits >=1 platform the current gate hides.\n");
console.log("lvl  runs  grew  lost  gained");
for (const r of rows) console.log(String(r.level).padStart(3) + String(r.totalRuns).padStart(6) + String(r.grew).padStart(6) + String(r.lost).padStart(6) + "  " + r.gained.join("  "));
