# Open problems

## 1. The route has a deadline and nothing checks it

This is the one diagnosis worth building on.

**The objective layer commits to a gem on geometric reachability alone, and the world has a clock.** Lasers close monotonically with `movingFrames`, so a route that is available early is gone later, and nothing re-evaluates. Three failing levels were diagnosed independently, from different starting questions, and all three reduce to this:

```
L4   the gap crossing is legal while mf < 91    ; the run reaches mf 362
L11  the gem_a jump is legal while mf <= 176    ; the cat arrives at mf 292
L12  gem_b burns at mf ~202                     ; every life is a ~205-frame race
```

This is why every per-decision predicate tried so far has failed (see [dead-ends.md](dead-ends.md)). The quantity that matters is a property of **a route against a clock**, not of an option against its siblings. Building it needs a path cost with a time budget. `driver/route_clock.cjs` builds it (536 lines), but only its `gemDeadline` reaches the prompt, through the DESTROYED FIRST annotation in `buildObjectiveCall`. Its DEAD/ALIVE waypoint verdicts never fire on the failing levels (see [dead-ends.md](dead-ends.md)), so if the clock goes into the prompt again, the form that can fire is a slack figure for the objective already chosen, gated like the countdown affordability rule. **Update 2026-10-08: that form was built (`BURN_FACTS`, see the 2026-10-08 section of [results.md](results.md)) - it fires with mixed states exactly as the census predicted, is provably safe on the clearing levels, and changes nothing.** The clock is not what the model needs told; the L12 post-mortem in §2b shows the dawdle is an execution oscillation, not a misjudged race.

### Level 4 in full, because it is the clearest case

The cat spawns at (121, 81) on `floor(95..147@93)`. From there gem_c is reachable and **the route has no deadline at all**:

```
walk left, step off the edge at x~94
airborne: choose `none`      -> lands (94,180) on floor(79..131@180)
walk right                   -> lands (162.5,241) on floor(156..208@241) = gem_c
```

Every step survives at moving frames 0, 100, 200 and 300. The cat never tries it: on that floor its objective is `gem_a` on 18 of 18 decisions, it never goes below x=129.8 against an edge at 95, and `none` is chosen twice in 256 decisions. Pursuing gem_a is what carries it to the y=171 dead end whose only exit is the backward jump.

## 2. Level 4's decisions are degenerate

Its 42 backward-jump decisions are only 10 distinct `(x, movingFrames)` pairs, at most eight repeats each. Argmax on an identical prompt cannot answer differently, so the model is not choosing wrongly 42 times, it is answering the same question 42 times.

Breaking that is a `cadence.cjs` question (how often to re-ask) rather than a `decision.cjs` one (what to say). Unmeasured.

## 2b. Levels 3, 6 and 12: first measured diagnoses (2026-10-08)

Diagnosed from the `exp_lag2_s1/s2` archives plus offline simulation of the fatal states; no new prompt fact was tried. All numbers are from the current best build.

**All three share a shape: the first gem or two come fast (mf 80–150), then the route to the next gem takes ~300 frames and the cat dies in its final stretch at the closing laser, or loops.** The route-clock diagnosis of section 1, with three distinct mechanisms:

### Level 6 — greedy-objective ping-pong; the productive hop is offered and refused

Every life collects gem_b(225,181) at mf~97 and gem_c(221,108) at mf~150, then loops to the step cap or dies at mf 427–473 (7 deaths, both seeds). gem_a(135,143) sits on floor(103..155@184), reachable only via the top chain floor(241..293@176) → floor(289..341@136) → floor(257..309@78) → floor(194..246@60) → floor(128..180@79) → drop back to 184. The menu DOES offer the chain's first hop — `ascent_right@(291,136)` from floor(241..293@176) at mf 160–300, verified against `ascentPoints` — but the model picks `gem_a` and walks left (straight-line greedy: p(left) 0.7–1.0 against p(jump_right) ~0.02), steps off the left edge onto floor(211..263@220), and there the only ascent offered is `ascent_right@(255,176)`, the floor it just left. The cycle burns ~100 frames per repetition. The ping-pong is structural, not a menu gap: `arc.simulate` shows the left jump from floor(211..263@220) misses gem_a's floor by ~3px (lands x~158 against its edge at 155) and falls to the laser. No escape mechanism fires, and each is correct not to: the stranding check knows gem_a is reachable (it is, via the chain); the countdown is silent because the cat is locally safe at every decision; gem_a's deadline (670) outlives the run so nothing burns. Escalation does fire (46 SAMPLE decisions at T=1.5 in one archive) but sampling a ~2% tail rarely escapes. `STICKY_OBJECTIVE` pins the loop further: gem_a held 132 times, ascent_right 9, in one archive — each is its floor's first choice, so the lock makes the ping-pong deterministic.

### Level 12 — the crossing race, lost by ~7 frames

Every life collects gem_b(43,129) at mf~79, then spends ~300 frames crossing right to gem_a(279,169) (deadline 400) and dies at mf 372–400 in its final approach (x 240–280). One life of the 17 across both seeds made it: gem_a collected at mf 393 against the deadline of 400. The crossing is the race, and the cat is ~2x slower than the minimum: the deaths are at the deadline, not before it. This updates the older framing ("gem_b burns at mf~202"): on the current build b is collected long before it burns; the binding clock is gem_a's.

### Level 3 — zigzag ascent route, died at the deadline at one spot

Every life collects gem_a(186,118) mid-air at mf~120 and then dies at mf 431–481 chasing gem_b(216,103) (deadline 510), at x 100–140 y 150–220 with 1 gem. The route is a zigzag: from floor(118..170@203) the only ascent offered is `ascent_left@(101,150)` (verified against `ascentPoints`), which is legitimately part of the route (floor(70..122@150) → floor(119..171@106) → jump_right through gem_b mid-air), but the cat dies within ~25 frames of landing on floor(70..122@150) — the fatal decision is a confident `jump_left` (p=0.92) at mf 454, and the next move walks off that floor's left edge (x 70; nothing below) into the laser. Same shape as level 12: a slow route arriving at the deadline, dying at one repeat spot.

**What these three share, and what it rules out.** None of the three is a menu-coverage failure: the productive option is offered in every fatal state examined (L6's chain hop, L3's ascent_left, L12's descent_right). L12's route is feasible with ~185 frames of margin (`orderFeasibleN` from its gem_b collection point), so its blocker is execution cadence, not the clock; L3's deaths at mf 431–481 against gem_b's deadline of 510 are the same execution story arriving at the deadline. The shared mechanism: the objective layer re-picks the greedy gem every decision while the cat oscillates on the spot, because the objective call is never sampled even where the move call's escalation is maxed out.

## 3. Defects found and left in place

These were verified in the current tree. Two were fixed on 2026-10-08 and are marked as such; the rest are not fixed.

### `descentPoints` offered an edge that is death at the current laser state — FIXED 2026-10-08

`descentPoints` (decision.cjs:1693) gated each end of the floor with `landOn`, which integrates the fall and air-control reach but treats only the **bottom** laser as fatal: the comment says "an end that drops to the bottom laser is not a descent, it is death; do not offer it as a route". The **side** lasers were not consulted. On level 12 at mf 309 the right end of the floor at y 125 (x 299) stayed on the menu as `descent_right` while `arc.simulate` at that exact state returns `laser` at x 300.8 - stepping off there is instant death, offered as a route. The menu then contradicted the death history ("on a previous attempt from here you chose right and laser") and the model froze at the edge between the two. Fixed: the offer is gated on the fall surviving the real laser state at the current `movingFrames` (either release style), via the same `simulate` call `jumpLandingNote` uses. Blast radius measured order-insensitively over all `exp_lag2_s1/s2` archives: **only L12 changes** (93/292 and 85/292 decisions, every one at mf>=297 - the closed window); every clearing level and every other failing level is byte-identical.

**Method trap found while measuring this.** An offline prompt-diff between two builds of `decision.cjs` must be **order-insensitive**. The objective menu is shuffled with the module-level seeded RNG (`shuffleArray(entries, RNG)`), and the two module instances hold independent streams that stay in sync only while every call consumes the same number of draws. Any change that alters the menu ENTRY COUNT (this gate) desynchronizes the streams, and every later decision differs in list order - a naive string diff reported 14-53 false diffs on five clearing levels before the canon comparison (sorted criteria map + sorted state lines) showed the truth: zero. The CFG-fix diff survived this only because that fix changed note text, never entry counts.

### `STALL_WINDOW` differs between the two runners, and only one is guarded — FIXED 2026-10-09

`run_level.cjs` used 24 and `run_full.cjs` used 10. The 10 was measured as losing the race with the revisit escalation: a two-position oscillation hits a given 10px key every other decision, so escalation needs about 8 decisions to start sampling and the abort fires first. `test_death_history.cjs` asserted `STALL_WINDOW > 2 * (VISIT_STUCK_THRESHOLD + 1)`, but read the value out of `run_level.cjs` only, so the ladder runner's 10 passed unchecked. Fixed: both runners import one shared `stall_window.cjs` (24), and the guard asserts the shared value and that both runners import it. **Consequence:** ladder stall timing changed by design; pre-2026-10-09 ladder archives are not comparable on stall behaviour and the ladder deserves a live re-measurement.

### `npm test` does not run every test — FIXED 2026-10-09

`npm test` used to run `test_death_history.cjs` only, while the other suites existed beside it — "`npm test` green" did not mean all tests were green. Fixed: `npm test` now runs `test_all.cjs`, which runs all eight suites and pins `test_objective_lock.cjs`'s red-by-design status (it asserts the jump-landing note fires on level 4 only, and the same-floor variant fires on level 1; it is the gate on re-enabling that note, see [dead-ends.md](dead-ends.md)) to its exact failure line — the runner fails if that suite goes green or goes red for any other reason. A CI workflow (`.github/workflows/ci.yml`) runs the same suite on push and PR.

### An unwinnable reset records nothing — FIXED 2026-10-08

When a gem burned and 3 can no longer be collected, both runners reset the level and counted a death (`run_level.cjs`, `run_full.cjs`) without calling `recordDeath`. Nothing reached `deathHistory`, so `priorDeaths` stayed 0 and every life replayed the same argmax route. The stranding branch ten lines above did record, blaming the last grounded decision.

Measured on level 13 with `clef` on 2026-10-07: 11 deaths, an empty `deathLog`, and 0 decisions with `priorDeaths` above 0 in both `ATTRIB` arms. All 11 were this reset.

Fixed: both runners now record the reset through one shared blame rule, `run_stats.unwinnableDeath` — the last grounded decision (the route that let the gem burn), falling back to the cat's own position when no grounded decision exists yet in the life. `test_death_history.cjs` asserts the helper's precedence and that both runners' unwinnable branches call it and reach `deathHistory`. Re-run on level 13 (2026-10-08, `out/exp_fix`): the 11 resets now appear in `deathLog` (7 distinct blamed positions across the 11 lives), so the lives are no longer identical — but the level still fails at 11 deaths / 1 gem. The bookkeeping was necessary, not sufficient: level 13's real blocker is the clock (two gems burn while the cat is slow), same family as level 12's.

### `CFG.droneSpeed` was undefined in `floorBelow` — FIXED 2026-10-08

`decision.cjs` binds `CFG` to `config.cjs`, which exports no `droneSpeed`. Where a function does not shadow `CFG` with `physics.cjs`, `(snap.drones.tl.y - 1) / CFG.droneSpeed` is NaN. One site did: `floorBelow`, so the laser clock it passed to `arc.simulate` was NaN, every laser bound compared false, and the falling-floor note's remedy check could never reject a remedy the laser would cut off. (The earlier note here also named `jumpLandingNote`; that was stale — it shadows `CFG` with `physics.cjs` at its top, verified 2026-10-08.)

Fixed by the sibling idiom: a function-local `const CFG = require("./physics.cjs")`. `test_cfg_shadow.cjs` now scans every `CFG.<field>` read in `decision.cjs`, resolves it against the shadowing scope, and fails on any that reads a field the effective module does not export — both directions (a physics field outside a shadow, a config field inside one).

Measured blast radius (offline diff of both builds' prompts over every logged decision of `exp_lag2_s1/s2`, 3 837 decisions): the prompt changes on exactly 9 decisions — L4 6, L6 2, L8 1 — each one the falling-floor note being correctly suppressed where the claimed remedy dies at the real laser state. Every other level is byte-identical. Live: L8 (the only clearing level it can touch) still clears at both seeds; L4 seed 1 cleared where the baseline failed (n=1, directional only). See the 2026-10-08 section of [results.md](results.md).

### `simulate()` is called at the most favourable laser state

`arc.simulate` takes the laser clock as an argument. Passing 0 tests the most favourable state that ever existed and will report a fatal action as safe. In `decision.cjs`, 5 of the 7 call sites pass a constant (0 at lines 686, 947, 949, 1490 and 1 at line 838). Only lines 357 and 873 pass the real `movingFrames`. Whether that matters anywhere is unmeasured.

### `countdownWarnFrames: 200` is dead config — FIXED 2026-10-09

`physics.cjs` carried it with a long comment justifying the threshold, and nothing in the driver read it. A stale comment in `test_death_history.cjs` still called it 90. The countdown fires on the affordability rule instead. Removed, with the stale comment corrected.

### Probabilities are normalised over a set whose size changes

The move menu has 5 options grounded and 3 airborne, and the softmax runs over the permitted set of the call, so confidence numbers are not comparable across calls.

A related concern from the archive is now handled: a permitted label absent from `top_logprobs` is given a floor of `min(present) − 20` rather than dropped, and `labelsToProbs` counts the occurrences. Labels are single letters and `top_logprobs` is 20, so it should never fire. The counter is never read or reported anywhere, so whether it has ever fired is still unknown.

### Commit SHAs in the archive do not resolve

The docs attribute changes to `4807764`, `ec957bb`, `3590948`, `613d06e`, `53e0a9e` and `f5709e7`. None is an object in this repository: the work was lifted out of `felladrin/js13k-2021` and squashed into the two commits this repo has. Attribution by SHA is unrecoverable, and two effects that were reproduced twice each stay unattributed:

- **Harm:** level 3 went from 2 gems to 0 (535 dec / 9 deaths / 2 gems, to 518 dec / 8 deaths / 0 gems, twice, identical). Level 3 already failed, so no clear was lost, but the regression is real.
- **Gain:** level 12 collected gems for the first time (384 dec / 14 deaths / 0 gems, to 376 dec / 13 deaths / 2 gems, twice, identical). The pacing platform lost 44 decisions to the floors below it and `descent_right` won ten times more often, which is the mechanism level 12's diagnosis predicted.

Both runs carried the same two changes, so neither is separated. The cheapest open experiment would have been one run with each reverted, and it is no longer possible by SHA.

### The stale `decision.patched_*.cjs` variants are gone

Twenty `decision.patched_*.cjs` snapshots of the prompt builder from different nights were tracked in the tree, alongside `decision.real.cjs`, `hop_points.patched.cjs`, and `driver/.tdh_head_check.cjs` (a byte-identical copy of `test_death_history.cjs`). Running one silently reverted whatever had landed after it, while the summary line looked like a clean test. All removed on 2026-10-08; they remain in git history if a diff is ever needed. `driver/experiments/decision.descent-experiment.cjs` stays: it is documented in the experiments README.

## 4. The video

Made, on 2026-09-29. A 17m17s take reaches `CATEGORIC ESCAPE!` with the decision panel live on every decision, which is the thing the four deleted recordings got wrong. It is the raw screencast from `run_full.cjs` in demo mode (`DEMO_KEEP_LEVELS=0,1,2,5,7,8`), so it plays the 6 solid levels back to back and skips the rest: the win is a shortened ladder, not 14 levels cleared. The skips are recorded in the run JSON under `demoSkips`, and `driver/experiments/test_demo_skip.cjs` covers the rewrite.

What is still missing is the edit. The card and assembly pipeline in `driver/video/` was never run against this footage, so there are no title cards, no skip cards, and no real-time playback on deaths. Its 706-line write-up is in git history at `git show abc6174:docs/archive/team/VIDEO_PIPELINE.md`.

Four recordings existed on disk (three per-level webm files for levels 0, 1 and 2, plus a stitched mp4, 27 MB in total) and all four were **useless, and are deleted**. Sampled frames show the decision panel rendering its `objective` and `move` boxes empty, with no probability bars: they predate the fix for `run_level.cjs` never driving the panel. The bars are the whole point of the video, since they are the visible evidence that this is a classifier reading a next-token distribution rather than an LLM composing prose. A recording without them shows a cat moving by itself.

`test_death_history.cjs` now asserts that both runners drive the panel, so a new recording will not carry this defect.

Three things worth keeping:

- **The vehicle is `run_full.cjs`, not fourteen stitched files.** One `chromium.launch`, one context with `recordVideo`, and the victory screen detected and screenshotted.
- **The `VIDEO=1` spawn divergence exists once per take, at level 0, and nowhere else.** `gameLoop.stop()` is called exactly once, before the decision loop, and level changes are observed rather than performed, so after the first state read the game is a pure function of the frames the driver steps. `run_level.cjs` asserts the spawn state (moving frames 0, not on a platform, death count 0) precisely because a screencast once cost 4 frames before the first read and diverged the run at decision 0.
- **The budget is decision count, not wall clock.** A *winning* run is about 700 decisions, not the ~3400 you get by summing the current archives (twelve of which are failing runs whose decision counts measure flailing). At a 320ms hold that is under 4 minutes, so the risk is a video too *short* for the retention window. Add title cards and real-time playback on deaths rather than padding holds.

Video only finalises on `context.close()`, so a kill mid-run leaves a zero-duration unplayable webm. SIGTERM and SIGINT set `stopRequested`, the loop breaks, and the video finalises.

## 5. Levels never measured on a good build

Levels 5 to 13 have never had a clean regression baseline established the way levels 0 to 4 have. The counts in [results.md](results.md) come from a mix of builds.
