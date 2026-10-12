// General residency census: where do a model's decisions get SPENT on a level,
// per platform, and which gems were held/burned? Paired against a clearing
// archive of the same level when one exists.
//   node research/residency.cjs <level> <archive...>
// Deaths/gem-burns are not in the archive log; the burn check reads the run log
// (same basename .log next to the json, if present) for 'unwinnable' resets.
const fs = require("fs");
const path = require("path");
const REACH = require("../reachability.cjs");

const LEVEL = +process.argv[2];
const ARCHIVES = process.argv.slice(3);
if (!LEVEL || !ARCHIVES.length) { console.log("usage: residency.cjs <level> <archive...>"); process.exit(1); }

for (const rel of ARCHIVES) {
  if (!fs.existsSync(rel)) { console.log(`${rel}: missing`); continue; }
  const d = JSON.parse(fs.readFileSync(rel, "utf8"));
  const cleared = !!(d.sawAdvance || d.won);
  const by = {};
  for (const e of d.log) {
    const k = e.onPlatform ? REACH.platformKeyUnder(LEVEL, e.cat.x, e.cat.y) : "airborne";
    const key = k || "noFloor";
    if (!by[key]) by[key] = { n: 0, obj: {}, move: {}, mfSum: 0, gcMax: 0 };
    const b = by[key];
    b.n++;
    b.obj[e.objective] = (b.obj[e.objective] || 0) + 1;
    b.move[e.move] = (b.move[e.move] || 0) + 1;
    b.mfSum += e.movingFrames || 0;
    b.gcMax = Math.max(b.gcMax, e.gemsCollected);
  }
  const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n);
  const thr = Math.max(3, d.log.length * 0.02);
  console.log(`\n== ${rel} (cleared=${cleared}, ${d.log.length} decisions, peak gems ${Math.max(...d.log.map((e) => e.gemsCollected))}) ==`);
  for (const [k, b] of rows.filter(([, x]) => x.n >= thr)) {
    const obj = Object.entries(b.obj).sort((a, z) => z[1] - a[1]).map(([o, n]) => `${o}:${n}`).join(" ");
    const mv = Object.entries(b.move).sort((a, z) => z[1] - a[1]).map(([m, n]) => `${m}:${n}`).join(" ");
    console.log(`${String(b.n).padStart(4)} (${(100 * b.n / d.log.length).toFixed(0)}%) mf~${Math.round(b.mfSum / b.n)} ${k.padEnd(22)} obj[${obj}]  move[${mv}]`);
  }
  const rest = rows.filter(([, x]) => x.n < thr);
  if (rest.length) console.log(`  (+${rest.length} more platforms under threshold, ${rest.reduce((a, [, b]) => a + b.n, 0)} decisions)`);
  // gem burn: the run log prints 'unwinnable' when the driver resets a dead run
  const runlog = rel.replace(/\.json$/, ".log");
  if (fs.existsSync(runlog)) {
    const t = fs.readFileSync(runlog, "utf8");
    const unw = (t.match(/unwinnable/gi) || []).length;
    const deaths = (t.match(/^deaths: (\d+)/m) || [])[1];
    console.log(`  run log: unwinnable resets=${unw} deaths=${deaths}`);
  }
}
