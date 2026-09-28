# PREDICTION — L10 twice on the same build (HEAD)

Written before either run. Build HEAD `898f5b2`; `decision.cjs` md5 `46f12d914a49f02c6d34828a0a539af6`,
`hop_points.cjs` md5 `1252a170dee44df3ab24f589310a0ccd`. Plain `run.sh 10`, no PATCHED_SRC.

## WHY
1. L10 has NO post-arcfix archive. The only one is `PRE_L10_run_level_10_halogen_20260926-220555.json`
   (40d/360dec/1680st, run-stamp 2026-09-26, PRE-arcfix). So the supervisor's 40 -> 17 comparison spans
   lockonly+arcfix vs HEAD-without-arcfix and has never been isolated.
2. The L7 calibration proved zero within-build variance on a CLEAN run (0 deaths, never near a laser).
   The project note says the irreproducibility comes from unseeded per-frame laser thickness and only
   near lasers. L10 is death-heavy, so it is the run that tests the uncovered half.

## PRIOR
Only known L10 outcome: 40 deaths / 360 decisions / 1680 steps, 0 gems, death-capped and STOPPED.
The arc fix alone moved L6 37 -> 24 deaths, so a post-arcfix L10 should not be assumed to match it.

## PREDICTION
- P-A: both runs are byte-identical to each other. Within-build variance on a DEATH-HEAVY level is zero,
  which closes the laser-proximity caveat on the L7 calibration.
- P-B: both runs collect at least one gem. The arc fix is the only committed change and it took L6 from
  1 gem to 3; a level where the cat cannot leave the bottom rung should not be gem-starved after it.
- P-C: both runs survive past 1680 steps, i.e. the death cap no longer stops them.

## FALSIFIERS
- Any difference between the two runs -> P-A refuted, and every death-count comparison this session
  becomes a sample rather than a measurement.
- 0 gems on both -> P-B refuted; L10 is a routing failure, not a laser-proximity one.
- Stopped at or before 1680 steps -> P-C refuted; the 40-death baseline was not an arc-fix artefact.
