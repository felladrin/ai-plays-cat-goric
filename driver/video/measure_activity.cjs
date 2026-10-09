#!/usr/bin/env node
// Measure the decision clock from the game canvas, from pixels only.
//
// No decision log is paired with the 2026-09-23 recordings (out/run_level_<n>_halogen.json
// was overwritten by 2026-09-27 runs), so the timings come out of the video itself.
//
// The decision panel turned out to be useless as a clock: in all three recordings it
// shows only its static HTML defaults (see measure_panel.cjs output) and never repaints.
// The game canvas, however, gives the same signal from the other side. Per decision the
// driver does:
//   overlay.thinking(true) / <await model>   -> nothing moves on the canvas
//   setAction + stepBatch()                   -> the cat is stepped by hand, 16ms per
//                                                frame (STEP_DELAY_MS, HEADED=1)
// so the canvas alternates between a moving stretch (the frames being executed) and a
// still stretch (the model call). The still stretches are the dead time a speed ramp
// exists to remove; the moving stretches are the part a viewer is watching.
//
// Layout at 1280x720: #game-wrap is 100vh=720px wide, so the canvas region is x 0..720.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FPS = 25;

const SW = 360, SH = 360, FRAME_BYTES = SW * SH; // half-res of the 720x720 game region

function stream(input, onFrame) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-i", input,
      "-vf", "crop=720:720:0:0,scale=360:360:flags=bilinear,format=gray",
      "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ];
    const p = spawn(FFMPEG, args);
    let pending = null, prev = null, n = 0;
    p.stdout.on("data", (chunk) => {
      pending = pending && pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= FRAME_BYTES) {
        const cur = pending.subarray(0, FRAME_BYTES);
        pending = pending.subarray(FRAME_BYTES);
        if (prev) {
          let s = 0;
          for (let i = 0; i < FRAME_BYTES; i++) {
            const d = cur[i] - prev[i];
            s += d < 0 ? -d : d;
          }
          onFrame(n, s / FRAME_BYTES);
        }
        prev = Buffer.from(cur);
        n++;
      }
    });
    p.stderr.on("data", (d) => process.stderr.write(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(n) : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

// Report the diff histogram so the active/idle threshold is picked from the data
// rather than asserted, then threshold at the widest gap in the log domain.
function pickThreshold(values) {
  const pos = values.filter((v) => v > 1e-4).sort((a, b) => a - b);
  const lmin = Math.log10(pos[0]), lmax = Math.log10(pos[pos.length - 1]);
  const BINS = 48;
  const hist = new Array(BINS).fill(0);
  for (const v of pos) {
    const b = Math.min(BINS - 1, Math.floor(((Math.log10(v) - lmin) / (lmax - lmin)) * BINS));
    hist[b]++;
  }
  let best = -1, bestScore = -1;
  for (let b = 0; b < BINS - 1; b++) {
    // Score a split by how empty the neighbourhood around the cut is relative to
    // the two modes it separates.
    const lo = hist.slice(0, b + 1).reduce((a, c) => a + c, 0);
    const hi = hist.slice(b + 1).reduce((a, c) => a + c, 0);
    const around = hist.slice(Math.max(0, b - 2), b + 3).reduce((a, c) => a + c, 0);
    const score = (lo * hi) / (pos.length * (around + 1));
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return { threshold: Math.pow(10, lmin + ((best + 1) / BINS) * (lmax - lmin)), lmin, lmax, hist, BINS };
}

(async () => {
  const inputs = process.argv.slice(2);
  if (!inputs.length) {
    console.error("usage: measure_activity.cjs <webm> [webm...]");
    process.exit(1);
  }
  const out = [];
  for (const input of inputs) {
    const diffs = [];
    const total = await stream(input, (n, d) => diffs.push(d));
    const { threshold, lmin, lmax, hist, BINS } = pickThreshold(diffs);

    // Classify, then bridge single-frame dropouts: the cat is sometimes still for
    // one frame mid-batch (a landing, a blocked push), and a 1-frame hole would
    // split one decision's movement into two segments.
    const active = diffs.map((d) => d > threshold);
    for (let i = 1; i < active.length - 1; i++) {
      if (!active[i] && active[i - 1] && active[i + 1]) active[i] = true;
    }

    // Segments of consecutive same-class frames. A "move" segment is the frames the
    // driver executed for one decision; a "still" segment is the model call before it.
    const segs = [];
    let start = 0;
    for (let i = 1; i <= active.length; i++) {
      if (i === active.length || active[i] !== active[start]) {
        segs.push({ kind: active[start] ? "move" : "still", f0: start, f1: i, frames: i - start });
        start = i;
      }
    }

    // Only trust runs long enough to be a real event. A 1-2 frame move is decoder
    // noise around the threshold; a 1-2 frame still in the middle of a move run is
    // the cat pausing on a platform, which is content, not a model call.
    const minMove = Math.round(FPS * 0.20);
    const meaningful = segs.filter((s) => (s.kind === "move" ? s.frames >= minMove : true));

    const moves = meaningful.filter((s) => s.kind === "move");
    const stills = meaningful.filter((s) => s.kind === "still" && s.f0 > 0);
    const sum = (a, k) => a.reduce((t, s) => t + s[k], 0);
    const q = (a, p) => {
      if (!a.length) return 0;
      const s = [...a].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor(s.length * p))];
    };

    out.push({
      input: path.basename(input),
      frames: total,
      durationSec: +(total / FPS).toFixed(2),
      threshold: +threshold.toFixed(4),
      activeFramePct: +(100 * active.filter(Boolean).length / active.length).toFixed(1),
      moveSegments: moves.length,
      stillSegments: stills.length,
      moveSecTotal: +(sum(moves, "frames") / FPS).toFixed(2),
      stillSecTotal: +(sum(stills, "frames") / FPS).toFixed(2),
      moveSec: { median: +(q(moves, 0.5) / FPS).toFixed(2), p90: +(q(moves, 0.9) / FPS).toFixed(2), max: +(Math.max(...moves.map((m) => m.frames)) / FPS).toFixed(2) },
      stillSec: { p10: +(q(stills, 0.1) / FPS).toFixed(2), median: +(q(stills, 0.5) / FPS).toFixed(2), p90: +(q(stills, 0.9) / FPS).toFixed(2), max: +(Math.max(...stills.map((s) => s.frames)) / FPS).toFixed(2) },
      segments: meaningful.map((s) => ({ k: s.kind[0], t: +(s.f0 / FPS).toFixed(2), d: +(s.frames / FPS).toFixed(2) })),
      hist: { lmin: +lmin.toFixed(3), lmax: +lmax.toFixed(3), counts: hist, bins: BINS },
    });
  }
  fs.writeFileSync(path.join(__dirname, "activity.json"), JSON.stringify(out, null, 1));
  for (const r of out) {
    console.log(
      `${r.input}: ${r.frames}f ${r.durationSec}s  thr=${r.threshold}  active=${r.activeFramePct}%\n` +
        `  move  segments=${r.moveSegments} total=${r.moveSecTotal}s  median=${r.moveSec.median}s p90=${r.moveSec.p90}s max=${r.moveSec.max}s\n` +
        `  still segments=${r.stillSegments} total=${r.stillSecTotal}s  p10=${r.stillSec.p10}s median=${r.stillSec.median}s p90=${r.stillSec.p90}s max=${r.stillSec.max}s`
    );
  }
})();
