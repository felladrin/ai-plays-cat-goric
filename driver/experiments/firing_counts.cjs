#!/usr/bin/env node
// Firing counts per level, read from a prompt dump. The PRIMARY field in a
// regression sweep: a clause that never fires cannot have changed a prompt, so
// its level needs no baseline and no number comparison at all. That is a
// stronger result than a number that happens to match.
//
//   node driver/experiments/firing_counts.cjs /tmp/prompt_dump_L5_*.jsonl
//
// SCHEDULE FROM THIS NUMBER, BEFORE SPENDING THE WALL-CLOCK. A level that fires
// zero instances of the change under test is not evidence and must not be
// queued: its prompts are identical to the pre-change build by construction, so
// the run can only produce a number that cannot distinguish the change from
// doing nothing. L3 was queued for a re-run anyway, on a firing count of 0/0
// already in hand, and cost twenty minutes to confirm a fact of arithmetic. Run
// the counter on an existing dump FIRST and decline the run when it reads zero.
// The one exception: a zero on an OLD build's dump says nothing about a clause
// added since, so check sites that are a static property of the level (gem sites
// for the floor clause) and run the level when the newer clause has no verdict.
//
// Counts, per decision, by scanning the WHOLE record, because the two sentences
// land in DIFFERENT prompt fields and reading only one silently reports zero:
//   descent  "Of the two, only stepping off the LEFT/RIGHT end lands on a floor"
//            -> emitted into objectiveState (decision.cjs:1194, showDrop block)
//   floor    "The objective gem_x is on THIS floor, Npx along it"
//            -> emitted into moveState (decision.cjs:1256)
//
// This was read from objectiveState alone and reported 0 floor firings on every
// level, and three levels were briefly called "provably unaffected" on that
// reading. The count is the PRIMARY field in this sweep, so a field-blind
// counter is worse than none: it does not fail, it answers wrongly. Hence: scan
// everything, and report which field each sentence came from so a move cannot
// hide again.
//
// Counts DISTINCT states separately from raw firings, because the number that
// predicts damage is not how many times a sentence appeared but how many
// distinct (x,y,objective) states it appeared at. A sentence repeated 20 times
// at one state is one prompt change, not twenty.

const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("usage: firing_counts.cjs <prompt_dump.jsonl>");
  process.exit(1);
}
const recs = fs
  .readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse);

const FLOOR = /The objective (\S+) is on THIS floor/;
const DESCENT = /Of the two, only stepping off the (LEFT|RIGHT) end lands on a floor carrying (\S+?)[.]/;

// Scan EVERY field, and record which one matched. A record is a decision's two
// prompts, so the sentence can be in either; matching on a named field is what
// produced the wrong zero.
const find = (r, re) => {
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== "string") continue;
    const m = re.exec(v);
    if (m) return { m, field: k };
  }
  return null;
};

let floor = 0;
let descent = 0;
const floorStates = new Set();
const descentStates = new Set();
const fields = new Set();
const objectives = new Map();
let peakGems = 0;

recs.forEach((r) => {
  const p = r.objectiveState || "";
  const f = find(r, FLOOR);
  if (f) {
    floor++;
    floorStates.add(`${r.cat.x},${r.cat.y},${f.m[1]}`);
    fields.add(`floor=${f.field}`);
  }
  const d = find(r, DESCENT);
  if (d) {
    descent++;
    descentStates.add(`${r.cat.x},${r.cat.y},${d.m[2]},${d.m[1]}`);
    fields.add(`descent=${d.field}`);
  }
  const o = r.objective;
  if (o) objectives.set(o, (objectives.get(o) || 0) + 1);
  const g = /Gems collected: (\d+)/.exec(p);
  if (g) peakGems = Math.max(peakGems, +g[1]);
});

console.log(`  file        ${file.split("/").pop()}`);
console.log(`  decisions   ${recs.length}`);
console.log(`  FLOOR       ${floor} firings, ${floorStates.size} distinct states`);
console.log(`  DESCENT     ${descent} firings, ${descentStates.size} distinct states`);
console.log(
  `  VERDICT     ${
    floor + descent === 0
      ? "PROVABLY UNAFFECTED - prompts byte-identical by construction, no baseline needed"
      : "EXERCISED - numbers must be compared against a same-build baseline"
  }`
);
console.log(`  peak gems   ${peakGems}/3 (from prompt text, survives gem-wipe resets)`);
if (floorStates.size)
  console.log(`    floor states:   ${[...floorStates].join("  ")}`);
if (descentStates.size)
  console.log(`    descent states: ${[...descentStates].join("  ")}`);
const objs = [...objectives.entries()].sort((a, b) => b[1] - a[1]);
console.log(
  `  objectives  ${objs.map(([k, v]) => `${k} ${v}`).join("  ")}`
);

