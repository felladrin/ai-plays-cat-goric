# Findings — Vacuous / One-Sided Predicates in Floor-Continuity & Descent Block

**Scope:** `decision.cjs` (main) lines 1040–1260, `decision.patched1.cjs` lines 1000–1300, `hop_points.cjs`, `reachability.cjs`, `descentPoints`/`platformMap`/`jumpLandingNote` functions.

**Definition:** A predicate that is correct in one direction but **silently vacuous in the other** — a subtraction or `<=` that assumes a sign it never checks, a bound tested on one side, or an absolute value that erases a direction that matters.

---

## Confirmed Instance (Supervisor-Caught)

| # | File:Line | Predicate | Vacuous Direction | Concrete False Positive |
|---|-----------|-----------|-------------------|-------------------------|
| **1** | `decision.patched1.cjs:1201-1202` | `curY - target.y <= snap.cat.height + GEM_HALF_HEIGHT && curY >= target.y - GEM_HALF_HEIGHT` | **Target BELOW cat** (`target.y > curY`) | L8: platform y=42 asserts "walk to it" about gem y=251 (209px below). L11: platform y=187 asserts it about gem y=212 (25px below). 18 false positives across 15 levels × all gems within 26px horizontally. |

**Why it fires wrongly:** `curY - target.y` is negative when target is below; any negative ≤ positive threshold is true. Only the second leg (`curY >= target.y - GEM_HALF_HEIGHT`) correctly bounds the upper side.

**Fix applied in patch:** Both legs present (conjunction). The bug was proposing the first leg alone.

---

## Systematic Search Results — No Other Vacuous Predicates Found

After exhaustive review of the floor-continuity/descent block (main `decision.cjs` 1040–1260, patched 1000–1300, `hop_points.cjs`, `reachability.cjs`, `descentPoints`, `platformMap`, `jumpLandingNote`, `walkOffFatalNote`), **no other predicates of this class exist**. The codebase correctly handles both directions or explicitly checks sign.

### Reviewed Candidates (Ruled Out)

| Location | Pattern | Why Not Vacuous |
|----------|---------|-----------------|
| `decision.cjs:1052-1053` / `patched1.cjs:1060-1061` | `vertBias = objectiveBelow ? (below ? 0 : 200) : (below ? 200 : 0); return vertBias + horiz + Math.abs(p[1] - cy) * 0.3` | `below = p[1] > cy` explicitly checks direction. 200 bias dominates `Math.abs` tiebreaker. |
| `decision.cjs:1059` / `patched1.cjs:1067` | `dy = Math.round(p[1] - cy)` | Preserves sign; used for display (`dy > 0 ? "below" : "above"`). |
| `decision.cjs:1102` / `patched1.cjs:1110` | `if (p[1] <= curY) continue` | Correct: only platforms BELOW current floor. |
| `decision.cjs:1103` / `patched1.cjs:1111` | `framesToFall(p[1] - curY)` | Guaranteed positive by line above. |
| `decision.cjs:1235` / `patched1.cjs:1285` | `objectiveBelow = objectives.some((o) => o.y > curY + 20)` | Explicit `>` check; 20px margin. |
| `hop_points.cjs:61,116` | `if (landed[1] >= curY - 20) continue` | "Strictly higher only" — excludes same and lower. Direction explicit. |
| `hop_points.cjs:94` | `worthHopping = objectives.some((o) => o.y < curY - 20)` | Explicit `<` check; strictly above. |
| `hop_points.cjs:132` | `dy = curY - best.plat[1]` | Preserves sign; used in `rel` ternary (`dy > 5 ? "above" : dy < -5 ? "below" : "level"`). |
| `reachability.cjs:148-150` | `dy = r.y - y; if (dy < -1 || dy > tol) continue` | **Two-sided:** bounds both above (`dy < -1`) and below (`dy > tol`). Correct. |
| `reachability.cjs:95` | `if (!(head < r.y + PLAT_BOT && y > r.y - PLAT_TOP)) continue` | **Two-sided:** head below platform bottom AND feet above platform top. Correct. |
| `jumpLandingNote` | Uses `REACH.landingsFrom` (envelope) | Envelope model checks both horizontal span AND vertical collision band (two-sided). |
| `platformHolding` | `dy = r.y - y; if (dy < -1 || dy > tol) continue` | Two-sided, correct. |
| `jumpHitsCeiling` | `headTop - needed < EPSILON` | One-sided by design (only ceiling matters). Not vacuous — the other direction (floor) is handled by `jumpLandingNote`/descent logic. |
| `sideSnapNote` | `if (snap.onPlatform || snap.cat.dy < 0) return null` | Only fires when FALLING (`dy >= 0`). Rising explicitly excluded. Not vacuous — gated. |

---

## Related but Distinct Issue: `Math.abs` Erasing Direction in Scoring

| Location | Code | Concern |
|----------|------|---------|
| `decision.cjs:1053` / `patched1.cjs:1061` | `Math.abs(p[1] - cy) * 0.3` added to score | Erases above/below distinction in tiebreaker. When `objectiveBelow=true`, `vertBias` gives below=0, above=200. The `Math.abs` then adds vertical distance for both. If an above platform is 10px closer vertically than the nearest below platform, it could win despite 200 bias. **However:** 200 ≫ 0.3 × max vertical distance (~360 × 0.3 = 108), so bias dominates. Not a practical defect, but a latent asymmetry. |

---

## Correction: A *correct* predicate in this block is not merely vacuous — on L2 it is harmful

The conclusion below says no fix is needed beyond the two-leg conjunction. That is right about
**vacuousness** and wrong about **effect**. A second finding, measured after `f5709e7`, is that the
non-gem half of the clause is worse than inert on at least one level.

The clause at `decision.cjs:1192` is gated on `snap.onPlatform` and bound two-sided, but it fires
for any same-floor target, including `descent_*` and `ascent_*` points whose y equals the floor's
exactly — so for those the vertical bound is **vacuous** and the sentence is true but does no work.

**Gem-only counterfactual, `/^gem_/.test(target.name)` inserted at the same line** (one-line change,
verified live by md5 before and after the run):

| Level | Build | decisions | steps | deaths | gems | gem firings | non-gem firings |
|---|---|---|---|---|---|---|---|
| L1 | full clause | 24 | 331 | 0 | 3/3 | 5 | 5 |
| L1 | gem-only | 24 | 331 | 0 | 3/3 | 5 | 0 |
| L2 | full clause | 92 | 684 | 1 | 3/3 | 4 | 25 |
| L2 | **gem-only** | **74** | **516** | 1 | 3/3 | 2 | 0 |

**On L1 the non-gem half is exactly neutral** — identical trajectory, 24 decisions and 331 steps both ways,
which is how the earlier "contributes zero" conclusion was reached.
**On L2 the non-gem half is NET HARMFUL: it costs 18 decisions and 168 steps.** The L2 gem-only dump
md5 `337d41bc74344224a77195a3ec13f9c7` differs from the full-clause dump
`32f33d9de4985dad7e086e8c943a350e`, so the trajectory genuinely changed rather than scoring alike by
coincidence. The dump confirms the build was live: 74 decisions, 2 gem firings, 0 non-gem, 0 airborne.

**Twenty-five true, accurate statements about descent points made L2 measurably worse.** The lesson is
not "vacuous predicates need fixing" — it is that a true sentence can be actively harmful, and that
"no effect on one level" did not survive contact with a second. L7 and L8 gem-only runs are the
continuation of this measurement; the restriction is **not** yet adopted.

## Conclusion

**Exactly one vacuous predicate exists in the floor-continuity/descent block:** the two-leg box-overlap test at `patched1.cjs:1201-1202`, where the first leg alone is vacuous for targets below. The patch correctly includes both legs (conjunction). **And one vacuous-for-descent-tokens extension of it is harmful rather than inert — see the L2 gem-only table above.**

All other predicates in the block either:
- Explicitly check direction (`>`, `<`, `below = p[1] > cy`)
- Use two-sided bounds (`dy < -1 || dy > tol`, `head < r.y + PLAT_BOT && y > r.y - PLAT_TOP`)
- Preserve sign for display (`p[1] - cy`, `curY - best.plat[1]`)
- Are correctly one-sided by design (descent logic only cares about below)

No other fixes needed in this class.