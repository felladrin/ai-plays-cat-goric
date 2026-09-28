# AI plays Cat Goric

A language model plays [Cat Goric: Escape from the Warp Chamber](https://js13kgames.com/entries/cat-goric-escape-from-the-warp-chamber), my js13kGames 2021 entry (a 13kB game).

The model never writes code and never emits a plan. Every frame-group, it gets a text description of the game state and answers two multiple-choice questions. The driver reads the probability distribution over the allowed answers and presses a key. That is the whole policy.

## Layout

| Path | What it is |
| --- | --- |
| `cat-goric-game/` | The game, as a git submodule pinned to the archived upstream commit |
| `bridge/bridge.ts` | Puts the live game singletons on `window.bridge`. No game logic, no decisions |
| `harness.html` | The page the driver drives: game on the left, decision panel on the right |
| `harness.vite.config.cjs` | Plugin-free dev config, so the game's own `vite.config.ts` stays untouched |
| `driver/` | The policy, the endpoint clients, the runners, and the working log |

The game is read-only by construction. The upstream (`felladrin/js13k-2021`) was archived on 2023-01-23 and rejects pushes, so nothing in this repo can change it.

## Setup

```sh
git clone --recurse-submodules git@github.com:felladrin/ai-plays-cat-goric.git
cd ai-plays-cat-goric
npm install
cd driver && npm install && npx playwright install chromium
```

A clone without `--recurse-submodules` leaves `cat-goric-game/` empty. Run `git submodule update --init --recursive` to fix that.

## Run

Requires a model endpoint that returns next-token logprobs. Any llama.cpp server works.

```sh
# terminal 1: the harness
npm run harness                     # http://127.0.0.1:5173/harness.html

# terminal 2: the driver
cd driver
LLAMA_BASE_URL=http://127.0.0.1:1234 node run_level.cjs qwen_local 2
```

Or the whole ladder with `node run_full.cjs qwen_local`.

## Checks

```sh
npm test                            # runs the driver's assertion suite
```

## Results, and the wrong turns

The driver README keeps the endpoint table, including the negative results, which are the interesting part. [`driver/README.md`](driver/README.md) has the policy and the traps; [`driver/HANDOVER.md`](driver/HANDOVER.md) has the working log, wrong turns included.

## Licence

MIT, same as the game. See [`license.txt`](license.txt).

The model endpoints in the table are third-party services with their own terms.
