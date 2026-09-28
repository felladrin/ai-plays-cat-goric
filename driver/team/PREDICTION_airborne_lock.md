# PREDICTION — the airborne lock (holding a waypoint through a jump)

Written before the build, before the census, before any live run. No endpoint
call has been made against this change.

## THE STACK — three changes, stated so a reader can attribute a result

`decision.patched_airborne.cjs` is change 3 **on top of** change 2 **on top of**
change 1. It is not a standalone patch and must never be A/B'd against HEAD.

| # | change | lives in | measured as |
|---|--------|----------|-------------|
| 1 | gate off-by-one, `hop_points.cjs:116` `landed[1] >= curY - 20` → `>` | `driver/hop_points.patched.cjs` (ONE line) | 14 menus, one floor, all L11 y231; purely additive; L2/L3 menus untouched |
| 2 | ascent crit — the consequence clause in `buildObjectiveCall` | `decision.patched_airborne.cjs` at :626-641 and :729 | argmax flipped 0.0303 → 0.6488 at d173; chained move jump → jump_left |
| 3 | **the airborne lock — the two sites of this prediction** | `decision.patched_airborne.cjs` hunks 1-3 | NOT YET MEASURED |

- `hop_points.patched.cjs` is required by change 2, so **an A/B of change 3 must
  use `decision.patched_ascent_crit.cjs` as its BASELINE ARM and
  `decision.patched_airborne.cjs` as its patched arm** — `probe_move.cjs
  --baseline`. Probing change 3 against HEAD measures all three at once and
  cannot attribute anything.
- 1 and 2 are already measured and already accounted for: change 1 is on the
  `ascent_left` candidate, and change 2 is what makes the model pick it. **Change
  3 is inert without both** — a waypoint lock only exists if the model selects
  the waypoint, which is change 2's job.
- The live L11 run that produced the `ascent_left` y211 stall ran this same stack
  (decision + gate) with the 20px one-frame launch offset still unfixed, and its
  scoreboard did not move. That run is the baseline for the P4 falsifier, not a
  regression.

## The defect, as measured

`decision.cjs:2009-2013` holds the locked objective when `!snap.onPlatform`, so
the lock is *designed* to survive a jump. The last clause,
`objCall.objectiveNames.includes(memo.lockedObjective)`, is false airborne for a
waypoint because `hop_points.cjs:79` returns `[]` with no run underfoot. The
lock is **starved, not broken** — the portal is held through the same flight for
the opposite reason, that it stays on the menu. On L11, 36 steps after launching
up the left climb, the cat was 59.5px right and 38px below its own launch floor.

## The change — two sites, one expression each

1. `decision.cjs:2009-2013`, the `held` test. The menu clause is applied **only
   on the ground**, so a waypoint whose launch window it walked out of still
   releases (that meaning is load-bearing and documented at `:1987-1991`). The
   `WAYPOINT_COMMIT_CAP` is applied to the airborne disjunct **for waypoints
   only**, so a flight cannot push a lock past 30 charged decisions. Gems and the
   portal keep the current unconditional airborne hold, bit for bit.
2. `buildMoveCall:870-872`, the ascent branch: use the `(x,y)` resolved on the
   ground at lock time and carried in the memo, instead of re-deriving it from a
   name that no longer resolves. **The throw stays**, firing only when no carried
   target exists, naming the state.

`buildLayaMoveCall:1489-1490` is the same shape at the same lines. It is the
Laya-level path, not in this level's call chain, and I am not touching it in this
change — recorded as the twin to fix, not as a third site.

Why carrying beats re-deriving: the name maps to two landings (ascent_right is
(211.25,187) from y231 and (105.75,114) from y152). Resolved once, on the ground,
from an unambiguous origin floor, there is exactly one target.

## The crit is NOT part of this change

A held objective is never re-asked (`decision.cjs:2050-2052` sets
`objectiveProbs = {[objective]: 1}` and logs *"not re-asked"*), so the objective
call text cannot reach the model on this path. The ascent crit and its
straight-line px field are out. The only text the model sees is the move call.

## REVISED STOP CONDITION (the old one was not a test)

The previous condition — *"if the scored text of any airborne decision on the six
solid levels changes, we stop and think"* — fires at the 25 affected records
necessarily, since holding a different objective changes the target. An
instrument whose answer is fixed in advance is not a test.

**The gate is runs.** Stop if:

* any of **L0 L1 L2 L5 L7 L8** fails to clear, or
* **L0 or L8** produces a different trajectory at all — each has exactly one
  distinct outcome across 7 and 15 archived files, so any change there is signal
  rather than noise.

The census is **diagnostic, not a gate**: where and what, per record.

## Registered predictions

**P1 — the census (WHERE).** For all 25 solid-level records the held waypoint is
the preceding grounded objective and the carried target is non-null in every one,
because it was resolved on the ground from a menu that contained it. Predict
**25 of 25 non-null**. I decline to predict how many of those targets are
reachable from the airborne position; the census will report it and I have no
basis for a number.

**P2 — which solid level moves.** L7 is the most exposed of the six: its 2
affected records are the only ones measured on a level that clears
deterministically today, and the `portal -> portal HELD` row shows the airborne
hold already working there. Predict **L7 is the first solid level whose
trajectory changes**. If none of the six changes, the change is too small to have
worked on L11 either, and I will report that.

**P3 — the descent cases are the risk, and the gate is where it shows.** A
descent target is the end x of the floor at the cat's y: *"walk to that edge and
step off, the fall follows."* Held through a flight, the cat is already off that
floor, so the reason the point existed no longer applies. Affected descent
records: L0 1, L2 (both kinds), L8 1, L9 1. L0 and L8 are in the gate precisely
because they are deterministic and cheap. I predict nothing about the sign; I
predict that if this change is harmful anywhere, it shows there first.

**P4 — L11.** Today the cat reaches y211 eight times and never y152, and 36
steps after each launch it is back on y231. With the lock held the objective
stays `ascent_left` and the move call steers to the carried y152 landing. Predict
**grounded visits to y152 > 0**, against 0 today. Falsifier: the objective
releases at the landing (`floor changed` — correct behaviour, and the climb dies
one decision later) or the cat still lands back on y231.
