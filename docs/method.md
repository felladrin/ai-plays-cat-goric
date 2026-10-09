# Method and traps

## The harness is not deterministic

Same build, same seed, three consecutive runs of level 2:

```
run 1: CLEARED, 5 deaths,  219 decisions, 1652 steps
run 2: failed,  12 deaths, 484 decisions, 3000 steps (cap)
run 3: failed,  10 deaths, 436 decisions, 3000 steps (cap)
```

Level 2 clears about one run in three on an unchanged build. Cleared against failed is inside the noise, so **a single run cannot distinguish two builds.**

The mechanism: the driver's RNG is seeded, but laser thickness is unseeded `Math.random()` redrawn every frame and the game collides against the sprite, and the death to death-history to escalation loop is a feedback amplifier. A tiny input difference gives a completely different run. An exact reproduction was observed once and wrongly generalised to "deterministic per build"; it was a coincidence of server state.

Levels whose route does not pass near a laser do reproduce (level 0 and level 8 each have a single distinct outcome across 17 and 20 archives).

**Method: N >= 3 runs per level per build, and compare clear rate. Never conclude from one run.** Levels are slow, 400 to 900 seconds each, so budget for it.

**On `clef`, the N runs must use different seeds.** The driver's RNG (menu order and exploration sampling) is `SEED`, default 12345, and Clef returns identical probabilities for an identical prompt. With the seed unchanged a run reproduces itself: level 6 ran twice per arm on 2026-10-07 and matched decision for decision (412 of 412, 383 of 383), so the only noise left was laser thickness, and level 6 does not feel it. Repeating a level without changing `SEED` measures one trajectory N times. Use `SEED=1`, `2`, `3`; the run file records the seed in `build.SEED`. The level-2 one-in-three figure above is from `halogen` and does not carry over.

## Scope runs by blast radius

Cost of a levels 0 to 4 sweep, by decisions (each decision is two model calls):

| Level | Decisions | Share |
| --- | --- | --- |
| 0 | 5 | 0.5% |
| 1 | 36 | 3.6% |
| 3 | 81 | 8.1% |
| 2 | 319 | 31.9% |
| 4 | 558 | 55.9% |

Levels 0 and 1 are 4% of the sweep and effectively free. The waste is re-running 2 and 3 (40%) when the change provably cannot reach them.

An offline firing sweep answers that in milliseconds: walk every floor of every level at walk-speed granularity, for every gem objective, and print which levels a prompt change fires on. A change whose firing profile is "level 4 only" cannot alter levels 0 to 3, and running them measures nothing.

Procedure: run the offline firing sweep first, then run the level being fixed plus any level the sweep says the change can reach. Full sweeps are for changes with no provable blast radius, which means anything touching `reachability.cjs`, the physics, or the runners, because those change the graph and the cadence globally rather than one prompt line.

Three times in one night a fix aimed at one level regressed another. Test the specific levels a change touches **before** spending hours on a full sweep. A sweep is for finding unknowns, not for validating a known-risky change.

## Replay before you run

`driver/experiments/probe_move.cjs` reproduces an archived decision offline, at 244 of 250 attempted decisions exactly. A prompt wording change is testable in seconds rather than by a 45-minute run.

**But a probe is blind to trajectory.** Re-scoring archived states cannot tell you which states the cat then reaches. A change touching only airborne text was observed deleting a *grounded* state from a run entirely. Arm D is the full version of this lesson: it moved 42 of 42 decisions exactly as the probe predicted, and the level got worse.

## Reading run archives

- **Never read a run archive without checking nothing is writing it.** They are written incrementally and a partial file reads as a dramatic result. Run `pgrep -f run_level.cjs` *before* the read. This caused three wrong conclusions in one night.
- **`PRE_<level>_` archives are the previous sample, not a baseline.** After a few variant runs they hold variant output. Copy anything you will cite to a named path immediately.
- **`TaskStop` and Ctrl-C kill the shell wrapper, not the `node` child.** A stopped sweep once left an orphaned `run_level.cjs` writing the same path as a new run, and the interleaved output was physically impossible (the cat moved from x=234 to x=50 between consecutive decisions, moving frames running 87, 0, 15, 44, 64). That result was discarded, not reasoned from. `survey_levels.sh` now refuses to start when a `run_level.cjs` is already running and traps INT / TERM to kill its own child.
- **`run.sh`'s `gemonly` EXIT trap does not fire** when the run is interrupted through a `tee` pipe. It leaves `decision.cjs` swapped to a variant with nothing running to explain it, which is exactly what the trap exists to prevent. It restores correctly on normal exit.

## The bug family: a value read before it has settled

Four bugs, all the same shape: the observer reads a game value in a window where it has not settled, and the driver acts on a stale number. Check for this family before blaming the model.

1. **The objective question was silently skipped.** A fallback made the driver pick the objective instead of asking the model, and nothing looked broken.
2. **`layaDecide` arity mismatch.** `deathHistory` landed in `jumpThreshold`, so jump coerced an array: empty gave 0 and always jumped, non-empty gave NaN and never jumped. Guarded now by `.length === 5` asserts plus a stub-client call-path test.
3. **`catMargins` silent `|| 0` fallback.** A missing `cat.height` collapsed head clearance to the feet margin. It now throws on non-positive height.
4. **`bridge.ts` over-reported alive gems.** `destroyGem` only sets `gem.ttl = 0` and does not remove the gem from the pool. kontra's `Pool.getAliveObjects()` is `objects.slice(0, size)` and never checks `ttl`, and `size` only shrinks in `pool.update()`. Between a collect and the next `pool.update()` a collected gem is still returned with its old coordinates, giving `matched=1 + collected=3 = 4`. Fixed by filtering `getAliveObjects().filter(g => g.ttl > 0)` in the snapshot and in the trace count. Do not call `pool.update()` from the bridge: it must stay read-only.

Related, and resolved: early deaths looked phantom because the log printed the state *after* the step, and `resetCurrentLevel` runs inside `updateCatSprite` on that same frame, so the logged coordinates were the post-reset spawn. Log the **pre-step** state. The detector was always correct. Do not revive the requestAnimationFrame theory: `gameLoop.stop()` sets `isStopped` and calls `cancelAnimationFrame`.

## The builder-lag class

A fact or a flush added to one of `buildMoveCall` / `buildLayaMoveCall` / `buildObjectiveCall`, or to one of `run_full.cjs` / `run_level.cjs`, and forgotten in the sibling. Four instances so far, plus `STALL_WINDOW` (see [open-problems.md](open-problems.md)).

Guards that exist: the structural test asserts all builders render all required facts, `run_stats.installFlush` is shared by both runners, and `cadence.cjs` was extracted after the same airborne-re-decide bug was found in both copies.

## Environment

### GPU contention is the single largest time sink

An overlay screenshot once showed a 61862ms decision latency. Three `qwen_local` calls measured directly: wall times 52s / 107s / 103s against actual inference of 569ms / 720ms / 1769ms, so **about 98% of every decision was model loading, not inference.**

The cause is structural: one GPU, two large models served by the same llama-swap instance. Each game decision to one model evicts the other, and each message to an agent running on the other model pulls it straight back. A cold start is a 68 GiB read off disk.

Uncontended, a decision is about 1 second. The 52 to 107s figures are the contended case and must never be quoted as the model's speed.

**Resolution: do not run two different models through llama-swap at the same time.** Same-model concurrency is fine, since there is no reload. The model server allows 4 concurrent sessions and more just queues. Do not fix this with an `evict_costs` entry, which only moves the starvation to the other model.

### Playwright

- If Playwright reports `Executable doesn't exist at .../chromium_headless_shell-<n>`, the installed browser build does not match the playwright package. Either run `npx playwright install chromium`, or point `CHROME` at the build you already have.
- A headed browser needs the **full** Chromium, not `chrome-headless-shell`, which cannot run headed.
- `PLAYWRIGHT_MODULE` points at any existing playwright install, if you would rather not add `driver/node_modules`.

### Installing

- `npm ci` fails `EALLOWGIT` (`rollup-plugin-kontra` resolves `preprocess` over git+ssh). `npm install --omit=dev` fails `ERESOLVE`, which is pre-existing: `vite-plugin-singlefile@0.6.3` wants peer `vite@^2.7.10` and the root pins `~2.5.10`. Never mutate `package.json` or `package-lock.json` to work around this.
- Postinstall scripts blocked means esbuild ships without its binary. Fix with `node node_modules/esbuild/install.js`.
- `tweakpane` is required because `main.ts` dynamically imports `devPanel` under DEV and vite's scanner treats a missing dep as fatal.
- Bare `import ... from "kontra"` resolves fine without `rollup-plugin-kontra`, since the package ships `module: kontra.mjs`.

### Miscellaneous

- A large viewport is safe: `fitCanvasInsideItsParent` only sets CSS `style.*` and never `canvas.width/height`, so game geometry is unaffected.
- If the model endpoint answers 200 with an empty body, the run fails at step 0 with `qwen-local failed: status 200:`. That is a proxy in front of the model server, not the model. Forward the port yourself rather than editing the proxy.
- halogen-flash-server before 0.13.8: `top_logprobs` is unimplemented, `logprobs: true` alone is refused when decoding greedy, and a trailing assistant message is ignored so the server answers freely instead of continuing it. Filed as [halogen-flash-server#100](https://github.com/peonist-ai/halogen-flash-server/issues/100). On the menu-letter path, `max_tokens: 1` truncates the answer to its first token ("To") and loses the letter, so 8 is the value and the parser must refuse ambiguity rather than pick by menu order.
