// Shared result-flush for the runners. A wall-clock timeout (SIGTERM), a crash,
// or a normal exit must all write the machine-readable JSON — a run that produces
// no result is a half-wasted run. Both run_full.cjs and run_level.cjs use this so
// the flush-on-timeout cannot be present in one runner and missing in the other
// (the builder-lag pattern that bit us four times).
//
// Usage:
//   const flush = installFlush(path, () => ({ ...currentProgress }));
//   // call flush() incrementally in the loop; handlers call it on signal/crash.
//
//   // Graceful-shutdown mode (run_full, which records video): pass
//   // { exitOnSignal: false } so the signal handler only flushes and does NOT
//   // process.exit(). The caller then breaks its own loop and finalises the video
//   // via context.close() before exiting normally. Without this, the immediate
//   // exit here fires before the caller's graceful handler and leaves a
//   // zero-duration, unplayable webm. run_level (no video) keeps the default.
"use strict";

const fs = require("fs");

function installFlush(path, getPayload, opts) {
  opts = opts || {};
  const exitOnSignal = opts.exitOnSignal !== false;
  let flushed = false;
  const flush = () => {
    try {
      fs.writeFileSync(path, JSON.stringify(Object.assign({ flushedAt: new Date().toISOString() }, getPayload()), null, 2));
      flushed = true;
    } catch (_) {}
  };
  // Idempotent-ish: handlers flush then exit; a later normal write is fine too.
  // In graceful mode (exitOnSignal:false) the caller owns shutdown ordering, so
  // we flush and return without exiting.
  if (exitOnSignal) {
    process.on("SIGTERM", () => { flush(); process.exit(143); });
    process.on("SIGINT", () => { flush(); process.exit(130); });
  } else {
    process.on("SIGTERM", () => { flush(); });
    process.on("SIGINT", () => { flush(); });
  }
  process.on("uncaughtException", (e) => { flush(); console.error("UNCAUGHT:", e); process.exit(1); });
  flush.wasFlushed = () => flushed;
  return flush;
}

// Death-history entries for one death. The decision running when the cat died
// keeps its entry; when that was a mid-air tweak, the grounded decision that
// started the arc (a jump or a walk off an edge) gets one too, or its key never
// accrues a prior death and argmax replays the same launch every life (level 13,
// clef baseline: 40 identical walks off the spawn ledge). Shared so both runners
// explore at the same keys; run_level.cjs lacked it while run_full.cjs had it.
// ATTRIB=0 turns the launch entry off.
function deathEntries(chosen, launch, cause) {
  const out = [{ key: chosen.key, action: chosen.action, cause }];
  if (launch && launch.key !== chosen.key && process.env.ATTRIB !== "0") {
    out.push({ key: launch.key, action: launch.action, cause: `${cause} (launched from here by ${launch.action})` });
  }
  return out;
}

// The env flags that change a decision, stamped next to the endpoint in every
// run file (docs/rules.md #5: a result names its build). ATTRIB is on unless "0".
const BUILD_FLAGS = ["ATTRIB", "PRUNE_FATAL", "PRUNE_NOOP", "MOVE_INSTR", "AIR_FACTS", "COL_FACTS",
  "LAND_FACTS", "JUMP_FACTS", "GEM_FACTS", "GEM_FROM", "HOLD_FIX", "STICKY_OBJECTIVE", "ROUTE_FIRST", "GOALS_ONLY", "JEV_STRICT", "BURN_FACTS", "OBJ_SAMPLE", "WPT_ARGMAX", "SEED"];
function buildFlags() {
  const out = {};
  for (const f of BUILD_FLAGS) if (process.env[f] !== undefined) out[f] = process.env[f];
  out.ATTRIB = process.env.ATTRIB === "0" ? "0" : "1";
  // decision.cjs falls back to 12345 when SEED is unset; record the seed in use.
  out.SEED = process.env.SEED || "12345";
  return out;
}

// An unwinnable reset (a gem burned and collected + alive can no longer reach 3)
// burns a life exactly like a death does, so it must reach deathHistory: an
// unrecorded one lets every life replay the identical argmax route (level 13,
// clef 2026-10-07: 11 resets, an empty deathLog, 0 decisions with priorDeaths
// above 0 in either ATTRIB arm). The decisive choice is the route that let the
// gem burn, so blame the last grounded decision; with none yet this life, blame
// the position the cat is at when the burn is detected. Shared so both runners
// blame the same key from the same inputs; test_death_history.cjs asserts both
// call it. ATTRIB is not consulted: there is no separate launch to blame here.
function unwinnableDeath(s, lastGrounded, fallbackKey) {
  const chosen = lastGrounded || {};
  return {
    key: chosen.key || fallbackKey,
    action: chosen.action || "(route)",
    cause: `unwinnable reset: ${s.gemsCollected} collected + ${s.aliveGems} alive cannot reach 3`,
  };
}

module.exports = { installFlush, deathEntries, unwinnableDeath, buildFlags };
