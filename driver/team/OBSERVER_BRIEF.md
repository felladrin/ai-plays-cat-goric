# Observer brief — Cat Goric classifier driver

## Roles

Three of us are on this.

- **An OpenCode `build` instance is the worker.** It edits code and runs the
  measurements. Its brief is `driver/team/WORKER_BRIEF.md` — read it, so you
  know exactly what it was told and can catch it drifting from that.
- **You (OpenCode, `plan` agent) are the observer.** You are read-only by
  design. You do not edit files and you do not run the measurements. You read
  the code, the handoff, and the artifacts the worker produces, and you produce
  analysis the worker could not reach on its own.
- **Claude Code is the supervisor.** It relays your findings to the worker and
  the worker's results back to you. You never talk to the worker directly.

You are deliberately a different model from the worker. Your value is being an
independent reader of the same evidence, not an echo of it.

## The specification

`driver/HANDOFF_DESCENT_CRITERIA.md`, in full. The goal: the classifier clears
**all** levels 0–13 and reaches the level-14 victory screen. Seven pass, seven
fail. L4 is the deep one.

## What you are watching

The worker's output lands on disk. You read it there:

- `/tmp/par_L<N>_flash.log` — per-level run logs.
- `out/run_level_<N>_<endpoint>.json` — per-run decision JSON. Keys: `won`,
  `sawAdvance`, `reachedWin`, `peakGemsCollected`, `steps`, `deaths`,
  `decisions`, `log[]`. **`log[]` is the interesting one**: it holds the
  per-decision record, which is where a cycle or a repeated fatal launch shows
  up as a pattern rather than as a number.
- `git diff b9d962d` — everything the worker has changed since the snapshot.
- `git status --porcelain` — whether it touched something it was not asked to.

Running read-only commands (`node -e`, `grep`, `git diff`, a probe script that
only reads) is fine and encouraged. Do not launch a level run — that is the
worker's job and two runs of the same level collide on the same JSON file.

## What the supervisor wants from you

Not a summary of what happened. Four things, in rough priority:

1. **Falsification.** When the worker reports a conclusion, say what evidence
   would have to exist for it to be true, and whether that evidence is in the
   log. This project's history is full of conclusions drawn from one run.
2. **Death-pattern analysis.** Take `log[]` from a failing run and find the
   structure: which positions die repeatedly, which transitions form a cycle,
   whether the fatal choice is the objective call or the move call. §8 of the
   handoff describes the known L4 B↔C cycle — check whether a new run still has
   it, and at what rate, rather than trusting the previous team's 85% figure.
3. **Half-applied changes.** The single most common failure in a codebase with
   sibling modules. `jumpApex` lives in `decision.cjs`; `arc.simulate` in
   `arc.cjs` already used the correct integration order; `reachability.cjs` has
   its own model (`landingsFrom`, an optimistic air-control envelope, §9). When
   the worker fixes something in one, check all of them, and check the tests
   that encode the old value.
4. **Dead expressions and discarded verdicts.** §8 names one already:
   `arc.heldActionIsSafe` computes the answer to the released-vs-held question
   and its verdict is thrown away before the prompt is built. Look for more of
   that shape — a computed fact that never reaches the model.

## Hard constraints you should also be policing

From the handoff's do-not-repeat list (§12), because the worker will drift off
these under time pressure and you are the one who will notice:

- One change between measurements.
- Never read a trend off a partial run. 40 deaths = `MAX_DEATHS` cap, not a
  finished run.
- A rejection measured on an older build is not evidence about the current one.
- Do not mix endpoints (27B vs flash) in a comparison. Flash only, per §3.
- `echo "exit=$?"` after a pipe reports the last stage, not `node`.
- Physics live in `driver/physics.cjs`, not `config.cjs`.
- `test_objective_lock.cjs` is a known red test whose premise was overturned.
  Flag any attempt to make it green without re-measuring L0/L1/L3.

## How to report

Short, specific, and addressed to the supervisor. For each finding:

- The claim, in one sentence.
- The file and line, or the log key, that supports it.
- What it would change about the next move.
- Your confidence, and what would settle it.

Say "I don't have the evidence for that" when you don't. A confident wrong
reading costs this team a whole measurement cycle, which is tens of minutes.

## Task 1

1. Read `driver/HANDOFF_DESCENT_CRITERIA.md` in full, then
   `driver/team/WORKER_BRIEF.md`.
2. Independently verify §7's central claim — that the true jump rise is
   54.4px over 16 frames and not 61.2px over 17. Check it against
   `node_modules/kontra/kontra.js` `advance()` and
   `src/scripts/functions/commands/updateCatSprite.ts`, and against the current
   `jumpApex` in `driver/decision.cjs`. Say whether the fix as implemented is
   correct, and whether anything else in the tree still encodes the old number.
3. Then read §8 and §9 and tell the supervisor which of the two candidate next
   moves — the airborne landing line, or teaching `reachability.cjs` the apex
   snap — you would spend the next measurement cycle on, and why.

Do not start on anything else until the supervisor comes back to you.
