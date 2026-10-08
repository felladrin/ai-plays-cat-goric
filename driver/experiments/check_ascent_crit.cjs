"use strict";
// Offline check for the ascent-crit change. No endpoint call.
//
// The A/B baseline for this change is the GATE-ONLY arm (decision.patched_ascent.cjs),
// not decision.cjs: the gate change is already in both arms, so the two arms differ by
// the crit text alone and the menu size is equal. That is what makes the order confound
// absent -- verified here, not assumed.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

const src = fs.readFileSync(path.join(ROOT, "cat-goric-game/src/scripts/constants/config.ts"), "utf8");
const at = src.indexOf("gemsPositionsPerLevel");
const seg = src.slice(at);
const st = seg.indexOf("= [") + 2;
let dep = 0, i = st;
for (; i < seg.length; i++) {
  if (seg[i] === "[") dep++;
  else if (seg[i] === "]") { dep--; if (!dep) break; }
}
const GEMS = eval(seg.slice(st, i + 1));

const REACH = require(path.join(ROOT, "driver/reachability.cjs"));
const arch = JSON.parse(fs.readFileSync(path.join(ROOT, "out/runs/PRE_L11_run_level_11_halogen_20260927-054204.json"), "utf8"));
const targets = [173, 249];
const base = require(path.join(ROOT, "driver/decision.patched_ascent.cjs"));
const patched = require(path.join(ROOT, "driver/decision.patched_ascent_crit.cjs"));

let fails = 0;
for (const n of targets) {
  const e = arch.log[n];
  const inset = 0.2 * e.movingFrames;
  const snap = {
    level: 11, gemsCollected: e.gemsCollected, aliveGems: e.gemPositions.length,
    gemPositions: e.gemPositions, moving: false, onPlatform: e.onPlatform,
    cat: { x: e.cat.x, y: e.cat.y, dx: 0, dy: e.cat.dy, height: 18 },
    drones: { tl: { x: 0, y: 1 + inset }, tr: { x: 359 - inset, y: 0 }, bl: { x: 1 + inset, y: 310 }, br: { x: 360, y: 310 - inset } },
  };
  const b = base.buildObjectiveCall(snap, GEMS[11], []);
  const p = patched.buildObjectiveCall(snap, GEMS[11], []);
  console.log(`\n===== d${n}  cat ${e.cat.x},${e.cat.y}  mf=${e.movingFrames}  gemsCollected=${e.gemsCollected}  live gems=${e.gemPositions.length} =====`);
  console.log(`  gate-only menu [${b.objectiveNames.join(", ")}]  (${b.objectiveNames.length})`);
  console.log(`  gate+crit menu [${p.objectiveNames.join(", ")}]  (${p.objectiveNames.length})`);
  if (b.objectiveNames.length !== p.objectiveNames.length) { console.log("  !! MENU SIZE CHANGED"); fails++; }
  else console.log("  menu size EQUAL -> order confound absent, no draw-index anchor needed");

  for (const name of p.objectiveNames) {
    if (!name.startsWith("ascent_")) continue;
    const bc = b.questions.objective.criteria[name];
    const pc = p.questions.objective.criteria[name];
    console.log(`\n  [${name}]`);
    console.log(`    gate-only crit: ${bc}`);
    console.log(`    gate+crit crit: ${pc}`);
    if (bc === pc) { console.log("    !! crit UNCHANGED"); fails++; }
    if (!/climb stops|collectible from that floor|floor.* of climbing away/.test(pc)) { console.log("    !! no consequence clause"); fails++; }
    if (/more floors|0 more/.test(pc)) { console.log("    !! still the wrong phrasing"); fails++; }
  }
}

// The fact the crit rests on, stated directly: from each landing floor, what does the
// graph say, over all edges and over upward-only edges? 20px is hop_points.cjs:116's
// own threshold, not a new one.
console.log(`\n===== the fact, per landing floor =====`);
const g4 = REACH.graph(11, 18);
const yOf = new Map(g4.runs.map((r) => [REACH.runKey(r), r.y]));
for (const k of Object.keys(g4.edges)) {
  if (yOf.get(k) !== 231 && yOf.get(k) !== 211 && yOf.get(k) !== 187) continue;
  const v = g4.edges[k];
  const any = v.filter((t) => yOf.get(t) < yOf.get(k));
  const twenty = v.filter((t) => yOf.get(t) < yOf.get(k) - 20);
  console.log(`  ${k}\n    all edges            -> ${v.map((t) => `y ${yOf.get(t)}`).join(", ")}`);
  console.log(`    anything higher (>0) -> ${any.length ? any.map((t) => `y ${yOf.get(t)}`).join(", ") : "(none)"}`);
  console.log(`    >20px higher         -> ${twenty.length ? twenty.map((t) => `y ${yOf.get(t)}`).join(", ") : "(none)"}`);
}

console.log(fails ? `\nFAIL: ${fails} check(s)` : "\nOK: every ascent crit gained a consequence, menu size equal, no wrong phrasing");
process.exit(fails ? 1 : 0);
