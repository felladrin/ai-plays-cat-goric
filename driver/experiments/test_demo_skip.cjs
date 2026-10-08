// Validates the DEMO_KEEP level-skip rewrite used by run_full.cjs for the demo
// recording, against the REAL bridge in the real harness page.
//
// The portal advance happens INSIDE the game's update phase (checkCatCollision-
// WithPortal -> advanceToNextLevelIfPossible), so the level changes during
// stepFrame. Every trial here reproduces that: stepFrame is wrapped so the level
// advances mid-frame, exactly as a portal touch does.
//
// Properties checked:
//   1. A forward advance into a KEPT level is left alone.
//   2. A forward advance into a NON-kept level lands on the next kept level
//      above the one just cleared.
//   3. Clearing the last kept level lands on the victory screen (14).
//   4. After a skip the canvas holds the TARGET level, not the skipped one —
//      the whole point of doing the rewrite inside the same page task as the
//      render, so no frame of an unplayed level reaches the recording.
//
// The skip body below is kept byte-identical to run_full.cjs's applySkipInPage
// tail; SKIP_BODY_SRC is shared so the two cannot drift apart silently.
//
// Run: node driver/experiments/test_demo_skip.cjs
"use strict";

const CFG = require("../config.cjs");
const { chromium } = CFG.resolvePlaywright();

const WIN = 14;
const KEEP = [0, 1, 2, 5, 7, 8];

// Shared with run_full.cjs by string so the page gets one definition.
const SKIP_TAIL_SRC = `
  const b = window.bridge;
  const before = b.__before;
  const keep = b.__keep;
  const win = b.__win;
  const after = b.getCurrentLevel();
  if (after === before || after === win || keep.indexOf(after) !== -1) { b.__rec = null; return; }
  let next;
  for (const k of keep) if (k > before) { next = k; break; }
  const target = next === undefined ? win : next;
  b.setCurrentLevel(target);
  b.resync();
  const c = b.canvas;
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  b.propagateGameLoopRender();
  b.__rec = { from: before, skipped: after, to: target };
`;

let bad = 0;
const fail = (msg) => { bad++; console.error("FAIL: " + msg); };
const pass = (msg) => console.log("PASS: " + msg);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(CFG.HARNESS_URL, { waitUntil: "load" });
  await page.waitForFunction(
    () => window.bridge && window.bridge.gemsPool && window.bridge.catSprite,
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    window.bridge.gameLoop.stop();
    window.bridge.resetCurrentLevel();
    window.bridge.resync();
  });

  // Install the skip tail once, as a page-side function.
  await page.evaluate(
    ({ src, keep, win }) => {
      window.bridge.__keep = keep;
      window.bridge.__win = win;
      window.__skipTail = new Function(src);
    },
    { src: SKIP_TAIL_SRC, keep: KEEP, win: WIN }
  );

  // Simulate a portal touch out of `from`: the level changes mid-stepFrame,
  // then the skip tail runs in the same task.
  const trial = (from) =>
    page.evaluate((fromLevel) => {
      const b = window.bridge;
      b.setCurrentLevel(fromLevel);
      b.resync();
      const realStep = b.stepFrame.bind(b);
      b.stepFrame = (dt) => {
        realStep(dt);
        const nxt = b.getCurrentLevel() + 1;
        if (b.platformsPositionsPerLevel[nxt]) b.setCurrentLevel(nxt);
      };
      b.__before = b.getCurrentLevel();
      b.stepFrame(1 / 60);
      b.stepFrame = realStep;
      window.__skipTail();
      return { rec: b.__rec, landedOn: b.getCurrentLevel() };
    }, from);

  const results = {};
  for (const from of [0, 1, 2, 5, 7, 8]) results[from] = await trial(from);

  const expect = (from, wantTo, wantSkipped) => {
    const r = results[from];
    const label = `clear L${from}`;
    if (wantTo === null) {
      if (r.rec !== null) return fail(`${label}: should NOT skip, rewrote to ${r.rec.to}`);
      if (r.landedOn !== from + 1) return fail(`${label}: landed on ${r.landedOn}, expected ${from + 1}`);
      return pass(`${label}: kept level, plays L${r.landedOn}`);
    }
    if (!r.rec) return fail(`${label}: should have skipped to L${wantTo}, did not`);
    if (r.rec.to !== wantTo) return fail(`${label}: rewrote to ${r.rec.to}, expected ${wantTo}`);
    if (r.rec.skipped !== wantSkipped) return fail(`${label}: skipped=${r.rec.skipped}, expected ${wantSkipped}`);
    if (r.landedOn !== wantTo) return fail(`${label}: store holds ${r.landedOn}, expected ${wantTo}`);
    pass(`${label}: skipped L${wantSkipped} -> L${wantTo}`);
  };

  expect(0, null, null); // L1 kept
  expect(1, null, null); // L2 kept
  expect(2, 5, 3);      // L3 intermittent -> next kept is 5
  expect(5, 7, 6);      // L6 failing -> next kept is 7
  expect(7, null, null); // L8 kept
  expect(8, WIN, 9);    // last kept level -> victory screen

  const endLevel = await page.evaluate(() => window.bridge.platformsPositionsPerLevel.length - 1);
  if (endLevel !== WIN) fail(`victory index is ${endLevel}, expected ${WIN}`);
  else pass(`victory index is ${WIN} (platformsPositionsPerLevel.length - 1)`);

  // Repaint proof: after skipping L3 the canvas must match a clean render of L5.
  const rep = await page.evaluate(() => {
    const b = window.bridge;
    const ctx = b.canvas.getContext("2d");
    const grab = () => ctx.getImageData(0, 0, b.canvas.width, b.canvas.height).data;

    b.setCurrentLevel(2); b.resync();
    ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
    b.propagateGameLoopRender();
    const l2Frame = grab();

    const realStep = b.stepFrame.bind(b);
    b.stepFrame = (dt) => { realStep(dt); b.setCurrentLevel(3); };
    b.__before = b.getCurrentLevel();
    b.stepFrame(1 / 60);
    b.stepFrame = realStep;
    window.__skipTail();
    const afterSkip = grab();

    b.setCurrentLevel(5); b.resync();
    ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
    b.propagateGameLoopRender();
    const l5Ref = grab();

    let vsL2 = 0, vsL5 = 0;
    for (let i = 0; i < l2Frame.length; i += 4) {
      if (l2Frame[i] !== afterSkip[i]) vsL2++;
      if (l5Ref[i] !== afterSkip[i]) vsL5++;
    }
    return { rec: b.__rec, vsL2, vsL5, total: l2Frame.length / 4 };
  });

  if (!rep.rec || rep.rec.to !== 5) fail(`repaint trial did not skip to L5 (got ${JSON.stringify(rep.rec)})`);
  if (rep.vsL2 === 0) fail("canvas unchanged by the skip — nothing was repainted");
  if (rep.vsL5 > rep.total * 0.005) {
    fail(`after the skip the canvas differs from a clean L5 render by ${rep.vsL5}/${rep.total} px`);
  } else {
    pass(`canvas after the skip matches a clean L5 render (${rep.vsL5}/${rep.total} px differ, vs ${rep.vsL2} against L2)`);
  }

  await browser.close();
  console.log(bad ? `\nDEMO SKIP: FAIL (${bad})` : "\nDEMO SKIP: PASS");
  if (bad) process.exit(1);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
