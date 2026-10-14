# Bring your own decision model

Any model that answers the System One request shape (`POST /v1/systemone`) can play the game. The driver has a generic `systemone` endpoint for it, so you don't need to change any code: start your server, set two environment variables, and run the levels.

Before you try a model, check [the list of models already tried](results.md#decision-models-tried-typed-decisions-leaderboard-2026-10-09) in results.md. Gated models (any model that asks you to request access, automatic or not) are out of scope: the project only uses models anyone can download.

## What your server receives

Each decision is up to two calls (objective, then move). Both are a single `choice` question about a plain-text state:

```json
{
  "model": "<SYSTEMONE_MODEL>",
  "state": "Cat on floor y=290 x 40..120, at x=52. ...",
  "questions": {
    "move": {
      "type": "choice",
      "instructions": "Which key should the cat press now?",
      "criteria": {
        "left": "walk left, away from gem_a",
        "jump_right": "jump right, lands on the floor at y=250 next to gem_a"
      }
    }
  }
}
```

The question id is `objective` or `move`, and the option names change from call to call (the menu order is shuffled on purpose). The driver reads back, for each question, the chosen name and a probability for every option:

```json
{
  "answers": {
    "move": { "choice": "jump_right", "probabilities": { "left": 0.08, "jump_right": 0.92 } }
  }
}
```

The probabilities are not just for show: the policy samples from them at positions where the top answer already failed (see [architecture.md](architecture.md)), so a server that returns only the top choice won't work.

## Benchmark it on the whole ladder

One command plays the whole game (levels 0 to 13 in one run, up to 100 lives per level) once per seed, with the flag set that beat the game, and writes one comparable result:

```sh
npm run harness                                    # terminal 1: the game page on :5173
cd driver
SYSTEMONE_BASE_URL=http://127.0.0.1:8000 SYSTEMONE_MODEL=my-model npm run benchmark -- systemone
```

Seeds default to 1, 2, 3, 4 and 5, the leaderboard seeds; name others after the endpoint (`npm run benchmark -- systemone 9`) for your own tests. Each ladder takes about an hour on one GPU. The result lands in `out/benchmark/<endpoint>-<time>/benchmark.json`: for each seed, won or not, the last level reached, deaths per level, total deaths, steps, classifier calls, wall time, the model id and the stamped build. The last lines printed are the one-line summary and whether the result counts for the current version of the [leaderboard](benchmark.md).

A chat model works the same way through the `chat` endpoint, if its server returns `top_logprobs` for the first generated token and continues a trailing assistant message (llama.cpp's `llama-server` does):

```sh
CHAT_BASE_URL=http://127.0.0.1:8080 CHAT_MODEL=my-model npm run benchmark -- chat
```

## Run each level on its own

The sweep below runs each level in isolation on the older build every model in the leaderboard was compared on (`PRESET=none` plus seven flags), so its numbers stay comparable with that table.

```sh
npm run harness                                    # terminal 1: the game page on :5173
cd driver
export SYSTEMONE_BASE_URL=http://127.0.0.1:8000    # your server (no /v1 suffix)
export SYSTEMONE_MODEL=my-model                    # sent as "model", and stamped in the run file
# export SYSTEMONE_API_KEY=...                     # only if your server wants a bearer token

research/sweep_systemone.sh my-model 1          # all 14 levels, isolated, seed 1
research/sweep_systemone.sh my-model 2 3 6 11   # only levels 3, 6 and 11, seed 2
```

The sweep runs every level on the same build the other endpoints are compared on, and writes one line per level to `out/byom/<model>/s<seed>/summary.txt`, next to each level's log and run file (`run_level_<n>_systemone.json`, which records the model id, the seed and every build flag). A level takes from a few seconds to about half an hour, depending on how fast your server answers and how many decisions the level needs.

Run at least two seeds before you call a level cleared or failed: one run proves nothing here (see [method.md](method.md)).

If Playwright says `Executable doesn't exist at .../chromium_headless_shell-<n>`, point `CHROME` at the browser build you already have (the fix is in [driver/README.md](../driver/README.md)).

## Models with a different request shape

[`adapters/systemone_adapter.py`](../adapters/systemone_adapter.py) puts a model behind `/v1/systemone` when its own server or API takes something else. It has four backends today:

- `phocinae`: the `phocinae-server` engine (takes a list of options and returns a list of scores).
- `autojev`: the `autojev` `DecisionModel` that ships inside some model repos (Darwin-27B-ZTC, for example).
- `intern`: the `DecisionEngine` in the `inference.py` that ships with internlm's Intern-Decision models (2B and 4B). It needs no torchvision: the engine's image processor is only used for image requests, so the backend gives it the tokenizer instead.
- `bosun`: Hanno-Labs' Bosun, a PEFT adapter on a pinned Qwen base, loaded by the repo's own `BosunForDecision` (`trust_remote_code`). Download the base at the revision in its `config.json` into a Hugging Face cache, and serve with `HF_HOME` pointing at it and `HF_MODULES_CACHE` at a writable folder.

```sh
python adapters/systemone_adapter.py --backend phocinae --model-dir ./Phocinae-Largha-150M-v1 --port 8000
python adapters/systemone_adapter.py --backend autojev  --model-dir ./Darwin-27B-ZTC --port 8000
python adapters/systemone_adapter.py --backend intern   --model-dir ./Intern-Decision-2B --port 8000
python adapters/systemone_adapter.py --backend bosun    --model-dir ./bosun-v3.1-1.7b --port 8000
```

Adding a backend is one function that takes the state and the questions and returns one list of probabilities per question, in the order of its `criteria`. `python adapters/test_systemone_adapter.py` checks the request validation and the mapping with a stub backend (no torch needed).

## Check that the prompt fits

The states run to a few hundred tokens (up to 493 on level 0 with the Phocinae tokenizer), plus the question and the options. Some servers shorten a long input without saying so, and then the model decides on a state with the end cut off. Check your model's input limit, and turn off silent truncation where the server allows it (PurpleMIST's `serve.py` has `--no-truncate`).

To look at the exact prompts, set `PROMPT_DUMP=/path/to/prompts.jsonl` on a run: every call is appended as one JSON line.

## Running a model you don't fully trust

Model repos often ship Python code that runs when the model loads. We ran every model from the leaderboard in a Docker container that sees only the GPU and a read-only weights folder (no home folder, no tokens), with its port bound to localhost. This is the setup we used on an AMD Ryzen AI Max+ 395 (Radeon 8060S, `gfx1151`):

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --pre "torch==2.12.0a0+rocm7.13.0a20260411" --index-url https://rocm.nightlies.amd.com/v2/gfx1151/
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libnuma1 libelf1 libdrm2 libdrm-amdgpu1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "transformers>=5.19" peft safetensors huggingface_hub pillow fastapi uvicorn requests phocinae-server==0.1.5
RUN useradd -u 1000 -m sandbox
USER sandbox
WORKDIR /work
```

```sh
docker run --rm -it --device /dev/kfd --device /dev/dri --group-add "$(getent group render | cut -d: -f3)" --group-add "$(getent group video | cut -d: -f3)" \
  -e HF_HUB_OFFLINE=1 -e TORCHDYNAMO_DISABLE=1 \
  -v "$PWD/models:/models:ro" -v "$PWD/adapters:/adapters:ro" \
  -p 127.0.0.1:8000:8000 typed-decisions-sandbox \
  python /adapters/systemone_adapter.py --backend phocinae --model-dir /models/Phocinae-Largha-150M-v1 --host 0.0.0.0 --port 8000
```

Things we hit on that GPU:

- The stable PyTorch ROCm wheel (`2.13.0+rocm7.1` from download.pytorch.org) reports the GPU as available but segfaults on the first matmul. AMD's `gfx1151` nightly build above works.
- `TORCHDYNAMO_DISABLE=1` turns `torch.compile` off. Without it, Phocinae's engine fails at start-up because Triton needs a C compiler that the slim image doesn't have.
- `HF_HUB_OFFLINE=1` makes sure nothing is fetched at load time. Download the weights first, outside the container (`hf download <repo> --local-dir models/<name>`).

## Report your result

Add your model to the leaderboard section of [results.md](results.md): the model id, how it was served, the two `summary.txt` files, and the exact command. If your model clears a level that no other model clears, that is the interesting part, so please include the run file too.
