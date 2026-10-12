"use strict";
// Blast-radius differential for the DESC_ANNOT descent annotation (a " (gem_x is
// there)" suffix on a descent crit when EVERY platform the step-off can land on is
// the holder of that live gem). The annotation rides the descent label into the
// OBJECTIVE call's criteria text, so this compares the rebuilt objective call
// (state + criteria), old (decision_old_scratch.cjs = pre-DESC_ANNOT copy) vs new.
//
//   node research/blast_desc_annot.cjs             -> DESC_ANNOT unset: expect 0 diffs
//   DESC_ANNOT=1 node research/blast_desc_annot.cjs -> gate on: diffs = firings,
//                                                        each a pure text addition to
//                                                        a descent_* criterion
const fs = require("fs");
const path = require("path");
const CFG = require("../config.cjs");
const OLD = require("../decision_old_scratch.cjs");
const NEW = require("../decision.cjs");

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
    aliveGems: 3 - e.gemsCollected, moving: false,
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

const canon = (call) => {
  const crit = Object.entries(call.questions.objective.criteria)
    .map(([n, c]) => n + ": " + c).sort().join("\n");
  return call.state + "\n" + crit;
};

let n = 0, diffs = 0, skipped = 0, pureAdd = 0;
const perLevel = {};
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  if (!d.log || !d.log.length || !GEM_SPAWNS[d.levelIndex]) continue;
  for (const e of d.log) {
    const snap = snapOf(e, d.levelIndex);
    let a, b;
    try {
      a = OLD.buildObjectiveCall(snap, GEM_SPAWNS[d.levelIndex], []);
      b = NEW.buildObjectiveCall(snap, GEM_SPAWNS[d.levelIndex], []);
    } catch { skipped++; continue; }
    n++;
    const ta = canon(a), tb = canon(b);
    if (ta !== tb) {
      diffs++;
      perLevel[d.levelIndex] = (perLevel[d.levelIndex] || 0) + 1;
      // Pure addition: identical menu (same criteria keys), and each changed
      // criterion is the old text with a " (gem_x is there)" suffix inserted
      // before any trailing cost text.
      const ca = Object.fromEntries(Object.entries(a.questions.objective.criteria));
      const cb = Object.fromEntries(Object.entries(b.questions.objective.criteria));
      const keysA = Object.keys(ca).sort().join(","), keysB = Object.keys(cb).sort().join(",");
      let ok = keysA === keysB;
      if (ok) {
        for (const k of Object.keys(ca)) {
          if (ca[k] === cb[k]) continue;
          if (!/^descent_/.test(k)) { ok = false; break; }
          // the annotation must be a substring insertion, everything else intact
          const m = cb[k].match(/^(.*) \((gem_[abc](?: and gem_[abc])? (?:is|are) there)\)(.*)$/);
          if (!m || m[1] + m[3] !== ca[k]) { ok = false; break; }
        }
      }
      if (ok) pureAdd++;
      else if (diffs <= 3) console.log(`UNEXPECTED diff: ${path.basename(f)} step ${e.step}`);
    }
  }
}
console.log(`DESC_ANNOT=${process.env.DESC_ANNOT || "(unset)"}: compared ${n}, skipped ${skipped}, diffs ${diffs} (pure descent-crit additions: ${pureAdd})`);
console.log("per level:", JSON.stringify(perLevel));
