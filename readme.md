# AI plays Cat Goric

A language model plays [Cat Goric: Escape from the Warp Chamber](https://js13kgames.com/entries/cat-goric-escape-from-the-warp-chamber), my js13kGames 2021 entry (a 13kB game), and beats it.

[cat-goric-clef-seed1-8levels-2m30.webm](https://github.com/user-attachments/assets/2ddf13e1-ec1c-4002-9115-629147171ced)

The model never writes code and never makes a plan. At each decision it reads a text description of the game and answers two multiple-choice questions: which objective to go for, and which key to press. The driver presses the most likely key. That is the whole policy.

## Results

PurpleMIST-Flash-1.0 clears all 14 levels in one run. With the default settings it has done it at every seed tried (6, 7, 9, 11, 12 and 15 to 18), with up to 100 lives per level. What got it there was telling the model true facts at the moments it went wrong, never a pathfinder or a scripted move. Every run, and the ideas that did not work, are in [docs/results.md](docs/results.md) and [docs/dead-ends.md](docs/dead-ends.md).

## Try it

```sh
git clone --recurse-submodules https://github.com/felladrin/ai-plays-cat-goric.git
cd ai-plays-cat-goric
npm install
cd driver && npm install && npx playwright install chromium && cd ..
```

Start the game page in one terminal:

```sh
npm run harness
```

Then, with a PurpleMIST-Flash-1.0 server on port 8000, beat the game in another (about an hour on one GPU):

```sh
SYSTEMONE_BASE_URL=http://127.0.0.1:8000 SYSTEMONE_MODEL=PurpleMIST-Flash-1.0 driver/beat_the_game.sh 9
```

It ends with `won (reached level 14): true`.

## Your own model

Any model that gives a probability per answer works: through first-token logprobs on an OpenAI-compatible chat endpoint (llama.cpp, vLLM), or through a decision endpoint (`/v1/systemone`). [docs/bring-your-own-model.md](docs/bring-your-own-model.md) shows how to plug one in, and [driver/README.md](driver/README.md) lists every endpoint the driver knows.

To score it on the whole game, run `npm run benchmark` from `driver/`: [docs/benchmark.md](docs/benchmark.md) explains the score and how to add your result to the table.

If you know an open-weight model that could do this with fewer deaths, open an issue and name it.

## Licence

MIT, same as the game. See [`license.txt`](license.txt).
