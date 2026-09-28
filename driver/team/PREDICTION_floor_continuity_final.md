# Scoring & Prediction — Floor-Continuity Clause (Final)

## Scorecard (Pre-Registered vs Actual)

| Level | Prediction | Actual | Score |
|-------|------------|--------|-------|
| **L0** | No change; clause never fires | 0d/3g, 5 dec, 78 steps, 0 firings | ✅ HIT (both outcome + mechanism) |
| **L1** | Deaths 4→≤2, Better | 0d/3g, 24 dec (158→24), 331 steps (1705→331) | ✅ HIT (under-called) |
| **L1 mechanism** | "Descent-waypoint levels structurally unaffected" | 5/10 firings were descent_right; probe: 1% confidence, no argmax flip; **gem-only run: identical 0d/3g/24/331** | ❌ WRONG on firing count / ✅ RIGHT on effect (zero) |

**Net: 1.5 / 2** — Half credit on mechanism. The wrong half would have stopped the experiment.

---

## Critical Finding (Settled by Run)

**The descent half contributes ZERO.** 
- Probe: descent sentence worth ~1% confidence at 2 states, no argmax change.
- **Gem-only build run: identical to full build (0d/3g/24/331).** Removing all 5 descent firings changed nothing.
- **The gem half is the entire mechanism.**

---

## Four-Column Table (With Circularity Named)

| Level | (i) Sites — Geometry | (ii) Run-Objective % — Grounded decisions where objective.x ∈ run.span AND passes vertical test (split by type) | (iii) Firings = (i) ∩ (ii) ∩ visit | (iv) Visited States — Cat's actual grounded trajectory (CIRCULAR: this trajectory is the EFFECT of the change, not the cause) |
|-------|----------------------|----------------------------------------------------------------------------------------------------------------|--------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| **L0** | 3 (gem_a/b/c on y=253/210/180) | 0% (all `ascent_right`) | 0 | 0 visits with matching objective |
| **L1** | 3 (gem_a/b/c on y=230/y=155) | 42% (10/24: 5 gem, 5 descent) | 10 (5 gem, 5 descent) | **CIRCULAR** — this 24-decision trajectory is the effect of the clause; states the change PREVENTED (158→24) are not in dump |
| **L2** | 1 (gem_a on y=200) | TBD | TBD | TBD |
| **L7** | 2 (gem_a y=253, gem_b y=100) | TBD | TBD | TBD |
| **L8** | 3 (gem on y=290 merged, portal) | TBD | TBD | TBD |

---

## L2 Prediction — Explicit Number (Not Direction)

**Baseline:** 3 deaths, 3/3 gems, **153 decisions**, 1097 steps  
**L1 baseline was 158 decisions, 1705 steps → collapsed to 24, 331 (factor 6.6× decisions, 5.1× steps)**

### Analysis: Does the Mechanism Generalise?

| Factor | L1 | L2 | Assessment |
|--------|-----|-----|------------|
| **Site count** | 3 | 1 | L2 has fewer intervention points |
| **Gem-objective fraction** | 21% (5/24) | **Lower** — L2 cat descends from y=64; gem_a only becomes objective late (if sticky lock holds) or after collecting gem_c/gem_b first | L2 gets less clause exposure |
| **Vertical geometry** | Gem 15px above floor (walk-reachable) | Gem 12px above floor (walk-reachable) | Same mechanism applies |
| **Descent path** | Direct from y=270/y=230 | Must descend through y=240 (gem_c) and y=180 (gem_b) first | More decision points where objective can flip |
| **Sticky objective lock** | gem_a locked from spawn? | gem_a may be deferred by ROUTE_FIRST through gem_c's floor | Reduces gem-a-as-objective time on y=200 |

**Verdict:** Mechanism applies but with **lower exposure** (fewer sites × lower gem-objective fraction × more objective-flip opportunities).

### Numerical Prediction for L2

| Metric | Baseline | Predicted |
|--------|----------|-----------|
| **Decisions** | 153 | **55** (factor ~2.8× reduction — half of L1's 6.6×) |
| **Steps** | 1097 | **~400** (factor ~2.7× reduction) |
| **Deaths** | 3 | **1** (gem-a walk-reachable on y=200 prevents overshoot deaths) |
| **Gems** | 3/3 | 3/3 |

**Confidence:** Medium. L2 has the same baseline shape as L1 but the intervention is narrower (1 site vs 3, later gem-objective alignment). Factor of 2.8× is calibrated to half of L1's collapse.

---

## L7 & L8 Predictions (Explicit Numbers)

### L7
| Metric | Baseline | Predicted |
|--------|----------|-----------|
| Decisions | 33 | **28** (minimal change — already 0d, baseline already efficient) |
| Steps | 308 | **280** |
| Deaths | 0 | **0** |
| Gems | 3/3 | 3/3 |

**Reason:** L7 cleared 0 deaths baseline. Clause fires on floors model already handles correctly (like L0). Marginal improvement at most.

### L8
| Metric | Baseline | Predicted |
|--------|----------|-----------|
| Decisions | 45 | **38** (modest improvement if clause catches walk-reachable gems on y=290) |
| Steps | 643 | **520** |
| Deaths | 1 | **0** (if clause fires on correct gem) |
| Gems | 3/3 | 3/3 |

**Reason:** Lower confidence — site count disputed, trajectory unknown. Baseline already near-optimal (1 death).

---

## Cross-Level Falsification (Final)

| Verdict | Condition |
|---------|-----------|
| **WRONG** | L0/L7 regress (new deaths, gems < 3) OR L1/L2 show *increased* deaths OR clause fires false-positive ("on THIS floor" for non-walk-reachable objective) |
| **NEUTRAL** | All five maintain baseline clear rate, deaths within ±1 |
| **RIGHT** | L1/L2/L7/L8 show clear death reduction with no regressions |

---

## Circularity Statement (Recorded)

**Column (iv) "Visited States" is circular by construction:** The trajectory in the dump is produced *by* the change. The states the change *prevented* (e.g., L1's missing 134 decisions) are not observable. Probe measures states the change created; only a counterfactual run measures states the change prevented. Report this explicitly: *"This trajectory is the effect, not the cause."*

---

## Next Steps (When Out of Plan Mode)

1. Run L2, L7, L8 with `onPlatform` gate + dump capture
2. Populate columns (ii), (iii), (iv) from dumps
3. Score against L2 prediction: 55 decisions, 400 steps, 1 death
4. If L2 matches prediction → mechanism generalises partially. If L2 matches L1 collapse (24 decisions) → full generalisation. If L2 ~153 → L1 was special.