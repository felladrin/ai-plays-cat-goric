> # ⚠ SUPERSEDED IN PART — read this first, 2026-09-27
>
> This document was written 2026-09-26 at 16:56. A long session since then has
> **contradicted several of its central claims with measurements**. It remains
> the best description of the project's *shape*; its *numbers and verdicts* are
> stale. The current record is `driver/AWAY_DECISIONS.md`, and the specs,
> inventories and audits are in `driver/team/`.
>
> **What this document gets wrong:**
>
> | Claim here | Now measured |
> |---|---|
> | Seven levels pass | **Eight.** L7 clears: 0 deaths, 33 decisions, 3 gems, five byte-identical runs |
> | L7 fails, stacked-platform wall | L7 clears. It was never an apex-snap problem |
> | jumpApex fix is UNMEASURED | Measured. It moved **one** level out of six. Its whole effect on L7 was one prompt literal, 61.2px → 54.4px |
> | True jump rise 54.4px, clearance 57.6px | Rise is right. Clearance is **59.3px** — the closing gap peaks at frame 17, not 16, and the laser sprite is half a thickness inside the drone |
> | §9: teach `reachability` the apex snap | The envelope both **over**-reports (341 edges) and **under**-reports (213). Neither model matches the driver. See `SPEC_reachability_held_action.md`, Addenda 2 and 3 |
> | §6 baselines as a comparison table | Every one is a **single sample**. Four levels are now confirmed reproducible; comparing across builds without checking that is how this session lost two hours |
>
> **Three things this document does not know:**
>
> 1. **Runs are not reproducible where the route passes near a laser.** Laser
>    thickness is unseeded `Math.random()`, redrawn every frame, and the game
>    collides against the *sprite*. Classify a level by running it twice.
> 2. **`arc.simulate` models one held action to termination.** The driver
>    re-decides every 3 airborne frames. Any "every action from here dies"
>    claim is unsafe — it invalidated three of four probe targets.
> 3. **A decision can now be replayed offline.** `driver/experiments/probe_move.cjs`
>    reproduces 244 of 250 attempted decisions exactly, so a prompt wording
>    change is testable in seconds rather than by a 45-minute run. It needed
>    five logging fields that did not exist, because the log recorded what a
>    human would skim, not what a decision needs to be rebuilt.


# Handover — Cat Goric classifier driver

**For the team taking this over.** This document replaces the append-only log that
was here before. It is self-contained: you should not need to read the older
`HANDOVER.md` / `HANDOVER_SESSION.md` to start, though they remain as archives.

Last updated: 2026-09-26. All runs stopped. No background loops active.

---

## 1. The goal

Get the classifier LLM to clear **all playable levels 0–13** of Cat Goric and
reach the **level-14 victory screen** ("CATEGORIC ESCAPE! / PLAY AGAIN?").
Index 14 is the terminal win state, not a 15th clearable level. The config has
15 entries because index 14 carries the win-screen layout.

Not most levels. All of them.

---

## 2. Current state, in one paragraph

Seven levels pass (0,1,2,3,5,8,9). Seven fail (4,6,7,10,11,12,13). L4 is the
deep one and has been the focus of ~8 review rounds. The most recent change —
**a correctness fix to `jumpApex`** (the jump-rise was over-reported by one
gravity step) — is implemented and all guards pass, but **its effect on L4 was
never measured**: the run was stopped mid-flight on Victor's order. That fix is
the single most important thing to measure next, because it un-prunes jumps in
exactly the clearance band where L4's B→D route was being removed from the menu.

`driver/` is **entirely untracked in git**. Every file is uncommitted work with
no revert path. Commit it before you start changing things (see §11).

---

## 3. Endpoint policy — READ THIS FIRST

**Use Halogen Qwen Flash Next (`halogen`) only. Never run the 27B model
(`qwen_local`) concurrently with flash through llama-swap.**

Both models are served by the same llama-swap instance. Running one request to
each forces the GPU to swap models in and out on every call, which wastes a very
large amount of time. Same-model concurrency is fine (no reload); cross-model
concurrency is not. This overrides the older handover's "27B is the answer
endpoint" for all work going forward.

The 27B numbers in the history tables below were taken before this policy and are
kept only because some rounds were measured on 27B; do not mix endpoints within a
comparison.

---

## 4. How to run

```sh
export PLAYWRIGHT_MODULE=/Users/victor/Repositories/MiniSearch/node_modules/playwright
export CHROME="$(cat /tmp/chrome_path.txt)"
export LLAMA_BASE_URL=http://127.0.0.1:1235     # SSH tunnel to gpu-server -> llama-swap
cd driver
node run_level.cjs halogen <level>              # one level, flash
```

- `LLAMA_BASE_URL` has **no** `/v1`; the client appends it.
- The tunnel: `ssh -N -L 1235:127.0.0.1:1234 gpu-server` → llama-swap.
- The model server allows **4 concurrent sessions**. More just queues.
- `driver/experiments/lvl.sh <L>` runs one flash level and prints a one-line
  summary to `/tmp/par_L<L>_flash.log`.
- `VIDEO=1` records a `.webm` to `out/`. **Record passing levels as they pass.**
  A previous session left only day-old recordings as its sole artifact.
- `run_full.cjs` runs the whole ladder.

### Env flags (all default off unless noted)
`GOALS_ONLY`, `ROUTE_FIRST` (default **on**), `STICKY_OBJECTIVE`,
`LANDDESC_HELD` (opts into held-arc descent labels — see §8), `SHOT_PRE`
(one screenshot per decision, expensive), `VIDEO`, `DIAG_NAV` (navigation
logging only), `SEED`, `COUNTDOWN`, `JEV_VERBOSE`.

---

## 5. Current build composition

`decision.cjs` currently contains, layered:

| layer | what | origin |
|---|---|---|
| descent gate | "ONLY descents at the ends" line gated on a survivable end existing | round 1 |
| escape clause (D) | when both ends dead + must-descend, name the held-arc jump escape | round 2 |
| S1 route-gate | `mustDescend`/`showDrop` suppressed when the descent isn't on the objective's route | round 3 |
| R4 held-arc laser note | `jumpLandingNote` empty-branch simulates the held arc | round 4 |
| E1 walk-then-jump tail | "you are at x N, outside the launch window; walk to x M, then jump DIR there" — computed from state; **no ±2 tolerance**, direction from held-arc-verified `namedX` | round 6 gate fix |
| landDesc | **default = steer-envelope** (round-6 behavior). `LANDDESC_HELD=1` opts into held-arc landing text (the round-7 experiment, reverted) | round 7 |
| **jumpApex fix** | jump rise corrected to the game's integration order: **54.4px / 16 frames** (was 61.2 / 17) | **round 8 — UNMEASURED** |

Guard tests on this build:

```
test_descent_gate.cjs       PASS
test_sticky_objective.cjs   PASS
test_death_history.cjs      PASS
test_objective_lock.cjs     FAIL  (pre-existing red — see §10)
```

---

## 6. Measured results

### 6.1 The seven passing levels (flash, round-6 build — last full sweep)

```
L0  PASS  0 deaths    5 decisions  3 gems    78 steps
L1  PASS  0 deaths   32 decisions  3 gems   382 steps
L2  PASS  3 deaths  152 decisions  3 gems  1094 steps
L3  PASS  5 deaths  154 decisions  3 gems  1133 steps
L5  PASS  1 death    73 decisions  3 gems   685 steps
L8  PASS  1 death    45 decisions  3 gems   643 steps
L9  PASS  1 death    66 decisions  3 gems   874 steps
```

The round-8 (jumpApex) sweep re-confirmed **L0, L1, L2, L3 pass** (no
regression on those four) but was stopped before L5/L8/L9 completed. **Re-run
the full 7-level sweep on the jumpApex build before trusting it.**

### 6.2 L4 by round and endpoint

| round | change | endpoint | result | dominant death class |
|---|---|---|---|---|
| r4+e1 | R4 note + E1 tail | 27B | FAIL 31d/1gem | A→B lateral-hop fatal launches |
| r4+e1 | " | flash | FAIL 25d/1gem | " |
| r5 | gapMsg qualify + E1 de-gate + namedX | 27B | FAIL 16d/1gem | B↔C cycle + x=286 overshoot |
| r6 | windowTail gate (no ±2) | 27B | **FAIL 13d/1gem** (best) | cycle falls: 8×(247,239) + 4×(146,279) |
| r7 | landDesc held-arc | 27B | FAIL 21d/1gem (worse) | 16× held-left overshoot off A to (76,115) |
| r8 | **jumpApex fix** | flash | **UNMEASURED** (killed step 1006, 1 stranded) | — |

L4 has never cleared. gem_a is collected reliably since r5; the cat never chains
gem_a → gem_c → gem_b → portal.

### 6.3 The other failing levels (last measured, older builds — re-measure)

```
L6   FAIL  ~37d/1gem   stacked-platform wall (apex-snap not modeled)
L7   FAIL  ~10d/2gem   stacked-platform wall
L10  FAIL  40d/0gem    death cap; stacked wall
L11  FAIL   7d/1gem
L12  FAIL  14d/0gem
L13  FAIL  21d/1gem
```

These have NOT been re-measured on the jumpApex build. The jumpApex fix touches
every level's jump-ceiling logic, so all of them must be re-run.

---

## 7. The key correctness finding this session — `jumpApex` integration order

**This is the main deliverable and it is unmeasured.**

`jumpApex` (decision.cjs) computed the jump rise as **61.2px over 17 frames** by
counting the full `-catJumpSpeed` (-6.8) as the first frame's displacement.

The real game integrates gravity **before** the position update. Confirmed
against source:
- `node_modules/kontra/kontra.js` `advance()` = `velocity += acceleration;
  position += velocity`.
- `src/scripts/functions/commands/updateCatSprite.ts` sets `dy = -catJumpSpeed`
  then `ddy = catFallingAcceleration`, so the first frame's displacement is
  `-(6.8 - 0.4) = -6.4`, not -6.8.

True rise = **54.4px / 16 frames**. Ceiling-needed = rise + droneSpeed·frames =
**57.6px**, not 64.6px.

**Consequence:** `jumpHitsCeiling` used the inflated 64.6px and pruned jumps
from the action menu in a **6.8px clearance band where the game still permits
them**. On L4's y=93 floors, head clearance closes at 0.2·mf, so jumps were
pruned from **mf > 47** while physics allows until **mf > 81**. Since **B→D is
jump-only**, the cat lost its only route to D in that window — making the B↔C
cycle the *true action set*, not a scoring artifact. `arc.simulate` already used
the game's order; `jumpApex` was the odd one out.

**Fix applied:** `jumpApex` rewritten to the game's integration order; the
hardcoded `61.2px` prompt strings now derived from it; `test_death_history`'s
assertion (which itself encoded the buggy 61.2) updated to 54.4.

**What to do:** run L4 on flash with this fix. If the B↔C cycle breaks or
deaths drop sharply vs the r6 13d baseline, this was the structural lever. If
not, the cycle has a second cause and §8's airborne-landing work is next.

---

## 8. L4 deep-dive — the B↔C cycle and what's been tried

L4 geometry (verified):
```
A  95..147 @ y=93     (spawn)
B  199..251 @ y=93
C  263..315 @ y=171   gem_a at (289,156)
D  156..208 @ y=241   gem_c at (182,226)
E   79..131 @ y=180   gem_b at (105,164)
Portal (180,150)
```

Key verified arcs (cat height 18, grounded launch):
- **B→D**: `jump_left` lands on D **only from x 241..251** (B's right end).
  From 199 lands on A; from 210/225 → laser.
- **C→B**: `jump_left` from window 263..284 lands on B. From 285/286 overshoots
  B by 1–2px → laser.
- **A→E**: a **released** fall off A's left end (95) lands on E. A **held-left**
  fall drifts to ~76, misses E's left edge (79) by 3px → laser.
- **B→C**: walk off B's right end (251) **held-right** drifts +34px, lands on C
  (~287,171). A released fall at 251 misses C → laser.

**The cycle:** on B with obj=gem_c, the objective picker chooses `descent_right`
(~85% pre-jumpApex). The cat walks off B's right end, lands on C, jumps back to
B. Every transition is individually route-valid; the loop is the bug. The
sticky-objective lock can't break it because each descent waypoint *completes*
(floor change releases the lock by design).

**The released-vs-held trap:** the same "walk off an end" action has opposite
correct execution per floor (B→C needs hold, A→E needs release). The driver does
not decide hold-vs-release — the model decides it every ~3 frames in the air,
and the **airborne prompt contains no landing information**. `walkOffFatalNote`
and `jumpLandingNote` are both behind `if (snap.onPlatform)`. The one function
that knows the answer (`arc.heldActionIsSafe`) is called only to decide whether
to re-ask, and its verdict is discarded before the prompt is built.

**Claude round 7's recommended next change (NOT yet implemented):** an
**airborne landing line** in the airborne branch of `buildMoveCall`
(~decision.cjs:845-853) — simulate the three legal airborne actions and render
where each lands, in the stated-fact register:

> Holding left from here lands nowhere: the cat passes x 79..131 at y 180 on its
> left and falls to the laser. Releasing lands on x 79..131 at y 180. Holding
> right lands on x 79..131 at y 180.

Also fix `sideSnapNote` to measure the lateral gap at the **projected** x, not
the current x (it currently gives a false green light during a drifting fall).
This is annotation-only; all three options stay on the menu.

**Sequencing note from Claude r7:** do the jumpApex fix FIRST and measure it
alone (§7), because it's a correctness question that affects all 14 levels; then
add the airborne landing line. Don't fold them together.

---

## 9. The route graph is known-wrong on stacked platforms

`reachability.cjs` models landings with an **air-control envelope**
(`landingsFrom`): it assumes the cat can steer anywhere within
`±catWalkSpeed·(f-1)` mid-air and **does not stop at the first landing**. The
driver commits ONE held direction per arc. So the graph advertises edges the held
action cannot produce.

Verified false edges on L4: `A→E`, `B→E`, `C→D` (the held-arc scan finds **no**
held action from any x on C that lands on D). The graph also cannot see the
**apex snap**: a cat whose 1px-wide collision box grazes a platform's side or
underside at the top of its arc is teleported onto it (`updateCatSprite.ts:32`,
`isMovingDown = dy >= 0`, and `dy` is exactly 0 at apex).

This makes every route, ONE-WAY warning, and stranding check on a
stacked-platform level rest on a model known to be wrong in both directions.
L6/L7/L10 are the stacked-wall levels. **Teaching `reachability` the apex snap
and held-action control is the highest-value remaining structural work**, but it
has graph-wide blast radius — do it on its own round with a full sweep.

---

## 10. Known red test

`test_objective_lock.cjs` exits 1 (pre-existing). Its premise was overturned by
later measurement (it guards against a note firing on levels that were later
measured clean). **Do not relax it to green without re-measuring L0/L1/L3 and
re-scoping its assertion to positions the cat actually visits.** New checks go
in their own file — appending to `test_objective_lock.cjs` makes the addition
dead code because an earlier assert throws and kills the process.

---

## 11. Git / safety

- `driver/` is **untracked**. There is no revert path. Before your first change,
  create a branch and commit the current state (show Victor the diff first; he
  decides).
- The parked round-1 experiment lives in `driver/experiments/`
  (`decision.descent-experiment.cjs` + its test) — kept, not deleted.
- Never kill a process you did not start. If a port is busy, pick another.
- `MAX_STEPS = 3000`, `MAX_DEATHS = 40` in `run_level.cjs`. A run reporting 40
  deaths hit the cap; it did not finish.

---

## 12. Do not repeat these (hard-won)

- **One change between measurements.** Every regression in this project's
  history came from making several changes and measuring once.
- **Never read a trend off a partial run.** Done repeatedly, always wrongly.
- **A rejection measured on an older build is not evidence about the current
  one.** Re-test before trusting any prior "we tried X and it failed."
- **`echo "exit=$?"` after a pipe reports the last stage, not `node`.** Two
  false "tests pass" readings came from this.
- **Physics live in `driver/physics.cjs`, not `config.cjs`.** Reading them from
  `config.cjs` yields `undefined`, every comparison silently fails, and the
  resulting table looks plausible.
- **`landingsFrom` is an optimistic envelope, not a trajectory.** See §9.
- **Don't mix endpoints in a comparison** (27B vs flash). See §3.

---

## 13. Facts worth not re-deriving

- `catWalkSpeed 1.75`, `catJumpSpeed 6.8`, `catFallingAcceleration 0.4`,
  `droneSpeed 0.2`, `maximumLaserY 310`.
- **True jump rise 54.4px / 16 frames** (game integration order; see §7). The
  old 61.2px was wrong.
- Platform sprites 52×16, anchor y 0.4: a platform at `(x,y)` spans
  `x-26..x+26`, top surface at `y-6.4`.
- A grounded cat's anchor y **equals** the platform's y. The `y-12` offset in
  `resetCat` is spawn-frame only.
- Cat spawn is always `platformsPositionsPerLevel[level][0]`.
- `levelGems` is `[[x,y],...]`; `snap.gemPositions` is `[{x,y},...]`. Swapping
  them silently produces `NaN` in the prompt.
- `runs` entries are objects `{y, left, right}` — `run[0]` is **undefined**, not
  an x. Use `.left`/`.right`. (This caused a direction bug.)
- Gem names are assigned by **spawn index** (`gem_a` = first spawn). To probe a
  single objective, pass a one-element `levelGems` and target `gem_a`.
- The HUD quadrant letter is the level index (A=0 … F=5).

---

## 14. Suggested order of work

1. **Measure the jumpApex fix on L4 (flash).** This is the unmeasured structural
   candidate. Full 7-level regression sweep too — the fix touches every level.
2. **If L4 still cycles:** implement the airborne landing line + `sideSnapNote`
   projected-x fix (§8 end), one change, guards, re-measure.
3. **Re-measure L6, L7, L10–L13 on the jumpApex build** — they've never seen it.
4. **Teach `reachability` the apex snap / held-action control** (§9) — the big
   structural fix for the stacked-wall levels.
5. **Record every passing level with `VIDEO=1` as it passes.** Final artifact:
   the full ladder with `VIDEO=1`.

---

## 15. Artifacts index

- **Claude review rounds** (questions `/tmp/cgoric_rN.txt`, answers
  `/tmp/cgoric_claude_rN.md`), N=1..7. Round 7 is the jumpApex/airborne-landing
  analysis. These are in `/tmp` and will not survive a reboot — copy them into
  the repo if you want them durable.
- **Decision log:** `driver/AWAY_DECISIONS.md` (this session's autonomous
  decisions, including the endpoint-policy change).
- **Run logs:** `/tmp/par_L<L>_flash.log`, `/tmp/par_L<L>_qwen.log`,
  `/tmp/sweep_r8.log`.
- **Per-run decision JSON:** `out/run_level_<L>_<endpoint>.json` (keys:
  `won`, `sawAdvance`, `reachedWin`, `peakGemsCollected`, `steps`, `deaths`,
  `decisions`, `log[]`).
- **Older handovers (archives):** `HANDOVER.md`, `HANDOVER_SESSION.md`.
