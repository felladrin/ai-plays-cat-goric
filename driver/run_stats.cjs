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

module.exports = { installFlush };
