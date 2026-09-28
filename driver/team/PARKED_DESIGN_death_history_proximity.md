# Parked design — death-history proximity fix

Status: **designed, not implemented, not measured.** Parked 2026-09-26 when work
moved off L4 to the regression sweep. Captured by the supervisor from the
observer's analysis before its session was restarted.

## The defect

`deathHistoryLines` (driver/decision.cjs) selects which death records reach the
prompt with an exact match on `posKey10`, which is
`Math.round(x/10)*10, Math.round(y/10)*10`.

Because it rounds rather than floors, two positions 7px apart fall in different
buckets:

```
x=231.25  ->  "230,90"
x=238.25  ->  "240,90"
```

On L4, recorded deaths on platform B sit at x = 238.25, 241.75 and 247.0, so
bucket `240,90` carries two deaths and `230,90` carries none. The prompt at
x=238.25 therefore ends with up to three lines of
`On a previous attempt from here you chose <action> and <cause>.`
and the prompt at x=231.25 ends with nothing. Every other line is identical.

The model is not being inconsistent. It is told it died at one position and not
at the other, walks away from the first, walks back toward the objective at the
second, and ping-pongs. Measured: 24 consecutive grounded decisions alternating
between exactly those two positions, p(left)~0.99 at one and p(right)~0.97 at
the other.

It also explains the corridor collapse: the deaths cluster at `240,90` and
`250,90`, which is B's only exit — `jump_left` to D works only from x 241..251,
and walking off B's right end at 251 held-right is the only route to C. The
warning covers the only productive strip on the platform.

## Why the obvious fixes are wrong

Death history is **load-bearing**. Argmax on an identical state returns an
identical answer forever, and a death resets to an identical state, so
death-keyed sampling escalation is what breaks the original livelock. Removing
or suppressing the records restores that bug. See the driver README.

## The design

Render-side, in `deathHistoryLines`. Replace the exact bucket match with a
proximity test against the recorded death position:

- **Extent: 8.75px** — one decision's travel (4 frames x `catWalkSpeed` 1.75 =
  7.00px) plus one frame (1.75px).
- **Comparison: inclusive (`<=`).** This is load-bearing, not a nicety. At the
  stall, x=231.25 is *exactly* 7.00px from the death at x=238.25. With `<` the
  warning does not fire there, the asymmetry survives, and the change is a
  silent no-op that measures as worthless. More fundamentally: a cat exactly one
  decision's travel from a recorded death is one decision away from standing on
  it — the case where the warning is most useful, not least.
- **Rendering:** keep the existing line when the cat is *in* the death bucket;
  emit a distinct "died near here" line when it is within the extent but not in
  it. Silence is what makes the boundary sharp, so the near case must say
  something.

### Do not justify the extent by "it never lands on a reachable position"

That reasoning is wrong and was corrected. Death sites do **not** lie on the
cat's 7px walking grid — on L4 they are 238.25, 241.75, 247.0, spacings 3.50
and 5.25, because a death is recorded wherever the cat died, including mid-arc
and airborne. 8.75px coincides exactly with the distance from x=238.25 to the
death at 247.0. No extent provably avoids a boundary coincidence, because death
x can be any real. **Ties are handled by inclusivity, not by choosing a lucky
number.** This is the third exact-tie defect found in one session; the other two
were `jumpHitsCeiling`'s strict `<` and this one's predecessor.

## Falsifiable prediction

- Bucket `230,90` (x=231.25): gains a "died near here" line (nearest death
  7.00px, inside 8.75 inclusive). Currently silent.
- Bucket `240,90` (x=238.25): unchanged, still carries death lines.
- Both buckets now warn, so the presence/absence asymmetry driving the flip is
  gone. `moveProbs` at `230,90` should move off confident-right (~0.971).

**Open risk, unresolved.** The deaths cover B's only exit. A uniformly warned
cat may trade the treadmill for never approaching the launch zone at all. The
two-branch signature for that was requested and never delivered before the
session was restarted.

Related: [[cat-goric-level4-cycle]] — same lesson one layer up, where the
objective `crit` scored only distance while the informative text went elsewhere.
