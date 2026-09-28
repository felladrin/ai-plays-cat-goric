# Probe A/B: the descent annotation at L11 (185,187) objective gem_c

Every other A/B this session has a file in `out/runs/`. This one did not, and the
probe vector came from live model calls that a run would have invalidated. Written
out before the annotation run, with both vectors and the commands that produced them.

## Why this state

L11 fails: 314 decisions, 3000 steps, 7 deaths, 2 gems, `won=false`, `stalled=false`
— it hits the step ceiling exactly. Archive
`out/runs/PRE_L11_run_level_11_halogen_20260927-034150.json`, par log
`out/runs/PRE_L11_par_L11_flash_20260927-034150.log`.

The failure localises to a fork on the y=187 floor. That run spans x 181..233. Its
LEFT end (x181) steps off onto the y=231 run (145..197), which carries gem_c at
x=191. Its RIGHT end (x233) steps off onto the y=228 run (222..274), which does not.
`(185,187,gem_c)` is the most-visited state in the run at 23 visits, and the cat
took `right` eight times and `left` never. The prompt describes both ends
symmetrically; the objective line pulls 6px right; the model answers `right` 0.687
to `left` 0.071.

## The vector

State: L11, cat (185,187), objective `gem_c`, `mf=36`, `deathHistory` empty.
Par log `priorDeaths=0` at this decision, so no death note can reach the prompt —
verified by the probe's own provenance block, not assumed.

| move | archived (no clause) | with descent annotation | delta |
|---|---|---|---|
| **left** | 0.07114207999157834 | **0.6339463378708202** | **+0.563** |
| **right** | 0.6868605613102321 | **0.0020375591782942843** | **−0.685** |
| jump_left | 0.1266060129321128 | 0.35760056035010823 | +0.231 |
| jump_right | 0.10646869561953244 | 0.0005761977335819222 | −0.106 |
| jump | 0.008922650146544503 | 0.005839344867195456 | −0.003 |

**argmax `right` → `left`.** `left` is the correct move: walk to x181, step off the
left end, land on the y=231 run, collect gem_c at x191. `right` fell 99.7% — an
inversion, not a nudge.

## The other vector, and why it is in this file

`d108` sits at cat **(151.75, 231)** — on gem_c's own floor, not at the fork. It is
the control. The descent annotation must be **silent** there, so its numbers isolate
what the refactor did to the shipped floor sentence:

| move | live build `67ba8116` | with annotation | identical? |
|---|---|---|---|
| **right** | 0.9996103165355856 | 0.9996103165355856 | yes |
| jump_right | 0.0002126779644531596 | 0.0002126779644531596 | yes |
| left | 0.00014219980096057903 | 0.00014219980096057903 | yes |
| jump | 0.00002895795984380408 | 0.00002895795984380408 | yes |
| jump_left | 0.000005847739156982451 | 0.000005847739156982451 | yes |
| argmax | right | right | yes |

This vector is reproduced byte-for-byte across the `targetOverlapsFloor` refactor,
which is what licenses calling that refactor a pure refactor. `right = 0.9996` at
d108 is a **probe** figure. It appears in no par log, because the par log's
`step` lines do not carry per-move distributions — only the `move=` lines carry
`mode=` and `T=`.

## Commands

```
export LLAMA_BASE_URL=http://127.0.0.1:1235      # lvl.sh exports this; 1234 answers 200 with an empty body
A=out/runs/PRE_L11_run_level_11_halogen_20260927-034150.json
P=out/runs/PRE_L11_par_L11_flash_20260927-034150.log

cp driver/decision.cjs /tmp/decision.live.bak
cp driver/decision.patched_descent.cjs driver/decision.cjs
node driver/experiments/probe_move.cjs --run "$A" --parlog "$P" --decision 4     # (185,187)
node driver/experiments/probe_move.cjs --run "$A" --parlog "$P" --decision 108   # control
cp /tmp/decision.live.bak driver/decision.cjs
```

`probe_move.cjs` refuses to run without `--parlog` (or `--assume-empty-death-history`)
because `priorDeaths` is otherwise unknown and `deathHistory` cannot be shown empty.
It also refuses without `LLAMA_BASE_URL` set, deliberately: port 1234 answers 200
with an empty body, so a default turns a wrong port into a silent failure instead of
a startup error.

## What the offline assertion established, before the probe ran

`carriesTarget` for the two ends, from L11's own numbers (gem_c at (191,212),
cat.height 18, `GEM_HALF_HEIGHT` 8):

```
LEFT  landing 145..197 @ y231 : x 191 in span, 231-212=19 <= 26, 231 >= 204  -> TRUE
RIGHT landing 222..274 @ y228 : x 191 NOT in 222..274                          -> FALSE
ends differ -> gate open
```

**The x containment is load-bearing. The y test does not discriminate.**
`targetOverlapsFloor` returns true for BOTH landings: 231−212=19 ≤ 26 and 228−212=16
≤ 26, and both ≥ 204. What separates the ends is that gem_c's x=191 is inside
145..197 and outside 222..274. The y fix was *necessary* — a symmetric ±8 test made
the left end false, both ends agreed, the gate stayed shut and the sentence never
appeared on the one level it was written for — but it is not what decides. Do not
tune the vertical bound expecting it to do the deciding.

## What this does and does not establish

It establishes that the sentence inverts the argmax at the fork toward the correct
move, on the model as it stands today, at one state. It does not establish that the
cat escapes: the annotation is upstream of the escape hatch, and at this state
`left` leads `right` by roughly 300:1, so sampling cannot plausibly undo it.

**The hatch already took `left` here and the cat still did not escape.** Across the 23
visits to `(185,187,gem_c)` the cat took four distinct moves — right, jump_left,
jump_right, left. So the correct move was available, was sampled, and was not
sufficient. If the annotated run does not clear L11, the next thing to look at is
what happens *after* the left descent, not the fork.
