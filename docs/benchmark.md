# Benchmark your own model

The benchmark plays the whole game (levels 0 to 13 in one session) with your model making every decision, and writes one result you can compare with other models.

## Run it

You need a model server that gives a probability for each answer. Two kinds work without code changes (the request shapes are in [bring-your-own-model.md](bring-your-own-model.md)):

- A decision server that answers `POST /v1/systemone`.
- An OpenAI-compatible chat server that returns `top_logprobs` for the first generated token and continues a trailing assistant message (llama.cpp's `llama-server` does).

Start the game page in one terminal:

```sh
npm run harness
```

Then run the benchmark from `driver/` in another:

```sh
SYSTEMONE_BASE_URL=http://127.0.0.1:8000 SYSTEMONE_MODEL=my-model npm run benchmark -- systemone
CHAT_BASE_URL=http://127.0.0.1:8080 CHAT_MODEL=my-model npm run benchmark -- chat
```

It plays one ladder per seed (6, 7, 9 and 11 by default; pass others after the endpoint name, e.g. `npm run benchmark -- systemone 9`). On one GPU, a ladder takes about an hour with PurpleMIST-Flash-1.0.

## What the score means

For each seed, the result says:

- **won**: the cat reached the victory screen after level 13.
- **last level**: where the run ended (14 on a win).
- **deaths per level**, and the total. A level stops the run after 100 deaths.
- **steps, classifier calls and wall time**: how much play and how many model calls it took.
- **model and build**: the model id and every flag that shaped the prompt, so a result always names what produced it.

The headline is the number of seeds won. Between two models with the same number of wins, fewer total deaths is better.

The result is in `out/benchmark/<endpoint>-<time>/benchmark.json`, and the last line printed is the one-line summary, for example:

```
my-model (systemone, preset winning): won 2/4 seeds [s6 L10, s7 won, s9 L11, s11 won], 251 deaths in total
```

## A fair comparison

Two results compare only when they used:

- **the same preset** (the `build.PRESET` field; the default is `winning`),
- **the same seeds**, because a seed changes the menu order and the exploration draws, and
- **the same caps** (100 deaths per level, 150,000 steps in total, the defaults).

Keep in mind that the preset was tuned on PurpleMIST-Flash-1.0's answers: each prompt fact was added where that model went wrong. So another model starts at a disadvantage, and a lower score does not always mean a weaker model. `PRESET=none` runs the bare baseline, if you want a comparison without that bias.

## Results

PurpleMIST-Flash-1.0, served by its own `serve.py --no-truncate` on the `systemone` endpoint, with the winning preset and up to 100 deaths per level. Every number is from a run file recorded in [results.md](results.md#game-beaten-purplemist-flash-10-clears-l0-l13-in-one-ladder-2026-10-12).

| Seed | Outcome | Total deaths | Steps | Classifier calls |
| --- | --- | --- | --- | --- |
| 9 | won | 45 | 19,098 | 2,647 |
| 11 | won | 133 | 32,350 | 4,502 |
| 7 | won | 30 | 13,640 | 1,910 |
| 12 | won | 46 | 14,132 | 2,081 |
| 13 | won | 33 | 13,836 | 2,100 |
| 14 | won | 50 | 19,880 | 2,755 |
| 15 | won | 50 | 18,150 | 2,749 |
| 16 | won | 76 | 29,052 | 4,042 |
| 6 | lost on level 10 (death cap) | 120 | 26,002 | not recorded |

Eight seeds won out of nine. An earlier SEED 9 ladder also won, with 72 deaths, on a build that differed in one flag (`LAND_LATE=1`). Every other model in the project has been measured only on isolated levels so far, so none of them is in this table yet.

## Submit a result

Open a pull request that adds your row to the table above and your entry to [results.md](results.md). Include:

- the model id, and how you served it (server, version, quantization),
- the exact command,
- the `benchmark.json` file (attach it to the pull request).
