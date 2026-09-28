# Plan — inventory ranks 3 and 4 (annotation-only)

**Status: planned, NOT implemented.** Produced by the `nemotron-3-ultra-free`
instance; captured by the supervisor from its pane.

Covers the two unblocked items from
[[INVENTORY_computed_then_discarded]]: the gem `crit` landing, and tying
`platformMap`'s `dropMsg` to the objective. Ranks 1 and 2 were blocked on
`arc.simulate`'s optimistic laser verdicts; that block may now be lifted by
commit `c93f9e2`.

> **Transcription warning.** Captured from a rendered terminal pane. Re-grep
> every line number by symbol before use.

> **Supervisor correction — the measurement classes below are partly
> unmeasured.** The plan assigns run counts by level class and lists L2, L3, L6
> and L10 together as "laser-proximal, 5 runs each, 2.2x spread". Only **L2**
> has been observed to vary, and only once (342 decisions then 153). **L3, L6
> and L10 have never been run twice on one build and are unclassified.** L8 and
> L5 are genuinely established as observed-identical, 5/5 each. Do not spend
> five runs on a level that has not been shown to need them: **classify by
> running it twice, then decide.** The 2.2x figure is L2's alone and must not
> be carried onto the others.

---

  ┃   215 ```
  ┃   216
  ┃   217 **After (same state):**
  ┃   218 ```
  ┃   219 The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.
  ┃   220 Holding steer left in the air lands at (141,241) in 12 frames. Holding steer right in the air → laser at (198,180). Holding keep current trajectory, no steering
  ┃       lands at (154,241) in 14 frames.
  ┃   221 ```
  ┃   222
  ┃   223 ### 2.5 What It Must NOT Do
  ┃   224
  ┃   225 - ❌ Change `run_full.cjs` / `run_level.cjs` boolean usage — they already do `holdIsSafe(cur) && ...`; truthy object works
  ┃   226 - ❌ Add new simulator calls — reuses exact same `simulate` call
  ┃   227 - ❌ Prune actions — all 3 airborne actions stay on menu
  ┃   228 - ❌ Alter `legalActions` — unchanged
  ┃   229 - ❌ Touch grounded code path — `snap.onPlatform` returns `null` unchanged
  ┃   230
  ┃   231 ### 2.6 Falsifiable Prediction (Distribution Across N Runs)
  ┃   232
  ┃   233 **Target levels:** L4 (airborne), L2, L3, L10 — **L4 mixed, L2/L3/L10 laser-proximal**
  ┃   234
  ┃   235 | Metric | Before (baseline) | After (predicted) | N runs |
  ┃   236 |--------|-------------------|-------------------|--------|
  ┃   237 | L4: airborne reversal rate (steer opposite to launch direction) | 39.6% (measured) | ≤10% | 5 (mixed) |
  ┃   238 | L4: airborne deaths from steering into laser/void | baseline | ≤0.3× baseline | 5 (mixed) |
  ┃   239 | L2: airborne death rate | baseline | ≤0.5× baseline | 5 (laser-proximal) |
  ┃   240 | L3: airborne death rate | baseline | ≤0.5× baseline | 5 (laser-proximal) |
  ┃   241
  ┃   242 **Validation:** Run 5× on L4 with `HELDACTION_PROMPT=1`. Record from dumps:
  ┃   243 - `move` choice at each airborne decision vs `argmaxMove`
  ┃   244 - Death count + cause while airborne
  ┃   245 - `holdIsSafe` return values (now objects)
  ┃   246
  ┃   247 **Note on laser-proximal levels:** Distribution shift (median death rate halved). Report median across 5 runs.
  ┃   248
  ┃   249 ---
  ┃   250
  ┃   251 ## Interaction Between Rank 1 & 2
  ┃   252
  ┃   253 Both add landing information to the **airborne prompt** but at different granularities:
  ┃   254
  ┃   255 | | Rank 1 (`jumpLandingNote`) | Rank 2 (`heldActionIsSafe`) |
  ┃   256 |---|---|---|
  ┃   257 | **Scope** | Jump-from-ground analysis (walk to window, then jump) | Current airborne steer actions (hold left/right/none) |
  ┃   258 | **Source** | `REACH.landingsFrom` (envelope) + `simulate` held-arc verify | `simulate` with current `dy`, `mf`, `grounded: false` |
  ┃   259 | **Trigger** | Grounded cat with objective on different floor | Airborne cat (any `dy`) |
  ┃   260 | **Complement** | Tells where to jump FROM | Tells where each steer LANDS |
  ┃   261
  ┃   262 **Both enabled:** Airborne cat sees:
  ┃   263 1. `jumpLandingNote`: "If you were on floor, walk to x 139 and jump right to reach gem_a"
  ┃   264 2. `heldActionIsSafe`: "Holding right now lands at (198,180) → laser; holding left lands at (141,241) safe"
  ┃   265
  ┃   266 This gives the model **both** the strategic jump plan AND the immediate steer consequences.
  ┃   267
  ┃   268 ---
  ┃   269
  ┃   270 ## Staging
  ┃   271
  ┃   272 | Flag | Item | Default | Rollback Condition |
  ┃   273 |------|------|---------|---------------------|
  ┃   274 | `JLNOTE_AIRBORNE=1` | Rank 1 | OFF | Any passing-level regression on 14-level sweep |
  ┃   275 | `HELDACTION_PROMPT=1` | Rank 2 | OFF | Any passing-level regression on 14-level sweep |
  ┃   276
  ┃   277 Independent flags — can be enabled separately or together. **Both require `arc.simulate` thickness fix (verified).**
  ┃   278
  ┃   279 ---
  ┃   280
  ┃   281 ## Implementation Checklist
  ┃   282
  ┃   283 ### Rank 1 (`JLNOTE_AIRBORNE=1`)
  ┃   284 - [ ] Remove `!snap.onPlatform ||` from `jumpLandingNote` line 624
  ┃   285 - [ ] Add call in `buildMoveCall` airborne branch (after line 905)
  ┃   286 - [ ] Add `JLNOTE_AIRBORNE` gate around the call
  ┃   287 - [ ] Test: L4 5×, L2 5×, L3 5× — record airborne `objective` flip rate + death count
  ┃   288
  ┃   289 ### Rank 2 (`HELDACTION_PROMPT=1`)
  ┃   290 - [ ] Change `heldActionIsSafe` return type to object (lines 108–119)
  ┃   291 - [ ] Verify runner boolean usage still works (truthy object = true)
  ┃   292 - [ ] Add landing info block in `buildMoveCall` airborne branch (after line 905)
  ┃   293 - [ ] Add `HELDACTION_PROMPT` gate
  ┃   294 - [ ] Test: L4 5×, L2 5×, L3 5× — record airborne reversal rate + death count
  ┃   295
  ┃   296 ---
  ┃   297
  ┃   298 ## End of Spec
  ┃   299
  ┃   300 Ready for implementation behind `JLNOTE_AIRBORNE=1` and `HELDACTION_PROMPT=1` independently.
  ┃

Thought: 395ms

I've written the spec for ranks 1 and 2. Now I should provide a summary to the user.

Done. Written to driver/team/SPEC_computed_discarded_ranks_1_2.md.

Summary — all four top-ranked items now unblocked and specified:

┌──────────┬─────────────────────────────────────────────────┬─────────────────────────┬──────────────────────────┬────────────────────────────────────────────────────┐
│Rank      │Item                                             │Flag                     │Status                    │Target Levels                                       │
├──────────┼─────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┤
│1         │jumpLandingNote airborne gate removal            │JLNOTE_AIRBORNE=1        │Spec ready                │L4 (mixed), L2/L3/L10 (laser-proximal)              │
├──────────┼─────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┤
│2         │heldActionIsSafe landing detail to prompt        │HELDACTION_PROMPT=1      │Spec ready                │L4 (mixed), L2/L3/L10 (laser-proximal)              │
├──────────┼─────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┤
│3         │Gem crit includes landing + ONE-WAY              │CRIT_LANDING=1           │Spec ready (earlier)      │L5/L8 (deterministic), L4 (mixed)                   │
├──────────┼─────────────────────────────────────────────────┼─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┤
│4         │platformMap dropMsg ties ends to objectives      │DROPMSG_OBJECTIVE=1      │Spec ready (earlier)      │L11 (unknown), L4 (mixed), L6 (laser-proximal)      │
└──────────┴─────────────────────────────────────────────────┴─────────────────────────┴──────────────────────────┴────────────────────────────────────────────────────┘

Key points:

- Ranks 1 & 2 were blocked on arc.simulate thickness — now verified (commit c93f9e2, 1.5px inset on all four bounds)
- Both add landing info to airborne prompt but at different granularities:
  - Rank 1: strategic — "walk to x 139, jump right to reach gem_a"
  - Rank 2: tactical — "holding right now → laser at (198,180); holding left → safe at (141,241)"
- Neither prunes actions — purely additive annotations
- Independent flags, can be enabled separately or together
- Predictions stated as distributions across N runs per level class

Measurement classes per supervisor update:

- Deterministic (L5, L8): 3 runs each, expect shift in every run
- Mixed (L4): 5 runs, expect majority shift
- Laser-proximal (L2, L3, L6, L10): 5 runs each, report median shift (2.2× spread on L2)

Next step (when you exit plan mode): Implement behind flags, run validation sweeps per spec.

▣  Plan · Nemotron 3 Ultra Free · 2m 17s

  ┃
  ┃
