# Continuing this project with an agent

The contract and the reading order for a fresh agent session on this repo. It is written
to be handed to an agent as its first instruction, and to stay true across commits: current
numbers live in [readme.md](../readme.md) ("Where it stands") and [results.md](results.md),
not here.

## The task

Get the classifier to clear as many of the 14 playable levels of
[Cat Goric: Escape from the Warp Chamber](https://js13kgames.com/entries/cat-goric-escape-from-the-warp-chamber)
as possible, and ideally all 14.

The model never writes code and never emits a plan. Each decision it gets a text
description of the game state and answers two multiple-choice questions; the driver reads
the probability distribution over the permitted answers and presses a key. That is the
whole policy. An agent improves **what the model is told** and **how the run is
measured**. It does not write the policy.

## Read first, in this order

| File | Why |
| --- | --- |
| [rules.md](rules.md) | The constraints the project is judged by. Rule 1: no pathfinder, no heuristic fallback, no retry until the model picks what you wanted. Rule 2: the objective menu stays flat and simultaneous, never sequenced. Rule 4: stop adding state facts. |
| [method.md](method.md) | How to measure here. A single run cannot distinguish two builds. |
| [results.md](results.md) | The per-level, per-seed record on the current build, and what each recent change needed. |
| [dead-ends.md](dead-ends.md) | Measured and rejected. Do not re-run these. |
| [open-problems.md](open-problems.md) | Live defects and named mechanisms. |
| [../driver/README.md](../driver/README.md) | Operating instructions, endpoints, environment variables. |

## Running it

```sh
npm run harness                          # serves the game and the decision panel
cd driver && node run_level.cjs clef 10  # one level on the best endpoint
```

A level takes 40 to 900 seconds. Every decision-changing flag is stamped into the run file
under `build`, together with the effective `SEED`. Run archives live in `out/exp_*` on the
machine where they were run; `out/` is gitignored, so a fresh clone does not have them.

For a sweep, copy `driver/` to `out/exp_<tag>/driver` and run from there: the frozen copy
means an edit made mid-sweep cannot leak into the runs that are measuring it.

## Measurement rules that are non-negotiable here

- One run proves nothing. Use `SEED` for replicates and report clear rate. A clean
  zero-death clear only varies the menu order, not the trajectory, so identical seeds are
  evidence of menu-order robustness, not of independent replication.
- Before running a level, check the change can fire on it offline. A level where the change
  cannot fire cannot distinguish the builds. `driver/experiments/firing_counts.cjs` and
  `driver/experiments/census_gem_from.cjs` do this in milliseconds.
- Never read a run archive while a run is writing it. `pgrep -f run_level.cjs` first.
- A new prompt fact must be regression-tested on the levels that already clear. Every
  harmful fact in [dead-ends.md](dead-ends.md) was caught only there, never by a level
  failing outright.
- `npm test` runs the full suite (`test_all.cjs`): the eight green suites plus
  `test_objective_lock.cjs`, which is red **by design** as the gate on
  re-enabling the same-floor note — the runner expects that exact failure and
  fails if it goes red or green for any other reason.
- Update [results.md](results.md) in the same change as any result you cite, with the
  command and the numbers.

## Prompt for a new conversation

```
Continue the AI-Plays-Cat-Goric project in <repo path>.

Read docs/agent-guide.md first and follow it exactly: the goal, the rules the project is
judged by, the measurement rules, and the pointer to what is measured dead. Then read the
files in its reading order.

Then report back: what you read, what you believe the current state to be, and which open
problem you are starting with. Do not add a prompt fact before you have a diagnosis for
the level you are aiming at, and do not run a level before you have checked offline that
your change can fire on it.

Update docs/results.md in the same change as any result you cite, with the command and
the numbers.
```
