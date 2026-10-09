# simulate() Clock Audit

`arc.simulate` takes a `movingFrames` argument. Passing a constant (0 or 1) tests the most favourable laser state that ever existed and can report a fatal action as safe. This document audits every call site in `driver/decision.cjs`.

**Total call sites: 9** — 4 pass real `movingFrames`, 5 pass a constant.

---

## Real-clock sites (defensible by construction)

### 1. `floorBelow` — line 398
```js
const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy, snap.cat.height, dir, mf, { grounded: false });
```
**What it gates:** The "falling floor" remedy note (steering toward the nearest floor below while airborne). The note claims a specific direction brings the cat over that floor; `simulate` verifies the held arc actually lands on it.
**Verdict:** DEFENSIBLE. Uses live drone positions to derive the current laser clock. The note is only emitted when the remedy survives at the *real* clock.

### 2. `jumpIsNoop` — line 443
```js
const mf = (snap.drones.tl.y - 1) / require("./physics.cjs").droneSpeed;
const r = simulate(snap.level, snap.cat.x, snap.cat.y, 0, snap.cat.height, "jump", mf, { grounded: true });
```
**What it gates:** PRUNE_NOOP — removes a straight-up jump that lands back on the same floor and touches no gem.
**Verdict:** DEFENSIBLE. Uses live drone positions. A noop jump is defined by geometry (lands on same floor), not by laser survival; the laser clock only affects whether the *apex* hits the ceiling, which is already checked by `jumpHitsCeiling` before this runs.

### 3. `jumpLandingNote` empty branch — line 999
```js
const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
const arc = simulate(snap.level, snap.cat.x, run.y, 0, snap.cat.height, dir, mf, { grounded: true });
```
**What it gates:** The "lands" clause when the optimistic envelope reaches nothing — describes the held-arc outcome (laser/void/landed) so the model knows the jump is fatal.
**Verdict:** DEFENSIBLE. Uses live drone positions. This is the laser-survival check for the jump the model might actually pick.

### 4. `descentPoints` gate — line 1756
```js
const mfNow = require("./route_clock.cjs").movingFramesOf(snap);
const survives = (hold) => {
  const r = simulate(snap.level, endX, curY, 0, snap.cat.height, hold, mfNow, { grounded: true });
  return r.outcome === "landed";
};
```
**What it gates:** Whether a descent point is offered at all. The descent is only added to the menu if stepping off (or holding `none`) survives the laser at the *current* clock.
**Verdict:** DEFENSIBLE. Uses `route_clock.movingFramesOf(snap)` for the real clock. This was the fix for the defect where a descent stayed on the menu after becoming instant laser death (open-problems.md §3, "descentPoints offered an edge that is death at the current laser state — FIXED 2026-10-08").

---

## Constant-clock sites (require audit)

### 5. `buildObjectiveCall` descent cost — line 782
```js
const r = simulate(snap.level, dp.x, snap.cat.y, 0, snap.cat.height, dir, 0, { grounded: true });
```
**What it gates:** The `ONE-WAY` cost annotation on descent points — computes whether the landing platform loses access to other live gems.
**Clock passed:** `0` (most favourable).
**Verdict:** LATENT-DEFECT.
**Reasoning:** The simulation checks reachability *from the landing platform* at mf=0. At real movingFrames the side lasers have closed in; the cat may not be able to walk as far on the landing floor before the laser cuts it off, or the jump from that floor may hit the side laser. The `ONE-WAY` verdict (stranding other gems) could be wrong in either direction: a gem declared reachable at mf=0 may be cut off by the laser at real mf, or a gem declared stranded may actually be reachable if the laser hasn't closed that far yet.
**What would settle it:** Measure the firing set of the `ONE-WAY` annotation at real mf vs mf=0 across a census of archived states. If the set of gems reported as lost changes, the defect is live.

### 6. `jumpLandingNote` held-arc scan — line 964
```js
const r = simulate(snap.level, x, run.y, 0, snap.cat.height, dir, 1, { grounded: true });
```
**What it gates:** Selection of the imperative launch x (`namedX`) — picks the x in the good window whose *held* arc (steering held through the jump) actually lands on a platform that keeps the objective reachable.
**Clock passed:** `1` (one frame in, nearly most favourable).
**Verdict:** DEFENSIBLE.
**Reasoning:** This scan verifies air-control reachability (the held-arc physics), not laser survival. The laser at mf=1 is barely different from mf=0; the side lasers move ~0.2px per frame. The purpose is to distinguish envelope reachability (optimistic, instantaneous steering) from held-arc reachability (what the cat actually does when the player holds a key). The actual laser survival for the chosen `namedX` is checked at real mf in the empty branch (line 999). A constant of 1 is a pragmatic approximation for "the physics model without laser interference".
**What would settle it:** Census the `namedX` chosen at mf=1 vs real mf across archives. If they differ, the defect is live.

### 7. `walkOffFatalNote` walk check — line 1073
```js
const r = simulate(snap.level, endX, run.y, 0, snap.cat.height, dir, 0, { grounded: true });
```
**What it gates:** The "Walking off this end kills you" warning note. If the simulation returns `landed`, the warning is suppressed (`return null`).
**Clock passed:** `0` (most favourable).
**Verdict:** LATENT-DEFECT.
**Reasoning:** At mf=0 the side lasers are at maximum width. At real movingFrames they have closed in. A walk that `lands` at mf=0 may hit the side laser at real mf, making the warning a **false negative** (the note is suppressed but the walk is actually fatal). This is the dangerous direction: the model is not warned about a lethal walk.
**What would settle it:** Census archived states where the cat is near a floor edge (within `reachEnd`). Compare `simulate` outcome at mf=0 vs real mf. Count false negatives (mf=0 lands, real mf laser).

### 8. `walkOffFatalNote` jump check — line 1075
```js
const jmp = simulate(snap.level, endX, run.y, 0, snap.cat.height, `jump_${dir}`, 0, { grounded: true });
```
**What it gates:** The escape clause "A jump left/right from that end lands safely on x..., y..." appended to the walk-off warning.
**Clock passed:** `0` (most favourable).
**Verdict:** LATENT-DEFECT.
**Reasoning:** Same clock as site 7. A jump that `lands` at mf=0 may hit the side laser at real mf. The model is told a jump escape exists when it does not at the current clock — a **false positive** escape route.
**What would settle it:** Same census as site 7. Count cases where the jump escape is reported at mf=0 but the real-mf outcome is `laser`.

### 9. `descentPoints` LANDDESC_HELD — line 1792
```js
const hr = simulate(snap.level, endX, curY, 0, snap.cat.height, side, 0, { grounded: true });
```
**What it gates:** The landing description text for descent points (only when `LANDDESC_HELD=1`, not the default). Describes where the held arc lands when stepping off the descent end.
**Clock passed:** `0` (most favourable).
**Verdict:** DEFENSIBLE (guarded).
**Reasoning:** This code path is only active under `LANDDESC_HELD=1` (opt-in env flag). The *offer* of the descent point is already gated by the real-clock check at line 1756 (site 4). This site only affects the descriptive text shown to the model. At mf=0 the held arc may land on a platform that at real mf would be cut by the laser, but the descent itself would not be offered if it didn't survive at real mf. The text may be slightly optimistic about *where* the cat lands, but the safety of the descent is already verified.
**What would settle it:** Enable `LANDDESC_HELD=1` and census the described landing platform at mf=0 vs real mf. If the described platform changes, the text is optimistic.

---

## Summary Table

| Site | Function | Line | Clock | Verdict |
|------|----------|------|-------|---------|
| 1 | `floorBelow` | 398 | real `mf` | DEFENSIBLE |
| 2 | `jumpIsNoop` | 443 | real `mf` | DEFENSIBLE |
| 3 | `jumpLandingNote` empty | 999 | real `mf` | DEFENSIBLE |
| 4 | `descentPoints` gate | 1756 | real `mfNow` | DEFENSIBLE |
| 5 | `buildObjectiveCall` descent cost | 782 | `0` | **LATENT-DEFECT** |
| 6 | `jumpLandingNote` held scan | 964 | `1` | DEFENSIBLE |
| 7 | `walkOffFatalNote` walk | 1073 | `0` | **LATENT-DEFECT** |
| 8 | `walkOffFatalNote` jump | 1075 | `0` | **LATENT-DEFECT** |
| 9 | `descentPoints` LANDDESC_HELD | 1792 | `0` | DEFENSIBLE-guarded |

**Latent defects: 3** (sites 5, 7, 8). Sites 6 and 9 are constant-clock but judged defensible for the reasons above.