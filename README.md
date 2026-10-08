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
git clone --recurse-submodules https://github.com/felladrin/ai-plays-cat-goric.git
cd ai-plays-cat-goric
npm install
cd driver && npm install && npx playwright install chromium
```

A clone without `--recurse-submodules` leaves `cat-goric-game/` empty. Run `git submodule update --init --recursive` to fix that.

## Run

Requires a model endpoint that returns next-token logprobs. The requirement is an
OpenAI-compatible `/v1/chat/completions` that (1) returns `top_logprobs` for the first
generated token when asked with `logprobs: true, top_logprobs: n`, and (2) continues a
trailing assistant message, so the answer can be read as the next token. llama.cpp's
`llama-server` and vLLM both qualify (vLLM needs `continue_final_message: true`, which the
endpoint table shows how to pass). Many hosted APIs omit first-token top-logprobs; check
before pointing the driver at one. The `qwen_local` entry in `driver/run_level.cjs` is the
template for adding an endpoint.

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

8 of the 14 playable levels clear at two seeds each on the best endpoint (0, 1, 2, 5, 7, 8, 9, 10), and level 4 at one seed of two. Four have never cleared on any build (6, 11, 12, 13). The victory screen has been reached, but not by clearing all 14: a demo run plays the solid levels back to back and skips the ones that don't pass, so the recording ends on `CATEGORIC ESCAPE!` without pretending the rest were won. The skip is opt-in and logged, see [`driver/README.md`](driver/README.md).

[`docs/`](docs/README.md) holds the condensed documentation: the rules the project is judged by, how a decision is built, the verified game facts, the per-level results and which baselines bear weight, the ideas that are measured dead, the open blocker, and how to measure here without wasting a night. The negative results are the interesting part, and [`docs/dead-ends.md`](docs/dead-ends.md) is where they are.

[`driver/README.md`](driver/README.md) has the endpoint table and the operating instructions. The original session logs are kept in git history rather than the tree, with an index; [`docs/README.md`](docs/README.md) says how to read them.

If you know an open-weight model that could clear more of this, open an issue and name it. The only interface requirement is next-token logprobs over the answer labels.

## Recording

The [releases page](https://github.com/felladrin/ai-plays-cat-goric/releases) carries a single-take recording of the eight clearing levels (8m55s) and a 2:33 cut of the same take. The cut is a variable-speed timeline rewritten at the muxer, so the frozen stretches (the game waits while the model decides) play fast-forward and no frame is dropped.

## Licence

MIT, same as the game. See [`license.txt`](license.txt).

The model endpoints in the table are third-party services with their own terms.
