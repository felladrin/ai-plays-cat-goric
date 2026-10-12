// Ladder STALL census: per level, deaths BEFORE vs AFTER the first
// STALL->exploration event in the two ladder logs. If exploration precedes most
// deaths, the ladder's exploration path (run_full-only; run_level aborts instead)
// is the ladder's main gap.
//   node research/ladder_stall.cjs
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const LOGS = [
  "out/byom/PurpleMIST-Flash-1.0-FULL/full_s3.log",
  "out/byom/PurpleMIST-Flash-1.0-FULL/rise_s6/full_rise_s6.log",
];
for (const rel of LOGS) {
  const p = path.join(ROOT, rel);
  const t = fs.readFileSync(p, "utf8");
  const ev = [];
  for (const m of t.matchAll(/\[L(\d+) (STALL|DEATH|unwinnable)(?: #\d+)? @ step (\d+)\]/g))
    ev.push({ lvl: +m[1], kind: m[2], step: +m[3] });
  const levels = [...new Set(ev.map((e) => e.lvl))].sort((a, b) => a - b);
  console.log(`\n== ${rel.split("/").pop()} ==`);
  for (const L of levels) {
    const e = ev.filter((x) => x.lvl === L);
    const stalls = e.filter((x) => x.kind === "STALL");
    const deaths = e.filter((x) => x.kind !== "STALL");
    const first = stalls.length ? stalls[0].step : Infinity;
    const before = deaths.filter((x) => x.step < first).length;
    const after = deaths.length - before;
    console.log(`  L${String(L).padStart(2)}: STALL ${String(stalls.length).padStart(2)} deaths ${String(deaths.length).padStart(2)} | before first STALL ${before} | after ${after}`);
  }
}
