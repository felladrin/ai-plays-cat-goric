# Project documentation

A classifier LLM plays [Cat Goric: Escape from the Warp Chamber](https://js13kgames.com/entries/cat-goric-escape-from-the-warp-chamber). The model never writes code and never emits a plan. Every frame-group it gets a text description of the game state and answers two multiple-choice questions, and the driver reads the probability distribution over the permitted answers and presses a key.

## Where it stands

**Current best, on `clef`** (the hosted Decisions model), build `PRUNE_FATAL=1 MOVE_INSTR=2 JUMP_FACTS=1 HOLD_FIX=1 COL_FACTS=1 GEM_FACTS=1 STICKY_OBJECTIVE=1` with `ATTRIB` on: **8 of the 14 playable levels clear at two seeds each** — 0, 1, 2, 5, 7, 8, 9 and 10. Level 4 clears at one seed of two. Levels 3, 6, 11, 12 and 13 fail. Per-level counts, per-seed, and what each of the three recent level changes needed are in the Clef section of [results.md](results.md).

Across every endpoint ever measured, 12 of the 14 have cleared at least once (0 to 11). Two have never cleared on any build: **12 and 13**. Level 11 cleared once, at one seed of two, on Darwin-27B-ZTC (2026-10-10). Levels 3 and 6, which Clef fails on the current build, clear at both seeds on the current build with PurpleMIST-Flash-1.0 (2026-10-09; level 6 for the first time on any build). That model clears 7 of 14 at both seeds, a different set from Clef's 8; see the decision-models section of [results.md](results.md#decision-models-tried-typed-decisions-leaderboard-2026-10-09). The level-14 victory screen has been reached, but only in a demo run that skips the levels outside the solid set of its time (see [the demo mode in driver/README.md](../driver/README.md)). No full ladder run has been won. A continuous demo-mode recording of the eight clearing levels, and a 2:33 time-warped cut of the same take, exist under `out/exp_record` on the machine where they were run; `out/` is gitignored. The take is documented in [results.md](results.md).

**What is worth building on.** The objective layer commits to a gem on geometric proximity, and the world has a clock — but the shape of that diagnosis has been narrowed by measurement, and the obvious versions of it are dead:

- The route clock's binary DEAD/ALIVE verdicts **never fire**: 0 mixed states and 0 all-dead states over 114 and 156 grounded decisions on the failing levels. Wiring that verdict into the prompt buys a clause that never prints. See [dead-ends.md](dead-ends.md).
- Level 11 is where the clock does bite, and the binding limit is not the one modelled: every gem order is feasible from the spawn, but the run reaches two gems at frame 93 against a fastest route of about 45, and from there gem_a is infeasible although its laser deadline is 375. The ceiling closes the one collecting jump at about frame 178, which `gemDeadline` does not model.
- Level 13 failed on **unwinnable resets that recorded no death**, making its 11 burned lives invisible to every death-based mechanism. That bookkeeping is fixed (2026-10-08): both runners now record the reset through one shared blame rule. Level 13 still fails at 11 deaths / 1 gem — the lives are no longer identical, but its real blocker is the clock: gem_c burns at frame 250 and the cat collects gem_a (deadline 550) first every life.
- Levels 3, 6 and 12 were diagnosed from the archives on 2026-10-08, and the diagnoses were refined twice by further measurement: level 6 is a greedy-objective ping-pong where the productive chain hop is offered and refused; level 12 is **not** a lost race (the fastest route has 185 frames of margin) but an edge oscillation 44px above the gem; level 3 dies to the top laser while oscillating on a high floor with the objective pinned by sticky. All three, plus the fixes and verification runs, are in [open-problems.md](open-problems.md) §2b and the 2026-10-08 sections of [results.md](results.md).
- **The elicitation layer is exhausted on this model.** Six lever families have each fired correctly on the failing levels and changed nothing: option-consequence annotations, DEAD/ALIVE verdicts, the strict-system prompt (`JEV_STRICT`), the gem-burn countdown (`BURN_FACTS`, fires on 111/292 L12 decisions), and objective-call escalation sampling (`OBJ_SAMPLE` + `WPT_ARGMAX`, which draws the productive waypoint 17 times where argmax refused it every time — and still clears nothing, while breaking level 4's sticky-dependent clear if the waypoint-execution guard is off). The wall is the classifier's greedy proximity policy at the states that matter. See the 2026-10-08 sections of [results.md](results.md) before proposing a seventh.

A guide for continuing the project with a coding agent is in [agent-guide.md](agent-guide.md).

## Read order

| Document | What it holds |
| --- | --- |
| [rules.md](rules.md) | The constraints the project is judged by. Read before changing the policy. |
| [architecture.md](architecture.md) | How a decision is built, asked, and applied. |
| [game-facts.md](game-facts.md) | Verified constants and geometry, read from the game source. |
| [results.md](results.md) | Per-level outcomes, recomputed from the run archive, and which baselines bear weight. |
| [dead-ends.md](dead-ends.md) | Ideas measured and rejected. Do not re-run these. |
| [open-problems.md](open-problems.md) | The live blocker, plus defects found and left in place. |
| [method.md](method.md) | How to measure here without wasting a night, and the environment traps. |
| [bring-your-own-model.md](bring-your-own-model.md) | How to run the game against your own decision model: the request shape, the sweep script, the adapter, and a sandbox recipe. |
| [agent-guide.md](agent-guide.md) | Contract and reading order for a fresh agent session: the task, the measurement rules, what is measured dead, and a paste-ready prompt. |

Operating instructions (setup, commands, configuration, endpoints) stay in [`../driver/README.md`](../driver/README.md).

## Where this came from

These seven documents condense about 21,800 lines of session logs, handovers, specs, predictions, audits and probe results, written between 2026-09-23 and 2026-09-28.

The originals are **not in the working tree**. They were committed to `docs/archive/` in `abc6174` and removed in the commit after it, so they live in git history and nowhere else. To read one:

```sh
git show abc6174:docs/archive/README.md                 # the index, start here
git show abc6174:docs/archive/team/ARMD_NEGATIVE.md     # any file it lists
git show abc6174 --stat -- docs/archive                 # everything that was there
```

If that hash ever stops resolving, find the removal commit with `git log --diff-filter=D --name-only -- 'docs/archive/*'` and read from its parent.

Two warnings that apply to every line of that archive, and to some lines here:

- **The commit SHAs it cites do not resolve.** The work was lifted out of `felladrin/js13k-2021` into this repository and squashed, so `4807764`, `ec957bb`, `3590948`, `613d06e`, `53e0a9e` and `f5709e7` are not objects in this repo. Attribution by SHA is unrecoverable. What matters is what `decision.cjs` renders at HEAD.
- **Most of its single-run comparisons are void.** The harness is not deterministic where the route passes near a laser. See [method.md](method.md).
