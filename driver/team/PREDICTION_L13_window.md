# PREDICTION — L13 launch-window sentence

Written **before any code exists for this change**, per the supervisor's protocol: register the
falsifier first, in writing, or the measurement is not a measurement.

Change under test: a sentence in the scored MOVE text stating the x window from which the
objective gem is collectible, as `72..111`, computed rather than hardcoded.

Arm: `driver/decision.patched_l13window.cjs`, a copy of `decision.cjs`. `decision.cjs` and
`hop_points.cjs` stay at HEAD `898f5b2`.

---

## 0. THE NOISE FLOOR AT THE STATES THAT MATTER — measured first, because it sets the bar

Two DISTINCT L13 runs on the same build (`out/runs/run_level_13_halogen_13_20260927-000510.json`
and `out/run_level_13_halogen.json`, 447 entries each, identical in every trajectory field):

| measure | value |
|---|---|
| decisions with any `moveProbs` difference | **95 of 447 (21.3%)** |
| **argmax ever differs** | **0 of 447** |
| max abs delta on any `moveProbs` key | **0.088627** |
| deltas > 0.05 | 21 |
| deltas > 0.10 | 0 |

Run-to-run spread at the two probe states themselves:

| state | P(jump_right) run A | run B | **spread** | P(right) spread |
|---|---|---|---|---|
| x=59.5 | 0.8333961102721033 | 0.793890305023529 | **0.0395** | 0.0353 |
| x=63 | 0.8206312963128954 | 0.7776488312770488 | **0.0430** | 0.0387 |

Both states: objective `gem_a`, move `jump_right`, 21 grounded decisions each.

**Consequence, and it is the reason this file exists: the endpoint's own run-to-run spread on
P(jump_right) at the deciding state is 0.0430. Any threshold below that is indistinguishable from
the model answering the same question twice.**

**But the argmax never differs, 0 of 447. The argmax is therefore a zero-noise measurement and the
probabilities are not.** The falsifier is stated on the argmax for exactly that reason, with the
probability threshold as a secondary check against 0.0430.

---

## 1. WHAT WOULD COUNT AS THE SENTENCE WORKING

All three, at x=63 (and consistent at x=59.5):

1. **The argmax moves off `jump_right`.** This is the load-bearing condition. Zero-noise.
2. **It moves to `right`.** The walk toward the window. `right` already sits at 0.130-0.169, so
   there is somewhere for the mass to go that is the correct answer.
3. **P(jump_right) falls by more than 0.0430** — the measured run-to-run spread at this state — and
   P(right) rises correspondingly. A drop smaller than 0.0430 is noise and will be reported as
   noise, not as a partial result.

## 2. WHAT WOULD COUNT AS FAILURE

- **F1 — inert (the expected outcome, and the one this project has hit three times).** The argmax
  stays `jump_right` at both states. Probability moves of any size below 0.0430 are noise.
- **F2 — wrong destination (the ascent-crit failure mode, verbatim).** The argmax moves to `left`
  or `jump_left`, or the mass moves there. On the ascent crit the moved mass went to a third
  option (`gem_b`) rather than the intended one. This is the failure this falsifier exists to
  catch, because a P(jump_right) drop alone would hide it.
- **F3 — inconclusive.** The argmax moves to plain `jump`, which is neither the walk nor the
  launch, and the reason is not identifiable from one state.

## 3. WHAT IS NOT BEING CLAIMED

- **Not that the jump succeeds from inside the window.** The sentence will say only that the
  collect is *possible* from there. The laser state can still kill it and is not modelled. Saying
  more would be a false string, which is the `none` defect.
- **Not that the sentence generalises from two states.** Two states is the minimum that catches a
  one-state pass, which is the shape of the ascent-crit mistake. It is not a sample.
- **Not that this family works.** It is 1 clear success (the descent annotation, 3dc2a4c) against
  several inert results. Assume inert until measured.

## 4. A CORRECTION TO EARLIER WORK, made because it bears on how the falsifier is set

The two earlier probes in this family reported effect sizes against a null floor of exactly
`0.000e+0`:

- `none` on L3: P(none) 0.0021720 -> 0.0046709, delta **0.0025**
- `none` on L9: P(none) 0.0175212 -> 0.0272952, delta **0.0098**

**Both are below the 0.0886 run-to-run spread measured above.** Those deltas are real as
prompt-changes — the same build re-asked with an identical prompt does return 0.000e+0, which is a
different mechanism — but neither is evidence that the change would alter a level run. My earlier
phrasing, "real, and it is not a lever on any of them", overstated what the probe could support.
The accurate statement is that both changes moved the scored distribution by less than the
endpoint's own run-to-run spread, so **no wording in this family has yet been shown to move a run
at all.**

This does not retract the `none` change, which stands on correctness against
`updateCatSprite.ts:42` regardless of any run.

## 5. ORDER OF WORK

1. This file. **Done, before any code.**
2. `driver/decision.patched_l13window.cjs` — copy of `decision.cjs`, one added sentence, computed
   not hardcoded, true at every state where it appears.
3. Null control: unchanged build against itself, expect `0.000e+0`.
4. Two-state probe at x=59.5 and x=63, both arms, full move distribution plus argmax.
5. **Only if the probe moves the argmax, a level run.** Otherwise stop and report.
