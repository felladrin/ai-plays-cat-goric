# Level history — which baselines can bear weight

**Source:** every `run_level_*.json` under `out/` and `out/runs/`, read directly.
**Clear test:** `sawAdvance` — the cat advanced FORWARD past the target level
(`run_level.cjs:435`).

> **Do not use `reachedWin` as the clear test.** It is set only when the game
> index reaches 14 (`run_level.cjs:405-409`) and is therefore *always false* for
> a single-level run of L0–L13. An earlier version of this file keyed on it and
> concluded that nothing had ever cleared. The archiver's own rule is
> `sawAdvance || reachedWin`; the second term matters only for an L13 run that
> reaches the victory screen.

## Two counts, and why both are here

`files` counts JSONs on disk. It **overstates runs**: `pre_` and `PRE_` archives
hold a copy of a run that also exists elsewhere (on L7, `VIDEO1_L7_FAILED` at
22:06 and `pre_run_level_7_…223929` are the same run under two names).

`outcomes` counts *distinct* `(deaths, gems, decisions, steps)` tuples. It
**understates runs** on a deterministic level, because repeated runs produce
identical tuples — but that is exactly what makes it useful: **one outcome
across many files means the level is reproducible.**

| level | files | distinct outcomes | outcomes that cleared | verdict | baseline trustworthy |
|---|---|---|---|---|---|
| L0 | 7 | **1** | 1 | SOLID — fully deterministic | **yes** |
| L1 | 6 | 2 | 2 | SOLID | **yes** |
| L2 | 7 | 5 | 5 | SOLID — varies, always clears | **yes** |
| L3 | 6 | **6** | 2 | **INTERMITTENT** | **no** |
| L4 | 2 | 2 | 0 | FAILING | n/a |
| L5 | 13 | 3 | 3 | SOLID — varies, always clears | **yes** |
| L6 | 6 | 3 | 0 | FAILING | n/a |
| L7 | 15 | 4 | 2 | SOLID — see note | **yes** |
| L8 | 15 | **1** | 1 | SOLID — fully deterministic | **yes** |
| L9 | 2 | 2 | 1 | **INTERMITTENT** | **no** |
| L10 | 4 | 1 | 0 | FAILING | n/a |
| L11 | 10 | 6 | 0 | FAILING | n/a |
| L12 | 4 | 3 | 0 | FAILING | n/a |
| L13 | 2 | 1 | 0 | FAILING | n/a |

**L7's note.** Its two non-clearing outcomes are both from before 22:06 on
2026-09-26 and a worse configuration — 10 deaths / 2 gems hitting the step cap,
and the 40-death run its own filename records as `VIDEO1_L7_FAILED`. Every run
from 22:41 onward clears: eleven consecutive at 0 deaths / 3 gems / 33 dec / 308
steps, then 27 / 258 once the floor clause landed. Not intermittent — broken by
a configuration, then fixed.

## Verdict

**6 solid, 2 intermittent, 6 failing.** Not "8 passing".

- **Trust** an outcome change on L0, L1, L2, L5, L7, L8.
- **Distrust** one on **L3** (2 clears of 6 distinct outcomes) and **L9** (1 of
  2). Both failed on 2026-09-27 with **zero firings of either prompt clause**,
  so their prompts were byte-identical to the runs that cleared. Those failures
  are the levels' own variance, not a regression.
- L4, L6, L10, L11, L12, L13 have never cleared, so they have no baseline to
  regress from.

## Why this file exists

Every comparison in the 2026-09-27 session was made against baselines drawn from
single runs of levels nobody had established as reproducible. L3's and L9's were
both single samples. Both have since failed on identical input. **Had either
fired one of the clauses under test, the session would have spent hours hunting
a regression that was never there.**

Verdicts and the *baseline trustworthy* framing are the observer instance's
(nemotron-3-ultra-free); the counts were recomputed independently before being
written here.
