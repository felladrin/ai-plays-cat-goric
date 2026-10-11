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

**Route-gated GAP_JUMP re-blast (gpu-server, main 435d5c2, 2026-10-11).** Command: `git show b9004dd:driver/decision.cjs > driver/decision_head_tmp.cjs && GAP_JUMP=1 node experiments/blast_gap_jump.cjs` (b9004dd = main before the levers). Over 54,474 archived grounded states (24 unparseable): **gate-off vs pre-lever decision.cjs 0 diffs; gate-on 2,671 pure appends, 0 non-pure** - L4 1,564, L9 1,107, **L10 0** (the ungated line fired 548 L10 states). The route gate removes every L10 firing, including the step-25 flip at (319.5,240) obj gem_c (`test_gap_jump.cjs` pins it), so a live L10 check cannot distinguish the gated build from the baseline and was not run. The L4 gap-edge crossing line still fires (pinned by the same test).

**cmbg ladder (FALL_BLAME=1 + route-gated GAP_JUMP=1).** Script `out/queue/cmb_ladder.sh` (shipped flags + GAP_DROP=1, MAX_TOTAL_STEPS=60000, MAX_DEATHS_PER_LEVEL=30; SEED 9 then 6; `OUT_DIR=../out/byom/PurpleMIST-Flash-1.0-FULL/cmbg_s<seed> node run_full.cjs systemone`, endpoint systemone = PurpleMIST-Flash-1.0 on gpu-server). Comparison: fb_s9 (FALL_BLAME alone) cleared L0-L9 with L4 26 deaths. Environment note: run_full always records video, and the driver's playwright 1.64 needs ffmpeg-1013, which is not installed here; the run uses `PLAYWRIGHT_MODULE` pointing at a playwright 1.63.0 install whose revisions match the cached chromium-1243 and ffmpeg-1011. The browser only renders the game, so this cannot change a decision.

**L10 launch-window census: launch x is not the lever; mid-air steering is (2026-10-11, offline, `node experiments/census_launch_window.cjs`).** At (229,150) obj gem_c the prompt's JUMP_FACTS line says @90 and @140 "a jump from this floor can land on", which is true of the floor but not of x 229 (75px to x 304, a jump carries about 59px). Held-`jump_right` arc.simulate from floor(212..264@150) at the real clock (mf 60-220): x < 226 laser, about 228 -> @240, 233-239 -> @190, 244-255 -> @140, 260+ -> @90, independent of mf. But live play does not follow the held arc. Over 269 grounded `jump_right` launches on @150 in 28 PurpleMIST-Flash L10 archives (isolated + ladder): launches at 242-257, where the held arc lands on @140, reached @140 **0 of 48** times (22 landed on @240, 26 died); launches at 226-242 died 82 of 82; launches at x < 226 mostly steered back onto @150 (84/89); the only arrivals on @140 came from 257+ launches (13 of 35, the side-snap at 323,140). The mid-air re-decisions undo the launch, so a launch-window line would change the launch and not the outcome. Not built. This confirms L10 mode 1 (flash-l10-l12-analysis.md: the apex steer toward gem_c's bearing, which sits left of the tower) as the binding failure.

**cmbg_s9 ladder final: L0-L9 CLEARED in 20 deaths, stopped at L10 `death_cap` (FALL_BLAME=1 + route-gated GAP_JUMP=1, SEED=9, main 435d5c2, gpu-server, 2026-10-11 01:56-02:21 UTC).** Deaths per level: L0 0, L1 0, L2 0, L3 4, **L4 0** (fb_s9: 26), L5 6 (fb_s9: 1), **L6 9** (fb_s9: 27), L7 0, L8 1 (fb_s9: 20), L9 0, L10 30 (peakGems 2). 14,334 steps, 2,155 classifier calls, 1,327 decisions, 1,107 ms/decision. Same frontier as fb_s9 (L10), reached with 20 deaths instead of 54. L4: the first life jumped right at the gap edge (140.25,93) mf 12 with p 0.81 and never died, the GAP_JUMP effect the isolated runs measured, now inside the ladder. L5's 6 deaths are a different opening, not a GAP_JUMP effect (GAP_JUMP fired 0 L5 states in the blast): the ladder shares one seeded RNG, so a 0-death L4 changed L5's first objective (gem_c instead of fb_s9's gem_b), and the cat then dithered left/right at (108-115,152) for gem_b with 4 unwinnable resets. L10: every life ends on the known @150 fork (jump_right at x 228-246 and down the tower's right face; deaths at x 309-325, y 246-282). The archive's `build` stamp omits FALL_BLAME and GAP_JUMP (and 9 more gates): `BUILD_FLAGS` in run_stats.cjs never listed them; the flags were on (the log shows the GAP_JUMP p 0.81 at L4). Fixed on branch stamp-all-decision-flags with a test.

**Platforms shrink under the lasers, and the driver's geometry does not know it (2026-10-11, offline + one probe page, no model calls).** Game source: `checkPlatformsCollisionWithLasers.ts` lowers a platform's `scaleX` by 0.01 per frame while its 40x8 laser box touches a laser, and destroys it at scale 0 or when its centre leaves the laser bounds. The cat collides with the 52x16 sprite, whose width is 52 x scaleX about the centre (kontra `getWorldRect`). For a side laser the box edge tracks the beam exactly (20 px x 0.01 = 0.2 px/frame = droneSpeed), so the scale is (359 - 0.2 mf - x)/20 on the right and (x - 1 - 0.2 mf)/20 on the left; top and bottom beams shrink it 0.01/frame from first contact. `level_data.cjs`, `arc.simulate`, `reachability.cjs`, `survival.cjs` and the prompt all use static full-width platforms.
- **Probe:** `CHROME=... PLAYWRIGHT_MODULE=... node experiments/probe_platform_shrink.cjs 10 400 120` (cat jumping in place on L10, harness page, no endpoint). The five tower floors at x 330 read scale 1.00 until mf about 45, then 0.93 at mf 49, 0.83 at 59, 0.73 at 69, 0.63 at 79; each death resets them to about 0.99; while the cat idles at mf 56 the scale drifts 0.84 -> 0.81 and stops (the edge leaves the beam). At mf 80 the @140 floor is about x 314..346, not the 304..356 the prompt states.
- **First contact per platform** (analytic, thin beam): L10 tower x 330 all five floors at mf 45; L13 (34,134) 65, (35,62) 70, (101,25) 100; L12 (319,165) 100, (46,191) 125; L3 (170,290) 80, (232,289) 85; L5 (40,111) 95; L6 (315,136) 120; L7 (316,78) 115.
- **Census** (`node experiments/census_shrink.cjs`, 195 PurpleMIST-Flash archives, every grounded decision, chosen move held, static vs shrinking geometry): outcome differs on L10 186/1461 (12.7%), L3 114/3341 (3.4%), L6 54/2130 (2.5%), L5 13/1883, L4 6/8768, L12 1/2450, 0 elsewhere. Top cases: L3 jump_right static @200 -> live laser (71), L10 jump_right static @240/@190/@140/@90 -> live laser (65/28/26/23), L10 jump_right static @140 -> live @190 (21).
- **Which model matches the game:** where they disagree and the next logged state shows the outcome, the shrinking model was right **195** times and the static model **4** (L10 113:0, L3 40:2, L6 27:1, L5 12:0, L4 2:1, L12 1:0). This explains the L10 launch-window census above: the held arc from (251.25,150) mf 80 "lands on @140 at x 307.25" only on a full-width floor; the live floor starts at about x 314, and the cat fell to @240 in all 22 archived cases.
- **Consequence:** prompt facts that name floor extents, jump landings and descent landings near a side laser are false once it reaches them, and the hold-extension and fatal-prune checks rely on the same static simulator. L10 is the extreme case: its whole gem_c route (@150 -> @140 -> jump_left) runs on floors that start shrinking at mf 45 and are gone near mf 145.

**cmbg_s6 ladder final: L0-L10 CLEARED, the first ladder past L10; stopped at L11 `death_cap_unwinnable` (FALL_BLAME=1 + route-gated GAP_JUMP=1, SEED=6, main 435d5c2, gpu-server, 2026-10-11 02:21-03:16 UTC).** Same command as cmbg_s9 with SEED=6. Deaths per level: L0 0, L1 0, L2 4, L3 3, L4 2, L5 5, L6 10, L7 10, L8 27, L9 4, **L10 3**, L11 30 (peakGems 2). 31,913 steps, 4,578 classifier calls, 3,036 decisions, 1,046 ms/decision. L11's 30 lives: 23 `unwinnable reset: 2 collected + 0 alive`, 3 `1 collected + 1 alive`, 4 laser or bounds, so L11 is lost to the gem clock, not to falls: the target of CORRIDOR_CLOCK (route-deadline clause, built and blasted, never run live). L8 again cost 27 deaths (fb_s9 20), the spawn-floor deadline noted in the L8 census. Across the two cmbg seeds the frontier is L10 (s9) and L11 (s6); fb_s9 alone reached L10 with 54 deaths before it.

**SHRINK_GEOM live, isolated L10 A/B: off 1/3, on 0/3 (2026-10-11, gpu-server, branch shrink-geometry 53e0308).** Command: `out/queue/shrink_queue.sh` (combined build = shipped flags + GAP_DROP + FALL_BLAME + GAP_JUMP, `SHRINK_GEOM=$sg SEED=$seed node run_level.cjs systemone 10`, endpoint systemone = PurpleMIST-Flash-1.0). Six distinct trajectories (step:move:x,y hashes all differ). Cleared / deaths / decisions / peak gems:

| SEED | SHRINK_GEOM=0 | SHRINK_GEOM=1 |
| --- | --- | --- |
| 1 | no, 16, 258, 2 | no, 9, 415, 2 |
| 2 | **cleared**, 5, 84, 3 | no, 9, 423, 2 |
| 3 | no, 14, 299, 2 | no, 8, 403, 2 |

With the gate on, lives last longer (8-9 deaths in 3,000 steps against 14-16) but none reached the tower: 0 grounded decisions on @140 in s1 and s2, and the @150 launches still cluster at x 210-229 (s2: 14 of 26), where every held jump_right now dies in the live simulator. The gate-on prompt is true and says nothing that points left (diff at (222,150) mf 100: the tower floors read x 319..341 and @90 drops out of the jump list). Live-geometry launch table (`SHRINK_GEOM=1`, held jump_right from @150): @140 only from x >= about 255 and only at mf <= about 60; from mf about 90 every held launch dies. L10's gem_c route is a deadline race on a floor that disappears, and true widths alone do not win it. The build stamp now carries SHRINK_GEOM and FALL_BLAME (end-to-end check of the stamp branch). Ladders with SHRINK_GEOM=1 (SEED 9, 6) running next to measure the other levels it changes.

**L10 is decided by the objective held at the right end of @150 (2026-10-11, offline census over 28 PurpleMIST-Flash L10 archives, lives split at respawn).** Winners and losers reach floor(212..264@150) at the same clock (first grounded @150 at mf 74, median, both groups; first x >= 255 also mf 74), so a deadline line would not separate them. What separates them is the objective at the first right-end state (261.75,150) mf 74. In 5 of the 7 lives that collected gem_c, the objective was gem_c and the move `jump_right` (p 0.81), the winning approach. The losers there mostly held gem_a, then `jump_left` (p 0.90-0.94, 51 lives), or gem_b, then `left` (24+). Another 11 losers held gem_c and jumped right, then walked `left` off the tower instead of the `jump_left` that collects it (L10 mode 2). With live geometry, gem_c's only route (a jump from the right end of @150 onto the shrinking @140 floor) is open only until about mf 60-80, and the floor is gone near mf 145. Nothing in the objective menu says that gem_c's route closes first: the DESTROYED FIRST mark keys on gem deadlines (gem_c mf 335), not on the floors its route needs.

**ROUTE_BURN (collector floors vanish long before the gem): built gated OFF, censused, blasted clean (2026-10-11, branch route-burn 5c6ae9d, stacked on shrink-geometry).** `route_burn.cjs`: a gem's collector floors are the full-width floors from which standing or a held jump / jump_left / jump_right touches its 16x16 box (arc.simulate at clock 0, geometry only); a floor is gone when every platform in it reaches scale 0 (`platform_live.scaleAt`). With `ROUTE_BURN=1` the gem's objective-menu line (state text and criterion) gains "Every floor this gem can be collected from is destroyed by the lasers in about N moving frames, long before the gem itself." when the floors go at least 100 frames before the gem's deadline and N is in 1..200.
- **Census (all gems, all levels):** collectors gone vs gem deadline, lead >= 100: L6 gem_b 472 vs 645, L9 gem_a 100 vs 325, **L10 gem_c 142 vs 335**, L12 gem_c 395 vs 535, L13 gem_a 305 vs 550. At the L10 decisive state (261.75,150) mf 74 the line reads "in about 68 moving frames" on gem_c, which already carries DESTROYED FIRST; the model there picks gem_a (`jump_left` p 0.90-0.94) in 51 losing lives.
- **Blast** (`render_states.cjs` over 50,740 archived grounded states; reference = shrink-geometry driver, `blast_shrink_geom.py`): gate off 0 diffs; gate on changes only the objective call, 5,060 states, all pure appends of the sentence (0 non-pure): L6 112, L9 228, L10 2,358, L12 2,071, L13 291. Move prompts and menus unchanged. `npm test` in driver/: Unexpected failures: 0 (new `test_route_burn.cjs`; audit lines re-pinned +7).
- **Live (queued):** `out/queue/rb_queue.sh`, L10 SEED 1-3 with the gate on against the SHRINK A/B's gate-off L10 runs at the same seeds (identical prompts until the line fires), then regressions L9 and L6 SEED 1-2.

**sg_s9 ladder (SHRINK_GEOM=1 + FALL_BLAME + GAP_JUMP, SEED=9, branch shrink-geometry 53e0308, 2026-10-11 03:45-04:41 UTC): L0-L10 CLEARED, stopped at L11 `death_cap_unwinnable`.** Command: `out/queue/shrink_queue.sh` ladder step (`SHRINK_GEOM=1 SEED=9 OUT_DIR=.../sg_s9 node run_full.cjs systemone`, MAX_DEATHS_PER_LEVEL=30, MAX_TOTAL_STEPS=60000). Deaths: L0 0, L1 0, L2 0, L3 1, L4 6, L5 1, L6 10, L7 0, L8 9, L9 2, **L10 27** (cleared on life 28), L11 30. 34,221 steps, 4,939 calls, 3,467 decisions, 937 ms/decision. Against cmbg_s9 (same seed, gate off): one level further (cmbg_s9 capped on L10), but the L10 clear is a late-life draw, L4 cost 6 deaths against 0, and L8 cost 9 against 1; L5 1 against 6. L11 again lost entirely to the gem clock: 27 `2 collected + 0 alive` and 3 `1 collected + 1 alive` resets, 0 laser deaths, same as cmbg_s6's L11. Not a verdict on SHRINK_GEOM (n=1 ladder per arm; sg_s6 running).

**L2 left-edge dither: a false airborne line, recorded as a candidate, not built (2026-10-11, offline).** sg_s6 spent 21 deaths on L2 (cmbg_s6, same seed, gate off: 4); both start with the identical first life, move for move: walk left to (76.75,64), step off, and at (71.5,64.4) dy 0.4 mf 81 the airborne decision answers `right` (p 0.72), which side-snaps the cat back onto the y64 floor; repeat until the top laser reaches the head at mf ~220. The gate cannot cause it (no L2 platform shrinks before mf 295; the prompts at these states are byte-identical with SHRINK_GEOM on and off). The airborne prompt there (AIR_FACTS off, as shipped) still renders the grounded floor block: "The floor you stand on is continuous from x 74 to x 286 at y 64 ... There is NO way down at your current x (the floor is unbroken here)" while the cat is at x 72, already past the end; and the side-snap note says steering right into x 84..136 at y 240 lands the cat on it, without saying that steering right now lands it back on the y64 floor 2px away. AIR_FACTS (the whole airborne rewrite) is a recorded dead end (lost L5); a narrow version would only drop the false "NO way down at your current x" sentence when the cat's x is outside the floor. Not pursued now: every ladder clears L2, and the frontier is L10/L11.

**SHRINK_GEOM verdict: true geometry, not a live gain on PurpleMIST-Flash-1.0; stays OFF (2026-10-11).** sg_s6 (SHRINK_GEOM=1, SEED=6) was stopped by hand at L4 after 9 L4 deaths (L2 21 (see the L2 entry: not a gate effect), L3 2); cmbg_s6 at the same seed cleared L4 with 2. With sg_s9's L4 at 6 against cmbg_s9's 0, L4 is worse with the gate at both seeds, and isolated L10 went 0/3 against 1/3. The L4 deaths sit late in the life (mf 340-530) on the lower floors where the y171 floor and its descents read narrower; not attributed line by line. The gate keeps its value as a measurement tool (the live simulator reproduces archived landings the static one gets wrong, `test_shrink_geom.cjs`) and ROUTE_BURN uses its shrink formula, not the gate.

**ROUTE_BURN live: the true line pushes the model AWAY from gem_c; stopped after one partial run, stays OFF (2026-10-11).** `out/queue/rb_queue.sh` L10 SEED 1 (route-burn 5c6ae9d, base flags + FALL_BLAME + GAP_JUMP + ROUTE_BURN=1), stopped by hand mid-run. At the first objective decision of the level (spawn, mf 0; the state and prompt are identical to the gate-off run `PurpleMIST-Flash-1.0-SG/l10_sg0_s1` except for the appended sentence) P(gem_c) fell from **0.587 to 0.188**, and the choice moved to gem_a (0.50). The next objective decisions show the same direction: gate off gem_c 0.727 / 0.465 / 0.519 / 0.268 / 0.644, chosen 5 of 6; gate on 0.354 / 0.228 / 0.130 / 0.073 / 0.039, chosen 1 of 6. "Every floor this gem can be collected from is destroyed ... long before the gem itself" reads to the classifier as "this gem is a lost cause", the implied-relevance failure in dead-ends.md, here on the objective layer: a true clock fact framed as a loss lowered the gem it describes. Also measured: at the decisive right-end state (261.75,150) mf 74 the objective is usually held (sticky or held from launch), so a menu line only acts where the objective is asked, earlier in the climb. A wording that frames the same window as an opportunity ("can be collected only in the next N moving frames") is the obvious next probe; not run.

**CORRIDOR_CLOCK live, isolated L11 A/B: 0/3 vs 0/3, no measurable effect (2026-10-11, gpu-server, shrink-geometry 53e0308 worktree, SHRINK_GEOM=0).** Command: `out/queue/cc_queue.sh` (combined build + `CORRIDOR_CLOCK=$cc SEED=$s node run_level.cjs systemone 11`). Six distinct trajectories. Every run: not cleared, 7 deaths (the 3,000-step cap holds 7 lives of ~380 steps; each life ends `2 collected + 0 alive` when gem_a expires), peak 2 gems; decisions 276/279/258 off, 293/278/297 on. The line fires (the trajectories differ from the gate-off runs at the same seed), but the lives never take the left route in time: decisions on the left route floor (@211, x < 115) per run: off 1 / 0 / 18, on 0 / 14 / 4, and no life of either arm reached @152 or @114 before the gem_a hop closes (mf ~179). Every life collects gem_b and gem_c first and reaches @231 at mf 103-186, then loops on the right side (@231 / @187 / @228). CORRIDOR_CLOCK alone names the deadline but not the direction; the combined arm (CORRIDOR_CLOCK=1 ROUTE_ASCENT=1, L11 SEED 1-3) is queued after the L8 A/B.

**L11 is decided by gem order: the only clear took gem_a first (2026-10-11, offline).** Darwin-27B-ZTC SEED 2 (the one L11 clear on record), winning life: @231 mf 74 -> left route @211 mf 105 -> @152 mf 124 -> @114 mf 149 -> gem_a and gem_b collected together at mf 204 -> gem_c at mf 258. Every Flash life in the CC A/B and the ladders takes gem_b and gem_c first (gem_b by mf 65-117, gem_c by mf 74-225), so it stands on @231 after mf ~104 with gem_a's last hop closing at mf ~179. At the first grounded decision (239.25,228) mf 5 the objective menu already marks gem_a DESTROYED FIRST, and offers gem_c with "A jump from this floor collects gem_c ... The cat is at x 239, inside that range", the stronger pull. Same shape as L10: the objective chosen early decides the level, and the binding clock is the route's (gem_a's hop, mf ~179), not the gem's own deadline (mf 375). Given ROUTE_BURN's result (a loss-framed clock line lowered the gem it names), the next step is an offline wording probe on the objective call before building anything: `out/queue/probe_wording.sh` (L11 gem_a and L10 gem_c; candidates none / window / windowFirst / loss), queued after the CC A/B.

**CORRIDOR_CLOCK live, isolated L8 A/B: off 2/3, on 3/3 (2026-10-11, same queue and build as the L11 A/B).** Six distinct trajectories. Cleared / deaths / decisions / steps:

| SEED | CORRIDOR_CLOCK=0 | CORRIDOR_CLOCK=1 |
| --- | --- | --- |
| 1 | no, 15, 355, 3000 | **cleared**, 12, 276, 1892 |
| 2 | cleared, 15, 324, 2564 | cleared, 5, 170, 1617 |
| 3 | cleared, 4, 89, 771 | cleared, 10, 275, 2112 |

Mildly positive and no regression on L8 at n=3 (one extra clear; total deaths 34 against 27, not a reduction). With L11 neutral (0/3 both arms), CORRIDOR_CLOCK earns a ladder test, not adoption by itself. The combined CORRIDOR_CLOCK + ROUTE_ASCENT L11 arm is running next.

**CORRIDOR_CLOCK + ROUTE_ASCENT on L11: 0/3 (2026-10-11, `out/queue/cc_queue.sh` combined arm).** Every run 7 deaths, peak 2. The cat now takes the left route (ROUTE_ASCENT, as before) but too late: s1 lives reach @231 at mf 103-240, @211 at mf 204-360, and the two lives that got to @114 did so at mf 285 and 297, past the gem_a hop's close at mf ~179. Neither clause changes the earlier objective order (gem_b and gem_c first), which is what spends the window.

**Objective-call wording probe: framed as an opportunity, the same clock fact raises the urgent gem; framed as a loss, it lowers it (2026-10-11, `out/queue/probe_wording.sh`, endpoint systemone = PurpleMIST-Flash-1.0, 16 classify calls, order-debiased as decide() does).** State = first grounded decision of the level, shipped flags + FALL_BLAME + GAP_JUMP; one sentence appended to one gem's menu line and criterion. P(target gem):

| Candidate sentence | L11 gem_a (239.25,228) mf 5 | L10 gem_c (321.25,290) mf 5 |
| --- | --- | --- |
| none | 0.113 (gem_c 0.629) | 0.194 |
| "It can be collected only during the next N moving frames." | 0.281 | 0.453 |
| "... only during the next N moving frames, before any other gem's time runs out." | **0.398** (argmax; gem_c 0.377) | **0.515** (argmax) |
| loss ("route closes ... can never be collected" / ROUTE_BURN's) | 0.207 | 0.085 |

(N = 174 on L11: gem_a's last hop closes at mf ~179; N = 137 on L10: gem_c's collector floors are gone at mf 142. Both "before any other gem" claims are true at these states: L11 gem_c 490, gem_b 545; L10 gem_b 450, gem_a 610.) Next: build the window fact (gated), with the window computed generally as the last clock at which any collector floor can still collect the gem, then census, blast and run L10 and L11 live.

**COLLECT_WINDOW (gem collection window, opportunity framing): built gated OFF, censused, blasted clean (2026-10-11, branch collect-window, stacked on shrink-geometry).** `collect_window.cjs`: the window is the last clock (scanned down from the gem's deadline in steps of 2) at which a launch from a collector floor that still exists under the launch x at that clock (`platform_live.scaleAt`) touches the gem's 16x16 box in a held jump / jump_left / jump_right (or standing), with the lasers at that clock (`arc.simulate` real clock). With `COLLECT_WINDOW=1` the gem's objective-menu line and criterion gain "It can be collected only during the next N moving frames." when the window closes at least 100 frames before the gem's deadline and N is in 1..200, plus ", before any other gem's time runs out" only when every other live gem's window (or deadline) closes later.
- **Census (`windowClose` for all 42 gems, 1.8 s):** windows that close >= 100 frames early: L3 gem_a 428 vs 585, L6 gem_b 472 vs 645, L9 gem_a 122 vs 325, **L10 gem_c 144 vs 335**, **L11 gem_a 178 vs 375** (the L11 corridor census found ~179 by hand), L12 gem_c 386 vs 535, L13 gem_a 328 vs 550, L13 gem_b 222 vs 355. Every other gem's window ends within 2 frames of its deadline.
- **Blast** (`render_states.cjs`, 50,740 archived states, reference = shrink-geometry): gate off 0 diffs; gate on 8,155 objective calls change, all pure appends (0 non-pure), L3 467, L6 112, L9 228, L10 2,375, L11 1,762, L12 2,170, L13 1,041; move prompts and menus unchanged. `npm test`: Unexpected failures: 0 (`test_collect_window.cjs`; audit re-pinned +7).
- **Live (queued, `out/queue/cw_queue.sh`):** L10 and L11 SEED 1-3 gate on (gate-off arms at the same seeds already archived), then off/on pairs on L3, L9, L6 SEED 1-2.

**COLLECT_WINDOW live: isolated L10 3/3 CLEARED (gate off 1/3 at the same seeds) (2026-10-11, collect-window 5f77c5f, `out/queue/cw_queue.sh`).** Command per run: combined build + `COLLECT_WINDOW=1 SEED=$s node run_level.cjs systemone 10`, endpoint systemone = PurpleMIST-Flash-1.0. Distinct trajectories (hashes a846b458, 15d60f15, 5760e79a). Cleared / deaths / decisions / steps:

| SEED | COLLECT_WINDOW=0 (SG A/B, same build) | COLLECT_WINDOW=1 |
| --- | --- | --- |
| 1 | no, 16, 258, 3000 | **cleared, 1, 29, 404** |
| 2 | cleared, 5, 84, 1014 | **cleared, 5, 82, 1131** |
| 3 | no, 14, 299, 3000 | **cleared, 0, 19, 205** |

The line moves the objective layer as the probe predicted: s1's objective decisions put gem_c at 0.831 / 0.865 / 0.812 / 0.764 / 0.497 / 0.852 (gate off at the same seed: 0.587 / 0.727 / 0.465 / 0.519 / 0.268 / 0.644), so gem_c is held at the decisive right end of @150. s3 cleared with 0 deaths in 19 decisions, the fastest L10 clear in any archive. L11 SEED 1-3 running, then the regression pairs (L3, L9, L6).

**COLLECT_WINDOW on L11: 0/3; the objective moves to gem_a, the route does not (2026-10-11).** Same queue and build as the L10 runs. Every run: not cleared, 7 deaths, peak 2 gems. The line works on the objective layer (s1 objective decisions: gem_a 0.581 / 0.193 / 0.348 / 0.682 / 0.703 against ~0.11 with no line), but navigation toward gem_a goes up the right side: grounded decisions per floor, s1 @187 112 / @231 63 / @228 10 / left route 0; s2 @187 115, @211 8, @152 1, @114 2; s3 @187 102, @211 9. This is the L11 @231 route-vs-bearing loop that ROUTE_ASCENT fixes (followed 23/23 earlier, but too late when the objective order was wrong). COLLECT_WINDOW + ROUTE_ASCENT on L11 SEED 1-3 is queued after the regression pairs.

**COLLECT_WINDOW regression pairs (isolated, SEED 1-2, off / on, 2026-10-11, same queue).** Cleared / deaths / decisions / steps:
- L3: s1 cleared 2/31/386 vs cleared 2/34/393; s2 cleared 15/305/2872 vs **not cleared 15/370/3000**. The line was in the objective call at 19 of s2's 134 grounded states (from mf ~228; L3 gem_a's window closes at 428 against a 585 deadline). The off arm cleared 128 steps before the cap at the same death count, so this one miss is inside the noise of a hard seed; L3 stays on the watch list for the ladders.
- L9: s1 cleared 0/30/413 in both arms, s2 cleared 0/27/421 in both arms (the line changed no decision).
- L6: s1 7/363/3000 vs 7/357/3000, s2 7 deaths both arms, no clear in either arm (isolated L6 does not clear on this build with or without the gate).
Verdict so far: a large gain on L10 (3/3 vs 1/3), no change on L11 alone (0/3; route problem), no measured regression on L9 and L6, one ambiguous L3 miss. Next: COLLECT_WINDOW + ROUTE_ASCENT on L11 (running), then ladders with COLLECT_WINDOW=1.

**COLLECT_WINDOW + ROUTE_ASCENT on L11: 1/3, the first L11 clear on PurpleMIST-Flash-1.0 (2026-10-11, `out/queue/cwra_queue.sh`, collect-window 5f77c5f).** Command per run: combined build + `COLLECT_WINDOW=1 ROUTE_ASCENT=1 SEED=$s node run_level.cjs systemone 11`. s1 **cleared, 4 deaths, 168 decisions, 1,800 steps** (hash cb8d19fe); s2 not cleared, 7, 305 (9e024df8); s3 not cleared, 7, 276 (c2dad24d). Every earlier Flash L11 run, on any build, was 0 clears (CC 0/3, CC+RA 0/3, CW 0/3, the RA A/B 0/2). Per-life route clock (first grounded mf on @231 / @211 / @152 / @114; gem_a's hop closes at mf ~179): the s1 clearing life went 55 / 86 / 111 / 136 and took all 3 gems; s1's other lives reached @114 at mf 184-254, just after the close. s2 had one life on @114 at mf 139 that took gem_a and gem_b and lived to mf 471, then lost gem_c (deadline 490); s3's best lives reached @114 at mf 193 and 208. COLLECT_WINDOW turns the objective to gem_a and ROUTE_ASCENT sends it left; together they make the window reachable, not yet reliable. Next: ladders with both gates (SEED 9, 6), running.

**cwra_s9 ladder (COLLECT_WINDOW=1 + ROUTE_ASCENT=1 on the combined build, SEED=9, collect-window 5f77c5f, 2026-10-11 08:11-08:38 UTC): stopped at L6 `death_cap`.** Command: `EXTRA='COLLECT_WINDOW=1 ROUTE_ASCENT=1' TAG=cwra WT=../ai-plays-cat-goric-window SEEDS='9 6' out/queue/ladder.sh`. Deaths (archive): L0 0, L1 0, L2 0, L3 4, L4 0, L5 0, L6 30; 15,472 steps, 2,428 calls. L6 is a gem-order level too: gems gem_a (135,143) left, gem_b (225,181) and gem_c (221,108) right. Of the 30 lives, 27 went gem_b first (mf ~100-160), then gem_c (mf ~160-420), and never got back to gem_a: most die falling at (240-265, ~213) at mf 450-480, into the rising bottom laser (y ~216 by mf 460). The only lives that held all three gems took gem_a first, at mf ~60 (2 of 30), and they still did not reach the portal. COLLECT_WINDOW does not fire on gem_a (window 640 vs deadline 670: the trip, not the window, is what binds), and `route_clock.firstPickVerdicts` at the spawn states calls every first pick "alive" (its optimistic model lets a perfect player do b, c, a in time), so there is no true "dead" verdict to state. The L6 levers left: MISS_BLAME (names the fork miss near gem_a; its isolated A/B is queued after this ladder) and the fork itself.

**cwra_s6 ladder (COLLECT_WINDOW=1 + ROUTE_ASCENT=1, SEED=6, collect-window 5f77c5f): stopped at L2 `death_cap`, 30 deaths on L2.** Same command as cwra_s9 with SEED 6. Every L2 life is the left-edge dither recorded above: walk left to the end of the y64 spawn floor, step off, answer `right` while airborne at (71.5,64.4) (side-snaps back onto the floor), repeat until the top laser reaches the head at mf ~220. At this seed the ladder's RNG state reaches L2 in the same way in every ladder (cmbg_s6 L2 4 deaths, sg_s6 21, cwra_s6 30), so L2 is a ladder-killer at SEED 6, not a solved level.

**AIR_EDGE (true airborne floor text at a floor's end): built gated OFF, blasted (2026-10-11, branch air-edge e63bde4, stacked on collect-window).** At the dither state the prompt said "The floor you stand on is continuous from x 74 ... There is NO way down at your current x (the floor is unbroken here)", both false with the cat airborne at x 72 past the left end (x 74). With `AIR_EDGE=1`, when the cat is airborne within 8px past an end and within 14px (Y_TOL) of that floor's height, the block instead reads "The cat is in the air just past the LEFT end (x 74) of the floor x 74..286 at y 64. Steering right now lands the cat back on this floor." (the second sentence only when `arc.simulate` at the real clock confirms it) and drops the "NO way down at your current x" clause. Blast (`experiments/blast_air_edge.cjs`, 29,307 archived airborne states rendered at dy 1, reference = collect-window): gate off 0 diffs; gate on changes 2,522 states (L2 270, L6 414, L13 739, L3 222, L10 237, L4 198, others < 130). A first unrestricted version changed up to 77% of a level's airborne states, describing far-away floors as "just past", and was narrowed before any live use. `npm test`: Unexpected failures: 0 (`test_air_edge.cjs`; audit re-pinned, new real-clock site 17). Live: a CW + RA + AIR_EDGE ladder at SEED 6 then 9 is queued after the L6 MISS_BLAME A/B.

**MISS_BLAME live, isolated L6 A/B: 1/3 vs 1/3, no effect (2026-10-11, `out/queue/l6_miss.sh`, collect-window 5f77c5f; build = combined + COLLECT_WINDOW + ROUTE_ASCENT, MISS_BLAME 0/1).** s1: 7 deaths / 357 decisions / 3000 steps vs 7 / 364 / 3000; s2: 7 / 363 / 3000 vs 7 / 363 / 3000 (different trajectories); s3: **cleared on the first life, 0 deaths, 41 decisions, 349 steps, in both arms** (byte-identical: MISS_BLAME only speaks after a death). The death-history line does not change the outcome on L6. What decides L6 in these runs is the first life: in s1 both arms collected all three gems by mf 211 (gem_a at mf 54 first) and then spent ~230 frames without reaching the portal (180,150), looping between floor x 211..263 at y 220 and floor x 241..293 at y 176; every later life went gem_b first and never got gem_a back. From both floors a jump_left enters the portal box (from x 211..239 at y 220, from x 241..253 at y 176), and the move prompt with objective portal said nothing about it. MISS_BLAME stays OFF; PORTAL_JUMP (next entry) addresses the portal approach.

**AIR_EDGE live: it backfires at the state it was built for; ladder stopped on L2, gate stays OFF (2026-10-11, cwrae_s6, air-edge e63bde4, `EXTRA='COLLECT_WINDOW=1 ROUTE_ASCENT=1 AIR_EDGE=1'`).** Stopped by hand on L2 at 18 deaths. At the dither states the airborne `right` got STRONGER: (66.25,68) mf 66 0.58 -> 0.76, (71.5,64.4) mf 81 0.72 -> 0.83, later 0.94-0.95. "Steering right now lands the cat back on this floor" reads to the classifier as the way to safety, the implied-relevance failure again (a true sentence about a move makes that move more likely, whatever it says about it). The de-falsified floor text alone (without the steer-back sentence) is untested.

**PORTAL_JUMP (the jump that reaches the exit portal): built gated OFF, blasted clean (2026-10-11, branch portal-jump 072be6d, stacked on air-edge).** `runJumpWindow` takes an optional half-size (default the gem's 8); with `PORTAL_JUMP=1` and objective portal, the move prompt gains "A jump from this floor reaches the exit portal: jump and steer left from x 241..253. The cat is at x 270, right of that range: walk left into it before jumping." (same form as the GEM_FACTS gem jump note; portal box 32x32 about (180,150), floors below the box only). Blast (`render_states.cjs`, 61,688 grounded states, reference = air-edge): gate off 0 diffs; gate on 676 move prompts change, all pure appends: L1 20, L2 123, L4 182, L6 266, L7 3, L8 69, L10 11, L11 2. `npm test`: Unexpected failures: 0 (`test_portal_jump.cjs`). Live: isolated L6 A/B, SEED 1-3 x PORTAL_JUMP 0/1, on combined + COLLECT_WINDOW + ROUTE_ASCENT (`out/queue/l6_pj.sh`, running).

**PORTAL_JUMP live, isolated L6: on 3/3 (one distinct trajectory), off 1/3 (2026-10-11, `out/queue/l6_pj.sh`, portal-jump 072be6d; build = combined + COLLECT_WINDOW + ROUTE_ASCENT, PORTAL_JUMP 0/1).** Cleared / deaths / decisions / steps / trajectory hash:

| SEED | PORTAL_JUMP=0 | PORTAL_JUMP=1 |
| --- | --- | --- |
| 1 | no, 7, 364, 3000 | **cleared, 0, 33, 241**, a65322df |
| 2 | no, 7, 363, 3000 | **cleared, 0, 33, 241**, a65322df |
| 3 | cleared, 0, 41, 349, 5856ce7e | **cleared, 0, 33, 241**, a65322df |

Replicate caveat (method.md): the three gate-on clears are one trajectory, byte-identical: a first-life clear with 0 deaths is deterministic at temperature 0 and the seed only reshuffles the menu, so this is n=1 distinct, robust to menu order, not n=3. Against it, the gate-off first life at s1/s2 (the same opening: all three gems by mf ~211, then no portal) ends in 7 deaths at the step cap. L6 goes from "never clears in isolation" (MISS_BLAME A/B: s1/s2 0 clears in both arms) to a deterministic first-life clear. Next: the ladder with COLLECT_WINDOW + ROUTE_ASCENT + PORTAL_JUMP (SEED 9 then 6, running).

**cwrap_s9 ladder: L0-L10 CLEARED, stopped at L11 `death_cap` (COLLECT_WINDOW=1 + ROUTE_ASCENT=1 + PORTAL_JUMP=1 on the combined build, SEED=9, portal-jump 072be6d, 2026-10-11 09:46-10:36 UTC).** Command: `EXTRA='COLLECT_WINDOW=1 ROUTE_ASCENT=1 PORTAL_JUMP=1' TAG=cwrap WT=../ai-plays-cat-goric-portal SEEDS='9 6' out/queue/ladder.sh`. Deaths: L0 0, L1 0, L2 0, L3 1, L4 0, L5 7, **L6 23** (cleared; cwra_s9 without PORTAL_JUMP capped here), L7 0, L8 13, L9 1, **L10 0**, L11 30. 29,822 steps, 4,397 calls, 1,023 ms/decision. Ties the furthest ladder (cmbg_s6, sg_s9) and reaches L11 with fewer deaths on the way (L10 0 against 3 and 27).
- **L11, 30 lives:** COLLECT_WINDOW + ROUTE_ASCENT put the cat on the gem_a route in time in 4 lives (@114 at mf 146, inside the hop window) and 3 of them took gem_a + gem_b together at mf 189, the Darwin path. All 3 then lost gem_c (deadline 490, window 394): from floor x 181..233 at y 187 they went right to floor x 222..274 at y 228 and repeated `jump_left` toward gem_c (191,212), because the move prompt said **"A jump from this floor collects gem_c: jump and steer left from x 222..255. The cat is at x 250, inside that range."** That is false: `arc.simulate` from every x on that floor (step 3.5, mf 225), held jump_left lands on floor x 181..233 at y 187 first and never touches gem_c (the GEM_FACTS window comes from `landingsFrom`'s envelope, which does not stop an arc at the first platform it meets: the interception gap in dead-ends.md). gem_c is collected by walking on floor x 145..197 at y 231.

**GEMJUMP_VERIFY (gem jump windows checked against the held arc): built gated OFF (2026-10-11, branch gemjump-verify, stacked on reach-window).** With `GEMJUMP_VERIFY=1`, `gemJumpWindow` keeps only launch x (step 1.75) whose held `jump_<dir>` at the real clock touches the gem's box, and is silent when none does. At the L11 state above the false line disappears; true windows stay, slightly re-ranged: L11 gem_a from y 114 "x 118..139" (was 120..139), L10 gem_c from the tower "x 304..332" (was 304..330). Blast (`render_states.cjs`, 65,067 grounded states, reference = reach-window): gate off 0 diffs. A first version that also re-ranged true windows changed 5,469 move prompts and 6,862 objective calls (4,988 re-ranges on levels that already clear), so it was cut to removal only: the window is dropped when no launch works, and kept as before otherwise. Removal-only blast: 481 move prompts and 596 objective calls change, every one a removed jump line. `npm test`: Unexpected failures: 0 (`test_gemjump_verify.cjs`; audit site 18).

**full1_s9 ladder: L0-L11 CLEARED, the furthest ladder yet; stopped at L12 `death_cap_unwinnable` (COLLECT_WINDOW=1 + ROUTE_ASCENT=1 + PORTAL_JUMP=1 + GEMJUMP_VERIFY=1 + CORRIDOR_CLOCK=1 on the combined build, SEED=9, gemjump-verify 013f924, 2026-10-11 11:10-12:01 UTC).** Command: `EXTRA='COLLECT_WINDOW=1 ROUTE_ASCENT=1 PORTAL_JUMP=1 GEMJUMP_VERIFY=1 CORRIDOR_CLOCK=1' TAG=full1 WT=../ai-plays-cat-goric-gjv SEEDS='9 6' out/queue/ladder.sh`. Deaths: L0 0, L1 0, L2 0, L3 8, L4 5, L5 5, L6 4, L7 0, L8 23, L9 0, **L10 1, L11 1**, L12 30. 25,659 steps, 3,939 calls. First ladder past L11 (every earlier ladder stopped at L10 or L11). L12 lives spent most decisions on the top floors (y 87 / 108, objective gem_c, which COLLECT_WINDOW marks) and lost to the gem clock (gem_b, deadline 210, burned first in several lives). L12 analysis next, from this archive.

**L12 from full1_s9 (offline, 2026-10-11): gem_b first, then pacing on @125; the descent text there is false at the clock it matters.** Gems: gem_a (279,169) deadline 400, gem_b (43,129) deadline 210, gem_c (207,203) window 386 / deadline 535. Of 30 lives, 18 collected gem_b (mf 80-180) and none collected a second gem; 12 collected nothing. A typical life: gem_b at mf ~79, climb @165 -> @87 -> @108 -> floor x 247..299 at y 125 by mf ~208 with objective gem_a, then pacing x 260-295 above gem_a (the known @125 residency). At (281,125) mf 232 the move prompt says "Step off the LEFT end (x 247) and you steer to land on platform x 255..307 at y 209 ...": `arc.simulate` held left from 247.5 side-snaps UP onto floor x 193..245 at y 108 in 3 frames (2px gap, 17px higher), and held right from 299 dies in the right laser at (311,136) mf 239; so neither end is a working descent then. `route_clock.orderFeasibleN` with the start x snapped to its grid (a first call passed the raw x and wrongly read "all orders infeasible"; corrected here): from (113,165) mf 36 all six gem orders are feasible with wide margins, fastest b -> c -> a (gem_b mf 37, gem_c 65, gem_a 107, portal ~107; deadlines 210 / 386 / 400); from (165,87) mf 6 the fastest finish is a -> b -> c or b -> c -> a (portal ~138). L12 is winnable for a fast player; Flash's lives take gem_b and then climb away from gem_c (207,203, below-right) toward the top floors instead of taking it next. COLLECT_WINDOW's gem_c line (window 386) only starts at mf 186 (MAX_AHEAD 200), after that choice.

**full1_s6 ladder: stopped at L2 `death_cap` (30 deaths), the SEED-6 left-edge dither again** (same build and command as full1_s9 with SEED 6). Third SEED-6 ladder in a row lost on L2 (cwra_s6 30, cwrae_s6 stopped at 18, full1_s6 30); cmbg_s6 and cwrap_s6 passed it with 4.

**Edge-dither wording probe: no wording flips it (2026-10-11, `out/queue/probe_move.sh`, edge-text branch, 10 classify calls, endpoint systemone).** The probe reproduces the live distributions (L2 shipped right 0.717 vs 0.72 live). New gates on the edge-text branch: `FLOOR_FIX=1` (past every run's end, take the nearest run instead of `runs[0]`: at L8 (339.75,43.2) the shipped prompt described floor x 24..76 as "the floor you stand on" while the cat was by floor x 284..336, a second false-text bug) and `AIR_EDGE=2/3` (2 = corrected floor text only, 3 = "The cat has to fall below y N before steering <back>, or it lands back on the floor it just left", N = floor y + 9.6 + 18). P(move back onto the floor):

| Variant | L2 (71.5,64.4) mf 81, `right` | L8 (339.75,43.2) mf 78, `left` |
| --- | --- | --- |
| shipped | 0.717 | 0.891 |
| FLOOR_FIX | 0.717 | 0.869 |
| FLOOR_FIX + AIR_EDGE=1 | 0.829 | 0.959 |
| FLOOR_FIX + AIR_EDGE=2 | 0.772 | 0.960 |
| FLOOR_FIX + AIR_EDGE=3 | 0.622 | 0.918 |

The best wording only lowers L2's back-move to 0.62 and leaves L8's above 0.9: the dither is not a wording problem at the airborne state. Not run live. FLOOR_FIX stays available as a truth fix (not yet blasted).

**L12: a false "1px gap, only a jump can cross" sends the cat up instead of to the descent; GAP_WALK built (2026-10-11, edge-text branch).** With two gems left, full1_s9's L12 lives held gem_c (207,203) for 360 grounded decisions, mostly on the TOP floors (y 87 / 108). Its collector floors are below-right (x 173..225 at y 243, x 220..272 at y 231, x 255..307 at y 209), and the graph's route from floor x 58..215 at y 165 is one step: walk to x 215 and step off. But that floor is three platforms with 1px gaps (x 162 | 163), and the prompt's floor merge (`e.left <= run.right`, no tolerance) split it: at (148,165) mf 144 it said "The floor you stand on is continuous from x 58 to x 162 ... The gap to the RIGHT is 1px wide; walking cannot cross it, only a jump can.". False: the cat moves 1.75px per frame as a 1px column and walks across a 1px gap; `reachability.cjs` already merges with `+ 1`. A jump from there lands on the higher floors, which is where the lives went. `GAP_WALK=1` merges same-height platforms with the same 1px tolerance in the three places the prompt merges them (`platformMap`, `descentPoints`, `hop_points.floorRun`); the floor then reads x 58..215 with its right end (x 215) offering the landings on y 231 / y 243. `FLOOR_FIX=1` (same branch): past every run's end, the floor block takes the nearest run instead of `runs[0]` (the L8 far-floor bug above). Both gated OFF; `test_floor_text.cjs`; `npm test`: Unexpected failures: 0. Blast running.
- **Blast (edge-text, 69,931 grounded states, reference = gemjump-verify):** gate off 0 diffs; `GAP_WALK=1` changes L12 only: 585 move prompts and 585 objective calls; `FLOOR_FIX=1` changes 38 grounded move prompts (L1 9, L8 29), plus the airborne past-the-end states it targets.

**full1_s7 ladder (same full stack, SEED=7, driver's own playwright 1.64 with ffmpeg-1013): L0-L11 CLEARED, stopped by hand on L12 after 4 deaths.** 24,087 steps. Command: `EXTRA='COLLECT_WINDOW=1 ROUTE_ASCENT=1 PORTAL_JUMP=1 GEMJUMP_VERIFY=1 CORRIDOR_CLOCK=1' TAG=full1 WT=../ai-plays-cat-goric-gjv SEEDS='7 10' out/queue/ladder.sh`. Deaths (log): L0 0, L1 3, L2 19, L3 4, L4 0, L5 8, L6 8, L7 0, L8 5, L9 0, L10 12, L11 9. The second seed to reach L12 on this build (with full1_s9). Stopped so the GAP_WALK build could take L12 next (full1_s9 is the no-GAP_WALK L12 baseline: 30 deaths, no second gem in any life).

**full2_s9 ladder (full stack + GAP_WALK + FLOOR_FIX, SEED=9, edge-text 0336e39): L0-L10 cleared, stopped at L11 `death_cap_unwinnable`.** Deaths: L0 0, L1 0, L2 0, L3 8, L4 0, L5 3, L6 12, L7 0, L8 1, L9 0, L10 1, L11 30. 23,577 steps. L11 is still a coin at the ladder level (full1_s9 cleared it with 1 death on the same seed). Of its 30 lives, 3 reached @114 inside gem_a's window (mf 130 / 154 / 175); the mf-130 life took gem_a + gem_b at mf 191 and then looped from floor x 181..233 at y 187: `descent_right` -> floor y 228 -> `jump_left` back to y 187, never taking the left descent onto floor x 145..197 at y 231, the floor that collects gem_c (191,212) by walking.

**OVERSHOT flag is false for gems below the floor; OVERSHOT_FIX built (2026-10-11, branch levers-on-main 86213fd).** At (192,187) mf 191 with only gem_c left, the objective menu said "gem_c at (191,212): straight-line 25px (1px left, 25px down) ... **OVERSHOT: it is BEHIND you to the left on your platform**": the flag tests only the platform's x span, so a gem 25px UNDER the floor counts as "on your platform". `OVERSHOT_FIX=1` keeps the flag only for a gem at or above the cat's feet (`gy <= cat.y`). Blast (73,189 grounded states): gate off 0 diffs; the narrow fix changes 13,213 objective calls (L2 3,899, L8 2,939, L4 2,637, L11 1,634, L12 1,368, L6 652, L7 61, L13 23); the full height test (as the REACHABLE BY WALKING flag uses) would change 16,641 and is not used. Because the false flag sits in thousands of states on levels that clear (L2, L4, L8), it gets an isolated A/B before any ladder: `out/queue/os_queue.sh`, L11 (target) and L2, L4, L8 (regression), SEED 1-2, off/on, queued after full2 s7.
- **OVERSHOT_FIX A/B, L11 arms: uninformative, every run clears on the first life** (`out/queue/os_queue.sh`, levers-on-main 86213fd, full2 build): s1 off cleared 0 deaths / 33 decisions / 370 steps (2e2d0aa8), s1 on, s2 off and s2 on cleared 0 / 22 / 303, one trajectory (2de563be). On the full2 build isolated L11 clears on the first life; the ladder's L11 loses because of the first objective decision at the spawn (248,216) mf 0, a near-tie that menu order settles: gem_c 0.722 (s2) vs gem_a 0.582 (s1) in the isolated runs, gem_a in full2_s9. gem_c first takes gem_c by walking on floor y 231 on the way left and then a + b; gem_a first reaches a + b and then must come back down for gem_c from floor y 187, which is where the false OVERSHOT flag sat. So OVERSHOT_FIX targets the branch these seeds never enter; its L11 effect needs the ladder. The regression arms (L2, L4, L8) are running.
- **OVERSHOT_FIX regression arms: no regression.** L2: s1 off cleared 6 deaths / 336 decisions / 2,129 steps vs on cleared 5 / 266 / 1,664; s2 off cleared 5 / 219 / 1,384 vs on cleared 3 / 183 / 1,166. L4: all four cleared 0 / 28 / 270, one trajectory (0aae18d4). L8: s1 off cleared 15 / 328 / 2,258 vs on cleared 9 / 205 / 1,688; s2 off cleared 3 / 83 / 626 vs on cleared 7 / 142 / 1,073. 8/8 clears in both arms; fewer deaths in 3 of the 4 pairs that differ. Next: ladder full3 (full2 + OVERSHOT_FIX), SEED 9 and 10.

**L12: the y108 / y125 floors trap each other; DESC_UPSNAP built (2026-10-11, levers-on-main 624b4dc).** full3_s9 reached L12 (L9, L10, L11 cleared with 0 deaths each) and its L12 lives again spent most decisions on floor x 193..245 at y 108 and floor x 247..299 at y 125 with objective gem_c. Walking right off y108 drops 17px onto y125; stepping off y125's LEFT end (x 247) touches y108's side (2px gap) and is snapped UP onto it (`arc.simulate` held left from 247.5 at mf 232: landed (242.25,108) in 3 frames). Only y125's right end descends (until the right laser closes it near mf 230). Yet the floor text said "Step off the LEFT end (x 247) and you steer to land on platform x 255..307 at y 209; ... y 231; ... y 243", the descent summary said "The ONLY descents from this floor are at its ends: x 247 (left) and x 299 (right)", and the objective menu offered `descent_left` (its laser gate passes because a held step-off that snaps up counts as "landed"). With `DESC_UPSNAP=1`: an end whose held step-off (real clock) lands HIGHER than the floor leaves the descent menu; the floor text says "Step off the LEFT end (x 247) and you snap up onto platform x 193..245 at y 108: stepping off there touches that platform's side, so it is not a way down"; the summary names only the real end ("The ONLY descent from this floor is at its right end: x 299."). A first version that required every held step-off to land lower changed 30,280 objective calls (it also dropped descents that work by steering back under the floor, e.g. L2's left end) and was narrowed before any live use. Narrow blast (77,430 grounded states): gate off 0 diffs; on: 5,932 move prompts and 3,184 objective calls change, L12 3,132, L6 1,663, L8 1,105, L5 85, L7 72, L3 21, L1 7, L4 6. `test_desc_upsnap.cjs`; audit sites 19-20; `npm test`: Unexpected failures: 0. Isolated A/B queued: L12 (target), L6 and L8 (regression), SEED 1-2.

**full3_s9 ladder (full2 + OVERSHOT_FIX, SEED=9, levers-on-main 86213fd): L0-L11 CLEARED, stopped at L12 `death_cap_unwinnable`.** Command: `EXTRA='COLLECT_WINDOW=1 ROUTE_ASCENT=1 PORTAL_JUMP=1 GEMJUMP_VERIFY=1 CORRIDOR_CLOCK=1 GAP_WALK=1 FLOOR_FIX=1 OVERSHOT_FIX=1' TAG=full3 WT=../ai-plays-cat-goric-main SEEDS='9 10' out/queue/ladder.sh`. Deaths: L0 0, L1 0, L2 0, L3 2, L4 0, L5 6, L6 29 (cleared on its last allowed life), L7 2, L8 12, **L9 0, L10 0, L11 0**, L12 30. 29,866 steps. L12 lives by gems collected: 0 gems 10, 1 gem 19, **2 gems 1** (full1_s9: no life past 1). GAP_WALK was on; DESC_UPSNAP (the y108/y125 trap) was not yet built.

**full3_s10 ladder (same build, SEED=10): stopped at L8 `death_cap`.** Deaths: L0 0, L1 0, L2 2, L3 6, L4 0, L5 1, L6 6, L7 8, L8 30. L8 lost to the spawn-floor edge dither (step off the right end of floor x 284..336 at y 42, steer left back on, until the lasers close): the same failure as cwrap_s6's L8 and the SEED-6/7 L2 losses, which the wording probe showed no sentence fixes.

**COLLECT_WINDOW=2 regression pairs (isolated, full3 build minus COLLECT_WINDOW=1, `out/queue/cw2_queue.sh`): no regression.** L3: s1 =1 cleared 2 deaths / 31 decisions / 386 steps vs =2 cleared 2 / 34 / 393; s2 =1 cleared 6 / 168 / 1,602 vs =2 cleared 5 / 63 / 706. L4: all four cleared 0 / 28 / 270. Blast vs =1: 3,521 objective calls (L3 1,655, L6 1,417, L4 397, L13 29, L11 23). Its target (the L6 gem order in the ladder) needs a ladder to measure.

**L12 route-clock windows are too loose to state (2026-10-11, offline).** Latest start at which `route_clock.orderFeasibleN([gem])` still collects a single gem, per floor (binary search, slack 0, 205 ms for 15 queries): floor y87 gem_a 318 / gem_b 142 / gem_c 323; y108 376 / 105 / 429; y125 366 / 74 / 386; y165 307 / 174 / 388; y191 263 / 208 / 344 (deadlines 400 / 210 / 535). The optimistic model keeps gem_a collectable from y125 until mf 366, while Flash's lives pace there from mf ~200 without finding the route, so a window line computed this way would not separate them. L12's binding problem is route-finding through the y108 / y125 pair, not a clock the prompt omits. No L12 lever beyond GAP_WALK / DESC_UPSNAP is queued.

**DESC_UPSNAP live A/B (isolated, full3 build, `out/queue/du_queue.sh`, levers-on-main 624b4dc): no gain on L12, no regression.** L12: s1 off no, 8 deaths, peak 2 gems vs on no, 7, peak 1; s2 off no, 8, peak 1 vs on no, 8, peak 1. With the left descent of y125 removed, s1's lives spent MORE grounded decisions on y125 (168 vs 94): the pacing above gem_a stays, and the one real descent (the right end) is already closed by the right laser when they arrive. L6: all four cleared 0 deaths / 33 / 241, one trajectory. L8: s1 off cleared 11 / 222 / 1,386 vs on cleared 8 / 163 / 1,126; s2 off cleared 3 / 83 / 630 vs on cleared 7 / 142 / 1,074. Kept as a truth fix (gated), not a lever: it makes the L12 prompt true without changing the outcome.

**L13 on the full3 build, isolated SEED 1-3: 0/3** (`out/queue/l13_queue.sh`, levers-on-main 624b4dc; full3 flags). s1 11 deaths / 354 decisions / 3000 steps, peak 3 gems; s2 11 / 406, peak 2; s3 11 / 360, peak 2. Same as the pre-PORTAL_DESC baseline at these seeds (0/4 at s1-s4); the PORTAL_DESC clears were at s5 and s9, so those seeds run next. s1's lives take gem_b (72,152) at mf ~47 and gem_a (129,200) at mf ~108, then climb ~100 frames to gem_c (180,51); the one life with all three at mf 209 died at mf 215 at (171.5,63), where the top laser reaches head height. The objective choice after gem_b (gem_a 0.82) is the faster order by `route_clock.orderFeasibleN` from (59.5,249) mf 50 (a then c: portal ~161; c then a: ~207): L13 is lost on execution speed, not on the order.
- **L13 s5 regresses on the full3 build; the divergence is a ROUTE_ASCENT / CORRIDOR_CLOCK state.** (L13's clear is `won`/`reachedWin`, not `sawAdvance`: the last level shows the win screen, it does not advance; the full3 runs above are `won: false` at the 3000-step cap.) Full3 s5: not won, 11 deaths, peak 3. The PORTAL_DESC build at s5 won with 2 deaths in 777 steps. Both runs are identical for 18 decisions; at decision 19, (199.5,252) mf 141, objective gem_c, the old build answered `left` (0.639) and full3 `jump_right`. Rendering that state with each gate on alone, only two change the move prompt: ROUTE_ASCENT ("The shortest route to gem_c leaves this floor by jumping RIGHT (to x 223..275 at y 197) ...", where the winning life went left) and CORRIDOR_CLOCK ("The route to gem_c closes in about 55 frames ..."). ROUTE_ASCENT is part of the only L11 clear, and a level list is not allowed, so the next runs isolate which one costs L13: full3 minus ROUTE_ASCENT and full3 minus CORRIDOR_CLOCK at s5 and s9 (`out/queue/l13c_queue.sh`).
- **L13 ablation (full3 minus one gate, isolated):** minus ROUTE_ASCENT: s5 not won (11 deaths), **s9 WON (5 deaths)**; minus CORRIDOR_CLOCK: s5 not won (11). The minus-ROUTE_ASCENT s5 run follows the old s5 winner for 20 decisions and then flips a near-tie at (171.5,252) mf 160 (old jump_left 0.364 vs left 0.345; new left 0.399 vs jump_left 0.331). L13 outcomes hinge on near-tie move decisions, so single seeds cannot attribute the full3 L13 0/6 to one gate; the s9 win without ROUTE_ASCENT is the one clean signal so far (full3 with it: s9 not won).
- **full3 minus ROUTE_ASCENT (`out/queue/nora_queue.sh`, isolated):** L11 s1/s2/s3: 0/3, each 7 deaths at the 3000-step cap, peak 2 (with ROUTE_ASCENT the same build clears isolated L11 on the first life). L13 s1/s2/s3/s10: 0/4, each 11 deaths, peak 2. With the s5 (lost) and s9 (won) ablation runs, L13 without ROUTE_ASCENT is 1/6 against 0/6 with it: not a measured difference. ROUTE_ASCENT stays in the stack. L13 isolated at ~0-1 of 6 is limited by the 3000-step cap (about 11 lives); a ladder allows 30 lives per level, and the old winners needed 2 and 7 deaths.

**L12 y108: no plain descent exists; the only way down to gem_c is a fall-then-steer maneuver (2026-10-11, offline, full4 flags).** On floor x 193..245 at y 108 (mf 203, objective gem_c) the left end also snaps the cat UP (held left from 193.5 lands on floor x 148..200 at y 87 in 2 frames; DESC_UPSNAP now says so), and a held right off the right end lands on floor y125 (259,125), the pacing floor. Reaching gem_c's collector floors (y 231 / y 243) from y108 needs stepping off the right end and then steering LEFT at once, to fall past y125's left edge (x 247). That is the same "fall, then steer back under the floor" maneuver as the L2 and L8 edge dithers, which the wording probe showed no sentence produces. With L2/L8's dithers, L12 points at one limit: Flash, deciding every 3 airborne frames, does not execute multi-step airborne maneuvers that start by steering away from where it wants to land.

**full4_s11 ladder: L0-L11 CLEARED, stopped at L12 `death_cap` (full3 with COLLECT_WINDOW=2 in place of =1, plus DESC_UPSNAP; SEED=11, levers-on-main 624b4dc).** Command: `EXTRA='COLLECT_WINDOW=2 ROUTE_ASCENT=1 PORTAL_JUMP=1 GEMJUMP_VERIFY=1 CORRIDOR_CLOCK=1 GAP_WALK=1 FLOOR_FIX=1 OVERSHOT_FIX=1 DESC_UPSNAP=1' TAG=full4 WT=../ai-plays-cat-goric-main SEEDS='11 12 13' out/queue/ladder.sh`. Deaths: L0 0, L1 0, L2 0, L3 8, L4 0, L5 0, L6 9, L7 0, L8 2, L9 3, L10 1, L11 5, L12 30. 22,444 steps. The third seed to clear L0-L11 (with 7 and 9). L12 lives: 0 gems 9, 1 gem 21.

**full4_s12 ladder: L0-L11 CLEARED, stopped at L12 `death_cap_unwinnable`** (same build and command, SEED=12). Deaths (log): L3 5, L6 11, L8 15, L10 1, L11 0, L12 30; the fourth seed to clear L0-L11 (7, 9, 11, 12; SEED 10 stopped on L8, SEEDs 6 and 7 can lose L2 to the edge dither).

**full4_s13 ladder: L0-L11 CLEARED, stopped at L12 `death_cap`** (same build and command, SEED=13). Deaths: L0 0, L1 2, L2 0, L3 6, L4 0, L5 0, L6 1, L7 0, L8 8, L9 0, L10 1, L11 17, L12 30. 22,861 steps. Five seeds now clear L0-L11 on this stack (7, 9, 11, 12, 13); every one stops at L12.

**GEM_FROM on isolated L12: no effect (0/6 cleared, both arms).** Command: `out/queue/gf_queue.sh` (full4 build: the full4 ladder flags plus `GEM_FROM=0|1`, `SEED=1..3 node run_level.cjs systemone 12`, levers-on-main ff52c84). Off: deaths 7/8/8, peak 1 gem each. On: deaths 8/8/8, peak 1 gem each. Every run hit the 3,000-step cap. Saying which floors collect gem_a does not get the lives off y108/y125; the blocker stays the descent.

**L12 fork found; COLLECT_LAND built gated OFF and blasted (2026-10-11, branch collect-land 019439c, stacked on walkoff-clear).** In all 9 isolated L12 runs (GEM_FROM A/B and WALKOFF_CLEAR s1-2), every life walking right along x 58..215 at y 165 toward gem_a flips to `jump_right` at x 170-190 (p 0.46-0.50 against `right` 0.40-0.56) and lands in the y108/y125 pocket; stepping off the right end (x 215) lands on x 220..272 at y 231, a floor gem_a can be collected from, and the prompt already says where that step-off lands. With `COLLECT_LAND=1` the landing list adds "(gem_a can be collected from there)", only when the cat's floor cannot collect the objective and only when one end leads to a collector. Blast (`experiments/render_states.cjs` over the FULL ladder archives, 39,640 grounded states, ref = walkoff-clear): gate off 0 diffs; gate on 6,227 move prompts (L1 129, L2 1,883, L4 262, L6 18, L7 10, L8 773, L9 189, L11 4, L12 2,959). The first version marked both ends too and changed 16,009 (L2 6,696, 4,813 of them two-sided). Census of the gate-on firings against the archived move (walk toward the marked end / any other horizontal move): L2 1,262 / 621, L8 540 / 91 (plus 111 jumps toward it), L12 1,629 / 1,060 (plus 234 jumps toward it), L4 226 / 24, L9 105 / 21; the model already goes to the marked end in most of them. Live: `out/queue/cl_queue.sh` (probe at the fork, isolated L12 s1-3) and `cl2_queue.sh` (L2, L8 s1-3 regression), queued behind the WALKOFF ladder.
