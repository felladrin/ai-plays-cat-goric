# Flash level 13: the portal near-miss (measured 2026-10-10)

Flash collects all 3 gems on L13 at every seed and never clears. The failure is not
the gems and not the objective layer (with one live objective the objective call is
skipped; `candidates=1` throughout the endgame). It is one airborne steering decision,
measured with `driver/experiments/trace_l13_portal.cjs` (arc.cjs `simulate` +
`opts.onFrame`, every arc from the archived state, nothing hand-estimated).

## Collision geometry, from the game source (not assumed)

- Cat: `getCatCollisionObject` = 1px-wide column `[cx, cx+1] x [cy-h, cy]`.
- Portal: `getPortalCollisionObject` = 32x32 centred on the sprite at (180,150):
  `[164,196] x [134,166]`; checked only when `gemsCollected >= 3`.
- Gem: 16x16 sprite, anchor 0.5 (`resetGems.ts`, `getGemAnimations.ts`):
  16x16 centred on the spawn coordinate.
- `collides` (kontra) = plain AABB overlap, once per game-loop frame.

## The loop the model cannot leave (s3 steps 2557-2619, s4 steps 2052-2171)

The cat stands on floor [232,136] (spans 206..258), portal 52px left and 14px below.
It chooses `jump_left` (probs 0.60-0.67 vs `left` 0.26-0.29), then reverses to `right`
near the apex and lands back on the same floor. Measured:

- **Held `jump_left` from every launch state dies at the TOP laser** (f13-f22, head at
  y=45..52 vs the top bound at those clocks). At mf>=221 the jump lands on [182,63]
  whose headroom is already inside the closing box. The apex reversal to `right` is
  therefore NOT the failure - it is what keeps the cat alive. The earlier hand-arc
  guess that the held jump passes through the portal was wrong; the trace killed it.
- The productive route is the walk: step off the LEFT edge (x=206) and keep holding
  left. Measured from the s4 step-2138 step-off: **the trace hits the portal box at
  f6 (194.25,147.2)**.

## The actual failure: a PRUNE that deleted the winning move (corrected 2026-10-10)

**This section first said "the model steers right". That was wrong.** In s4 steps
2144 and 2162 `moveProbs` is `{"right":1}` - a softmax over a ONE-option menu.
`right` was the only option `PRUNE_FATAL` left; the model never chose to refuse the
portal. The prune is `survival.cjs isFatal`: after the committed frames it returns
`!canStillLand(...)`, i.e. "an airborne hold that cannot land on a platform is
fatal". At (197.75,140) with mf=313 the bottom bound (~246.6) burns every floor
below before the cat reaches it, so left and none could not land and were deleted -
but holding left crosses the portal box at f6, and touching the portal ENDS THE
LEVEL AS A WIN. The prune deleted the winning move. The cat did the walk-off twice,
met the one-option menu twice, and died at the deadline.

s4 steps 2138-2171, with the menu each decision actually saw:

```
step 2138 obj=portal move=left   cat=(208.25,136) on   mf=307   (steps off the left edge)
step 2144 obj=portal move=right  cat=(197.75,140) air mf=313   menu: right ONLY
step 2153 obj=portal move=left   cat=(210.00,136) on   mf=322   (landed back on the floor)
step 2159 obj=portal move=left   cat=(203.00,136) air mf=328
step 2162 obj=portal move=right  cat=(197.75,140) air mf=331   menu: right ONLY
```

**Fix (driver correctness, not a prompt fact), `survival.cjs`:** with
`gemsCollected >= 3`, an action is NOT fatal if any simulated frame before death
puts the cat's box in overlap with the portal box (`getPortalCollisionObject`: 32x32
centred on 180,150). Applied in both death paths of `isFatal`: the committed-frame
loop (checked on every frame including the death frame - `stepFrame` now returns the
position with `{dead}`) and `canStillLand` (new `portal` arg: the reachable-x
interval [lo,hi] crossing the portal box counts, same optimistic interval semantics
as the landing test). `landingPlatforms` (hits mode) is unchanged. Test:
`test_portal_prune_l13.cjs` + `fixtures/portal_pruned_l13.json` (the verbatim step-2144
entry): RED on the old rule (left/none fatal, prune keeps only right), GREEN after;
control gc=2 keeps left fatal (portal not live). `npm test` green.

## The candidate fact: REACH_FACT

The reaching hold is exactly computable at every airborne decision: for each hold in
{left, right, none}, `simulate` the hold from the live state with a frame trace and
test the trace against the objective's collision box. When EXACTLY ONE hold reaches
the objective before landing or dying, say so once, consequence-framed, no
coordinates: `Holding left reaches the portal in 2 frames; right lands back on the
floor.` Gated `REACH_FACT=1`, off by default, byte-identical prompt when off - same
discipline as EXIT_FACT.

The predicate lives in `decision.cjs` (`reachHolds`), exported; the census
(`driver/experiments/census_reach_fact.cjs`) requires it, one source of truth.
Census question (the refined version of the airborne-reversal question): when exactly
one hold reaches the objective, how often does the archived move take it? Split by
level and model; the L13 prediction is that Flash fails exactly these states and
Clef/Darwin take them.

## Status

- [x] Trace tool: `experiments/trace_l13_portal.cjs` (arc.cjs gained an opt-in
      `opts.onFrame(x,y,f,dy)` callback, a no-op when absent; physics unchanged).
- [x] `reachHolds` predicate in decision.cjs + REACH_FACT sentence in buildMoveCall.
- [x] Census over all archives (`experiments/census_reach_fact.cjs`): below, with
      single-option menus excluded from compliance.
- [x] PRUNE_FATAL portal exemption in survival.cjs + `test_portal_prune_l13.cjs`.
- [ ] Live A/B on L13 (needs the Flash container back up): the prune fix alone may
      be enough - the archetype states now keep `left` on the menu.

## Census (2026-10-10, corrected): 350 archives, 65,952 decisions

Single-option menus are excluded from compliance (`singleOptionMenu` 1,004): a
one-option menu is not a choice - that was the L13 lesson.

```
reason tallies: grounded 40098, noneReach 22525, fired 2175, singleOptionMenu 1004,
multipleReach 150

by endpoint:
  Darwin-27B-ZTC/systemone          1631/50062 ( 3.3%) comply=88.7%
  Phocinae-Largha-150M-v1/systemone  231/13046 ( 1.8%) comply=64.9%
  PurpleMIST-Flash-1.0/systemone     206/ 1456 (14.1%) comply=85.9%
  clef                               107/ 1388 ( 7.7%) comply=92.5%

level 13, Flash only (s1-s5):  25/2383 (1.0%) comply=24.0%   (multi-option menus only)

pruned portal-reaching holds (blast radius of the PRUNE_FATAL bug): TOTAL 66
  L13 Flash 13 (steps 2144,2162,2180,2210,2213,2228,...)  L4 clef 30
  L10 PurpleMIST-Mini 16   L4 Darwin 5   L10 Flash 1   L6 Flash 1
```

Readings:

1. **The prune bug was real but narrow**: 66 archived decisions across all levels had
   a portal-reaching hold deleted from the menu - 13 of them Flash L13 (including
   both archetype steps). Even Clef was hit 30 times on L4 and still cleared, so a
   pruned winning move costs a level only when no other route exists. The fix's own
   blast radius (`blast_portal_prune.cjs`, old vs new `pruneFatal` menus): 78 of
   66,166 archived decisions change, all at gc>=3 (L4 40, L10 17, L13 13, L0 6,
   L6 1, L9 1); no clearing level's prompts are touched.
2. **A model gap remains after the correction**: with one-option menus excluded,
   Flash L13 compliance is still 24.0% (19 refusals of 25 genuine states). The
   archetype states were the prune bug; the remaining 19 are the model steering
   away from a reachable portal.
3. **Compliance separates the models**: Clef (clears) 92.5%, Darwin 88.7%, Flash
   85.9% overall but 24.0% on L13. Flash fires 14.1% of the time (vs Darwin 3.3%):
   it loiters airborne near objectives in exactly-one-hold-reaches states.
4. Verification: `REACH_FACT` unset leaves all 65,463 rebuilt move states
   byte-identical (`blast_exit_fact.cjs`); with the gate on, exactly the census
   firings change, each a pure one-line insertion. `npm test` green; the new
   simulate call site is audited as site 11 in simulate-clock-audit.md.
