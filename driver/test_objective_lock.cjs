// Assert-based check: the objective is HELD across a jump arc, not re-asked.
//
// Lives in its own file because test_death_history.cjs ends inside a construct
// whose trailing brace is the last line: anything appended after it is parsed
// but never executed, which silently turns a new check into dead code.
//
// Run: node driver/test_objective_lock.cjs
"use strict";
const assert = require("assert");
const d = require("./decision.cjs");

// Minimal classifier stub: records every call and answers with the first label.
function stubClient() {
  const asked = [];
  return {
    asked,
    async classify(state, questions) {
      asked.push({ state, questions });
      const answers = {};
      for (const [k, q] of Object.entries(questions)) {
        if (q.type === "noul") answers[k] = { type: "noul", noul: 0.9 };
        else {
          const names = Object.keys(q.criteria);
          answers[k] = {
            type: "choice",
            choice: names[0],
            probabilities: Object.fromEntries(names.map((n) => [n, 1 / names.length])),
          };
        }
      }
      return answers;
    },
  };
}

// --- Airborne objective lock -------------------------------------------------
// Re-asking the objective mid-jump replaces a well-informed choice with an
// uninformed one: the stranding annotations are anchored by platformKeyUnder,
// whose 14px tolerance stops resolving a few frames into a jump, so the airborne
// listing is bare distances and the nearest gem wins. On level 4 the nearest gem
// is the one that strands the cat, and the steer that follows cancels the jump
// that was just launched. These checks pin the hold: airborne reuses the
// launch objective and makes NO objective call, grounded always re-asks, and a
// held objective that has left the menu is dropped rather than forced.
(async () => {
  const L4_GEMS = [[289, 156], [105, 164], [182, 226]];
  const mk = (o) => ({
    level: 4, gemsCollected: 0, aliveGems: 3,
    gemPositions: L4_GEMS.map(([x, y]) => ({ x, y })),
    moving: true, onPlatform: !!o.onPlatform,
    cat: { x: o.x, y: o.y, dy: o.dy || 0, height: 18 },
    drones: { tl: { x: 0, y: 2 }, tr: { x: 358, y: 0 }, bl: { x: 2, y: 310 }, br: { x: 360, y: 309 } },
  });
  // The objective question is the one whose criteria include a gem name.
  const objectiveCalls = (c) => c.asked.filter((a) => a.questions && a.questions.objective).length;

  // Sanity: the premise these checks exist for. The mid-jump state really does
  // lose the reachability anchor that carries the stranding annotations.
  const REACH = require("./reachability.cjs");
  assert(REACH.platformKeyUnder(4, 129.75, 93) !== null, "launch point should resolve to a floor");
  assert(REACH.platformKeyUnder(4, 136.75, 75) === null, "mid-jump state no longer loses its floor anchor; the lock's premise changed");
  assert(/LOSES gem_a PERMANENTLY/.test(d.buildObjectiveCall(mk({ x: 129.75, y: 93, onPlatform: true }), L4_GEMS, []).state),
    "grounded listing lost its stranding annotation");
  assert(!/LOSES gem_a PERMANENTLY/.test(d.buildObjectiveCall(mk({ x: 136.75, y: 75 }), L4_GEMS, []).state),
    "airborne listing now carries the stranding annotation; the lock may be unnecessary");

  // Airborne with a valid held objective: reused, and no objective call made.
  let c = stubClient();
  let memo = { lockedObjective: "gem_a" };
  let r = await d.decide(c, mk({ x: 136.75, y: 75, dy: -5.2 }), L4_GEMS, () => {}, [], null, memo);
  assert(r.objective === "gem_a", `airborne should hold gem_a, got ${r.objective}`);
  assert(objectiveCalls(c) === 0, `airborne should make no objective call, made ${objectiveCalls(c)}`);

  // Grounded: always re-asks, and the answer replaces the held objective.
  c = stubClient();
  memo = { lockedObjective: "gem_a" };
  r = await d.decide(c, mk({ x: 129.75, y: 93, onPlatform: true }), L4_GEMS, () => {}, [], null, memo);
  // Two calls: the drawn label order and its reverse, averaged to cancel the
  // first-position bias that otherwise picks a one-way descent about 1 time in 10.
  assert(objectiveCalls(c) === 2, `grounded should ask the objective twice (order-debiased), asked ${objectiveCalls(c)}`);
  const asked2 = c.asked.filter((a) => a.questions && a.questions.objective);
  const fwdOrder = Object.keys(asked2[0].questions.objective.criteria);
  const revOrder = Object.keys(asked2[1].questions.objective.criteria);
  assert.deepStrictEqual(revOrder, [...fwdOrder].reverse(),
    "the second objective call must present the SAME labels in reversed order, or the debias does nothing");
  assert(memo.lockedObjective === r.objective, "grounded decision must refresh the held objective");

  // Held objective no longer on the menu (collected mid-arc, or a waypoint that
  // airborne states do not offer): drop it and ask rather than force it.
  c = stubClient();
  memo = { lockedObjective: "descent_right" };
  r = await d.decide(c, mk({ x: 136.75, y: 75, dy: -5.2 }), L4_GEMS, () => {}, [], null, memo);
  assert(objectiveCalls(c) === 2, "a held objective that left the menu must be re-asked (order-debiased, so twice)");
  assert(r.objective !== "descent_right", "must not pursue an objective that is not on the menu");

  // No memo at all (layaDecide/halogenDecide call shape): behaves as before.
  c = stubClient();
  r = await d.decide(c, mk({ x: 136.75, y: 75, dy: -5.2 }), L4_GEMS, () => {}, [], null, undefined);
  assert(objectiveCalls(c) === 2, "without a memo the airborne objective must still be asked (order-debiased, so twice)");

  console.log("airborne objective lock: PASS");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

// --- Jump-landing note -------------------------------------------------------
// Level 4's start floor (x 95..147 at y=93) faces a 52px gap to a floor at the
// SAME height (x 199..251). A jump only carries far enough to reach it from
// x>=137; from further left the cat clears the gap but arrives below the far
// floor's top and lands on a one-way lower floor, or falls past everything into
// the bottom laser. Nothing distinguished x=130 from x=140, and the cat launched
// from x=129.75 in 14 of 16 deaths. Reachability here must come from the
// air-control model, not a held-action arc replay: a held action flies past
// floors the cat could reach by easing off, and a fact derived from one was
// wrong before.
(async () => {
  const REACH = require("./reachability.cjs");
  const L4_GEMS = [[289, 156], [105, 164], [182, 226]];
  const mk = (x, y = 93) => ({
    level: 4, gemsCollected: 0, aliveGems: 3,
    gemPositions: L4_GEMS.map(([a, b]) => ({ x: a, y: b })),
    moving: true, onPlatform: true, cat: { x, y, dy: 0, height: 18 },
    drones: { tl: { x: 0, y: 2 }, tr: { x: 358, y: 0 }, bl: { x: 2, y: 310 }, br: { x: 360, y: 309 } },
  });
  const noteAt = (x, obj = "gem_a") =>
    d.buildMoveCall(mk(x), L4_GEMS, obj, []).state.split("\n").find((l) => l.startsWith("A jump from x")) || null;

  // Fires in the losing band and names both sides of the fact.
  const n = noteAt(129.75);
  assert(n, "no jump-landing note at x=129.75, the position that killed the cat 14 times");
  assert(/gem_a cannot be reached from there/.test(n), `note must say the objective is lost: ${n}`);
  assert(/A jump from x 139\.\.\d+ on this same floor/.test(n), `note must give the launch window: ${n}`);

  // Silent once a jump actually reaches the far floor.
  for (const x of [138, 140, 146]) {
    assert(!noteAt(x), `note must be silent at x=${x}, where a jump reaches the far floor`);
  }

  // The stated window must agree with the air-control model it is derived from,
  // not be a number baked into the string.
  const runs = REACH.runsOf(4);
  const reaches = (x) => [...REACH.landingsFrom(4, runs, x, 93, true, 18)].includes("floor(199..251@93)");
  assert(!reaches(137.5) && reaches(137.75),
    "the launch threshold moved; the note's window text is derived from landingsFrom and must be re-read");

  // The horizontal budget at vertical frame f is f-1 frames of walking: the
  // launch frame applies the jump and the position update without a horizontal
  // step. Measured against 179 airborne samples from real level 2/3/4 runs, the
  // vertical index matches the horizontal index plus one 119 times against 1 for
  // no offset. Without it the model over-reports reach by exactly 1.75px, which
  // is the width that decided a boundary case on level 4: it claimed a jump from
  // (285.5,171) grazes the floor at y=93, and the cat fell past it every time.
  assert(![...REACH.landingsFrom(4, REACH.runsOf(4), 285.5, 171, true, 18)]
    .includes("floor(199..251@93)"),
    "landingsFrom claims a jump from (285.5,171) reaches the y=93 floor; the one-frame horizontal offset is gone");
  assert([...REACH.landingsFrom(4, REACH.runsOf(4), 275, 171, true, 18)]
    .includes("floor(156..208@241)"),
    "landingsFrom must still reach gem_c's floor from the left half of the y=171 floor");

  // Scope: this note must not appear on levels that already pass. Sweeping every
  // floor of levels 0-3 at walk-speed granularity, for every gem objective.
  const fs = require("fs");
  const cfg = require("path").join(__dirname, "..", "cat-goric-game/src/scripts/constants/config.ts");
  if (!fs.existsSync(cfg)) { console.error("FAIL: cat-goric-game submodule not initialized; run `git submodule update --init --recursive`"); process.exit(1); }
  const src = fs.readFileSync(cfg, "utf8");
  const seg = src.slice(src.indexOf("gemsPositionsPerLevel"));
  const st = seg.indexOf("= [") + 2;
  let dep = 0, i = st;
  for (; i < seg.length; i++) { if (seg[i] === "[") dep++; else if (seg[i] === "]") { dep--; if (!dep) break; } }
  const GEMS = eval(seg.slice(st, i + 1));
  for (const lvl of [0, 1, 2, 3]) {
    const lg = GEMS[lvl];
    for (const r of REACH.runsOf(lvl)) {
      for (let x = r.left; x <= r.right; x += 1.75) {
        const snap = { ...mk(x, r.y), level: lvl, aliveGems: lg.length,
          gemPositions: lg.map(([a, b]) => ({ x: a, y: b })) };
        for (const name of ["gem_a", "gem_b", "gem_c"]) {
          let state;
          try { state = d.buildMoveCall(snap, lg, name, []).state; } catch (e) { continue; }
          assert(!state.split("\n").some((l) => l.startsWith("A jump from x")),
            `jump-landing note fired on level ${lvl} at (${Math.round(x)},${r.y}) for ${name}; levels 0-3 pass today and must stay untouched`);
        }
      }
    }
  }

  console.log("jump-landing note: PASS");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

// --- The level-advance detector must require FORWARD progress -----------------
// A level 4 run ended "level 4 CLEARED -> advanced to level 0" with 1 of 3 gems
// and no portal: the game had restarted, and any change of level index away from
// the target counted as a clear. A backward jump is a restart. Level 13 is the
// exception, because advancing out of the last level may wrap the index.
{
  const fs = require("fs");
  const path = require("path");
  const lvl = fs.readFileSync(path.join(__dirname, "run_level.cjs"), "utf8");
  assert(/const forward = s\.level > levelIndex \|\| levelIndex === 13;/.test(lvl),
    "run_level.cjs no longer requires a FORWARD level change before calling a level cleared");
  assert(/RESTARTED -> game went BACK to level/.test(lvl),
    "run_level.cjs does not report a backward level jump as a restart");
  assert(/if \(peakCollected < 3\) \{[\s\S]{0,400}?throw new Error\(/.test(lvl),
    "run_level.cjs must raise when a 'cleared' level collected fewer than 3 gems, not bank the clear");
  const full = fs.readFileSync(path.join(__dirname, "run_full.cjs"), "utf8");
  assert(/if \(s\.level < lastLevel\) \{/.test(full),
    "run_full.cjs does not detect a backward level jump");
  console.log("level-advance detector: PASS");
}

// --- The prompt must agree with the action menu about jumping -----------------
// legalActions prunes every jump once head clearance drops below
// rise + droneSpeed*frames (64.6px), but the prompt's jump description and its
// ceiling warning both used the bare 61.2px rise. Between those two numbers the
// jump options disappeared from the menu with nothing in the prompt explaining
// why, and the prompt went on describing a jump the cat could not make. On level
// 4 that band opens at 48 moving frames on the y=93 floors, long before the cat
// returns there holding gem_a.
{
  const L4_GEMS = [[289, 156], [105, 164], [182, 226]];
  const rest = [{ x: 105, y: 164 }, { x: 182, y: 226 }];
  const at = (mf, y = 93) => ({
    level: 4, gemsCollected: 1, aliveGems: 2, gemPositions: rest, moving: true, onPlatform: true,
    cat: { x: 210, y, dy: 0, height: 18 },
    drones: { tl: { x: 0, y: 1 + 0.2 * mf }, tr: { x: 347, y: 0 }, bl: { x: 13, y: 310 }, br: { x: 360, y: 298 } },
  });
  let sawBoth = 0;
  for (let mf = 0; mf <= 120; mf += 4) {
    const snap = at(mf);
    const acts = Object.keys(d.legalActions(snap));
    const state = d.buildMoveCall(snap, L4_GEMS, "gem_b", []).state;
    const canJump = acts.includes("jump");
    const claimsJump = /A jump lifts the cat up to/.test(state);
    const explainsLoss = /jumping is no longer possible from this floor/.test(state);
    assert(canJump === claimsJump,
      `mf=${mf}: menu ${canJump ? "offers" : "prunes"} jumps but the prompt ${claimsJump ? "describes" : "does not describe"} one`);
    if (!canJump) assert(explainsLoss, `mf=${mf}: jumps pruned but the prompt never says why`);
    sawBoth |= canJump ? 1 : 2;
  }
  assert(sawBoth === 3, "this check must cover both a jumpable and a non-jumpable state to mean anything");
  console.log("jump availability matches the prompt: PASS");
}

// --- Screenshots must picture the level under test, and the frame BEFORE death --
// Two bugs this guards against, both found by looking at the PNGs:
//   1. gameLoop.stop() runs before the level seek, so the canvas still held the
//      level the page booted into (0). Every spawn shot pictured the wrong level.
//   2. The game resets the level inside stepFrame, so by the time a death is
//      detected the canvas already shows the respawn, not the death.
{
  const fs = require("fs");
  const path = require("path");
  const lvl = fs.readFileSync(path.join(__dirname, "run_level.cjs"), "utf8");

  assert(/propagateGameLoopRender\(\)/.test(lvl),
    "spawn shot must repaint after the level seek, or it pictures the booted level");
  assert(/clearRect\(0, 0, c\.width, c\.height\)/.test(lvl),
    "the repaint must clear first (stepFrame does), or frames smear");
  assert(lvl.indexOf("propagateGameLoopRender()") < lvl.indexOf('await shot("000_spawn")'),
    "the repaint must happen BEFORE the spawn shot, not after");

  assert(/path: `\$\{SHOT_DIR\}\/_pre\.png`/.test(lvl),
    "a rolling pre-decision frame must be captured, or death shots show the respawn");
  assert(/copyFileSync\(PRE, `\$\{SHOT_DIR\}\/death\$\{n\}_pre_at_/.test(lvl),
    "recordDeath must preserve the rolling frame as the pre-death picture");
  assert(lvl.indexOf("_pre.png`") < lvl.indexOf("const _t0 = Date.now()"),
    "the pre-frame must be taken BEFORE the decision resolves, not after");
  assert(/if \(SHOT_PRE\) \{ try \{ await page\.screenshot/.test(lvl),
    "the per-decision pre-frame must stay opt-in; it costs a screenshot every decision");

  console.log("screenshot wiring: PASS");
}
