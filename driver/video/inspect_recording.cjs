#!/usr/bin/env node
// Measure what each recording actually contains, identically for every input.
//
// Two regions are measured separately, because they answer different questions:
//
//   PANEL  (x 720..1280)  the decision overlay. Per decision the driver calls
//          overlay.thinking(true), awaits the model, then overlay.update(payload),
//          which re-renders both bar sets and the stats grid. A decision that
//          reaches the screen therefore produces a large change in the bars.
//
//   CANVAS (x 0..720)     the game. The driver steps it by hand (bridge.stepFrame
//          calls propagateGameLoopUpdate + propagateGameLoopRender), so a stepped
//          frame repaints the canvas.
//
// The statistic is the count of pixels changing by more than 20 grey levels, not a
// mean difference: a mean is diluted by the 129600-pixel frame, so encoder noise
// and a walking cat can score similarly, while a count separates "a coherent blob
// moved" from "scattered noise".
//
// A frame is a DUPLICATE when that count is 0: the previous frame is the same image.
// The fraction of duplicates is the single number that says whether a file is a
// recording of a playthrough or a slideshow.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FPS = 25;
const PIXEL_DELTA = 20; // grey levels

function readRegion(file, cropW, cropH, cropX, scale) {
  return execFileSync(
    FFMPEG,
    ["-v", "error", "-i", file, "-vf", `crop=${cropW}:${cropH}:${cropX}:0,scale=${scale}:${scale}:flags=bilinear,format=gray`,
     "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 30 }
  );
}

function analyse(file, cropW, cropH, cropX, scale, groupGap) {
  const buf = readRegion(file, cropW, cropH, cropX, scale);
  const FB = scale * scale;
  const n = Math.floor(buf.length / FB);
  const count = new Int32Array(Math.max(0, n - 1));
  for (let f = 1; f < n; f++) {
    const a = f - 1;
    let c = 0;
    for (let i = 0; i < FB; i++) {
      const d = buf[f * FB + i] - buf[a * FB + i];
      if (d > PIXEL_DELTA || d < -PIXEL_DELTA) c++;
    }
    count[f - 1] = c;
  }
  let duplicates = 0;
  for (let i = 0; i < count.length; i++) if (count[i] === 0) duplicates++;

  // A screencast starts recording before the page has painted, so frame 0 of every
  // file is the browser's default white background. It is a real frame in the file and
  // a plan will otherwise cut it into the output as a 40ms white flash.
  let leadWhite = 0;
  while (leadWhite < n) {
    let bright = 0;
    for (let i = 0; i < FB; i++) if (buf[leadWhite * FB + i] > 140) bright++;
    if (bright < FB * 0.99) break;
    leadWhite++;
  }

  // Group consecutive non-zero frames into change events, then measure the spacing
  // between event STARTS. Consecutive non-zero frames are one repaint caught by the
  // screencast over more than one output frame, not two events.
  //
  // count[i] is the diff between output frame i+1 and output frame i, so every index
  // below is shifted by 1 to become a real output frame number. runs are half-open
  // [start, end) in output frames. The END matters as much as the start: without it a
  // plan cannot tell motion from the think pause that follows it, and would mistake a
  // two-frame repaint for a two-second one.
  const starts = [];
  const runs = [];
  let runStart = -1;
  let last = -1e9;
  let changedFrames = 0;
  for (let i = 0; i < count.length; i++) {
    if (count[i] > 0) {
      changedFrames++;
      if (i - last > groupGap) {
        if (runStart >= 0) runs.push([runStart + 1, last + 2]);
        starts.push(i + 1);
        runStart = i;
      }
      last = i;
    }
  }
  if (runStart >= 0) runs.push([runStart + 1, last + 2]);
  const gaps = starts.slice(1).map((v, i) => v - starts[i]);
  const q = (arr, p) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
  return {
    frames: n,
    durationSec: +(n / FPS).toFixed(2),
    duplicateFrames: duplicates,
    duplicatePct: +(100 * duplicates / count.length).toFixed(1),
    changedFrames,
    changedPct: +(100 * changedFrames / count.length).toFixed(2),
    changeEvents: starts.length,
    changeStartsFrames: starts,
    changeRunsFrames: runs,
    leadWhiteFrames: leadWhite,
    motionFrames: runs.reduce((a, [s, e]) => a + (e - s), 0),
    gapFrames: { min: q(gaps, 0), p25: q(gaps, 0.25), median: q(gaps, 0.5), p75: q(gaps, 0.75), max: q(gaps, Math.max(0, gaps.length - 1) / Math.max(1, gaps.length)) },
    gapSec: {
      min: +(q(gaps, 0) / FPS).toFixed(2),
      median: +(q(gaps, 0.5) / FPS).toFixed(2),
      max: +(Math.max(...gaps, 0) / FPS).toFixed(2),
    },
    gaps,
  };
}

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: inspect_recording.cjs <webm> [webm...]");
  process.exit(1);
}

const out = [];
for (const f of inputs) {
  const panel = analyse(f, 560, 720, 720, 280, 3);
  const canvas = analyse(f, 720, 720, 0, 360, 3);
  out.push({ file: path.basename(f), panel, canvas });
  console.log(`\n=== ${path.basename(f)} ===`);
  console.log(`  ${panel.frames} frames @ ${FPS}fps = ${panel.durationSec}s`);
  console.log(`  PANEL  duplicates ${panel.duplicateFrames}/${panel.frames - 1} (${panel.duplicatePct}%)  changeEvents=${panel.changeEvents}  medianGap=${panel.gapSec.median}s`);
  console.log(`  CANVAS duplicates ${canvas.duplicateFrames}/${canvas.frames - 1} (${canvas.duplicatePct}%)  changeEvents=${canvas.changeEvents}  medianGap=${canvas.gapSec.median}s  gaps=${canvas.gaps.join(",")}`);
  console.log(`  MOTION ${canvas.motionFrames} frames = ${(canvas.motionFrames / FPS).toFixed(2)}s of ${canvas.durationSec}s (${canvas.changedPct}%) in ${canvas.changeEvents} bursts; mean burst ${(canvas.motionFrames / canvas.changeEvents).toFixed(2)} frames`);
}
fs.writeFileSync(path.join(__dirname, "recording_report.json"), JSON.stringify(out, null, 1));
