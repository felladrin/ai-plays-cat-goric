# Handoff: the empty objective menu (L6, Darwin-27B-ZTC), fixed 2026-10-10

The prior session recorded Darwin-27B-ZTC level 6 as `invalid: stopped at step 274
on an empty objective menu` at both seeds. This file is the full account of the
diagnosis and the fix; the result record is in `docs/results.md`
("Decision models tried" section, under Darwin).

## What was measured

- Both seeds, step 274: the driver sent the objective question with zero options;
  the adapter rejected it with `422: question 'objective': 'criteria' must be a
  non-empty object`. No other call failed in the 28 runs.
- 200,880 offline states (every L6 floor, y offsets, grounded/airborne, mf
  240–300, apex-snap landings) never produced an empty menu — the failure is a
  single state, not a region the static sweep reaches.
- The replay endpoint (below) reproduced the run and the guard dumped the
  failing snap verbatim: cat airborne at (302.25,132.8) dy=2.8, mf=273,
  `gemPositions=[gem_a(135,143)]`, collected=2, `onPlatform=false`.

## Root cause

`buildObjectiveCall`'s `ROUTE_FIRST` deferral removed the sole live gem.
`jumpHitsCeiling` was true at that state (head clearance ~59px < the 64.6px jump
threshold), so the deferral BFS ran with the ceiling-restricted `firstHop` and
failed to reach gem_a's holder, while `canReach` (static graph) said reachable.
The rule deferred gem_a; with nothing else on the menu the criteria object
serialised to `{}` and the adapter refused it. The deferral's own comment says
it defers only a goal whose route crosses *another live goal's* platform — with
one live gem the blocked set is empty, so nothing may be deferred, and a
ceiling-restricted firstHop failure is not a deferral cause.

## The fix (show before committing — driver code)

- `driver/decision.cjs` (`buildObjectiveCall`): `bfsReaches(blocked)` extracted;
  the deferral re-runs the BFS with an empty blocked set and defers only if that
  pass finds the holder. A goal the firstHop cannot reach keeps its menu entry
  and its NO ROUTE / distance annotation.
- `driver/decision.cjs` (`decide`): a guard throws with the snapshot
  (`cat`, `movingFrames`, `gemPositions`, `gemsCollected`) if the objective menu
  is empty, so a zero-criteria question can never go out silently.
- `docs/simulate-clock-audit.md`: line numbers re-pinned (+9 shift) after the
  fix moved the `simulate()` sites.

## The tools added

- `driver/replay.cjs` + the `replay` entry in both runners' `ENDPOINTS`:
  `REPLAY_JSON=<run_*.json> node run_level.cjs replay <level>` replays an
  archived run offline against the live harness, no model. Keys the archive by
  decide-call order, compares the live snap to the archive (divergence error
  with both values on >0.5px or a gem-count mismatch), answers every `classify`
  with the archived answer. When the archive is exhausted (the decision the run
  died on) it runs the real `decide` against a rejecting stub, so a guard that
  fires first throws and dumps the live snap + levelGems + deathHistory to
  `REPLAY_DUMP` (default `out/empty_menu_snap.json`).
  Note: the replay is not deterministic decision-for-decision (unseeded laser
  thickness; 27 vs 28 decisions observed across replays), but the empty-menu
  state reproduced exactly.
- `driver/test_empty_objective_menu.cjs` (in `test_all.cjs`): loads the fixture
  `driver/fixtures/empty_objective_menu_l6.json` and asserts the menu is
  non-empty there. Red on the old code (empty menu + missing guard), green on
  the fix.
- `driver/experiments/blast_routefirst_fix.cjs`: old-vs-new differential over
  every archived decision, order-insensitive. An earlier run reported 0 of
  57,049; that number was invalid (the scratch OLD copy could have been taken
  after the edit, making OLD == NEW). The script now regenerates OLD from
  `git show HEAD:driver/decision.cjs`. Measured (2026-10-10, `blast_gates_head.cjs`,
  same comparison): 929 of ~68,500 differ, all on L4 (801) and L6 (128), every
  diff a deferred gem reappearing in the menu, zero text diffs, clearing levels
  untouched. Caveat: a 422 call is never logged, so the archives cannot contain
  the failing decision; the fixture test is the direct proof.
- `driver/experiments/diag_empty_menu_l6.cjs`, `diag_empty_menu_l6_wide.cjs`:
  the offline sweeps (kept for the record; the wide one found nothing).

## Verification (all commands run 2026-10-10 on this MacBook)

- `cd driver && npm test` — all green; only `test_objective_lock.cjs` red by design.
- Replay: `CHROME=... SEED=1 REPLAY_JSON=out/byom/Darwin-27B-ZTC/s1/run_level_6_systemone.json node run_level.cjs replay 6` —
  old code: guard fires at step 274 with the empty-menu dump. New code: the
  28th decision builds a non-empty menu (`gem_a (only goal, call skipped)`) and
  the run then ends on archive exhaustion, as expected.
- Red/green: the fixture test against `git show HEAD:driver/decision.cjs` fails
  (empty menu, missing guard); against the fixed file it passes.

## Open

- Level 6 on Darwin is still unmeasured: re-running it needs the Darwin adapter
  re-served on gpu-server (the sweep is hours; disk is tight — ask first).
- Task 2 (typed-decisions-minilm-l6-specialist) not started: gate check, source
  verification, context-window check, then the two-seed sweep.
- Next reference model for engine work: PurpleMIST-Flash-1.0 (fast on the Strix
  Halo, 7/14; its failing levels 2, 10, 11, 12, 13 are the targets). Clef is
  blocked until DECISIONS_BASE_URL is set.
