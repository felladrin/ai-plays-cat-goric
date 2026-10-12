#!/usr/bin/env node
// Offline regression census for the route hint in decision.patched_route.cjs.
//
// Why this exists instead of re-running the nine solid levels: a live level takes
// minutes of wall clock and its outcome is a coin flip on two of them. This is a
// pure text diff, so it covers every decision of every recorded run in seconds.
//
// The comparison has three gates, and a record must clear all of them to count:
//
//   1. FAITHFUL  -- my baseline rebuild of buildObjectiveCall, as a SORTED LINE
//      MULTISET, equals the prompt the run actually used (the dump's
//      objectiveState). The sort is required, not cosmetic: the objective menu is
//      shuffled by a seeded RNG, so 132 of 134 L11 records differ from a rebuild
//      only in entry order. A record that fails this gate is not a regression
//      signal either way -- it means my snap does not match the run's (unlogged
//      gem positions, non-empty death history), and it is reported as SKIPPED
//      rather than counted as a pass.
//
//   2. gemsCollected == 0. The dumps do not log gemPositions, so for any record
//      after a pickup I cannot reconstruct which gems are still on the board, and
//      the buildObjectiveCall signature demands them. Parsed from the run's own
//      text ("Gems collected: N.") so the skip is visible, not assumed.
//
//   3. ORDER-INSENSITIVE diff -- base vs patched. Any multiset difference is the
//      hint firing. Counted per level, and split by whether the cat was standing
//      on a platform, because routeHint() returns "" off-platform by design and a
//      0% off-platform fire rate is the gate working, not a failure.

const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..", "..");
// CENSUS_BASE exists because an A/B between two PATCHED arms is the common case once
// changes are staged: the baseline for the crit change is the gate-only arm, not
// decision.cjs. CENSUS_PATCH is the arm under test.
const BASE = require(process.env.CENSUS_BASE || path.join(REPO, "driver", "decision.cjs"));
const PATCH = require(process.env.CENSUS_PATCH || path.join(REPO, "driver", "decision.patched_route.cjs"));
// The classifier scores the CRITERIA, not the state (jev.cjs:262-263 turns
// q.criteria[n] into each option description). A state-text-only diff therefore
// reports ZERO for a change that lives entirely in the criteria, which is a false
// pass. Both are compared, order-insensitively, and reported separately.
const critLines = (call) => Object.entries(call.questions.objective.criteria)
  .map(([n, c]) => n + ": " + c).sort().join("\n");

const DUMPS = process.argv.slice(2);
if (!DUMPS.length) {
  console.error("usage: census_route_hint.cjs <prompt_dump_L*.jsonl> [...]");
  process.exit(2);
}

function loadGemTable() {
  const p = path.join(REPO, "src", "scripts", "constants", "config.ts");
  const src = fs.readFileSync(p, "utf8");
  const at = src.indexOf("gemsPositionsPerLevel");
  if (at < 0) throw new Error("gemsPositionsPerLevel not found in " + p);
  const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2;
  let depth = 0, i = st;
  for (; i < seg.length; i++) {
    if (seg[i] === "[") depth++;
    else if (seg[i] === "]") { depth--; if (!depth) break; }
  }
  return eval(seg.slice(st, i + 1));
}
const GEMS = loadGemTable();

const linesOf = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean).sort().join("\n");

const levelOf = (file) => {
  const m = /prompt_dump_L(\d+)_/.exec(path.basename(file));
  if (!m) throw new Error("cannot read the level out of " + file);
  return Number(m[1]);
};
const collectedOf = (objectiveState) => {
  const m = /Gems collected: (\d+)\./.exec(objectiveState);
  return m ? Number(m[1]) : null;
};

const totals = {};
for (const file of DUMPS) {
  const level = levelOf(file);
  const recs = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const t = totals[level] = totals[level] || {
    level, records: recs.length, gemsAfterPickup: 0, notFaithful: 0,
    faithful: 0, onPlatform: 0, firedOnPlatform: 0, firedAirborne: 0, airborne: 0,
    stateFired: 0, critFired: 0, critNames: {},
  };
  for (const r of recs) {
    if (collectedOf(r.objectiveState) !== 0) { t.gemsAfterPickup++; continue; }
    const snap = {
      level,
      gemsCollected: 0,
      aliveGems: GEMS[level].length,
      gemPositions: GEMS[level],
      moving: false,
      onPlatform: r.onPlatform,
      cat: { x: r.cat.x, y: r.cat.y, dx: 0, dy: r.cat.dy, height: r.cat.h },
      drones: r.drones,
    };
    const b = linesOf(BASE.buildObjectiveCall(snap, GEMS[level], []).state);
    if (b !== linesOf(r.objectiveState)) { t.notFaithful++; continue; }
    t.faithful++;
    const pc = PATCH.buildObjectiveCall(snap, GEMS[level], []);
    const p = linesOf(pc.state);
    const stateFired = b !== p;
    const critFired = critLines(BASE.buildObjectiveCall(snap, GEMS[level], [])) !== critLines(pc);
    if (critFired) {
      const bc = BASE.buildObjectiveCall(snap, GEMS[level], []).questions.objective.criteria;
      for (const n of Object.keys(pc.questions.objective.criteria)) {
        if (bc[n] !== pc.questions.objective.criteria[n]) t.critNames[n] = (t.critNames[n] || 0) + 1;
      }
    }
    if (stateFired) t.stateFired++;
    if (critFired) t.critFired++;
    const fired = stateFired || critFired;
    if (r.onPlatform) { t.onPlatform++; if (fired) t.firedOnPlatform++; }
    else { t.airborne++; if (fired) t.firedAirborne++; }
  }
}

const rows = Object.values(totals).sort((a, b) => a.level - b.level);
let F = 0, R = 0, A = 0;
console.log("lvl  records  gems>0  notFaithful  faithful  onPlat  fired  rate   | airborne fired");
for (const t of rows) {
  F += t.firedOnPlatform; R += t.onPlatform; A += t.firedAirborne;
  const rate = t.onPlatform ? (100 * t.firedOnPlatform / t.onPlatform).toFixed(1) + "%" : "-";
  console.log(
    String(t.level).padStart(3),
    String(t.records).padStart(8),
    String(t.gemsAfterPickup).padStart(7),
    String(t.notFaithful).padStart(11),
    String(t.faithful).padStart(9),
    String(t.onPlatform).padStart(7),
    String(t.firedOnPlatform).padStart(6),
    rate.padStart(7),
    "  |", String(t.airborne).padStart(8), String(t.firedAirborne).padStart(5),
  );
}
console.log("---");
console.log("on-platform decisions where anything fires:", F, "of", R, "=",
  R ? (100 * F / R).toFixed(1) + "%" : "n/a");
console.log("airborne decisions where anything fires:", A);
console.log("");
console.log("split -- a state-only diff is a FALSE PASS for a criteria change:");
console.log("lvl   stateText  criteria  both");
for (const t of rows) console.log(String(t.level).padStart(3), String(t.stateFired).padStart(10), String(t.critFired).padStart(10), String(t.firedOnPlatform).padStart(6));
console.log("");
console.log("which criteria entries moved, and how often:");
const allNames = {};
for (const t of rows) for (const [n, c] of Object.entries(t.critNames)) allNames[n] = (allNames[n] || 0) + c;
const names = Object.entries(allNames).sort((a, b) => b[1] - a[1]);
if (!names.length) console.log("  (none)");
for (const [n, c] of names) console.log("  " + n.padEnd(14), c);
const nonAscent = names.filter(([n]) => !n.startsWith("ascent_"));
console.log(nonAscent.length
  ? "  !! NON-ASCENT CRITERIA MOVED: " + nonAscent.map(([n]) => n).join(", ")
  : "  no non-ascent criteria moved");
