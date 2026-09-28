# PREDICTION — L7 run twice on the same build

Written before either run. Build: HEAD `898f5b2`, `decision.cjs` md5 `46f12d914a49f02c6d34828a0a539af6`,
`hop_points.cjs` md5 `1252a170dee44df3ab24f589310a0ccd`. Plain `run.sh 7`, no PATCHED_SRC, so no swap
marker exists and the md5s are the only build evidence.

## PRIOR, measured on L2 today
Three genuine same-build L2 archives: 74 decisions, 1 death, peakGems 3, at 516 / 517 / 518 steps.
Objective sequence, move sequence, cat position and movingFrames IDENTICAL across all 74 decisions.
Only the `step` field differs, by 2, constant from decision 39.

So: same build gives identical DECISIONS on L2, with a step-timing floor of at least 2.

## PREDICTION
Both L7 runs give `0d / 27dec / 258st`, cleared, peakGems 3 — matching the dominant L7 signature
already in the archives three times over.

- P-A: both runs agree on decisions, deaths and clear status. Within-build OUTCOME variance is zero.
- P-B: both runs agree on the step total to within 2 (the L2 floor).
- P-C: both runs clear.

## FALSIFIERS
- Any difference in decision count, death count, or clear status -> P-A and P-C refuted; the level
  has real within-build outcome variance and no single-run comparison on it can be trusted.
- A step-total difference greater than 2 -> P-B refuted; the L2 floor does not generalise.
- The `10d/280dec/3000st` variant (already in the archives, build unknown) appearing -> P-A refuted.

## WHAT THIS DOES NOT SETTLE
It calibrates L7 only. It says nothing about L2, L5 or L7's own cleared/not-cleared split on OTHER
builds, and nothing about the L3 death count, which is a count comparison and not a step comparison.

## OUTCOME (appended after both runs)
Run A `[15:41:05]` and run B `[15:43:00]`, both plain `run.sh 7`, build md5s unchanged before and
after, `git status` clean on both files after.

    both runs: cleared=true deaths=0 decisions=27 gems=3 steps=258

Log-level md5 over the 27-entry log, across every L7 archive on disk with 27 decisions:

    0365cd6735  x4   <- run A, run B, and two earlier archives
    81535f43dd  x1
    e31b215f16  x1

**P-A HELD. P-B HELD. P-C HELD.** The two runs are BYTE-IDENTICAL to each other and to two earlier
archives: four identical same-build runs. Within-build variance on L7 is exactly zero, decision
level and step level. The two outliers differ from decision 1 in a field other than step, move or
objective, and predate the current build; not chased.
