# PREDICTION — does the corrected `none` string move P(none)?

Written before the probe. No endpoint call has been made against `decision.patched_lockonly_none.cjs`.

## Why a probe and not a level

L9 is bimodal — it cleared on 2026-09-26 19:04 (2 deaths, 107 dec, 1313 steps) and
failed on 2026-09-27 07:48 (7 deaths, 288 dec, 3000 steps) — and the `none` run
cleared too, differing from the first clear by three decisions. A single run
cannot attribute anything on a bimodal level. `none` was chosen 0 of 43 airborne
decisions, so the mechanism was never exercised in a level run at all.

## The state, chosen by measurement not by hand

Scanned with `simulate` (which derives `dx` exactly as the game does,
`arc.cjs:63`, so action `"none"` is the drift-free fall with no new physics) over
every airborne decision of `out/runs/PRE_L3_run_level_3_halogen_20260927-142805.json`:
**55 of 278 airborne decisions have the held action ending in `laser` while `none`
lands.** Ranked by drift, the top 8 are the same state, repeated by the L3 death
loop. Index 12, the first occurrence:

```
cat(250.5, 134)  dy=-5.6  mf=172  objective gem_c  move left
  held left -> laser  in 43 frames, ending (175.25, 271.6)
  none        -> landed in 30 frames, ending (250.5, 152)     drift 75.25px
```

Three properties make it the right test. The cat is **RISING**, so the new
string's "up or down unchanged" is exercised in exactly the state where a vertical
claim would be false — 51.2% of airborne decisions are rising. `none` lands it on
`floor(230..282@152)`, the platform it launched from, 18px below. And the held
action does not merely underperform, it kills the cat 75px away.

## The arms — one variable

`driver/decision.patched_lockonly_none.cjs` is a copy of
`decision.patched_lockonly.cjs` with exactly the two `none` string literals
changed. Verified by diffing both files with comment lines stripped: two lines,
both the literal. The lock is present in both (10 `lockedObjective` occurrences
each) and both require `hop_points.patched`.

This pair is deliberately NOT `decision.cjs` vs `decision.patched_none.cjs`. The
archive's decisions were generated on the lockonly build, and `patched_none` is a
copy of `decision.cjs` and does not contain the lock — pairing those would vary
the string AND the lock, which is the confound class this project has now paid for
three times (tick 261 baselines, tick 276 two-variable L3, and the L10 baseline
that is still open).

Baseline md5 `6b439e1104ebc58e975cc8c4330b186e` is byte-identical to the swap
marker recorded for the run that produced this archive, so the baseline arm is the
build those decisions came from and the probe can verify it reproduces them.

## Threshold

The measured null control: **0.000e+0**. The endpoint has returned exactly zero
noise for an identical prompt across every session today.

## Predictions

**P-A — P(none) rises above the null floor.** The corrected string removes a false
claim, and the model is offered the option in a state where the old string
described the opposite of what happens.

> Falsifier: max abs delta 0.000e+0. Then the string is cosmetic — the scored text
> does not decide this option, exactly as the straight-line px failed to decide the
> ascent crit, and I will report it as cosmetic rather than hunt a third wording.

**P-B — the argmax does not become `none`,** because the model has been measured
repeatedly to weight proximity and named targets above a prose clause.

> This is a prediction about magnitude, not direction, and I hold it weakly. If the
> argmax DOES flip to `none`, that is a stronger result than I claim and I will say
> so rather than explain it away.

**Interpretation rule, fixed in advance so the result cannot be read either way:**

| outcome | verdict |
|---|---|
| delta 0.000e+0 | cosmetic; the defect is not the criterion text |
| P(none) rises, argmax unchanged | real but insufficient; the wording moved it and something else decides |
| argmax becomes `none` | the change is a fix, and the next question is whether it holds on the six solid levels |
