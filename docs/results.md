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

**There was a `run_level_14_halogen.json` with `reachedWin: true`, and it was not a win.** It records 0 decisions and 0 steps: it is a single-level run started on the victory screen, which is terminal on arrival. An earlier summary table listed it as "GAME WON". The victory screen had never been reached by playing until 2026-10-10, when PurpleMIST-Flash-1.0 won the game from level 13 with the portal prune fix (see [PurpleMIST-Flash-1.0](#purplemist-flash-10)).

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

## Decision models tried (Typed Decisions leaderboard, 2026-10-09)

The record of every decision model tried through the `systemone` endpoint, so nobody spends a night on one again. The models listed under [Endpoints](#endpoints) (Clef, halogen, Qwen, Laya, the Featherless classifier) are not repeated here. How to run a new one: [bring-your-own-model.md](bring-your-own-model.md).

Gated models are skipped, whether the gate approves automatically or by hand: the project only uses models anyone can download.

Every run below is `driver/experiments/sweep_systemone.sh <model> <seed>`: each level in isolation, on the shipped build (`PRUNE_FATAL=1 MOVE_INSTR=2 JUMP_FACTS=1 HOLD_FIX=1 COL_FACTS=1 GEM_FACTS=1 STICKY_OBJECTIVE=1`, `ATTRIB` on), seeds 1 and 2, the same measurement as the Clef table above. Models were served on gpu-server (Radeon 8060S, `gfx1151`) in the sandbox described in the guide. Archives: `out/byom/<model>/s<seed>/` on the machine where they ran.

| Model | Size | How it was served | Levels cleared at both seeds | Status |
| --- | --- | --- | --- | --- |
| [Phocinae/Phocinae-Largha-150M-v1](https://huggingface.co/Phocinae/Phocinae-Largha-150M-v1) | 144M | `phocinae-server` 0.1.5 engine behind `adapters/systemone_adapter.py --backend phocinae`, `TORCHDYNAMO_DISABLE=1` | 0 (1 of 14) | done |
| [olaverse/PurpleMIST-Mini-1.0](https://huggingface.co/olaverse/PurpleMIST-Mini-1.0) | 1.9B | its own `serve.py --no-truncate` | 0 (1 of 14) | done |
| [olaverse/PurpleMIST-Flash-1.0](https://huggingface.co/olaverse/PurpleMIST-Flash-1.0) | 7.9B | its own `serve.py --no-truncate` (merged checkpoint) | 0, 1, 3, 6, 7, 8, 9 (7 of 14) | done |
| [FINAL-Bench/Darwin-27B-ZTC](https://huggingface.co/FINAL-Bench/Darwin-27B-ZTC) | 27B | `autojev` behind `adapters/systemone_adapter.py --backend autojev` | 0, 1, 2, 5, 8, 9 (6 of 14) | done |
| [empiriolabsai/aplomb-1](https://huggingface.co/empiriolabsai/aplomb-1) | | | | skipped: gated |
| [ProKope-AI/ProKope-421M](https://huggingface.co/ProKope-AI/ProKope-421M) | 421M | | | skipped: gated |
| [Akiki-AI/Akiki-MiniLM-L6-v2](https://huggingface.co/Akiki-AI/Akiki-MiniLM-L6-v2) | | | | skipped: gated |
| [adaptive-classifier/typed-decisions-minilm-l6-specialist](https://huggingface.co/adaptive-classifier/typed-decisions-minilm-l6-specialist) | | | | not applicable: fixed per-domain label heads, no free-form criteria |
| mlx-community/clef-4bit, clef-flash-4bit | | | | not tried: MLX builds of Clef, which is already measured as `clef` |

### Phocinae-Largha-150M-v1

Cleared, deaths, decisions, gems (every failure ran out the 3000-step cap):

| Level | Seed 1 | Seed 2 |
| --- | --- | --- |
| 0 | cleared, 0, 4, 3 | same |
| 1 | not cleared, 7, 130, 2 | not cleared, 8, 144, 2 |
| 2 | not cleared, 13, 504, 0 | not cleared, 13, 503, 0 |
| 3 | not cleared, 5, 205, 1 | not cleared, 6, 173, 0 |
| 4 | not cleared, 24, 262, 1 | not cleared, 22, 261, 1 |
| 5 | not cleared, 8, 121, 1 | not cleared, 8, 158, 2 |
| 6 | not cleared, 6, 252, 1 | not cleared, 6, 249, 1 |
| 7 | not cleared, 12, 158, 2 | not cleared, 12, 164, 1 |
| 8 | not cleared, 15, 251, 1 | not cleared, 11, 194, 1 |
| 9 | not cleared, 9, 143, 2 | not cleared, 16, 202, 2 |
| 10 | not cleared, 15, 207, 2 | not cleared, 14, 196, 3 |
| 11 | not cleared, 7, 126, 1 | not cleared, 7, 135, 1 |
| 12 | not cleared, 13, 169, 0 | not cleared, 10, 177, 1 |
| 13 | not cleared, 11, 289, 1 | not cleared, 11, 242, 1 |

1 of 14 against Clef's 8 of 14 on the same build. Level 0 clears in 4 decisions, like Clef; everything after it fails, including the seven levels Clef clears. The engine cuts the state to fit a 512-token window: on the level-0 prompts that touched 1 of 126 calls, so the cut is not what separates it from Clef there; on the longer levels it was not measured.

### PurpleMIST-Mini-1.0

Cleared, deaths, decisions, gems (every failure ran out the 3000-step cap):

| Level | Seed 1 | Seed 2 |
| --- | --- | --- |
| 0 | cleared, 1, 63, 3 | cleared, 1, 65, 3 |
| 1 | not cleared, 7, 112, 1 | not cleared, 7, 121, 1 |
| 2 | not cleared, 5, 249, 2 | not cleared, 5, 221, 1 |
| 3 | not cleared, 6, 150, 0 | not cleared, 6, 160, 0 |
| 4 | not cleared, 8, 369, 0 | not cleared, 9, 348, 0 |
| 5 | not cleared, 7, 123, 1 | not cleared, 7, 130, 0 |
| 6 | not cleared, 10, 486, 1 | not cleared, 13, 519, 0 |
| 7 | not cleared, 12, 154, 1 | not cleared, 13, 147, 1 |
| 8 | not cleared, 9, 151, 1 | not cleared, 9, 149, 1 |
| 9 | not cleared, 27, 272, 1 | not cleared, 26, 308, 1 |
| 10 | not cleared, 5, 242, 3 | cleared, 1, 79, 3 |
| 11 | not cleared, 7, 125, 1 | not cleared, 7, 106, 1 |
| 12 | not cleared, 12, 221, 1 | not cleared, 12, 217, 1 |
| 13 | not cleared, 14, 371, 2 | not cleared, 17, 385, 2 |

1 of 14 at both seeds (level 0). Level 10 cleared at seed 2 only (1 death, 79 decisions), after failing at seed 1 with all 3 gems collected, so it is not counted. Prompts fit its 2048-token window: the server ran with `--no-truncate`, which rejects an oversized prompt, and no run was rejected.

### PurpleMIST-Flash-1.0

Cleared, deaths, decisions, gems (every failure ran out the 3000-step cap):

| Level | Seed 1 | Seed 2 |
| --- | --- | --- |
| 0 | cleared, 0, 4, 3 | same |
| 1 | cleared, 0, 22, 3 | cleared, 0, 21, 3 |
| 2 | not cleared, 12, 504, 2 | not cleared, 11, 496, 2 |
| 3 | cleared, 2, 34, 3 | cleared, 11, 173, 3 |
| 4 | not cleared, 17, 341, 1 | not cleared, 24, 338, 1 |
| 5 | not cleared, 8, 226, 2 | cleared, 4, 139, 3 |
| 6 | cleared, 3, 202, 3 | cleared, 5, 282, 3 |
| 7 | cleared, 0, 32, 3 | cleared, 0, 34, 3 |
| 8 | cleared, 4, 131, 3 | cleared, 9, 313, 3 |
| 9 | cleared, 1, 68, 3 | cleared, 0, 29, 3 |
| 10 | cleared, 6, 96, 3 | not cleared, 17, 231, 2 |
| 11 | not cleared, 7, 285, 2 | not cleared, 7, 313, 2 |
| 12 | not cleared, 8, 298, 1 | not cleared, 8, 276, 1 |
| 13 | not cleared, 11, 329, 2 | not cleared, 11, 310, 2 |

7 of 14 at both seeds (0, 1, 3, 6, 7, 8, 9), against Clef's 8 (0, 1, 2, 5, 7, 8, 9, 10). The two sets differ: Flash clears levels 3 and 6, which Clef fails at four seeds each, and fails levels 2 and 10 at one seed or both, which Clef clears. Level 6 had never cleared on any endpoint or build before. Level 5 cleared at seed 2 only and level 10 at seed 1 only, so neither is counted. Level 11 at seed 1 was interrupted by the tool's time limit and rerun from the start; the result above is the full rerun. No call was rejected by `--no-truncate`, so every prompt fit the 2048-token window.

**Seed 3 (2026-10-10, post empty-menu fix, shipped build).** `SYSTEMONE_BASE_URL=http://127.0.0.1:8000 driver/experiments/sweep_systemone.sh PurpleMIST-Flash-1.0 3 <levels>`; all 14 levels, same tunnel. Level 6 cleared first (1 death, 96 decisions, 3 gems, 736 steps) — the third seed for level 6, and the confirmation that the empty-menu fix (see [Darwin-27B-ZTC](#darwin-27b-ztc) below) holds on a real model end to end. No call failed; `--no-truncate` rejected nothing.

| Level | Seed 3 | Seed 4 | Seed 5 |
| --- | --- | --- | --- |
| 0 | cleared, 0, 4, 3 | | |
| 1 | cleared, 0, 21, 3 | | |
| 2 | not cleared, 13, 504, 0 | cleared, 10, 423, 3 | not cleared, 13, 505, 0 |
| 3 | not cleared, 16, 283, 2 | | |
| 4 | not cleared, 18, 330, 1 | not cleared, 19, 334, 1 | |
| 5 | not cleared, 8, 211, 2 | cleared, 7, 230, 3 | cleared, 0, 25, 3 |
| 6 | cleared, 1, 96, 3 | | |
| 7 | cleared, 0, 30, 3 | | |
| 8 | not cleared, 10, 365, 3 | | |
| 9 | cleared, 0, 29, 3 | | |
| 10 | not cleared, 17, 281, 2 | not cleared, 17, 257, 2 | |
| 11 | not cleared, 7, 288, 2 | not cleared, 7, 317, 2 | |
| 12 | not cleared, 8, 307, 1 | not cleared, 7, 289, 1 | |
| 13 | not cleared, 11, 329, 3 | not cleared, 10, 345, 3 | not cleared, 11, 314, 2 |

Seed 3 cleared 5 of 14 (0, 1, 6, 7, 9) on the current build, against 7 of 14 on the s1/s2 build: levels 3 and 8 were not cleared at s3 (s1/s2 cleared; level 3 with 16 deaths, level 8 with all 3 gems collected and 10 deaths). Seeds 4 and 5 ran only the levels the engine work targets (2, 4, 5, 10, 11, 12, 13 and 2, 5, 13). Level 5 is now 2 of 3 recent seeds (s2, s4, s5 cleared; s1, s3 not) and level 2 is 1 of 5 (s4 only) — neither is counted as a stable clear, but level 2's failure signature is consistent: the 0-gem runs (s3, s5) both stall in the early descent from the spawn floor, which is the state the exit-direction census in [flash-l2-l5-analysis.md](flash-l2-l5-analysis.md) measures. Level 13 collected 2-3 gems at every seed of every build and never cleared: a portal-approach failure, not a gem failure.

**Engine change: EXIT_FACT (2026-10-10), measured on level 2.** A gated move-prompt sentence (`EXIT_FACT=1`, off by default, byte-identical prompt when off — `blast_exit_fact.cjs`: 0 of 65,463 rebuilt move states change) for the state shape where every shortest route to the objective leaves the current floor on the side OPPOSITE the objective's horizontal bearing: `gem_c is below this floor; the shortest way down to it is off the left end of this floor, not toward its horizontal offset.` The predicate (`exitDirection` in decision.cjs) fires on 4.4-7.6% of decisions across models, never on Clef's L4 archive, and compliance with the exit side separates the models (Clef-class n/a, Darwin 30.0%, Phocinae 25.2%, Flash 16.4%) — full census in [flash-l2-l5-analysis.md](flash-l2-l5-analysis.md). Live on Flash, same shipped build, `out/byom/PurpleMIST-Flash-1.0-EXIT/`:

| Level 2 | baseline (no gate) | EXIT_FACT=1 |
| --- | --- | --- |
| seed 1 | not cleared, 12, 504, 2 | cleared, 3, 220, 3 |
| seed 2 | not cleared, 11, 496, 2 | cleared, 2, 111, 3 |
| seed 3 | not cleared, 13, 504, 0 | cleared, 2, 103, 3 |
| seed 4 | cleared, 10, 423, 3 | cleared, 5, 233, 3 |
| seed 5 | not cleared, 13, 505, 0 | cleared, 2, 131, 3 |

5 of 5 cleared with the gate against 1 of 5 without it on the same seeds (and the cleared runs are cheaper: 111-233 decisions vs 423-504). The A/B probe at the archived failing decision (Flash L2 s1 step 54) flipped the probability from right 0.844 to left 0.913.

**Engine fix: the portal prune (2026-10-10), found on level 13.** `PRUNE_FATAL` (survival.cjs `isFatal`) asked only "can any trajectory land on a platform" after the committed frames. At Flash L13 s4 steps 2144/2162 the cat was airborne at (197.75,140) with all 3 gems, 1.75px from the portal box; holding left crosses the portal at f6 — a WIN — but no trajectory could land (the bottom laser bound at that clock burns every floor below first), so the prune deleted left and none and the model was shown a ONE-option menu (`moveProbs {"right":1}`): the prune deleted the winning move, twice. The earlier reading of these steps ("the model refuses the portal at probability 1.000") was wrong: a one-option menu is not a choice. Fix: with `gemsCollected >= 3`, an action is not fatal if any simulated frame before death overlaps the portal box (`getPortalCollisionObject`: 32x32 centred on 180,150), applied in both death paths of `isFatal` and in `canStillLand` (interval semantics, same optimistic bounds). Test: `test_portal_prune_l13.cjs` + the verbatim archived fixture, red on the old rule, green on the fix. Blast radius (`blast_portal_prune.cjs`, old vs new `pruneFatal` over every archived decision): **78 of 66,166 menus change, all at gemsCollected>=3** — L4 40, L10 17, L13 13, L0 6 (grounded jumps whose arc crosses the portal), L6 1, L9 1; the clearing levels' prompts are untouched. The census of the REACH_FACT predicate (the airborne sibling: exactly one steering hold reaches the objective; `census_reach_fact.cjs`) excludes one-option menus from compliance after this lesson: Flash L13 compliance is still 24.0% (25 firings) with the bug's states removed, so a model gap remains on top of the prune bug. Full account: [flash-l13-analysis.md](flash-l13-analysis.md).

**First win by playing (2026-10-10).** With the portal prune fix and `EXIT_FACT=1` on the shipped build (`out/byom/PurpleMIST-Flash-1.0-EXIT/`, `run13.sh`, seeds 3-5), **Flash won the game at seed 3**: `won=true`, observed level 14, 3 gems, 7 deaths, 2137 steps, 224 decisions - the first victory screen reached by playing in this project's whole archive. The last decision is the archetype state the fix was written for: airborne at (197.75,140) dy=1.6 mf=313 with all 3 gems, 1.75px from the portal box, and the menu now offered the left hold - `move=left`, p(left)=0.763 - where the baseline had shown the one-option menu `{"right":1}`. **Seed 4 also won** (4 deaths, 152 decisions, 3 gems, 1357 steps), and its last decision is the identical archetype: (197.75,140) dy=1.6, `move=left`, p(left)=0.763. **Seed 5 did not win** (11 deaths, 2 gems): it never held 3 gems - a gem burned and the run hit the driver's unwinnable resets at steps 2634 and 2906 - a gem-collection failure, not a portal failure. Seeds 6 and 7 also failed the same way (never held 3 gems); seeds 8 and 9 failed it too (11 deaths, 2 gems each); **seed 10 won** (4 deaths, 3 gems, 1348 steps). **3 of 8 seeds won with the fix** (s3, s4, s10). The baseline L13 archives at seeds 3, 4 and 5 all print `game won ... false`, so none of them won; the wins are attributable to the prune fix, not to a different reading of the old runs. (The sweep script's `cleared` field grepped only the advance line and printed `cleared=false` for this win; `sweep_systemone.sh` now also accepts the win line, which is the repo's level-13 exception.)

**Regression check of the fixed build (2026-10-10, seed 3).** The portal prune fix + `EXIT_FACT=1` on the shipped build, run on all eight of Flash's clearing levels (`out/byom/PurpleMIST-Flash-1.0-EXIT/s3/`, cleared/deaths/decisions/gems): **all eight cleared** - L0 (0, 4, 3), L1 (0, 30, 3), L3 (2, 44, 3), L5 (2, 108, 3), L6 (1, 96, 3), L7 (1, 69, 3), L8 (4, 89, 3), L9 (0, 27, 3). Two of them had FAILED at seed 3 on the unfixed build (L3, L5), so the fixes did not merely not regress the clearing levels - they flipped two. Together with L2 (5 of 5 seeds with the gate, above) and L13 (2 of 3 wins), **the fixed build clears 10 of 14 levels at seed 3**; only L4, L10, L11 and L12 remain, and the fixed build is running those at seeds 3 and 4. Residency and route censuses of the three remaining levels (paired against Clef's L10 clear and Darwin's L11 clear): [flash-l10-l12-analysis.md](flash-l10-l12-analysis.md).

**Reliability sweep of the fixed build (2026-10-10, seeds 3, 6, 7).** Levels 0, 1, 2, 3, 5, 6, 7, 8, 9 cleared on **all three seeds** - nine levels, three seeds, no exceptions. L13 won at seeds 3 and 4 and failed at 5, 6 and 7; each failure never held 3 gems (2 at the end). The fixed build is reliable on everything it has ever cleared; the full-game run now hinges on L13 gem collection and the four never-cleared levels.

**First full-ladder run of the fixed build (2026-10-10, seed 3, `out/byom/PurpleMIST-Flash-1.0-FULL/`).** The fixed build + `EXIT_FACT=1` played the ladder in one session: L0 (4 decisions, 0 deaths), L1 (31, 0), L2 (39, 0) - three levels, zero deaths - then stopped at level 3 on the 10-death cap (326 decisions, 10 deaths, 2 peak gems, max mf 533, repeated STALL 'no progress toward gem_b'). Level 3 cleared in isolation at seeds 3, 6 and 7, so in-ladder level 3 is the weak link so far; the ladder's own step/death budget is a measurement the isolated runs do not see.

**Two further levers measured and rejected (2026-10-10).** `DESC_HONEST` (appending the mid-air reversal a descent claim actually requires): the probe flipped the L4 archetype move (right 0.514 -> left 0.575) but live L4 was null at both seeds and **L8 regressed** - cleared without it at seed 3 (4 deaths, 89 decisions), not cleared with it (14 deaths, 359 decisions, 3 gems); the census had flagged L8's inverted compliance (443 firings). `FLOAT_EXIT` (the route-to-collector generalization for holderless floating gems): clearing-run compliance was 0-31%, no better than failing runs - the winners do not follow the named exit, so the predicate has no signal to amplify. Both removed from the driver; full accounts in [dead-ends.md](dead-ends.md). The gate set on the shipped build stays `EXIT_FACT` + `REACH_FACT`.

### Darwin-27B-ZTC

Cleared, deaths, decisions, gems (every failure ran out the 3000-step cap, except level 6):

| Level | Seed 1 | Seed 2 |
| --- | --- | --- |
| 0 | cleared, 0, 4, 3 | same |
| 1 | cleared, 0, 30, 3 | same |
| 2 | cleared, 0, 28, 3 | same |
| 3 | not cleared, 5, 358, 2 | not cleared, 6, 377, 2 |
| 4 | not cleared, 7, 317, 3 | not cleared, 7, 274, 3 |
| 5 | cleared, 0, 30, 3 | cleared, 0, 21, 3 |
| 6 | invalid: stopped at step 274 on an empty objective menu, 0, 28, 2 | same |
| 7 | not cleared, 14, 300, 2 | not cleared, 14, 265, 2 |
| 8 | cleared, 1, 71, 3 | cleared, 0, 28, 3 |
| 9 | cleared, 0, 22, 3 | same |
| 10 | not cleared, 17, 194, 2 | not cleared, 21, 202, 2 |
| 11 | not cleared, 7, 424, 2 | cleared, 3, 198, 3 |
| 12 | not cleared, 7, 295, 1 | not cleared, 8, 287, 1 |
| 13 | not cleared, 11, 347, 1 | not cleared, 12, 380, 1 |

6 of 14 at both seeds (0, 1, 2, 5, 8, 9), a subset of Clef's 8. Level 11 cleared at seed 2 (3 deaths, 198 decisions, all 3 gems, advanced to level 12 at step 1401): the first clear of level 11 on any endpoint or build. It failed at seed 1, so it is not counted.

Level 6 is not a model result. At both seeds, at step 274, the driver sent the objective question with no options, the adapter rejected it with a 422 (`'criteria' must be a non-empty object`), and the run paused. The same step at both seeds means it reproduces. No other call failed in the 28 runs. Level 4 at seed 1 was interrupted by the tool's time limit and rerun from the start; the result above is the full rerun.

**Root cause, fixed 2026-10-10.** The empty menu was the `ROUTE_FIRST` deferral removing the *sole* live gem. The failing state, dumped by the replay endpoint: cat airborne at (302.25,132.8) dy=2.8 falling past `floor(289..341@136)`, mf=273, gem_a (135,143) the only live gem. `jumpHitsCeiling` was true (head clearance ~59px under the 64.6px jump threshold), so the `routeBlocked` BFS used the ceiling-restricted `firstHop` and failed to reach gem_a's holder, while `canReach` (the static graph) said reachable. The rule deferred gem_a, the menu emptied, and the zero-criteria objective question went out. The deferral's own comment says it must defer only a goal whose route crosses *another live goal's* platform; with one live gem nothing can be deferred, and a ceiling-restricted firstHop failure is not a deferral cause.

Fix (`driver/decision.cjs`, in `buildObjectiveCall`): the deferral now re-runs the same BFS with an empty blocked set and defers only if that second pass finds the holder. A goal the ceiling-restricted firstHop cannot reach keeps its menu entry (with its NO ROUTE / distance annotation), never disappears. A guard in `decide()` throws with the snapshot if the objective menu is ever empty, so a zero-criteria question can never go out silently (rule 1: no default). No other archive in `out/byom/` or `out/exp_*` hit the 422 or an empty menu (`cands=0`); the other endpoints' level 6 runs never reached this state.

**Blast radius (offline differential, corrected 2026-10-10):** `driver/experiments/blast_gates_head.cjs` compares git HEAD's `decision.cjs` against the working tree (all gates off) over every decision of every run archive under `out/` (drone walls reconstructed from the archived clock, gem spawns loaded from the game's `config.ts` via `experiments/gem_table.cjs`, menus compared order-insensitively). **929 of ~68,500 decisions differ: L4 801, L6 128, every other level byte-identical.** Every diff is a menu-set diff in which a gem the old `ROUTE_FIRST` rule deferred reappears (933/933 in the classification pass were gem-added, zero gem-removed, zero move-state or crit-text diffs) - the fix working in states where the old rule shrank a menu without emptying it, not a text leak. Clearing levels are untouched. An earlier version of this section claimed **0 of 57,049**; that number is invalid: `blast_routefirst_fix.cjs` loaded `../decision_old_scratch.cjs` as OLD, and if that copy was taken after the `routeBlocked` edit, OLD == NEW and 0 diffs is guaranteed. The script now regenerates OLD from `git show HEAD:driver/decision.cjs` itself. Caveat unchanged: a 422 call is never logged, so the archives cannot contain the failing decision; the fixture test is the direct proof for that state. Behaviour is covered live: L6 cleared at s3 with the fix, and L4 fails with and without it.

**The replay endpoint** (`driver/replay.cjs`, the `replay` entry in both runners' `ENDPOINTS`, mirrored so `test_runner_parity.cjs` stays green) reproduces an archived run offline against the live harness with no model: it keys the archive by decide-call order, answers every `classify()` with the archived answer (probability 1 on the logged choice), and compares the live snap to the archive entry (throws a divergence error with both values if the run has left the trajectory). When the archive is exhausted the next decision is the one the run died on; the wrapper then runs the real `decide()` against a rejecting stub, so a guard that fires before the request throws first and dumps the live snap, levelGems and deathHistory verbatim to `REPLAY_DUMP` (default `out/empty_menu_snap.json`). Usage: `REPLAY_JSON=<run_*.json> node run_level.cjs replay <level>`. It is how this failing state was captured instead of reconstructed by hand.

**Fixture test** `driver/test_empty_objective_menu.cjs` (in the suite) loads `driver/fixtures/empty_objective_menu_l6.json` — that verbatim dump — and asserts the objective menu is non-empty there. It fails on the old code (empty menu + missing guard) and passes on the fix. `docs/simulate-clock-audit.md` line numbers were re-pinned after the fix shifted the `simulate()` sites by +9 lines; `test_simulate_clock.cjs` passes.

The replay reproduces the trajectory to step 274 but is not deterministic decision-for-decision: laser thickness is unseeded, so the run reached step 274 in one replay but not necessarily the same step in another (27 vs 28 decisions observed). The empty-menu state, however, is deterministic and reproduced exactly (same (x,y), same gem set). Level 6 on Darwin is unmeasured (the model never answered the step-274 objective); with the fix the run no longer dies on a driver defect, but re-running it on the model to get a real level 6 result needs the Darwin adapter re-served.

**RISE_LABEL live (2026-10-10, supervisor-run, fixed build + EXIT_FACT + RISE_LABEL=1): neutral-to-positive, kept.** The label fix (rising cats were called "falling" in every shipped prompt; 11,399 archived decisions mislabeled) results: L5 regression s3 and s6 both CLEARED, same as without it. L3 s8 CLEARED (10 deaths) where the same seed failed without the fix (12 deaths); L3 s9 not cleared (12 deaths, 2 gems). L13 s5/s6/s7 0/3 (3, 2, 2 gems - s5 held 3 gems for the first time on that seed but did not reach the portal; without the fix it held 2). The offline probe said the label is heard (max delta 4.2e-2) but flips no archetype alone; the live numbers match: no regression, one level-seed gained. Not a dead end - it fixes a factual error in the state description regardless of the run numbers.

**Full-ladder runs (run_full, supervisor-run): s3 stopped at L3 (10-death cap; L3 clears isolated), s6 with RISE_LABEL stopped at L2 (10-death cap; L0, L1 cleared; L2 clears 5/5 isolated).** `run_full` resets deathHistory, visit counts/window, lockedObjective and the trackers on every level change, so this is not carry-over between levels: the seeded RNG is consumed differently inside a ladder, and per-level isolated clear rates overstate ladder reliability.

**Ladder A/B, STALL_EXPLORE=0 at seed 3: NULL result (2026-10-10, `noexplore_s3/`).** Same build as the failed ladder (fixes + EXIT_FACT), with the gate: the progress-STALL events still logged (23 lines) but recorded no failures, so exploration never took over. Outcome: L0 0 deaths, L1 0, L2 2 (112 decisions vs 39 with exploration), L3 10 deaths / 213 decisions / 2 peak gems - stopped at L3 on the death cap again. The 19/20 death-after-STALL correlation from `ladder_stall.cjs` was SHARED STUCKNESS, not exploration causing the deaths: with exploration off, the same stuckness kills the same way. The ladder's L3 gap is the stuckness itself (2 peak gems - one gem never comes; which and where is the next unit). Seed 6 (+RISE_LABEL) running.

**Ladder A/B, STALL_EXPLORE=0 at seed 6: L0-L3 CLEARED in one session - furthest any ladder has gone (2026-10-10, `noexplore_rise_s6/`).** L0 0 deaths, L1 0, L2 6, L3 5, then stopped at L4 on the 10-death cap (L4 peak 2 gems). The same seed WITH exploration stopped at L2. Opposite sign from s3's null: at s6 the exploration path was causal (the stall->record->sample regime cost L2), at s3 it was shared stuckness. Two seeds, split verdict - exploration is not uniformly harmful, but with it off the ladder reaches L4, which is now THE wall (never cleared by Flash with any change). Full-stack ladder (fixes + EXIT_FACT + RISE_LABEL + NEG_HOLD + STALL_EXPLORE=0) running at s6/s7.

**L10 first fixed-build clear with NEG_HOLD (2026-10-10, supervisor-run): directional, not proof.** L10 for Flash: baseline s1 CLEARED (6 deaths, 96 decisions - the lucky arc with no mid-air decision inside the tower approach), s2/s3/s4 failed (17 deaths each) = **1 of 4**; fixed build (no NEG_HOLD) s3/s4 failed = **0 of 2**; with fixes + EXIT_FACT + RISE_LABEL + NEG_HOLD=1, **s3 CLEARED** (5 deaths, 131 decisions, 3 gems, 1210 steps, sawAdvance true) and **s4 not cleared** (14 deaths, 2 gems) = **1 of 2**. One clear on one seed is directional only - s1 already showed L10 clears on luck, and the mode-1 apex is a coin the fact only tilts.

The NEG_HOLD firings on that winning path (12, recomputed with the live predicate): the model avoided the named bad hold in 10 of 12. The two TOOK-BAD are informative: steps 143/146 (309,189.6 dy-2, BAD=left dies in the laser) are exactly the probe state where the fact moved left 0.971 -> 0.861 but did not flip the argmax - live, the model still took left and survived the fall that killed the same state on other seeds. Step 762 (244.25,96, BAD=right) is the other take. The fact is heard everywhere and obeyed most places; the apex prior is the hard case (docs/flash-l10-l12-analysis.md, L10 section).

**Provenance fix:** `run_stats.cjs` `BUILD_FLAGS` did not list `EXIT_FACT`, `REACH_FACT`, `RISE_LABEL` or `NEG_HOLD`, so archives since their addition recorded the build without them (the L10 s3 clear's build field omits all three that were live). All four added; runs started after the edit stamp them. Older archives' true builds are described in this file and the sweep invocations, not in their build fields.

**NEG_HOLD full record (2026-10-10, supervisor-run, fixes + EXIT_FACT + RISE_LABEL + NEG_HOLD=1).** L13: **0 of 2** - s5 collected 3 gems for the first time on that seed (the climb WORKED: gem_c taken at step 713, mf 188, on floor(156..208@63), inside the deadline) but then endgame-dithered on that floor and died; s6 held 2 gems. The fact fixed the bounce it was built for and moved the failure one stage later, to the portal dither (PORTAL_REACH census: not an information gap, docs/dead-ends.md). L10: **1 of 2** (paragraph above). Regression on the clearing levels: **6 of 6** - L2, L5, L8 cleared at BOTH s3 and s6 (L8 s6 took 15 deaths), so the airborne sentence costs nothing on levels that already clear. Probe evidence and the blast (76,906 states, pure appends) in docs/flash-l13-analysis.md "## NEG_HOLD".

**PORTAL_DESC live: L13 2 of 4 on previously-0-of-4 seeds, regression 8 of 8 (2026-10-10, supervisor-run, full stack + PORTAL_DESC=1, supervisor-run archive dir).** The gate appends `; dropping off this end, the cat can steer into the exit portal on the way down` to a descent objective entry only at `gemsCollected>=3` when `survival.canStillLand(..., portal=true)` proves it from that edge (blast: 0 of 82,486 gate-off, 323 pure appends gate-on; probe: 2 of 4 dither states flip portal->descent, portal mass drops at all 5). L13 seeds 5/6/7/9, all four previously failed: **s5 WON, s9 WON (7 deaths)**, s6/s7 not cleared - both stuck at 2 gems and never reached the endgame where the gate can fire (gc>=3-only), so they ran the pre-gate prompt. **2 of 4 vs 0 of 4** on the same seeds. Regression on every level the blast touches: **8 of 8** - L7, L9, L8, L5 at BOTH s3 and s6 all cleared (L8 s6 with 7 deaths), so the sentence costs nothing on levels that already clear. L13 s10-s12 running for a firmer rate. Full account: [flash-l13-analysis.md](flash-l13-analysis.md).

**GAP_DROP clears L4 - a level Flash had never held more than 1 gem on (2026-10-10, supervisor-run, best build + GAP_DROP=1).** L4 seeds 3 and 4 both **CLEARED**: s3 (5 deaths, 86 decisions, 829 steps), s4 (1 death, 49 decisions, 444 steps). Before this, Flash had never held more than 1 gem on L4 at any seed; the wall was the @93 dither where the gap note (`walking cannot cross it, only a jump can`) argued against the productive left edge while gem_c is reached by DROPPING off it. The A/B probe: removing the note flipped left 0.26 -> 0.92 at all four dither states; the shipped gate instead COMPLETES the sentence (`; stepping off this end drops onto x 156..208 at y 241.`) only when every landing off the warned edge is the objective's own holder floor - 1,603 firings, all on L4, every other level byte-identical. **FINAL: 5 of 5 cleared** (s3 5 deaths, s4 1, s5 3, s6 1, s7 3). The full ladder with the whole stack (fixes + EXIT_FACT v1.1 + RISE_LABEL + NEG_HOLD + PORTAL_DESC + GAP_DROP) follows; L4 was the only wall before L5-L9. Full account: [flash-l4-analysis.md](flash-l4-analysis.md).

**L3 same-build baseline before the ESC_FIX A/B (2026-10-10, supervisor-run, systemone, best build = fixes + EXIT_FACT v1.1 + RISE_LABEL + NEG_HOLD + PORTAL_DESC + GAP_DROP, no ESC_FIX).** Isolated L3 seeds 14-18: **5 of 5 cleared** (deaths 10, 1, 2, 17, 5). The previously failing seeds 8, 9, 11 are being re-run on this same build without ESC_FIX to anchor the A/B; ESC_FIX=1 runs follow on the same seeds. Basis for the gate: the losers' @246 dither is ~75% SAMPLE with two thirds of samples off-argmax (docs/flash-l2-l5-analysis.md); the gate excludes a key's previously-SAMPLEd dead-end move from the sample and renormalises (unit + decide-level synthetic 2-key loop in test_osc_fix.cjs).

**L3 closed on the current best build; ESC_FIX parked without a live A/B (2026-10-10, supervisor-run, systemone).** Previously failing isolated seeds 8, 9, 11 all CLEARED on the same build WITHOUT ESC_FIX (7, 10, 6 deaths; s16 earlier took 17) - isolated L3 is now **8 of 8** (s8, s9, s11, s14-s18). The ladder L3 stops were the run_full DEATH CAP (MAX_DEATHS_PER_LEVEL defaults to 10; run_full.cjs:57 documents it as a diagnostic abort, not a game rule; isolated runs have no cap). The supervisor is re-running the full-stack ladder at MAX_DEATHS_PER_LEVEL=30 MAX_TOTAL_STEPS=60000 (FULL/cap30_s6, cap30_s9). ESC_FIX therefore has no failing L3 seeds left to fix: gate stays OFF, code + tests stay on main (test_osc_fix.cjs green), sim estimate stands (dwell 19->4 max at the dither key). If a future level shows a 2-key dither under the cap, the gate is built and tested.

**Ladder cap30_s6 (pre-fix baseline) + the advance-spill cadence parity bug found and fixed (2026-10-10).** run_cap30_s6.sh (full stack + GAP_DROP=1, MAX_DEATHS_PER_LEVEL=30 MAX_TOTAL_STEPS=60000): cleared L0-L3, stopped at L4 with `death_cap_unwinnable` (30 deaths) - while isolated L4+GAP_DROP was 5/5. Cause is NOT GAP_DROP (the clause is shared decision.cjs code and the divergence state shows it inert): the ladder's L4 life-1 walked right off the @93 left-floor edge into the @241/@180 loop, the isolated winner JUMPED right across the gap at the same state. The runners differ at level entry: run_level's first decision of every life is mf 0 AIRBORNE at spawn; run_full's first decision of every LEVEL was mf 5-6 GROUNDED (measured on cap30_s6 L2/L3/L4: g@mf6(189,64), g@mf5(170,290), g@mf6(112,93) for level entries vs a@mf0 for every in-level death reset; isolated logs are a@mf0 everywhere). Root cause: run_full's handleEvent returned FALSE for the advance event, so the frames left in the advancing decision's step batch ran inside the NEW level with the OLD action held (up to 5 frames of spill), shifting the level-entry clock phase; run_level stops the batch on ANY event. The phase shift changed the walk-vs-jump call at the gap edge (mf 24 vs mf 12 texts differ only in the clock lines). FIX: run_full handleEvent now returns true for advance (batch ends at the advance frame; outer loop still owns transition bookkeeping). test_runner_parity.cjs gained a source-pin that fails on the old code. npm test: Unexpected failures: 0. run_full has NO start-level option (argv[2] is the endpoint only), so the live check must run the ladder from L0 after cap30_s9 finishes. **LIVE CHECK PENDING** (post-fix ladder not yet run; cap30_s9 still running on the pre-fix build; launch awaits the user).

**ROUTE_ASCENT (L11): gate bug fixed, blast + census done, live A/B pending the GPU window (2026-10-10, offline unit).** The parked gate had a real bug, now fixed: it required the opposite-side floors to have NO route to the gem's collector at all, but on L11 @187/@228 DO reach it - by jumping straight back onto the current floor (d=4 via here). The honest reading of "does not lead to it" (the wording the probe A/B approved, 3/3 flips) is "no route that does not come back here first"; `distToCollector` gained an `avoid` parameter and the dead-end test uses it. With the fix the clause fires at the archetype (idx 17, the jump_right loop state) and 45/204 grounded decisions in EXIT/s3 L11.
- **Off-arm parity (explicit):** current decision.cjs with ROUTE_ASCENT unset vs `git show HEAD:driver/decision.cjs` over every archived grounded state: **52,829 states, 0 diffs** (`experiments/blast_route_off_parity.cjs`; regenerate the scratch with git show before rerunning).
- **Blast on:** **2,947 pure appends, 0 non-pure diffs** over 52,829 states (`experiments/blast_route_ascent.cjs`). NOT L11-only: fires on L5 224, L7 28, L8 260, L10 298, L11 644, L13 1493 (of scanned 2391/1364/5425/2197/3660/6821).
- **Compliance census (`experiments/census_route_ascent.cjs`):** at fired states the chosen move agrees with the route side / contradicts it (jump toward a named dead-end) / is neutral - L11 losers 22/415/196 (the 415 ARE the jump_right loop); L11 winner (Darwin s2) 2/9/0; L13 losers 376/294/732; L13 winners 4/25/62; L10 winners 12/1/29.
- **Truth check on every winner-contradicted claim (35 states):** the 9 L11 winner contradicts are the loop itself (winner jumped right 9x, never collected gem_a from @187/@228, escaped LEFT). The 26 L10/L13 winner contradicts: in **26/26 the named gem was collected only AFTER returning to the decision floor** - zero cases of the gem being reached without the return. **The clause is true at every contradicted state tested, winners included.**
- **Open before any live use:** rule 4 risk stands - the fact fires on levels that already clear (L13 at 22% of states) and a true-but-irrelevant sentence can still cost decisions; the missing evidence is a live regression on L5/L7/L8/L10/L13 + the L11 A/B, which needs the GPU window. Gate stays OFF until then.

**Ladder updates (2026-10-10, supervisor-run).** cap30_s9 (pre-fix build, SEED=9): cleared L0-L3 (L3 took 17 deaths), stopped L4 `death_cap` (30). Post-fix ladder **fixadv_s6** running (run_fixadv_s6.sh, cap30_s6 flags): the advance-batch fix is verified live - first decision of L0/L1/L2 is mf 0 AIRBORNE at spawn (was mf 5-6 grounded pre-fix). **Result (ended 2026-10-10 18:28):** cleared L0-L3 with 5 deaths (L0 0, L1 0, L2 2, L3 3), stopped at L4 `death_cap` (30 deaths, 1086 decisions, peakGems 2); total 12099 steps, 1765 classifier calls, 1382 ms/decision. So the cadence fix restores level-entry parity but does NOT clear ladder L4: every L4 life still walks right off the @93 gap edge at 140.25,93 (jp 0.62) and then dies on @241/@180 (laser timeouts and unwinnable resets). Isolated L4 escaped only because its first life stranded fast and blamed key 140,90; ladder deaths are blamed on @241/@180 keys, so the model never sees the gap-edge decision in its death history. Next lever under test: FALL_BLAME (gated). Archive: out/byom/PurpleMIST-Flash-1.0-FULL/fixadv_s6/.

**FALL_BLAME (fall-edge death blame): built, gated OFF, offline-verified; live queue armed (2026-10-10, offline unit + wiring).** The ladder L4 failure is a credit-assignment gap: every life walks right at (140.25,93) onto the @241 loop and dies there; the death history blamed only the last grounded key (@241/@180 wander positions), never the edge that doomed the life. The isolated winner escaped that state only by escalation luck (a stranding death attributed to 140,90 + a SAMPLEd jump_right), which the ladder never gets because walking right there does not kill the ladder cat. New gate `FALL_BLAME=1` (default OFF): the death history ALSO names the edge of the HIGHEST floor the life fell from and never got back up to. Truthful line: this life left floor y93 at 140,90 (move right) and never returned; it died downstream. No policy: the model still decides.
- **Rule refinement (supervisor premise corrected by data):** "blame the most recent fall" fails death #7 - that life had fallen 93->241->180->241 and the most recent fall started at @180. The falls LIST + "highest floor never returned to" is what makes the requirement true. Verified against ALL 30 L4 deaths in the fixadv_s6 log: every one blames **140,90 (move right)** (`/tmp/fall_blame_check.cjs` over `full_fixadv_s6.log`; both DEATH and unwinnable line formats handled).
- **Module:** `driver/fall_blame.cjs` - `createFallBlame().observe(posKey, rawY, move)` at every grounded decision, `.reset()` per life/level, `.blameKeys(deathY)` at death (returns [] when the flag is unset). Raw grounded y everywhere, never the rounded key (241-vs-240 cannot flip a comparison). Wired identically in `run_level.cjs` (recordDeath + deathY param at the 3 call sites; reset in doReset and recordDeath) and `run_full.cjs` (recordDeath via PRE cathy; unwinnable push via s.cat.y; reset at level entry, unwinnable, death).
- **Test:** `driver/test_fall_blame.cjs` - failing-first shown (module missing on old code; runner pins failed pre-wiring), now passing: fixture is the real fixadv_s6 life before death #7 from the log lines; asserts the 140,90 blame, the edge move, flag-off = no entries, no-fall/no-blame, died-above-the-edge/no-blame, recovered-then-fell-again blames the second edge, reset clears, both runners wired. Added to `test_all.cjs` and the AGENTS.md suite list. `npm test`: **Unexpected failures: 0** (2026-10-10, commit-pending tree).
- **Offline replay (`driver/experiments/replay_fall_blame.cjs`):** replays all 30 fixadv_s6 L4 deaths through the tracker and renders the fork-state prompt (140.25,93 mf12 gem_a): **flag OFF: 0 prompt diffs** (blast clean); **flag ON: the fork prompt changes from death #1** - "On a previous attempt from here you chose right and unwinnable reset: ..." appears at the exact state every life walked right from.
- **Audit re-pin:** the routeAscentClause edit shifted decision.cjs +4; docs/simulate-clock-audit.md pins moved 1906->1910, 1944->1948, 2098->2102, 2134->2138, 2186->2190, 2228->2232, 2251->2255. test_simulate_clock Failed: 0.
- **Live queue (GPU one-at-a-time, after the ROUTE_ASCENT A/B):** ladder SEED=6 then SEED=9 with the fixadv_s6 flags + MAX_TOTAL_STEPS=60000 + FALL_BLAME=1 + MAX_DEATHS_PER_LEVEL=30 (direct comparison: fixadv_s6 = L4 death_cap 30); then isolated L4 FALL_BLAME=1 SEED 3,4 as the regression check (isolated L4 clears 5/5 without the gate). Script /tmp/fb_ladder_queue.sh, log /tmp/fb_ladder_queue.log.

**ROUTE_ASCENT live A/B (2026-10-10, running).** Isolated L11, full shipped flags, ROUTE_ASCENT=1 vs 0, nominal seeds 1-2 - CORRECTION: the script omitted SEED, so both seeds ran identical RNG and the A/B is **n=1 per arm** (s1==s2 byte-identical in both arms, see docs/method.md); sequential (`/tmp/ab_route_ascent.sh`, log /tmp/ab_route_ascent.log). Arm s1-ra0 (old run_level.cjs, pre-FALL_BLAME) and s1-ra1 (post-FALL_BLAME-wiring run_level.cjs, FALL_BLAME unset - proven inert: blameKeys returns [] and the replay shows 0 prompt diffs flag-off) both did NOT clear L11; seeds 2 pending. All four arms ran with FALL_BLAME unset.

**ROUTE_ASCENT A/B seed-1 pair: the clause fires, the model OBEYS it, L11 still fails downstream at @211 (2026-10-10).** Both arms stopped at **steps=3000 (MAX_STEPS), not a death cap** (7 deaths each, cap is 40); both peaked at 2/3 gems.
- **ra0 (gate off):** deaths blamed 190,190 / 160,230 / 200,190 - the cat kept ending on the RIGHT dead-end floors (@187/@228 region) and burning lives to unwinnable resets (2 collected, gem_a unreachable). Same loop as every previous Flash L11 loss.
- **ra1 (gate on):** the clause fired at **26 grounded decisions**; at firing states the model **agreed with the route side 23, contradicted 0, neutral 3** (mostly jump_left at 148-190,231 toward @211); **20 of those states took a different move than ra0 at the same position+objective**. The dead-end loop is GONE - the fact changed behavior exactly where it fired.
- **But ra1's deaths moved to the LEFT route floor: 80,210 / 100,210 (floor 62..114@211), all unwinnable resets.** The cat jumped left as told, collected 2 gems, then could not complete the next climb (@211 -> @152) and stranded gem_a. Darwin s2 proves the left route is completable (@211 -> @152 -> @114 -> jump onto gem_a), so the remaining failure is one hop further up the route, not the clause being false. The clause named a true route; the model took it and failed at a later, harder jump.
- Reconstruction note: firing/compliance rebuilt offline from the finished archives with the shipped flags (probe-free; buildMoveCall on logged states).

**ROUTE_ASCENT A/B FINAL: 0/2 distinct runs (nominal 0/4 - the script omitted SEED, s1==s2 per arm byte-for-byte; see docs/method.md), gate stays OFF - the clause is followed but not sufficient; the real L11 constraint is a clock the clause does not name (2026-10-10).** All four arms (s1, s2 x ROUTE_ASCENT 0/1): steps=3000, **7 deaths each, peak 2/3 gems**.
- **Why exactly 7:** the stop is **MAX_STEPS=3000 (run_level.cjs:63, hardcoded)**, not a death cap (MAX_DEATHS=40). Every L11 life ends the same way at ~380 steps (death steps 372/752/1129/1512/1888/2270/2647 - uniform ~377 spacing): gem_a's ttl expires -> `unwinnable reset: 2 collected + 0 alive cannot reach 3`. 3000/380 = 7.9 -> 7 full lives + a truncated 8th. **A higher death cap would not help** (7 < 40); a higher MAX_STEPS would only add more identical lives - each life replays the same expiry, so more lives change nothing without a behavior change.
- **ra1 compliance (seed-1 pair, same for s2):** clause fired 26x, model agreed 23 / contradicted 0 / neutral 3; the right-side dead-end loop is GONE. The failure moved downstream.
- **The @211/@114 timing analysis (logs + arc.simulate, offline):**
  1. The @211 -> @152 hop (jump_left from ~97.5,211) **works and lands at 66,152 at every clock phase up to mf ~291** (laser from mf ~303). ra1 made this hop successfully 4 times (steps 969, 1392, 1735, 2475 - each landed 68,152 -> @114).
  2. The final hop @114 -> gem_a is a **jump_right from ~125.5,114 that collects gem_a (180,76) mid-air** (arc apex passes through it; Darwin's winning collect: step 1335 at 201,187 right after the mf-161 jump). arc.simulate scan mf 0-400: **safe mf 0-174, laser mf >= 180** - the corridor closes at mf ~176 and never reopens within the life.
  3. **PRUNE_FATAL then correctly prunes every jump at @114** once the corridor is closed - ra1's @114 menus show only left/right (probs confirm: no jump keys at any of the 35 @114 decisions). The cat walks to the edge (139.5,114: left 0.499 / right 0.501), dithers, falls back, and the life burns to the ttl expiry. The unwinnable detector is right: with the corridor laser-locked, gem_a is unreachable.
  4. **Flash is structurally too slow:** ra1 first reaches @211 at mf ~204; even with zero dither the @152/@114 hops land at @114 at mf ~240-250, past the mf-176 close. Darwin s2's winning life reached @211 at mf 105-123 and jumped at mf 161 - inside the window. The gap is made by Flash's walking dither at @231 and @211 (~150 frames spent at x 90-111 on @211 before hopping).
- **Verdict:** ROUTE_ASCENT stays OFF (built, tested, documented; it does what it claims and is not the missing piece). Candidate levers this census feeds (supervisor's call, Rule 4 census first): (a) a deadline-urgency fact at @211/@231 (gem_a expires ~mf 375; the corridor closes ~mf 176 - the prompt currently names neither); (b) a pruned-jump reason line (when PRUNE_FATAL removes a jump, say why - the menu at @114 silently offers no jump). Both are consequence-framed; neither is a pathfinder.

**L11 corridor census (candidate fact (a), offline, no blast yet) (2026-10-10).** First, the supervisor's salience question: the move prompt at the @211 dither states says NOTHING about gem_a's deadline or the corridor - the only countdown in decision.cjs is the closing-LASER-to-cat line (countdownLine, gated by walking-distance provability), and it does not fire at these states. So the corridor fact is missing information, not a salience problem with an existing line. dead-ends.md checked: the rejected clock facts were a fixed-frame countdown threshold (line 54, replaced by the distance-gated laser countdown) and the DEAD/ALIVE route verdicts (line 59, zero-firing) - neither overlaps this.
- **Hop windows (arc.simulate close scans, L11):** @211->@152 jump_left from 97.5,211 closes at **mf 300**; @152->@114 jump_right from 68,152 closes at **mf 336**; @114->gem_a jump_right closes at **mf 179** from both tested launch x (125.5 and 139.5). The bottleneck is the LAST hop and it closes FIRST. gem_a ttl ~ 375 frames (uniform ~377-383 life lengths).
- **Census at route-floor grounded decisions with obj gem_a (floors @231/@211/@152/@114), open = mf < 179:** Darwin s2 (winner) 15 open (mf 73-173) / 25 closed; Flash ra0 20 open (127-174) / 15 closed; Flash ra1 16 open (127-174) / **94 closed (192-372)**. Every run got ~15-20 open-window decisions; the winner converted his (gem_a jump at mf 161, 18 frames before the close), the losers burned theirs dithering on @231/@211 and arrived at the corridor after it shut (ra1 first @211 decision: mf 204).
- **Reading:** the actionable firing states are the OPEN-window decisions at @231/@211 (mf 127-174, 16-20 per loser run): true there ("the route's @114 jump closes in ~N frames"), true-but-already-too-late nowhere (gate fires only while arc says the window is open), and true for the winner too (no winner-contradiction, unlike ROUTE_ASCENT's loop states). Proposed line shape: "the jump from here toward gem_a is possible only for about N more frames", N = 179 - mf computed per state from arc.simulate, fired only where a route exists and the window is open. Next step per supervisor flow: build behind a gate, blast, then live A/B - awaiting go.

**L11 corridor fact: parked pending supervisor go (2026-10-10).** Census above stands; gate not built. Note: fb_s6 ladder (FALL_BLAME=1) running in parallel; L11 work resumes after the L4 line of work or on supervisor go.

**L4 gap-edge jump_right census: the prompt has NO true line for where jump_right lands; GAP_DROP only describes the FATAL step-off (2026-10-10, logs + arc only).** Live fb_s6 L4 (supervisor-read): life 1 walked right (0.62, fell); lives 2-3 answered the fall-blame line with **jump_LEFT (0.29/0.34) - retreat, still dying**; life 4 walked right again (0.65) after a non-fall death replaced the line. jump_right, the isolated winner's move, stays ~0.07. FALL_BLAME changed the choice but not toward the winning move.
- **arc.simulate(4, 140.25, 93, ..., mf 12/24):** `jump_right` **lands at (202,93)** - across the 52px gap onto floor x 199..251@93, safe at both phases (first laser at mf 74). `right` just walks to 144,93 (toward the edge). jump_right is safe AND lands on the isolated winner's route side.
- **The move prompt at that state (rebuilt byte-exact from the GAP/s6 archive):** the gap sentence says "walking cannot cross it, only a jump can" but never says where a jump lands; GAP_DROP's note describes ONLY the step-off landings ("Step off the RIGHT end (x 147) and you steer to land on platform x 156..208 at y 241; steer to land on platform x 79..131 at y 180") - the FATAL loop floors, which makes walking off sound survivable. "No higher platform can be reached by a jump from this floor" is true but silent on same-height crossings. The @93-right floor appears only as a geometry line "x 199..251 at y 93 (same height, right)" with no action link.
- **Census candidate (next step if approved):** a truthful jump-landing line at gap edges, computed from arc.simulate: "a jump to the RIGHT lands you on platform x 199..251 at y 93 (across the gap)" - the jump analogue of GAP_DROP (which covers step-off landings only). Fires only where arc says the jump crosses the gap to a same-height floor; silent elsewhere. Not built yet.

**GAP_JUMP (gap-crossing jump landing): built, blasted clean, live queued behind fb (2026-10-10).**
- **(0) Why JUMP_FACTS said nothing:** `jumpUpNote` filters landings to `r.y < cur.y` - HIGHER platforms only. The same-height crossing edge EXISTS in the reachability graph (floor(95..147@93) -> x199..251@93); the note just never looked at it. The fix belongs in jumpUpNote: a gated sibling appends the crossing sentence.
- **(1) Census (`experiments/census_gap_jump.cjs`, all archives, all levels):** same-height jump edges exist on L4/L9/L10 only; 7,502 crossing-state x floor pairs. Crossing-jump taken rate at those states: **L4 winners 38/553 (6.9%) vs losers 184/4940 (3.7%); L9 winners 49/176 (27.8%) vs losers 286/2294 (12.5%)**; L10 winners 3/29 vs losers 131/519 (tiny winner sample, reversed). Winners take the crossing more on the two levels with real samples.
- **(2) dead-ends check:** the rejected same-floor note (dead-ends line 73) is the NEGATIVE form ("reaches no platform other than this one", zero-information, L2 regression); the stricter-trigger rejection (line 74) was "true but not special". GAP_JUMP is the POSITIVE form naming a specific landing for a specific action; the winners-vs-losers crossing rate is the specialness evidence. Flagged honestly: fire volume is high (4,199 states), same watch as line 74.
- **(3) Gate + blast:** `GAP_JUMP=1` (default OFF) appends to the jump-facts line: "From this floor, a jump to the RIGHT crosses to platform x 199..251 at y 93." `experiments/blast_gap_jump.cjs` over 53,635 states: **gate-off vs git HEAD decision.cjs: 0 diffs; gate-on: 4,199 pure appends, 0 non-pure** (L4 2190, L9 1461, L10 548). Pitfall found: decision.cjs snapshots JUMP_FACTS at module load - the blast must set env BEFORE require (it is set before require in the script). No new arc.simulate call site (graph-based); audit pins shifted +22 by the insertion and were re-pinned (1932/1970/2124/2160/2212/2254/2277); test_simulate_clock Failed: 0; npm test Unexpected failures: 0. The blast's HEAD copy is regenerated with `git show HEAD:driver/decision.cjs > driver/decision_head_tmp.cjs`.
- **(4) Live (queued, supervisor-gated order):** after the fb queue ends - isolated L4 GAP_JUMP=1 seeds 3,4,5, then ladder seed 6 with GAP_JUMP=1. Not started yet.
- **Live queue (armed, PID-wait on the fb queue, no pgrep self-match):** isolated L4 GAP_JUMP=1 seeds 3,4,5 -> isolated L9 seeds 1,2 and L10 seeds 1,2 (regressions: GAP_JUMP fires 1,461 / 548 states there; L10 clears on the current build 1/2 so it is included) -> ladder seed 6 cap 30. Script /tmp/gap_jump_queue.sh, log /tmp/gap_jump_queue.log.

**fb_s6 ladder (FALL_BLAME=1): FIRST LADDER L4 CLEAR - on life 30, the death-cap life, by a SAMPLED p=0.14 jump_right. FALL_BLAME did not raise the crossing probability over lives; verdict: the cap bought enough draws, not a reliable fix (2026-10-10).** Per-life move at the gap edge (140.25,93 mf~12) across all 30 lives (from the flushed archive copy): right x10, jump_left x8 (the FALL_BLAME retreat - lives 2,5,11,12,14,21,25,28), jump x2, left x1, **jump_right x3 (lives 6, 23, 30)**. jump_right PROBABILITY at that state per life: mean **0.167**, first-half 0.165 vs second-half 0.169 - **flat, no rise over lives** (range 0.095-0.345, driven by which death lines the life carried). Pre-fix baseline was ~0.07, so the fall-blame lines roughly doubled the crossing mass at some lives but never trended up; life 6 crossed at p=0.110 and still died downstream, life 30 crossed at p=0.141 and cleared on its last allowed life. Honest framing: 30 draws at ~15% is a coin-streak clear, not learned behavior. **GAP_JUMP's whole point is to raise that probability directly** - the live GJ runs measure exactly this. fb_s6 continued to L5 (L4 deaths 29 + the clear); fb_s9 and the isolated fb runs follow in the queue.

**L11 corridor census, un-parked: separable winners vs losers; gate + blast next, no live queue yet (2026-10-10, offline).** Line candidate: "the route to gem_a closes in about N frames" with N = bottleneck_close - mf. Bottleneck = the @114->gem_a jump, close mf **179, launch-stable** (179 at launch x 125.5, 138 and 139.5). The @211->@152 hop is launch-POSITION dependent (close 0 at the left edge x64, 300 at x97.5) and must NOT be used as a canonical close - the gate may only fire on launch-stable hops (spread <= 10 across 3 launch x). Firing rule: grounded, obj gem_a, route exists from the current floor to the collector (@114 - the floor whose jump apex passes through gem_a; platformHolding(gem_a) is null, the gem floats above no floor), N in (0,120]. Census (`experiments/census_corridor_l11.cjs`): **Darwin s2 fires 15x, took the route hop 9 (60%); ra0 fires 57x, took it 2 (3.5%); ra1 fires 68x, took it 13 (19%)**. Separable: winners act inside the window, losers dawdle through it. CAVEAT from the seed audit below: ra0 s1==s2 and ra1 s1==s2, so the loser counts are two copies of ONE trajectory each - the separability direction stands, the counts are n=1 per loser arm. dead-ends.md: no overlap (the rejected countdown was the laser-to-cat fixed threshold; the DEAD/ALIVE verdicts were zero-firing).

**fb_s6 ladder final (FALL_BLAME=1, SEED=6, MAX_DEATHS_PER_LEVEL=30 MAX_TOTAL_STEPS=60000, shipped flags + GAP_DROP=1; supervisor-recorded 2026-10-10).** Command: `/tmp/fb_ladder_queue.sh` run 1 (`SEED=6 OUT_DIR=../out/byom/PurpleMIST-Flash-1.0-FULL/fb_s6 node run_full.cjs systemone`, endpoint systemone = PurpleMIST-Flash-1.0). Reached **L6, the furthest ladder so far** (previous best L4): L0 0 deaths, L1 0, L2 4, L3 6, L4 29 (cleared on life 30), L5 1, L6 30 -> `death_cap`. Total 25,837 steps, 3,923 classifier calls, 1,322 ms/decision. L6 deaths cluster in two groups: x ~291-311 at y 132-262 (mf ~215-275, early), and ~211-264 at y ~184-220 near mf ~450-480 (timeouts); 2 unwinnable resets with 1 gem collected. L6 is the next ladder frontier.

**CORRIDOR_CLOCK (route-deadline clause): built real-clock, censused on all firing levels, blasted clean; npm test green (2026-10-10).**
- **Gate:** `CORRIDOR_CLOCK=1` (default OFF) appends one line to the move prompt: "The route to gem_X closes in about N frames: one of its jumps is laser-blocked after that." Trigger is geometric, no level list (supervisor ruling): gem target; a collector floor exists whose jump at the REAL clock passes within 24px of the gem (`ccCollector`/`ccJumpCollects`, real `mf` threaded from the caller - the constant-phase-60 first cut was rejected in review as exactly the defect class the clock audit exists to remove, and was fixed before any live use); a route from the cat's floor to the collector exists; the collector's jump-toward-the-gem close is LAUNCH-STABLE (spread <= 10 across 3 launch x; any non-closing launch = no deadline); N = close - mf in (0,120]. The launch-stability guard is what excludes the L11 @211 hop (close 0 at the edge vs 300 mid-floor); the clause states a deadline, never a policy (Rule 1).
- **Clock audit:** sites 15 (`ccFirstLaser` close scan, real clock by design) and 16 (`ccJumpCollects`, real `mf` caller) added to docs/simulate-clock-audit.md; all downstream pins re-pinned +102 total (now 2034/2072/2224/2260/2314/2356/2379). test_simulate_clock's doc parser was widened from clocks "0"/"1" to any numeric constant (it misclassified real rows after the fix; the fix itself removed the constant).
- **Census (`experiments/census_corridor_all.cjs`, all archives, shipped clause via export; compliance = took the route's first-hop jump):** L11 W 9/15 (60%) vs L 289/1126 (26%) - the target level, separable as measured pre-gate. Positive direction (W agrees >= L): L5 11/44 vs 14/107, L7 11/109 vs 12/349, L8 24/805 vs 11/583, L9 6/33 vs 6/33. Negative: L1 6/116 vs 2/13, L13 25/110 vs 487/1670, L4 0 W-states archived vs 52/1007 L. L2 fires once. The census is a compliance proxy, not harm evidence; the clause is arc-proved true wherever it fires.
- **Blast (`experiments/blast_corridor_clock.cjs`, 53,635 states):** gate-off vs git HEAD decision.cjs: **0 diffs**; gate-on: **6,088 pure appends, 0 non-pure**. Per level: L1 129, L2 1, L4 1007, L5 151, L7 458, L8 1388, L9 33, L11 1141, L13 1780. The real-clock collector probe fires MORE than the constant-phase first cut (6,088 vs 4,823; L4/L5/L8 new or up) - at the real phase more floors genuinely collect.
- **Live plan (supervisor rule: firing levels that already clear join the regression set):** isolated runs with CORRIDOR_CLOCK=1 on L1, L2, L4, L5, L7, L8 vs their known clear rates, plus the L11 A/B (the target). Not queued yet - the fb/GAP_JUMP chain holds the endpoint.

**L6 death census + the separating decision: the first-fall steering fork (2026-10-10, fb_s6 archive + EXIT/s3 winner, offline).**
- **fb_s6 L6 deaths (30, death_cap; the text log showed 14 before flush, the archive has all 30):** 13 right-edge laser deaths (x 290-311, y 130-262, mf 215-281), 15 mid-floor burnouts (x 211-276, y 166-220, mf 443-480), 2 unwinnable resets. Every laser death: coll=2, alive=1 - all 30 lives died chasing the THIRD gem; peak gems 2, never 3.
- **Geometry (reachability graph, L6):** floor(211..263@220) is a DEAD END (its only edge is back up to floor(241..293@176)); the right cluster {220, 176, 289..341@136, 257..309@78} connects left ONLY over the top via floor(194..246@60) -> floor(128..180@79). gem_a (135,143) sits in the left cluster. A life that collects the right gems and then needs gem_a must climb the right wall and cross over the top - the route EXISTS (BFS-verified from every right floor to both left floors) but no Flash life found it in 30 tries.
- **The separating decision:** both winner and losers pick obj gem_c at spawn and walk the identical opening (right, right, jump_right at 120.25,110). The fork is the AIRBORNE decision at (127.25,112.4) dy=1.2 four frames after that jump: **steer right/none and the fall passes through gem_a (free collect at 143,141.2, 8px - the winner's own path proves it); steer left and the cat lands back on floor(70..122@110 and gem_a is skipped.** Winner (EXIT/s3): probs right 0.666 (argmax), took right, collected gem_a free at step 49, then b and c, then the portal from the right slope - never needed the return route. Losers (fb_s6): probs left 0.394 / right 0.370 (argmax FLIPPED), **19/19 lives that reached the fork took left**, and every life died with gem_a uncollected. The two prompts are byte-identical except "up 103px" vs "up 104px" (mf 39 vs 40): a ONE-FRAME phase difference flipped the classifier's argmax at the fork from 0.666-right to 0.394-left. The fork is phase-fragile.
- **FALL_COLLECT candidate census (`experiments/census_fall_collect.cjs`, all archives, real-mf arc, model column):** "if you hold X, this fall passes through gem Y" fires on **42.7% of falling states (2542/5949)** - past the AIR_ROUTE rejection bar (dead-ends line 170: 30% was too broad). Compliance gaps: L6 W 93-100% vs L 53% (the motivating gap, right direction); L13 both 100% (no information); **L11 winners comply 0% (22/22) - the line contradicts Darwin's winning play there** (the corridor timing makes the gem-carrying hold the losing hold). L4 W 23% vs L 7-22% weak. **Verdict: rejected as a general airborne fact** (same class and same failure as AIR_ROUTE: fires everywhere, contradicts winners on the levels where timing dominates). The L6 fork stays a model-capability finding: the fact is true and the fork is where the level is decided, but no narrow-enough trigger was found that fires there without firing on L11/L13 too. Candidate narrowings tried and rejected: objective-only (the fork names a NON-objective gem - the line would not fire); first-fall-only (a hack, not a fact).
- **FORK6 per-life print** (in the census output): every fb_s6 life: named right->gem_a,none->gem_a, move=left, probs left 0.394/right 0.370 (or left 0.45-0.46 variants); every Flash isolated winner: named right->gem_a,none->gem_a, move=right, probs right 0.65-0.67. Darwin s1/s2 fork at step 147 names all three holds -> gem_c and complies (left).

**FALL_COLLECT narrowings (a) and (b): (b) passes the rarity bar but fails winner compliance; L6 PARKED as capability finding (2026-10-10, offline).** Same script, two narrower triggers: (a) fire only when the gem the fall passes through IS the current objective: **695 fired, 9.6%** of 7,276 falling states - and zero firings on L10/L11/L13 (the contradiction zones of the broad form are gone). (b) (a) plus only the FIRST airborne decision after leaving a floor: **261 fired, 3.6%** - under the ~5% bar, and again zero on L10/L11/L13. But winner compliance where it does fire is the EXIT_FACT bar's other half, and it fails: L4 winners 4/20 (20%), L5 winners 1/4 (25%), L6 winners 1/4 (25%), L8 winners 1/12 (8%) - the clearing runs decline the gem-carrying hold in 75-92% of firing states (they steer for landing position, not gem interception). L6 direction even inverts: FLASH-FULL losers comply 5/5 (100%) vs winners 25%. Same shape as the FLOAT_EXIT rejection (compliance 0-30% both sides). **Verdict: (b) is rare enough but contradicts winners everywhere it fires; not gated. L6 is parked as a capability finding:** the separating decision is the first-fall fork, the true line that would name it is a general airborne fact (rejected twice now: broad AIR_ROUTE 30%, FALL_COLLECT 42.7%), and every narrowing that reaches the fork either fires too broadly or fails winner compliance elsewhere. The fork itself stays documented: 19/19 loser lives steered left against the gem, winners steered right with it, and a one-frame phase difference (up 103 vs 104px) flips the classifier's argmax between the two builds.

**FALL_BLAME v2 (air steering in the death line): census says the line can never fire; not built (2026-10-10, offline).** Supervisor lever: at temperature 0 every L6 life replays the fork identically, only the death history differs, so append the steering held during the blamed fall ("fell from K steering left"). Census `experiments/census_fall_blame_air.cjs` on fb_s6 L6 (30 lives) and fixadv_s6 L4 (30 lives): the blame rule picks the fall from the HIGHEST never-returned floor - on L6 that is the spawn-floor fall (78.25,75 walked right, y75) in 28/30 lives, on L4 the gap edge (140.25,93 walked right) in all 30. **The archives contain NO airborne steering decisions during either fall** (L4: step 1607 grounded at 93, next logged decision 1640 already grounded at 241; L6: same pattern) - the runner only queries the classifier at intervals that skip these falls. Held-steering is empty in 60/60 lives: the v2 line would append "(steering ...)" to ZERO lives. And the fork itself is invisible to the fall rule by construction: it is a same-height jump-out-and-land (leave floor(70..122@110 at 120.25,110, land back on it), not a fall to a lower floor. **Verdict: nothing to gate - the mechanism has no data to speak from on these archives.** The fork remains reachable only by facts computed from geometry at the fork state itself (the FALL_COLLECT line, rejected on breadth/compliance), or by runner changes to log airborne decisions during falls (out of scope: the driver observes, it does not change what the game logs). fb_s9's L6 will replay the same structure (same logging property, not seed-dependent); census to be re-run when it exits for completeness.

**MISS_BLAME (closest-approach death line): censused, built, tested, blasted; baseline L6 queued (2026-10-10).**
- **Census (`experiments/census_miss_blame.cjs`):** for each life ending with a live gem, the closest logged approach to that gem, the move held at that decision, and the distance. **fb_s6 L6: 28/30 lives' closest approach to gem_a is the fork at 127.25,112.4 holding left, 32px** (the other two: the jump-off at 109.75,110 holding jump_right, 42px; and 130.75,116 holding left, 27px). The line "the previous life passed within 32px of gem_a at 127.25,112.4 holding left and never collected it" fires on 28/30 lives and names the losing steer. **L4 (fb_s6 and fixadv_s6): 0/29 and 0/30 at the gap edge or its landing** - closest approaches are the right-side wandering floors (66-127px, holding left); L4 does not need this lever (FALL_BLAME covers its decision point), and the line would be true-but-not-special there - noted for the live regression watch. fb_s9's L6 CLEARING life (jump_right at 109.75,110 mf 30, p=0.25 - a different fork solution than the winner's steer-right) joins the census when the archive closes.
- **Gate:** `MISS_BLAME=1` (default OFF). `createMissBlame` in fall_blame.cjs: observeAll(x,y,move,liveGems) on EVERY decision (the closest approach is usually mid-air), lines() at death for the gems still alive at the last observation, reset() on respawn. Wired identically in run_level.cjs and run_full.cjs (both death paths in run_full, including unwinnable).
- **Test:** `test_miss_blame.cjs` failing-first on the real fb_s6 L6 life-0 fixture (26 decisions): gate off = no lines; gate on = exactly the fork line (gem_a, 32px, 127.25,112.4, holding left); reset clears; runner parity asserted by source (both runners create/observe/lines/reset). In test_all.cjs + AGENTS.md.
- **Blast (`experiments/blast_miss_blame.cjs`, 16 run_full archives, 852 deaths):** gate OFF adds **0 lines** to any death history; gate ON adds 825 lines (deaths with a live gem and at least one observation). decision.cjs untouched, so prompt parity off-gate is structural.
- **Live:** baseline isolated L6 (current build: shipped + GAP_DROP + FALL_BLAME, MISS_BLAME off, SEED=1) queued after the corridor queue (wait on PID 16670 - the actual corridor pid), script /tmp/l6_miss_queue.sh PID 54203, log /tmp/l6_miss_queue.log. Purpose: check isolated L6 reproduces the ladder's left-at-fork loss; the MISS_BLAME=0 vs 1 A/B is queued only if it does (supervisor's conditional).

**fb_s9 ladder final: L0-L9 CLEARED, stopped at L10 `death_cap` (FALL_BLAME=1, SEED=9, MAX_DEATHS_PER_LEVEL=30 MAX_TOTAL_STEPS=60000, shipped flags + GAP_DROP=1; supervisor-recorded 2026-10-11).** Command: `/tmp/fb_ladder_queue.sh` run 2 (`SEED=9 OUT_DIR=../out/byom/PurpleMIST-Flash-1.0-FULL/fb_s9 node run_full.cjs systemone`, endpoint systemone = PurpleMIST-Flash-1.0). **Furthest ladder so far** (fb_s6 reached L6; every pre-FALL_BLAME ladder stopped at L3 or L4). Deaths per level: L0 0, L1 0, L2 0, L3 4, L4 26, L5 1, L6 27, L7 0, L8 20, L9 3, L10 30 (peakGems 2). Total 34,192 steps, 5,202 classifier calls, 1,484 ms/decision. L4 cleared on life 27 by the same sampled p=0.14 jump_right at 140.25,93 mf 12 as fb_s6; L6 cleared on life 28: with objective gem_a it walked right off the @110 floor at mf ~54 and fell through gem_a (the objective then switched to gem_c), i.e. the winning side of the first-fall fork that the L6 analysis identified. The clears at L4 and L6 are late-life draws, not reliable fixes: the levers aimed at raising those probabilities directly (GAP_JUMP for L4, MISS_BLAME for L6) are queued live.

**fb_s9 ladder final (FALL_BLAME=1, SEED=9): furthest ladder yet - cleared L0-L9, death_cap at L10 (2026-10-10).** L0 0, L1 0, L2 0, L3 4, L4 26, L5 1, L6 27 (cleared on life 28), L7 0 (!), L8 20, L9 3, L10 30 -> death_cap. Command: /tmp/fb_ladder_queue.sh run 2. Corrections recorded here: the jump_right-at-109.75,110-p=0.25 life cited earlier was an fb_s6 life, not fb_s9. fb_s9's real L6 CLEARING life (#28): objective switched to gem_a mid-walk, the cat WALKED RIGHT off floor(70..122@110) at 120.25,110 (mf 48) and FELL THROUGH gem_a (collect at mf ~54-57; closest logged point 18.6px at 136,124.4, next decision coll=1) - the winning side of the L6 fork, arrived at by the objective being gem_a when it reached the ledge.

**MISS_BLAME census, corrected winner set (2026-10-10):** fb_s6 L6 28/30 lives name the fork (32px at 127.25,112.4 holding left); fb_s9 L6 27/27 (same fork, plus 42px-at-109.75,110-holding-jump_right variants); the clearing life collects gem_a so the line never fires on it (correct behavior). L10 (fb_s9, 30 lives): the line fires on all 30 but names TWO clusters: the airborne APEX near the gems (16-57px at 247.75,96 / 237.25,96 holding left/none - the airborne steer that falls short into the shaft) and the 150-floor launch (59-64px at x 228-256,150 holding jump_right). Mixed but always in the fork region.

**L10 death census + fork (fb_s9 text log + NEG/s3 isolated winner, arc.simulate on each PRE state) (2026-10-10).** Geometry: right column x304..356 (floors y 290 spawn / 240 / 190 / 140 / 90), left column x212..264 (y 286 / 240 / 199 / 150), gems gem_a(229,123) gem_b(253,91) gem_c(287,68) - all in the left-column top / gap area.
- **Classification (14 log deaths, driver's own simulate on each PRE):** 7 = fell into the inter-column shaft and died to the BOTTOM laser one frame after the PRE state (y 258-270, dy 9.2-11.6, mf 141-198; simulate: laser at f+1, y~281); #6 walked right into the RIGHT laser on floor(304..356@240) at mf 25; the rest mid-shaft/side at mf 180-258. The spawn floor @290 is itself dead by mf ~150 (bottom laser above it).
- **The fork:** the rightward jump from floor(212..264@150). arc.simulate (hold-through): from 226.75,150 lands 305.5,240 (SHORT - on the 240 floor's left edge), from 246 lands 305.5,140, from 251.25 lands 307.3,140, from 263.5 lands 305.5,90 - launch x decides the landing floor. Every fatal life's last grounded decision was jump_right from x 226.75-263.5 on that floor, then the airborne steer went LEFT (toward the gem bearing) and the arc fell short into the shaft (the hold-right simulation lands safe from the same x - the steer is what kills). The NEG/s3 winner made the SAME fatal jump (226.75,150 mf 107, p=0.699) and died on it (4 of its 5 deaths are that jump); it cleared by later jumping right from 261.75,150 (p=0.81, step 1083) which reaches the 90 floor, then collecting gem_c and advancing. Same shape as L6: an airborne-steering fork where the argmax steer loses; here the launch x also matters and the winner found the right x by sampling.
- **Blame lines:** MISS_BLAME fires on 30/30 L10 lives (apex steer 16-57px or the 150-floor launch 59-64px - see above). FALL_BLAME is SILENT on L10: the lives keep returning to floor(212..264@150), so the never-returned rule excludes it; no other fall qualifies. The airborne left steer is not nameable by FALL_BLAME (it names grounded walk-offs).

**L8 death census (fb_s9 text log, simulate-verified) (2026-10-10).** 11 of 13 log deaths: standing on the SPAWN floor y 42 (x 289-345) when the top laser reaches it - simulate kills at f+1 at mf 109-110 (the floor is lethal from mf ~108); 2 deaths fell off the right end and died falling (f+11); plus 7 unwinnable resets (collected=2, alive=0: the third gem expired while the cat was on the spawn floor). The level's deadline is LEAVE THE SPAWN FLOOR BY mf ~108; the model dawdles there (obj bearings pull it back down after collecting the two lower gems at 74,231 and 123,198... it collects both then returns). Both blame lines are SILENT on L8: the life returns to the spawn floor (FALL_BLAME rule excludes it) and dies with 0 live gems (MISS_BLAME has no live gem to name). L8's lever, if any, is a spawn-floor deadline fact - not built, not censused; noted for the queue.

**Isolated L4 with FALL_BLAME=1: s3 CLEARED (5 deaths), s4 did not (14 deaths) - the s4 miss is NOT a FALL_BLAME regression; it is the unseeded-laser variance, proven at the divergence (2026-10-11).** Archives out/byom/PurpleMIST-Flash-1.0-FB/{s3,s4}, SEED 3/4, env = shipped + GAP_DROP=1 + FALL_BLAME=1, MAX_DEATHS_PER_LEVEL=40.
- **(1) Why s4 stopped at 14 deaths:** it hit the step cap, not the death cap - steps=3000 = MAX_STEPS (run_level.cjs:63); 14 < 40.
- **(2) Diff vs the GAP/s4 archive (the GAP_DROP 5/5 clear, same SEED=4, same build flags minus FALL_BLAME):** life 1 is IDENTICAL (both walk right at the gap edge 140,93 and die in the gap at step 45). Life 2: **36 of 37 decisions byte-identical - same steps, same moves, same moveProbs** - with the FALL_BLAME blame line ("fell from 140,90 move right") present in FB's prompt from life 2 onward. The line changed ZERO classifier outputs across the whole life. The single differing decision is not a decision: at step 385 both runs are at (173.5,241) mf 338 with identical probs and both choose jump_left (p=0.697); **FB's copy of the jump died, GAP's survived** and cleared (portal at 413). Same state, same move, same clock, different outcome = the unseeded laser-thickness draw (arc.cjs: getRandomLaserSize is Math.random, unseeded; runs-are-irreproducible note). After that coin flip FB's remaining 12 lives are the ordinary L4 gap loop to the 3000-step cap.
- **(3) Verdict, plainly:** FALL_BLAME did not hurt isolated L4. It fired as designed (the blame line was in every life-2+ prompt), moved no decision, and the clear/no-clear difference is one unseeded laser draw at step 385. n=1 per arm, so this is not proof of no-effect - it is proof that THIS s4 miss cannot be attributed to FALL_BLAME. The ladder gains (fb_s6 L4 clear at the cap, fb_s9 L4 clear in 26 deaths) stand; the trade-off is neutral on isolated L4.

**GAP_JUMP live: isolated L4 3/3 CLEARED (s3 4 deaths, s4 1, s5 0); at the gap edge jump_right is now ARGMAX p=0.809-0.811 on EVERY life (was ~0.07-0.15 sampled); L9 regressions both cleared 0 deaths (2026-10-11).** Archives out/byom/PurpleMIST-Flash-1.0-GJ/{s3,s4,s5,l9s1,l9s2}; command /tmp/gap_jump_queue.sh (env = shipped + GAP_JUMP=1, SEED per run). The crossing move went from a lucky draw (fb_s6 needed 30 lives and a p=0.14 streak) to the model's first choice on every arrival at the edge - the landing fact ("a jump to the RIGHT crosses to platform x 199..251 at y 93") is the difference. L4 isolated clear rate on this build: **3/3 with GAP_JUMP vs 5/5 with GAP_DROP alone pre-FALL_BLAME-scare and 0/2 without** - GAP_JUMP reproduces and strengthens the GAP_DROP clear. L9 s1 and s2 (GAP_JUMP fires 1461 states there): both CLEARED, 0 deaths - no regression. L10 regressions running; gj_s6 ladder follows in the same queue.

**GAP_JUMP L10 regression check: NOT a GAP_JUMP regression - the line never fires at the fatal fork and the model never takes the named crossing (2026-01-11).** GJ l10s1: not cleared, 15 deaths; l10s2: not cleared, 14 deaths (both to the 3000-step cap); baseline NEG_HOLD 1/2. Archives out/byom/PurpleMIST-Flash-1.0-GJ/{l10s1,l10s2}.
- **(1) Distinct trajectories:** identical only through life 1 (11 decisions, first diff step 254); 236/236 and 239/239 distinct step:move:pos entries.
- **(2) Where the line fires and what the model does there:** the trigger is a same-height graph neighbour; on L10 the ONLY such pair is the two y=240 floors (left x212..264, right x304..356). The line fired on 32 (s1) / 28 (s2) decisions; the model's moves there: jump_left 16 + jump 16 (s1), jump_left 14 + jump 14 (s2) - **it took the named RIGHT crossing 0 times in 60 firings.** It kept climbing the left column.
- **(3) Where the deaths actually are:** the known L10 fork - jump_right from floor(212..264@150) at SHORT launch x (226.75-246) with obj=gem_b: 12/15 and 11/14 deaths, plus the gem_c airborne-left cluster at (~285,96) mf~320-334. **GAP_JUMP does not fire at @150** (right neighbour is @140, not same height) - the fatal fork's prompts are byte-identical to the baseline build. Death RATE per 1000 steps is the same (~5/1000 both arms).
- **CORRECTION (supervisor): decisions are argmax at T=0 outside escalation, so "sampling" is not an explanation - and the first divergence between GJ s1 and NEG s3 is a GAP_JUMP-line decision.** Walking both logs from step 0: identical through step 6, first divergence at **step 25, (319.5,240) mf 23 obj=gem_c** - the RIGHT @240 floor, where the line fires ("a jump to the LEFT crosses to platform x 212..264 at y 240"). NEG (no line): jump 0.379 > jump_left 0.336 -> **jump**. GJ (line present): jump_left 0.395 > jump 0.346 -> **jump_left**. The line flipped the climb move at the third decision of the run; every later difference, including the arrival mf at the fatal @150 fork (99 vs 107) and which laser phase the fork jumps meet, cascades from that one flip. **GAP_JUMP has a real behavioral effect on L10 - a clock-phase shift at a phase-fragile fork - not a pull into the named crossing (0/60 crossings taken).**
- **Verdict:** the census reversal (winners 3/29 vs losers 131/519 take the crossing) describes a difference the live model does not express at the crossing itself; the live effect is the step-25 climb-move flip and its phase cascade. Whether that cascade HURTS is not established: the fork kills at some phases and survives at others (NEG s4, no line, also failed 1/2), and neither proposed tightening separates this case (both @240 floors are BFS-distance 1 from a collector floor; jump_left at 319.5,240 mf 23 survives at the real mf). **Combined queue (PID 2182) unchanged**: L4's 3/3 with jump_right argmax p=0.81 is a measured gain; L10's 1/2 -> 0/2 is a phase shift within a coin-flip band at n=2. If a larger L10 A/B (GAP_JUMP on vs off, 4+ seeds) shows the phase shift net-negative, drop GAP_JUMP from the combined build then.
