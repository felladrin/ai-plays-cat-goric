"use strict";
// Blast-radius differential for the EXIT_FACT sentence (docs/research/flash-l2-l5-analysis.md).
// blast_routefirst_fix.cjs only rebuilds the OBJECTIVE call; EXIT_FACT appends to the
// MOVE call's state, so this script compares buildMoveCall state text, old (HEAD) vs
// new, over every decision of every archive under out/.
//
//   node research/blast_exit_fact.cjs            -> EXIT_FACT unset: expect 0 diffs
//   EXIT_FACT=1 node research/blast_exit_fact.cjs -> gate on: count states changed
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const OLD = require("../decision_old_scratch.cjs");
const NEW = require("../decision.cjs");
const PORTAL = { x: 180, y: 150 };

const GEM_SPAWNS = [
  [[66,235],[112,195],[160,165]],
  [[76,215],[121,140],[254,215]],
  [[180,188],[260,189],[90,188]],
  [[186,118],[216,103],[242,119]],
  [[289,156],[105,164],[182,226]],
  [[81,71],[260,147],[170,71]],
  [[135,143],[225,181],[221,108]],
  [[52,159],[139,269],[142,68]],
  [[74,231],[123,198],[301,251]],
  [[66,235],[112,101],[202,101]],
  [[229,123],[253,91],[287,68]],
  [[180,76],[180,110],[191,212]],
  [[279,169],[43,129],[207,203]],
  [[129,200],[72,152],[180,51]],
];

function snapOf(e, level) {
  const mf = e.movingFrames != null ? e.movingFrames : 0;
  const dd = 0.2 * mf;
  return {
    level, onPlatform: e.onPlatform, gemsCollected: e.gemsCollected,
    gemPositions: e.gemPositions || [],
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy || 0, height: e.cat.h || 18 },
    drones: { tl: { x: 0, y: 1 + dd }, tr: { x: 359 - dd, y: 0 }, bl: { x: 1 + dd, y: 310 }, br: { x: 360, y: 310 - dd } },
  };
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/^run_level_\d+_/.test(f) && f.endsWith(".json")) files.push(p);
  }
})(CFG.OUT_DIR);

let n = 0, diffs = 0, skipped = 0, changed = 0;
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length || !GEM_SPAWNS[d.levelIndex]) continue;
  for (const e of d.log) {
    if (!e.objective) { skipped++; continue; }
    const snap = snapOf(e, d.levelIndex);
    let a, b;
    try {
      a = OLD.buildMoveCall(snap, GEM_SPAWNS[d.levelIndex], e.objective, []);
      b = NEW.buildMoveCall(snap, GEM_SPAWNS[d.levelIndex], e.objective, []);
    } catch { skipped++; continue; } // descent/ascent objective vanished between rebuilds
    n++;
    if (a.state !== b.state) {
      diffs++;
      // Pure insertion: every old line survives in order, exactly one line added.
      const oa = a.state.split("\n"), ob = b.state.split("\n");
      let i = 0, j = 0, ins = 0;
      while (i < oa.length && j < ob.length) {
        if (oa[i] === ob[j]) { i++; j++; }
        else { j++; ins++; }
      }
      if (i === oa.length && ins === ob.length - oa.length) changed++;
      else if (diffs <= 3) console.log(`UNEXPECTED non-insertion diff: ${path.basename(f)} step ${e.step}`);
    }
  }
}
console.log(`EXIT_FACT=${process.env.EXIT_FACT || "(unset)"}: compared ${n}, skipped ${skipped}, state diffs ${diffs} (pure appends: ${changed})`);
