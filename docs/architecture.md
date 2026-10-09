# Architecture

## The game is never modified

`cat-goric-game/` is a git submodule pinned to the archived upstream commit. The upstream (`felladrin/js13k-2021`) was archived on 2023-01-23 and rejects pushes, so the game is read-only by construction.

Three things are avoided rather than edited:

- `bridge/bridge.ts` puts the live game singletons on `window.bridge`. It contains no game logic and no decisions. It works because of ES module singletons: `harness.html` loads `cat-goric-game/src/scripts/main.ts` first and `bridge/bridge.ts` second, so both resolve `constants/instances` to the same URL and the browser hands back the same module instance.
- The Tweakpane dev panel is hidden with `.tp-dfwv { display: none !important; }` in `harness.html`, not by touching `main.ts`.
- `harness.vite.config.cjs` is a separate plugin-free dev config, so the game's own `vite.config.ts` stays untouched. It must be CJS: vite 2.5.10 rejects `.mjs` with "config must export or return an object".

## The loop

The driver stops the game's wall-clock loop (`gameLoop.stop()`, called exactly once before the decision loop) and steps frames by hand through the bridge. A model call takes seconds and the game does not run on while it waits.

`bridge.stepFrame` must `clearRect` before render. `GameLoop` normally does it (`clearCanvas` defaults to true) and calling `propagateGameLoopRender` directly skips it, which otherwise makes every screenshot an unreadable smear.

Level changes are observed, not performed. After the first state read the game is a pure function of the frames the driver steps.

### Cadence (`cadence.cjs`)

How many frames one decision runs for:

| State | Frames before re-deciding |
| --- | --- |
| Grounded, no jump | `K = 6` |
| Grounded, jump | 1 frame to launch, then the airborne cadence once |
| Airborne | `AIR_REDECIDE_FRAMES = 3` |

`holdIsSafe(snap)` may extend an airborne hold when the committed action is still heading for a landing, capped at `MAX_HELD_FRAMES = 120`. It may only ever extend a hold, never shorten one, so the batch always terminates. Without the hold, the cat re-decides direction every 3 frames with no memory of what it committed to, and near-ties oscillate: 39.6% mid-air reversal on level 3 (zero gems in 3000 steps) against 7.5% on level 2 (cleared, no deaths).

Run caps: `run_level.cjs` stops at 3000 steps or 40 deaths. `run_full.cjs` stops a level at 10 deaths.

## A decision

Up to two classifier calls, always sequential. They must be sequential because simple-jev scores each question independently against the shared state, so a second question in the same request cannot see the first one's answer.

### 1. Objective

Which of the reachable goals to pursue: `gem_a`, `gem_b`, `gem_c` (by spawn order), `portal` once 3 gems are collected, plus `descent_left` / `descent_right` / `ascent_left` / `ascent_right` when an objective is below or above the cat's floor. Skipped when only one candidate remains.

The state lists each candidate with its offset from the cat and its own pixel margin to the laser closing on it. The presented order is a single seeded permutation shared by the state listing and the letter menu. Shuffling only the menu and leaving the state text in fixed order was an early bug that left list-position bias intact; the permutation is now shared, and the chosen letter maps back through the presented order by name.

**The objective is held across a jump arc.** Airborne frames reuse the objective the jump was launched for and make no objective call. The airborne prompt is strictly less informed than the grounded one: the stranding annotations are anchored by `REACH.platformKeyUnder`, whose 14px tolerance stops resolving a few frames into a jump, so the listing degrades to bare distances and the nearest gem wins. Measured on level 4: grounded at (129.75, 93) with the warnings present, `gem_a` is chosen in 35 of 40 orderings; 18px into the jump at (136.75, 75) with them absent, `gem_b` wins 6 of 6 at p = 1.000. The lock drops when the held objective leaves the menu and is cleared on every death or reset.

`STICKY_OBJECTIVE=1` widens the same lock to grounded decisions. A locked waypoint releases on a floor change, on vanishing from the menu, on death, or after `WAYPOINT_COMMIT_CAP = 30` decisions. It is off by default and is inert on level 4 (see [dead-ends.md](dead-ends.md)).

### 2. Move

One request carrying two independent questions, composed mechanically:

- `jump`: does the cat need height? Grounded only.
- `direction`: grounded gives left or right, airborne gives left, right or none.

Grounded composition yields exactly four actions: `left`, `right`, `jump_left`, `jump_right`. Bare `jump` only when the horizontal offset is under 3px.

`wait` is removed and must not come back. Laser closure is a movement-distance budget (`updateDronesVelocity` sets drone speed 0.2 only while `isCatMoving`), not elapsed time. Standing still freezes the drones but conserves nothing: the same movement has to be spent later, and it only inflates `escapeTime`. `none` is likewise never offered as a grounded direction.

Why decomposed rather than a flat 6-way choice: Laya answered `jump` (0.72) for a target up-and-right and `jump` again for up-and-left. Decomposed it was 4 of 4 correct. The composition is the game's own action encoding, not a strategy.

Filtering to legal actions (no jump and no standing still while airborne) is not planning.

## The policy

The model's top answer is taken as-is while it is working. Its own distribution is sampled only at positions that have demonstrably failed, with temperature escalating per failure:

- a prior death at that 10px position key, or
- repeated revisits to that key within a sliding window of the last `VISIT_WINDOW = 12` decisions, past `VISIT_STUCK_THRESHOLD = 3`.

Argmax on an identical state returns an identical answer forever, so any livelock is permanent by construction: a death resets the level to an identical state and replays the same fatal choice, and a deathless oscillation never triggers a death-based escape at all. Both were observed and both are covered by `test_death_history.cjs`.

The window is load-bearing. Counting revisits over the whole attempt fires on positions the cat legitimately re-crosses during a long level, and the escape hatch then spends the budget it exists to protect: on level 2 it drew a 34-frame standing jump over the model's argmax and the cat reached the last gem 49 frames short of the walk back to the portal.

The model is never overridden. What the escalation changes is that the driver stops discarding the model's uncertainty where its confident answer has already failed.

**Temperature sign warning.** `sampleDistribution` uses `p^(1/T)`. `T < 1` sharpens toward the argmax, `T = 1` samples the reported distribution exactly, `T > 1` flattens toward uniform. This is the opposite of the LLM idiom where 0.7 reads as tame. Default `SAMPLE_TEMPERATURE = 1.0`, escalating as `1.0 + 0.5 * priorDeathsAtPosition`, capped at 3.0.

### Failure attribution

A failure caused by a committed action is recorded against the decision that made the commitment as well as the decision running when the consequence landed. During a failed hop the cat makes several airborne decisions after launch, so recording only the last decision meant the launch key never accumulated a prior death and stayed on argmax forever. Toggle with `ATTRIB=0`.

This is kept because it makes the logs mean what they say, not because it improved play. A five-seed paired test on level 2 found no effect (deaths 13 vs 14, 2 better / 2 worse / 1 tie). Do not cite it as an improvement.

## Endpoints

Defined in the `ENDPOINTS` map in `run_full.cjs`. The `model` string must match what the server was started with exactly, or the request is rejected.

| Key | Kind | Model | Note |
| --- | --- | --- | --- |
| `halogen` | halogen-logprobs | `Halogen-Qwen3.8-Flash-Next-Instruct` | Since halogen-flash-server 0.13.8 it scores a label from `top_logprobs` on the first generated token, so it runs the same `decide` policy as every other classifier. Point it at the `-Instruct` model id: that alias sets `enable_thinking: false`, and with thinking on, the first token after the answer prefix starts the reasoning rather than a label. Most of the run archive is this endpoint. |
| `halogen_menu` | halogen | same | The pre-0.13.8 path: generate a menu letter and parse it. Kept because the comparison against a true classifier interface is now an A/B on identical state rather than two different pipelines. |
| `qwen_local` | qwen-local | `Qwen3.8-27B-Instruct` | llama.cpp through llama-swap, spec-faithful assistant-prefill shim. |
| `demo` | jev | `featherless-ai/Qwen3.8-27B-classifier` | Hosted classifier. 2 RPS plus a shared-capacity ceiling, intermittent 530s, about 3.1s per decision. |
| `laya` | jev | `convaiinnovations/laya` | 421M System-1 model on CPU. Clears level 0 with all three gems. |
| `qwen_small` | qwen-local | `Qwen3.5-0.8B-Instruct` | The floor. 40 deaths and 0 gems on level 0 at 0.27s per decision, which is the datapoint that capability rather than speed is the constraint. |

### The assistant-prefill finding

`PROMPT_STRUCTURE_V1` requires an open assistant position. llama.cpp continues an assistant message when it is the last entry in the `messages` array, so sending system + user and then a final assistant message whose content is the open `{"answer": "` gives exactly that, with no manual jinja templating. Softmax is then taken over only the permitted label letters in the continuation. (`/apply-template` is 404 through llama-swap, so hand-rendering the template was never an option.)

An earlier lettered-menu shim sent a *completed* user turn and asked the model to answer as a fresh assistant turn. That is not equivalent, the spec says so outright, and it scored 18 deaths on level 0 against a baseline of 0. The level-0 exact reproduction under the prefill is the evidence that the prompt structure is right.

## Files

| File | Role |
| --- | --- |
| `driver/decision.cjs` | State construction and the policy. 2277 lines, the bulk of the work. |
| `driver/jev.cjs` | Endpoint clients: classifier API, llama.cpp logprobs, halogen logprobs, chat fallback. A failed call is a hard error. |
| `driver/reachability.cjs` | The air-control model: `landingsFrom`, `platformHolding`, `platformKeyUnder`, `reachableFrom`. |
| `driver/arc.cjs` | `simulate()`, one held action to termination. |
| `driver/hop_points.cjs` | Waypoint candidates above the current floor. |
| `driver/cadence.cjs` | Frames per decision and when the model re-decides. |
| `driver/physics.cjs`, `driver/level_data.cjs` | Constants and platform coordinates mirrored from the game's `config.ts`. |
| `driver/run_level.cjs` | Play one level. |
| `driver/run_full.cjs` | Play the ladder, with a level-0 regression gate that breaks out with stop reason `L0_regression_gate` if level 0 does not clear at 0 deaths. With `DEMO_KEEP_LEVELS` set it runs in demo mode: the levels outside the kept set are skipped on the portal advance, not deleted. |
| `driver/run_stats.cjs` | Shared incremental flush on SIGTERM / SIGINT / crash, so a wall-clock timeout still leaves a machine-readable result. |
| `driver/probe.cjs`, `driver/dump.cjs`, `driver/overlay_test.cjs` | Inspection tools (need live harness + Playwright). |
| `driver/experiments/probe_move.cjs` | Replays an archived decision offline. Reproduces 244 of 250 attempted decisions exactly, so a prompt wording change is testable in seconds rather than by a 45-minute run. |
| `driver/test_*.cjs` | The checks. See [open-problems.md](open-problems.md) for which ones `npm test` actually runs. |
| `driver/video/` | The screencast pipeline. Built, never run against real footage. |

## The decision overlay

`window.overlay.thinking(bool)` and `.update(data)` are driven from both runners. The panel shows the objective and move questions with a probability bar per option, the policy mode, the latency, and level / gems / deaths / frames. Its heading is the project name, `AI Plays Cat Goric`, set in `harness.html` (it used to read `JEV CLASSIFIER`, which named the internal classifier instead of the project).

The bars are the point. They are the visible evidence that this is a classifier reading a next-token distribution rather than an LLM composing prose: objective `descent_right` at 0.962 with the other four options drawn as their own bars, move `right` at 0.890 with `jump_right`, `left`, `jump_left` and `jump` each rendered as a bar.
