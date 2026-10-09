# Parked: the descent-criteria experiment

Reverted out of `driver/decision.cjs` because it regressed L1 and L2. See
`../HANDOFF_DESCENT_CRITERIA.md` for the full account.

| file | note |
|---|---|
| `decision.descent-experiment.cjs` | all four changes; drop-in replacement for `decision.cjs` |
| `test_descent_criteria.reverted.cjs` | its test; passes against the experiment, fails against `decision.cjs` |
| `lvl.sh` | run one level, print a one-line summary |

Two known defects, both described in the handoff: the direction filter's
`ahead()` test misfires when the landing platform straddles the step-off edge
(kills L2), and `gemOn()`'s 30px tolerance misses gems that float ~52px above
their platform (also L2).

To try it: `cp experiments/decision.descent-experiment.cjs decision.cjs` and
`cp experiments/test_descent_criteria.reverted.cjs test_descent_criteria.cjs`.
Sweep L0-L9 before believing anything.
