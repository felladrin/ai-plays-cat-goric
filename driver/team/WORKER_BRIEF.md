# Worker brief — Cat Goric classifier driver

## Roles

Three of us are on this.

- **You (OpenCode, `build` agent) are the worker.** You read the code, change it,
  run the measurements, and report numbers.
- **A second OpenCode instance is the observer.** It runs read-only in another
  pane, reads the same repo and the same run artifacts, and produces analysis.
  You will never talk to it directly.
- **Claude Code is the supervisor.** It routes the observer's findings to you,
  verifies your claims against disk, and is the only one who talks to Victor.

Messages that arrive in your pane come from the supervisor. When one says
"observer says X", that is a second model's reading of the same evidence — it is
a hypothesis to test, not an order and not a fact.

## The specification

`driver/HANDOFF_DESCENT_CRITERIA.md`. **Read it in full before you touch
anything.** It is self-contained and written by the previous team. Follow it
literally. Sections you will need constantly: §3 (endpoint policy), §4 (how to
run), §7 (the unmeasured jumpApex fix), §12 (do-not-repeat list), §13 (facts not
to re-derive), §14 (order of work).

The goal: the classifier clears **all** levels 0–13 and reaches the level-14
victory screen. Seven levels pass today. Seven do not.

## Environment — already set up for you, verify don't rebuild

- SSH tunnel to `gpu-server` llama-swap is **up** on `127.0.0.1:1235`
  (`curl -s http://127.0.0.1:1235/v1/models` lists `Halogen-Qwen3.8-Flash-Next`).
  It runs in a pane the supervisor owns. **Do not start another tunnel and do
  not kill that one.** If it dies, say so; the supervisor restarts it.
- `/tmp/chrome_path.txt` exists and is correct.
- Playwright module: `/Users/victor/Repositories/MiniSearch/node_modules/playwright`.
- `driver/experiments/lvl.sh <L>` already exports all three env vars and writes
  `/tmp/par_L<L>_flash.log`. Use it rather than hand-rolling the env.

## Hard rules

1. **Flash only.** `node run_level.cjs halogen <level>`. Never run the 27B model
   while flash is in flight — same llama-swap instance, and cross-model
   concurrency forces a GPU model swap per call. Same-model concurrency is fine;
   the server takes 4 concurrent sessions.
2. **One change between measurements.** Every regression in this project's
   history came from changing several things and measuring once.
3. **Never read a trend off a partial run.** A run reporting 40 deaths hit
   `MAX_DEATHS` — it did not finish.
4. **Runs are long. Never run one in the foreground of a tool call** — it will
   hit your bash timeout and you will lose the result. Always:
   ```sh
   nohup zsh driver/experiments/lvl.sh 4 > /tmp/lvl4.out 2>&1 &
   ```
   then poll with `pgrep -f run_level.cjs` and `tail /tmp/par_L4_flash.log`.
   Two distinct levels can run at once; **two runs of the same level collide**
   on `out/run_level_<N>_<endpoint>.json`.
5. **`echo "exit=$?"` after a pipe reports the last stage, not `node`.** This
   produced two false "tests pass" readings in this project already. Check
   `${pipestatus[1]}` in zsh, or don't pipe.
6. **Physics live in `driver/physics.cjs`, not `config.cjs`.** Reading them from
   `config.cjs` yields `undefined` and every comparison silently passes.
7. **Do not rewrite a whole file you were not asked to rewrite.** Use the edit
   tool on the regions you are changing. `decision.cjs` is 102KB of layered work.
8. **No git commands that change history or the remote.** No commit, no push, no
   checkout, no reset, no stash drop. Ask the supervisor. You are on branch
   `driver-handoff`; commit `b9d962d` is the revert point for everything in
   `driver/`.
9. **`test_objective_lock.cjs` is a known red test** (§10). Do not relax it to
   green. The other three guards must stay PASS:
   `test_descent_gate.cjs`, `test_sticky_objective.cjs`, `test_death_history.cjs`.
10. **Record passing levels with `VIDEO=1`** as they pass (§4). A previous
    session's only artifact was a day-old recording.

## How to report

After each task, report to the supervisor in this shape, short:

- The exact command you ran.
- The exact numbers from the log — cleared / deaths / decisions / gems / steps —
  copied, never remembered.
- What changed on disk (files and the regions).
- What you concluded, and the one thing that would falsify it.

Do not claim a test passed unless you ran it and read its exit status.

## Task 1 — and only task 1

**Measure the jumpApex fix on L4, flash.** §7 of the handoff describes it: the
jump rise was over-reported (61.2px/17 frames) because the first frame counted
the full `-catJumpSpeed`; the game integrates gravity before the position
update, so the true rise is 54.4px/16 frames. The fix is already in
`decision.cjs`. **Nobody has ever measured its effect.**

Do this:

1. Read the handoff in full.
2. Confirm the fix is actually present in `jumpApex` in `decision.cjs` and that
   the derived prompt strings no longer hardcode 61.2. Report the line numbers.
3. Run the three green guard tests. Report PASS/FAIL with exit statuses.
4. Launch L4 on flash, in the background, per rule 4.
5. While it runs, do not start a second thing. Read `driver/arc.cjs` and the
   B↔C cycle analysis in §8 so you are ready to interpret the result.
6. When it finishes, report the numbers against the r6 baseline of
   **13 deaths / 1 gem / FAIL**, which is the best L4 has ever done.

Do not implement the airborne landing line yet (§8). That is task 2, and §8's
own sequencing note says to measure jumpApex alone first because it affects all
14 levels.
