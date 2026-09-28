# Prediction — will the model pick `ascent_left` once `hopPoints` offers it on L11 y231?

**Written before opening `hop_points.cjs`.** The defect is located (hop_points.cjs:54-69,
the exact-y landing match) but I have not read the function, not run it, and not called
the endpoint about it. Nothing below is coloured by a result. `decision.cjs` is untouched;
`decision.patched_route.cjs` stays parked, uncommitted.

## The state

L11, cat grounded on the y231 run (`x 145..197`, `y 231`). `hopPoints` currently returns
exactly one candidate there — `ascent_right` @ (193.25, 187) — and y187's only graph edges
lead back down to y228 and y231, so it is a climbing dead end. The hop that starts the
gem_a route is y231 → y211, which `landingsFrom` (anchor-corrected, direction-aware) puts at
a LEFT launch window of x 145..171.

## P1 — the model prefers the new candidate to the trap (the supervisor's registered form)

Supervisor, registered before I looked: **"if `hopPoints` starts offering `ascent_left` on
L11 y231, does the model pick it over `ascent_right`?"** His own stated reason: it will,
because the prompt already describes where each ascent lands and y211 is 20px up against
y187's 44px.

**I predict the weak form holds and the strong form does not, and I want that on the
record before the run rather than after it.**

- **Weak form, the actual claim:** at states where both ascents are offered,
  **P(ascent_left) > P(ascent_right)**. A split of the ascent vote, not a flip of the
  menu argmax.
- **Strong form, which I do not claim:** the model's single **choice** becomes
  `ascent_left` outright, beating `gem_c` as well.

The reason to doubt the strong form is a number already on the record, and it is the
opposite of the intuition that a better candidate wins. Across 71 grounded decisions on
this run the model chose `ascent_right` **37** times, `gem_c` **32**, `gem_b` **2**,
`gem_a` **0**. The dead end already beats the locally collectible gem more often than it
loses. So the model's demonstrated preference at this floor is *the wrong ascent*, and
adding a second ascent to a menu where the first one wins 52% of the time does not by
itself buy the new one the argmax. Mechanically, splitting the ascent vote can also
**raise** `gem_c`'s share, because `gem_c` is collectible from all 53 x of this run and
the two ascents trade votes instead of adding one.

**Falsified for the weak form if:** P(ascent_left) ≤ P(ascent_right) at a state where both
are offered. For the strong form: the choice is not `ascent_left`.

**The test, in order:** the objective call only. `buildMoveCall` receives the objective's
**name** and re-derives the target itself (decision.cjs:857) — no text crosses between the
two calls, so a move-side delta would measure nothing about this change. Order-debiased
the way the live `decide()` does it: forward plus reversed criteria order, averaged.

**Threshold, from the measured null control:** `--patched driver/decision.cjs` at d141
re-asked an identical prompt and returned max abs delta **0.000e+0** on both questions
(`out/runs/PROBE_L11_route_hint_20260927-081731.md`). The noise floor is 0, so any
non-zero delta is signal and a null is a true null.

**Which states:** not the all-gems-alive ones, where `gem_c` at ~0.99 decides the answer
before either ascent matters. The decision-relevant states are those with `gem_a` the only
live gem (d173, cat x=183.25) and those with `gem_a` + `gem_c` live. I will probe both and
report the numbers whatever they are.

## P2 — what instrumented hopPoints will show, and what would confirm each hypothesis

I am not guessing between the three, and I am not guessing at all until the instrumentation
runs. What I register is the **discriminating observation** for each, so that none of them
can be adopted afterwards because it is the convenient one:

| Hypothesis | Observation that confirms it | Observation that kills it |
|---|---|---|
| the arc model `hopPoints` uses disagrees with `landingsFrom` | at x=153.5 holding left, hopPoints' simulated landing y ≠ 211 (or it never terminates / lands off-run) | simulated landing y == 211 and x within the y211 run |
| the exact-y match at line 58 is too strict | simulated y is 211 within float noise but not within 0.01, or the platform's nominal y ≠ the run's nominal y | simulated y matches the platform's y to <0.01 and the x test at line 58 rejects it |
| the x step of 2 skips the window | every x it tries is even/odd-offset from the window and no x in 145..171 is ever tried | it tries an x inside 145..171 and still finds nothing |

The third is the cheapest to kill and I will kill it first, because it is a fact about the
scan, not about physics. Whatever the cause, the fix must not re-derive the landing: the
whole point of `landingsFrom` is that it holds the anchor-corrected box that has been got
wrong by hand three times in this file.

## OUTCOME — both forms REFUTED, in the adverse direction

Measured, after the prediction above was registered and before the fix was designed. The
weak form lost too. There is no hedge left in this file: **the claim registered above is
refuted, and the refutation is 8x in the direction opposite to the one predicted.**

| state | baseline | patched | verdict |
|---|---|---|---|
| d173 (cat 183.25,231, only gem_a live, mf=225) | ascent_right 0.847343719973682, gem_a 0.1526562800263181 | ascent_left **0.030337603789691525**, ascent_right 0.9144410327650875, gem_a 0.055221363445221036 | weak form refuted; trap **+0.067**, goal **-0.097** |
| d249 (all gems live, mf=140) | gem_c 0.9922405241603824, ascent_right 0.007462093385233834 | ascent_left **0.00003574607343760062**, ascent_right 0.00028347900380111036, gem_c 0.9995429781777065 | weak form refuted; 8x the wrong way |

The gate patch is one character, `hop_points.cjs:116` `>=` → `>`, and it did what it was
supposed to do: `ascent_left` @ (100.50,211) now appears on the L11 y231 menu, blast
radius one cell on one level, nothing lost anywhere. **The candidate was necessary and it
was not sufficient.** Adding it changed the menu and made the trap stronger.

**Order confound, disclosed and not dismissed.** Adding a candidate changes the menu size
(4 → 5 at d249), so the archived order cannot be a permutation of the patched menu;
anchoring both arms to the same RNG draw index holds the position, not the order. `ascent_left`
was presented FIRST at d173 and still lost by 30x, so a slot effect is excluded at that
state — but no delta in this A/B can be called order-free, and d249's 4 → 5 change is the
weaker of the two measurements for that reason.

**Null control at d173:** `--patched driver/decision.cjs` → objective avg delta
**0.000e+0**, chained move delta **0.000e+0**, argmax `ascent_right` both arms. The noise
floor is 0, so the deltas above are signal.

**Why it was going to fail, found afterwards, not guessed at the time.** The criterion the
model scores an ascent on is straight-line distance to the LANDING point
(`decision.cjs:620`, `ap.x` is `landX`). At cat x=183.25 the trap scores **0px** and the
correct waypoint scores **72px** — a distance the cat has no way to travel in one jump, since
the launch must come from x 145..173. So the change supplied the missing candidate and left
the only discriminating text still pointing at the dead end. This is the fourth instance of
one defect: score a choice on how far away something is when the thing that decides is where
it goes. The mirror branch already carries the fix — `decision.cjs:610`, the descent
`crit`, ships the landing AND the ONE-WAY warning, added for exactly this reason under the
comment "Experiment change 1". The ascent branch did not get it.

**Prediction P2 (the hypothesis table) is settled:** cause is not the arc model, not the
exact-y match, not the x step — it is `hop_points.cjs:116`'s threshold, exactly 20px. 15 of 81
(x, action) pairs landed on the y211 platform and every one was discarded at that line.

## What must not change

- `decision.patched_route.cjs` stays parked as it is. Not reverted, not committed. The
  first-hop computation, the direction-aware `landingsFrom` and the launch-window sentence
  are all correct and are needed the moment the candidate exists.
- `reachability.cjs` keeps only the additive `opts.dir` / `opts.box`; the null control stands
  (sha256 `8da23e12a0c30f0eddf98d1ac1878590884a1cc12ce4e10c5e7a06a8b8727550`, identical
  before the first edit and after both).
- No live L11 run before the probe moves a number.
