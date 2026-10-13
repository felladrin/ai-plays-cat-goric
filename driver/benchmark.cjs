// Benchmark a model on the whole ladder: run run_full.cjs once per seed against
// one endpoint and write a compact, comparable result. The ladder itself is
// run_full.cjs, unchanged; this only launches it and reads its run file.
//
//   node benchmark.cjs <endpoint> [seed...]      (from driver/; npm run benchmark -- <endpoint> [seed...])
//
// <endpoint> is any run_full.cjs endpoint: `systemone` (SYSTEMONE_BASE_URL,
// SYSTEMONE_MODEL) or `chat` (CHAT_BASE_URL, CHAT_MODEL) for your own model.
// Seeds default to the leaderboard's fixed set below. Output, under out/benchmark/<endpoint>-<time>/:
// s<seed>/ (the run file, the ladder log, screenshots, video) and benchmark.json.
// See docs/benchmark.md and docs/bring-your-own-model.md.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const CFG = require("./config.cjs");
const { PRESETS, LADDER_CAPS, DEFAULT_PRESET } = require("./preset.cjs");

// Every model on the leaderboard plays the same seeds. 1 to 5 were never used to
// tune the preset (6 and up were), so they do not favour the model it was tuned on.
const DEFAULT_SEEDS = ["1", "2", "3", "4", "5"];

// The benchmark version names what the model reads: the default preset, its ladder
// caps, and the driver code at the commit each result records. A change to any of
// them starts a new version, and every model on the leaderboard plays it again
// (docs/benchmark.md, "Versions"). test_preset.cjs pins the preset of this version.
const VERSION = "v1";
const LEVELS = 14;

// One seed's result from a run_full.cjs run file.
function summarizeRun(run, seed, wallMs) {
  const levels = Object.values(run.levels || {}).sort((a, b) => a.level - b.level);
  const deathsPerLevel = {};
  for (const L of levels) deathsPerLevel[L.level] = L.deaths;
  return {
    seed: Number(seed),
    won: run.won === true,
    lastLevel: run.finalLevel,
    deathsPerLevel,
    totalDeaths: levels.reduce((a, L) => a + L.deaths, 0),
    steps: run.steps,
    classifierCalls: run.totalCalls,
    wallSeconds: Math.round(wallMs / 1000),
    stopped: run.stopped,
    model: run.model,
    endpoint: run.which,
    build: run.build,
  };
}

function seedLine(r) {
  const outcome = r.won ? "won" : `lost on L${r.lastLevel}`;
  return `seed ${r.seed}: ${outcome}, ${r.totalDeaths} deaths, ${r.steps} steps, ${r.classifierCalls} calls, ${r.wallSeconds}s`;
}

function summaryLine(results) {
  const r0 = results[0];
  const wins = results.filter((r) => r.won).length;
  const deaths = results.reduce((a, r) => a + r.totalDeaths, 0);
  const per = results.map((r) => `s${r.seed} ${r.won ? "won" : "L" + r.lastLevel}`).join(", ");
  return `${r0.model} (${r0.endpoint}, preset ${r0.build.PRESET}): won ${wins}/${results.length} seeds [${per}], ${deaths} deaths in total`;
}

// The leaderboard columns over a model's seeds: pass@1 is the share of seeds won,
// pass@5 whether any seed was won, levels cleared counts a win as all 14, and
// deaths is the median total over the won seeds (null when none was won).
function score(results) {
  const won = results.filter((r) => r.won);
  const deaths = won.map((r) => r.totalDeaths).sort((a, b) => a - b);
  const mid = deaths.length >> 1;
  return {
    seeds: results.length,
    wins: won.length,
    pass1: won.length / results.length,
    pass5: won.length > 0,
    levelsCleared: results.reduce((a, r) => a + (r.won ? LEVELS : r.lastLevel), 0) / results.length,
    medianDeaths: deaths.length === 0 ? null : deaths.length % 2 ? deaths[mid] : (deaths[mid - 1] + deaths[mid]) / 2,
  };
}

// Why a benchmark does not count for VERSION: other seeds, a flag or cap that is
// not the default preset's, or driver code that differs from its commit. Empty
// when it counts.
function offVersion(results, seeds, env, dirtyFiles) {
  const why = [];
  if (seeds.join(" ") !== DEFAULT_SEEDS.join(" ")) why.push(`seeds ${seeds.join(" ")}, not ${DEFAULT_SEEDS.join(" ")}`);
  const preset = PRESETS[DEFAULT_PRESET];
  for (const r of results) {
    for (const [k, v] of Object.entries(r.build)) {
      if (k === "SEED" || (k === "ATTRIB" && v === "1") || (k === "PRESET" && v === DEFAULT_PRESET)) continue;
      if (preset[k] !== v) why.push(`seed ${r.seed}: ${k}=${v}`);
    }
    for (const k of Object.keys(preset)) if (r.build[k] !== preset[k]) why.push(`seed ${r.seed}: ${k} is not ${preset[k]}`);
  }
  for (const [k, v] of Object.entries(LADDER_CAPS[DEFAULT_PRESET])) {
    if (env[k] !== undefined && env[k] !== v) why.push(`${k}=${env[k]}`);
  }
  if (dirtyFiles.length) why.push(`uncommitted driver changes: ${dirtyFiles.join(", ")}`);
  return [...new Set(why)];
}

function git(args) {
  const res = spawnSync("git", args, { cwd: __dirname, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr.trim()}`);
  return res.stdout.trim();
}

function main(argv) {
  const [endpoint, ...seedArgs] = argv;
  if (!endpoint) {
    console.error("usage: node benchmark.cjs <endpoint> [seed...]   e.g. node benchmark.cjs systemone 9 11");
    process.exit(2);
  }
  const seeds = seedArgs.length ? seedArgs : DEFAULT_SEEDS;
  for (const s of seeds) if (!/^\d+$/.test(s)) throw new Error(`seed '${s}' is not a whole number`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = path.join(CFG.OUT_DIR, "benchmark", `${endpoint}-${stamp}`);
  const commit = git(["rev-parse", "--short", "HEAD"]);
  const dirtyFiles = git(["status", "--porcelain", "--", "."]).split("\n").filter(Boolean).map((l) => l.slice(3));
  const results = [];
  // Ctrl-C reaches run_full.cjs too, which stops gracefully and writes its run
  // file; stay alive to record that seed, then stop before the next one.
  let stopRequested = false;
  process.on("SIGINT", () => { stopRequested = true; });
  process.on("SIGTERM", () => { stopRequested = true; });
  for (const seed of seeds) {
    if (stopRequested) break;
    const dir = path.join(root, `s${seed}`);
    fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, "ladder.log");
    console.log(`seed ${seed}: running the ladder, log at ${log}`);
    const fd = fs.openSync(log, "w");
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [path.join(__dirname, "run_full.cjs"), endpoint], {
      cwd: __dirname,
      env: Object.assign({}, process.env, { SEED: seed, OUT_DIR: dir }),
      stdio: ["ignore", fd, fd],
    });
    fs.closeSync(fd);
    const wallMs = Date.now() - t0;
    const runFile = path.join(dir, `run_full_${endpoint}.json`);
    if (res.status !== 0 || !fs.existsSync(runFile)) {
      throw new Error(`seed ${seed}: run_full.cjs exited with status ${res.status} and ${fs.existsSync(runFile) ? "a" : "no"} run file. Read ${log}.`);
    }
    const r = summarizeRun(JSON.parse(fs.readFileSync(runFile, "utf8")), seed, wallMs);
    results.push(r);
    console.log(seedLine(r));
    // Rewritten after every seed, so an interrupted benchmark keeps the seeds it finished.
    const why = offVersion(results, seeds, process.env, dirtyFiles);
    const out = { version: why.length ? null : VERSION, offVersion: why, commit, model: r.model, endpoint,
      seeds: seeds.map(Number), score: score(results), summary: summaryLine(results), results };
    fs.writeFileSync(path.join(root, "benchmark.json"), JSON.stringify(out, null, 2));
  }
  console.log(summaryLine(results));
  const why = offVersion(results, seeds, process.env, dirtyFiles);
  console.log(why.length ? `not a ${VERSION} result: ${why.join("; ")}`
    : `a ${VERSION} result at commit ${commit}: docs/benchmark.md, "Submit a result", says how to add it to the leaderboard`);
  console.log(`result: ${path.join(root, "benchmark.json")}`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { summarizeRun, seedLine, summaryLine, score, offVersion, DEFAULT_SEEDS, VERSION, LEVELS };
