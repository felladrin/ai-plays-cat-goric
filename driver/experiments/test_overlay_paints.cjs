// Does the decision sidebar actually paint, and does the recorder capture it?
//
// The 2026-09-23 recordings showed the panel at 99.9% duplicate frames: the
// bars never moved, so the video proved nothing about the classifier. This
// checks the two things that have to hold for a demo recording to be worth
// anything:
//
//   A. window.overlay exists and overlay.update() mutates the panel DOM.
//   B. A Playwright recordVideo capture of that panel contains real changes,
//      measured the same way driver/video/inspect_recording.cjs measures them
//      (pixels moving by >20 grey levels), so the recording is not a slideshow.
//
// Run: node driver/experiments/test_overlay_paints.cjs
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const CFG = require("../config.cjs");
const { chromium } = CFG.resolvePlaywright();

const FFMPEG = "/usr/bin/ffmpeg";
const VIEWPORT = { width: 1280, height: 720 };
const PANEL_X = 720; // #game-wrap is 100vh = 720px wide; the panel is the rest
const PANEL_W = VIEWPORT.width - PANEL_X;
const PIXEL_DELTA = 20;

let bad = 0;
const fail = (m) => { bad++; console.error("FAIL: " + m); };
const pass = (m) => console.log("PASS: " + m);

const SAMPLE = {
  level: 5, gems: 2, deaths: 1, movingFrames: 123.4, countdown: 456,
  objective: {
    question: "Which objective?",
    probs: { gem_a: 0.12, gem_b: 0.81, portal: 0.07 },
    chosen: "gem_b",
  },
  move: {
    question: "Which move?",
    probs: { left: 0.05, right: 0.88, jump: 0.04, jump_left: 0.01, jump_right: 0.02 },
    chosen: "right",
  },
  policyMode: "ARGMAX", temperature: null, priorDeaths: 0, latencyMs: 812,
};

(async () => {
  const dir = CFG.outPath("overlay_check");
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir, size: VIEWPORT },
  });
  const page = await context.newPage();
  await page.goto(CFG.HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction(() => window.bridge && window.bridge.catSprite, { timeout: 15000 });

  // A. The overlay must exist.
  const hasOverlay = await page.evaluate(() => !!(window.overlay && window.overlay.update && window.overlay.thinking));
  if (!hasOverlay) fail("window.overlay is missing — the panel cannot be driven");
  else pass("window.overlay present with update() and thinking()");

  const panelText = () => page.evaluate(() => document.getElementById("panel").innerText);
  const before = await panelText();

  await page.evaluate((d) => { window.overlay.thinking(true); window.overlay.update(d); }, SAMPLE);
  await page.waitForTimeout(300);
  const after = await panelText();

  if (after === before) fail("panel innerText unchanged after overlay.update() — bars are not rendering");
  else pass(`panel repaints (${before.length} -> ${after.length} chars of text)`);

  for (const needle of ["gem_b", "right", "ARGMAX", "812ms", "Frames until laser"]) {
    if (!after.includes(needle)) fail(`panel is missing "${needle}"`);
  }
  if (!after.includes("gem_b") || !after.includes("0.810")) fail("chosen objective / its probability not shown");
  pass("panel shows the chosen objective, its probability, the move, the policy mode and latency");

  const chosenCount = await page.evaluate(() => document.querySelectorAll("#obj-bars .bar-row.chosen").length);
  if (chosenCount !== 1) fail(`expected exactly 1 chosen objective row, got ${chosenCount}`);
  else pass("exactly one objective row is highlighted as chosen");

  // B. Record a few real updates and measure the panel region in the video.
  for (let i = 0; i < 12; i++) {
    const d = JSON.parse(JSON.stringify(SAMPLE));
    d.level = i % 3;
    d.objective.chosen = i % 2 ? "gem_a" : "portal";
    d.objective.probs = i % 2
      ? { gem_a: 0.74, gem_b: 0.2, portal: 0.06 }
      : { gem_a: 0.1, gem_b: 0.16, portal: 0.74 };
    d.move.chosen = ["left", "right", "jump_right"][i % 3];
    d.latencyMs = 500 + i * 37;
    await page.evaluate((x) => {
      window.overlay.thinking(true);
      setTimeout(() => window.overlay.thinking(false), 60);
      window.overlay.update(x);
    }, d);
    await page.waitForTimeout(220);
  }
  // The video file is only finalised when the CONTEXT closes, but its path must be
  // read BEFORE the close (videoRecorder.ts drops the handle with the page).
  const vpath = await page.video().path();
  await context.close(); // finalises the webm
  const file = vpath && fs.existsSync(vpath) ? vpath : null;
  if (!file) { fail("no video file produced"); await browser.close(); process.exit(1); }

  const raw = execFileSync(
    FFMPEG,
    ["-v", "error", "-i", file, "-vf",
     `crop=${PANEL_W}:720:${PANEL_X}:0,scale=${PANEL_W / 2}:360:flags=bilinear,format=gray`,
     "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 30 }
  );
  const FW = PANEL_W / 2, FH = 360, FB = FW * FH;
  const frames = Math.floor(raw.length / FB);
  let changed = 0, dup = 0;
  for (let f = 1; f < frames; f++) {
    const a = raw.subarray((f - 1) * FB, f * FB);
    const b = raw.subarray(f * FB, (f + 1) * FB);
    let n = 0;
    for (let i = 0; i < FB; i++) if (Math.abs(a[i] - b[i]) > PIXEL_DELTA) n++;
    if (n === 0) dup++; else changed++;
  }
  const pct = frames > 1 ? (changed / (frames - 1)) * 100 : 0;
  console.log(`video: ${file}`);
  console.log(`panel region: ${frames} frames, ${changed} changed (${pct.toFixed(1)}%), ${dup} duplicate`);
  if (changed < 5) fail(`panel changed in only ${changed} frames — this is the slideshow failure from the 2026-09-23 recordings`);
  else pass(`panel genuinely animates in the recording (${changed} changed frames)`);

  await browser.close();
  console.log(bad ? `\nOVERLAY: FAIL (${bad})` : "\nOVERLAY: PASS");
  if (bad) process.exit(1);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
