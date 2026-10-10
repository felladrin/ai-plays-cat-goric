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

```sh
# terminal 1: the harness
npm run harness                     # http://127.0.0.1:5173/harness.html

# terminal 2: the driver
cd driver
node run_level.cjs <endpoint> <level>     # one level, e.g. node run_level.cjs qwen_local 2
node run_full.cjs <endpoint>              # the whole ladder
```

The driver speaks two model interfaces, and every endpoint is one of them:

- **Chat completions with a first-token distribution.** An OpenAI-compatible `/v1/chat/completions` that returns `top_logprobs` for the first generated token when asked with `logprobs: true, top_logprobs: n`, and continues a trailing assistant message, so the answer is read as the next token.
- **System One decisions.** `POST /v1/systemone` (or `/v1/classifier`) with `{state, questions}` returns a probability for each option in one forward pass. This is the native format of purpose-built decision models.

### Model options

| Model | Interface | Start the server | Run the driver |
| --- | --- | --- | --- |
| Any GGUF on llama.cpp | chat | `llama-server -m model.gguf --port 1234` | `LLAMA_BASE_URL=http://127.0.0.1:1234 node run_level.cjs qwen_local 2` |
| Decision GGUFs on llama.cpp b11361+: [Clef](https://huggingface.co/ggml-org/Clef-GGUF), [OpenJev](https://huggingface.co/ggml-org/OpenJev-GGUF), [Kev-4B](https://huggingface.co/ggml-org/Kev-4B-GGUF), [lev](https://huggingface.co/ggml-org/lev-GGUF), [Laya](https://huggingface.co/ggml-org/Laya-GGUF), [Julia-1](https://huggingface.co/ggml-org/Julia-1-GGUF) | systemone | `llama-server -m Clef-GGUF.gguf --port 1234` | `SYSTEMONE_BASE_URL=http://127.0.0.1:1234 SYSTEMONE_MODEL=clef node run_level.cjs systemone 2` |
| Any other System One server (PurpleMIST's `serve.py`, or [`adapters/systemone_adapter.py`](adapters/systemone_adapter.py) for Phocinae and Darwin-ZTC) | systemone | see [docs/bring-your-own-model.md](docs/bring-your-own-model.md) | `SYSTEMONE_BASE_URL=http://127.0.0.1:8000 driver/experiments/sweep_systemone.sh <id> 1` |
| vLLM | chat | serve the model; the request needs `continue_final_message: true` (the client's `extraBody`, see the `halogen` entry) | `LLAMA_BASE_URL=http://127.0.0.1:1234 node run_level.cjs qwen_local 2` |
| Clef, hosted Decisions service — current best: 8 of 14 levels at two seeds | systemone | set `DECISIONS_BASE_URL` and `DECISIONS_API_KEY` | `node run_level.cjs clef 2` |
| Qwen3.8-27B-classifier hosted on Featherless | classifier | set `DEMO_BASE_URL` | `node run_level.cjs demo 2` |

`llama-server` serves the model it loaded whatever model name the request carries, so trying a new GGUF needs no code change. Many hosted chat APIs omit first-token top-logprobs; check before pointing the driver at one. The endpoint table in [`driver/README.md`](driver/README.md) lists every entry and its environment variables; the `qwen_local` and `clef` entries in `driver/run_level.cjs` are the templates for adding one.

## Checks

```sh
npm test                            # the whole driver suite (one suite is red by design and pinned)
```

## Results, and the wrong turns

8 of the 14 playable levels clear at two seeds each on the best endpoint (0, 1, 2, 5, 7, 8, 9, 10), and level 4 at one seed of two. Two have never cleared on any build (12, 13); level 6 first cleared on 2026-10-09, at both seeds, on PurpleMIST-Flash-1.0, and level 11 on 2026-10-10, at one seed of two, on Darwin-27B-ZTC (see [docs/results.md](docs/results.md)). The victory screen has been reached, but not by clearing all 14: a demo run plays the solid levels back to back and skips the ones that don't pass, so the recording ends on `CATEGORIC ESCAPE!` without pretending the rest were won. The skip is opt-in and logged, see [`driver/README.md`](driver/README.md).

[`docs/`](docs/README.md) holds the condensed documentation: the rules the project is judged by, how a decision is built, the verified game facts, the per-level results and which baselines bear weight, the ideas that are measured dead, the open blocker, and how to measure here without wasting a night. The negative results are the interesting part, and [`docs/dead-ends.md`](docs/dead-ends.md) is where they are.

[`driver/README.md`](driver/README.md) has the endpoint table and the operating instructions. The original session logs are kept in git history rather than the tree, with an index; [`docs/README.md`](docs/README.md) says how to read them. [`agents.md`](agents.md) is the pointer file for AI coding agents.

If you know an open-weight model that could clear more of this, open an issue and name it. The only interface requirement is a probability per answer label, from first-token logprobs or from a decision endpoint.

## Licence

MIT, same as the game. See [`license.txt`](license.txt).

The model endpoints in the table are third-party services with their own terms.
