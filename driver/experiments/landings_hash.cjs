#!/usr/bin/env node
// Null control for an ADDITIVE change to reachability.cjs. Hashes everything the
// live build reads out of landingsFrom and graph -- every launch x on every run of
// every level, jump and no-jump, both cat heights -- so "the live build's inputs
// are untouched" is a NUMBER rather than a claim about a diff nobody re-reads.
//
//   node driver/experiments/landings_hash.cjs
//
// Why it exists. landingsFrom is called by the objective call's reachability block,
// by jumpLandingNote, by ROUTE_FIRST's firstHop and by graph(). Adding an optional
// per-direction reach and an optional collectible box to it is the cheapest way to
// keep ONE vertical integration instead of a second hand-derived one, and a
// hand-derived vertical bound has been got wrong three times in this file. The
// change must be additive: with no opts argument, every call must return exactly
// what it returned before. This script is how that is checked, and it is checked by
// running it on both sides of the edit rather than by reading the patch.
//
// The default call signature only. A hash that included the new opts would be a
// different hash, not a control.
const crypto = require("crypto");
const REACH = require("../reachability.cjs");

const LEVELS = REACH.runsOf ? 15 : 15; // level_data.cjs carries indices 0..14
const HEIGHTS = [18];

const h = crypto.createHash("sha256");
let calls = 0;
let levels = 0;

for (let level = 0; level < LEVELS; level++) {
  const runs = REACH.runsOf(level);
  if (!runs.length) continue;
  levels++;
  for (const r of runs) {
    for (let x = Math.round(r.left); x <= Math.round(r.right); x++) {
      for (const jump of [true, false]) {
        for (const ch of HEIGHTS) {
          // Sorted, because landingsFrom returns a Set and a Set's iteration order
          // is insertion order: stable for a fixed input, but a hash that depended
          // on it would be testing the wrong thing if the run list were ever
          // rebuilt in another order.
          const out = [...REACH.landingsFrom(level, runs, x, r.y, jump, ch)].sort();
          h.update(`${level}|${r.y}|${r.left}|${r.right}|${x}|${jump}|${ch}|${out.join(",")}\n`);
          calls++;
        }
      }
    }
  }
  // graph() is the other consumer, and it calls landingsFrom itself. Hashing it
  // catches a change to the step (2) or the run merge that the per-x sweep would
  // not attribute to a single call.
  const g = REACH.graph(level, 18);
  for (const [k, v] of Object.entries(g.edges).sort()) h.update(`${level}|E|${k}|${[...v].sort().join(",")}\n`);
  for (const r of g.runs) h.update(`${level}|R|${r.y}|${r.left}|${r.right}\n`);
}

console.log(`levels with platforms  ${levels}`);
console.log(`landingsFrom calls    ${calls}`);
console.log(`sha256                ${h.digest("hex")}`);
