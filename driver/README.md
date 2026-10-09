# Cat Goric, played by a classifier LLM

This folder makes a language model play [Cat Goric: Escape from the Warp Chamber](https://js13kgames.com/entries/cat-goric-escape-from-the-warp-chamber), the js13kGames 2021 entry that `../cat-goric-game` points at.

The model never writes code and never emits a plan. Every frame-group, it is handed a text description of the game state and asked two multiple-choice questions. The driver reads the probability distribution over the permitted answers and presses a key. That is the whole policy.

## The game is not modified

The game is a git submodule pinned to the archived upstream commit, so there is nothing here to modify. `../cat-goric-game` is read-only by construction: the upstream (`felladrin/js13k-2021`) was archived on 2023-01-23 and rejects pushes.

The bridge that exposes game state to the driver lives outside the game tree, in `../bridge/bridge.ts`, and it contains no game logic and no decisions. It works because of ES module singletons: `harness.html` loads `cat-goric-game/src/scripts/main.ts` first and `bridge/bridge.ts` second, so both resolve `constants/instances` to the same URL and the browser hands back the same module instance. The bridge re-exports those onto `window`.

Two other things are avoided rather than edited:

- the Tweakpane dev panel is hidden with CSS (`.tp-dfwv { display: none !important; }`) in `harness.html`, not by touching `main.ts`
- `harness.vite.config.cjs` is a separate, plugin-free dev config, so `vite.config.ts` is untouched

## How a decision is made

The driver stops the game's wall-clock loop and steps frames by hand. A model call takes seconds; the game does not run on while it waits.

Each decision is up to two classifier calls:

1. **Objective** — which of the reachable goals to pursue (`gem_a`, `gem_b`, `gem_c`, a descent point, or the portal). Skipped when only one candidate remains.
2. **Move** — which key to press toward that objective (`left`, `right`, `jump`, `jump_left`, `jump_right`).

The menu order is shuffled per call from a seeded RNG, because menu position measurably biased the answer.

### The policy

The model's top answer is taken as-is while it is working. Its own distribution is sampled **only at positions that have demonstrably failed**, with temperature escalating per failure:

- a prior **death** at that 10px position
- or repeated **revisits** to that position within a sliding window of recent decisions, past a threshold

The second case matters more than it sounds. Argmax on an identical state returns an identical answer forever, so any livelock is permanent by construction: a death resets the level to an identical state and replays the same fatal choice, and a deathless oscillation never triggers a death-based escape at all. Both were observed and both are covered by `test_death_history.cjs`.

The window on the second case is load-bearing. Counting revisits over the whole attempt fires on positions the cat legitimately re-crosses during a long level, and the escape hatch then spends the very budget it exists to protect: on level 2 it drew a 34-frame standing jump over the model's argmax, and the cat reached the last gem 49 frames short of what the walk back to the portal needed.

The model is never overridden. What the escalation changes is that we stop discarding its uncertainty where its confident answer has already failed.

## Results

Qwen3.8-27B-Instruct served by llama.cpp, read as a classifier via next-token logprobs.

| level | outcome |
|---|---|
| 0 | cleared, 0 deaths, 3 gems, 5 decisions |
| 1 | cleared, 3 gems, 3/3 seeds (3–4 deaths) |
| 2 | cleared, 3 gems, 6 deaths, 262 decisions |

That is the `qwen_local` archive. Most of the measured runs are on `halogen`, and the per-level table, with which baselines bear weight, is in [`../docs/results.md`](../docs/results.md).

Other endpoints are kept in the endpoint table because the negative results are the interesting part:

- **`demo`** — a hosted 27B classifier. Clears levels 0 and 1.
- **`laya`** — a 421M System-1 model on CPU. Clears level 0 with all three gems. It was written off early on the assumption that its 1024-token context was too small; that was wrong, and the real cause was a handicap in our own state builder.
- **`qwen_small`** — a 0.8B model. Fails level 0. Included as the floor.
- **`halogen`** — halogen-flash-server. Since 0.13.8 it scores a label from `top_logprobs` on the first generated token, so it now runs the same `decide` policy as every other classifier. Point it at the `-Instruct` model id: that one sets `enable_thinking: false`, and with thinking on the first token after the answer prefix is the start of the reasoning rather than a label.
- **`halogen_menu`** — the same server answered the pre-0.13.8 way, by generating a menu letter and parsing it. Kept because the comparison against a true classifier interface is the interesting result, and it is now an A/B on identical state rather than two different pipelines.
- **`clef`** — the hosted Decisions model `clef`, `/v1/systemone`. This is the endpoint with the best results: 8 of the 14 playable levels clear at two seeds on the current build (see the Clef section of [`../docs/results.md`](../docs/results.md)). It needs `DECISIONS_BASE_URL` and `DECISIONS_API_KEY`, read in-process from the gitignored env file at the repo root so the key never passes through a shell command or a log. It returns identical probabilities for an identical prompt, which makes it the cleanest endpoint for A/B work: two baseline runs of level 2 were identical.

## Running it

Requires a model endpoint that returns next-token logprobs. Any llama.cpp server works.

```sh
# 0. the game (a submodule; a bare clone leaves it empty)
git clone --recurse-submodules https://github.com/felladrin/ai-plays-cat-goric.git
# already cloned without it: git submodule update --init --recursive

# 1. game harness
npm install
npx vite --config harness.vite.config.cjs      # serves http://127.0.0.1:5173/harness.html

# 2. driver
cd driver && npm install && npx playwright install chromium

# 3. play one level
LLAMA_BASE_URL=http://127.0.0.1:1234 node run_level.cjs qwen_local 2

# or the whole ladder
LLAMA_BASE_URL=http://127.0.0.1:1234 node run_full.cjs qwen_local

# or the best current endpoint (key from the repo-root env file, no flag needed)
node run_level.cjs clef 10
```

A level run takes 40 to 900 seconds and writes `out/run_level_<n>_clef.json` plus a
`.log`. Every flag that changes a decision is stamped into the run file under `build`,
together with the effective `SEED`, so a result can always be tied to the build that
produced it. For a sweep, copy `driver/` to `out/exp_<tag>/driver` and run from there:
the frozen copy means an edit made mid-sweep cannot leak into the runs it is measuring.

`HEADED=1` opens a visible window with the live decision overlay.

### Demo recording

By default nothing is skipped: `run_full.cjs` plays the whole ladder, levels 0 to 13, and a new clone behaves exactly as it always did. Demo mode is opt-in, and only turns on when you set `DEMO_KEEP_LEVELS`.

```sh
DEMO_KEEP_LEVELS=0,1,2,5,7,8 node run_full.cjs halogen
```

The run then plays only the kept levels. When the cat touches a portal into a level outside the set, the driver moves the level store to the next kept level above the one just cleared, or to the victory screen when none is left. The levels are skipped, not deleted, for two reasons: `cat-goric-game` is a submodule pinned to the archived upstream and read-only by construction, and renumbering would make the in-game `QUADRANT:` label lie about what is on screen while desyncing every driver structure indexed by the original level index (`level_data.cjs`, the reachability tables, the prompts).

The rewrite happens inside the same page task as the render, so no frame of an unplayed level is ever presented to the recorder. Every skip lands in the run JSON under `demoSkips`, so the recording's provenance says exactly which levels were not played.

```sh
node driver/experiments/test_demo_skip.cjs   # checks the rewrite against the real bridge
```

### Configuration

Everything machine-specific is in `config.cjs` and overridable by environment variable. Nothing is hardcoded to a particular machine.

| variable | default | purpose |
|---|---|---|
| `LLAMA_BASE_URL` | `http://127.0.0.1:1234` | llama.cpp / llama-swap server |
| `SIMPLE_JEV_BASE_URL` | `http://127.0.0.1:8000` | local simple-jev classifier |
| `DEMO_BASE_URL` | the hosted demo | hosted classifier endpoint |
| `DECISIONS_BASE_URL` | — | required by `clef`. The hosted Decisions service base URL. The driver throws if it is unset rather than failing mid-run |
| `DECISIONS_API_KEY` | — | required by `clef`. Read from the gitignored env file at the repo root (`*.local`), or export it. The driver throws if it is unset rather than failing mid-run |
| `HARNESS_URL` | `http://127.0.0.1:5173/harness.html` | where the harness is served |
| `OUT_DIR` | `../out` | run artifacts |
| `PLAYWRIGHT_MODULE` | — | path to a global playwright install |
| `CHROME` | — | specific browser binary |
| `SEED` | `12345` | seeded RNG, so a run reproduces |
| `VIDEO` | unset | `1` records `run_level.cjs` to `out/level_<n>_<endpoint>.webm` |
| `DEMO_KEEP_LEVELS` | unset | comma-separated level indices the ladder may play. Unset means the full ladder, levels 0 to 13, with no skipping |
| `DEMO_MAX_DEATHS_PER_LEVEL` | `25` | per-level diagnostic abort ceiling for a demo run. Without `DEMO_KEEP_LEVELS` the ceiling stays the measurement default of 10 |
| `MAX_DEATHS_PER_LEVEL` | `10` | per-level death ceiling on a non-demo ladder run. Raise for a continuous recording take where a level may need more lives |
| `MAX_TOTAL_STEPS` | `40000` | total step ceiling for a ladder run. Same recording rationale |
| `ENDPOINT` | `qwen_local` | which endpoint `survey_levels.sh` runs |

If Playwright reports `Executable doesn't exist at .../chromium_headless_shell-<n>`, the
installed browser build does not match the playwright package. Either run
`npx playwright install chromium`, or point `CHROME` at the build you already have:

```sh
ls ~/Library/Caches/ms-playwright/          # macOS
export CHROME="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell"
```

If `playwright is not installed` and you would rather not add `driver/node_modules`, point
`PLAYWRIGHT_MODULE` at any existing install:

```sh
export PLAYWRIGHT_MODULE=/path/to/some-project/node_modules/playwright
```

If the model endpoint answers `200` with an empty body, the run fails at step 0 with
`qwen-local failed: status 200:`. That is a proxy in front of the model server, not the
model. Check the server directly, and forward the port yourself rather than editing the
proxy:

```sh
ssh -N -L 1235:127.0.0.1:1234 <host>
export LLAMA_BASE_URL=http://127.0.0.1:1235
```

## Files

| file | what it is |
|---|---|
| `decision.cjs` | state construction and the policy. The bulk of the work. |
| `jev.cjs` | endpoint clients (classifier API, llama.cpp logprobs, chat fallback) |
| `run_level.cjs` | play one level |
| `run_full.cjs` | play the ladder, with an L0 regression gate |
| `config.cjs` | environment resolution |
| `physics.cjs`, `level_data.cjs` | constants mirrored from the game |
| `probe.cjs`, `dump.cjs`, `overlay_test.cjs` | inspection tools |
| `cadence.cjs` | how many frames one decision runs for, and when the model re-decides |
| `survey_levels.sh` | run levels in isolation, one row per level in `out/survey_<endpoint>.tsv` |
| `test_death_history.cjs` | the checks. `npm test` in this folder. |

The policy, the results, the dead ends and the open problems are in [`../docs/`](../docs/README.md).

## Licence

MIT, same as the game. See [`../license.txt`](../license.txt).

The model endpoints referenced in the endpoint table are third-party services with their own terms.
