# Spec — Computed-Then-Discarded Fixes: Ranks 3 & 4 (Unblocked)

**Status: specified, NOT implemented.** Stage behind `CRIT_LANDING=1` and `DROPMSG_OBJECTIVE=1` respectively.

Provenance: inventory by `nemotron-3-ultra-free`; supervisor blocked ranks 1–2 on `arc.simulate` thickness correction; ranks 3–4 rest on platform geometry and reachability, not the laser test.

> **Transcription warning.** Treat any oddity as a capture artifact. Re-grep every line number by symbol before use.

---

## Sequencing Constraint (Supervisor)

Ranks 1 and 2 surface `arc.simulate` landings. That function's laser bounds omit the 1.5–3.0px sprite thickness, so `landed` verdicts near a laser are optimistic. Surfacing them more prominently would add confident false reassurance exactly where the cat dies. **Ranks 1–2 must follow the `arc.simulate` thickness fix.**

Ranks 3 and 4 use **platform geometry + reachability graph** only — no laser test. They are unblocked and go first.

---

## Measurement Baseline (Supervisor Update)

Five runs of L8 and two runs of L5 returned **byte-identical** state/action sequences. L2 varied 2.2×. Irreproducibility is confined to routes that pass near a laser. Deterministic levels can be validated with few runs; laser-proximal levels need distribution comparison.

| Level | Class | Evidence |
|-------|-------|----------|
| L5 | Deterministic | 2 runs byte-identical |
| L8 | Deterministic | 5 runs byte-identical |
| L2 | Laser-proximal | 2.2× spread on unchanged tree |
| L4 | Mixed | Start floor deterministic; A-floor & y=171 laser-proximal |
| L6 | Laser-proximal | Stacked walls near side lasers |
| L11 | Unknown | Single run5 observed |

Predictions below are stated as **distributions across N runs** on the indicated class.

---

## Rank 3 — Gem `crit` Includes Landing Platform + ONE-WAY Cost

### 3.1 Exact Symbol & Location

**Function:** `describe()` inside `buildObjectiveCall`  
**File:** `driver/decision.cjs`  
**Lines:** 353–380 (the `describe` closure)  
**Exports:** `buildObjectiveCall` (line 294)

### 3.2 Current Behaviour

```javascript
const describe = (name, gx, gy) => {
  // ... computes dx, dy, dist, gm, walk, overshot ...
  return {
    line: `- ${name} at (${gx},${gy}): straight-line ${dist}px (...); nearest closing laser ${Math.round(gm.min)}px away (${gm.side} side).${flagStr}`,
    crit: `${name}: straight-line ${dist}px${walk ? ", reachable by walking (no jump)" : ""}${overshot ? ", overshot/behind on your platform" : ""}`,
  };
};
```

- `line` (state prose) gets flags: `REACHABLE BY WALKING`, `OVERSHOT`, laser margin.
- `crit` (scored field) gets **only** straight-line distance + walk/overshot flags.
- **Missing from `crit`:** landing platform after jump/descent, ONE-WAY stranding cost.
- Descent points (lines 566–574) **do** put landing + ONE-WAY in `crit` — gems do not.

### 3.3 Exact Change

In `describe()`, after computing `flags` and before `return`, add:

```javascript
// Compute landing platform & ONE-WAY for this gem (grounded cat only)
let landingCrit = "";
if (snap.onPlatform && reachable) {
  const holder = REACH.platformHolding(snap.level, gx, gy);
  if (holder) {
    const after = REACH.reachableFrom(snap.level, holder, snap.cat.height);
    if (after) {
      const lost = alive
        .filter((o) => o.name !== name)
        .filter((o) => {
          const h = REACH.platformHolding(snap.level, o.x, o.y);
          return h && reachable.has(h) && !after.has(h);
        })
        .map((o) => o.name);
      if (lost.length) {
        landingCrit = ` ONE-WAY: taking ${name} first loses ${lost.join(" and ")} permanently (no route back up from its floor).`;
      } else {
        // Positive link: which floor the gem sits on
        const runs = REACH.runsOf(snap.level);
        const run = runs.find((r) => REACH.runKey(r) === holder);
        if (run) {
          landingCrit = ` on floor x ${Math.round(run.left)}..${Math.round(run.right)} at y ${run.y}.`;
        }
      }
    }
  }
}
```

Then append `landingCrit` to `crit`:

```javascript
crit: `${name}: straight-line ${dist}px${walk ? ", reachable by walking (no jump)" : ""}${overshot ? ", overshot/behind on your platform" : ""}${landingCrit}`,
```

### 3.4 Exact Rendered Wording (Examples)

**Before (L4, gem_c on floor D):**
```
crit: "gem_c: straight-line 137px"
```

**After (L4, gem_c on floor D, gem_a stranded):**
```
crit: "gem_c: straight-line 137px on floor x 156..208 at y 241. ONE-WAY: taking gem_c first loses gem_a permanently (no route back up from its floor)."
```

**After (L5, gem_b reachable, no stranding):**
```
crit: "gem_b: straight-line 98px on floor x 79..131 at y 180."
```

### 3.5 What It Must NOT Do

- ❌ Prune any objective from the menu
- ❌ Change `line` (state prose) — only `crit` (scored field) changes
- ❌ Add knowledge the driver doesn't already compute (`reachableFrom`, `platformHolding` already called for stranding at lines 420–435)
- ❌ Touch airborne code path — `snap.onPlatform` gate keeps it grounded-only
- ❌ Use `arc.simulate` or any laser test — pure reachability graph

### 3.6 Falsifiable Prediction (Distribution Across N Runs)

**Target levels:** L4 (gem_a vs descent), L5, L8 — **L5 & L8 deterministic class**

| Metric | Before (baseline) | After (predicted) | N runs |
|--------|-------------------|-------------------|--------|
| L5: gem_a choice probability when on start floor | ~0.05 (proximity trap) | ≥0.90 | 3 |
| L8: equivalent gem choice prob (if same geometry) | ~0.10 | ≥0.85 | 3 |
| L4: gem_a vs right descent on start floor (gem_a collected) | descent_right 0.98 | gem_a ≥0.80 | 5 (mixed class) |

**Validation:** Run 3× on L5, 3× on L8, 5× on L4 with `CRIT_LANDING=1`. Compare `objectiveProbs` for the target gem at the decision point. Deterministic levels (L5, L8) must show the shift in **every run**; L4 shows shift in majority.

---

## Rank 4 — `platformMap` `dropMsg` Ties Each End to the Objective It Serves

### 4.1 Exact Symbol & Location

**Function:** `platformMap` → `dropFrom` closure  
**File:** `driver/decision.cjs`  
**Lines:** 1084–1099 (`dropFrom`), 1131–1136 (`dropMsg` assembly)  
**Exports:** `platformMap` (line 937)

### 4.2 Current Behaviour

```javascript
const dropFrom = (endX) => {
  // ... computes reachable platforms below via steer envelope ...
  if (!reachable.length)
    return { survivable: false, text: `fall to the bottom laser (no platform reachable by steering)` };
  const best = reachable
    .map((r) => `steer to land on platform x ${Math.round(r.e.left)}..${Math.round(r.e.right)} at y ${r.p[1]}`)
    .join("; ");
  return { survivable: true, text: best };
};
```

```javascript
if (nearLeftEnd || mustDescend)
  dropMsg += `Step off the LEFT end (x ${Math.round(run.left)}) and you ${dropLeft.text}. `;
if (nearRightEnd || mustDescend)
  dropMsg += `Step off the RIGHT end (x ${Math.round(run.right)}) and you ${dropRight.text}. `;
```

- `dropFrom` returns `{survivable, text}` where `text` lists **landing platforms only**.
- `dropMsg` prefixes with "Step off LEFT/RIGHT end... and you [text]."
- **No connection to which gem/portal each landing serves.**

### 4.3 Exact Change

In `dropFrom`, after computing `reachable` platforms, add objective linkage:

```javascript
// NEW: which objectives does each landing platform reach?
const REACH = require("./reachability.cjs");
const objHolders = new Map();
for (const obj of objectives) { // objectives already in scope (line 1218-1219)
  const h = REACH.platformHolding(snap.level, obj.x, obj.y);
  if (h) objHolders.set(h, obj);
}
```

Replace the `best` mapping (lines 1095–1097) with:

```javascript
const best = reachable
  .map((r) => {
    const key = REACH.runKey(r.p);
    const obj = objHolders.get(key);
    const objStr = obj ? ` (reaches ${obj.name})` : "";
    return `steer to land on platform x ${Math.round(r.e.left)}..${Math.round(r.e.right)} at y ${r.p[1]}${objStr}`;
  })
  .join("; ");
```

**`objectives`** is already defined at lines 1217–1219 in `descentPoints` scope; `platformMap` receives `target` (the current objective) but needs **all remaining objectives**. Pass `alive` gems + portal to `platformMap` or recompute inside (cheap).

Minimal change: add at top of `platformMap` (after line 997):

```javascript
const alive = matchGemsToSpawn(levelGems, snap.gemPositions); // levelGems passed in or require
const objectives = alive.map((g) => ({ name: g.name, x: g.x, y: g.y }));
if (snap.gemsCollected >= 3) objectives.push({ name: "portal", x: PORTAL.x, y: PORTAL.y });
```

### 4.4 Exact Rendered Wording (Examples)

**Before (L11 run5):**
```
Step off the LEFT end (x 120) and you steer to land on platform x 100..140 at y 200.
Step off the RIGHT end (x 200) and you steer to land on platform x 220..260 at y 180.
```

**After (L11 run5, gem on left landing):**
```
Step off the LEFT end (x 120) and you steer to land on platform x 100..140 at y 200 (reaches gem_c).
Step off the RIGHT end (x 200) and you steer to land on platform x 220..260 at y 180 (reaches portal).
```

**After (L4 start floor, gem_a on floor C):**
```
Step off the LEFT end (x 95) and you steer to land on platform x 79..131 at y 180 (reaches gem_b).
Step off the RIGHT end (x 147) and you steer to land on platform x 156..208 at y 241 (reaches gem_c).
```

### 4.5 What It Must NOT Do

- ❌ Prune descent points — `descentPoints` already filters dead ends (line 1240)
- ❌ Change `gapMsg` or `runMsg` — only `dropMsg` text changes
- ❌ Use `arc.simulate` — uses existing steer envelope (`dropFrom`) + reachability graph
- ❌ Add new simulator calls — `reachableFrom` + `platformHolding` already in memory
- ❌ Alter `mustDescend` logic or `showDrop` gate — same firing conditions

### 4.6 Falsifiable Prediction (Distribution Across N Runs)

**Target levels:** L11 (pendulum), L4 (start floor), L6 — **L11 unknown, L4 mixed, L6 laser-proximal**

| Metric | Before (baseline) | After (predicted) | N runs |
|--------|-------------------|-------------------|--------|
| L11: pendulum at exit (oscillation count before commit) | ≥8 oscillations | ≤2 oscillations | 5 (unknown class) |
| L4: right descent choice on start floor (gem_a collected) | 1.00 (17/17) | ≤0.20 | 5 (mixed class) |
| L6: any descent choice leading to dead end | >0.50 | ≤0.10 | 5 (laser-proximal) |

**Validation:**
- L11: run 5× with `DROPMSG_OBJECTIVE=1`, count position revisits at exit portal before objective lock. Deterministic shift expected if L11 is deterministic.
- L4: run 5×, record `objective` choice at first decision on start floor (gem_a collected). Expect gem_c (left descent) in ≥4 of 5.
- L6: run 5×, record descent choices that lead to dead-end floors (no route to remaining gems). Compare rate.

**Note on laser-proximal levels (L6):** Since irreproducibility is confined to laser-proximal routes, the prediction is a **distribution shift** (majority of runs show improvement), not a per-run guarantee. Use 5 runs minimum; report median oscillation count / choice probability.

---

## Staging

| Flag | Item | Default | Rollback Condition |
|------|------|---------|---------------------|
| `CRIT_LANDING=1` | Rank 3 | OFF | Any passing-level regression on 14-level sweep |
| `DROPMSG_OBJECTIVE=1` | Rank 4 | OFF | Any passing-level regression on 14-level sweep |

Independent flags — can be enabled separately or together.

---

## Implementation Checklist

### Rank 3 (`CRIT_LANDING=1`)
- [ ] Add `landingCrit` computation in `describe()` (uses existing `reachable`, `alive`, `REACH`)
- [ ] Append to `crit` string
- [ ] Verify `line` (prose) unchanged
- [ ] Add `CRIT_LANDING` gate around the addition
- [ ] Test: L5 3×, L8 3×, L4 5× — record `objectiveProbs` at target decisions

### Rank 4 (`DROPMSG_OBJECTIVE=1`)
- [ ] Add `objectives` array in `platformMap` (gems + portal)
- [ ] In `dropFrom`, build `objHolders` map from `objectives`
- [ ] Annotate each landing platform with `(reaches <obj>)`
- [ ] Add `DROPMSG_OBJECTIVE` gate
- [ ] Test: L11 5× (pendulum count), L4 5× (descent choice), L6 5× (dead-end rate)

---

## End of Spec

Ready for implementation behind `CRIT_LANDING=1` and `DROPMSG_OBJECTIVE=1` independently.