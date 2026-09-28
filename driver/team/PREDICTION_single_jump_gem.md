# An uncollected gem within one jump of where the cat stands

> **STATUS: the gem_b half of this is OBSOLETE. Do not build it.**
>
> The annotation run collected gem_b **unaided**. The premise below — that gem_b sits
> free at (185,187) while the cat is told to chase gem_c, and that surfacing it in the
> objective call would fix it — was true of the dump as read at 194 decisions and
> **was resolved by the run itself**, not by any change. The `ascent_right`-as-objective
> wobble did not stop the cat getting gem_b.
>
> The supervisor's tick-163 gem_b plan is withdrawn for the same reason.
>
> **What survives:** the pattern underneath it, which is now the routing problem, and
> it is recorded at the end of this file. Do not read the middle sections as a proposal.

Not built. Recorded before the annotation run landed, so the run's result does not
colour it. The annotation run and this are two different changes; only one of them
was allowed to be live at a time.

## The finding

An exhaustive simulation of a jump from every integer x on every L11 run, in all three
held directions, against both uncollected gems' collision boxes, gives:

```
gem_b (180,110)  standing jump from the y=187 run        x = 181..188
gem_b (180,110)  jumping LEFT  from the y=187 run        x = 194..223
gem_b (180,110)  jumping RIGHT from the y=114 run        x = 114..132
gem_a (180,76)   jumping RIGHT from the y=114 run        x = 117..140   (only route)
```

Derivation of the first, checked by hand: a standing jump from y=187 reaches apex
187 − 54.4 = 132.6, so the cat's box top is 132.6 − 18 = 114.6. gem_b's box is
[102, 118]. 114.6 ≤ 118, so the head enters the gem and it collects.

**PROVENANCE: the supervisor's simulation, reported to me. I have NOT independently
reproduced it.** Under the command-plus-output rule this is a claim awaiting its call
and output. The arithmetic above is the one hand-check and it holds.

## Why the cat does not take a free gem

From the live annotation run's dump, grounded at (185,187):

```
dec 4    obj=gem_c   menu=[left, right, jump, jump_left, jump_right]
dec 42   obj=gem_c   menu=[left, right, jump, jump_left, jump_right]
dec 80   obj=gem_c   menu=[left, right, jump, jump_left, jump_right]
dec 135  obj=gem_c   menu=[left, right, jump, jump_left, jump_right]
dec 173  obj=gem_c   menu=[left, right, jump, jump_left, jump_right]
```

x=185 is inside 181..188, and `jump` is on the menu every time. **A standing jump
there collects gem_b. The cat never takes it, because the objective at that state is
never gem_b — it is always gem_c.**

So this is not a move-policy problem. The driver can already compute that an
uncollected gem is one jump away and discards it. It is the same
computed-then-discarded pattern one layer up from the descent sentence: the fact
exists, is derivable, and is never said anywhere the model can score it.

## The fact to surface, and where

- **Fact:** an uncollected gem is reachable by a single jump from where the cat stands.
- **Place:** the OBJECTIVE call, not the move call. Surfacing it as a move hint would
  tell the model how to move while leaving it told to go somewhere else. The point is
  to change which goal gets chosen.
- **Restraint:** silent unless decisive. The same lesson that cost L2 eighteen
  decisions when twenty-five true descent sentences were all fired. Silence is the
  default; speak only when the free gem is the one the cat is about to walk past.
- **Probe target:** any (185,187) state in the annotation run's dump, asking whether
  the objective call moves from gem_c to gem_b.

## What the annotation run shows about the rest of the route

Measured on the live dump at 194 decisions, 39+ grounded. **This is the part that was
not known in advance.**

```
grounded decisions by floor y:
    y=187   33
    y=228    5
    y=231   44      <- gem_c's floor, now the plurality
grounded at y=114:    0      <- the run gem_a needs. Never once.
airborne y range: 133.0 .. 216.0
records within 18px of gem_a (y=76):   0
objective counts:  gem_a 97   gem_c 45   gem_b 29   ascent_right 23
```

**The cat spends 97 of 194 decisions chasing gem_a and has never been within 18px of
it, nor stood on the only floor from which it is reachable.** gem_a is not "the hard
part" — on this run it is unreachable, because the y=114 run is never visited. The
airborne floor of 133.0 also puts the cat's box top at 115.0, inside gem_b's
[102,118], which is consistent with the simulation: the ordinary jump from y=187
already reaches gem_b.

So the route decomposes as:

```
gem_c  on the y=231 run, walk to it.        DONE — the descent annotation got the cat there.
gem_b  standing jump from y=187 at 181..188. FREE, and the cat already stands there.
gem_a  only from the y=114 run at 117..140.   NOT REACHED. 0 grounded decisions at y=114.
```

**The open question the run answers is whether the cat ever reaches the y=114 run at
all.** At 194 decisions the answer is no.

## Unresolved contradiction, still open

The observer's table says the L11 run graph is "NOT fully connected — directional,
limited". Measured `reachableFrom` returns all six runs from all six, both directions,
and that output was posted. One of us is wrong and it matters for gem_a, because if
the y=114 run is not reachable from y=187 then gem_a is unreachable at all on this
level and no prompt change can fix it.

That is under the command-plus-output rule now. Ask for the call and the output, not
the conclusion. Until it is settled, treat gem_a's reachability as **unknown**, not as
hard.

## Sequencing

1. Finish and report the annotation run. One change at a time.
2. Settle the reachability contradiction with command plus output.
3. Probe the objective-call change at (185,187) before running it.
4. Only then consider whether the y=114 run needs anything at all — which depends on
   step 2 and may make gem_a a level-design question rather than a policy one.

---

# ADDENDUM: what actually survived — the first-hop routing hint

Written after the annotation run. This replaces the proposal above.

## The annotation result

gem_b and gem_c are **both collected**. Only gem_a remains. The descent annotation did
what it was built to do: y=231 went from 5 grounded decisions of 162 to 59 of 256, and
y=187 from 111 to 44, with 14 firings.

## The remaining blocker, isolated

gem_a at (180,76) has been the objective 132 times of 267 — more than any other — and
the cat has **never once stood on y=114**, the only run it can be jumped from. The
reachability question is now **settled: the graph IS connected.** `reachableFrom`
returns true for y=114 from all six runs. The observer's "NOT fully connected" is
wrong about connectivity, though true about direct edges — y=114 has no direct edge
from y=231.

Direct edges, from the driver's own graph:

```
floor(145..197@231) -> [187, 211, 228]
floor(62..114@211)  -> [152, 231]
floor(36..88@152)   -> [114, 211, 231]
floor(88..140@114)  -> [152, 211, 231, 187]

BFS from y231:  y231 -> y211 -> y152 -> y114     three hops, FIRST HOP y211 (62..114)
```

## Why the cat cannot follow it, and why this is the same defect a third time

From y=231 near x=170, the prompt describes gem_a as roughly **10px right and 155px
up**. The first hop of the route is to the y=211 run at **x 62..114 — far LEFT, and
only 20px up.** The straight-line direction to the objective and the first step of the
route point **opposite ways**.

That is the third instance of one pattern:

```
d108        objective up-and-right; correct action walk right;  model jumped
L11 fork    objective 6px right;     correct action step off LEFT; model went right
L11 gem_a   objective 155px up;      correct first hop far LEFT;   model goes right
```

Every time, the driver hands the model a straight-line offset and the route disagrees
with it. The descent annotation fixed the single-hop case. This is the multi-hop case
and it is the same defect.

**And the driver already has the answer.** `reachability.cjs` exposes the graph; the
BFS is a handful of lines. The first hop is computable at every decision and is stated
nowhere.

## The proposal

- **Fact to surface:** the first hop toward the objective, when the objective is not
  on the current floor.
- **Place:** the prompt, in the objective's vicinity, so it competes with the offset
  rather than being a separate block the model can ignore.
- **Restraint:** silent when the objective is already on this floor, or one hop away
  with an unambiguous direction. Same lesson as L2's eighteen decisions.
- **Probe target:** any decision where the objective is gem_a and the cat is grounded
  on y=231. There are many in the annotation run's dump.
- **Verify by probe before running.** The probe target must move the argmax toward the
  first hop, not merely add a sentence.
