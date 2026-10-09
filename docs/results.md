# Results

## The clear test

A level cleared when `sawAdvance` is true: the cat advanced **forward** past the target level. Do not use `reachedWin`, which is set only when the game index reaches 14 and is therefore always false for a single-level run of levels 0 to 13. An earlier version of the history table keyed on `reachedWin` and concluded that nothing had ever cleared.

`run_level.cjs` treated any change of level index as a clear at one point, and reported "level 4 CLEARED -> advanced to level 0" when the game had simply restarted. Both runners now require a forward transition (level 13 excepted, because the index may wrap), report a backward jump as RESTARTED, and raise rather than bank a "clear" with fewer than 3 gems.

## Per level

Recomputed from all 182 run archives for levels 0 to 13 that were in `out/` and `out/runs/`. "Distinct outcomes" counts unique `(deaths, gems, decisions, steps)` tuples, which understates runs on a reproducible level and is exactly what makes it useful: one outcome across many files means the level reproduces.

**Those archives were deleted on 2026-09-28 and this table is now the only record of them.** Regenerating a row costs one run per sample at 400 to 900 seconds each, so treat the numbers below as the baseline and add to them rather than expecting to reproduce them.

| Level | Run files | Distinct outcomes | Distinct clears | Best clear (deaths/gems/decisions/steps) | Verdict |
| --- | --- | --- | --- | --- | --- |
| 0 | 17 | 3 | 3 | 0 / 3 / 5 / 78 | solid |
| 1 | 14 | 4 | 3 | 0 / 3 / 24 / 331 | solid |
| 2 | 15 | 11 | 7 | 1 / 3 / 74 / 516 | solid, varies, always clears |
| 3 | 11 | 9 | 2 | see note | **intermittent** |
| 4 | 10 | 4 | 0 | never cleared | failing |
| 5 | 19 | 6 | 4 | 0 / 3 / 26 / 278 | solid |
| 6 | 10 | 5 | 0 | never cleared | failing |
| 7 | 23 | 5 | 3 | 0 / 3 / 27 / 258 | solid, see note |
| 8 | 20 | 2 | 2 | 1 / 3 / 42 / 665 | solid |
| 9 | 6 | 5 | 3 | 1 / 3 / 74 / 919 | **intermittent** |
| 10 | 8 | 4 | 0 | never cleared | failing |
| 11 | 15 | 10 | 0 | never cleared | failing |
| 12 | 8 | 4 | 0 | never cleared | failing |
| 13 | 6 | 3 | 0 | never cleared | failing |

**6 solid, 2 intermittent, 6 failing.** Not "8 passing".

- **Trust** an outcome change on levels 0, 1, 2, 5, 7 and 8. A regression there is real.
- **Distrust** one on levels 3 and 9. Both have cleared and both have failed on byte-identical prompts, with zero firings of the clauses under test, so those failures are the levels' own variance rather than a regression. An earlier session lost hours hunting a regression that was never there, because it compared against a single-sample baseline.
- Levels 4, 6, 10, 11, 12 and 13 have no baseline to regress from.

**Level 3's clear archive is old.** Its lowest-death clear on disk records only 2 peak gems, which the current runner would refuse (`run_level.cjs` raises on a forward advance with fewer than 3 gems). That archive predates the guard. Treat level 3's numbers as unverified until it is re-run.

**Level 7's two non-clearing outcomes are from a worse configuration**, both before 22:06 on 2026-09-26. Every run from 22:41 onward clears. It was broken by a configuration and then fixed, not intermittent.

**There was a `run_level_14_halogen.json` with `reachedWin: true`, and it was not a win.** It records 0 decisions and 0 steps: it is a single-level run started on the victory screen, which is terminal on arrival. An earlier summary table listed it as "GAME WON". The victory screen has never been reached by playing.

## Endpoints

Almost the whole archive (176 of 182 files) was `halogen`, the halogen-flash-server logprobs classifier. `qwen_local` has 6 files.

Older documents describe halogen as a diagnostic control that does not satisfy the challenge. That was true before halogen-flash-server 0.13.8, when it could only generate a menu letter. Since 0.13.8 it scores a label from `top_logprobs` in one forward pass and runs the same `decide` policy as every other classifier, and the generate-and-parse path is preserved separately as `halogen_menu`.

`qwen_local` results on disk, for comparison:

| Level | Result | Deaths | Gems | Decisions | Steps |
| --- | --- | --- | --- | --- | --- |
| 0 | cleared | 0 | 3 | 5 | 78 |
| 2 | cleared | 6 | 3 | 262 | 1935 |
| 3 | cleared | 4 | 2 | 30 | 596 |
| 4 | failed | 0 | 1 | 18 | 221 |
| 5 | cleared | 0 | 3 | 26 | 278 |
| 6 | failed | 2 | 3 | 45 | 369 |

Earlier, on the hosted `demo` classifier, levels 0 and 1 cleared and level 1 was reproducible at 3 of 3 seeds with all three gems. The `demo` endpoint is not practical for deep work: about 3.1s per decision, so a level needing a few hundred decisions costs half an hour, plus intermittent 530s.

`laya` (421M, CPU) clears level 0 with all three gems. It was written off early on the assumption that its 1024-token context was too small, and that was wrong: `buildLayaMoveCall` was passing `platformMap(snap, 2, ...)`, giving it three fewer lines of geometry than Qwen and tripping the `tightBudget` branch that suppresses descent info entirely, justified by a stale comment reading "prompts are ~136 tokens today". With `maxNear 3` the full Qwen-grade state classifies fine. Laya is also not the fast loop: 5.6x faster per decision, about 50x more decisions, so 5.7x slower per level.

## Isolated runs and ladder runs are different measurements

A level run through `run_level.cjs` and the same level reached mid-ladder through `run_full.cjs` give different results, and it is not noise:

- Isolated, the level starts fresh: the RNG stream at its seed start, no prior death history, no carried trackers.
- In the ladder, the cat enters having just cleared the previous level, so it is at a different point in the seeded RNG stream and the cross-decision trackers (`lastChosen`, `lastGrounded`, `stallWindow`) carry state across the boundary.

Death history *is* cleared on level advance and the trackers are reset there too, so cross-level persistence is not the cause. The entry context is. Do not treat a ladder number and an isolated number as the same measurement.

## What is defended and what is not

Defended (multi-seed):

- the countdown affordability rule (2x2, 5 seeds per cell)
- the menu-position bias removal (level 2 gem_c selections 0 to 51, and n=3 slot rates flat)
- the `demo` level 0 and level 1 clears (level 1 at 3 of 3 seeds with 3 gems)

Not defended (n=1 or paired-null):

- the failure-attribution fix, which is paired-null on outcomes and kept only for log correctness
- any single-run observation, including every "build X improved level Y" claim in the archive

The recurring error across this project was calling n=1 observations results. Before believing any "X fixed Y", ask whether it was paired across seeds.

## JEV_STRICT port: neutral on level 12 (2026-09-29)

Endpoint: `halogen` (Halogen-Qwen3.8-Flash-Next-Instruct via llama-swap), `decide` path with order-debiased objective. The change is `STRICT_RULE` in `driver/jev.cjs` `buildSystem`, gated by `JEV_STRICT=1`; with the gate off the baseline system text is byte-unchanged.

Offline probe (`driver/experiments/probe_strict.cjs`): the objective call barely moves (gem_b 0.9976 to 0.9982, the urgency annotation dominates), but the move call sharpens at the L12 spawn (right 0.75 to 0.91, jump_right 0.23 to 0.08).

Live level 12 with `JEV_STRICT=1`, N=2: run 1 peak 1 gem, 9 deaths, 302 decisions; run 2 peak 1 gem, 8 deaths, 314 decisions. The merged-urgency baseline at N=3 was peak 1 gem, 8 to 9 deaths. Same first gem collected (gem_b, via the urgency patch), same death zone (right-side platforms, x 200 to 290, y 110 to 140), same 3000-step cap reached.

Verdict: the offline move-sharpening does not transfer to the level. `JEV_STRICT` stays gated off. This is consistent with the standing assessment that the level 12 blocker is post-choice spatial execution, not prompt discipline: a sharper argmax on the same route walks into the same lasers.

## Wall clock per level

From the two `survey_*.tsv` files, which are the only record of run duration. `halogen` through an SSH tunnel, one level per row, isolated runs.

| Level | Cleared | Deaths | Decisions | Peak moving frames | Steps | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | yes | 0 | 5 | 76 | 78 | 15 |
| 1 | yes | 0 | 36 | 410 | 415 | 88 |
| 2 | yes | 2 | 126 | 368 | 942 | 407 |
| 3 | yes | 3 | 178 | 336 | 984 | 563 |
| 4 | no | 12 | 487 | 343 | 3000 | 1410 |

A failing level costs 20 to 25 minutes because it runs to the 3000-step cap. This is the arithmetic behind the blast-radius rule in [method.md](method.md): budget by decisions, and do not sweep levels a change provably cannot reach.

## Frame traces

Two runs were captured at frame resolution with `FRAME_TRACE=1`, which records the bridge's per-frame ring rather than one entry per decision. Both are gone with the rest of the archive; this is what they held.

| Level | Endpoint | Steps | Deaths | Decisions | Batches |
| --- | --- | --- | --- | --- | --- |
| 12 | halogen | 3000 | 14 | 384 | 384 |
| 13 | halogen | 3000 | 22 | 552 | 552 |

## Clef (2026-10-07)

### Where it stands

Build `PRUNE_FATAL=1 MOVE_INSTR=2 JUMP_FACTS=1 HOLD_FIX=1 COL_FACTS=1 GEM_FACTS=1 STICKY_OBJECTIVE=1`, `ATTRIB` on, at the 2026-10-08 driver (survival with steering lag, the jump fact naming the neighbouring floor that has a way up). Archives `out/exp_lag2_s1` and `out/exp_lag2_s2`, each run file stamped with its `build`.

| Level | Seed 1 | Seed 2 |
| --- | --- | --- |
| 0 | cleared, 0 deaths, 4 decisions | same |
| 1 | cleared, 0, 30 | same |
| 2 | cleared, 0, 23 | same |
| 5 | cleared, 0, 24 | cleared, 0, 28 |
| 7 | cleared, 0, 19 | same |
| 8 | cleared, 2, 106 | cleared, 1, 64 |
| 9 | cleared, 0, 25 | cleared, 0, 29 |
| 10 | cleared, 0, 16 | same |
| 4 | not cleared, 6, 324 | cleared, 3, 155 |
| 3 | not cleared, 6 deaths, 1 gem | same |
| 6 | not cleared, 7 deaths, 2 gems | same |
| 11 | not cleared, 7 deaths, 2 gems | same |
| 12 | not cleared, 7 deaths, 2 gems | not cleared, 7 deaths, 1 gem |
| 13 | not cleared, 11 deaths, 1 gem | same |

**8 of 14 clear at both seeds** (0, 1, 2, 5, 7, 8, 9, 10). Levels 8 and 9 also cleared at seed 3 on the build before the lag fix, with the same counts it gives them. Level 4 is the most seed-sensitive level measured (78 to 324 decisions across builds and seeds): on the build before the lag fix it cleared at all three seeds, and the seed-1 failure under the lag fix splits from that build only after 1054 identical steps, on a landing 1.8px above the bottom laser, which is the game's unseeded laser thickness and not a decision.

What each of the three level changes needed:

- **Level 8**: the objective flapped on one floor (76% and 64% of consecutive decisions changed objective against 30-33% on level 5), and 15 of 17 deaths were at one spot. `STICKY_OBJECTIVE=1` took it to 20-21% and cleared it at three seeds.
- **Level 9**: every life jumped straight at the platform 133px overhead, because the jump fact said only "no higher platform can be reached by a jump from this floor". Naming the floor that does have a way up (x 140..192 at y 290) cleared it at three seeds with 0 deaths. Neither `GEM_FACTS` nor the lock was the cause: a 2x2 of them at seeds 1 and 2 all failed with 26-27 deaths.
- **Level 10**: the first `GEM_FACTS` sentence, the launch window from which one jump collects a gem above the floor.

The level-9 clause had a cost before the steering-lag fix was complete: level 13 gained 8 physical deaths at (110, 280), at both seeds, in every cell with the clause and in none without it (v6, v7 and `JUMP_FACTS=0` had none). Those deaths were moves the survival check passed because it ignored the steering lag; with the lag modelled they are 0 at both seeds. Level 13 still fails, on unwinnable resets at 1 gem, which record no death (see [open-problems.md](open-problems.md)).

The route clock does see level 11's wall: from the spawn every gem order is feasible, but the run reaches two gems at frame 93, about twice as slow as the fastest route, and from there gem_a is infeasible although its laser deadline is 375. The binding limit is the ceiling closing the one jump that collects it (from the y 114 floor) at about frame 178, which `gemDeadline`, and so the DESTROYED FIRST annotation, do not model.

Endpoint `clef`: the hosted Decisions service `clef`, `/v1/systemone`, base URL and key from the gitignored env file at the repo root. Every number below is `run_level.cjs`, one isolated run per level unless marked, so each is a direction and not a verdict (see [method.md](method.md)). Clef returns identical probabilities for an identical prompt, and two baseline runs of level 2 were identical (457 decisions, 13 deaths), but laser thickness is still unseeded, so runs that pass near a laser can still differ.

### The flags

All default off except `ATTRIB`. `run_stats.buildFlags()` stamps them into every run file as `build`.

| Flag | What it changes |
| --- | --- |
| `PRUNE_FATAL=1` | `survival.cjs` drops a move the simulator proves fatal whatever the cat does next, unless every move is fatal |
| `PRUNE_NOOP=1` | drops a straight jump that lands back on the same spot and touches no gem |
| `MOVE_INSTR=1`, `=2` | states the movement rules in the move question; `2` adds "head for a reachable higher platform even if it lies away from the objective" |
| `HOLD_FIX=1` | `heldActionIsSafe` judges a jump in flight by its steering; it used to simulate a second jump, so no jump was ever held |
| `COL_FACTS=1` | a platform spanning the cat's x is "directly above/below", not "left/right" |
| `JUMP_FACTS=1` | names the higher floors one jump from this floor can land on |
| `GEM_FACTS=1` | names the launch window from which one jump collects a gem above this floor, where the cat stands against it, and marks an ascent point that leads to a dead end |
| `GEM_FROM=1` | names the floor a gem can be collected from, in the move prompt only |
| `AIR_FACTS=1` | rewrites the airborne platform listing |
| `ATTRIB=0` | turns off blaming a fall on the grounded decision that launched it; `run_level.cjs` lacked that attribution until now, `run_full.cjs` had it |
| `STICKY_OBJECTIVE=1` | holds the objective on the same floor until the floor or the menu changes (existing flag; see [dead-ends.md](dead-ends.md)) |

Level 13 cannot test `ATTRIB` on this build: its 11 deaths per run are unwinnable resets, which record no death at all (see [open-problems.md](open-problems.md)). The attribution comparison runs on level 6.

### Results, one run per level

| Build | Cleared | Not cleared |
| --- | --- | --- |
| baseline (no flags) | 0, 1, 4, 7, 8, 9 | 2, 3, 5, 6, 10, 11, 12, 13 |
| `PRUNE_FATAL` | 0, 1, 4, 7, 9 | 2, 3, 5, 6, 8, 10, 11, 12 (13 did not start) |
| `PRUNE_FATAL MOVE_INSTR=1` | 0, 1, 2, 4, 5, 7, 9 | 3, 6, 8, 10, 11, 12, 13 |
| `MOVE_INSTR=2 JUMP_FACTS PRUNE_FATAL HOLD_FIX COL_FACTS` | 0, 1, 2, 5, 7, 8, 9 | 3, 4, 6, 10, 11, 12, 13 |
| the same plus `GEM_FACTS` | 10 (first clear on any endpoint) | 3, 6, 11, 13 (sweep stopped there) |

The level 10 clear ran on the first `GEM_FACTS`: the launch-window sentence alone. The sentence placing the cat against the window and the dead-end ascent fact came later, and the gem-floor fact (`gemFromNote`) did not exist yet, so it was never in that run's objective prompt. A rerun of the current `GEM_FACTS` differs from it by those two later sentences.

`PRUNE_FATAL` alone is neutral or worse: it moved level 8 from cleared to failed. `MOVE_INSTR=1` is the first lever that moved anything, gaining 2 and 5 and losing 8. `AIR_FACTS` lost level 5 again and was dropped. Level 4's first ever clear came from the baseline, not from any flag.

The `gem` sweep and an earlier `noop` sweep loaded the live `decision.cjs`, which changed while they ran, so their later levels are not clean. From `v6` onwards each sweep runs a frozen copy of `driver/` under `out/exp_<tag>/driver`.

### v6 against v7, and why the comparison stopped

v7 is v6 plus the gem-floor fact (then in both prompts) and the dead-end ascent fact. They overlap on three levels with identical outcomes on all three: level 3 fail/fail (1 gem against 2), level 11 fail/fail, level 13 fail/fail. v7 spent more decisions on every one: 283 against 260, 258 against 228, 359 against 242. That is n = 1, but it is the shape the implied-relevance section of [dead-ends.md](dead-ends.md) records: true clauses that cost decisions and clear nothing.

Census split over every logged grounded decision, against the clearing set (0, 1, 2, 5, 7, 8) and the failing set (4, 6, 10, 11, 12, 13). The two figures in each cell are the baseline archives and the `climb` archives:

| Clause | Clearing | Failing |
| --- | --- | --- |
| gem-floor, objective prompt (any live gem) | 78.6–83.9% | 91.6–99.2% |
| gem-floor, move prompt (the pursued gem) | 24.6–27.8% | 65.0–82.0% |
| dead-end ascent | 0.2–0.5% | 8.6–10.4% |

```sh
node driver/experiments/census_gem_from.cjs out/clef_baseline/run_level_*_clef.json
node driver/experiments/census_gem_from.cjs out/exp_climb/L*.json
```

The objective-prompt gem-floor fact is the dead class and is removed. The move-prompt version is kept behind `GEM_FROM` and still needs the clearing-six canary at N >= 3 before it ships.

The dead-end fact, probed on level 11 at (176, 231) with 138 moving frames and only gem_a left, moves the objective from the ascent to the gem: gem_a 0.298 without flags, 0.942 with `GEM_FACTS=1`. It has no run result of its own yet.

### The best build across seeds, and the sticky objective on level 8

Build `PRUNE_FATAL MOVE_INSTR=2 JUMP_FACTS HOLD_FIX COL_FACTS GEM_FACTS`, `ATTRIB` on, at `SEED` 1 and 2 (archives `out/exp_best_s<seed>`, each with `build` stamped):

| Level | Seed 1 | Seed 2 |
| --- | --- | --- |
| 0 | cleared, 0 deaths, 4 decisions | same |
| 1 | cleared, 0, 30 | same |
| 2 | cleared, 0, 23 | same |
| 5 | cleared, 0, 24 | cleared, 0, 28 |
| 7 | cleared, 0, 19 | same |
| 10 | cleared, 0, 16 | same |
| 8 | stopped at decision 337, 17 deaths, 0 gems | stopped at decision 335, 16 deaths, 3 gems |

Where the two seeds agree, they agree decision for decision although the menu order differed on 1 of 4 (level 0) to 18 of 23 (level 2) decisions. That makes these clears robust to menu order, not three samples: with no deaths the policy never explores, so the seed reaches the trajectory only through the menu permutation. Laser thickness and changes to the Clef service are the variance this does not cover.

Level 8 was stopped by hand, not failed: its objective changed on 76% and 64% of consecutive decisions on one floor, against 30 to 33% on level 5, the highest of the clearing levels. 15 of seed 1's 17 deaths and 12 of seed 2's 16 were blamed on the same spot, x 320, y 40, beside the right laser.

The same build plus `STICKY_OBJECTIVE=1`, which only adds that one key to the stamp (`out/exp_sticky_s<seed>`, `out/exp_stickyL5_s<seed>`):

| | Objective changes | Result |
| --- | --- | --- |
| level 8, seed 1 | 20% | cleared, 2 deaths, 106 decisions |
| level 8, seed 2 | 21% | cleared, 1 death, 64 decisions |
| level 5, seed 1 | 30% | cleared, 0 deaths, 24 decisions, same as unlocked |
| level 5, seed 2 | 33% | cleared, 0 deaths, 28 decisions, same as unlocked |

The lock binds only within a life (a death clears it), and that was enough: the flapping was what killed the cat, so fewer flips meant fewer deaths and fewer resets of the lock. Level 5 is not evidence of safety: the lock engaged there (9 and 11 holds) and changed no move, both runs byte-identical to the unlocked build. The lock is unmeasured for harm on every other level.

```sh
GEM_FACTS=1 node driver/experiments/probe_clef.cjs --objective \
  --spawn-from out/clef_baseline/run_level_11_clef.json \
  '{"x":176.25,"y":231,"ground":1,"mf":138,"alive":[0]}'
```

The level 12 trace is the source of the death-mechanism analysis in `TRACE_L12_death_mechanism_20260927-195458.md`, which is in git history rather than the tree: `git show abc6174:docs/archive/probes/TRACE_L12_death_mechanism_20260927-195458.md`. See [readme.md](../readme.md) for how the archive is stored.

## Post-fix verification runs (2026-10-08, `clef`, `out/exp_fix`)

Two bookkeeping fixes landed on the current best build, with the same flag stamp as `exp_lag2_s1/s2`:

1. **`floorBelow` NaN laser clock.** `decision.cjs:373` derived the laser frame from `CFG.droneSpeed`, but `CFG` there is `config.cjs`, which exports no `droneSpeed` — the clock was NaN, `arc.simulate`'s laser bounds all compared false, and the falling-floor note could never reject a remedy the laser would cut off. Fixed with the sibling idiom (a function-local `const CFG = require("./physics.cjs")`); `test_cfg_shadow.cjs` now fails on any `CFG.<field>` read in `decision.cjs` that the effective (shadowed or not) module does not export.
2. **Unwinnable resets now record a death.** Both runners reset the level on an unwinnable state without `recordDeath`, so `priorDeaths` never rose. One shared blame rule, `run_stats.unwinnableDeath` (last grounded decision, falling back to the cat's own position), is called by both runners; `test_death_history.cjs` asserts the precedence and that both runners reach `deathHistory`.

**Blast radius, measured offline before running anything.** Replaying all 3 837 logged decisions of `exp_lag2_s1/s2` through both builds of `decision.cjs`: the prompt changes on exactly 9 decisions — L4 6, L6 2, L8 1 — every one a falling-floor note correctly suppressed because the corrected simulation shows the claimed remedy dies at the real laser state. Every other level is byte-identical. The unwinnable branch cannot fire on a clearing run by definition (clearing needs 3 gems; the branch means fewer than 3 are reachable), and it fired only on L3, L11, L12 and L13 in the archives.

| Level | Seed | Result | Decisions | vs `exp_lag2` baseline |
| --- | --- | --- | --- | --- |
| 0 | 1 | cleared, 0 deaths | 4 | identical (smoke) |
| 8 | 1 | cleared, 2 deaths | 106 | identical |
| 8 | 2 | cleared, 1 death | 64 | identical — and the run passes through the one state where the fix changes the prompt, (275, 254.4) mf 226 obj gem_c, and picks the same move |
| 13 | 1 | failed, 11 deaths, 1 gem | 345 | `deathLog` now has 11 entries (was 0), 7 distinct blamed positions; the lives are no longer identical, but the level still fails |
| 13 | 2 | failed, 11 deaths, 1 gem | 312 | same |
| 4 | 1 | **cleared**, 4 deaths | 218 | baseline failed (6 deaths) — but the new trajectory has **0 prompt diffs**, so the fix cannot have caused this clear; laser-thickness noise |
| 4 | 2 | failed, 8 deaths, 3000-step cap | 308 | baseline cleared (3 deaths) — the new trajectory has 8 fix firings, but n=1 on the most seed-sensitive level measured; not attributable |

L4's verdict is unchanged: one of two seeds clears, and the clearing seed swapped. Neither swap is attributable to the fix at n=1 — the clearing side never saw the fix fire, and the failing side is exactly where L4 flips between builds on its own. Level 13 confirms the bookkeeping fix is necessary but not sufficient: its blocker is the clock, same family as level 12's.

Test suite after both fixes: `test_death_history.cjs`, `test_cfg_shadow.cjs`, `test_descent_gate.cjs`, `test_sticky_objective.cjs` all rc 0; `test_objective_lock.cjs` rc 1 (red by design, unchanged).

The diagnoses of levels 3, 6 and 12 that this session produced from the archives are in [open-problems.md](open-problems.md) §2b.

## Sticky-off test on level 6 (2026-10-08, `clef`, `out/exp_fix`, `STICKY_OBJECTIVE=0`)

The level-6 diagnosis (§2b of open-problems) noted the lock pins both halves of the ping-pong (`gem_a` on floor 176, `ascent_right` on floor 220), making the loop deterministic. Test: does the loop break with the lock off, letting menu noise pick the productive hop?

| Level | Seed | Sticky on (baseline) | Sticky off |
| --- | --- | --- | --- |
| 6 | 1 | failed, 7 deaths, 2 gems | failed, 9 deaths, 2 gems |
| 6 | 2 | failed, 7 deaths, 2 gems | failed, 8 deaths, 2 gems |
| 4 | 1 | cleared (this build) | failed, 7 deaths, 3 gems, step cap |
| 3 | 1 | failed, 7 deaths, 2 gems | failed, 6 deaths, 1 gem |

Verdict: hypothesis rejected. The lock is not what pins the L6 loop - the model refuses the productive hop with the lock off too. And level 4 seed 1 needs the lock to clear. `STICKY_OBJECTIVE=1` stays on.

## BURN_FACTS: the §1 slack candidate, built and measured neutral (2026-10-08, `clef`, `out/exp_burn`)

`open-problems.md` §1 named one unbuilt prompt form that had not died in a census: a slack figure for the objective already chosen. Built as `burnLine` (gated `BURN_FACTS=1`, `test_burn_facts.cjs`): when the chosen gem's exact deadline (`route_clock.gemDeadline`) is 1-120 moving frames away, the move call states "gem_a is destroyed by the closing laser in N moving frames; after that it is gone and the level can never be won." Census over the archives: fires on 111/292 L12 decisions, 21/252 L3, 55/341 L13, 110/238 L11 - mixed states, unlike the DEAD/ALIVE form. Among clearing levels only L8 fires (29/122); L4 and L6 never.

| Level | Seed | Baseline (deaths, gems) | BURN_FACTS (deaths, gems) |
| --- | --- | --- | --- |
| 12 | 1 | 7, 2 | 7, 2 |
| 12 | 2 | 7, 1 | 7, 2 |
| 3 | 1 | 6, 1 | 6, 1 |
| 3 | 2 | 6, 1 | 6, 1 |
| 8 | 1 | cleared, 2 | cleared, 2 (104 vs 106 decisions) |
| 8 | 2 | cleared, 1 | cleared, 1 (64 decisions) |

Verdict: safe (L8 clears both seeds unchanged) and it fires - but it does not change outcomes. The fact is true, mixed, relevant, and the classifier routes around it: the L12 post-mortem below shows why. The model is not dawdling because it underestimates the clock; it dawdles in an edge oscillation that no objective-level fact addresses. `BURN_FACTS` stays gated off.

## OBJ_SAMPLE: sampling the objective call at failed keys (2026-10-08, `clef`, `out/exp_objsample`)

The escalation policy - "sample the model's own distribution only at positions that have demonstrably failed" - had always covered only the MOVE call. The objective call was argmax-only, and the L12 post-mortem showed the shape that pins: the cat sits on a failed key, the objective call re-picks the greedy gem every decision, and the waypoint that executes the productive route is never drawn. `OBJ_SAMPLE=1` (`test_obj_sample.cjs`) samples the debiased objective distribution at the SAME temperature the move call uses, and releases the sticky lock at those keys (the lock damps noise; a demonstrably failed position is not noise).

| Level | Seed | Baseline (deaths, gems) | OBJ_SAMPLE (deaths, gems) |
| --- | --- | --- | --- |
| 12 | 1 | 7, 2 | 7, 2 |
| 12 | 2 | 7, 1 | 7, 1 |
| 6 | 1 | 7, 2 | 7, 2 |
| 3 | 1 | 6, 1 | 5, 1 |
| 4 | 1 | **cleared** | **failed**, 7 deaths, step cap |
| 8 | 1 | cleared, 2 | cleared, 2 |

The mechanism works as designed - 75 escalation samples in the L12 run, `descent_right` drawn 17 times where argmax was `gem_a` every time - and it still changed nothing on L12/L6, while it BROKE level 4 seed 1: the escalation release re-admits exactly the objective flip that the sticky lock was added to suppress.

Reading the L12 log at the oscillation: when `descent_right` was drawn and held, the MOVE sampler then drew `left` against a 0.965-confidence `right` argmax (T=1.5, one prior death at the key) - the two escalation layers fighting, the objective layer committing to the edge and the move layer walking away from it. `WPT_ARGMAX=1` (with `OBJ_SAMPLE`) makes waypoint objectives execute on the move argmax - the commitment gets one clean execution before anything re-rolls (`test_obj_sample.cjs` covers both directions). Combo results below.

### OBJ_SAMPLE + WPT_ARGMAX combo (`out/exp_combo`, 2026-10-08)

| Level | Seed | Baseline | Combo (deaths, gems) |
| --- | --- | --- | --- |
| 12 | 1 | 7, 2 | 7, 1 |
| 12 | 2 | 7, 1 | 7, 1 |
| 4 | 1 | cleared | **cleared**, 6 deaths |
| 6 | 1 | 7, 2 | 7, 2 |

`WPT_ARGMAX` repairs the level 4 regression that `OBJ_SAMPLE` alone caused - the waypoint commitments now execute instead of wobbling - but the combo still wins nothing: level 12 and level 6 are unmoved, and level 12 seed 1 collected one gem instead of two. Verdict: both flags stay gated off. Six independent lever families (urgency annotations, option-consequence annotations, DEAD/ALIVE verdicts, JEV_STRICT, BURN_FACTS, OBJ_SAMPLE/WPT_ARGMAX) have now each fired correctly on the failing levels and changed nothing. The wall is the classifier's greedy proximity policy at the states that matter, and the elicitation layer is exhausted on this model.

## Seed sweep on the failing levels (`out/exp_seeds`, 2026-10-08, `clef`, shipped build)

The recording goal needs a run where every level clears; if the failing levels were seed-luck cases, a lucky ladder seed might exist. Four fresh seeds beyond s1/s2 on each failing level:

| Level | Seed 3 | Seed 4 | Verdict |
| --- | --- | --- | --- |
| 3 | 6 deaths, 2 gems | 6 deaths, 1 gem | fail / fail |
| 6 | 6 deaths, 2 gems | 8 deaths, 2 gems | fail / fail |
| 11 | 7 deaths, 2 gems | 7 deaths, 2 gems | fail / fail |
| 12 | 7 deaths, 1 gem | 7 deaths, 1 gem | fail / fail |
| 13 | 11 deaths, 1 gem | 11 deaths, 1 gem | fail / fail |
| 4 | 7 deaths, 3 gems, step cap | — | L4 now 1 of 3 seeds |

The failure profiles are seed-stable: same death counts, same gem peaks, same death zones. These are not unlucky seeds; they are the same greedy-policy wall at four different RNG streams. No winning ladder seed exists for the current build, and the full-game recording depends on the failing levels, not on luck.

### Waypoint-hold fix + combo2 (`out/exp_combo2`, 2026-10-08)

The combo log showed why the 17 `descent_right` draws executed nothing: the escalation release re-asked the objective **every decision**, so a sampled waypoint flipped back to the gem on the next decision, and the waypoint commit cap then poisoned the waypoint for the rest of the level (`lock released (descent_right): commit cap` one decision after each draw). Fixed: a locked waypoint now survives escalation and holds until the floor changes or the cap; gem locks still release (that is what escalation is for). `test_obj_sample.cjs` covers it and fails against the pre-fix condition.

With the fix the commitment runs - 144 waypoint holds, zero commit-cap releases in the L12 run - and the outcome is still unchanged or worse:

| Level | Seed | Baseline | Combo2 (deaths, gems) |
| --- | --- | --- | --- |
| 12 | 1 | 7, 2 | 8, 1 |
| 12 | 2 | 7, 1 | 8, 1 |
| 6 | 1 | 7, 2 | 7, 2 |
| 3 | 1 | 6, 1 | 5, 1 |

The edge log explains it: the cat now walks to the descent point and holds there, but the MOVE call refuses to step off (`left` at p=1.00) - and at that moment it is right. Stepping off x 299 at mf 309 lands in the right laser (`arc.simulate`: outcome=laser at x 300.8). The safe window for that descent was mf 207-300; the cat spent it oscillating and the model's refusal at the edge is correct late and wrong early. No flag change ships: `OBJ_SAMPLE`/`WPT_ARGMAX` stay gated off; the waypoint-hold fix lives only inside the gated path (zero blast radius on the shipped build, verified by the full suite).

## Descent laser-gate: the death-trap offer removed (`out/exp_dgate`, 2026-10-08, `clef`)

`descentPoints` offered a floor end as a descent waypoint even when stepping off it dies at the closing side laser at the current frame (its `landOn` check integrates geometry only). On L12 the menu kept offering `descent_right` at x 299 after the right laser had closed to x 301, while the death history correctly said "on a previous attempt from here you chose right and laser" - the menu and the memory contradicted each other and the cat froze at the edge. Fixed: the offer is gated on the fall surviving the real laser state at the current `movingFrames`, either release style (`test_descent_laser_gate.cjs`: offered at mf 200, gone at mf 310, fails against the pre-fix build).

Blast radius, measured order-insensitively over all `exp_lag2_s1/s2` archives (see the method trap in [open-problems.md](open-problems.md) §3): **only L12 changes** - 93/292 and 85/292 decisions, every one at mf>=297, the closed window. Every clearing level is byte-identical; no live regression run needed.

| Level | Seed | Baseline (deaths, gems) | Laser-gate (deaths, gems) |
| --- | --- | --- | --- |
| 12 | 1 | 7, 2 | 7, 1 |
| 12 | 2 | 7, 1 | 7, 1 |

The gate fires (the trap offer is gone at the oscillation; the four remaining `descent_right` menus at mf>=297 are a different, safe descent from the floor above) and L12 still fails - the model had already learned to refuse the trap by dying at it; removing the lie does not teach it the productive route. The fix ships anyway: a menu that offers death as a route is wrong regardless of outcome, and the blast radius on clearing levels is provably zero.

## Continuous recording of the clearing set (`out/exp_record`, 2026-10-08, commit 7f86713)

One continuous ladder take over the eight levels that clear at two seeds, with the
five never-cleared levels skipped by demo mode (`DEMO_KEEP_LEVELS=0,1,2,5,7,8,9,10`,
clef endpoint, SEED=1). Skips are rewritten inside the same frame as the level
transition, so no skipped level ever flashes on screen; the run JSON records them
(2->5, 5->7, 10->victory).

| Level | Deaths | Peak gems |
| --- | --- | --- |
| 0 | 0 | 3 |
| 1 | 0 | 3 |
| 2 | 0 | 3 |
| 5 | 0 | 3 |
| 7 | 2 | 3 |
| 8 | 2 | 3 |
| 9 | 0 | 3 |
| 10 | 5 | 3 |

All eight cleared in one run, 4815 steps, ~9 minutes of continuous video
(534.88 s, 1280x720 vp8): `out/exp_record/cat-goric-clef-seed1-8levels.webm`.
This is the first time levels 5, 7, 8, 9, 10 cleared inside a ladder context;
previously the ladder baseline died at level 3 and those clears were isolated
measurements only. Level 4 is excluded: it clears at one of two seeds, so it is
not in the known-clearing set.

## Simulate-clock census (2026-10-09)

**Command:** `node driver/experiments/census_simulate_clock.cjs`

**Census scope:** Synthetic state-space enumeration across all playable levels (0..13), real-mf grid (0, 20, 40, ..., 600). "Live" means "exists in synthetic geometry", not "fires in play" — no run archives used.

| Site | Function | Line | Clock | States examined | Divergent | Verdict |
|------|----------|------|-------|-----------------|-----------|---------|
| 5 | `buildObjectiveCall` descent cost (ONE-WAY) | 782 | `0` | 97 (offered at real mf) | 0 (lost-gem set) | **DEFECT-THEORETICAL** |
| 6 | `jumpLandingNote` held scan (namedX pick) | 964 | `1` | 194 | 194 (pick dies at real mf; 0 pick shifts) | **DEFECT-LIVE** |
| 7 | `walkOffFatalNote` walk check | 1073 | `0` | 230 (deduped) | 74 false-safe | **DEFECT-LIVE** |
| 8 | `walkOffFatalNote` jump escape | 1075 | `0` | 107 (walk fatal only) | 10 false-safe escape | **DEFECT-LIVE** |

**Key methodology corrections vs. prior census:**
- Site 5: Enumerates descent points per `descentPoints()` gates (remaining objective below, not any platform below); conditions on site-4 offer gate (survives at real mf); EXCLUDES states where descent is never offered at any real mf (no ONE-WAY note emitted); removes "none" fallback artifact for MISSED warnings. Compares LOST-GEM SET at mf=0 vs real mf ONLY for states offered at real mf.
- Site 6: Pick rule matches real code — chooses good x NEAREST THE CAT whose held arc lands on a keeping floor (not first/leftmost); survival check simulates the JUMP action (heldDir) from picked x, not a walk; added alive-at-start filter like sites 7/8.
- Site 7: Alive-at-start filter (excludes positions inside laser at tested mf); dedupes by (level, floor, endX, side) since simulate is called at endX.
- Site 8: Conditions on site-7 walk being fatal (jump clause only appended when walk doesn't land).

**Finding:** The `walkOffFatalNote` text says "falls past everything below and dies" even when the real cause is the side laser (not falling past platforms). The note text is not changed here — recorded as a finding per task requirements.

See `docs/simulate-clock-audit.md` for full per-site details and methodology.
