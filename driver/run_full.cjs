// Full continuous ladder run: clear levels 0..13 in ONE session, resetting only
// on death. The classifier makes every movement decision (objective -> move).
// No pathfinder, no scripted fallback, no per-level hand-holding.
//
// Per-level death cap: if a level exceeds MAX_DEATHS_PER_LEVEL, STOP and report
// the level, the state at each death, and what the model chose.
//
// Evidence: a screenshot at every level transition and one of the level-14
// victory screen. The bridge's clearRect fix makes these readable.
//
// Usage: node driver/run_full.cjs [demo|local]

"use strict";

const fs = require("fs");
const CFG = require("./config.cjs");
const { chromium } = CFG.resolvePlaywright();
const { makeClient, makeHalogenClient, makeQwenLocalClient, makeHalogenLogprobsClient } = require("./jev.cjs");
const { decide, layaDecide, halogenDecide } = require("./decision.cjs");
const { stepBatch } = require("./cadence.cjs");
const { heldActionIsSafe } = require("./arc.cjs");
const { VISIT_WINDOW } = require("./decision.cjs");
const { installFlush, deathEntries, unwinnableDeath, buildFlags } = require("./run_stats.cjs");
const { STALL_WINDOW } = require("./stall_window.cjs");

const URL = CFG.HARNESS_URL;
const DT = 1 / 60;
const K = 6;
// Opt-in overrides for a recording run, where the point is one continuous take
// of the whole ladder and a level may legitimately need more lives or frames
// than a measurement run budgets. Defaults are the measurement values, untouched.
const MAX_TOTAL_STEPS = Number(process.env.MAX_TOTAL_STEPS || 40000);

// DEMO_KEEP_LEVELS: comma-separated level indices the ladder is allowed to play.
// Used for the demo recording of the levels the classifier clears reliably, so
// the run can reach the level-14 victory screen without grinding through the
// levels it is known to fail.
//
// The levels are SKIPPED, not deleted. The game's own portal advance still fires
// into N+1; the driver immediately re-points the level store at the next kept
// level (or at the victory screen once the last kept level is cleared) and
// repaints. Skipping rather than splicing the config arrays is deliberate:
//   - `cat-goric-game` is a submodule pinned to the archived upstream and is
//     read-only by construction, and
//   - renumbering would make the in-game "QUADRANT:" label lie about which
//     level is on screen, and would desync every driver-side structure indexed
//     by the original level index (level_data.cjs, reachability, the prompts).
// The skipped levels are recorded in the run JSON so the recording's provenance
// says exactly what was not played.
const DEMO_KEEP = process.env.DEMO_KEEP_LEVELS
  ? process.env.DEMO_KEEP_LEVELS.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n))
  : null;
const WIN_LEVEL = 14;

// Demo runs get a higher per-level death cap by default. The cap is a diagnostic
// abort, not a game rule: its job is to stop a measurement run burning hours on
// one level. A recording has a different failure mode to protect against — the
// camera stopping before the win screen — and a level that clears on the 12th
// attempt is still a level that cleared. The measurement default is untouched.
// Declared after DEMO_KEEP: referencing it earlier is a temporal-dead-zone error.
const MAX_DEATHS_PER_LEVEL = DEMO_KEEP
  ? Number(process.env.DEMO_MAX_DEATHS_PER_LEVEL || 25)
  : Number(process.env.MAX_DEATHS_PER_LEVEL || 10);


// HEADED=1 runs a visible window; chrome-headless-shell cannot run headed, so
// CHROME must then point at a full Chromium. The viewport is only a CSS-scale
// concern: fitCanvasInsideItsParent sets style.* only and never touches
// canvas.width/height, so the 360x360 backing store (and thus all drone geometry
// and deadlines) is unchanged.
const HEADED = process.env.HEADED === "1";
// undefined lets Playwright pick its own bundled browser; CHROME overrides.
const EXEC = CFG.browserExecutablePath();
// 1280x720: the game pane is 720px = exactly 2x the 360px canvas backing store,
// leaving 560px for the decision panel. Roughly half the pixels of 1440x900.
const VIEWPORT = { width: 1280, height: 720 };
// Pure wall-clock sleep between stepFrame calls so a held action plays as visible
// motion. It changes NO frame count, NO dt, NO action, NO state the model sees.
const STEP_DELAY_MS = HEADED ? 16 : (DEMO_KEEP ? 16 : 0);
// Demo runs step with a 16ms wall-clock delay even headless. With 0 delay a
// 6-frame batch completes in ~10ms, which the 25fps recorder collapses into
// roughly one video frame: the cat teleports between decision points. The delay
// is pure wall clock — it changes no frame count, no dt, no action and no state
// the model sees, exactly as HEADED's delay does.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENDPOINTS = {
  laya: {
    kind: "jev",
    baseUrl: CFG.SIMPLE_JEV_BASE_URL,
    model: "convaiinnovations/laya",
    minIntervalMs: 0,
    decide: layaDecide,
  },
  demo: {
    kind: "jev",
    baseUrl: CFG.DEMO_BASE_URL,
    model: "featherless-ai/Qwen3.8-27B-classifier",
    minIntervalMs: 600,
    decide,
  },
  // Hosted Decisions service, native System One format. Base URL and key load
  // on first access (config.cjs), so other endpoints never need them.
  clef: {
    kind: "jev",
    get baseUrl() {
      return CFG.DECISIONS_BASE_URL;
    },
    path: "/v1/systemone",
    get auth() {
      return CFG.DECISIONS_API_KEY;
    },
    model: "clef",
    minIntervalMs: 0,
    decide,
  },
  // halogen-flash-server 0.13.8 scores a label from top_logprobs in one forward
  // pass, so this endpoint now runs the SAME policy as every other classifier
  // (decide), not the menu-letter fallback. baseUrl has no /v1: the logprobs
  // client appends it.
  halogen: {
    kind: "halogen-logprobs",
    baseUrl: CFG.LLAMA_BASE_URL,
    model: "Halogen-Qwen3.8-Flash-Next-Instruct",
    minIntervalMs: 0,
    decide,
  },
  // The pre-0.13.8 path: generate a menu letter and parse it. Kept because the
  // comparison against a real classifier interface is the interesting result.
  halogen_menu: {
    kind: "halogen",
    baseUrl: `${CFG.LLAMA_BASE_URL}/v1`,
    model: "Halogen-Qwen3.8-Flash-Next-Instruct",
    minIntervalMs: 0,
    decide: halogenDecide,
  },
  qwen_local: {
    kind: "qwen-local",
    baseUrl: CFG.LLAMA_BASE_URL,
    model: "Qwen3.8-27B-Instruct",
    minIntervalMs: 0,
    decide,
  },
  qwen_small: {
    kind: "qwen-local",
    baseUrl: CFG.LLAMA_BASE_URL,
    model: "Qwen3.5-0.8B-Instruct",
    minIntervalMs: 0,
    decide,
  },
};

const r2 = (n) => Math.round(n * 100) / 100;
const SHOT_DIR = CFG.outPath("shots");
const VIDEO_DIR = CFG.outPath("video");

(async () => {
  const which = process.argv[2] || "laya";
  const ep = ENDPOINTS[which];
  if (!ep) {
    console.error(`unknown endpoint '${which}'`);
    process.exit(1);
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const client =
    ep.kind === "halogen-logprobs"
      ? makeHalogenLogprobsClient({ baseUrl: ep.baseUrl, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: (m) => console.log("    [halogen-lp] " + m) })
      : ep.kind === "halogen"
      ? makeHalogenClient({ baseUrl: ep.baseUrl, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: () => {} })
      : ep.kind === "qwen-local"
      ? makeQwenLocalClient({ baseUrl: ep.baseUrl, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: () => {} })
      : makeClient({ baseUrl: ep.baseUrl, path: ep.path, auth: ep.auth, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: () => {} });
  const decideFn = ep.decide;

  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED, executablePath: EXEC });
  // Video can only be recorded on a CONTEXT, not a page. The video file is only
  // finalised when the CONTEXT closes, so we must close the context (and read the
  // path) before browser.close() or the file is zero-byte / missing.
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  if (HEADED) await page.bringToFront();
  // Video epoch hint for the editor pipeline. Date.now() is the SAME clock the
  // screencast is stamped with (playwright-core videoRecorder.ts sets
  // _creationTimeMs = Date.now() and writes each frame at
  // frameSwapWallTime - _creationTimeMs, with frameSwapWallTime anchored to
  // Date.now() on the first frame), and it writes that zero point into the file
  // as the `creation_time` tag. The tag is authoritative and the editor reads
  // it; this is the fallback, and it lands slightly LATE because the recorder is
  // constructed inside newPage() before this line runs.
  const videoEpochHintMs = Date.now();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      window.bridge &&
      window.bridge.gemsPool &&
      window.bridge.gemsPool.getAliveObjects().length === 3 &&
      window.bridge.catSprite.x !== 0,
    { timeout: 15000 }
  );

  // Stop the wall-clock loop; start on a clean level 0.
  await page.evaluate(() => {
    window.bridge.gameLoop.stop();
    window.bridge.resetCurrentLevel();
    window.bridge.resync();
  });

  const readState = () => page.evaluate(() => window.bridge.getState());
  // DEMO_KEEP rewrites the level transition inside the SAME page task as the
  // step. Doing it in a separate evaluate would let the compositor present the
  // frame the game painted for the skipped level, putting a flash of a level we
  // never played into the recording. Here the game advances into N+1, we
  // re-point the store at the next kept level, and repaint before JS yields, so
  // only the kept level is ever presented.
  const skipPayload = () => ({ dt: DT, keep: DEMO_KEEP, win: WIN_LEVEL });
  const applySkipInPage = ({ dt, keep, win }) => {
    const b = window.bridge;
    const before = b.getCurrentLevel();
    b.stepFrame(dt);
    if (!keep) return null;
    const after = b.getCurrentLevel();
    if (after === before || after === win || keep.indexOf(after) !== -1) return null;
    // Forward advance into a level the demo does not play. Land on the next kept
    // level above the one just cleared, or on the victory screen if none is left.
    let next;
    for (const k of keep) if (k > before) { next = k; break; }
    const target = next === undefined ? win : next;
    b.setCurrentLevel(target);
    b.resync();
    const c = b.canvas;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    b.propagateGameLoopRender();
    return { from: before, skipped: after, to: target };
  };
  const stepOnce = async () => {
    if (DEMO_KEEP) {
      const rec = await page.evaluate(applySkipInPage, skipPayload());
      if (rec) {
        demoSkips.push({ ...rec, wallMs: Date.now(), step: steps + 1 });
        console.log(
          `  [DEMO SKIP] cleared level ${rec.from}; level ${rec.skipped} is not in the kept set -> ` +
            (rec.to === WIN_LEVEL ? "victory screen" : `level ${rec.to}`)
        );
        // Refresh the panel's stats to the level now on screen. Without this the
        // "Level" readout keeps the PREVIOUS level's value for the whole of the
        // next model call (~2s), so the canvas says QUADRANT: F while the
        // sidebar says Level 2. Passing only the stat fields leaves the
        // probability bars untouched: harness.html re-renders the bars only
        // when the payload carries objective/move data.
        await page
          .evaluate((lv) => {
            if (window.overlay) {
              window.overlay.thinking(true);
              window.overlay.update({ level: lv, gems: 0, deaths: 0, movingFrames: 0 });
            }
          }, rec.to === WIN_LEVEL ? WIN_LEVEL : rec.to)
          .catch(() => {});
        return rec;
      }
    } else {
      await page.evaluate((dt) => window.bridge.stepFrame(dt), DT);
    }
    if (STEP_DELAY_MS) await sleep(STEP_DELAY_MS);
    return null;
  };
  const setAction = (a) => page.evaluate((act) => window.bridge.setAction(act), a);
  const doReset = async () => {
    await page.evaluate(() => {
      window.bridge.resetCurrentLevel();
      window.bridge.resync();
    });
    // Every reset starts a fresh attempt, so revisit evidence must not carry over.
    visitCounts.clear();
    visitWin.length = 0;
    decideMemo.lockedObjective = null;
  };
  const levelGemsFor = (li) =>
    page.evaluate((i) => window.bridge.gemsPositionsPerLevel[i], li);
  const shot = async (name) => {
    try {
      await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
    } catch (e) {
      console.log("  [screenshot failed: " + e.message + "]");
    }
  };

  const movingFrames = (s) => (s.drones.tl.y - 1) / 0.2;

  // Per-level accumulators.
  const levels = {};
  const ensureLevel = (li) => {
    if (!levels[li])
      levels[li] = {
        level: li,
        decisions: 0,
        calls: 0,
        deaths: 0,
        maxMovingFrames: 0,
        peakGemsCollected: 0,
        deathLog: [],
        decisionsLog: [],
        levelStartWallMs: null,
      };
    return levels[li];
  };

  let steps = 0;
  let totalCalls = 0;
  let classifierMs = 0; // total time inside decideFn (classifier latency)
  let stepMs = 0; // total time in stepOnce + readState (our stepping overhead)
  let won = false;
  let stopped = null; // reason if we stop early
  let lastLevel = 0;
  // Video timeline stamps, in epoch ms. Date.now() is the clock the screencast
  // uses (see videoEpochHintMs), so levelStartWallMs / victoryWallMs /
  // decisionsLog[].wallMs are directly comparable with the recording's own
  // creation_time. The transitions array is what the editor needs most: this is
  // ONE continuous video, so level boundaries are not file boundaries and exist
  // only here. One Date.now() per decision is already the norm here (_t0/_lat),
  // so the extra calls cannot perturb the decision loop's timing.
  const transitions = [];
  // Levels the demo skipped over, recorded so the recording's provenance says
  // exactly which levels were never played.
  const demoSkips = [];
  let victoryWallMs = null;
  let endWallMs = null;

  // Per-ladder death history: observable record of the model's own prior
  // (position, action) pairs that led to death, fed back into the state so a
  // deterministic retry sees a different input. Reset on each level transition.
  // STORE cap bounds the whole store; the render cap (DEATH_HISTORY_SHOWN=3 in
  // decision.cjs) limits lines per position in the prompt. Do not conflate them.
  const deathHistory = [];
  // Per-attempt revisit counts; see run_level.cjs for why this clears on reset.
  const visitCounts = new Map();
  // Carries the objective across a jump arc. decide() re-asks the objective only
  // while the cat is grounded: the airborne prompt loses the reachability
  // annotations (platformKeyUnder stops resolving a few frames into a jump), so
  // re-asking mid-arc swaps a well-informed choice for the nearest-gem default
  // and the steer that follows cancels the jump. Cleared on every reset.
  const decideMemo = { lockedObjective: null };
  const visitWin = [];
  const DEATH_HISTORY_STORE = 40;
  // Incremental result flush via the shared run_stats helper: a wall-clock
  // timeout (SIGTERM) or a crash must NOT discard the structured results. Shared
  // with run_level.cjs so the flush-on-timeout cannot exist in one and not the
  // other. We track the last observed state and flush after every decision.
  let lastState = { level: 0 };
  const flushJson = installFlush(CFG.outPath(`run_full_${which}.json`), () => ({
    which,
    build: buildFlags(),
    won,
    finalLevel: lastState.level,
    steps,
    totalCalls,
    stopped,
    levels,
    transitions,
    demoSkips,
    video: {
      recorded: true,
      epochHintMs: videoEpochHintMs,
      victoryWallMs,
      endWallMs,
      // Playwright appends one final duplicate frame held for >=1000ms when the
      // context closes (videoRecorder.ts _stop), so the editor predicts
      // duration_ms = (endWallMs - creation_time) + 1040 and compares it with
      // ffprobe. Agreement to a few tens of ms validates every stamp in this file.
    },
    timing: { classifierMs, stepMs, decisions: Object.values(levels).reduce((a, L) => a + L.decisions, 0) },
  }), { exitOnSignal: false }); // graceful: signal flushes but does NOT exit, so the loop can break and finalise the video
  // Oscillation-aware stall detector. Catches both same-state repetition AND a
  // 2-cycle (A,B,A,B) where the cat treads water without dying or collecting.
  // Over a sliding window of the last STALL_WINDOW decision signatures, if the
  // number of DISTINCT rounded positions is <= STALL_MAX_DISTINCT, it is a stall.
  const STALL_MIN_PROGRESS_PX = 8; // best distance-to-objective must improve by more than this over the window
  const stallWindow = [];
  let lastChosen = null; // { key, action } of the most recent decision
  let lastGrounded = null; // { key, action } of the most recent GROUNDED (launch) decision
  const posKey10 = (x, y) =>
    `${Math.round(x / 10) * 10},${Math.round(y / 10) * 10}`;
  const recordDeath = (chosen, pre, launch) => {
    if (!chosen) return;
    let cause = "fell out of bounds or was hit by the laser";
    if (pre && pre.oob) cause = "fell out of bounds below y=310";
    else if (pre && pre.laser) cause = "was hit by the laser";
    // Also blames the grounded decision that launched the arc; see deathEntries.
    deathHistory.push(...deathEntries(chosen, launch, cause));
    while (deathHistory.length > DEATH_HISTORY_STORE) deathHistory.shift();
  };

  // Screenshot the initial level 0 start.
  await shot("level00_start");

  // Graceful stop: a SIGTERM/SIGINT (e.g. from `timeout`) sets the flag instead of
  // killing us mid-decision, so the loop breaks and the video is finalised via
  // context.close() at the normal end-of-run path. Without this, a timeout leaves a
  // zero-duration, unplayable webm.
  let stopRequested = false;
  const onStop = () => { stopRequested = true; console.log("\n[stop signal received — finishing gracefully and finalising video]"); };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);

  while (steps < MAX_TOTAL_STEPS) {
    if (stopRequested) { stopped = { level: (lastState && lastState.level), reason: "stop_requested" }; break; }
    // The death handler and the classifier-failure path set `stopped` from inside
    // helpers that cannot break this loop themselves. Without this check the
    // MAX_DEATHS_PER_LEVEL cap never stopped anything: a run once reached 178
    // deaths on one level and burned two hours.
    if (stopped) break;
    const s = await readState();
    lastState = s;

    // Victory: reached the level-14 victory screen.
    if (s.level === 14) {
      victoryWallMs = Date.now();
      await shot("level14_VICTORY");
      won = true;
      // Hold the win screen on camera. The game loop is stopped and the driver
      // steps by hand, so without this the recording would cut away within a
      // frame or two of "CATEGORIC ESCAPE!" appearing. Render-only, no update,
      // so no frame of game state is added. Demo runs only: the non-demo path is
      // left exactly as it was.
      if (DEMO_KEEP) {
        const until = Date.now() + 6000;
        while (Date.now() < until) {
          await page.evaluate(() => {
            const c = window.bridge.canvas;
            c.getContext("2d").clearRect(0, 0, c.width, c.height);
            window.bridge.propagateGameLoopRender();
          });
          await sleep(50);
        }
      }
      break;
    }

    // A BACKWARD jump is the game restarting, not progress up the ladder. Treat it
    // as a stop rather than rolling accumulators as though a new level had been
    // reached: run_level.cjs reported "level 4 CLEARED -> advanced to level 0"
    // with 1 of 3 gems before the same check was added there.
    if (s.level < lastLevel) {
      stopped = { level: lastLevel, reason: "restarted", message: `game jumped back from level ${lastLevel} to level ${s.level}; this is a restart, not a clear` };
      console.log(`  [RESTART] game went back from level ${lastLevel} to level ${s.level}. Stopping.`);
      break;
    }

    // Level transition: capture evidence, roll accumulators, and CLEAR the death
    // history — it is per-level; a new level has different geometry.
    if (s.level !== lastLevel) {
      // PRECONDITION (standing L0 regression gate): L0 must clear at 0 deaths.
      // It has held 0 deaths / 5 decisions for many runs; any policy/state change
      // that costs L0 its clean clear is a bad trade and must NOT proceed to the
      // ladder. Block and report rather than measuring a ladder on a broken base.
      if (lastLevel === 0 && levels[0] && levels[0].deaths > 0) {
        stopped = { level: 0, reason: "L0_regression_gate", message: `L0 cleared with ${levels[0].deaths} death(s) (expected 0). Ladder blocked.` };
        console.log(`  [L0 REGRESSION GATE] L0 cleared with ${levels[0].deaths} death(s), expected 0. Blocking ladder. ${levels[0].deaths} death(s), ${levels[0].decisions} decisions.`);
        break;
      }
      await shot(`level${String(s.level).padStart(2, "0")}_entry`);
      deathHistory.length = 0;
      visitCounts.clear();
      visitWin.length = 0;
      decideMemo.lockedObjective = null;
      // Reset the cross-decision trackers too. Without this, the first death on a
      // new level can be attributed to a launch decision taken on the PREVIOUS
      // level (lastChosen/lastGrounded), and the stall detector starts the new
      // level with a window full of the old level's positions. Both are incorrect
      // on their own terms even if small in effect.
      lastChosen = null;
      lastGrounded = null;
      stallWindow.length = 0;
      lastLevel = s.level;
      // One continuous video, so the editor cannot get level boundaries from the
      // file list. This is the only place they are recorded.
      const levelStartWallMs = Date.now();
      transitions.push({ level: s.level, wallMs: levelStartWallMs, step: steps });
      ensureLevel(s.level).levelStartWallMs = levelStartWallMs;
    }

    const L = ensureLevel(s.level);

    // Unwinnable: cannot reach 3 gems. Reset (counts as a death), no model call.
    if (s.gemsCollected + s.aliveGems < 3) {
      L.deaths += 1;
      // The reset burns a life, so it must reach deathHistory, or every life
      // replays the identical route that let the gem burn. Blame rule shared
      // with run_level.cjs through run_stats.unwinnableDeath.
      const w = unwinnableDeath(s, lastGrounded, posKey10(s.cat.x, s.cat.y));
      deathHistory.push(...deathEntries(w, null, w.cause));
      while (deathHistory.length > DEATH_HISTORY_STORE) deathHistory.shift();
      L.deathLog.push({
        wallMs: Date.now(),
        step: steps,
        reason: "unwinnable",
        key: w.key,
        action: w.action,
        cause: w.cause,
        collected: s.gemsCollected,
        alive: s.aliveGems,
        cat: { x: r2(s.cat.x), y: r2(s.cat.y) },
        movingFrames: r2(movingFrames(s)),
      });
      console.log(
        `  [L${s.level} unwinnable @ step ${steps}] collected=${s.gemsCollected} alive=${s.aliveGems} -> reset (death ${L.deaths})`
      );
      if (L.deaths >= MAX_DEATHS_PER_LEVEL) {
        stopped = { level: s.level, reason: "death_cap_unwinnable" };
        break;
      }
      await doReset();
      // The next life starts airborne at the spawn: a later failure must not be
      // blamed on this life's route, same rule as the death handler.
      lastChosen = null;
      lastGrounded = null;
      continue;
    }

    const levelGems = await levelGemsFor(s.level);

    // Decision point.
    L.decisions += 1;
    let d;
    try { await page.evaluate(() => window.overlay && window.overlay.thinking(true)); } catch (_) {}
    const _t0 = Date.now();
    try {
      const visitKey = `${Math.round(s.cat.x / 10) * 10},${Math.round(s.cat.y / 10) * 10}`;
      // Sliding window: visitCounts holds the last VISIT_WINDOW decision
      // positions, so a revisit means "stuck here NOW", not "passed through here
      // earlier in a long level". See VISIT_WINDOW in decision.cjs.
      visitWin.push(visitKey);
      if (visitWin.length > VISIT_WINDOW) visitWin.shift();
      visitCounts.clear();
      for (const k of visitWin) visitCounts.set(k, (visitCounts.get(k) || 0) + 1);
      d = await decideFn(client, s, levelGems, () => {}, deathHistory, visitCounts, decideMemo);
    } catch (e) {
      if (e && e.name === "HalogenParseError") {
        // One malformed response must not end a fifteen-level ladder. Record it as
        // a failed decision at this position (feeds exploration) and continue.
        const key = posKey10(s.cat.x, s.cat.y);
        deathHistory.push({ key, action: "(malformed)", cause: `model response unparseable: ${e.raw}` });
        while (deathHistory.length > DEATH_HISTORY_STORE) deathHistory.shift();
        console.log(`  [L${s.level} PARSE-FAIL @ step ${steps}] recorded failed decision at ${key}; continuing. ${e.message}`);
        continue;
      }
      console.log(`  [classifier FAILED @ L${s.level} step ${steps}, pausing] ${e.message}`);
      stopped = { level: s.level, reason: "classifier_failed", message: e.message };
      break;
    }
    totalCalls += d.calls;
    L.calls += d.calls;
    const _lat = Date.now() - _t0;
    classifierMs += _lat; // classifier latency for this decision
    try {
      await page.evaluate((data) => {
        if (window.overlay) { window.overlay.thinking(false); window.overlay.update(data); }
      }, {
        level: s.level,
        gems: s.gemsCollected,
        deaths: L.deaths,
        movingFrames: r2(movingFrames(s)),
        countdown: s.framesUntilLaserAtCat != null ? Math.round(s.framesUntilLaserAtCat) : null,
        objective: { question: d.objectiveQuestion, probs: d.objectiveProbs, chosen: d.objective },
        move: { question: d.moveQuestion, probs: d.moveProbs, chosen: d.move },
        policyMode: d.policyMode || "ARGMAX",
        // decide() reports samplingTemperature/priorDeathsHere, layaDecide() reports
        // temperatureUsed/priorDeathsAtPosition. Reading only one renders blank on
        // the other path, which is what the ladder videos were doing.
        temperature: d.samplingTemperature != null ? d.samplingTemperature : d.temperatureUsed,
        priorDeaths: d.priorDeathsHere != null ? d.priorDeathsHere : d.priorDeathsAtPosition,
        latencyMs: _lat,
      });
    } catch (_) {}
    // Taken after the overlay update returns, so it is the moment the bars are on
    // screen — the frame the editor holds. Must come BEFORE flushJson() below:
    // that is a synchronous whole-file write whose duration grows with the log.
    // One screencast period (40ms at 25fps) of quantisation sits between this and
    // the frame that shows them.
    const decisionWallMs = Date.now();
    flushJson(); // persist progress after every decision so a cutoff keeps it
    // Livelock detection by PROGRESS, not position. Track the best (smallest)
    // straight-line distance to the current objective. If that best has not
    // improved over a window of decisions, the cat is stuck — whether it is
    // twitching in place or wandering a hundred px along a floor without ever
    // getting closer. A non-improving distance is what "stuck" actually means,
    // and it catches the wide wander the old position-displacement signal missed.
    const distToObj = Math.hypot(d.targetPos.x - s.cat.x, d.targetPos.y - s.cat.y);
    stallWindow.push({ key: posKey10(s.cat.x, s.cat.y), dist: distToObj });
    if (stallWindow.length > STALL_WINDOW) stallWindow.shift();
    if (stallWindow.length === STALL_WINDOW) {
      const bestNow = Math.min(...stallWindow.map((w) => w.dist));
      // Has the best distance improved by a meaningful margin over the window?
      // Compare the window's best against the distance at the window's start.
      const startDist = stallWindow[0].dist;
      const improved = startDist - bestNow;
      if (improved <= STALL_MIN_PROGRESS_PX) {
        // Record ONE failure per DISTINCT key per stall event (escalate by 1 per
        // key per event, like a repeated death — not jump to the T cap).
        const cause = `no progress toward ${d.objective} (best distance not improving over ${STALL_WINDOW} decisions)`;
        const seen = new Set();
        for (const w of stallWindow) {
          if (seen.has(w.key)) continue;
          seen.add(w.key);
          deathHistory.push({ key: w.key, action: d.move, cause });
        }
        while (deathHistory.length > DEATH_HISTORY_STORE) deathHistory.shift();
        const mf = movingFrames(s);
        console.log(
          `  [L${s.level} STALL @ step ${steps}] no progress toward ${d.objective} (improved ${Math.round(improved)}px over ${STALL_WINDOW} decisions) -> recorded 1 failure per distinct key (${seen.size}), exploration takes over; movingFrames used ${Math.round(mf)}`
        );
        stallWindow.length = 0;
        // Do NOT reset: let the now-stochastic policy break the loop in place.
      }
    }
    L.decisionsLog.push({
      wallMs: decisionWallMs,
      step: steps,
      cat: { x: r2(s.cat.x), y: r2(s.cat.y) },
      onPlatform: s.onPlatform,
      movingFrames: r2(movingFrames(s)),
      objective: d.objective,
      presentedOrder: d.presentedOrder,
      chosenPosition: d.presentedOrder ? d.presentedOrder.indexOf(d.objective) : null,
      move: d.move,
      moveProbs: d.moveProbs,
    });
    console.log(
      `  L${s.level} step ${String(steps).padStart(4)} obj=${String(d.objective).padEnd(7)} ` +
        `move=${String(d.move).padEnd(10)} cat=(${r2(s.cat.x)},${r2(s.cat.y)}) ` +
        `${s.onPlatform ? "ground" : "air"} mf=${r2(movingFrames(s))} ` +
        `jp=${(d.moveProbs[d.move] || 0).toFixed(2)}`
    );

    await setAction(d.move);
    lastChosen = { key: posKey10(s.cat.x, s.cat.y), action: d.move };
    // Track the last GROUNDED decision separately: that is the one that LAUNCHES
    // an airborne arc. A death mid-arc must be attributed here too, not only to
    // the last mid-air tweak, or the launch key never accumulates a prior death
    // and exploration never activates where the causal choice was made.
    if (s.onPlatform) lastGrounded = { key: posKey10(s.cat.x, s.cat.y), action: d.move };

    // Execute the chosen move, then return to the top to RE-DECIDE.
    //  - Grounded + jump: step 1 to launch, then switch to the airborne cadence.
    //  - Grounded, no jump: step K frames.
    //  - Airborne: step AIR_REDECIDE_FRAMES, then re-decide, so the model can
    //    steer onto a platform instead of committing at launch. The jump question
    //    is already filtered out while airborne (legalActions), so this is one
    //    cheap direction-only call per 3 frames.
    await stepBatch({
      grounded: s.onPlatform,
      isJump: d.move.includes("jump"),
      K,
      step: async () => {
        const _s0 = Date.now();
        const skipped = await stepOnce();
        steps += 1;
        const cur = await readState();
        stepMs += Date.now() - _s0;
        L.maxMovingFrames = Math.max(L.maxMovingFrames, movingFrames(cur));
        L.peakGemsCollected = Math.max(L.peakGemsCollected, cur.gemsCollected);
        // A demo skip ends the batch: the cat is at a brand-new level's spawn and
        // the held portal action must not be carried into it.
        if (skipped) return { done: true };
        if (await handleEvent(cur)) return { done: true };
        if (steps >= MAX_TOTAL_STEPS) return { done: true };
        return { done: false, airborne: !cur.onPlatform, snap: cur };
      },
      holdIsSafe: (c2) => heldActionIsSafe(c2, d.move),
    });
  }

  // Handle a death/advance/win event observed after a step. Returns true if the
  // current decision's execution should stop (event consumed).
  async function handleEvent(cur) {
    if (cur.lastEvent.type === "advance") {
      // Level cleared; the outer loop will screenshot the new level entry.
      return false; // not a stop; outer loop handles transition
    }
    if (cur.lastEvent.type === "death") {
      const L = ensureLevel(cur.level);
      L.deaths += 1;
      const pre = cur.lastEvent.preStep || {};
      const post = cur.lastEvent.postReset || {};
      recordDeath(lastChosen, pre, lastGrounded);
      // The next life starts airborne at the spawn: a death before its first
      // grounded decision must not be blamed on this life's launch.
      lastChosen = null;
      lastGrounded = null;
      const preMF = pre.tly != null ? (pre.tly - 1) / 0.2 : null;
      L.deathLog.push({
        wallMs: Date.now(),
        step: steps,
        reason: "laser_or_bounds",
        // What the game TESTED before it reset (pre-step):
        preStep: pre,
        preMovingFrames: preMF != null ? r2(preMF) : null,
        // Post-reset spawn (what resetCat produced):
        postReset: post,
        signals: cur.lastEvent.signals,
      });
      await shot(`L${String(cur.level).padStart(2, "0")}_death${L.deaths}`);
      console.log(
        `  [L${cur.level} DEATH #${L.deaths} @ step ${steps}] ` +
          `PRE(cat=${pre.catx},${pre.cathy} dy=${pre.catdy} mf=${preMF != null ? r2(preMF) : "?"} oob=${pre.oob} laser=${pre.laser}) ` +
          `POST(cat=${post.catx},${post.cathy} mf=${r2((post.tly - 1) / 0.2)})`
      );
      if (L.deaths >= MAX_DEATHS_PER_LEVEL) {
        stopped = { level: cur.level, reason: "death_cap" };
        return true;
      }
      await doReset();
      return true;
    }
    return false;
  }

  endWallMs = Date.now();
  const finalState = await readState();

  // ---- Report ----
  console.log("\n================ FULL LADDER REPORT ================");
  console.log(`endpoint: ${which} (${ep.model})`);
  console.log(`won (reached level 14): ${won}`);
  console.log(`final level: ${finalState.level}`);
  console.log(`total steps: ${steps}`);
  console.log(`total classifier calls: ${totalCalls}`);
  console.log(`stopped early: ${stopped ? JSON.stringify(stopped) : "no"}`);
  const _dec = Object.values(levels).reduce((a, L) => a + L.decisions, 0) || 1;
  console.log(`timing: classifier ${classifierMs}ms total (${Math.round(classifierMs / _dec)}ms/decision), stepping ${stepMs}ms total (${Math.round(stepMs / Math.max(1, steps))}ms/step over ${steps} steps)`);
  console.log(`page errors: ${pageErrors.length ? pageErrors.join("; ") : "none"}`);
  console.log("\nPer-level:");
  const keys = Object.keys(levels)
    .map(Number)
    .sort((a, b) => a - b);
  for (const k of keys) {
    const L = levels[k];
    console.log(
      `  L${String(k).padStart(2)}: decisions=${String(L.decisions).padStart(3)} ` +
        `calls=${String(L.calls).padStart(3)} deaths=${String(L.deaths).padStart(2)} ` +
        `peakGems=${L.peakGemsCollected} maxMovingFrames=${r2(L.maxMovingFrames)}`
    );
  }

  flushJson();
  console.log(`\nfull log: ${CFG.outPath(`run_full_${which}.json`)}`);
  console.log(`screenshots: ${SHOT_DIR}/`);

  // Finalise the video: read the path BEFORE closing the context, then close the
  // context (which flushes the file), then the browser.
  try {
    const vpath = await page.video().path();
    await context.close();
    console.log(`video: ${vpath}`);
  } catch (e) {
    console.log(`video: unavailable (${e.message})`);
    try { await context.close(); } catch (_) {}
  }

  await browser.close();
})().catch((e) => {
  console.error("RUN ERROR:", e);
  process.exit(1);
});
