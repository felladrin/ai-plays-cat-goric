"use strict";
// waypoint_verdict_audit.cjs — the descent analogue of log_verdict_audit.cjs.
//
// The gem first-pick audit showed DEAD-picks = 0 on the failing levels: the
// model never chose a provably-doomed GEM. The L12/L6 traces instead show the
// model choosing a DESCENT waypoint (descent_right at spawn) and then burning
// the clock. This audit asks, for every grounded decision whose chosen
// objective was a descent: was that descent a DEAD first floor-change?
//
// A descent is DEAD when every gem ordering whose first floor change is that
// side's step-off misses a deadline by more than DEAD_MARGIN — the cat could
// still collect everything afterwards and the level is lost anyway.
//
// Usage: node waypoint_verdict_audit.cjs out/run_level_12_halogen.json [...]

const fs = require("fs");
const path = require("path");
const RC = require("../route_clock.cjs");
const REACH = require("../reachability.cjs");

function loadGems() {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "..", "cat-goric-game", "src", "scripts", "constants", "config.ts"),
    "utf8"
  );
  const m = src.match(/gemsPositionsPerLevel[^=]*=\s*(\[[\s\S]*?\n\]);/);
  return JSON.parse(m[1].replace(/,(\s*[\]\}])/g, "$1"));
}

const nameOf = ["gem_a", "gem_b", "gem_c"];

function audit(file) {
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  const level = run.levelIndex != null ? run.levelIndex : run.targetLevel;
  const gems = loadGems()[level];
  const log = run.log || [];
  let grounded = 0, descentChosen = 0, deadDescent = 0, mixedStates = 0, allDeadStates = 0;
  const examples = [];
  for (const d of log) {
    if (!d.onPlatform) continue;
    const floorKey = REACH.platformKeyUnder(level, d.cat.x, d.cat.y);
    if (!floorKey) continue;
    const alive = [];
    for (let i = 0; i < 3; i++) {
      if ((d.gemPositions || []).some((p) => p.x === gems[i][0] && p.y === gems[i][1])) alive.push(nameOf[i]);
    }
    if (!alive.length) continue;
    grounded++;
    const chosen = d.objective;
    const isDescent = chosen === "descent_left" || chosen === "descent_right";
    if (!isDescent) continue;
    descentChosen++;
    const v = RC.waypointVerdicts(level, gems, alive, floorKey, d.cat.x, d.movingFrames);
    if (v.allDead) { allDeadStates++; continue; }
    if (v.mixed) mixedStates++;
    if (v.verdicts[chosen] === "dead") {
      deadDescent++;
      if (examples.length < 20) {
        examples.push(`  step ${d.step} mf=${d.movingFrames} floor=${floorKey} x=${d.cat.x} chose=${chosen} ` +
          `alive=[${alive}] verdicts=${JSON.stringify(v.verdicts)}`);
      }
    }
  }
  console.log(`\n${file}: level=${level} grounded=${grounded} descentChosen=${descentChosen} ` +
    `mixedStates=${mixedStates} allDeadStates=${allDeadStates} DEAD-descent-picks=${deadDescent}`);
  for (const e of examples) console.log(e);
}

for (const f of process.argv.slice(2)) audit(f);
