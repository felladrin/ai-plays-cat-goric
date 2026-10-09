// Classifier-driven run of a single level (default 0).
//
// The model makes EVERY movement decision via two calls (objective -> move).
// The harness only: reads observable state, renders it to text, lists legal
// actions, applies the returned move, and steps frames. No pathfinder, no
// scripted fallback, no retry-until-preferred loops.
//
// Hold policy (per operator):
//   - Grounded + jump move: launch, then hold the chosen direction through the
//     air and re-decide on LANDING (not on a timer). Mid-air the only useful
//     choice is the steering already chosen.
//   - Grounded + non-jump move: frame-skip K frames, then re-decide.
//   - Airborne at a decision point: hold until landing, then re-decide.
//   - Unwinnable (collected + aliveGems < 3): reset immediately, do not burn
//     classifier calls on a dead run.
//
// A failed classifier call throws and PAUSES the run (no silent default).
//
// Usage: node driver/run_level.cjs [demo|local] [levelIndex]

"use strict";

const fs = require("fs");
const CFG = require("./config.cjs");
const { chromium } = CFG.resolvePlaywright();
const { makeClient, makeHalogenClient, makeQwenLocalClient, makeHalogenLogprobsClient } = require("./jev.cjs");
const { decide, layaDecide, halogenDecide } = require("./decision.cjs");
const { stepBatch } = require("./cadence.cjs");
const { heldActionIsSafe } = require("./arc.cjs");
const REACH = require("./reachability.cjs");
const { matchGemsToSpawn: matchAlive } = require("./decision.cjs");
const { VISIT_WINDOW } = require("./decision.cjs");
const { installFlush, deathEntries, unwinnableDeath, buildFlags } = require("./run_stats.cjs");

// The overlay payload. decide() reports samplingTemperature/priorDeathsHere while
// layaDecide() reports temperatureUsed/priorDeathsAtPosition; read both, or the
// policy readout silently renders blank on whichever path is not the one the
// payload was written for.
function overlayPayload(s, d, deaths, mf, latencyMs) {
  return {
    level: s.level,
    gems: s.gemsCollected,
    deaths,
    movingFrames: Math.round(mf * 100) / 100,
    countdown: s.framesUntilLaserAtCat != null ? Math.round(s.framesUntilLaserAtCat) : null,
    objective: { question: d.objectiveQuestion, probs: d.objectiveProbs, chosen: d.objective },
    move: { question: d.moveQuestion, probs: d.moveProbs, chosen: d.move },
    policyMode: d.policyMode || "ARGMAX",
    temperature: d.samplingTemperature != null ? d.samplingTemperature : d.temperatureUsed,
    priorDeaths: d.priorDeathsHere != null ? d.priorDeathsHere : d.priorDeathsAtPosition,
    latencyMs,
  };
}

const URL = CFG.HARNESS_URL;
const DT = 1 / 60;
const K = 6;
const MAX_STEPS = 3000;
const MAX_DEATHS = 40;
// Per-decision pre-death frame capture. Off by default: see the decision loop.
const SHOT_PRE = process.env.SHOT_PRE === "1";

// HEADED=1: visible window with FULL Chromium (chrome-headless-shell cannot run
// headed), 900x900 viewport, 16ms wall-clock delay per step so motion is
// watchable. Changes no frame count, dt, action, or state the model sees.
const HEADED = process.env.HEADED === "1";
// undefined lets Playwright pick its own bundled browser; CHROME overrides.
// HEADED needs a full Chromium, which is what Playwright installs by default.
const EXEC = CFG.browserExecutablePath();
// VIDEO=1 records the run. Off by default: a full level is tens of MB, and the
// survey runs many levels.
//
// VIDEO must not change the viewport. It used to (`HEADED || VIDEO`), and that
// made every recording a different experiment from every measurement: the
// verdict runs at 360x360, the recordings at 1280x720. The two L7 runs of
// 2026-09-26 shared zero decisions and diverged at index 0, the recorded run
// starting 4 moving frames later from a different state (airborne at (219,152)
// against grounded at (219,164)). A recording of a run that is not the run being
// measured is not evidence about it, so the recorder now inherits whatever
// viewport the run already had, and recordVideo below takes its size from
// VIEWPORT. HEADED keeps 1280x720: a window for a human to watch is not a
// measurement path.
const VIDEO = process.env.VIDEO === "1";

// Per-frame trace, OFF by default. The bridge ALREADY records one on every
// stepFrame -- tag, catx, cathy, catdy, plus the game's own `oob` and `laser`
// kill predicates -- in a 400-entry ring, readable with getTrace(n). The driver
// never read it, so the decision log was the only window onto a run and it
// holds ONE state per decision while a decision spans many frames. That gap is
// what blocked three separate questions: why a jump departs at one x and not
// another, which kill predicate ends a fatal fall, and how many landings leave
// under a frame of column on the platform.
//
// This flag only READS that trace. It writes a SEPARATE file and never touches
// the decision log. With it unset, no array is built, no page call is made that
// is not already made, and the run is byte-identical to an untraced one.
const FRAME_TRACE = process.env.FRAME_TRACE === "1";
const VIEWPORT = HEADED ? { width: 1280, height: 720 } : { width: 360, height: 360 };
const VIDEO_DIR = CFG.outPath("video");
const STEP_DELAY_MS = HEADED ? 16 : 0;
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

(async () => {
  const which = process.argv[2] || "laya";
  const levelIndex = process.argv[3] != null ? parseInt(process.argv[3], 10) : 0;
  const ep = ENDPOINTS[which];
  if (!ep) {
    console.error(`unknown endpoint '${which}'`);
    process.exit(1);
  }

  const client =
    ep.kind === "halogen-logprobs"
      ? makeHalogenLogprobsClient({ baseUrl: ep.baseUrl, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: (m) => console.log("    [halogen-lp] " + m) })
      : ep.kind === "halogen"
      ? makeHalogenClient({ baseUrl: ep.baseUrl, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: (m) => console.log("    [halogen] " + m) })
      : ep.kind === "qwen-local"
      ? makeQwenLocalClient({ baseUrl: ep.baseUrl, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: (m) => console.log("    [qwen-local] " + m) })
      : makeClient({ baseUrl: ep.baseUrl, path: ep.path, auth: ep.auth, model: ep.model, minIntervalMs: ep.minIntervalMs, logger: (m) => console.log("    [jev] " + m) });
  const decideFn = ep.decide;

  const browser = await chromium.launch({ headless: !HEADED, executablePath: EXEC });
  // Video can only be recorded on a CONTEXT, and the file is only finalised when
  // the context closes — so when recording we must own the context explicitly.
  if (VIDEO) fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ...(VIDEO ? { recordVideo: { dir: VIDEO_DIR, size: VIEWPORT } } : {}),
  });
  const page = await context.newPage();
  if (HEADED) await page.bringToFront();
  // Video epoch hint for the editor pipeline: Date.now() is the SAME clock the
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
  // DIAG_NAV=1: log any same-document reload / navigation. Isolated runs showed
  // the level jumping to 0 mid-run (game code cannot do this; verified by a
  // 3000-frame probe that held L10/L13). A page reload resets the game store to
  // level 0, which the step loop then reads as a backward jump. Logging-only;
  // changes no frame, action, or state the model sees.
  if (process.env.DIAG_NAV === "1") {
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame())
        console.log(`  [DIAG_NAV] main-frame navigation @ ${new Date().toISOString()}: ${f.url()}`);
    });
    page.on("console", (m) => {
      if (/reload|error/i.test(m.text()) && m.type() !== "log")
        console.log(`  [DIAG_NAV] console ${m.type()}: ${m.text().slice(0, 120)}`);
    });
  }

  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      window.bridge &&
      window.bridge.gemsPool &&
      window.bridge.gemsPool.getAliveObjects().length === 3 &&
      window.bridge.catSprite.x !== 0,
    { timeout: 15000 }
  );

  // Stop the wall-clock loop. Reset to a clean slate. If a level index > 0 is
  // requested, advance the level store directly (setup, not play).
  await page.evaluate(
    async ({ levelIndex }) => {
      window.bridge.gameLoop.stop();
      window.bridge.resetCurrentLevel();
      if (levelIndex > 0) {
        // Use the level-changed path so platforms/gems/cat/drones all reset.
        window.bridge.setCurrentLevel(levelIndex);
      }
      window.bridge.resync();
      // The game loop is stopped, so the canvas still holds the last frame the
      // running game painted, which is level 0. Repaint once (render only, no
      // update) so a screenshot taken before the first stepFrame shows the level
      // actually under test instead of the one the page booted into.
      const c = window.bridge.canvas;
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
      window.bridge.propagateGameLoopRender();
    },
    { levelIndex }
  );

  const levelGemsFor = (li) =>
    page.evaluate((i) => window.bridge.gemsPositionsPerLevel[i], li);

  // Screenshots. Reasoning from coordinates alone missed things that are obvious
  // in a picture, so capture the spawn frame and the frame at every death.
  const SHOT_DIR = CFG.outPath(`shots_L${levelIndex}`);
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const shot = async (name) => {
    try {
      await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
    } catch (e) {
      console.log("  [screenshot failed: " + e.message + "]");
    }
  };

  const readState = () => page.evaluate(() => window.bridge.getState());
  const stepOnce = async () => {
    await page.evaluate((dt) => window.bridge.stepFrame(dt), DT);
    if (STEP_DELAY_MS) await sleep(STEP_DELAY_MS);
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
    lastGroundedKey = null;
    lastGroundedMove = null;
  };

  let steps = 0;
  let deaths = 0;
  let decisions = 0;
  let won = false;
  let cleared = false;
  let sawAdvance = false; // observed a level-advance event FORWARD out of the target level
  let restarted = false;  // the game jumped BACK to an earlier level: a restart, not a clear
  let reachedWin = false; // observed level index 14 (victory screen)
  let stalled = false; // livelock: few distinct positions over a window (loop/oscillation)
  // Patience, in decisions, before calling a run livelocked. This is a DIAGNOSTIC
  // abort, not a game rule, so being slow costs time and being hasty costs a level:
  // the revisit escalation needs VISIT_STUCK_THRESHOLD+1 visits to one 10px key
  // before it starts sampling, which in a two-position oscillation is ~8 decisions.
  // At 10 the abort fired first and level 2 was reported as stalled while its escape
  // hatch had had two decisions to work.
  const STALL_WINDOW = 24;
  const STALL_MAX_DISTINCT = 2;
  const stallWin = [];
  let peakMF = 0; // peak moving frames observed DURING the level (not post-reset)
  let peakCollected = 0; // peak gems collected DURING the level (not post-advance)
  const log = [];
  // Video timeline stamps, in epoch ms, so an editor can cut this run against its
  // own recording. Date.now() is the clock the screencast uses (see
  // videoEpochHintMs). One Date.now() per decision is already the norm here
  // (_t0/_lat), so one more cannot perturb the decision loop's timing.
  const deathLog = [];
  let endWallMs = null;
  // Only built when FRAME_TRACE=1. Undefined-by-default rather than an empty array
  // so an untraced run cannot accidentally serialise it.
  const frameTrace = FRAME_TRACE ? [] : undefined;
  // Per-level death history: observable record of the model's own prior
  // (position, action) pairs that led to death, fed back into the state so a
  // deterministic retry sees a different input. Capped to protect the token budget.
  const deathHistory = [];
  // Visits to each 10px position within the CURRENT attempt. Cleared on every
  // reset, because a livelock is per-attempt: carrying counts across a death
  // would make a fresh attempt start already "stuck" at its own spawn point.
  const visitCounts = new Map();
  // Carries the objective across a jump arc. decide() re-asks the objective only
  // while the cat is grounded: the airborne prompt loses the reachability
  // annotations (platformKeyUnder stops resolving a few frames into a jump), so
  // re-asking mid-arc swaps a well-informed choice for the nearest-gem default
  // and the steer that follows cancels the jump. Cleared on every reset.
  const decideMemo = { lockedObjective: null };
  const visitWin = [];
  // The last decision made from solid ground, and the move chosen there. A
  // stranding is caused by the route taken OFF a platform, so this is the key the
  // failure must be recorded against for escalation to act on the right spot.
  // Cleared with the rest of the per-attempt state on reset.
  let lastGroundedKey = null;
  let lastGroundedMove = null;
  // STORE cap (not the render cap). The render cap (DEATH_HISTORY_SHOWN=3, in
  // decision.cjs) limits lines per position in the prompt; this bounds the whole
  // store. Must be large enough that a level looping at multiple spots never evicts
  // an earlier trap while a later one accumulates.
  const DEATH_HISTORY_STORE = 40;
  // Shared flush: writes the result JSON on timeout/crash/exit, not only at the
  // end of the loop. Without this a wall-clock timeout discards the run (the
  // builder-lag pattern; run_full had it, run_level did not).
  const flush = installFlush(CFG.outPath(`run_level_${levelIndex}_${which}.json`), () => ({
    endpoint: which,
    build: buildFlags(),
    model: ep.model,
    levelIndex,
    won,
    sawAdvance,
    stalled,
    reachedWin,
    peakMovingFrames: r2(peakMF),
    peakGemsCollected: peakCollected,
    restarted,
    steps,
    deaths,
    decisions,
    log,
    deathLog,
    video: {
      recorded: VIDEO,
      epochHintMs: videoEpochHintMs,
      endWallMs,
      // Playwright appends one final duplicate frame held for >=1000ms when the
      // context closes (videoRecorder.ts _stop), so the editor predicts
      // duration_ms = (endWallMs - creation_time) + 1040 and compares it with
      // ffprobe. Agreement to a few tens of ms validates every stamp in this file.
    },
  }));
  // The game resets the level inside stepFrame, so by the time a death is
  // detected the canvas already shows the respawn. Keep a rolling frame from the
  // last decision and preserve THAT as the pre-death picture.
  const PRE = `${SHOT_DIR}/_pre.png`;
  const recordDeath = async (key, action, explicitCause, launch) => {
    const deathWallMs = Date.now();
    const n = String(deathHistory.length + 1).padStart(2, "0");
    const at = key.replace(/[^0-9-]/g, "_");
    try {
      if (fs.existsSync(PRE)) fs.copyFileSync(PRE, `${SHOT_DIR}/death${n}_pre_at_${at}.png`);
    } catch (e) {
      console.log("  [pre-death shot failed: " + e.message + "]");
    }
    await shot(`death${n}_after_at_${at}`);
    let cause = explicitCause || "fell out of bounds or was hit by the laser";
    try {
      if (explicitCause) throw new Error("skip trace lookup");
      const tr = await page.evaluate(() => window.bridge.getTrace());
      const last = tr && tr.length ? tr[tr.length - 1] : null;
      if (last) {
        if (last.oob) cause = "fell out of bounds below y=310";
        else if (last.laser) cause = "was hit by the laser";
      }
    } catch (_) {}
    deathHistory.push(...deathEntries({ key, action }, launch, cause));
    deathLog.push({ wallMs: deathWallMs, step: steps, key, action, cause });
    while (deathHistory.length > DEATH_HISTORY_STORE) deathHistory.shift();
    visitCounts.clear();
    visitWin.length = 0;
    decideMemo.lockedObjective = null;
    lastGroundedKey = null;
    lastGroundedMove = null;
  };

  function movingFrames(s) {
    return (s.drones.tl.y - 1) / 0.2;
  }
  function trackMF(s) {
    const mf = movingFrames(s);
    if (mf > peakMF) peakMF = mf;
    if (s.gemsCollected > peakCollected) peakCollected = s.gemsCollected;
    return mf;
  }

  // Returns event type after a step, or null.
  async function stepAndCheck() {
    await stepOnce();
    steps += 1;
    const s = await readState();
    trackMF(s);
    if (s.lastEvent.type === "advance") return { ev: "advance", s };
    if (s.lastEvent.type === "death") return { ev: "death", s };
    if (s.level === 14) return { ev: "win", s };
    if (steps >= MAX_STEPS) return { ev: "maxsteps", s };
    return { ev: null, s };
  }

  console.log(`\n=== RUN level ${levelIndex} via ${which} (${ep.model}) ===\n`);
  await shot("000_spawn");

  while (steps < MAX_STEPS && deaths < MAX_DEATHS) {
    let s = await readState();
    trackMF(s);

    // The first state of a run must be the spawn state, before any cat physics has
    // advanced and before any death. It has been for all 26 non-video runs in the
    // archive, byte-identical. The 27th, the 2026-09-26 L7 VIDEO=1 run, was not:
    // it read movingFrames 4 and onPlatform true, 4 frames into the level, and
    // diverged from the measured runs at decision 0. The cause is frames the page's
    // own rAF loop runs between gameLoop.stop() and this first read, which cost
    // differently with a screencast attached. Assert it rather than discover it in
    // a diff hours later. There is deliberately NO settling step: adding one would
    // change the starting state of every run and invalidate the 26 baselines.
    // spawnY is not exported by the bridge, so the cat's spawn offset cannot be
    // checked here; these three are the observable invariants and they are what
    // caught the confound.
    if (steps === 0 && (s.onPlatform || s.deathCount !== 0 || movingFrames(s) !== 0)) {
      throw new Error(
        `SPAWN STATE VIOLATED on level ${levelIndex}: movingFrames=${movingFrames(s)} ` +
          `onPlatform=${s.onPlatform} deathCount=${s.deathCount} cat=(${s.cat.x},${s.cat.y}). ` +
          `Expected movingFrames=0 onPlatform=false deathCount=0. The run started ` +
          `mid-level, so it is not comparable with the archive. See the VIDEO=1 note ` +
          `at the VIEWPORT definition.`
      );
    }

    if (s.level === 14) {
      reachedWin = true;
      won = true;
      break;
    }

    // The target level was cleared: the cat advanced FORWARD past it. Any change
    // away from the target used to count, which reported a clear when the game
    // restarted: a level 4 run ended "CLEARED -> advanced to level 0" with 1 of 3
    // gems and no portal. A backward transition is a restart, not a clear.
    // Level 13 is the exception: advancing out of the last level is the game win
    // and the index may wrap rather than go to 14.
    if (s.level !== levelIndex) {
      const forward = s.level > levelIndex || levelIndex === 13;
      if (!forward) {
        console.log(`  [level ${levelIndex} RESTARTED -> game went BACK to level ${s.level} @ step ${steps}; not a clear]`);
        restarted = true;
        break;
      }
      // Clearing requires 3 gems and the portal, so a forward transition with
      // fewer gems means this detector is reading the wrong thing. Fail loudly
      // rather than bank a clear that did not happen.
      if (peakCollected < 3) {
        throw new Error(
          `level ${levelIndex} reported a forward advance to ${s.level} with only ${peakCollected} of 3 gems: ` +
          `the level-advance detector disagrees with the gem counter`
        );
      }
      console.log(`  [level ${levelIndex} CLEARED -> advanced to level ${s.level} @ step ${steps}]`);
      sawAdvance = true;
      cleared = true;
      if (levelIndex === 13) won = true;
      break;
    }

    // Unwinnable by GEOMETRY: an alive gem can no longer be reached from where the
    // cat stands. On level 4 the lower platforms have no edge back up, so once the
    // cat descends for the nearer gems the level is already lost -- and it then
    // spent ~30 decisions walking toward the stranded gem and off the edge, dying
    // at x=217..228 in 11 of 13 attempts.
    //
    // Recording the failure against the LAST GROUNDED DECISION is the point. Three
    // attempts to fix this in the prompt failed (naming the hop, warning on the
    // descent, annotating the gems); the classifier picks by proximity and extra
    // text does not move it. The escalation IS the mechanism that works here: a
    // failure at that key makes the next attempt sample a different objective from
    // the same spot instead of replaying the identical choice.
    if (s.onPlatform && lastGroundedKey) {
      const here = REACH.platformKeyUnder(s.level, s.cat.x, s.cat.y);
      const canGo = here ? REACH.reachableFrom(s.level, here, s.cat.height) : null;
      if (canGo) {
        const levelGemsNow = await levelGemsFor(s.level);
        const stranded = matchAlive(levelGemsNow, s.gemPositions).filter((g) => {
          const h = REACH.platformHolding(s.level, g.x, g.y);
          return h && !canGo.has(h);
        });
        if (stranded.length) {
          console.log(
            `  [stranded @ step ${steps}] ${stranded.map((g) => g.name).join(",")} unreachable from ${here}; ` +
            `blaming the decision at ${lastGroundedKey} and resetting`
          );
          await recordDeath(lastGroundedKey, lastGroundedMove || "(route)",
            `this route stranded ${stranded.map((g) => g.name).join(" and ")}: no way back up`);
          await doReset();
          deaths += 1;
          continue;
        }
      }
    }

    // Unwinnable: cannot reach 3 gems. Reset, do not call the model.
    if (s.gemsCollected + s.aliveGems < 3) {
      console.log(`  [unwinnable @ step ${steps}] collected=${s.gemsCollected} alive=${s.aliveGems} -> reset`);
      // The reset burns a life, so it must be recorded like any death, or every
      // life replays the identical route that let the gem burn (level 13: 11
      // invisible resets). Blame rule shared with run_full.cjs through
      // run_stats.unwinnableDeath. recordDeath also clears the trackers; the
      // explicit cause skips its trace lookup, since the cat did not die.
      const w = unwinnableDeath(s,
        lastGroundedKey ? { key: lastGroundedKey, action: lastGroundedMove || "(route)" } : null,
        `${Math.round(s.cat.x / 10) * 10},${Math.round(s.cat.y / 10) * 10}`);
      await recordDeath(w.key, w.action, w.cause);
      await doReset();
      deaths += 1;
      continue;
    }

    // Read the CURRENT level's gem spawn list (the cat may have advanced since
    // setup, so this must not be frozen to the initial level).
    const levelGems = await levelGemsFor(s.level);

    // Decision point.
    decisions += 1;
    // Rolling pre-frame: the state the model is about to decide on. If this
    // decision ends in a death, recordDeath preserves this picture, because the
    // post-death canvas has already been reset to the respawn.
    // Opt-in: this is one screenshot PER DECISION, which is real memory and time
    // on a 300-decision run. Sweeps do not need it; diagnosing one level does.
    if (SHOT_PRE) { try { await page.screenshot({ path: `${SHOT_DIR}/_pre.png` }); } catch (_) {} }
    let d;
    // Drive the on-page decision panel. Cosmetic and best-effort, but it is the
    // whole point of a recorded run: without it the video shows bare "objective"
    // and "move" labels and no bars. This existed only in run_full.cjs, which is
    // the third feature to go missing from this runner (death-history wiring and
    // video were the others), hence the wiring guard in the check suite.
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
      d = await decideFn(client, s, levelGems, (m) => console.log("      " + m), deathHistory, visitCounts, decideMemo);
    } catch (e) {
      if (e && e.name === "HalogenParseError") {
        const key = `${Math.round(s.cat.x / 10) * 10},${Math.round(s.cat.y / 10) * 10}`;
        deathHistory.push({ key, action: "(malformed)", cause: `model response unparseable: ${e.raw}` });
        while (deathHistory.length > DEATH_HISTORY_STORE) deathHistory.shift();
        console.log(`  [PARSE-FAIL @ step ${steps}] recorded failed decision at ${key}; continuing. ${e.message}`);
        continue;
      }
      console.log(`  [classifier FAILED @ step ${steps}, pausing run] ${e.message}`);
      break;
    }

    const _lat = Date.now() - _t0;
    try {
      await page.evaluate((data) => {
        if (window.overlay) { window.overlay.thinking(false); window.overlay.update(data); }
      }, overlayPayload(s, d, deaths, movingFrames(s), _lat));
    } catch (_) {}
    // Taken after the overlay update returns, so it is the moment the bars are on
    // screen — the frame the editor holds. One screencast period (40ms at 25fps)
    // of quantisation sits between this and the frame that shows them.
    const decisionWallMs = Date.now();

    log.push({
      step: steps,
      wallMs: decisionWallMs,
        // height comes from the spritesheet assigned to catSprite AFTER construction
        // (instances.ts:18 declares no height; onCatSpriteSheetImageLoaded.ts sets the
        // animations), so it is only knowable at runtime -- bridge.ts:76 reports it.
        // Every grounded note that calls arc.simulate passes it, so a wrong value
        // shifts the grounded prompt. Log it rather than assume 18.
        cat: { x: r2(s.cat.x), y: r2(s.cat.y), dy: r2(s.cat.dy), h: r2(s.cat.height) },
      onPlatform: s.onPlatform,
      movingFrames: r2(movingFrames(s)),
      gemsCollected: s.gemsCollected,
      // WHICH gems are still alive, as the coordinates the prompt itself consumes.
      // gemsCollected alone is a count and cannot be inverted: after the first
      // pickup, several subsets give the same count and a different alive-gem
      // list, so the whole gem-list block of the prompt is unreconstructable.
      // That is what makes decision 108 (the gem_c floor bounce) unprobeable.
      // The prompt reads this directly - matchGemsToSpawn(levelGems,
      // snap.gemPositions) at decision.cjs:311 for the objective and :836 for the
      // move - so log it raw rather than logging collected names and leaving a
      // reader to transform them into positions. Gems never move (animation
      // only, bridge.ts:67), so these equal their spawn coordinates.
      gemPositions: s.gemPositions,
      objective: d.objective,
      // The presented ORDER, not just the count. The menu is shuffled per call from
      // a module-level RNG (decision.cjs:1529) consumed by sampleDistribution and
      // sampleNoul as well, so the order before decision N depends on every draw the
      // run made before it. An offline probe cannot re-derive it, so record it.
      presentedOrder: d.presentedOrder,
      move: d.move,
      moveProbs: d.moveProbs,
      candidatesOffered: d.candidatesOffered,
      modelAsked: d.modelAsked,
      ...(d.ceiling ? { ceiling: d.ceiling } : {}),
    });
    flush(); // persist after every decision so a timeout keeps the run
    console.log(
      `  step ${String(steps).padStart(4)} obj=${d.objective.padEnd(7)} move=${d.move.padEnd(10)} ` +
        `cat=(${r2(s.cat.x)},${r2(s.cat.y)}) ${s.onPlatform ? "ground" : "air"} mf=${r2(movingFrames(s))} ` +
        `cands=${d.candidatesOffered} asked=${d.modelAsked}`
    );

    await setAction(d.move);

    // Oscillation-aware livelock guard: over a sliding window, few distinct
    // positions = treading water (same-state loop OR a 2-cycle A,B,A,B). Abort as
    // a STALL (distinct from death and from clear) rather than burn steps.
    const posKey = `${Math.round(s.cat.x)},${Math.round(s.cat.y)}`;
    stallWin.push(posKey);
    if (stallWin.length > STALL_WINDOW) stallWin.shift();
    if (stallWin.length === STALL_WINDOW) {
      const distinct = new Set(stallWin).size;
      if (distinct <= STALL_MAX_DISTINCT) {
        stalled = true;
        console.log(
          `  [L${levelIndex} STALL @ step ${steps}] only ${distinct} distinct positions over ${STALL_WINDOW} decisions (oscillation/treadmill); last move=${d.move} obj=${d.objective} cands=${d.candidatesOffered} asked=${d.modelAsked} probs=${JSON.stringify(d.moveProbs)}`
        );
        break;
      }
    }

    // Unified cadence, then return to the top to RE-DECIDE. See cadence.cjs.
    // Remember where this action was chosen from, so a death can be attributed to
    // the (position, action) pair that caused it and fed back as observable history.
    const chosenKey = `${Math.round(s.cat.x / 10) * 10},${Math.round(s.cat.y / 10) * 10}`;
    // The last decision made from solid ground. A stranding is caused by the route
    // taken off a platform, so that is the key a stranding must be blamed on.
    if (s.onPlatform) {
      lastGroundedKey = chosenKey;
      lastGroundedMove = d.move;
    }

    // Clear the bridge's ring so getTrace below returns THIS batch's frames and
    // not the tail of the previous one. Safe unconditionally: the ring is write-only
    // to the driver today (getTrace is called by nothing in this file), so clearing
    // it discards data no one reads.
    if (FRAME_TRACE) await page.evaluate(() => window.bridge.clearTrace());

    const frames = await stepBatch({
      grounded: s.onPlatform,
      isJump: d.move.includes("jump"),
      K,
      step: async () => {
        const res = await stepAndCheck();
        if (res.ev) {
          if (res.ev === "death") {
            deaths += 1;
            await recordDeath(chosenKey, d.move, undefined,
              lastGroundedKey ? { key: lastGroundedKey, action: lastGroundedMove } : null);
          }
          return { done: true };
        }
        return { done: false, airborne: !res.s.onPlatform, snap: res.s };
      },
      holdIsSafe: (cur) => heldActionIsSafe(cur, d.move),
    });

    if (FRAME_TRACE) {
      const after = await readState();
      frameTrace.push({
        decision: log.length - 1,
        stepAtDecision: s.step != null ? s.step : steps - frames,
        move: d.move,
        objective: d.objective,
        groundedAtDecision: s.onPlatform,
        framesRun: frames,
        frames: await page.evaluate(() => window.bridge.getTrace(200)),
        after: {
          cat: { x: after.cat.x, y: after.cat.y, dy: after.cat.dy },
          onPlatform: after.onPlatform,
          movingFrames: movingFrames(after),
        },
      });
    }
  }

  endWallMs = Date.now();
  const finalState = await readState();
  // All summary metrics are event-derived / peak-tracked, NEVER read from the
  // post-advance end state (which has already reset gems/mf for the next level).
  console.log("\n--- RESULT ---");
  console.log(`endpoint: ${which} (${ep.model})`);
  console.log(`target level: ${levelIndex}`);
  console.log(`level cleared (observed advance out of target): ${sawAdvance}`);
  if (restarted) console.log(`RESTARTED: the game jumped back to an earlier level; this run did NOT clear`);
  console.log(`STALLED (livelock, same action from same position): ${stalled}`);
  console.log(`game won (observed level 14 or advance out of 13): ${won}`);
  console.log(`reached win screen: ${reachedWin}`);
  console.log(`level now (post-run snapshot, informational only): ${finalState.level}`);
  console.log(`total steps: ${steps}`);
  console.log(`moving frames used (this level, PEAK): ${r2(peakMF)}`);
  console.log(`gems collected (this level, PEAK): ${peakCollected}`);
  console.log(`decisions made: ${decisions}`);
  console.log(`deaths: ${deaths}`);
  console.log(`page errors: ${pageErrors.length ? pageErrors.join("; ") : "none"}`);

  // Dump the decision log for inspection.
  fs.writeFileSync(
    CFG.outPath(`run_level_${levelIndex}_${which}.json`),
    JSON.stringify(
      {
        endpoint: which,
        build: buildFlags(),
        model: ep.model,
        levelIndex,
        won,
        sawAdvance,
        stalled,
        reachedWin,
        peakMovingFrames: r2(peakMF),
        peakGemsCollected: peakCollected,
        steps,
        deaths,
        decisions,
        log,
        deathLog,
        video: {
          recorded: VIDEO,
          epochHintMs: videoEpochHintMs,
          endWallMs,
        },
      },
      null,
      2
    )
  );
  console.log(`decision log written to ${CFG.outPath(`run_level_${levelIndex}_${which}.json`)}`);

  // Separate file, written only under FRAME_TRACE=1. The decision log above is
  // byte-identical either way.
  if (FRAME_TRACE) {
    const fpath = CFG.outPath(`frame_trace_L${levelIndex}_${which}.json`);
    fs.writeFileSync(
      fpath,
      JSON.stringify({ levelIndex, endpoint: which, model: ep.model, steps, deaths, decisions, batches: frameTrace }, null, 1)
    );
    const nf = frameTrace.reduce((a, b) => a + b.frames.length, 0);
    console.log(`FRAME TRACE: ${frameTrace.length} batches, ${nf} frames -> ${fpath}`);
  }

  // Finalise the video: read the path BEFORE closing the context, then close the
  // context (which flushes the file), then the browser. Closing the browser first
  // leaves a zero-byte file.
  if (VIDEO) {
    try {
      const vpath = await page.video().path();
      await context.close();
      const target = CFG.outPath(`level_${levelIndex}_${which}${sawAdvance ? "_cleared" : ""}.webm`);
      fs.renameSync(vpath, target);
      console.log(`video: ${target}`);
    } catch (e) {
      console.log(`video: unavailable (${e.message})`);
      try { await context.close(); } catch (_) {}
    }
  } else {
    await context.close();
  }

  await browser.close();
})().catch((e) => {
  console.error("RUN ERROR:", e);
  process.exit(1);
});
