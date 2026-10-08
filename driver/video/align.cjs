#!/usr/bin/env node
// Map the run log's wall-clock stamps onto frames of the single continuous recording.
//
// WHY THIS FILE EXISTS.
//
// run_full.cjs records the whole fourteen-level ladder into ONE webm
// (run_full.cjs:127 newContext with recordVideo, unconditional). That is the vehicle for
// the deliverable: one timeline, the victory screen included, and the transitions
// between levels preserved as edits rather than splices. It also removes every
// per-level cut point, because a level boundary is no longer a file boundary -- it is
// a moment inside the stream that nothing in the container knows about.
//
// The only thing that knows about those moments is the run log, because the log is
// written by the same process that drives the page. So the editor needs one number
// that both agree on: the offset between the log's clock and the video's clock.
//
// THE CLOCK IS NOT A GUESS. It was read out of Playwright's own source.
//
// playwright-core, packages/playwright-core/src/server/videoRecorder.ts:
//
//   FfmpegVideoRecorder's constructor sets this._creationTimeMs = Date.now()
//   every frame is written as _emitFrame(frame, frame.frameSwapWallTime - _creationTimeMs)
//   and frameSwapWallTime = event.timestamp * 1e3 + this._screencastClockOffset,
//   where _screencastClockOffset = Date.now() - event.timestamp * 1e3 is captured ONCE
//   ffmpeg is invoked with -metadata creation_time=<ISO of _creationTimeMs>
//
// So cluster timestamps are epoch-milliseconds minus a Date.now() epoch, the browser's
// monotonic clock is anchored to the driver process's wall clock at the first frame,
// and the epoch itself is written into the container as the creation_time tag. There is
// no cross-process drift to correct, and nothing to approximate: the tag IS the zero
// point, and Date.now() in the driver IS the recording's clock.
//
// Measured corroboration on the three existing per-level recordings: level_0's
// creation_time is 2026-09-24T00:58:28.442Z and its last frame sits at 67.760s;
// level_1's recorder was created at 00:59:35.395Z, 193ms after level_0's real end at
// 00:59:35.202Z once the recorder's synthetic tail is removed. That is the exact
// sequence of "finalise the previous file, start the next process", and the gap is
// 193ms, not 193 seconds, which is what makes the model credible.
//
// RESOLUTION. One frame is 40ms and the bar is painted asynchronously -- overlay.update
// returns before the screencast samples the page -- so every mapping below is exact to
// within one frame. Nothing downstream can need better than that, because the plan cuts
// on whole frames anyway.
//
// THE SELF-CHECK, which is the part that matters.
//
// Mapping wall-clock onto a video is a claim, not a computation, and the claim is only
// as good as the alignment between two clocks. So this file also predicts the video's
// total duration from the log alone and compares it with ffprobe. The prediction has a
// floor and a ceiling, and the arithmetic behind them is not a fudge factor:
//
//   the recorder appends ONE synthetic final frame on stop, at
//     lastFrameTimestamp + max(monotonicNow - lastWriteTime, 1000ms) - creationTime
//   so the file always ends between 1s after the last real frame (stop promptly) and
//   the moment the recorder stopped (stop long after the last write, which is what
//   run_full.cjs does: it dumps the whole run log as JSON before closing the context)
//
//   predicted = (endWallMs - zeroMs) + 40ms
//   predictedCeiling = (endWallMs - zeroMs) + 1040ms
//   floor = (lastDecisionWallMs - zeroMs) + 1040ms
//
// If the measured duration is outside [floor, ceiling] the clock model is wrong for
// this recording and nothing downstream can be trusted. check.deltaInRange says so.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FFPROBE = process.env.FFPROBE || "/opt/homebrew/bin/ffprobe";
const FPS = 25;
const FRAME_MS = 1000 / FPS;
const TAIL_MS = FRAME_MS; // the synthetic final frame occupies one frame slot
const SYNTHETIC_TAIL_MIN_MS = 1000; // videoRecorder.ts _stop()

const fail = (msg) => {
  console.error(`align: ${msg}`);
  process.exit(1);
};

const probe = (args) => execFileSync(FFPROBE, args, { encoding: "utf8", maxBuffer: 1 << 24 });

// ---------------------------------------------------------------------------
// The mapping, as a pure function so it can be tested without a video.
// ---------------------------------------------------------------------------

// Return { ms, frame, residual } for one wall-clock stamp.
const place = (wallMs, zeroMs, lastFrame) => {
  const ms = wallMs - zeroMs;
  const exact = ms / FRAME_MS;
  const frame = Math.min(lastFrame, Math.max(0, Math.round(exact)));
  return { ms, frame, residual: +(exact - frame).toFixed(3) };
};

// Turn one wallMs field into a placed record, or null if the field is absent.
const at = (wallMs, zeroMs, lastFrame) =>
  wallMs == null ? null : { wallMs, ...place(wallMs, zeroMs, lastFrame) };

// ---------------------------------------------------------------------------
// Self-test: a synthetic log whose answer is known by construction.
// ---------------------------------------------------------------------------

const SELFTEST = () => {
  const zeroMs = 1_757_000_000_000; // 2025-09-04T15:33:20.000Z, arbitrary but fixed
  const lastFrame = 100_000;
  const checks = [];
  const ok = (name, got, want) => checks.push({ name, ok: got === want, got, want });

  // Exact frame boundary, off boundary by a quarter, negative, and past the end.
  ok("on the boundary", place(zeroMs + 1000, zeroMs, lastFrame).frame, 25);
  ok("off the boundary", place(zeroMs + 1010, zeroMs, lastFrame).frame, 25);
  ok("round down below .5", place(zeroMs + 1019, zeroMs, lastFrame).frame, 25);
  ok("round up above .5", place(zeroMs + 1021, zeroMs, lastFrame).frame, 26);
  ok("clamped negative", place(zeroMs - 500, zeroMs, lastFrame).frame, 0);
  ok("clamped past the end", place(zeroMs + 9e9, zeroMs, lastFrame).frame, lastFrame);
  ok("first frame", place(zeroMs, zeroMs, lastFrame).frame, 0);
  ok("residual is signed", place(zeroMs + 1010, zeroMs, lastFrame).residual, 0.25);
  ok("absent stamp is null", at(null, zeroMs, lastFrame), null);

  // The duration prediction, both ends. The real code subtracts the zero point; so does
  // this, or the window would be centred on the epoch instead of on the run.
  const endWallMs = zeroMs + 60_000;
  const lastDecisionWallMs = zeroMs + 59_000;
  const durationMs = 60_500; // 500ms after endWallMs: inside the window, a real file would look like this
  const floorMs = lastDecisionWallMs - zeroMs + SYNTHETIC_TAIL_MIN_MS;
  const ceilingMs = endWallMs - zeroMs + SYNTHETIC_TAIL_MIN_MS + TAIL_MS;
  ok("inside the window", durationMs >= floorMs && durationMs <= ceilingMs, true);
  ok("too short is caught", 900 >= floorMs, false);
  ok("too long is caught", 90_000 <= ceilingMs, false);

  // A 30 minute recording, mapped, to prove the arithmetic scales.
  ok("30min frame", place(zeroMs + 1_800_000, zeroMs, lastFrame).frame, 45_000);

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : `  got ${JSON.stringify(c.got)} want ${JSON.stringify(c.want)}`}`);
  }
  console.log(`align self-test: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exit(1);
};

if (process.argv.includes("--selftest")) {
  SELFTEST();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Real work.
// ---------------------------------------------------------------------------

const [logPath, videoPath] = process.argv.slice(2);
if (!logPath || !videoPath) {
  console.error("usage: align.cjs <run_full_*.json> <webm> [align.json]   |   align.cjs --selftest");
  process.exit(1);
}
if (!fs.existsSync(logPath)) fail(`${logPath} does not exist`);
if (!fs.existsSync(videoPath)) fail(`${videoPath} does not exist`);

const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
if (!log.video) {
  fail(
    `${path.basename(logPath)} has no top-level "video" block, so it was written by a run_level.cjs from before the screencast-clock change (run_full.cjs and run_level.cjs both emit it now). Re-run with the current build.`
  );
}
if (log.video.endWallMs == null) fail(`log.video.endWallMs is null; the run did not reach the end-of-loop stamp, so its timeline is unbounded`);

// --- the video's zero point, straight out of the container tag -------------
const fmt = JSON.parse(probe(["-v", "error", "-show_format", "-show_streams", "-of", "json", videoPath]));
const creationTime = (fmt.format && fmt.format.tags && (fmt.format.tags.creation_time || fmt.format.tags.CREATION_TIME)) || null;
if (!creationTime) fail(`${path.basename(videoPath)} has no creation_time tag, so this recording predates the tag or was produced by a different recorder; there is no zero point to align to`);
const zeroMs = Date.parse(creationTime);
if (Number.isNaN(zeroMs)) fail(`creation_time "${creationTime}" is not a date`);

const vStream = fmt.streams.find((s) => s.codec_type === "video");
if (!vStream) fail(`${path.basename(videoPath)} has no video stream`);
const durationSec = Number(fmt.format.duration);
const lastFrame = Math.max(0, Math.round(durationSec * FPS) - 1);

// Counting frames is a full decode, which on a 30 minute take is minutes of wall time
// for a number the container already implies. Off by default; on to confirm CFR.
let countedFrames = null;
if (process.env.COUNT_FRAMES === "1") {
  countedFrames = Number(probe(["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", videoPath]).trim());
}

const placeAll = (wallMs) => at(wallMs, zeroMs, lastFrame);

// --- the run's structure ---------------------------------------------------
const levels = (log.levels || []).map((l) => ({
  level: l.level,
  decisions: l.decisions,
  deaths: l.deaths,
  ...(placeAll(l.levelStartWallMs) || { wallMs: null, ms: null, frame: null, residual: null }),
  missingStamp: l.levelStartWallMs == null,
}));

const decisions = [];
const deaths = [];
for (const l of log.levels || []) {
  for (const d of l.decisionsLog || []) {
    const p = placeAll(d.wallMs);
    if (p) decisions.push({ level: l.level, step: d.step, ...p });
  }
  for (const d of l.deathLog || []) {
    const p = placeAll(d.wallMs);
    if (p) deaths.push({ level: l.level, step: d.step, key: d.key, cause: d.cause, ...p });
  }
}
decisions.sort((a, b) => a.wallMs - b.wallMs);
deaths.sort((a, b) => a.wallMs - b.wallMs);

// --- the self-check --------------------------------------------------------
const endMs = log.video.endWallMs - zeroMs;
const durationMs = durationSec * 1000;
const lastDecisionWallMs = decisions.length ? decisions[decisions.length - 1].wallMs : null;
const floorMs = (lastDecisionWallMs == null ? 0 : lastDecisionWallMs - zeroMs) + SYNTHETIC_TAIL_MIN_MS;
const ceilingMs = endMs + SYNTHETIC_TAIL_MIN_MS + TAIL_MS;
const deltaMs = durationMs - endMs;

const check = {
  predictedFloorMs: +floorMs.toFixed(1),
  predictedCeilingMs: +ceilingMs.toFixed(1),
  measuredDurationMs: +durationMs.toFixed(1),
  endMs: +endMs.toFixed(1),
  deltaVsEndWallMs: +deltaMs.toFixed(1),
  deltaInRange: durationMs >= floorMs && durationMs <= ceilingMs,
  epochHintLagMs: log.video.epochHintMs == null ? null : zeroMs - log.video.epochHintMs,
  countedFrames,
  countedFramesAgree: countedFrames == null ? null : countedFrames === lastFrame + 1,
};

// The log's own end stamp is the thing every other stamp is measured against, so if the
// two clocks disagree the failure surfaces here rather than as subtly wrong cuts.
if (!check.deltaInRange) {
  // floor above ceiling is a different fault with a different fix, and telling them
  // apart saves a hunt through the wrong file. It means some stamp in the log sits after
  // the run ended, i.e. the log is internally inconsistent, not misaligned with the video.
  if (floorMs > ceilingMs) {
    fail(
      `the log is internally inconsistent: a decision is stamped after the run ended.\n` +
        `  last decision in the log is at ${(lastDecisionWallMs - zeroMs).toFixed(0)}ms\n` +
        `  the run's end stamp is at ${endMs.toFixed(0)}ms\n` +
        `  so the earliest possible video length is ${floorMs.toFixed(0)}ms and the latest is ${ceilingMs.toFixed(0)}ms\n` +
        `  no recording can satisfy both, so this is a bug in how the log was stamped, not a clock offset.\n` +
        `  STOP. Do not cut this file.`
    );
  }
  fail(
    `the log and the video do not agree on how long the run took.\n` +
      `  video ${path.basename(videoPath)} is ${durationMs.toFixed(0)}ms (${countedFrames == null ? "implied" : countedFrames} frames)\n` +
      `  log ends at ${endMs.toFixed(0)}ms after the container's creation_time\n` +
      `  a correct alignment puts the video between ${floorMs.toFixed(0)}ms and ${ceilingMs.toFixed(0)}ms\n` +
      `  measured delta ${deltaMs.toFixed(0)}ms is outside that window\n` +
      `  STOP. Do not cut this file. The screencast-clock model does not hold here, and every\n` +
      `  frame number below would be off by ${(deltaMs / FRAME_MS).toFixed(0)} frames.`
  );
}

const out = {
  generatedBy: "driver/video/align.cjs",
  video: { path: videoPath, creationTime, zeroMs, durationMs: +durationMs.toFixed(1), durationSec, frames: lastFrame + 1, fps: FPS, codec: vStream.codec_name, width: vStream.width, height: vStream.height },
  log: { path: logPath, which: log.which || null, recorded: log.video.recorded, decisionCount: decisions.length, deathCount: deaths.length, levelCount: (log.levels || []).length },
  check,
  levels,
  victory: placeAll(log.video.victoryWallMs),
  end: placeAll(log.video.endWallMs),
  decisions,
  deaths,
};

const outPath = process.argv[4] || path.join(__dirname, "align.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

const mins = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
console.log(`align: ${path.basename(videoPath)}  ${out.video.frames} frames  ${mins(durationSec)}  zero=${creationTime}`);
console.log(`  self-check PASS  delta ${check.deltaVsEndWallMs}ms inside [${check.predictedFloorMs}, ${check.predictedCeilingMs}]  epoch hint lag ${check.epochHintLagMs == null ? "n/a" : check.epochHintLagMs + "ms"}`);
console.log(`  levels ${levels.length}  decisions ${decisions.length}  deaths ${deaths.length}  victory ${out.victory ? "frame " + out.victory.frame : "NOT STAMPED"}`);
for (const l of levels) {
  const res = l.missingStamp ? "NO levelStartWallMs" : `frame ${String(l.frame).padStart(6)}  ${mins(l.ms / 1000)}  ${l.decisions} decisions, ${l.deaths} deaths`;
  console.log(`    L${String(l.level).padStart(2)}  ${res}`);
}
console.log(`  -> ${outPath}`);
