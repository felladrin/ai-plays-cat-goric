# Parked: the descent-criteria experiment

Reverted out of `driver/decision.cjs` because it regressed L1 and L2. See
`../HANDOFF_DESCENT_CRITERIA.md` for the full account.

| file | note |
|---|---|
| `decision.descent-experiment.cjs` | all four changes; drop-in replacement for `decision.cjs` |
| `test_descent_criteria.reverted.cjs` | its test; passes against the experiment, fails against `decision.cjs` |
| `lvl.sh` | run one level, print a one-line summary |

Two known defects, both described in the handoff: the direction filter's
`ahead()` test misfires when the landing platform straddles the step-off edge
(kills L2), and `gemOn()`'s 30px tolerance misses gems that float ~52px above
their platform (also L2).

To try it: `cp experiments/decision.descent-experiment.cjs decision.cjs` and
`cp experiments/test_descent_criteria.reverted.cjs test_descent_criteria.cjs`.
Sweep L0-L9 before believing anything.

---

## Script status (audited 2026-10-09)

### Broken — require `decision.patched_*.cjs` files deleted 2026-10-08 (see git history)

| script | missing dependency |
|---|---|
| `../run_urgency.cjs` | `decision.patched_urgency.cjs` |
| `census_route_hint.cjs` | `decision.patched_route.cjs` |
| `check_route_hint.cjs` | `decision.patched_route.cjs` |
| `check_lock_truth_table.cjs` | `decision.patched_lockonly.cjs` |
| `urgency_firing_sweep.cjs` | `decision.patched_urgency.cjs` |
| `census_airborne_lock.cjs` | `decision.patched_airborne.cjs` |
| `check_ascent_crit.cjs` | `decision.patched_ascent.cjs`, `decision.patched_ascent_crit.cjs` |

### Broken — wrong path to `cat-goric-game/src/scripts/constants/config.ts`

| script | issue |
|---|---|

### Offline-runnable diagnostics (no doc references; run clean without inputs)

| script | what it measures |
|---|---|
| `gem_floor_offset.cjs` | census of platform/gem vertical offsets; validates the "on THIS floor" 26px bound in decision.cjs |
| `collect_table.cjs` | per-gem collectibility table and upward hop counts from reachability.cjs |
| `probe_move.cjs` | reconstructs one decision's prompt from an archive and re-asks the endpoint (needs --run archive) |
| `diag_gate_blast_radius.cjs` | blast radius of the hop_points.cjs:116 one-character change (y231→y211 landing gate) |
| `diag_hop_scan.cjs` | which filter in hopPoints rejects the y231→y211 landing, by first-reject tally |
| `landings_hash.cjs` | SHA-256 of all `landingsFrom` + `graph` outputs (null control for additive reachability changes) |
| `probe_urgency_l12.cjs` | whether a DESTROYED-FIRST superlative on gem_b moves the classifier at L12 spawn (needs endpoint) |
| `census_simulate_clock.cjs` | census of three constant-clock `simulate()` sites vs real-mf grid (sites 5,7,8 from simulate-clock-audit.md) |
| `firstpick_sweep.cjs` | blast-radius sweep: which states have a DEAD first-pick across all levels/floors/x/mf |
| `route_clock.cjs` | offline route-vs-clock analyzer; run with `--state` or level args for per-ordering feasibility |
| `probe_strict.cjs` | whether JEV_STRICT changes classifier probabilities on objective/move questions (needs endpoint) |
| `test_demo_skip.cjs` | validates the DEMO_KEEP level-skip rewrite against the real harness (needs playwright) |

### Need inputs a fresh clone lacks (run archives in `out/`, or `prompt_dump.jsonl`)

| script | input needed |
|---|---|
| `census_gem_from.cjs` | run archive JSON files (`out/...run_level_*.json`) |
| `firing_counts.cjs` | prompt dump (`/tmp/prompt_dump_L*.jsonl`) |
| `probe_clef.cjs` | archive with gem spawn (`--spawn-from out/...json`) |
| `log_verdict_audit.cjs` | run archive JSON files |
| `dump_oscillations.cjs` | prompt dump (`/tmp/prompt_dump_L*.jsonl`) |
| `waypoint_verdict_audit.cjs` | run archive JSON files |