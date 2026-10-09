#!/usr/bin/env node
// Measure decision timing from a recording, from pixels only.
//
// There is no decision log paired with the 2026-09-23 recordings (out/run_level_<n>_halogen.json
// was overwritten by 2026-09-27 runs), so the timings come out of the video itself.
//
// The overlay panel is a reliable clock. Per decision the driver does:
//   overlay.thinking(true)   -> "thinking..." fades in   (CSS 0.12s transition)
//   <await model>            -> panel static, seconds long
//   overlay.thinking(false)  -> fades out
//   overlay.update(payload)  -> both bar sets re-render   (CSS 0.15s width transition)
//   stepBatch()              -> panel static while the game canvas animates
// so every decision produces a burst of panel-pixel change, and the quiet stretches
// between bursts are the model thinking plus the frames being executed.
//
// Layout at 1280x720: #game-wrap is 100vh=720px wide, so the panel is x 720..1280.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FPS = 25;

// Panel crop of the 1280x720 frame, and the downscale we analyse at.
const CROP_W = 560, CROP_H = 720, CROP_X = 720, CROP_Y = 0;
const SCALE_W = 280, SCALE_H = 360;
const FRAME_BYTES = SCALE_W * SCALE_H;

// Panel-relative row bands (scaled coords, 0..SCALE_H). Used to tell WHICH part of
// the panel changed: the "thinking" strip at the top, the two bar sections in the
// middle, the stats grid at the bottom. The stats grid carries the gems/deaths
// counters, so a change confined to it is a counter tick, not a new decision.
const BANDS = {
  think: [Math.round(SCALE_H * 0.05), Math.round(SCALE_H * 0.13)],
  obj: [Math.round(SCALE_H * 0.14), Math.round(SCALE_H * 0.45)],
  move: [Math.round(SCALE_H * 0.45), Math.round(SCALE_H * 0.78)],
  stats: [Math.round(SCALE_H * 0.78), SCALE_H],
};

function meanAbsDiff(a, b, y0, y1) {
  let sum = 0;
  const start = y0 * SCALE_W;
  const end = y1 * SCALE_W;
  for (let i = start; i < end; i++) {
    const d = a[i] - b[i];
    sum += d < 0 ? -d : d;
  }
  return sum / (end - start);
}

function probe(input) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-i", input,
      "-vf", `crop=${CROP_W}:${CROP_H}:${CROP_X}:${CROP_Y},scale=${SCALE_W}:${SCALE_H}:flags=bilinear,format=gray`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-",
    ];
    const p = spawn(FFMPEG, args);
    const rows = [];
    let pending = Buffer.alloc(0);
    let prev = null;
    let n = 0;

    p.stdout.on("data", (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= FRAME_BYTES) {
        const cur = pending.subarray(0, FRAME_BYTES);
        pending = pending.subarray(FRAME_BYTES);
        if (prev) {
          const row = { f: n, full: meanAbsDiff(cur, prev, 0, SCALE_H) };
          for (const [name, [y0, y1]] of Object.entries(BANDS)) {
            row[name] = meanAbsDiff(cur, prev, y0, y1);
          }
          rows.push(row);
        }
        prev = Buffer.from(cur);
        n++;
      }
    });
    p.stderr.on("data", (d) => process.stderr.write(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ frames: n, rows }) : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

// A decision boundary is a local maximum of panel change that clears `minDiff` and
// is at least `refr` frames from the previous accepted one. The CSS transitions
// spread a single boundary over ~7 frames (0.12s + 0.15s at 25fps), so the peak
// lands 1-3 frames after the real transition; refractory of 6 keeps one decision
// from being counted as several.
function detect(rows, minDiff, refr = 6) {
  const peaks = [];
  for (let i = 1; i < rows.length - 1; i++) {
    const v = rows[i].full;
    if (v < minDiff) continue;
    if (v < rows[i - 1].full || v < rows[i + 1].full) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < refr) {
      if (v > rows[peaks[peaks.length - 1]].full) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

(async () => {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error("usage: analyze_frames.cjs <webm> [webm...]");
    process.exit(1);
  }
  const out = [];
  for (const input of inputs) {
    const { frames, rows } = await probe(input);
    const values = rows.map((r) => r.full).sort((a, b) => a - b);
    const pct = (q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
    // Pick the threshold from the file's own diff distribution rather than a
    // constant, so it does not have to be retuned per recording. p99.0 of panel
    // change sits well above the transition noise floor and well below a real
    // bar-set re-render.
    const minDiff = Math.max(0.6, pct(0.99));
    const peaks = detect(rows, minDiff);
    const gaps = [];
    for (let i = 1; i < peaks.length; i++) gaps.push((peaks[i] - peaks[i - 1]) / FPS);

    out.push({
      input: path.basename(input),
      frames,
      durationSec: frames / FPS,
      diffStats: { p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: values[values.length - 1], minDiff },
      boundaries: peaks.map((i) => ({ frame: i, t: +(i / FPS).toFixed(3), full: +rows[i].full.toFixed(3) })),
      gapsSec: gaps.map((g) => +g.toFixed(3)),
    });
  }
  fs.writeFileSync(path.join(__dirname, "analysis.json"), JSON.stringify(out, null, 1));
  for (const r of out) {
    const g = r.gapsSec;
    const srt = [...g].sort((a, b) => a - b);
    const q = (p) => srt[Math.min(srt.length - 1, Math.floor(srt.length * p))];
    console.log(
      `${r.input}: ${r.frames} frames, ${r.durationSec.toFixed(2)}s, ` +
        `${r.boundaries.length} decision boundaries, ` +
        `diff p50=${r.diffStats.p50.toFixed(3)} p99=${r.diffStats.p99.toFixed(3)} max=${r.diffStats.max.toFixed(3)} thr=${r.diffStats.minDiff.toFixed(3)}`
    );
    if (g.length) {
      console.log(
        `  gap between decisions: min=${srt[0].toFixed(2)} p25=${q(0.25).toFixed(2)} ` +
          `median=${q(0.5).toFixed(2)} p75=${q(0.75).toFixed(2)} p90=${q(0.9).toFixed(2)} max=${srt[srt.length - 1].toFixed(2)}`
      );
    }
  }
})();
