#!/usr/bin/env node
// Turn the measured motion bursts in inspect_recording.cjs into a speed plan.
//
// The plan is DATA, not a filter expression: one row per segment of source time with
// what the editor should do with it. assemble.sh reads it. The interesting question
// about a ramp is which stretch of the run gets which treatment, and that should be
// readable without decoding an ffmpeg expression.
//
// WHY THERE IS NO SPEED MULTIPLIER HERE.
//
// The driver does not let the game run on its own wall clock. It calls gameLoop.stop()
// and steps the game by hand: K=6 frames per decision, with STEP_DELAY_MS=16 under
// HEADED. So the recording is not a slow playthrough, it is an alternation between
// ~80ms of motion and seconds of model latency with the page genuinely static.
//
// Measured on the three existing recordings: 13310 frames total, and only 3-6% of
// them differ from their predecessor (406 frames by the >20-grey detector in
// inspect_recording.cjs, 842 by ffmpeg's independent mpdecimate). 94-97% of the file
// is stillness, and it is stillness the driver chose.
//
// A uniform 6x therefore spends its budget in exactly the wrong place. It compresses
// the 80ms of motion -- the only part a viewer can actually watch -- and leaves 94% of
// the runtime as proportionally just as much stillness. What has to be compressed is
// the WAIT, and the wait is not something to speed up, it is something to cut.
//
// THE POLICY: gap compression with a floor.
//
//   motion  every measured burst plays at MOTION_SPEED, i.e. untouched, real time
//   hold    every still stretch is cut down to its LAST HOLD frames and kept at 1.0x
//
// Two consequences worth being explicit about.
//
// The floor is a floor, not a target. A gap shorter than HOLD is kept whole; a gap
// longer than HOLD keeps only its tail. Nothing is ever resampled to hit a rate, so
// motion is never made unreadable by a resample and stillness is never paid for.
//
// The hold sits at the TAIL of the gap, not the head. run_level.cjs calls
// overlay.thinking(true) at :518, awaits the model, then calls overlay.update(payload)
// at :545 -- the bars are painted at the END of the wait, immediately before the key
// press that moves the cat. Keeping the tail is what preserves "these bars caused this
// movement" as a visible adjacency; keeping the head would show the thinking spinner
// and throw the bars away.
//
// HOLD is the one number that needs a human. It is how long a viewer gets on the
// overlay panel, in frames at 25fps. It cannot be measured from these three files --
// they predate the overlay (it landed in commit b9d962d, three days later) -- so it
// ships as a default and a knob, not as a derived value.

const fs = require("fs");
const path = require("path");

const FPS = 25;

// Frames kept at the tail of each still gap. This is the read time, and it is
// deliberately the only tunable in the file.
//
// The floor is 4 frames and it is not a guess. harness.html transitions .bar-fill width
// over 0.15s, and run_level.cjs:545 calls overlay.thinking(false) and overlay.update()
// in the same evaluate, so the bars are still growing for 150ms after the decision lands.
// A hold shorter than that cuts mid-animation and the viewer sees a half-drawn bar. 4
// frames is 160ms: the animation plus one frame to land on.
//
// 12 frames (480ms) is the recommended start. The arithmetic below is what makes that
// the recommendation rather than 4 -- at 697 decisions a 160ms hold leaves the cut far
// under the retention window, so the read time can afford to be generous and the missing
// minutes have to come from deliberate content instead.
//
// Note the quantisation: 25fps means HOLD moves in 40ms steps, and the useful values are
// 8 (320ms), 12 (480ms), 15 (600ms), 20 (800ms). A 500ms hold is HOLD=12 or 13, not 12.5.
const HOLD = Number(process.env.HOLD || 12);

// Motion is never resampled. The source is already at STEP_DELAY_MS=16 per stepped
// frame, i.e. 0.96x real time, so 1.0 here is real time to within 4%.
const MOTION_SPEED = Number(process.env.MOTION_SPEED || 1);

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: HOLD=4 speedplan.cjs <webm> [webm...]   (run inspect_recording.cjs first)");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(path.join(__dirname, "recording_report.json"), "utf8"));
if (report.length !== inputs.length) {
  console.error(`recording_report.json has ${report.length} entries but ${inputs.length} inputs were given`);
  process.exit(1);
}

const rows = [];
const summary = [];

inputs.forEach((input, i) => {
  const { canvas } = report[i];
  const runs = canvas.changeRunsFrames;
  const total = canvas.frames;
  if (!runs || !runs.length) {
    console.error(`${path.basename(input)}: no motion bursts measured; run inspect_recording.cjs`);
    process.exit(1);
  }
  for (const [s, e] of runs) {
    if (s < 1 || e > total || e <= s) {
      console.error(`${path.basename(input)}: bad burst [${s},${e}) for a ${total}-frame file`);
      process.exit(1);
    }
  }

  let rawF = 0;
  let motionF = 0;
  let holdF = 0;
  let gaps = 0;
  let droppedF = 0;
  const leadWhite = canvas.leadWhiteFrames || 0;
  let prevEnd = leadWhite;

  const hold = (g0, g1) => {
    const len = g1 - g0;
    if (len <= 0) return;
    gaps++;
    const keep = Math.min(len, HOLD);
    const start = g1 - keep;
    droppedF += len - keep;
    holdF += keep;
    rows.push([path.basename(input), start / FPS, g1 / FPS, MOTION_SPEED, "hold", keep].join("\t"));
  };

  for (const [s0, e] of runs) {
    const s = Math.max(s0, leadWhite);
    hold(prevEnd, s);
    const len = e - s;
    if (len <= 0) { prevEnd = Math.max(prevEnd, e); continue; }
    motionF += len;
    rows.push([path.basename(input), s / FPS, e / FPS, MOTION_SPEED, "motion", len].join("\t"));
    prevEnd = e;
  }
  hold(prevEnd, total);

  rawF = total;
  summary.push({
    input: path.basename(input),
    rawFrames: rawF,
    rawSec: +(rawF / FPS).toFixed(2),
    motionBursts: runs.length,
    motionFrames: motionF,
    motionSec: +(motionF / FPS).toFixed(2),
    gaps,
    holdFrames: holdF,
    droppedFrames: droppedF,
    outFrames: motionF + holdF,
    outSec: +((motionF + holdF) / FPS).toFixed(2),
  });
});

const planPath = path.join(__dirname, "speedplan.tsv");
fs.writeFileSync(planPath, rows.join("\n") + "\n");

// The 14-level budget. Total runtime is dominated by (number of decisions) x HOLD, so
// the whole question of cut length is a question of the decision count.
//
// THE DENOMINATOR IS A CLEARED RUN, NOT A FAILED ONE.
//
// out/run_level_<n>_halogen.json holds 14 archives, and the two kinds are not
// comparable. A level that clears stops when the cat finishes it. A level that fails
// runs until it hits MAX_STEPS=3000 or MAX_DEATHS=40, so its decision count is a count
// of flailing. Measured over the stable archives:
//
//   cleared   347 decisions over  7 levels   mean  50
//   failing  2656 decisions over  7 levels   mean 379
//
// A video of the game being beaten contains only cleared levels, so the projection is
// 347 + 50 x 7 = 697 decisions, not the 3413 you get by summing all 14 archives. That
// earlier figure was wrong by 7.6x and it was wrong in the direction of "too tight to
// fit", which is the direction that hides a problem instead of reporting one.
//
// The failing-run numbers are kept deliberately: if no full clear ever lands, a video of
// the run that fails is a real deliverable with a real length, and it needs the same
// arithmetic. NOTE the failing figures are a snapshot taken while seven levels were
// still being re-run, so they will move. The cleared figures are stable.
const CLEARED_DECISIONS_7 = 347;
const MEAN_CLEARED_DECISIONS = 50;
const FAILING_DECISIONS_7 = 2656;
const MEAN_FAILING_DECISIONS = 379;

const DECISIONS = Number(
  process.env.DECISIONS || CLEARED_DECISIONS_7 + MEAN_CLEARED_DECISIONS * 7
);

// Motion frames per decision, from the three measured recordings: 2.01 by the
// >20-grey detector in inspect_recording.cjs, 4.17 by ffmpeg's mpdecimate. One motion
// burst per decision, which is the assumption behind projecting motion at all.
const MOTION_FRAMES_PER_DECISION = { detector: 2.01, mpdecimate: 4.17 };

// One projection per motion detector. They disagree 2.07x, so the pair IS the
// uncertainty band; do not average them.
const project = (decisions, hold, motionPerDecision) => {
  const holdSec = (decisions * hold) / FPS;
  const motionSec = (decisions * motionPerDecision) / FPS;
  return { holdMin: +(holdSec / 60).toFixed(2), motionMin: +(motionSec / 60).toFixed(2), totalMin: +((holdSec + motionSec) / 60).toFixed(2) };
};

const HOLDS = [4, 8, 10, 12, 15, 20, 24];
const FAILING14 = FAILING_DECISIONS_7 + MEAN_FAILING_DECISIONS * 7;
const budget = HOLDS.map((h) => ({
  holdFrames: h,
  readMs: Math.round((h / FPS) * 1000),
  cleared: project(DECISIONS, h, MOTION_FRAMES_PER_DECISION.detector),
  clearedMp: project(DECISIONS, h, MOTION_FRAMES_PER_DECISION.mpdecimate),
  failing: project(FAILING14, h, MOTION_FRAMES_PER_DECISION.detector),
}));

fs.writeFileSync(
  path.join(__dirname, "speedplan_summary.json"),
  JSON.stringify(
    {
      holdFrames: HOLD,
      motionSpeed: MOTION_SPEED,
      perInput: summary,
      totalRawSec: +summary.reduce((a, s) => a + s.rawSec, 0).toFixed(2),
      totalOutSec: +summary.reduce((a, s) => a + s.outSec, 0).toFixed(2),
      totalOutFrames: summary.reduce((a, s) => a + s.outFrames, 0),
      motionShareOfOutput: +(100 * summary.reduce((a, s) => a + s.motionFrames, 0) / summary.reduce((a, s) => a + s.outFrames, 0)).toFixed(1),
      clearedDecisions14Levels: DECISIONS,
      failingDecisions14Levels: FAILING14,
      motionFramesPerDecision: MOTION_FRAMES_PER_DECISION,
      holdBudget: budget,
      planRows: rows.length,
    },
    null,
    1
  )
);

console.log(`HOLD=${HOLD} frames (${((HOLD / FPS) * 1000).toFixed(0)}ms)  motion=${MOTION_SPEED}x  plan rows=${rows.length}`);
for (const s of summary) {
  console.log(
    `  ${s.input.padEnd(32)} raw ${String(s.rawSec).padStart(7)}s (${s.rawFrames}f)  motion ${String(s.motionFrames).padStart(4)}f in ${String(s.motionBursts).padStart(3)} bursts  gaps ${String(s.gaps).padStart(3)}  -> out ${String(s.outFrames).padStart(5)}f = ${String(s.outSec).padStart(6)}s`
  );
}
const tRaw = summary.reduce((a, s) => a + s.rawSec, 0);
const tOut = summary.reduce((a, s) => a + s.outSec, 0);
console.log(`  ${"TOTAL".padEnd(32)} raw ${String(+tRaw.toFixed(2)).padStart(7)}s${" ".repeat(20)}-> out ${String(summary.reduce((a, s) => a + s.outFrames, 0)).padStart(5)}f = ${String(+tOut.toFixed(2)).padStart(6)}s   ${(tRaw / tOut).toFixed(1)}x compression, motion is ${(100 * summary.reduce((a, s) => a + s.motionFrames, 0) / summary.reduce((a, s) => a + s.outFrames, 0)).toFixed(0)}% of the cut`);
console.log(`\n  14 cleared levels at ${DECISIONS} decisions (347 measured + 50 x 7), motion at 1.0x:`);
console.log(`    HOLD  read     holds   + motion (detector..mpdecimate)`);
for (const b of budget) {
  console.log(
    `    ${String(b.holdFrames).padStart(4)}  ${String(b.readMs + "ms").padStart(6)}  ${(b.cleared.holdMin.toFixed(2) + "m").padStart(6)}   ${b.cleared.totalMin.toFixed(2)} - ${b.clearedMp.totalMin.toFixed(2)} min`
  );
}
console.log(`\n  If no full clear ever lands, the same table on a 14-level FAILING run`);
console.log(`  (${FAILING14} decisions) at HOLD=${HOLD}: ${budget.find((b) => b.holdFrames === HOLD).failing.totalMin.toFixed(2)} min of holds+motion.`);