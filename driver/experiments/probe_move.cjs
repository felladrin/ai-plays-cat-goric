#!/usr/bin/env node
// probe_move.cjs — reconstruct ONE decision's prompt from an archived run and
// re-ask the endpoint for the move distribution. One script, one job: reproduce,
// then (optionally) compare a patched decision.cjs against the unpatched one.
//
// The instrument's value is that it can be WRONG LOUDLY. Every field it
// reconstructs is either derived from the archive by an exact inverse, or listed
// as an assumption, and the script refuses to run when it cannot tell which.
  // A silently-defaulted field produces numbers nobody can reproduce, which is the
  // failure mode this exists to prevent.
  //
  // WHAT THIS PROBE CANNOT DO. It replays ARCHIVED decisions, so it answers exactly
  // one question: "given THIS state, what would the model have said?" It is exact
  // for that, and it is BLIND to "which states would the cat have visited at all".
  //
  // The blind spot bites exactly when a prompt change is most interesting. If a
  // change makes the cat solve a level in 24 decisions instead of 158, the states
  // that accounted for the other 134 have STOPPED HAPPENING, so they are not in the
  // post-change archive and cannot be replayed. A clean A/B on the post-change
  // archive therefore measures only each variant's MARGINAL contribution in a world
  // the change already created -- it cannot measure the change's effect on the
  // trajectory. Worse, the surviving states are the EASY ones (the model is often
  // already at 0.999), so the test has almost no dynamic range and will report
  // "nothing moved" for a clause that in fact changed everything.
  //
  // Concretely, on 2026-09-27: scoring the gem-only clause variant against the full
  // clause on L1's own post-change states moved `right` by 0.012 and changed no
  // argmax, which said nothing about whether the gem half or the descent half had
  // produced the fivefold improvement. Answering THAT required a counterfactual RUN
  // of the level with the variant as the live build. Reached state -> probe.
  // Trajectory -> run the level. Reach for the right instrument.
  //

//   node probe_move.cjs --run <archive.json> --decision <i> [options]
//   node probe_move.cjs --run <archive.json> --selftest [--limit N]
//
// Reconstruction provenance, from the game's own source:
//   cat.x, cat.y        logged verbatim
//   onPlatform          logged verbatim
//   gemsCollected       logged verbatim
//   level               archive.levelIndex
//   drones.tl.y         INVERSE of run_level.cjs movingFrames(s) = (s.drones.tl.y-1)/0.2
//   drones.bl.x = 1     static, src/scripts/functions/commands/resetDrones.ts:17
//   drones.tr.x = W-1   static, resetDrones.ts:14  (W = --canvas-width)
const DRONE_SPEED = 0.2;  // must equal CFG.droneSpeed (config.cjs); see the inset note below
//   gemPositions        gemsPositionsPerLevel[level] minus the collected gems
//   cat.dy              0 IF onPlatform — src updateCatSprite.ts:54-55 sets dy=0
//                       when platformWhichCatIsOn, which is the same variable the
//                       snapshot reports as onPlatform. Airborne dy is NOT logged
//                       and is printed as UNKNOWN; those decisions are refused.
//   cat.height          DERIVED 18, from src/images/catSpriteSheet.webp. The
//                       sheet is 72x72 and onCatSpriteSheetImageLoaded.ts:9-10
//                       declares frameWidth 18 / frameHeight 18, so it is a 4x4
//                       grid of 18px frames and kontra takes the sprite's size
//                       from the frame when animations are assigned. Previously
//                       carried as ASSUMED; now cited. Overridable, always printed.
//   deathHistory        [] is EXACT only when the par log's priorDeaths is 0 for
//                       that decision. Refused otherwise unless overridden.
//                       The archive JSON does NOT record priorDeaths (verified:
//                       top-level keys are endpoint, model, levelIndex, won,
//                       sawAdvance, stalled, reachedWin, peakMovingFrames,
//                       peakGemsCollected, steps, deaths, decisions, log; an entry
//                       carries step, cat{x,y}, onPlatform, movingFrames,
//                       gemsCollected, objective, move, moveProbs,
//                       candidatesOffered, modelAsked), so the par log is the only
//                       source and must be the ARCHIVED copy -- a /tmp par log is
//                       refused, because those have been truncated and staled.

"use strict";

const fs = require("fs");
const path = require("path");

const DRIVER = path.join(__dirname, "..");
// out/ is at the REPO ROOT, not under driver/ -- an easy path to get wrong.
const OUT_RUNS = path.join(DRIVER, "..", "out", "runs");
const CFG = require(path.join(DRIVER, "config.cjs"));

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const a = {
    run: null, decision: null, level: null, mf: null, collected: null,
    resolve: false, catHeight: 18, canvasWidth: 360, maximumLaserY: 310, parlog: null,
    assumeEmptyDeathHistory: false, pairs: false, patched: null, baseline: null, showState: false,
    selftest: false, limit: 8, tol: 1e-6, quiet: false, dryRun: false,
    objective: false, forceOrder: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--run") a.run = next();
    else if (k === "--decision") a.decision = Number(next());
    else if (k === "--level") a.level = Number(next());
    else if (k === "--mf") a.mf = Number(next());
    else if (k === "--collected") a.collected = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--resolve") a.resolve = true;
    else if (k === "--cat-height") a.catHeight = Number(next());
    else if (k === "--canvas-width") a.canvasWidth = Number(next());
    else if (k === "--maximum-laser-y") a.maximumLaserY = Number(next());
    else if (k === "--parlog") a.parlog = next();
    else if (k === "--assume-empty-death-history") a.assumeEmptyDeathHistory = true;
    else if (k === "--pairs") a.pairs = true;
    else if (k === "--each") a.each = true;
    else if (k === "--patched") a.patched = next();
    else if (k === "--baseline") a.baseline = next();
    else if (k === "--objective") a.objective = true;
    else if (k === "--no-force-order") a.forceOrder = false;
    else if (k === "--print-criteria") a.printCriteria = true;
    else if (k === "--unknown-order-ok") a.unknownOrderOk = true;
    else if (k === "--show-state") a.showState = true;
    else if (k === "--selftest") a.selftest = true;
    else if (k === "--limit") a.limit = Number(next());
    else if (k === "--tol") a.tol = Number(next());
    else if (k === "--quiet") a.quiet = true;
    else if (k === "--dry-run") a.dryRun = true;
    else die(`unknown argument ${k}`);
  }
  if (!a.run) die("--run <archive.json> is required");
  if (!fs.existsSync(a.run)) die(`--run file not found: ${a.run}`);
    if (!a.selftest && !a.each && (a.decision == null || !Number.isInteger(a.decision) || a.decision < 0)) {
      die("--decision <i> is required (or use --selftest, or --each)");
    }
  return a;
}

// A refusal is a feature. It must be loud, specific, and never a fallback value.
function die(msg) {
  console.error(`\nprobe_move REFUSING: ${msg}\n`);
  process.exit(2);
}
function refuse(msg) { die(msg); }

// ------------------------------------------------------- level gem table (static source)

function loadGemTable() {
  const p = path.join(DRIVER, "..", "src", "scripts", "constants", "config.ts");
  const src = fs.readFileSync(p, "utf8");
  const at = src.indexOf("gemsPositionsPerLevel");
  if (at < 0) die(`gemsPositionsPerLevel not found in ${p}`);
  const seg = src.slice(at);
  const st = seg.indexOf("= [") + 2;
  let dep = 0, i = st;
  for (; i < seg.length; i++) {
    if (seg[i] === "[") dep++;
    else if (seg[i] === "]") { dep--; if (!dep) break; }
  }
  return eval(seg.slice(st, i + 1));
}

// ---------------------------------------------------------- par log priorDeaths

// The par log prints one `move=` line per move CALL, not per log entry, so its
// index cannot be assumed to equal the log index. The count must match the
// number of entries that carry moveProbs before the alignment is trusted.
function loadPriorDeaths(parlogPath, log) {
  if (!parlogPath) return null;
  // The archive cannot corroborate priorDeaths, so the par log is the only source
  // and it has to be the one that was archived with the run. A /tmp par log is
  // refused: those have been truncated on relaunch and read stale three times.
  if (!path.resolve(parlogPath).startsWith(path.resolve(OUT_RUNS) + path.sep))
    die(`--parlog must be the ARCHIVED copy under ${OUT_RUNS}/, not ${parlogPath}: the archive does not ` +
        `record priorDeaths, so this file is the only evidence and an unarchived one has been truncated ` +
        `and staled before.`);
  if (!fs.existsSync(parlogPath)) die(`--parlog file not found: ${parlogPath}`);
  const txt = fs.readFileSync(parlogPath, "utf8");
  const out = [];
  const re = /priorDeaths=(\d+)/g;
  let m;
  while ((m = re.exec(txt))) out.push(Number(m[1]));
  const withProbs = log.filter((e) => e.moveProbs && Object.keys(e.moveProbs).length).length;
  if (out.length !== withProbs) {
    die(`par log has ${out.length} move lines but the archive has ${withProbs} entries with moveProbs; ` +
        `index alignment is unproven. Pass a par log from the SAME run, or --assume-empty-death-history ` +
        `to skip the check (then death history is an ASSUMPTION, not a fact).`);
  }
  return out;
}

// ------------------------------------------------------------- snap reconstruction

const GEM_NAMES = ["gem_a", "gem_b", "gem_c"];

// Exactness ledger: every field is 'exact' (derived by an exact inverse) or
// 'assumed' (a static value the archive does not record). Printed always.
function reconstruct(archive, entry, opts, priorDeaths) {
  const level = opts.level != null ? opts.level : archive.levelIndex;
  const GEMS = loadGemTable();
  const levelGems = GEMS[level];
  if (!levelGems) die(`level ${level} has no gem table (table has ${GEMS.length} levels)`);

  const ledger = [];
  const note = (field, how) => ledger.push({ field, how });

  // An archive that predates the logging change has neither presentedOrder nor dy.
  // Report the absence and refuse, rather than silently omitting a field the caller
  // may believe is present -- that is how the first selftest produced 0 of 84 and
  // was read as a reconstruction failure when it was an invalid test.
  //
  // --unknown-order-ok is an OPT-IN for a MOVE-CALL probe only, and the reason is
  // checked rather than asserted: shuffleArray has exactly one call site in
  // decision.cjs, line 624, which is inside buildObjectiveCall (331..660).
  // buildMoveCall begins at 857 and never shuffles, so for a move-criteria change
  // the presented order is irrelevant. It is NOT irrelevant to the objective arm,
  // which anchors on it -- so this flag is refused there, and it never suppresses
  // the warning line below.
  if (!("presentedOrder" in entry)) {
    if (!opts.unknownOrderOk)
      die(`this archive's log entries carry no presentedOrder, so it predates the logging commit ` +
          `(1ccb0ea) and the presented order is unknown. Probing it would silently omit a field the ` +
          `caller expects. Use an archive from a run on or after that commit, or pass ` +
          `--unknown-order-ok IF the probe is on the MOVE call (the move criteria are never shuffled: ` +
          `shuffleArray's only call site is decision.cjs:624, inside buildObjectiveCall 331..660, and ` +
          `buildMoveCall starts at 857).`);
    if (opts.objective)
      die(`--unknown-order-ok is refused for the OBJECTIVE arm: buildObjectiveCall DOES shuffle ` +
          `(decision.cjs:624) and the objective arm anchors on the presented order, so an archive with ` +
          `no presentedOrder cannot be compared to it. This flag is for move-criteria probes only.`);
    console.log(`\n*** PRESENTED ORDER UNKNOWN (archive predates 1ccb0ea). Irrelevant to this probe:`);
    console.log(`*** the move criteria are never shuffled -- shuffleArray's only call site is`);
    console.log(`*** decision.cjs:624, inside buildObjectiveCall (331..660); buildMoveCall starts at`);
    console.log(`*** 857. NO delta reported here can be called order-affected, because no order is`);
    console.log(`*** in play for the move call. Objective-arm probes are refused with this flag.`);
    note("presentedOrder", "UNKNOWN — archive predates 1ccb0ea; move criteria are never shuffled, so it is not read by this probe");
  } else
  note("presentedOrder", `${JSON.stringify(entry.presentedOrder)} — post-shuffle order, read back from decision.cjs:609`);
  if (!("dy" in (entry.cat || {})))
    if (entry.onPlatform) note("cat.dy", "absent — archive predates 1ccb0ea; this decision is GROUNDED and updateCatSprite.ts:54-55 zeroes dy when the cat is on a platform, so the prompt reads dy=0 regardless");
    else
      die(`this archive's cat entries carry no dy, so it predates the logging commit (1ccb0ea) and the ` +
          `cat's vertical velocity is unknown. Airborne prompts read it at decision.cjs:1424, so an ` +
          `airborne decision cannot be reproduced without it. Use a later archive.`);

  const mf = opts.mf != null ? opts.mf : entry.movingFrames;
  if (mf == null || !Number.isFinite(mf)) {
    die(`movingFrames is unknown for this decision and was not pinned with --mf. ` +
        `It is a parameter of the result (the same state at mf 209 gives jump_right 0.704, not 0.852), ` +
        `so it is never defaulted.`);
  }
  const logged = entry.movingFrames;
  if (opts.mf != null && logged != null && opts.mf !== logged) {
    note("movingFrames", `PINNED to ${opts.mf} but the archive logged ${logged} — archived probs CANNOT match by construction`);
  } else {
    note("movingFrames", `${mf}${opts.mf != null ? " (pinned via --mf, matches archive)" : " (from archive)"}`);
  }

  // gemPositions: the alive gems, in spawn (pool) order, minus the collected.
  //
  // LOGGED since the run that added it. Before that the archive carried only the
  // COUNT, which cannot be inverted: after the first pickup several different
  // subsets give the same count and a different alive-gem list, so the whole
  // gem block of the prompt was unreconstructable. That is what made decision
  // 108 - the gem_c floor bounce, the most interesting unexplained behaviour on
  // the board - unprobeable, and it accounted for all 39 skips.
  const collected = opts.collected || [];
  const need = entry.gemsCollected;
  const live = entry.gemPositions;
  let aliveNames, gemPositions;

  if (live) {
    // The logged coordinates are what the prompt itself consumes, so use them
    // verbatim. Cross-check rather than trust: a set that disagrees with the
    // count would mean the log and the game disagree, which must not pass
    // silently.
    gemPositions = live.map((g) => ({ x: g.x, y: g.y }));
    if (need > 0 && gemPositions.length === levelGems.length) {
      die(`entry logs gemsCollected=${need} but gemPositions still has all ` +
          `${gemPositions.length} gems of the level. The log is self-inconsistent.`);
    }
    if (need === 0 && gemPositions.length !== levelGems.length) {
      die(`entry logs gemsCollected=0 but gemPositions has ${gemPositions.length} gems, ` +
          `not the level's ${levelGems.length}. The log is self-inconsistent.`);
    }
    // Name them for the ledger by matching against the spawn table, but do NOT
    // use the names to build the list - the positions are already exact.
    aliveNames = gemPositions.map((g) => {
      const i = levelGems.findIndex(([x, y]) => x === g.x && y === g.y);
      return i < 0 ? `?(${g.x},${g.y})` : GEM_NAMES[i];
    });
    if (aliveNames.some((n) => n.startsWith("?"))) {
      die(`logged gemPositions ${JSON.stringify(gemPositions)} match no spawn coordinate in ` +
          `${JSON.stringify(levelGems)}; the level's gem table changed.`);
    }
    note("gemPositions", `${aliveNames.join("+")} (LOGGED, verified against spawn coords and count)`);
  } else {
    const why = `gemsCollected=${need} and this archive predates the gemPositions field, so the ` +
        `alive-gem list in the prompt is not reconstructible from a count alone.`;
    if (need > 0 && collected.length === 0 && !opts.resolve) {
      // In a sweep this is a countable refusal, not a fatal one: the point of the
      // sweep is the reproduce/differ/refuse census, so dying here would hide it.
      if (opts.each) return { skipped: why, ledger, level, levelGems, mf };
      die(`this decision has ${why} Either use an archive from a run with the field, or pass ` +
          `--collected gem_a,gem_b to state the assumption explicitly.`);
    }
    if (collected.length !== need) {
      die(`--collected lists ${collected.length} gem(s) but the decision has gemsCollected=${need}`);
    }
    aliveNames = GEM_NAMES.slice(0, levelGems.length).filter((n) => !collected.includes(n));
    gemPositions = aliveNames.map((n) => {
      const idx = GEM_NAMES.indexOf(n);
      const [x, y] = levelGems[idx];
      return { x, y };
    });
    note("gemPositions", collected.length
      ? `${aliveNames.join("+")} (from --collected: ASSUMED, not logged)`
      : `all ${aliveNames.length} gems (gemsCollected=0, so no ambiguity)`);
  }

  // cat.dy: LOGGED since commit 1ccb0ea, so it is read, never derived. The
  // grounded case is still cross-checked against the game: updateCatSprite.ts:54-55
  // zeroes dy when platformWhichCatIsOn, the same variable the snapshot reports as
  // onPlatform, so a grounded entry reading non-zero dy would mean the log is wrong.
  const dy = entry.cat.dy;
  if (entry.onPlatform) {
    // Two different failures, and conflating them is the bug this branch had.
    //   dy == null   -> the archive predates the logging commit, so there is no
    //                   logged value at all. updateCatSprite.ts:54-55 zeroes dy
    //                   when platformWhichCatIsOn, and onPlatform IS
    //                   platformWhichCatIsOn, so 0 is the game's own value here,
    //                   not a default invented to make the probe run.
    //   dy !== 0     -> a value WAS logged and it contradicts the game. Refuse.
    if (dy == null)
      note("cat.dy", "0 — NOT logged (archive predates 1ccb0ea); supplied from the game's own rule, updateCatSprite.ts:54-55 zeroes dy when platformWhichCatIsOn, and onPlatform is that same variable");
    else if (dy !== 0)
      die(`this entry is onPlatform but logs cat.dy=${dy}; updateCatSprite.ts:54-55 zeroes dy when ` +
          `platformWhichCatIsOn, so either the log or the onPlatform flag is wrong. Refusing rather ` +
          `than probing with a dy the game cannot produce.`);
    else
      note("cat.dy", "0 — logged, and consistent with updateCatSprite.ts:54-55 (dy zeroed when platformWhichCatIsOn)");
  } else {
    if (dy == null)
      die(`this entry is AIRBORNE and its archive predates 1ccb0ea, so cat.dy is absent, and dy ` +
          `reaches the prompt at decision.cjs:1424. The game's value cannot be recovered from a ` +
          `position alone. Use a later archive.`);
    note("cat.dy", `${dy} — logged (1ccb0ea), read directly; it reaches the prompt at decision.cjs:1424`);
  }

  // The laser rectangle ADVANCES INWARD with the platform cycle, so it is not a
  // fixed frame. The archive carries no drone positions, so reading them off the
  // mf=0 reset (resetDrones.ts) left the rectangle one pixel-per-0.2frame too
  // large on every axis at mf>0, which moved the safe rectangle, the
  // closing-laser distance and all four wall margins together. Verified to <1e-9
  // against live PROMPT_DUMP output on all 5 L0 decisions. safeRect
  // (decision.cjs:30-36) reads ONLY bl.x, tr.x, tl.y and br.y; bl.y and br.x
  // are recorded for completeness but reach no prompt line.
  const rectInset = DRONE_SPEED * mf;
  const snap = {
    level,
    gemsCollected: need,
    aliveGems: gemPositions.length,
    gemPositions,
    moving: false,               // decision.cjs reads snap.moving 0 times (verified)
    onPlatform: entry.onPlatform,
    cat: { x: entry.cat.x, y: entry.cat.y, dx: 0, dy, height: opts.catHeight },
    drones: {
      tl: { x: 0, y: 1 + rectInset },
      tr: { x: opts.canvasWidth - 1 - rectInset, y: 0 },
      bl: { x: 1 + rectInset, y: opts.maximumLaserY },
      br: { x: opts.canvasWidth, y: opts.maximumLaserY - rectInset },
    },
  };
  note("level", `${level}`);
  note("cat.x, cat.y", `${entry.cat.x}, ${entry.cat.y} (logged)`);
  note("onPlatform", `${entry.onPlatform} (logged)`);
  note("gemsCollected", `${need} (logged)`);
  note("drones.tl.y", `${snap.drones.tl.y} (= 1 + ${DRONE_SPEED}*${mf})`);
  note("drones.bl.x, tr.x, br.y", `${snap.drones.bl.x}, ${snap.drones.tr.x}, ${snap.drones.br.y} — DERIVED as ${opts.maximumLaserY} ∓ ${DRONE_SPEED}*${mf} from the platform inset, not read from the archive (it records no drone positions). At mf=0 this reduces to the resetDrones.ts values 1, ${opts.canvasWidth - 1}, ${opts.maximumLaserY}.`);
  note("cat.height", `${opts.catHeight} — DERIVED from catSpriteSheet.webp 72x72 with frameHeight 18 (onCatSpriteSheetImageLoaded.ts:9-10)`);
  note("snap.moving, cat.dx, aliveGems", "not read by decision.cjs (0 references each)");

  // deathHistory: [] is exact only when priorDeaths is 0 at this index.
  let deathHistory = [];
  if (need === undefined) die("entry.gemsCollected missing");
  const pd = priorDeaths == null ? null : priorDeaths[opts.decision];
  if (pd === 0) {
    note("deathHistory", "[] — EXACT: par log priorDeaths=0, so no death note can reach the prompt");
  } else if (opts.assumeEmptyDeathHistory) {
    note("deathHistory", "[] — ASSUMED (--assume-empty-death-history); a real prior death would change the prompt");
  } else if (pd != null) {
    die(`priorDeaths=${pd} at this decision, so the death-history block is NOT empty and deathHistory is not ` +
        `reconstructible from the archive (it is built by run_level.cjs recordDeath and never logged). ` +
        `Re-run with --assume-empty-death-history to accept the approximation, or probe a decision with priorDeaths=0.`);
  } else {
    die(`no --parlog given, so priorDeaths is unknown and deathHistory cannot be shown empty. Pass --parlog ` +
        `<archived par log from the same run>, or --assume-empty-death-history.`);
  }

  return { snap, levelGems, ledger, mf, refuseAirborne: false };
}

// ------------------------------------------------------------------ the endpoint

function makeClient() {
  const { makeHalogenLogprobsClient } = require(path.join(DRIVER, "jev.cjs"));
  return makeHalogenLogprobsClient({
    baseUrl: CFG.LLAMA_BASE_URL,
    model: "Halogen-Qwen3.8-Flash-Next-Instruct",
    minIntervalMs: 0,
    logger: (m) => { if (!global.__probeQuiet) console.log(`    [endpoint] ${m}`); },
  });
}

async function askMove(mod, snap, levelGems, objective, client) {
  const call = mod.buildMoveCall(snap, levelGems, objective, []);
  const ans = await client.classify(call.state, call.questions);
  return { probs: ans.move.probabilities, choice: ans.move.choice, state: call.state };
}

// A fresh module instance per arm. The objective call's menu is drawn by a SEEDED
// module-level RNG (decision.cjs:1632-1637), so two arms sharing one instance draw
// DIFFERENT orders on their second and later calls, and a difference in menu order
// would read as an effect of the patch. Reloading resets the RNG to the same stream
// position, so each arm consumes the same first draw and presents the same menu. The
// order is printed and compared below; a mismatch refuses rather than reports.
function loadFresh(p) {
  const abs = path.resolve(p);
  delete require.cache[require.resolve(abs)];
  return require(abs);
}

// decide() scores the objective TWICE and averages (decision.cjs:2036-2065), because
// a single draw picked a one-way descent 2 of 20 times on L4. Mirror it exactly,
// including the detail that the reversal applies to the CRITERIA order only while
// the state text keeps the drawn order in both passes. The call is passed IN, never
// rebuilt: rebuilding it would consume one more menu draw and silently leave the
// anchored order behind.
async function askObjective(call, client) {
  const names = call.objectiveNames;
  if (names.length === 1) {
    return { order: names, single: true, avg: { [names[0]]: 1 }, choice: names[0], state: call.state };
  }
  const revNames = [...names].reverse();
  const revCriteria = {};
  for (const n of revNames) revCriteria[n] = call.questions.objective.criteria[n];
  const [fwd, rev] = [
    await client.classify(call.state, call.questions),
    await client.classify(call.state, { objective: { ...call.questions.objective, criteria: revCriteria } }),
  ];
  const avg = {};
  for (const n of names) avg[n] = ((fwd.objective.probabilities[n] || 0) + (rev.objective.probabilities[n] || 0)) / 2;
  const choice = Object.keys(avg).reduce((a, b) => (avg[a] >= avg[b] ? a : b));
  return {
    order: names, state: call.state,
    fwd: fwd.objective.probabilities, rev: rev.objective.probabilities,
    avg, choice,
  };
}

// Objective arm + the chained move. Each arm's OWN objective choice feeds that arm's
// OWN buildMoveCall, which is the live pipeline in order, so the move distribution
// here is what the driver would actually press.
//
// The menu is drawn, so the probe also ANCHORS the draw to the order the run
// actually presented (`entry.presentedOrder`, logged since 1ccb0ea). Without that the
// arm's absolute probabilities belong to a menu order the run never had, and the
// baseline's argmax could differ from the archived choice for that reason alone --
// which would be reported as the patch moving the objective. Anchoring is exact: a
// fresh module is a fresh RNG stream, so discarding k draws lands both arms on the
// same k-th permutation, and the check below still refuses if they disagree.
const MAX_DRAWS = 4000;

function buildAtDraw(abs, snap, levelGems, deathHistory, k) {
  const mod = loadFresh(abs);
  let call;
  for (let i = 0; i <= k; i++) call = mod.buildObjectiveCall(snap, levelGems, deathHistory);
  return { mod, draws: k, call };
}

// alignDraw: place the arm at draw index `atDraw` on its own fresh stream and do NOT
// require the permutation to match. That is the only honest option when the change
// alters the menu, and it has to be asked for explicitly: anchoring is what makes the
// baseline's argmax comparable to the run's, so silently giving it up would trade one
// confound for another without saying so.
function loadAtOrder(p, snap, levelGems, deathHistory, target, alignDraw, atDraw = 0) {
  const abs = path.resolve(p);
  const one = (mod) => mod.buildObjectiveCall(snap, levelGems, deathHistory);
  if (!target || alignDraw) {
    const got = buildAtDraw(abs, snap, levelGems, deathHistory, alignDraw ? atDraw : 0);
    return { ...got, anchored: false };
  }
  // The archived order is a permutation of THIS state's menu, so it can only exist if
  // the option count matches. Check that with ONE build before searching: a menu whose
  // length differs can never match, and the first version of this function discovered
  // that by looping MAX_DRAWS times reloading and rebuilding k times per candidate,
  // i.e. MAX_DRAWS^2/2 builds. On the ascent-gate A/B (the patch adds a third option to
  // a two-option menu) that ran 11m51s before being interrupted and never reported.
  const first = buildAtDraw(abs, snap, levelGems, deathHistory, 0);
  if (first.call.objectiveNames.length !== target.length) {
    refuse(`this state offers ${first.call.objectiveNames.length} option(s) [${first.call.objectiveNames.join(",")}] ` +
           `but the archived menu had ${target.length} [${target.join(",")}], so the archived order is not a ` +
           `permutation of this menu and no number of draws can reach it. That is expected when the patch changes ` +
           `the number of options. Re-run with --no-force-order to compare both arms on their own first draw, ` +
           `which gives up the archived-order anchor for both of them.`);
  }
  // ONE module advanced one draw at a time: MAX_DRAWS builds, not MAX_DRAWS^2/2.
  const mod = loadFresh(abs);
  let call = one(mod);
  for (let k = 0; k <= MAX_DRAWS; k++) {
    if (JSON.stringify(call.objectiveNames) === JSON.stringify(target)) {
      return { mod, draws: k, call, anchored: true };
    }
    call = one(mod);
  }
  refuse(`could not draw the archived menu order [${target.join(",")}] in ${MAX_DRAWS + 1} draws from ${p}. ` +
         `The option counts match, so the archive and the reconstructed state are not the same decision. Refusing ` +
         `rather than reporting probabilities for a menu the run never showed. Pass --no-force-order to compare ` +
         `the two arms on whatever order each draws, accepting that neither then matches the archived choice.`);
}

// Which module plays the BASELINE arm. It defaults to decision.cjs because that is
// the unpatched driver, but an A/B between two PATCHED arms -- a staged change,
// where both arms carry an earlier change and differ only in the one under test --
// needs the baseline to be a file of its own. Without this the objective arm would
// silently re-run the previous experiment and report its delta as a null control.
function baseFile(opts) {
  return opts.baseline ? path.resolve(opts.baseline) : path.join(DRIVER, "decision.cjs");
}
async function probeObjective(archive, opts, r, client) {
  const entry = archive.log[opts.decision];
  const anchor = opts.forceOrder && entry.presentedOrder ? entry.presentedOrder : null;
  const files = [{ label: "baseline", file: baseFile(opts) }];
  if (opts.patched) files.push({ label: "patched", file: path.resolve(opts.patched) });
  const arms = [];
  const base = loadAtOrder(files[0].file, r.snap, r.levelGems, [], anchor, false);
  arms.push({ ...files[0], ...base });
  for (const f of files.slice(1)) {
    // The anchor is a property of the ARCHIVED run, so only an arm with the same
    // option count can hold it. When the patch changes the option count, place the
    // other arms at the baseline's draw index: same position on the RNG stream, order
    // not held constant, and the report says which happened.
    const g = loadAtOrder(f.file, r.snap, r.levelGems, [], anchor, true, base.draws);
    arms.push({ ...f, ...g });
  }
  const orderHeld = arms.every((a) => a.anchored);

  if (opts.dryRun) {
    for (const a of arms) a.obj = { order: a.call.objectiveNames, state: a.call.state };
    const orders = new Set(arms.map((a) => JSON.stringify(a.obj.order)));
    if (orders.size !== 1 && orderHeld) refuse(`menu order differs between arms: ${arms.map((a) => `${a.label} [${a.obj.order}]`).join("  ")}`);
    const base = arms[0].obj.state;
    return {
      arms,
      archivedObjective: entry.objective,
      archivedOrder: entry.presentedOrder,
      textChanged: arms.slice(1).map((a) => ({ label: a.label, same: a.obj.state === base })),
      dryRun: true,
    };
  }

  for (const a of arms) a.obj = await askObjective(a.call, client);
  // The order control, made loud. Two arms that presented different menus cannot be
  // compared on their probabilities: the difference would be the order, not the hint.
  // EXCEPT when the patch changed the option count, in which case holding the order is
  // impossible by construction and the arms are aligned on the RNG draw index instead.
  const orders = new Set(arms.map((a) => JSON.stringify(a.obj.order)));
  let orderNote = null;
  if (orders.size !== 1) {
    if (orderHeld) {
      refuse(`menu order differs between arms, so the objective probabilities are NOT comparable: ` +
             `${arms.map((a) => `${a.label} [${a.obj.order.join(",")}]`).join("  ")}. ` +
             `Both arms are meant to be fresh module instances at the same SEED; a difference here means ` +
             `one arm consumed a different number of RNG draws before buildObjectiveCall.`);
    }
    orderNote = `${arms.map((a) => `${a.label} [${a.obj.order.join(",")}]`).join("  ")} — ` +
      `the patch changes the number of options (${arms[0].obj.order.length} -> ${arms[arms.length - 1].obj.order.length}), ` +
      `so the archived order cannot be a permutation of the patched menu. Every arm is a fresh module at the ` +
      `same SEED placed at the same draw index, which holds the RNG position and not the order. A menu-order ` +
      `effect is therefore NOT excluded by this A/B and no delta below can be called order-free.`;
  }
  for (const a of arms) {
    a.move = await askMove(a.mod, r.snap, r.levelGems, a.obj.choice, client);
  }
  return {
    arms,
    orderHeld,
    orderNote,
    archivedObjective: entry.objective,
    archivedOrder: entry.presentedOrder,
    dryRun: false,
  };
}

function diffProbs(got, want, tol) {
  const keys = [...new Set([...Object.keys(want || {}), ...Object.keys(got || {})])].sort();
  let max = 0;
  const rows = keys.map((k) => {
    const g = got ? got[k] : undefined;
    const w = want ? want[k] : undefined;
    const d = g == null || w == null ? Infinity : Math.abs(g - w);
    if (d > max) max = d;
    return { k, got: g, want: w, d };
  });
  return { rows, max, ok: max <= tol };
}

// ------------------------------------------------------------------- one decision

async function probeOne(archive, opts, priorDeaths, decision, client) {
  const entry = archive.log[decision];
  if (!entry) die(`decision ${decision} out of range (archive has ${archive.log.length} entries)`);
  const r = reconstruct(archive, entry, { ...opts, decision }, priorDeaths);
  if (r.skipped) return r;

  const objective = entry.objective;
  if (!objective) die(`decision ${decision} has no objective in the archive`);

  // --dry-run stops after reconstruction and prompt construction: everything
  // except the one network call. That is the whole CPU half of the instrument,
  // and it is verifiable while the endpoint is busy.
  if (opts.dryRun) {
    const mod = require(baseFile(opts));
    const call = mod.buildMoveCall(r.snap, r.levelGems, objective, []);
    const out = { decision, objective, entry, ledger: r.ledger, base: { probs: null, choice: null, state: call.state }, dryRun: true };
    if (opts.objective) out.objectiveArm = await probeObjective(archive, opts, r, client);
    return out;
  }

  // The objective arm runs FIRST and loads its own fresh module instances, so it
  // cannot perturb the move arm's module state.
  const objectiveArm = opts.objective ? await probeObjective(archive, opts, r, client) : null;

  const base = await askMove(require(baseFile(opts)), r.snap, r.levelGems, objective, client);
  const out = { decision, objective, entry, ledger: r.ledger, base, patched: null, objectiveArm };

  if (opts.patched) {
    const mod = require(path.resolve(opts.patched));
    out.patched = await askMove(mod, r.snap, r.levelGems, objective, client);
  }
  return out;
}

function printObjective(res, opts = {}) {
  const o = res.objectiveArm;
  if (!o) return;
  // buildObjectiveCall returns `objectiveNames`; askObjective returns the same list
  // as `order`. Read either, so --dry-run and a live run print the same field.
  const ord = (a) => (a.obj.order || a.obj.objectiveNames || []);
  console.log(`\n  === objective arm (order-debiased, mirrors decide()'s fwd+rev average)`);
  for (const a of o.arms) {
    console.log(`    presented order  ${a.label.padEnd(8)} [${ord(a).join(",")}]` +
                (a === o.arms[0] && o.archivedOrder ? `   archived [${o.archivedOrder.join(",")}]` : ""));
  }
  console.log(`    menu draws discarded to reach it: ${o.arms.map((a) => `${a.label} ${a.draws}`).join(", ")}` +
              (JSON.stringify(ord(o.arms[0])) === JSON.stringify(o.archivedOrder)
                ? "  -> ANCHORED to the archived order, so the baseline's argmax is comparable to the run's"
                : "  -> NOT the archived order, so the baseline's argmax is NOT comparable to the archived choice"));
  if (o.orderNote) {
    console.log(`    *** ORDER NOT HELD CONSTANT. ${o.orderNote}`);
  }
  if (opts.printCriteria) {
    for (const a of o.arms) {
      console.log(`\n  --- criteria, ${a.label} ---`);
      const c = a.call && a.call.questions && a.call.questions.objective.criteria;
      if (!c) { console.log("      (no call retained)"); continue; }
      for (const n of ord(a)) console.log(`      ${String(n).padEnd(14)} ${c[n]}`);
    }
  }
  if (o.dryRun) {
    for (const t of o.textChanged) console.log(`    ${t.label} state text vs baseline: ${t.same ? "IDENTICAL" : "DIFFERS"}`);
    console.log(`    --dry-run: no endpoint calls. Nothing above is a model result.`);
    return;
  }
  const base = o.arms[0];
  for (const a of o.arms) {
    const tag = a.label === "baseline" ? "baseline" : `patched (${a.file})`;
    console.log(`\n    ${tag}`);
    console.log(`      objective probs  fwd ${JSON.stringify(a.obj.fwd)}`);
    if (a.obj.rev) console.log(`                     rev ${JSON.stringify(a.obj.rev)}`);
    console.log(`                     avg ${JSON.stringify(a.obj.avg)}`);
    console.log(`      objective argmax ${a.obj.choice}` +
                (a === base ? `   archived ${o.archivedObjective}${o.archivedObjective === a.obj.choice ? "  (agrees)" : "  (DIFFERS)"}` : ""));
    if (a.move) {
      console.log(`      chained move for ${a.obj.choice}: ${JSON.stringify(a.move.probs)}`);
      console.log(`      chained move argmax ${a.move.choice}`);
    }
  }
  if (o.arms.length > 1) {
    const p = o.arms[1];
    const d = diffProbs(p.obj.avg, base.obj.avg, 0);
    console.log(`\n    objective delta patched vs baseline (avg, per goal):`);
    for (const r of d.rows) {
      const mark = r.d <= 0 ? "==" : "!=";
      console.log(`      ${mark} ${r.k.padEnd(11)} patched ${String(r.got).padEnd(22)} baseline ${String(r.want)}`);
    }
    console.log(`      max abs delta ${d.max.toExponential(3)}   argmax: patched ${p.obj.choice}  baseline ${base.obj.choice}` +
                (p.move && base.move ? `\n      chained move delta max abs ${diffProbs(p.move.probs, base.move.probs, 0).max.toExponential(3)}` +
                `   argmax: patched ${p.move.choice}  baseline ${base.move.choice}` : ""));
    console.log(`      NOTE: a delta of exactly 0 across both questions means the instrument saw no change;`);
    console.log(`            with --patched pointing at decision.cjs that is the expected NULL CONTROL.`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const archive = JSON.parse(fs.readFileSync(opts.run, "utf8"));
  if (!archive.log || !archive.log.length) die(`archive has no log: ${opts.run}`);
  const priorDeaths = loadPriorDeaths(opts.parlog, archive.log);
  const client = makeClient();

  if (opts.selftest || opts.each) return selftest(archive, opts, priorDeaths, client);

  const res = await probeOne(archive, opts, priorDeaths, opts.decision, client);
  if (res.skipped) { console.error(`\nprobe_move SKIPPED decision ${opts.decision}: ${res.skipped}\n`); process.exit(3); }

  console.log(`\n=== probe_move: decision ${res.decision} of ${path.basename(opts.run)}`);
  console.log(`    level=${archive.levelIndex} objective=${res.objective} move=${res.entry.move} mf=${res.entry.movingFrames}`);
  console.log(`    archived probs: ${JSON.stringify(res.entry.moveProbs)}`);
  console.log(`\n  reconstruction provenance:`);
  for (const l of res.ledger) console.log(`    ${l.field.padEnd(26)} ${l.how}`);

  if (res.dryRun) {
    console.log(`\n  --dry-run: reconstruction and prompt build only. Nothing was sent to the endpoint.`);
    printObjective(res, opts);
    if (opts.showState) console.log(`\n  ---- reconstructed prompt ----\n${res.base.state}\n  ---- end prompt ----`);
    console.log("");
    return;
  }

  printObjective(res, opts);

  const d = diffProbs(res.base.probs, res.entry.moveProbs, opts.tol);
  console.log(`\n  baseline (${opts.baseline || "driver/decision.cjs"}):`);
  for (const r of d.rows) {
    const mark = r.d <= opts.tol ? "==" : "!=";
    console.log(`    ${mark} ${r.k.padEnd(11)} got ${String(r.got).padEnd(22)} archived ${String(r.want)}`);
  }
  console.log(`    argmax: got ${res.base.choice}   archived ${res.entry.move}`);
  console.log(`    max abs delta ${d.max.toExponential(3)}  -> ${d.ok ? "REPRODUCED" : "NOT reproduced"} at tol ${opts.tol}`);

  if (res.patched) {
    const p = diffProbs(res.patched.probs, res.base.probs, opts.tol);
    console.log(`\n  patched (${opts.patched}) vs baseline (${opts.baseline || "driver/decision.cjs"}):`);
    for (const r of p.rows) {
      const mark = r.d <= opts.tol ? "==" : "!=";
      console.log(`    ${mark} ${r.k.padEnd(11)} patched ${String(r.got).padEnd(22)} baseline ${String(r.want)}`);
    }
    console.log(`    argmax: patched ${res.patched.choice}   baseline ${res.base.choice}`);
    console.log(`    max abs delta ${p.max.toExponential(3)}`);
  }

  if (opts.showState) {
    console.log(`\n  ---- reconstructed prompt ----\n${res.base.state}\n  ---- end prompt ----`);
  }
  console.log("");
}

// ------------------------------------------------------------------ selftest

// The archive's own repeat groups: entries with an identical reconstructed state.
// Two things are measured, separately, because they are different claims:
//   (a) does the ARCHIVE agree with itself across the pair?
//   (b) does the PROBE reproduce the archived answer?
// 120 identical pairs plus 1 that differs is the expected shape.
function stateKey(archive, e, opts) {
  const level = opts.level != null ? opts.level : archive.levelIndex;
  const GEMS = loadGemTable();
  const levelGems = GEMS[level] || [];
  return JSON.stringify([
    level, e.cat.x, e.cat.y, e.onPlatform, e.movingFrames, e.gemsCollected,
    e.objective, opts.catHeight, opts.canvasWidth, levelGems.length,
  ]);
}

async function selftest(archive, opts, priorDeaths, client) {
  const log = archive.log;
  const groups = new Map();
  for (let i = 0; i < log.length; i++) {
    const k = stateKey(archive, log[i], opts);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const pairs = [...groups.entries()].filter(([, ix]) => ix.length >= 2);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  let archiveIdentical = 0, archiveDiffers = 0;
  for (const [, ix] of pairs) {
    if (same(log[ix[0]].moveProbs, log[ix[1]].moveProbs)) archiveIdentical++;
    else archiveDiffers++;
  }
  console.log(`\n=== probe_move selftest: ${path.basename(opts.run)}`);
  console.log(`    ${log.length} decisions, ${pairs.length} repeat groups of an identical reconstructed state`);
  console.log(`    (a) archive self-agreement: ${archiveIdentical} identical, ${archiveDiffers} differ`);

  // Only probe groups that are exactly reconstructible: grounded (dy=0 provable)
  // and gemsCollected=0 (gemPositions provable).
  const eligible = pairs.filter(([, ix]) => {
    const e = log[ix[0]];
    // Same eligibility rule as --each, so the two views never disagree about
    // what is probeable: grounded needs nothing extra now that dy is logged, and
    // a collected gem is fine as long as gemPositions is in the archive.
    return e.gemPositions != null || e.gemsCollected === 0;
  });
  const noGems = pairs.filter(([, ix]) => log[ix[0]].gemPositions == null).length;
  console.log(`    (b) group view only, NOT the --each eligibility: ${eligible.length} of ${pairs.length} ` +
              `groups are reconstructible. Airborne decisions ARE eligible (dy logged since 1ccb0ea) and ` +
              `collected-gem decisions are eligible once gemPositions is logged` +
              (noGems ? `; ${noGems} group(s) here are from an archive predating that field.` : `.`));
  if (pairs.length && !eligible.length) {
    console.log(`\n    NO eligible group: the acceptance test cannot run. Nothing was sent to the endpoint.\n`);
    return;
  }

  const use = eligible.slice(0, opts.limit);
  // --pairs: probe EVERY eligible repeat against its OWN archived probs, instead of
  // only the first occurrence of each group. The acceptance figure is a repeat-pair
  // count (289 decisions - 168 distinct states = 121 repeats on the L11 archive), so
  // this is the mode that reports "reproduced N of M, missed K" in those units.
  let targets;
  if (opts.each) {
    // --each: probe EVERY decision against its OWN archived moveProbs. Decision N's
    // archived vector is the ground truth for decision N's prompt. No pairs, no
    // groups: the pair framing measured the DRIVER's determinism, and with
    // presentedOrder logged a state keyed by menu order collapses the repeat count
    // from 121 to 10, which would gate the instrument on ten comparisons.
    targets = log.map((_, i) => i).slice(0, opts.limit);
    const ref = log.filter((e) => e.gemsCollected > 0 && e.gemPositions == null).length;
    console.log(`    --each: probing ${targets.length} decision(s) of ${log.length}, each against its OWN archived probs`);
    console.log(`    expected refusals: ${ref}` +
                (ref ? ` (gemsCollected>0 in an archive predating gemPositions). Airborne is NOT a refusal ` +
                        `reason any more: cat.dy is logged since 1ccb0ea, and neither is a collected gem.\n`
                     : ` (none: gemPositions is logged, so every alive-gem list is exact). Airborne is NOT a ` +
                        `refusal reason any more: cat.dy is logged since 1ccb0ea.\n`));
  } else if (opts.pairs) {
    const firstIx = new Map();
    const repIx = [];
    for (let i = 0; i < log.length; i++) {
      const k = stateKey(archive, log[i], opts);
      if (firstIx.has(k)) repIx.push(i);
      else firstIx.set(k, i);
    }
    const ok = (e) => e.gemPositions != null || e.gemsCollected === 0;
    targets = repIx.filter((i) => ok(log[i])).slice(0, opts.limit);
    console.log(`    --pairs: probing ${targets.length} eligible REPEAT decision(s) of ${repIx.length} repeats, ` +
                `each against its own archived probs\n`);
  } else {
    targets = use.map(([, ix]) => ix[0]);
  }
  console.log(`    probing ${targets.length} target(s), mf pinned from each entry, tol ${opts.tol}` +
              `${opts.dryRun ? "  [--dry-run: no endpoint calls]" : ""}\n`);
  let reproduced = 0, failed = 0, skipped = 0;
  for (const i of targets) {
    const e = log[i];
    let r;
    try {
      const res = await probeOne(archive, opts, priorDeaths, i, client);
      if (res.skipped) { skipped++; console.log(`    d${String(i).padStart(3)} SKIP ${res.skipped}`); continue; }
      if (res.dryRun) {
        skipped++;
        console.log(`    d${String(i).padStart(3)} reconstructed: prompt ${res.base.state.length} chars, ` +
                    `archived probs ${JSON.stringify(e.moveProbs)}`);
        continue;
      }
      const d = diffProbs(res.base.probs, e.moveProbs, opts.tol);
      if (d.ok) { reproduced++; console.log(`    d${String(i).padStart(3)} REPRODUCED  max delta ${d.max.toExponential(2)}  argmax ${res.base.choice}`); }
      else {
        failed++;
        console.log(`    d${String(i).padStart(3)} DIFFERS    max delta ${d.max.toExponential(3)}  got ${res.base.choice} archived ${e.move}`);
        for (const row of d.rows.filter((x) => x.d > opts.tol)) {
          console.log(`           ${row.k}: got ${row.got} vs archived ${row.want}`);
        }
      }
    } catch (err) {
      skipped++;
      console.log(`    d${String(i).padStart(3)} ERROR ${err.message}`);
    }
  }
  console.log(`\n    reproduced ${reproduced}, differs ${failed}, skipped ${skipped} of ${targets.length} probed`);
  if (reproduced + failed > 0 && failed === 0) {
    console.log(`    NOTE: every probed group reproduced. If the archive contains a pair that DIFFERS, that is\n` +
                `          expected — the probe reproduces the archived answer, and a nondeterministic pair has\n` +
                `          no single archived answer to match. Reproducing all of them is not proof of exactness.`);
  }
  console.log("");
}

main().catch((e) => { console.error(`\nprobe_move FAILED: ${e && e.stack ? e.stack : e}\n`); process.exit(1); });
