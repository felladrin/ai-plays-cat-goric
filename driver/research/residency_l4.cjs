// Where do Flash's L4 decisions get SPENT, per platform, against Clef's clear?
// Residency census: bucket every decision by the platform key under the cat
// (or "airborne"), and tally the objective and move chosen on each.
// Deaths are not in the archive log; residency is per archive.
//   node research/residency_l4.cjs
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const ARCHIVES = [
  ["Flash s1", "out/byom/PurpleMIST-Flash-1.0/s1/run_level_4_systemone.json"],
  ["Flash s2", "out/byom/PurpleMIST-Flash-1.0/s2/run_level_4_systemone.json"],
  ["Flash s3", "out/byom/PurpleMIST-Flash-1.0/s3/run_level_4_systemone.json"],
  ["Flash s4", "out/byom/PurpleMIST-Flash-1.0/s4/run_level_4_systemone.json"],
  ["Clef base", "out/clef_baseline/run_level_4_clef.json"],
];

for (const [label, rel] of ARCHIVES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log(`${label}: missing`); continue; }
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const cleared = !!(d.sawAdvance || d.won);
  const by = {}; // platformKey -> {n, obj:{}, move:{}, mfSum}
  for (const e of d.log) {
    const k = e.onPlatform ? REACH.platformKeyUnder(4, e.cat.x, e.cat.y) : "airborne";
    const key = k || "noFloor";
    if (!by[key]) by[key] = { n: 0, obj: {}, move: {}, mfSum: 0 };
    const b = by[key];
    b.n++;
    b.obj[e.objective] = (b.obj[e.objective] || 0) + 1;
    b.move[e.move] = (b.move[e.move] || 0) + 1;
    b.mfSum += e.movingFrames || 0;
  }
  const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n);
  const top = rows.filter(([, b]) => b.n >= Math.max(3, d.log.length * 0.02));
  console.log(`\n== ${label} (cleared=${cleared}, ${d.log.length} decisions) ==`);
  for (const [k, b] of top) {
    const obj = Object.entries(b.obj).sort((a, z) => z[1] - a[1]).map(([o, n]) => `${o}:${n}`).join(" ");
    const mv = Object.entries(b.move).sort((a, z) => z[1] - a[1]).map(([m, n]) => `${m}:${n}`).join(" ");
    console.log(`${String(b.n).padStart(4)} (${(100 * b.n / d.log.length).toFixed(0)}%) mf~${Math.round(b.mfSum / b.n)} ${k.padEnd(22)} obj[${obj}]  move[${mv}]`);
  }
  const rest = rows.filter(([, b]) => b.n < Math.max(3, d.log.length * 0.02));
  if (rest.length) console.log(`  (+${rest.length} more platforms under threshold, ${rest.reduce((a, [, b]) => a + b.n, 0)} decisions)`);
}
