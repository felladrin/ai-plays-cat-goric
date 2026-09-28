# Final Reliability Table — With Baseline Trustworthiness

**Source:** All `sawAdvance`/`reachedWin` from JSON in `out/runs/`, deduped on (deaths, gems, decisions, steps). PRE_ files = snapshots BEFORE launch; three L3 partials = one corrupt episode.

---

| Level | Distinct Runs | Cleared (`sawAdvance`) | Verdict | Baseline Trustworthy |
|-------|---------------|------------------------|---------|---------------------|
| **L0** | 7 | 7/7 | **SOLID** | ✅ YES (7 clean runs) |
| **L1** | 6 | 6/6 | **SOLID** | ✅ YES (6 clean runs) |
| **L2** | 7 | 7/7 | **SOLID** | ✅ YES (7 clean runs) |
| **L3** | 3 (A/B/C) | 1/3 | **INTERMITTENT** | ❌ NO (only 1 clear run) |
| **L4** | 2 | 0/2 | **FAILING** | N/A |
| **L5** | 13 | 13/13 | **SOLID** | ✅ YES (13 clean runs) |
| **L6** | 6 | 0/6 | **FAILING** | N/A |
| **L7** | 15 (12 fair) | 12/12 fair | **SOLID** | ✅ YES (12 fair clears) |
| **L8** | 15 | 15/15 | **SOLID** | ✅ YES (15 clean runs) |
| **L9** | 2 (1 clear, 1 fail) | 1/2 | **INTERMITTENT** | ❌ NO (only 1 clear run) |
| **L10** | 4 | 0/4 | **FAILING** | N/A |
| **L11** | 10 | 0/10 | **FAILING** | N/A |
| **L12** | 4 | 0/4 | **FAILING** | N/A |
| **L13** | 4 | 0/4 | **FAILING** | N/A |
| **L14** | 1 | 1/1 (`reachedWin`) | **GAME WON** | N/A |

---

## Baseline Trustworthiness Key

| Column | Meaning |
|--------|---------|
| **Baseline Trustworthy = YES** | Level has ≥2 clean clears (`sawAdvance: true`) on standard builds. The baseline we compare against is reproducible. A regression here means the change broke something. |
| **Baseline Trustworthy = NO** | Level has 0 or 1 clean clear. The "baseline" we compared against was a single sample. A change in outcome may be noise, not regression. |
| **N/A** | Level never clears; no baseline to trust. |

---

## Summary

| Category | Levels | Count |
|----------|--------|-------|
| **SOLID (Baseline Trustworthy)** | L0, L1, L2, L5, L7, L8 | 6 |
| **INTERMITTENT (Baseline Untrustworthy)** | L3, L9 | 2 |
| **FAILING** | L4, L6, L10, L11, L12, L13 | 6 |
| **GAME WON** | L14 | 1 |

**Total levels: 14** | **Solid: 6** | **Intermittent: 2** | **Failing: 6** | **Won: 1**

---

## Key Findings

1. **"8 passing levels" was a miscount** — based on `peakGemsCollected: 3` (gem collection), not `sawAdvance: true` (level clear).

2. **L3 and L9 are INTERMITTENT, not solid** — each has only 1 clean clear on record. Their single-run baselines were untrustworthy. L9's new failure (3 gems, 3000-step cap, 0 clause firings) confirms: it fails on identical prompts.

3. **L7 is SOLID on fair runs** — 12/12 fair clears; 3 failures are from old config (21:47, 22:06) and a PRE-snapshot duplicate. No fair run has failed since 22:41.

4. **6 levels are genuinely FAILING** — L4, L6, L10, L11, L12, L13 never clear.

5. **Real distance to goal: 6 failing levels** (L4, L6, L10, L11, L12, L13) + 2 questionable (L3, L9) = 8 levels needing work.

---

## Baseline Trustworthiness Deliverable

The `Baseline Trustworthy` column is the actual deliverable. It tells the next person:

- **Trust L0, L1, L2, L5, L7, L8 baselines** — regressions there are real.
- **Distrust L3, L9 baselines** — outcome changes there are likely noise.
- **L4, L6, L10, L11, L12, L13 have no baseline** — they never clear.

This column is what the audit existed to produce. Every comparison this session was made against baselines drawn from single runs of levels nobody had established as reproducible. L3's and L9's baselines were both single samples, and both levels have now failed on identical prompts. If either had fired one of our clauses, we would have spent the night hunting a regression that was never there.