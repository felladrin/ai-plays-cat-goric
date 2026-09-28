# PREDICTION — L13 fall-state sentence (probe only)

Registered BEFORE the variant is built. No endpoint call has been made against the patch.

## What is being tested

On current HEAD (`898f5b2`, `decision.cjs` md5 `46f12d914a49f02c6d34828a0a539af6`),
L13's only death is one fall repeated 22 times in 552 decisions. The cat launches a
gem_a arc, and 6 consecutive airborne decisions later is dead at (154, 278.6, dy 8).
It is 22 of 22 deaths, the same frame state every time.

**Measured remedy: holding `left` instead of `right` on that same fall reaches
y=249 at x=108.5, which is inside floor(59..111@249, and the cat lands.** The arc
was already committed before this fact was knowable.

The sentence would live in the shared airborne move criteria, naming the floor below
and the gap. States, from `out/run_level_13_halogen.json` (552 decisions, 22 deaths,
2 gems — the traced HEAD run, the same build the sentence would be tested against):

| state | cat | dy | objective | move menu | archive move |
|---|---|---|---|---|---|
| A | (126.00, 198.60) | +1.6 | gem_c | left / right / none | right |
| B | (136.50, 216.60) | +4.0 | gem_c | left / right / none | right |

Population: 110 airborne decisions within 12px x / 25px y of (127,200), in five
per life at indices 17-21, 42-46, 67-71, ..., a 25-decision cycle. A and B are the
first two of one such group, one and three decisions apart.

**Both numbers for decision 19 are right, and my first explanation of the difference
was wrong.** The order named (127.75, 200.6) dy 2.0; I measured (126.00, 198.60)
dy +1.6 and wrote that the order's figure came from the PRE-arc-fix trace. It does
not. They are **adjacent frames of the same decision 19** in the one and only L13
trace file (the HEAD run from 19:03): the order quoted the frame 16 before the first
death, I quoted the decision's first frame. Nothing stale, nothing from another
build. A is the first frame, because that is what the model is actually shown.
The population was specified as 66; measured 110 within the band stated above. The
two counts use different windows (his x 120..135, y 195..210; mine 12px x / 25px y
around (127,200)) over the same data, and both are correct.

## THE FALSIFIER — stated on the argmax

The argmax is the zero-noise measurement: run-to-run `moveProbs` differ on 21.3% of
decisions with max abs delta 0.088627, while the argmax never differs (0 of 447).
So **the verdict is the argmax, and probabilities are read against 0.0886 only as
support.**

- **WORKS** — at BOTH A and B: argmax moves off `right`, and to `left`.
- **F1 half** — argmax moves to `left` at exactly one of A or B. Reported as a half,
  not a pass. This is the L8 outcome and the single most likely result.
- **F2 inert** — argmax stays `right` at both. Reported as inert. Any probability
  delta below 0.0886 is noise and is reported as noise.
- **F3 wrong destination** — argmax to `none` at either state. `none` freezes the
  cat, which does not survive the fall either, so this is the `ascentCost` failure
  mode: the mass moved somewhere that is not the remedy.
- **F4 control moves** — the L8 control state's argmax moves. The sentence fires in
  shared airborne criteria, so this would be collateral and is reported as a
  regression of the change regardless of A and B.

**Controls run before anything is read as a result:**
1. Null control: baseline arm against itself, expected 0.000e+0, both states.
2. L8 control state, same sentence, same level as the L13 probe: expected INERT.
   L8 is a clearing level and this sentence is not for it. If it moves there, F4.
3. Guard check: the sentence must be silent when no floor lies below within the
   fall, and must not fire on grounded decisions.

**Falsifier for the guard, on my own code:** dump the patched criteria at a grounded
L13 decision and at an airborne L13 decision with nothing below, and confirm absence.
A sentence that fires where it should not is worse than an inert one, because it is
harder to see.

## NOT CLAIMED

Not claimed: that the probe predicts a level run. The window sentence's offline
probe passed at 0.8227 and its run effect was entirely the arc fix's. A probe
result here licenses a run; it does not predict one.
Not claimed: that a passing probe fixes the family. The record going in is one for
four, and the one success is withdrawn as a run effect.
Not claimed: which laser or bound kills the cat. L12's mechanism is bounded but
undetermined, and this is L13, a different level.

## The fact already in the prompt, which makes this harder than the window was

At state A the move state text already reads:

    next platform: left nothing, right nothing

The deciding fact is PRESENT and the model chooses `right` six times running. So if
the sentence works it is not because it supplied something the prompt lacked. It
would have to beat an existing, correct, already-scored statement. I am writing that
in now rather than after the result, because it is the most likely explanation for
an F2 and it must not be discovered afterwards as an excuse.

## STATE C — the guard, found on a real archive (added before any result)

The sentence is silent when the cat is already inside the floor's x span. That guard
cannot be tested on L13 at all: **zero** airborne falling decisions on L13 have the
cat inside the nearest floor's x span. Every airborne decision on L13 is already past
the platform — the same shape as its single death, which falls right past the only
floor beneath it. So the guard is untested on the level that motivates it, and a
synthetic state is not evidence.

The state therefore comes from another level's archive. Scanning every
`out/runs/*run_level*.json` with a non-empty log and a numeric `levelIndex` for
airborne, falling decisions whose x is inside the nearest floor's span found **41**,
on L3 (33), L5 (1), L9 (4) and L10 (3). Zero on L13 and on every other level.

| state | cat | dy | objective | floor below | archived argmax | level |
|---|---|---|---|---|---|---|
| C | (54.25, 108.8) | +2.8 | gem_a | 14..66 @ 111 | `left` 0.6639 | L5 |

Chosen because it is the only one of the 41 that is a **passing level and
mid-decision**: 0.6639 is nowhere near saturation, so the state is genuinely
undecided and the measurement can actually inform. It doubles as the order's
passing-level control, because if the guard suppresses the sentence the delta is
exactly 0.000e+0 and the argmax cannot move — one probe covers both asks.

**C is a guard test, not a fix test.** The registered expectation for C is INERT —
the argmax stays `left` and the delta is 0.000e+0. If C's argmax moves, the guard
leaked and the sentence is asserting a false fact in a state where it must be silent,
which is a worse outcome than F2 because the text is wrong rather than merely
ineffective.

Alternates if C proves unusable: L3 dec 141 (245.25, 228) dy 5.2, argmax `left`
0.9611 · L3 dec 340, argmax `left` 0.8825, archived move `none` · L9 dec 36
(177, 157.8) dy 2.8, argmax `right` 0.9728 · L10 dec 26 (309, 286.8) dy 8.8, argmax
`none` 0.4470.

---

## ADDENDUM — the blast-radius state, registered BEFORE measuring (supervisor's constraint)

The original state C was a state where the guard is SILENT. He rejected it as evidence: "A silent
state proves nothing about blast radius - the sentence is silent almost everywhere." A state that
was already 0.000e+0 before the fix cannot get worse, so the logic said C was safe, and he declined
to accept an inference in place of a measurement on the grounds that exactly that kind of inference
cost him the L13 window result.

**Constraint honoured: a state on L5 where the guard FIRES, on a level that clears.**

Search: all L5 archives in `out/runs/`, every airborne decision confirmed descending from the
trajectory (`e.dy` is ABSENT from the L5 archive schema, so falling-ness is read from the next
decision's y, not from a field that does not exist). **594 airborne decisions, 224 descending,
33 states where the FIXED variant fires.** L5 is not a level where this thing is silent.

**CHOSEN — C-prime = `out/run_level_5_halogen.json` dec 64** (98 entries; EXACT par-log pairings
`par_L5_flash_5_20260926-213309` and `par_L5_flash_5_20260927-134300`, both 98 lines):
`cat(190.75, 201.6)`, airborne, descending to y 226.8, obj `gem_b`, archived move `right`,
**argmax `right` at p=0.5881**, sentence annotates **`left`**.
Chosen because it FIRES, because 0.5881 is far from saturation, and because the sentence names the
OPPOSITE of the choice the model is currently making — so both outcomes are informative and neither
is a foregone conclusion.
Alternatives found and not chosen: dec 33 `cat(169.75,152.6)` argmax `none` 0.5518 (annotates
`left`); dec 63 `cat(185.5,180)` argmax `right` 0.9893 (saturated, annotates `right`).

**Registered falsifier, stated on the ARGMAX because that is the zero-noise measurement:**
- **WORKS** = argmax flips to `left`. The sentence does on a clearing level what it did on L13.
- **INERT** = argmax holds `right`. The sentence fires on a working level and changes nothing. This
  is the SAFE outcome and is the one a blast-radius probe should mostly expect.
- **HARM** = argmax moves to `none`, or anywhere other than `right` or `left`.
- Probability deltas below **0.088627** are noise and will be reported as noise, never as a partial
  pass. A delta above it with the argmax fixed is a re-ranking, not a decision.

**Not claimed in advance:** that INERT is the same as "the sentence is correct here" - a level can
be unharmed by a false sentence for a long time. **Provenance note: this archive is stamped 13:43,
which PREDATES the arc fix `898f5b2` at 13:53.** For a move probe that does not confound the
comparison - both arms are asked the same prompt at the same archived state - but it is recorded
because an archive's timestamp against the commits it baselines has caught three false results in
this project.
