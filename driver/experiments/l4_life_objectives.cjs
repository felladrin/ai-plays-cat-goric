#!/usr/bin/env node
// Per-life gem pickups and objective sequence for Flash L4 archives.
// Lives split at deathLog steps; the decision AT a death step belongs to the
// life that died (the entry is written at the reset, post-reset state follows).
// Usage: node l4_life_objectives.cjs <archive.json> [...]
const fs = require("fs");

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const log = d.log || [];
  const deathSteps = (d.deathLog || []).map((x) => x.step).sort((a, b) => a - b);
  console.log(`\n=== ${file} (cleared=${!!(d.sawAdvance || d.won)}, ${log.length} decisions, ${deathSteps.length} deaths) ===`);
  let life = [];
  const lives = [];
  let di = 0;
  for (const e of log) {
    // The deathLog entry is written at the reset step and its state is
    // post-reset: the decision AT that step belongs to the NEXT life.
    while (di < deathSteps.length && deathSteps[di] <= e.step) { lives.push(life); life = []; di++; }
    life.push(e);
  }
  if (life.length) lives.push(life);
  lives.forEach((l, i) => {
    if (!l.length) { console.log(`life ${i + 1}: 0 decisions (died instantly)`); return; }
    // Pickups: gemsCollected rises; name the gem that vanished from gemPositions.
    const names = ["gem_a", "gem_b", "gem_c"];
    const spawns = { 4: [[289, 156], [105, 164], [182, 226]] }[d.levelIndex];
    const pickups = [];
    let prev = null;
    for (const e of l) {
      if (prev && e.gemsCollected > prev.gemsCollected) {
        const gone = (prev.gemPositions || []).filter((p) => !(e.gemPositions || []).some((q) => Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2));
        const nm = gone.map((p) => { const k = spawns.findIndex((s) => Math.abs(s[0] - p.x) < 3 && Math.abs(s[1] - p.y) < 3); return k >= 0 ? names[k] : "?"; });
        pickups.push(`${nm.join("+")}@${e.step}(${e.cat.x},${e.cat.y})`);
      }
      prev = e;
    }
    // Objective sequence with run-lengths.
    const seq = [];
    for (const e of l) {
      const last = seq[seq.length - 1];
      if (last && last[0] === e.objective) last[1]++;
      else seq.push([e.objective, 1]);
    }
    const first = l[0], last = l[l.length - 1];
    console.log(`life ${i + 1}: ${l.length} dec, mf ${first.movingFrames}->${last.movingFrames}, gc ${first.gemsCollected}->${last.gemsCollected}, start (${first.cat.x},${first.cat.y})${first.onPlatform ? "" : " air"} end (${last.cat.x},${last.cat.y})${last.onPlatform ? "" : " air"}`);
    console.log(`  pickups: ${pickups.length ? pickups.join(" ") : "none"}`);
    console.log(`  objectives: ${seq.map(([o, n]) => (n > 1 ? `${o}x${n}` : o)).join(" ")}`);
  });
}
