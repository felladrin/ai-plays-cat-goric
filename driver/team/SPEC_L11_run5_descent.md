# L11 spec — run5 descent annotation

**Status: specified, NOT implemented, NOT measured.** Cheapest actionable item
on the board as of 2026-09-26. Produced by the `mimo-v2.6-flash-free` instance
and captured by the supervisor from its pane before context exhaustion.

> **Transcription warning.** Captured from a rendered terminal pane, not written
> to disk by its author. Treat mangled tables or truncated lines as capture
> artifacts. Re-grep every line number by symbol before use.

> **Measurement warning.** Every behavioural number below comes from a single
> run dated 25 September, which predates both global fixes in the current tree.
> Runs are irreproducible — see [[cat-goric-runs-are-irreproducible]] — with a
> measured 2.2x spread in decisions on an unchanged tree. Nothing here is
> evidence until it is reproduced across N runs on the current build.

> **Margin warning — CORRECTED 2026-09-26 by the supervisor.** The original
> warning here said the gates were optimistic by "up to 3px, roughly 15 frames".
> **That overstates it by a factor of two and it was my error, not the
> author's.** The game draws laser beams 1.5-3.0px thick, but every laser sprite
> is anchored on its own drone's centreline (`instances.ts`), so only **half**
> the thickness points into the field: **0.75-1.5px, about 7 frames**, not 15.
>
> Second correction: the warning is now only partly live. `arc.cjs` insets all
> four bounds by `maxLaserHalfSize` as of commit `c93f9e2`, so any gate this
> spec derives **through `arc.simulate`** is no longer optimistic. Only gates
> computed by hand from raw drone arithmetic still are. Check which kind each of
> this spec's gates is before adjusting it.

---

L11 SPEC — fix the run5 descent annotation (self-contained; capture now)

Context: Level 11 of the Cat Goric classifier driver, halogen endpoint. Cat spawns (248,228); floor run5 = platform (207,187), x 181..233; goal gems a(180,76) b(180,
110) c(191,212); portal (180,150). Driver file: driver/decision.cjs. Line numbers below were grepped on the current 2038-line build; the file grew +29 lines mid-
session, so re-grep by symbol before quoting or editing — anchor on function name, not line.

1. The failure

The cat stands on run5 at x ≈ 181.5 — already at the left end (one left frame exits the floor). Objective is gem_c (191,212): 17px below this floor and uncollectible
from it (cat box 169,187 vs gem box 204,220). Its only collection spot is standing on floor (171,231), x 145..197, at x∈182,197.

The move question built by buildMoveCall (symbol, :820) asks at :911 "Which single command moves the cat toward the objective?" — menu from legalActions (:253) = walk
left/right + jumps; *left is offered and never pruned*. The prompt already says (in platformMap :937): "…ONLY descents from this floor are at its ends: x 181 (left)
and x 233 (right)" and "Step off the LEFT end (x 181) and you steer to land on platform x 145..197 at y 231. Step off the RIGHT end (x 233) and you steer to land on
platform x 222..274 at y 228."

The gap: both landings are named; neither is tied to the objective. Left lands (171,231) — the floor gem_c is collected from; right lands (248,228) — gem_c not
collectible there (run0 starts x=222, past the collect window). The only text answering "toward the objective" points right (gem_c x=191 > 181.5). The model picks
right, the offset flips sign at x=191, and the cat pendulums 181.5–200 — turning around at the exit point. descentPoints (~:1192) does offer descent_left (~0.5px away,
gate passes) but the observed run chose it 0 times.

2. Verdict: driver defect (missing annotation), medium-high confidence

Not pruning (menu correct), not wrong geometry (landings computed correctly). One linking fact is absent: which landing the objective is on. In-file precedent shows
this model obeys stated route facts decisively (the gap-sentence measurements inside platformMap flip it from right 0.711 to right 0.006). Residue: the objective layer
preferring a 26px collectible over a 0.5px waypoint is model behavior — but the move layer runs whichever objective wins, so fixing the move prompt covers both paths.
This is worth buying: annotation-only, one file, one region.

3. The change

Where: platformMap's dropMsg block (~:1130–1137).

What: when the target is a live gem, compute holder = REACH.platformHolding(level, target.x, target.y) (reachability.cjs:145). For each end whose dropFrom(endX)
landing set includes that holder, append: "— that landing is the platform gem_X is collected from." Fail-open (no text change) when: no holder (mid-air gems like L11
gem_a/gem_b, portal, descent/ascent targets), or holder among no end's landings.

Must NOT: touch legalActions — no option may be pruned (all five grounded actions stay); contain any level-number check (pure geometry: holder == landing); alter
descentPoints labels (gem-on-landing advertising was tried and rejected there for the objective menu — this clause goes only in the move prompt for the already-chosen
target); change scoring, cadence, or any other prompt block.

4. Prediction (distribution across N runs)

Gate before editing: run the current build on L11 N = 5 times. Ship only if the signature — decisions at cat on run5, x∈181,187, obj=gem_c, argmax move=right — appears
in ≥3 of 5 runs. If absent, the diagnosis is stale; stop and re-triage.

After the edit (N = 5 runs, compare distributions, never single diffs):

- Primary: at that same state, argmax flips to left in ≥4/5 runs (same-prompt effect, expected to be near-deterministic; failure bar = flip absent in ≥2/5).
- Behavioral: gem_c collected early (before mf≈150) in ≥3/5 runs; [unwinnable … collected=0] deaths drop from the observed 5/7-per-run toward ≤1 per run as a
  distributional shift that exceeds run variance (2.2× demonstrated on L2) — counts from single runs are not evidence.
- Stretch, not promised: full clear (won:true), conditional on early descent so the tower beats gem_a's burn (mf 375) and the run3 gem-jump gate. If deaths instead
  migrate to collected=1/2, the annotation worked and only timing is short — that does not falsify §3.

5. What would make me wrong

1. Baseline gate fails (no signature across 5 runs) → starting state wrong; ship nothing.
2. Annotation lands, argmax unchanged in ≥2/5 runs → model defect after all: offset dominates stated route facts here. Stop; do not pile on text.
3. Flip works, descent happens, gem_c still not collected → second behavioral point on (171,231); spec incomplete.
4. Descent ends off-floor (void/laser) on the current build → landing claim wrong; check the post-fix trace for (171,231).
5. Other platformMap levels (L4/L5) regress toward a one-way landing → clause too persuasive where the holder-floor is a trap.

6. Evidence provenance

Rests on the single 25-September run (one sample, stale build — re-verify, do not cite): the pendulum itself; p(right) 0.67–0.80 at x=181.5; obj counts (gem_c 297/300,
descent_left 0); death tallies (7 deaths, 5× collected=0, zero laser deaths); move counts; "grounded menu never offers none" (code-corroborated in legalActions, so low
risk).

Rests on source and geometry (stands): all platform/gem/portal coordinates and collect windows (box arithmetic); burn thresholds (isOutOfLasersBounds uses drone
centers — unaffected by thickness); edge scans and route windows (arc.simulate); the prompt gap itself (dropMsg names both landings, ties neither to the objective;
legalActions offers left); descentPoints gating math.

Margins now suspect (sprite-vs-drone thickness): the game draws laser beams at random 1.5–3.0px thick, redrawn every frame from unseeded Math.random, and collides the
cat against the sprite, while the driver's timing gates — my L11 run3 gem-jump takeoff gate (mf<187), the L13 run6 standing gate (mf≈220→actually 205–212), and arc.
cjs's own line-based laser test (~:75) — are all computed from drone position alone. Every gate is optimistic by up to 3px ≈ 15 frames. State it plainly: a route that
"clears by 2px" does not clear; no sub-3px margin computed today is safe. The L11 spec's §4 gates (mf≈150 descent, mf<187→172–179 takeoff) inherit this — treat them as
~15 frames tighter than written.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

Accept the 205 correction: I did write it; misremembering, dropped. The thickness propagation you flagged is now stated plainly above as required.

▣  Plan · MiMo-V2.6-Flash Free · 32.8s

  ┃
  ┃
  ┃
  ┃  Plan · MiMo-V2.6-Flash Free OpenCode Zen
  ╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
   /Users/victor/Repositories/js13k-2021                                                                                                        158.4K (79%)  ctrl+p commands
