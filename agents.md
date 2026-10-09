# AI plays Cat Goric

A classifier LLM plays a 13kB platformer. Each decision it answers two multiple-choice questions about a text state description; the driver reads the probability distribution over the permitted answers and presses a key. An agent improves **what the model is told** and **how the run is measured**. It does not write the policy.

## Start here

1. [docs/agent-guide.md](docs/agent-guide.md) — the contract, the reading order, the measurement rules, a paste-ready prompt.
2. [docs/rules.md](docs/rules.md) — the five rules the work is judged by. Read before touching a prompt.
3. [docs/method.md](docs/method.md) — how to measure. Read before running anything.
4. [docs/dead-ends.md](docs/dead-ends.md) — measured and rejected. Read before proposing a new prompt fact.

## Commands

```sh
npm run harness                        # terminal 1: the game page on :5173
cd driver
node run_level.cjs clef 10             # one level, isolated run
node run_full.cjs clef                 # the whole ladder
npm test                               # the driver's default suite
```

`npm test` runs one file. The full suite is `npm test` plus, one by one:

```sh
node test_descent_gate.cjs
node test_sticky_objective.cjs
node test_cfg_shadow.cjs
node test_burn_facts.cjs
node test_obj_sample.cjs
node test_descent_laser_gate.cjs
node test_objective_lock.cjs           # red by design: it gates re-enabling the same-floor note
```

## Structure

- `driver/decision.cjs` — the prompt builder and the decide policy. Everything the model is told lives here.
- `driver/run_level.cjs`, `driver/run_full.cjs` — the two runners. Isolated and ladder runs are different measurements; a change to one usually belongs in both.
- `driver/jev.cjs` — the endpoint clients. The endpoint table is at the top of `run_level.cjs`.
- `driver/route_clock.cjs`, `driver/arc.cjs` — clock and trajectory analysis behind the prompt facts and the offline probes.
- `driver/experiments/` — offline census and probe scripts. Run these before any live run.
- `docs/` — the project memory: results, dead ends, open problems, game facts, architecture.

## Hard rules

- No pathfinder, no heuristic fallback, no retry until the model picks what you wanted.
- The objective menu stays flat and simultaneous, never sequenced.
- Census a new prompt fact offline first, then regression-test it on the levels that already clear.
- Record every result in `docs/results.md` in the same change, with the command, the endpoint name, and the numbers.
- Never read or print the gitignored env file at the repo root. The driver reads it in-process.

## Verification

- A change is not done until a level run exercised it end to end. Unit tests and type checks are not sufficient.
- Never read a run archive while a run is writing it. `pgrep -f run_level.cjs` first.
- One run proves nothing: use `SEED` for replicates and report clear rate.
