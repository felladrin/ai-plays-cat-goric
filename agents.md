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
./beat_the_game.sh 9                   # the ladder with the winning flag set (PurpleMIST-Flash-1.0)
npm test                               # the driver's default suite
```

`npm test` runs the whole suite: `test_all.cjs` runs every suite in one command and exits non-zero on anything unexpected. The suites are `test_death_history.cjs`, `test_descent_gate.cjs`, `test_sticky_objective.cjs`, `test_cfg_shadow.cjs`, `test_burn_facts.cjs`, `test_obj_sample.cjs`, `test_descent_laser_gate.cjs`, `test_simulate_clock.cjs`, `test_runner_parity.cjs`, `test_osc_fix.cjs`, and `test_objective_lock.cjs` — the last is red by design (it gates re-enabling the same-floor note) and `test_all.cjs` pins that exact expectation. The list also includes `test_fall_blame.cjs` (fall-edge death blame, `FALL_BLAME` gate), `test_miss_blame.cjs` (closest-approach death blame, `MISS_BLAME` gate), `test_gap_jump.cjs` (same-height crossing fact with the route gate, `GAP_JUMP`), and `test_gate_off_values.cjs` (each new gate is off at `=0`, as the older gates are). `test_build_flags.cjs` fails when a driver module reads an env var that is neither stamped into the run file's `build` nor listed as infrastructure. Each gated lever has its own `test_<gate>.cjs`.

## Structure

| Path | What it is |
| --- | --- |
| `cat-goric-game/` | The game, a git submodule pinned to the archived upstream commit (`felladrin/js13k-2021`, archived 2023-01-23, rejects pushes). Read-only by construction |
| `bridge/bridge.ts` | Puts the live game singletons on `window.bridge`. No game logic, no decisions |
| `harness.html` | The page the driver drives: game on the left, decision panel on the right |
| `harness.vite.config.cjs` | Plugin-free dev config, so the game's own `vite.config.ts` stays untouched |
| `driver/decision.cjs` | The prompt builder and the decide policy. Everything the model is told lives here |
| `driver/run_level.cjs`, `driver/run_full.cjs` | The two runners. Isolated and ladder runs are different measurements; a change to one usually belongs in both (`test_runner_parity.cjs`) |
| `driver/cadence.cjs` | When the model is asked (walk budget, airborne re-decide, `WALKOFF_CLEAR`) |
| `driver/jev.cjs` | The endpoint clients. The endpoint table is at the top of `run_level.cjs` and in `driver/README.md` |
| `driver/route_clock.cjs`, `driver/arc.cjs`, `driver/collect_check.cjs` | Clock, trajectory and collectability analysis behind the prompt facts. Every claim a lever adds is proven by one of them |
| `driver/beat_the_game.sh` | The winning flag set for `run_full.cjs` (keep it in step with `docs/results.md`) |
| `driver/experiments/` | Offline census, blast and probe scripts (`render_states.cjs`, `blast_shrink_geom.py`, `probe_move_wording.cjs`, `cmp_gates.cjs`, `cmp_obj.cjs`). Run these before any live run |
| `docs/` | The project memory: results, dead ends, open problems, game facts, architecture |

## Endpoints

The driver speaks two model interfaces:

- **Chat completions with a first-token distribution.** An OpenAI-compatible `/v1/chat/completions` that returns `top_logprobs` for the first generated token (`logprobs: true, top_logprobs: n`) and continues a trailing assistant message. llama.cpp's `llama-server` serves whatever model it loaded under any model name; vLLM needs `continue_final_message: true` (the client's `extraBody`, see the `halogen` entry). Many hosted chat APIs omit first-token top-logprobs.
- **System One decisions.** `POST /v1/systemone` (or `/v1/classifier`) with `{state, questions}` returns a probability per option in one forward pass: decision GGUFs on llama.cpp b11361+ (Clef, OpenJev, Kev-4B, lev, Laya, Julia-1), PurpleMIST's `serve.py`, `adapters/systemone_adapter.py` (Phocinae, Darwin-ZTC). `driver/experiments/sweep_systemone.sh` runs every level isolated against one.

The `qwen_local` and `clef` entries in `driver/run_level.cjs` are the templates for adding an endpoint.

## How a lever is added

Every lever is an env gate, off by default and stamped into the run file's `build` (`driver/run_stats.cjs`). The order that has worked: find the decision where lives go wrong in the archives; check the fact with the simulator or `route_clock`; probe the wording at that state (`probe_move_wording.cjs`, `@crit:` edits replace an option label); build it gated; unit test; re-pin `docs/simulate-clock-audit.md` for any new `arc.simulate` site (`test_simulate_clock.cjs` fails otherwise); blast it over the archives (gate off must give 0 diffs; `render_states.cjs` compares state text, option labels, menu and objective call); census the firings against archived outcomes; then live runs, isolated first, then ladders at several seeds.

What the probes keep showing: a true fact on the option the model should **avoid** moves it; the same fact in the floor text, or on the option it should take, often does nothing or backfires. When two options are bad, label both.

## Hard rules

- No pathfinder, no heuristic fallback, no retry until the model picks what you wanted.
- The objective menu stays flat and simultaneous, never sequenced.
- Every sentence the model reads must be true; a lever states facts, not instructions.
- Census a new prompt fact offline first, then regression-test it on the levels that already clear.
- Record every result in `docs/results.md` in the same change, with the command, the endpoint name, and the numbers.
- Never read or print the gitignored env file at the repo root. The driver reads it in-process.
- Never add an AI session link or "Generated with" line to a commit or a pull request.

## Verification

- A change is not done until a level run exercised it end to end. Unit tests and type checks are not sufficient.
- Never read a run archive while a run is writing it. `pgrep -f run_level.cjs` first.
- One run proves nothing: use `SEED` for replicates and report the clear rate. At temperature 0 different seeds can replay the same game; a replicate counts only if its trajectory differs.
- A ladder with up to 100 lives per level (`MAX_DEATHS_PER_LEVEL=100`) is the measurement the wins were made on; report the cap with the result.
