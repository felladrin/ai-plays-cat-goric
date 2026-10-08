#!/usr/bin/env node
// Census split for the GEM_FACTS / GEM_FROM clauses (docs/results.md, Clef
// section): how often each fires on the clearing levels against the failing
// ones, over every grounded decision logged in the given run archives. Offline,
// no endpoint calls. A clause that fires about as often on both sets is the
// dead class in docs/dead-ends.md (census).
//
//   node driver/experiments/census_gem_from.cjs out/clef_baseline/run_level_*_clef.json
//   node driver/experiments/census_gem_from.cjs out/exp_climb/L*.json
//
// The level comes from each archive's levelIndex (or an L<n> file name), and the
// gem spawn order from its first logged decision.
"use strict";
process.env.GEM_FACTS = "1";
const fs = require("fs");
const path = require("path");
const d = require("../decision.cjs");

const CLEARING = [0, 1, 2, 5, 7, 8];
const FAILING = [4, 6, 10, 11, 12, 13];
const drones = (mf) => ({ tl: { x: 1 + 0.2 * mf, y: 1 + 0.2 * mf }, tr: { x: 359 - 0.2 * mf, y: 1 + 0.2 * mf }, bl: { x: 1 + 0.2 * mf, y: 310 - 0.2 * mf }, br: { x: 359 - 0.2 * mf, y: 310 - 0.2 * mf } });

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: census_gem_from.cjs <run archive.json>..."); process.exit(2); }
const per = {};
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const m = path.basename(f).match(/^L(\d+)/);
  const L = j.levelIndex != null ? j.levelIndex : m ? Number(m[1]) : null;
  if (L == null) throw new Error(`${f}: no levelIndex and no L<n> file name`);
  const spawn = j.log[0].gemPositions.map((p) => [p.x, p.y]);
  const c = (per[L] = per[L] || { n: 0, objFrom: 0, moveFrom: 0, deadEnd: 0 });
  for (const e of j.log) {
    if (!e.onPlatform) continue;
    c.n++;
    const snap = { level: L, onPlatform: true, cat: { x: e.cat.x, y: e.cat.y, dy: 0, height: e.cat.h }, gemPositions: e.gemPositions, gemsCollected: e.gemsCollected, drones: drones(e.movingFrames) };
    const alive = d.matchGemsToSpawn(spawn, e.gemPositions);
    // Objective prompt: the sentence would be attached to any live gem.
    if (alive.some((g) => d.gemFromNote(snap, g.name, g))) c.objFrom++;
    // Move prompt: only for the gem being pursued.
    const t = alive.find((g) => g.name === e.objective);
    if (t && d.gemFromNote(snap, t.name, t)) c.moveFrom++;
    if (/it is a dead end/.test(d.buildObjectiveCall(snap, spawn, []).state)) c.deadEnd++;
  }
}
const rate = (levels, k) => {
  const n = levels.reduce((a, L) => a + (per[L] ? per[L].n : 0), 0);
  const f = levels.reduce((a, L) => a + (per[L] ? per[L][k] : 0), 0);
  return `${f}/${n} = ${n ? ((100 * f) / n).toFixed(1) : "-"}%`;
};
for (const L of Object.keys(per).map(Number).sort((a, b) => a - b)) {
  const c = per[L];
  console.log(`L${L}: grounded=${c.n} gemFromObjective=${c.objFrom} gemFromMove=${c.moveFrom} deadEnd=${c.deadEnd}`);
}
for (const [label, k] of [["gem-floor, objective prompt", "objFrom"], ["gem-floor, move prompt", "moveFrom"], ["dead-end ascent", "deadEnd"]]) {
  console.log(`${label.padEnd(28)} clearing ${CLEARING.join(",")}: ${rate(CLEARING, k).padEnd(18)} failing ${FAILING.join(",")}: ${rate(FAILING, k)}`);
}
