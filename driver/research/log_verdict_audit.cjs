"use strict";
// log_verdict_audit.cjs — for every grounded decision in a run archive, ask
// the route clock: was the objective the model chose a DEAD first-pick at that
// state? This is the check that decides whether the temporal annotation
// addresses the actual failure mode or whether the loss is move-level.
//
// Usage: node log_verdict_audit.cjs out/run_level_12_halogen.json [more.json ...]

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
  let grounded = 0, deadPick = 0, mixedStates = 0, allDeadStates = 0;
  const examples = [];
  for (const d of log) {
    if (!d.onPlatform) continue;
    const floorKey = REACH.platformKeyUnder(level, d.cat.x, d.cat.y);
    if (!floorKey) continue;
    // alive gems from the logged positions (live == spawn)
    const alive = [];
    for (let i = 0; i < 3; i++) {
      if ((d.gemPositions || []).some((p) => p.x === gems[i][0] && p.y === gems[i][1])) alive.push(nameOf[i]);
    }
    if (!alive.length) continue;
    grounded++;
    const v = RC.firstPickVerdicts(level, gems, alive, floorKey, d.cat.x, d.movingFrames);
    if (v.allDead) { allDeadStates++; continue; }
    if (v.mixed) mixedStates++;
    const chosen = d.objective;
    if (v.verdicts[chosen] === "dead") {
      deadPick++;
      if (examples.length < 15) {
        examples.push(`  step ${d.step} mf=${d.movingFrames} floor=${floorKey} x=${d.cat.x} chose=${chosen} ` +
          `(doomed=${v.doomed[chosen]}) verdicts=${JSON.stringify(v.verdicts)}`);
      }
    }
  }
  console.log(`\n${file}: level=${level} groundedDecisions=${grounded} mixedStates=${mixedStates} allDeadStates=${allDeadStates} DEAD-picks=${deadPick}`);
  for (const e of examples) console.log(e);
}

for (const f of process.argv.slice(2)) audit(f);
