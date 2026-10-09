#!/usr/bin/env node
// The per-gem collectibility table the crit's "collectible from that floor" sentence
// depends on. It is a DIAGNOSTIC: it recomputes, from reachability.cjs and the gem spawn
// table, the two facts ascentCost needs and that cannot be read out of the module --
// which runs can collect a given gem at all, and how many upward hops each gem is from a
// given floor. collectRuns and goalDistance are closures inside buildObjectiveCall, so
// this reproduces them rather than calling them. Everything it prints is therefore an
// INDEPENDENT check of the sentence, not the sentence.
//
// Usage: node driver/experiments/collect_table.cjs [level]
"use strict";
const fs = require("fs");
const path = require("path");
const REACH = require(path.join(__dirname, "..", "reachability.cjs"));

const LEVEL = Number(process.argv[2] || 11);
const CAT_HEIGHT = 18;
// 16x16 gem sprite on anchor {x:0.5,y:0.5} (getGemAnimations frameWidth/frameHeight 16,
// resetGems anchor 0.5/0.5) -- matches GEM_HALF_HEIGHT in the decision variants.
const GEM_HALF = 8;

const gemPositions = () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"), "utf8");
  const start = src.indexOf("gemsPositionsPerLevel");
  const body = src.slice(start, src.indexOf("\n];", start));
  const levels = [];
  for (const m of body.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)) {
    const pair = [Number(m[1]), Number(m[2])];
    if (!levels.length || (levels.at(-1).length && levels.at(-1).length % 3 === 0)) levels.push([]);
    levels.at(-1).push(pair);
  }
  return levels;
};
const spawn = gemPositions()[LEVEL];
if (!spawn) throw new Error(`no gem spawn table for level ${LEVEL}`);
const gems = spawn.map(([x, y], i) => ({ name: `gem_${"abc"[i]}`, x, y }));

const runs = REACH.runsOf(LEVEL);
const keyOf = (r) => REACH.runKey(r);
const yOf = new Map(runs.map((r) => [keyOf(r), r.y]));
const label = (k) => `y ${yOf.get(k)} (x ${runs.find((r) => keyOf(r) === k).left}..${runs.find((r) => keyOf(r) === k).right})`;

const gemBox = (gx, gy) => ({ left: gx - GEM_HALF, right: gx + GEM_HALF, top: gy - GEM_HALF, bot: gy + GEM_HALF });

// collectRuns, as implemented in the decision variants: one jump from any x on a run
// overlapping the gem's box. Returns the run keys plus, for auditing, the x windows.
const collectRuns = (gx, gy) => {
  const box = gemBox(gx, gy);
  const hits = new Map();
  for (const r of runs) {
    const xs = [];
    for (let x = Math.round(r.left); x <= Math.round(r.right); x++) {
      if (REACH.landingsFrom(LEVEL, runs, x, r.y, true, CAT_HEIGHT, { box, boxKey: "T" }).has("T")) xs.push(x);
    }
    if (xs.length) hits.set(keyOf(r), [xs[0], xs.at(-1), xs.length]);
  }
  return hits;
};

// goalDistance(keys, upOnly) for ONE goal set, verbatim in behaviour: seed every goal
// key at 0, BFS backwards over edges whose target is MORE THAN 20px higher.
const goalDistance = (goalKeys) => {
  const g4 = REACH.graph(LEVEL, CAT_HEIGHT);
  const ys = new Map(g4.runs.map((r) => [keyOf(r), r.y]));
  const back = new Map();
  for (const [k, v] of Object.entries(g4.edges)) for (const t of v) {
    if (!(ys.get(t) < ys.get(k) - 20)) continue;
    if (!back.has(t)) back.set(t, []);
    back.get(t).push(k);
  }
  const d = new Map([...goalKeys].map((k) => [k, 0]));
  let frontier = [...goalKeys];
  while (frontier.length) {
    const next = [];
    for (const k of frontier) for (const p of back.get(k) || []) {
      if (d.has(p)) continue;
      d.set(p, d.get(k) + 1);
      next.push(p);
    }
    frontier = next;
  }
  return d;
};

console.log(`LEVEL ${LEVEL}   catHeight ${CAT_HEIGHT}   gem half-extent ${GEM_HALF}`);
console.log(`runs (${runs.length}):`);
for (const r of runs) console.log(`  ${keyOf(r)}  ${label(keyOf(r))}`);

const perGem = new Map();
console.log(`\nCOLLECTIBLE FROM -- one jump from any x on the run, gem box overlap only:`);
for (const g of gems) {
  const hits = collectRuns(g.x, g.y);
  perGem.set(g.name, hits);
  console.log(`  ${g.name} at (${g.x},${g.y})  ->  ${hits.size ? "" : "NOT COLLECTIBLE FROM ANY RUN"}`);
  for (const [k, [lo, hi, n]] of hits) console.log(`      ${label(k)}   x ${lo}..${hi} (${n} x values)`);
}

// Upward graph, so the reader can see why a hop count is what it is.
const g4 = REACH.graph(LEVEL, CAT_HEIGHT);
const ys = new Map(g4.runs.map((r) => [keyOf(r), r.y]));
console.log(`\nUPWARD EDGES ONLY (target more than 20px higher), per run:`);
for (const [k, v] of Object.entries(g4.edges)) {
  const up = v.filter((t) => ys.get(t) < ys.get(k) - 20).sort((a, b) => ys.get(a) - ys.get(b));
  console.log(`  ${label(k)}  ->  ${up.length ? up.map(label).join("   |   ") : "(NONE: dead end)"}`);
}

const union = new Set();
for (const hits of perGem.values()) for (const k of hits.keys()) union.add(k);
const dUnion = goalDistance(union);
console.log(`\nHOPS PER RUN -- per gem (the fix) next to the union (the bug):`);
console.log(`  destination                       ` + gems.map((g) => g.name.padEnd(11)).join(" ") + "union");
for (const r of runs) {
  const k = keyOf(r);
  const cells = gems.map((g) => {
    // new Set, not .keys(): goalDistance spreads its argument twice, and a Map keys
    // ITERATOR is one-shot, so the second spread would be empty. The module's own
    // goalDistance always receives a Set, so it never hit this; a diagnostic that
    // reimplements it must.
    const d = goalDistance(new Set(perGem.get(g.name).keys()));
    const h = d.get(k);
    return (h === undefined ? "unreachable" : String(h)).padEnd(11);
  });
  const hu = dUnion.get(k);
  console.log(`  ${label(k).padEnd(33)}` + cells.join(" ") + (hu === undefined ? "unreachable" : String(hu)));
}
console.log(`\nunion goal keys: ${[...union].map(label).join("   |   ") || "(none)"}`);
console.log(`per-gem goal keys:`);
for (const g of gems) console.log(`  ${g.name}: ${[...perGem.get(g.name).keys()].map(label).join("   |   ") || "(none)"}`);
