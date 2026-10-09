# Blast radius: fixing the site-6 constant clock

**Question.** Site 6 of the simulate-clock audit (`jumpLandingNote`'s held-arc launch-x pick, `decision.cjs:964`, `SIMULATE_CLOCK_AUDIT: constant 1 (DEFECT-LIVE)`) picks the launch x with the laser frozen at mf=1. The census shows the pick shifts or dies at the real clock in 194/194 firing states. Before spending any live wall-clock on the fix, `docs/open-problems.md` requires the offline prompt-diff blast radius: how many decision prompts would change, and whether any change touches menu entry count (the seeded-shuffle RNG-desync hazard).

**Method.** `driver/experiments/blast_site6_clock.cjs` (offline, deterministic, no endpoint, no browser):

- Builds the FIXED variant by compiling `decision.cjs` source in memory with the one call-site swapped — `dir, 1,` → `dir, movingFramesOf(snap),` — under the same filename so relative requires resolve. The shipped file is never modified.
- Synthetic state grid per level: every floor run, catX step 4px, `mf ∈ {0,100,200,300,400,500}` (laser via `drones.tl.y = 1 + 0.2·mf`), objective = each live gem, all gems alive. 29,916 states across the 14 playable levels (0–13, same ladder as the census; index 14 is the victory screen).
- Each state builds `buildMoveCall` under BASE and FIXED; comparison is the order-insensitive canon from `docs/open-problems.md` (sorted state lines + sorted menu entries), so menu-shuffle order cannot produce false diffs.
- Verified deterministic: two runs byte-identical.

```
node driver/experiments/blast_site6_clock.cjs
```

**Result.**

| level | states | changed | note | window | other | menu |
|---|---|---|---|---|---|---|
| 0 | 1008 | 0 | 0 | 0 | 0 | 0 |
| 1 | 1512 | 6 | 4 | 2 | 0 | 0 |
| 2 | 1728 | 28 | 0 | 28 | 0 | 0 |
| 3 | 2520 | 0 | 0 | 0 | 0 | 0 |
| 4 | 1260 | 55 | 0 | 55 | 0 | 0 |
| 5 | 2016 | 0 | 0 | 0 | 0 | 0 |
| 6 | 2268 | 0 | 0 | 0 | 0 | 0 |
| 7 | 3528 | 18 | 18 | 0 | 0 | 0 |
| 8 | 2268 | 0 | 0 | 0 | 0 | 0 |
| 9 | 2016 | 30 | 30 | 30 | 0 | 0 |
| 10 | 2268 | 0 | 0 | 0 | 0 | 0 |
| 11 | 1512 | 0 | 0 | 0 | 0 | 0 |
| 12 | 3240 | 0 | 0 | 0 | 0 | 0 |
| 13 | 2772 | 13 | 13 | 0 | 0 | 0 |
| **ALL** | **29916** | **150 (0.5%)** | 65 | 115 | 0 | **0** |

(`note` + `window` exceed `changed` because 30 prompts change in both lines.)

**Findings.**

1. **The blast radius is small and fully explained.** 150/29,916 prompts change (0.5%), and every one is attributable to a site-6 output — zero "other". Eight of fourteen levels are provably untouched on this grid (zero firings ⇒ prompts identical by construction, per the `firing_counts.cjs` scheduling rule: do not queue live runs for them).
2. **The change reaches further than the note line.** 115 of the 150 changes are NOT the `A jump from x …` note — they are the gap-crossing sentence ("a jump crosses it only from x L..R"), which reads `jumpLandingNote._window` through the same-snap side channel at `decision.cjs:1344`. When the pick dies at the real clock, `_window` goes null and the sentence loses its crossing range. Any review of the fix must look at that sentence too, not just the note.
3. **No RNG-desync hazard.** Zero prompts change menu entry count; the fix only rewrites state text. The canon comparison is order-insensitive regardless.
4. **Concentration.** L4 (55), L9 (30), L2 (28), L7 (18), L13 (13), L1 (6). L2 and L4 change ONLY via the `_window` sentence — the note itself is unchanged there — which is exactly the kind of effect a note-only review would miss.

**Bottom line.** A live regression of the site-6 clock fix is a sane next step: 0.5% of synthetic prompts change, none through the menu, and eight levels can be skipped outright. When the live sweep is run, schedule only L1, L2, L4, L7, L9, L13 (plus any level whose archives show the note or the crossing sentence firing).
