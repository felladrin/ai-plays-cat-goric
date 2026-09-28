# Inventory — computed then discarded

**Status: inventory only. No fixes proposed here by design.** Produced by the
`nemotron-3-ultra-free` instance; captured by the supervisor from its pane.

The recurring non-physics defect in `driver/`: the driver **computes the
deciding fact and fails to put it where the classifier scores it.** Not missing
knowledge, not wrong physics — a connection never made. See
[[cat-goric-computed-then-discarded]] for the three founding instances (L4
objective cycle, L4 airborne descent, L11 run5).

Ten instances found. Ranked by expected value, i.e. impact divided by change
size. All are annotation-only: they prune nothing, add no knowledge the driver
does not already hold, and carry almost no blast radius — the cheapest class of
change in this codebase.

> **Transcription warning.** Captured from a rendered terminal pane, not written
> to disk by its author; tables may be mangled. Re-grep every line number by
> symbol before use.

> **Sequencing constraint added by the supervisor — read before implementing.**
> Ranks 1 and 2 both surface landings derived from `arc.simulate`. That
> function's laser bounds are computed from drone position with no thickness
> term, while the game collides against a sprite 1.5–3.0px thick, so its
> `landed` verdicts near a laser are optimistic. **Surfacing an optimistic
> verdict more prominently and more often is actively worse than discarding
> it** — the driver would tell the model "you land safely" with new confidence
> and be wrong. Ranks 1 and 2 must therefore follow the `arc.simulate`
> thickness correction. Ranks 3 and 4 rest on platform geometry and
> reachability rather than on the laser test, so they are unblocked and should
> go first.

---

│   │                   │distance, side             │                │                                  │**falling** (dy >= 0).│not warned. The cat can brush a        │
│   │                   │                           │                │                                  │ Rising (dy < 0`)     │platform on the way up, get snapped,   │
│   │                   │                           │                │                                  │suppressed.           │and the model never knew it was        │
│   │                   │                           │                │                                  │                      │possible.                              │
├───┼───────────────────┼───────────────────────────┼────────────────┼──────────────────────────────────┼──────────────────────┼───────────────────────────────────────┤
│3.4│descentPoints /    │Waypoint objectives for    │Gated at 1193 / │Airborne cat cannot select a      │L4 (descent points),  │High — code at 1193, 79; airborne lock │
│   │ascentPoints (     │floor ends / higher        │79: if (!snap.  │descent/ascent point as objective.│L5, L8                │documented at 1828-1844                │
│   │decision.cjs:1192- │platforms                  │onPlatform)     │ Once airborne, the objective is  │                      │                                       │
│   │1300, hop_points.  │                           │return [];      │locked (sticky) but the waypoint  │                      │                                       │
│   │cjs:78-145)        │                           │                │vocabulary vanishes. If the cat   │                      │                                       │
│   │                   │                           │                │needs to adjust mid-air toward a  │                      │                                       │
│   │                   │                           │                │descent point, it can't — only    │                      │                                       │
│   │                   │                           │                │steer left/right/none.            │                      │                                       │
└───┴───────────────────┴───────────────────────────┴────────────────┴──────────────────────────────────┴──────────────────────┴───────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Pattern 4: Fact Correct but Not Tied to Current Objective (Archetype: L11 platformMap)

┌───┬───────────────────┬─────────────────────────────┬──────────────────────────────────┬──────────────────────────────────────┬────────────────┬─────────────────────┐
│#  │Function / Symbol  │What Is Computed             │Where It Dies                     │What Model Is Deprived Of             │Levels Affected │Confidence           │
├───┼───────────────────┼─────────────────────────────┼──────────────────────────────────┼──────────────────────────────────────┼────────────────┼─────────────────────┤
│4.1│platformMap        │For each floor end:          │Presented as undifferentiated     │Model knows left end drops to         │L11, L4, L6     │Certain — supervisor │
│   │dropMsg / gapMsg ( │survivable drop targets (    │geometry facts: "Step off LEFT    │platform D, right end crosses to      │                │cited L11 run5       │
│   │decision.cjs:1131- │steer to land on platform x..│end and you steer to land on      │platform B — but not "left end serves │                │explicitly           │
│   │1174)              │.), gap width, jump-cross    │platform... The gap RIGHT is 52px;│gem_b, right end serves gem_c". On    │                │                     │
│   │                   │qualification, escape jump   │ jump crosses only from x 137..   │L11, objective gem is only            │                │                     │
│   │                   │to higher platform           │140." No connection to which      │collectible from LEFT landing, but    │                │                     │
│   │                   │                             │objective each serves.            │only right gapMsg says "jump crosses".│                │                     │
│   │                   │                             │                                  │ Model pendulums at exit.             │                │                     │
├───┼───────────────────┼─────────────────────────────┼──────────────────────────────────┼──────────────────────────────────────┼────────────────┼─────────────────────┤
│4.2│hopPoints /        │For each side: nearest       │Returns ascent_left/ascent_right  │Model sees "left ascent: platform at  │L4 (gem_a via   │High — code at 136-  │
│   │higherLandings (   │launch x, landing platform,  │with label describing landing     │x 79..131 y 180 (52px above),         │same-height hop)│142; supervisor      │
│   │hop_points.cjs:51- │relative height (above/level/│platform. No field links landing  │reachable by jumping left from x 121" │, L5, L8, L11   │noted L4 gem_a only  │
│   │75, 101-143)       │below)                       │to which gem/portal it reaches.   │but not "this ascent reaches gem_b".  │                │route is same-height │
│   │                   │                             │                                  │When multiple objectives exist, model │                │hop                  │
│   │                   │                             │                                  │cannot rank ascents by goal relevance.│                │                     │
├───┼───────────────────┼─────────────────────────────┼──────────────────────────────────┼──────────────────────────────────────┼────────────────┼─────────────────────┤
│4.3│buildObjectiveCall │stranding(g) computes:       │Only attached to the gem being    │When scoring gem_c, model sees        │L4 (gem_c vs    │High — code at 420-  │
│   │stranding          │"TAKING THIS FIRST LOSES     │evaluated (added to its line and  │"TAKING THIS FIRST LOSES gem_a" — but │gem_a), L5, L8  │435; measured 0.963  │
│   │annotation (       │gem_x AND gem_y PERMANENTLY: │crit). The lost gems are named    │doesn't see "gem_c IS REACHABLE from  │                │prob for gem_a with  │
│   │decision.cjs:420-  │no route back up from gem_z" │but the current objective (the    │here". The positive link is missing;  │                │annotation           │
│   │435)               │                             │one being scored) is not          │only negative losses are listed.      │                │                     │
│   │                   │                             │explicitly tied as "this choice   │                                      │                │                     │
│   │                   │                             │serves gem_c".                    │                                      │                │                     │
└───┴───────────────────┴─────────────────────────────┴──────────────────────────────────┴──────────────────────────────────────┴────────────────┴─────────────────────┘

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Additional Instances (Not Cleanly Fitting Four Patterns)

┌───┬──────────────────────┬───────────────────────┬──────────────────────────────────────┬──────────────────────────────────┬────────────────┬────────────────────────┐
│#  │Function / Symbol     │What Is Computed       │Where It Dies                         │What Model Is Deprived Of         │Levels Affected │Confidence              │
├───┼──────────────────────┼───────────────────────┼──────────────────────────────────────┼──────────────────────────────────┼────────────────┼────────────────────────┤
│5.1│legalActions jump     │jumpHitsCeiling(snap)  │Explanation in state: "Head clearance │Model sees jump on menu or not,   │All grounded    │High — code at 267, 884-│
│   │prune + explanation ( │prunes all jump        │is Xpx, less than a jump needs, so    │but never "you have 70px headroom │decisions near  │894; the 7px band (57.6-│
│   │decision.cjs:253-281, │actions when headTop < │jumping is no longer possible" (line  │— jump is safe for 3 more moving  │ceiling         │64.6) was the jumpApex  │
│   │884-894)              │64.6px                 │890-893). But: when jump IS available,│frames" or "you have 60px — jump  │                │regression              │
│   │                      │                       │ no text explains the 64.6px          │will be pruned in 2 frames".      │                │                        │
│   │                      │                       │threshold or remaining headroom.      │                                  │                │                        │
├───┼──────────────────────┼───────────────────────┼──────────────────────────────────────┼──────────────────────────────────┼────────────────┼────────────────────────┤
│5.2│countdownLine (       │Frames until laser at  │Only shown when remaining < needed (  │Model gets a binary "you're late" │All levels      │Medium — by design;     │
│   │decision.cjs:124-134) │current position vs.   │provable miss). Never shown per-      │or nothing. No per-action time    │under time      │supervisor may consider │
│   │                      │straight-line frames   │option. Never shows "if you walk      │budget. The countdown is a clock, │pressure        │this intentional        │
│   │                      │to objective           │right, laser arrives in 12 frames; if │not a planner — by design (line   │                │                        │
│   │                      │                       │you jump left, 18 frames."            │92-93) — but that IS the          │                │                        │
│   │                      │                       │                                      │disconnect.                       │                │                        │
├───┼──────────────────────┼───────────────────────┼──────────────────────────────────────┼──────────────────────────────────┼────────────────┼────────────────────────┤
│5.3│buildLayaMoveCall     │Asks "Does the cat     │Separate question from direction. The │Direction choice doesn't know     │Laya path only (│Medium — Laya-specific; │
│   │jump NOUL question (  │need to jump to gain   │jump NOUL probability is not          │jump decision. On Laya,           │not main decide)│main decide uses        │
│   │decision.cjs:1433-    │height?"               │connected to the direction criteria.  │composeLayaMove combines them     │                │combined move call      │
│   │1437)                 │                       │Model answers jump-needed and         │post-hoc with threshold. The two  │                │                        │
│   │                      │                       │direction independently.              │classifiers don't share context.  │                │                        │
├───┼──────────────────────┼───────────────────────┼──────────────────────────────────────┼──────────────────────────────────┼────────────────┼────────────────────────┤
│5.4│Airborne objective    │held objective carried │Airborne buildMoveCall (line 903-909) │Model pursues locked objective    │L4 (critical),  │Certain — documented at │
│   │lock (decision.cjs:   │from launch; not re-   │has no stranding annotations, no      │with degraded information. The    │L2, L3, L10     │1828-1844; measured 35/ │
│   │1828-1844, 1891-1896) │asked while airborne   │jumpLandingNote, no walkOffFatalNote. │stranding warning that made it    │                │40 vs 6/6 flip          │
│   │                      │                       │Only bare state + platformMap +       │pick gem_a on ground is gone 18px │                │                        │
│   │                      │                       │sideSnapNote.                         │into the jump.                    │                │                        │
└───┴──────────────────────┴───────────────────────┴──────────────────────────────────────┴──────────────────────────────────┴────────────────┴────────────────────────┘

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Ranking by Expected Value (Impact ÷ Change Size)

┌────┬────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│Rank│Item                                        │Why High Value / Small Change                                                                                       │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│1   │3.1 jumpLandingNote airborne gate           │Remove !snap.onPlatform gate; pass target to airborne buildMoveCall. Annotation-only, no pruning, ~5 lines. Fixes   │
│    │                                            │L4 airborne stranding (25/31 deaths).                                                                               │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│2   │1.1 heldActionIsSafe landing info to prompt │Currently returns true/false/null. Change to return {safe: bool, landing: {...}} and thread into airborne prompt.   │
│    │                                            │One function signature + prompt template. Fixes 39.6% reversal rate.                                                │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│3   │2.1 crit for gems includes landing + ONE-WAY│In describe(), add landing platform and stranding cost to crit (already computed via reachableFrom). Mirror of      │
│    │                                            │descentPoints fix (line 573). Fixes L4 gem_a vs descent proximity trap.                                             │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│4   │4.1 platformMap tie dropMsg to objective    │In dropFrom(), compute which objectives each landing platform reaches (via reachableFrom). Add to text: "Step off   │
│    │                                            │LEFT → lands on platform D (reaches gem_b)". ~10 lines. Fixes L11 pendulum.                                         │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│5   │3.2 walkOffFatalNote airborne gate          │Same as 3.1: remove gate, thread to airborne prompt. Fixes L4 y=171 floor end deaths.                               │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│6   │3.3 sideSnapNote rising gate                │Remove snap.cat.dy < 0 gate; compute side-snap risk for rising arcs too. Fixes silent side-snap on ascent.          │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│7   │4.2 hopPoints tie landing to objective      │In hopPoints, for each landing platform, compute which objectives it reaches. Add to label/crit. Fixes L4 gem_a     │
│    │                                            │same-height hop invisibility.                                                                                       │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│8   │1.2 jumpLandingNote empty branch held-arc   │Always use held-arc outcome for lands string (already computed at 734-742). Remove envelope branch. Wording-only,   │
│    │                                            │firing set unchanged.                                                                                               │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│9   │5.1 legalActions jump threshold explanation │Always show "Head clearance Xpx (jump needs 64.6px; safe for N frames)" when jump on menu. 3 lines.                 │
├────┼────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│10  │2.3 gapMsg include target objective         │Use win.plat → platformHolding → which gem. "Jump crosses only from x 137..140 to reach gem_c".                     │
└────┴────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Items Marked as Inferred from Run Data (Single-Sample, Unreliable)

Per supervisor's constraint: the following have importance inferred from run data (single-sample, 2.2x spread demonstrated):

- 1.3 walkOffFatalNote jump simulation — measured L4 y=171 deaths but single-run
- 2.2 descentPoints proximity trap — "17/17 right descent picks" single-run
- 3.1 jumpLandingNote airborne — "35/40 vs 6/6" single-run
- 4.1 platformMap L11 pendulum — single run5 observation
- 5.4 Airborne lock flip — "measured at launch position" single-run

The certain items (derived from source, not runs): 1.1, 1.2, 2.1, 2.3, 3.2, 3.3, 3.4, 4.2, 5.1, 5.3 — these are structural code patterns visible in the source.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Summary

10 distinct instances of the "computed but not connected" pattern across 2 files. The top 4 fixes are annotation-only, prune nothing, add no knowledge, and carry near-
zero blast radius — exactly the class the supervisor described. The physics-divergence inventory (laser thickness in simulate, ceiling model) is the other half; this
inventory is the plumbing half.

▣  Plan · Nemotron 3 Ultra Free · 2m 6s

  ┃
  ┃  Proceed now with the computed-then-discarded inventory.
  ┃  8:21 PM
  ┃

Thought: 3.8s

The user is asking me to proceed with the computed-then-discarded inventory. But I'm in "Plan Mode" - read-only phase where I cannot make any edits.

Looking at my previous response, I already provided a comprehensive inventory of the "computed but not connected" patterns in the codebase. The user said "Proceed now
with the computed-then-discarded inventory" - but I already completed that inventory in my last message (m0060).

Wait, let me re-read. The user's message m0061 says "Proceed now with the computed-then-discarded inventory." and there's a system reminder that I'm in Plan Mode (read-
only).

But I already provided the inventory in m0060. The inventory is complete - I found 10 distinct instances across the four patterns plus additional instances.

Perhaps the user wants me to:
1. Present a plan for fixing these issues (since I'm in plan mode)
2. Or they're confirming the inventory is done and want me to proceed to planning fixes

Given I'm in plan mode (read-only), I should not make any edits. The inventory is already done. The natural next step would be to propose a plan for addressing the
highest-value items.

