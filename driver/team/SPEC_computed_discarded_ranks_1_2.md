# Spec — Computed-Then-Discarded Fixes: Ranks 1 & 2 (Now Unblocked)

**Status: specified, NOT implemented.** Stage behind `JLNOTE_AIRBORNE=1` and `HELDACTION_PROMPT=1` respectively.

Provenance: inventory by `nemotron-3-ultra-free`; supervisor blocked on `arc.simulate` thickness — **now verified** (commit c93f9e2, lines 95–98 inset all four bounds by `CFG.maxLaserHalfSize` = 1.5px). The `landed` verdict is now correct near lasers.

> **Transcription warning.** Treat any oddity as a capture artifact. Re-grep every line number by symbol before use.

---

## Measurement Baseline (Supervisor Update)

Five runs of L8 and two runs of L5 returned **byte-identical** state/action sequences. L2 varied 2.2×. Irreproducibility confined to routes that pass near a laser. Deterministic levels validated with few runs; laser-proximal levels need distribution comparison.

| Level | Class | Evidence |
|-------|-------|----------|
| L5 | Deterministic | 2 runs byte-identical |
| L8 | Deterministic | 5 runs byte-identical |
| L2 | Laser-proximal | 2.2× spread on unchanged tree |
| L4 | Mixed | Start floor deterministic; A-floor & y=171 laser-proximal |
| L6 | Laser-proximal | Stacked walls near side lasers |
| L10 | Laser-proximal | Similar to L6 |
| L11 | Unknown | Single run5 observed |

Predictions below stated as **distributions across N runs** on the indicated class.

---

## Rank 1 — `jumpLandingNote` Airborne Gate Removal

### 1.1 Exact Symbol & Location

**Function:** `jumpLandingNote`  
**File:** `driver/decision.cjs`  
**Lines:** 623–772  
**Called from:** `buildMoveCall` line 895 (grounded), **NOT called** in airborne branch (lines 903–909)  
**Exports:** `jumpLandingNote` (not exported, internal)

### 1.2 Current Behaviour

```javascript
function jumpLandingNote(snap, target) {
  if (!snap.onPlatform || !target) return null;  // LINE 624 — THE GATE
  // ... full jump analysis using REACH.landingsFrom + arc.simulate held-arc ...
  // Returns: "A jump from x X lands on ...; A jump from x LO..HI reaches ...; You are at x X, outside the launch window; walk DIR to around x N, then jump DIR there."
}
```

```javascript
// buildMoveCall grounded (line 876-898):
if (snap.onPlatform) {
  const _jl = jumpLandingNote(snap, target);
  if (_jl) lines.push(_jl);
  // ...
}
// buildMoveCall airborne (line 903-909):
} else {
  lines.push(`The cat is airborne...`);
  const snapNote = sideSnapNote(snap);
  if (snapNote) lines.push(snapNote);
  // NO jumpLandingNote call
}
```

- Grounded: full landing analysis + walk-then-jump instruction
- Airborne: **zero** jump landing information. Only `sideSnapNote` (platform side-snap while falling).

### 1.3 Exact Change

**Option A (minimal):** Remove `!snap.onPlatform` gate; make function work for airborne too.

```javascript
function jumpLandingNote(snap, target) {
  if (!target) return null;  // REMOVED: !snap.onPlatform
  // ... rest unchanged ...
  // For airborne: snap.cat.dy >= 0 (falling) or < 0 (rising)
  // simulate called with { grounded: false } at line 735
  // Note: REACH.platformKeyUnder may return null mid-air — that's fine, returns null early
}
```

**Option B (cleaner):** Add airborne-specific path that uses `arc.simulate` with current `dy`, `mf`, `grounded: false` (same as `heldActionIsSafe` does). But the existing code at line 735 already does this for the empty-envelope branch — it just needs the gate removed.

Minimal change: **delete `!snap.onPlatform ||` at line 624**.

The function already:
- Computes `mf` from drone position (line 735)
- Calls `simulate` with `{ grounded: true }` for grounded scan (lines 701, 736)
- Calls `simulate` with `{ grounded: false }` for airborne empty-envelope branch (line 736)
- Returns held-arc verified launch window + walk-then-jump instruction

### 1.4 Exact Rendered Wording (Airborne Example)

**Before (airborne, L4 at 136.75,75 after jumping for gem_a):**
```
The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.
```

**After (same state):**
```
The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.
A jump from x 137 lands on floor(156..208@241); gem_a cannot be reached from there. A jump from x 137..140 on this same floor reaches a platform from which gem_a can still be reached. You are at x 137, outside the launch window; walk right to around x 139, then jump right there.
```

(Note: the "A jump from x 137" uses current x as launch reference since cat is airborne; the walk instruction is metaphorical — steer toward the window.)

### 1.5 What It Must NOT Do

- ❌ Change `jumpLandingNote` logic — only remove the gate
- ❌ Prune actions — annotation only
- ❌ Add new simulator calls — reuses existing `simulate` calls at lines 701, 736
- ❌ Alter `buildMoveCall` airborne branch beyond adding the call
- ❌ Touch `jumpLandingNote._window` cache — works unchanged

### 1.6 Falsifiable Prediction (Distribution Across N Runs)

**Target levels:** L4 (airborne after launch), L2, L3, L10 — **L4 mixed, L2/L3/L10 laser-proximal**

| Metric | Before (baseline) | After (predicted) | N runs |
|--------|-------------------|-------------------|--------|
| L4: objective flip rate in first 20 frames after launch (gem_a → gem_b) | ~0.85 (6/6 at 18px) | ≤0.20 | 5 (mixed) |
| L4: airborne deaths from steering into stranding (gem_a locked) | 25/31 (81%) | ≤5/31 (16%) | 5 (mixed) |
| L2: airborne deaths on multi-gem floors | baseline | ≤0.5× baseline | 5 (laser-proximal) |
| L3: equivalent | baseline | ≤0.5× baseline | 5 (laser-proximal) |

**Validation:** Run 5× on L4 with `JLNOTE_AIRBORNE=1`. Record:
- `objective` at each airborne decision (from `laya_prompt_dump.json` or `halogen_prompt_dump.json`)
- Death count + cause while airborne
- Compare to baseline (gate enabled)

**Note on laser-proximal levels (L2, L3, L10):** Expect distribution shift (median death rate halved), not per-run guarantee. Report median airborne death count across 5 runs.

---

## Rank 2 — `heldActionIsSafe` Returns Landing Detail to Airborne Prompt

### 2.1 Exact Symbol & Location

**Function:** `heldActionIsSafe`  
**File:** `driver/arc.cjs`  
**Lines:** 108–119  
**Called from:** `run_full.cjs:498`, `run_level.cjs:565` (as `holdIsSafe: (cur) => heldActionIsSafe(cur, d.move)`)  
**Exports:** `heldActionIsSafe` (line 121)

### 2.2 Current Behaviour

```javascript
function heldActionIsSafe(snap, action) {
  if (!snap || snap.onPlatform) return null;
  const h = snap.cat.height;
  if (!h) throw new Error("heldActionIsSafe: snap.cat.height missing; harness is broken");
  const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
  const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, action, mf, { grounded: false });
  // r = { outcome: "landed"|"laser"|"void"|"timeout", x, y, frames, ... }
  return r.outcome === "landed";
}
```

- Returns `true` (landed), `false` (laser/void/timeout), or `null` (grounded/invalid)
- **Discards** `r.x`, `r.y`, `r.frames`, `r.outcome` detail
- Used ONLY as boolean gate: `if (holdIsSafe) { re-ask }` in runners

### 2.3 Exact Change

**Change return type** from `boolean | null` to:

```javascript
// NEW return type:
type HeldActionResult =
  | { safe: true; landing: { x: number; y: number; frames: number; outcome: "landed" } }
  | { safe: false; outcome: "laser" | "void" | "timeout"; x?: number; y?: number; frames?: number }
  | null;  // grounded or invalid

function heldActionIsSafe(snap, action) {
  if (!snap || snap.onPlatform) return null;
  const h = snap.cat.height;
  if (!h) throw new Error("heldActionIsSafe: snap.cat.height missing; harness is broken");
  const mf = snap.drones && snap.drones.tl ? (snap.drones.tl.y - 1) / CFG.droneSpeed : 0;
  const r = simulate(snap.level, snap.cat.x, snap.cat.y, snap.cat.dy || 0, h, action, mf, { grounded: false });
  if (r.outcome === "landed") {
    return { safe: true, landing: { x: r.x, y: r.y, frames: r.frames, outcome: "landed" } };
  }
  return { safe: false, outcome: r.outcome, x: r.x, y: r.y, frames: r.frames };
}
```

**Thread into airborne prompt** (`buildMoveCall` lines 903–909):

```javascript
} else {
  lines.push(`The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.`);
  // NEW: held-action landing info for each legal steer action
  const { heldActionIsSafe } = require("./arc.cjs");
  const legal = legalActions(snap); // { left, right, none }
  const landingInfo = [];
  for (const [actionKey, actionLabel] of Object.entries(legal)) {
    const r = heldActionIsSafe(snap, actionKey);
    if (r && r.safe) {
      landingInfo.push(`Holding ${actionLabel} lands at (${Math.round(r.landing.x)},${Math.round(r.landing.y)}) in ${r.landing.frames} frames.`);
    } else if (r && !r.safe) {
      landingInfo.push(`Holding ${actionLabel} → ${r.outcome}${r.x != null ? ` at (${Math.round(r.x)},${Math.round(r.y)})` : ""}.`);
    }
  }
  if (landingInfo.length) lines.push(landingInfo.join(" "));
  const snapNote = sideSnapNote(snap);
  if (snapNote) lines.push(snapNote);
}
```

### 2.4 Exact Rendered Wording (Airborne Example)

**Before (airborne, L4 at 136.75,75, dy=-4.2):**
```
The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.
```

**After (same state):**
```
The cat is airborne: it cannot jump now, but steering is instant and reversible — it can reverse direction or stop horizontally on any frame.
Holding steer left in the air lands at (141,241) in 12 frames. Holding steer right in the air → laser at (198,180). Holding keep current trajectory, no steering lands at (154,241) in 14 frames.
```

### 2.5 What It Must NOT Do

- ❌ Change `run_full.cjs` / `run_level.cjs` boolean usage — they already do `holdIsSafe(cur) && ...`; truthy object works
- ❌ Add new simulator calls — reuses exact same `simulate` call
- ❌ Prune actions — all 3 airborne actions stay on menu
- ❌ Alter `legalActions` — unchanged
- ❌ Touch grounded code path — `snap.onPlatform` returns `null` unchanged

### 2.6 Falsifiable Prediction (Distribution Across N Runs)

**Target levels:** L4 (airborne), L2, L3, L10 — **L4 mixed, L2/L3/L10 laser-proximal**

| Metric | Before (baseline) | After (predicted) | N runs |
|--------|-------------------|-------------------|--------|
| L4: airborne reversal rate (steer opposite to launch direction) | 39.6% (measured) | ≤10% | 5 (mixed) |
| L4: airborne deaths from steering into laser/void | baseline | ≤0.3× baseline | 5 (mixed) |
| L2: airborne death rate | baseline | ≤0.5× baseline | 5 (laser-proximal) |
| L3: airborne death rate | baseline | ≤0.5× baseline | 5 (laser-proximal) |

**Validation:** Run 5× on L4 with `HELDACTION_PROMPT=1`. Record from dumps:
- `move` choice at each airborne decision vs `argmaxMove`
- Death count + cause while airborne
- `holdIsSafe` return values (now objects)

**Note on laser-proximal levels:** Distribution shift (median death rate halved). Report median across 5 runs.

---

## Interaction Between Rank 1 & 2

Both add landing information to the **airborne prompt** but at different granularities:

| | Rank 1 (`jumpLandingNote`) | Rank 2 (`heldActionIsSafe`) |
|---|---|---|
| **Scope** | Jump-from-ground analysis (walk to window, then jump) | Current airborne steer actions (hold left/right/none) |
| **Source** | `REACH.landingsFrom` (envelope) + `simulate` held-arc verify | `simulate` with current `dy`, `mf`, `grounded: false` |
| **Trigger** | Grounded cat with objective on different floor | Airborne cat (any `dy`) |
| **Complement** | Tells where to jump FROM | Tells where each steer LANDS |

**Both enabled:** Airborne cat sees:
1. `jumpLandingNote`: "If you were on floor, walk to x 139 and jump right to reach gem_a"
2. `heldActionIsSafe`: "Holding right now lands at (198,180) → laser; holding left lands at (141,241) safe"

This gives the model **both** the strategic jump plan AND the immediate steer consequences.

---

## Staging

| Flag | Item | Default | Rollback Condition |
|------|------|---------|---------------------|
| `JLNOTE_AIRBORNE=1` | Rank 1 | OFF | Any passing-level regression on 14-level sweep |
| `HELDACTION_PROMPT=1` | Rank 2 | OFF | Any passing-level regression on 14-level sweep |

Independent flags — can be enabled separately or together. **Both require `arc.simulate` thickness fix (verified).**

---

## Implementation Checklist

### Rank 1 (`JLNOTE_AIRBORNE=1`)
- [ ] Remove `!snap.onPlatform ||` from `jumpLandingNote` line 624
- [ ] Add call in `buildMoveCall` airborne branch (after line 905)
- [ ] Add `JLNOTE_AIRBORNE` gate around the call
- [ ] Test: L4 5×, L2 5×, L3 5× — record airborne `objective` flip rate + death count

### Rank 2 (`HELDACTION_PROMPT=1`)
- [ ] Change `heldActionIsSafe` return type to object (lines 108–119)
- [ ] Verify runner boolean usage still works (truthy object = true)
- [ ] Add landing info block in `buildMoveCall` airborne branch (after line 905)
- [ ] Add `HELDACTION_PROMPT` gate
- [ ] Test: L4 5×, L2 5×, L3 5× — record airborne reversal rate + death count

---

## End of Spec

Ready for implementation behind `JLNOTE_AIRBORNE=1` and `HELDACTION_PROMPT=1` independently.