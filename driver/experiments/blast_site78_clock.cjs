#!/usr/bin/env node
// Blast radius of fixing sites 7 and 8: walkOffFatalNote's walk check and jump
// escape check (decision.cjs, both marked "SIMULATE_CLOCK_AUDIT: constant 0
// (LATENT-DEFECT)") evaluate the walk-off and the jump escape against the most
// favourable laser state that ever existed. The census shows the walk check is
// false-safe in 74/230 geometries and the jump escape in 10/107 conditioned
// states; this measures what passing the real movingFrames instead does to the
// PROMPTS: how many decision prompts change at all, how many change in the
// walk-off note line, and how many change in menu entry COUNT (the
// seeded-shuffle RNG-desync hazard documented in docs/open-problems.md —
// any comparison here is order-insensitive: sorted state lines, sorted menu).
//
// The shipped decision.cjs is never modified: the variant is compiled in-memory
// from the same source with the two call-sites swapped, under the same filename
// so its relative requires resolve.
//
// Run: node driver/experiments/blast_site6_clock.cjs
// Deterministic: no endpoint, no browser, no RNG-sensitive comparison.

"use strict";

const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");

const { runsOf } = require("../reachability.cjs");

const CAT_H = 18;
const SP = 0.2; // laser speed per moving frame (route_clock)
const MF_GRID = [0, 100, 200, 300, 400, 500];
const X_STEP = 4;

function loadGems() {
  const configPath = path.join(__dirname, "../../cat-goric-game/src/scripts/constants/config.ts");
  const src = fs.readFileSync(configPath, "utf8");
  const m = src.match(/gemsPositionsPerLevel[^=]*=\s*(\[[\s\S]*?\n\]);/);
  if (!m) throw new Error("could not extract gemsPositionsPerLevel from config.ts");
  return JSON.parse(m[1].replace(/,(\s*[\]\}])/g, "$1"));
}
const GEMS = loadGems();
// Same ladder as the census (PLAYABLE_LEVELS): levels 0-13. config.ts carries a
// 15th gem row for the victory screen; it has no playable floors.
const LEVEL_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const DECISION_PATH = path.join(__dirname, "../decision.cjs");
const SRC = fs.readFileSync(DECISION_PATH, "utf8");

// The exact site-7 and site-8 lines, pinned by test_simulate_clock.cjs's audit table.
const SITE7 = 'simulate(snap.level, endX, run.y, 0, snap.cat.height, dir, 0, { grounded: true }); // SIMULATE_CLOCK_AUDIT: constant 0 (LATENT-DEFECT)';
const SITE7_FIX = 'simulate(snap.level, endX, run.y, 0, snap.cat.height, dir, mfNow, { grounded: true });';
const SITE8 = 'simulate(snap.level, endX, run.y, 0, snap.cat.height, `jump_${dir}`, 0, { grounded: true }); // SIMULATE_CLOCK_AUDIT: constant 0 (LATENT-DEFECT)';
const SITE8_FIX = 'simulate(snap.level, endX, run.y, 0, snap.cat.height, `jump_${dir}`, mfNow, { grounded: true });';
assert.strictEqual(SRC.split(SITE7).length - 1, 1, "site-7 call site must appear exactly once in decision.cjs");
assert.strictEqual(SRC.split(SITE8).length - 1, 1, "site-8 call site must appear exactly once in decision.cjs");
// walkOffFatalNote needs mfNow in scope: inject it right after the function's first line.
const FN_HEAD = "function walkOffFatalNote(snap, target) {\n  if (!snap.onPlatform || !target) return null;";
const FN_FIX = FN_HEAD + "\n  const mfNow = require(\"./route_clock.cjs\").movingFramesOf(snap);";
assert.strictEqual(SRC.split(FN_HEAD).length - 1, 1, "walkOffFatalNote head must appear exactly once");

function loadVariant(src) {
  const m = new Module(DECISION_PATH, null);
  m.filename = DECISION_PATH;
  m.paths = Module._nodeModulePaths(path.dirname(DECISION_PATH));
  m._compile(src, DECISION_PATH);
  return m.exports;
}

const BASE = require("../decision.cjs");
const FIXED = loadVariant(SRC.replace(FN_HEAD, FN_FIX).replace(SITE7, SITE7_FIX).replace(SITE8, SITE8_FIX));

function snapAt(level, x, y, mf, gemPositions) {
  return {
    level,
    cat: { x, y, dy: 0, height: CAT_H },
    onPlatform: true,
    drones: { tl: { x: 1, y: 1 + SP * mf }, tr: { x: 359, y: 1 }, bl: { x: 1, y: 310 }, br: { x: 359, y: 310 } },
    gemsCollected: 0,
    aliveGems: gemPositions.length,
    gemPositions,
  };
}

// Order-insensitive canon per docs/open-problems.md: sorted state lines + sorted menu entries.
// questions.move.criteria is a plain { action: label } object.
function criteriaOf(call) {
  const q = call.questions && call.questions.move;
  const c = (q && q.criteria) || {};
  return Object.entries(c).map(([k, v]) => `${k}=${v}`).sort();
}
function canon(call) {
  return JSON.stringify({
    state: call.state.split("\n").sort(),
    criteria: criteriaOf(call),
  });
}

const NOTE_MARK = "Walking off the";
const WINDOW_MARK = "A jump from x "; // site-6 outputs must NOT shift here

// Which site-6 outputs changed: the note line itself, and the gap-crossing
// sentence at decision.cjs:1344, which reads jumpLandingNote._window — the
// launch window site 6 computes — through a same-snap side channel.
function changedKinds(a, b) {
  const la = a.state.split("\n"), lb = b.state.split("\n");
  const kinds = { note: false, window: false, other: false };
  const noteA = la.find((s) => s.startsWith(NOTE_MARK)) || null;
  const noteB = lb.find((s) => s.startsWith(NOTE_MARK)) || null;
  if (noteA !== noteB) kinds.note = true;
  const winA = la.filter((s) => s.includes(WINDOW_MARK)).join("|");
  const winB = lb.filter((s) => s.includes(WINDOW_MARK)).join("|");
  if (winA !== winB) kinds.window = true;
  // "other": canon differed but neither site-6 output line explains it.
  if (!kinds.note && !kinds.window) kinds.other = true;
  return kinds;
}

const rows = [];
let T = { states: 0, changed: 0, note: 0, window: 0, other: 0, menu: 0, skipped: 0 };

for (const level of LEVEL_IDS) {
  const levelGems = GEMS[level];
  const gemNames = levelGems.map((_, i) => `gem_${String.fromCharCode(97 + i)}`);
  const gemPositions = levelGems.map(([x, y]) => ({ x, y }));
  const runs = runsOf(level);
  const r = { level, states: 0, changed: 0, note: 0, window: 0, other: 0, menu: 0, skipped: 0 };

  for (const run of runs) {
    for (let x = Math.ceil(run.left); x <= run.right; x += X_STEP) {
      for (const mf of MF_GRID) {
        for (const obj of gemNames) {
          const snap = snapAt(level, x, run.y, mf, gemPositions);
          let a, b;
          try {
            a = BASE.buildMoveCall(snap, levelGems, obj, []);
            b = FIXED.buildMoveCall(snap, levelGems, obj, []);
          } catch (e) {
            r.skipped++;
            continue;
          }
          r.states++;
          if (canon(a) !== canon(b)) {
            r.changed++;
            const k = changedKinds(a, b);
            if (k.note) r.note++;
            if (k.window) r.window++;
            if (k.other) r.other++;
            if (criteriaOf(a).length !== criteriaOf(b).length) r.menu++;
          }
        }
      }
    }
  }
  rows.push(r);
  for (const k of ["states", "changed", "note", "window", "other", "menu", "skipped"]) T[k] += r[k];
}

console.log("Blast radius: sites 7+8 constant mf=0 -> real movingFrames (buildMoveCall prompts)");
console.log(`grid: catX step ${X_STEP}px on every floor, mf in [${MF_GRID.join(",")}], objective = each live gem, all gems alive`);
console.log("comparison: order-insensitive canon (sorted state lines + sorted menu), per docs/open-problems.md");
console.log("note = walkOffFatalNote line changed; window = other simulate-derived notes shifted (should be 0 — sites 7/8 write only their own line); menu = entry-count change (RNG-desync hazard)\n");
console.log("level  states  changed  note  window  other  menu  skipped");
for (const r of rows) {
  console.log(`  ${String(r.level).padEnd(5)} ${String(r.states).padEnd(6)} ${String(r.changed).padEnd(7)} ${String(r.note).padEnd(5)} ${String(r.window).padEnd(7)} ${String(r.other).padEnd(6)} ${String(r.menu).padEnd(5)} ${r.skipped}`);
}
console.log(`  ALL   ${String(T.states).padEnd(6)} ${String(T.changed).padEnd(7)} ${String(T.note).padEnd(5)} ${String(T.window).padEnd(7)} ${String(T.other).padEnd(6)} ${String(T.menu).padEnd(5)} ${T.skipped}`);
const pct = T.states ? ((100 * T.changed) / T.states).toFixed(1) : "n/a";
console.log(`\nBottom line: ${T.changed}/${T.states} synthetic decision prompts change (${pct}%); ${T.note} via the note line, ${T.window} via the _window sentence, ${T.other} unexplained; ${T.menu} change menu entry count.`);
