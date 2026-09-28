# Prediction — the first-hop route hint at the objective call (L11 gem_a)

**Written before the probe and before the run.** `decision.patched_route.cjs` exists
and its prompt text is already measured offline, but **no endpoint call has been made
against it**, so nothing below is coloured by a result. `decision.cjs` is untouched.

## The change

One sentence, appended to a gem's (or the portal's) line in `buildObjectiveCall`,
only when that objective is **not on the cat's current run and not collectible in one
jump from it**. Text produced at the probe state, from `check_route_hint.cjs`:

```
gem_a is not on this floor and not one jump away (3 further floors, then the one
that collects it). FIRST HOP: a jump LEFT from x 145..171 lands on the floor at
y 211 (x 62..114), 20px above this floor. No jump from x 172..197 reaches it.
```

Recomputed every call from `reachability.cjs`. Nothing is stored, so there is no
stale path after a death. The first hop is the smallest remaining hop count to a run
the objective can be collected from, ties broken by run key — **not** by distance from
the cat, because on L11 all three successors of y231 are one edge away and the correct
one (y211) is the farthest from the cat. Picking by nearness would name the dead end
(y187's only edges go back down).

## The state probed

`out/runs/PRE_L11_run_level_11_halogen_20260927-034150.json` decision **141**:
level 11, cat (153.5, 231) grounded, gems collected 0, mf 321, `priorDeaths=0`
(so `deathHistory=[]` is exact), archived objective `gem_c`, archived move
`jump_right` at 0.838. gem_a is live at (180,76), gem_b at (180,110), gem_c at (191,212).

**No grounded y=231 decision with objective gem_a exists in either L11 dump.** The
archived objective at this floor is `gem_c`, so this probe measures whether the hint
moves the objective CHOICE, not whether it fixes an already-gem_a decision.

## P1 — the objective call (the instrument that can see this change)

The shipped probe could not test this at all: `probe_move.cjs` builds only
`buildMoveCall`, so an objective-call change probes as a guaranteed zero delta. The
probe is extended first, with an objective arm that mirrors `decide()`'s own
**order-debiased** objective call (forward + reversed criteria, averaged) — the live
driver does this because a single draw picks a one-way descent 2 of 20 times on L4.

**Prediction:** under the patched objective call, **P(gem_c) falls** and **P(gem_a) and
P(gem_b) each rise**, on the same presented menu order.

Mechanism: the hint is attached to gem_a's and gem_b's lines and is silent on gem_c's,
so it adds an actionable step to exactly the two goals gem_c beat. gem_a and gem_b get
near-identical hints (both are collectible only from the y114 run), so I expect their
probabilities to move **together**; a split between them is menu-order noise and is
evidence against the mechanism.

**The strong form, which I do not claim:** that the argmax flips off gem_c. gem_c is
the local, easy, two-digit-offset goal; the hint makes the other two look like a
three-floor expedition. If the probabilities move as predicted and the argmax does
not, the hint is working as an explanation and the level still needs a
move-side clause. That would be a partial pass, and I will report it as one.

**Falsified if:** P(gem_c) rises, or neither hinted goal rises. Both hinted goals
rising is the claim; one is noise.

**Threshold, set before running, not after:** the null control (`--patched
driver/decision.cjs`, i.e. the same module twice) re-asks an **identical prompt** and
its max abs delta is the instrument's noise floor. Every delta above is judged against
that number, which I have not measured yet and will not guess.

**Order control:** the objective call's menu is drawn by a seeded module-level RNG
(`decision.cjs:1632-1637`), so a difference in menu order would masquerade as an
effect. Both arms are loaded as **fresh module instances with the same SEED**, each
consuming its first draw, so both arms see the same `presentedOrder` — and the probe
**refuses** rather than reporting if the two orders differ. The move call does not
shuffle, which is why the existing move probe reproduces archived probabilities.

## P2 — the move key, chained (the supervisor's registered prediction)

Registered by the supervisor before I looked: **"left rises, right falls."**

Tested as: each arm's own objective choice feeds that arm's own `buildMoveCall`, which
is the live pipeline in order.

**I predict this one will be weaker than the supervisor's phrasing implies, and I say
so now rather than after the run.** The hint lives in the **objective** call. The move
call is not changed by it, and the move prompt describes gem_a as
`155px up, 27px right` — the straight line that has been wrong three times. So even
with the objective correctly flipped to gem_a, the move argmax is decided by text that
still points right. The cat is standing at x=153.5, **inside** the 145..171 window, so
the correct action is `jump_left` immediately, and the move prompt is what would have
to say so.

**So my prediction is the split:** the objective call moves as in P1 (the reachable
route is computed and now said), and the move call does **not** follow, because the
window "x 145..171, no jump from x 172..197" is stated only where the model is choosing
a goal, not where it chooses a key. If instead `jump_left` rises to the argmax
downstream, P2 holds and the single sentence was sufficient; I will report the number
either way and will not re-describe a null as a partial pass.

## P3 — the offline census (regression, not behaviour)

Every decision in all nine existing prompt dumps, `buildObjectiveCall` rebuilt under
both modules, diffed. Levels **L0 L1 L2 L5 L7 L8** must be byte-identical to be called
clean; **L3 and L9** text diffs are trustworthy but their scoreboards are not (both
failed tonight on prompts these clauses never touched, zero firings). **L4 L6 L10 L12
L13 have no dump — recorded as a gap, not as a pass.**

**Prediction:** the diff is non-empty wherever a gem sits off the cat's current run,
and the count is **small** — the gate cannot fire while the goal is on this floor, so
the fire set is "the cat is chasing a gem on another floor", which is a large fraction
of decisions on a 3-gem level. I expect a fire rate in the tens of percent, not
single digits. **If that is what the census shows, it is a noise risk in the L2 sense
(25 true descent sentences, all fired, cost the level) and the fix is a tighter gate,
not a different sentence:** fire only when the first hop's direction DISAGREES with the
straight-line direction to the objective, because that is the only case where the
straight line is actively misleading. That would be a second change, and it waits for
the probe result.

## What must not change

`reachability.cjs` gains `opts.dir` and `opts.box` only, both defaulting to the old
behaviour. Null control already run: `landings_hash.cjs` over every integer x on every
run of all 15 levels, jump true/false, catHeight 18, plus every `graph()` edge set —
sha256 `8da23e12a0c30f0eddf98d1ac1878590884a1cc12ce4e10c5e7a06a8b8727550`, identical
before the first edit and after both.
