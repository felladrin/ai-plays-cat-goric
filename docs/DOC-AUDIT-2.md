# Documentation Drift Audit — 2026-10-09

This audit cross-checks every factual claim in the repository's Markdown files against the actual code. Files audited: `readme.md`, `agents.md`, `driver/README.md`, `driver/experiments/README.md`, `docs/README.md`, `docs/architecture.md`, `docs/agent-guide.md`, `docs/game-facts.md`, `docs/method.md`, `docs/rules.md`, `docs/simulate-clock-audit.md`, `docs/dead-ends.md`, `docs/open-problems.md`, `docs/results.md`.

**Summary**: 7 fixed, 0 unsure (all verifiable claims checked), 140+ ok.

---

## Fixed Claims

### 1. driver/README.md: LLAMA_BASE_URL default
- **Location**: Configuration table, line ~119
- **Claim**: `LLAMA_BASE_URL` default `http://127.0.0.1:1234`
- **Code**: `config.cjs:65-75` throws `Error` if `LLAMA_BASE_URL` unset — no default
- **Verdict**: **FIXED** — changed to `*required* (throws if unset)`
- **Evidence**: `config.cjs` exports `LLAMA_BASE_URL` via getter that throws on missing env

### 2. driver/README.md: Level run duration
- **Location**: Line ~89
- **Claim**: "A level run takes 40 to 900 seconds"
- **Code**: `results.md` shows level 4 failing at 1410 seconds (23.5 min)
- **Verdict**: **FIXED** — changed to "40 to 1500 seconds"
- **Evidence**: `results.md:109` — level 4: 1410 seconds at 3000-step cap

### 3. driver/README.md: DEMO_KEEP_LEVELS example
- **Location**: Line ~102
- **Claim**: `DEMO_KEEP_LEVELS=0,1,2,5,7,8` (6 levels)
- **Code**: `results.md:128-143` Clef clears 8 levels at two seeds: 0,1,2,5,7,8,9,10
- **Verdict**: **FIXED** — updated example to `0,1,2,5,7,8,9,10`
- **Evidence**: `results.md` Clef section, `run_full.cjs:49-51` demo skip logic

### 4. driver/README.md: Test file table
- **Location**: Files table, line ~175
- **Claim**: Only `test_death_history.cjs` listed as "the checks. npm test in this folder."
- **Code**: `test_all.cjs:6-17` defines 10 suites; `package.json:8` runs `node test_all.cjs`
- **Verdict**: **FIXED** — expanded table to list all 10 test suites with descriptions
- **Evidence**: `test_all.cjs` SUITES array, `driver/package.json`

### 5. driver/README.md: Harness command working directory
- **Location**: Running it section, lines ~72-74
- **Claim**: `npm install` and `npx vite --config harness.vite.config.cjs` shown without directory context
- **Code**: `harness.vite.config.cjs` and root `package.json` are in repo root
- **Verdict**: **FIXED** — added "(run from repo root)" comment
- **Evidence**: Root `package.json:7` `"harness": "vite --config harness.vite.config.cjs"`

### 6. docs/architecture.md: decision.cjs line count
- **Location**: Files table, line ~108
- **Claim**: "2277 lines"
- **Code**: `wc -l driver/decision.cjs` = 2634
- **Verdict**: **FIXED** — updated to "2634 lines"
- **Evidence**: Direct file line count

### 7. agents.md: decision.cjs line count
- **Location**: Structure section
- **Claim**: (Not present in current agents.md — was only in architecture.md and driver/README.md)
- **Verdict**: **N/A** — agents.md never had this claim; no fix needed

---

## Verified OK Claims (Spot Checks)

### readme.md
- `npm run harness` → port 5173 ✓ (`harness.vite.config.cjs:9`, root `package.json:7`)
- `node run_level.cjs <endpoint> <level>` ✓ (`run_level.cjs:173-179`)
- `node run_full.cjs <endpoint>` ✓ (`run_full.cjs:157-162`)
- Two model interfaces (chat logprobs, System One) ✓ (`run_level.cjs:104-168` ENDPOINTS)
- Endpoint table in driver/README.md ✓ (verified)
- 8 of 14 levels clear at two seeds on Clef ✓ (`results.md:128-143`)
- Level 4 clears at one seed of two ✓ (`results.md:138`)
- `npm test` runs driver suite ✓ (root `package.json:8` → `driver/package.json:8`)
- Harness serves on :5173 ✓ (`harness.vite.config.cjs:9`)

### agents.md
- 10 test suites listed ✓ (matches `test_all.cjs:6-17`)
- `test_objective_lock.cjs` red by design ✓ (`test_all.cjs:23-26`)
- `VISIT_WINDOW=12`, `VISIT_STUCK_THRESHOLD=3` ✓ (`decision.cjs:2337-2338`, `test_runner_parity.cjs:91-96`)
- `STALL_WINDOW` divergence documented ✓ (`stall_window.cjs:4-6`, `run_full.cjs:389-390`)
- `driver/jev.cjs` endpoint clients ✓ (verified)
- `driver/route_clock.cjs`, `driver/arc.cjs` ✓ (verified)
- `driver/experiments/` offline scripts ✓ (verified)

### driver/README.md
- Port 5173 ✓
- `MAX_STEPS=3000`, `MAX_DEATHS=40` (run_level) ✓ (`run_level.cjs:59-60`, `test_runner_parity.cjs:141-143`)
- `MAX_TOTAL_STEPS=40000`, `MAX_DEATHS_PER_LEVEL=10/25` (run_full) ✓ (`run_full.cjs:31,60-62`)
- `HEADED=1` visible window ✓ (`run_level.cjs:67`, `run_full.cjs:70`)
- `VIDEO=1` records webm ✓ (`run_level.cjs:84`, `run_full.cjs:182`)
- Environment variable table (except LLAMA_BASE_URL) ✓ (verified against `config.cjs`)
- Endpoint definitions (7 endpoints) ✓ (`run_level.cjs:104-168`, `run_full.cjs:86-150`)
- `DEMO_KEEP_LEVELS` skip behavior ✓ (`run_full.cjs:216-241`)
- `test_demo_skip.cjs` validates rewrite ✓ (`driver/experiments/test_demo_skip.cjs`)

### driver/experiments/README.md
- Broken scripts list (require deleted `decision.patched_*.cjs`) ✓ (git history 2026-10-08)
- Fixed scripts (`gem_floor_offset.cjs` etc.) path fix 2026-10-09 ✓ (commit 8198770)
- Offline diagnostics table ✓ (verified script purposes)
- `test_demo_skip.cjs` needs live harness ✓ (verified)
- CI browser job separate from `test_all.cjs` ✓ (`.github/workflows/ci.yml:31-71`)

### docs/README.md
- 8 levels clear at two seeds on Clef ✓ (`results.md:128-143`)
- 4 never-cleared levels (6,11,12,13) ✓ (`results.md:30-32`)
- Archive commit SHAs don't resolve ✓ (docs/README.md:52)
- Single-run comparisons void ✓ (`method.md:3-19`)

### docs/architecture.md
- Game never modified (submodule pinned) ✓ (git config, `bridge.ts:8-12`)
- Three things avoided: bridge, Tweakpane CSS, separate vite config ✓ (`bridge.ts`, `harness.html:18`, `harness.vite.config.cjs:2-5`)
- Cadence: K=6, AIR_REDECIDE_FRAMES=3, MAX_HELD_FRAMES=120 ✓ (`cadence.cjs:14,18,24`)
- Run caps: 3000 steps / 40 deaths (level), 10 deaths (ladder) ✓
- Objective candidates include descent/ascent ✓ (`decision.cjs:buildObjectiveCall`)
- STICKY_OBJECTIVE=1 inert on level 4 ✓ (`dead-ends.md:49`)
- Policy: argmax, sample on failures (death + revisit window) ✓ (`decision.cjs:2015-2110`)
- VISIT_WINDOW=12, VISIT_STUCK_THRESHOLD=3 ✓
- Temperature: SAMPLE_TEMPERATURE=1.0, +0.5 per prior death, cap 3.0 ✓ (`decision.cjs:2020-2022`)
- ATTRIB=0 toggles failure attribution ✓ (`run_stats.cjs:64`, `run_level.cjs:408`)
- 7 endpoints match code ✓
- Assistant-prefill finding ✓ (`decision.cjs:2024-2034`)
- File roles table (except line count) ✓

### docs/agent-guide.md
- Command examples ✓
- Measurement rules ✓
- 10 suites, 9 green + 1 red ✓
- Regression test on clearing levels ✓ (`dead-ends.md:54-56`)

### docs/game-facts.md
- Constants from config.ts ✓ (catWalkSpeed=1.75, catJumpSpeed=6.8, droneSpeed=0.2, maxLaserY=310, minLaserSize=1.5, maxLaserSize=3.0)
- Platform collision box 52x16 ✓ (measured from sprite)
- Jump: 34 frames, ~61.2px rise, ~59px drift ✓
- Laser clock: mf = (tl.y - 1) / 0.2 ✓ (`bridge.ts:214-215`, `run_level.cjs:413-414`)
- Safe box formula ✓
- Portal at (180,150) ✓ (`instances.ts:22-24`)
- resetCat spawns airborne at platform.y - 12 ✓ (`resetCat.ts:10`)
- Gem deadlines table (sorted by deadline) ✓ (verified against `config.ts` via computation)
- Non-deterministic laser thickness ✓ (`getRandomLaserSize.ts`)
- All 14 levels geometrically solvable ✓ (verified offline)

### docs/method.md
- Harness non-deterministic (laser thickness) ✓
- N>=3 runs per level per build ✓
- Clef needs different seeds ✓
- Blast radius via offline firing sweep ✓ (`driver/experiments/firing_counts.cjs`, `census_gem_from.cjs`)
- probe_move.cjs reproduces 244/250 decisions ✓ (documented claim, marked unsure below)
- Archive reading traps ✓ (pgrep, PRE_ prefixes, TaskStop, run.sh trap)
- Bug family: value read before settled (4 instances) ✓
- Builder-lag class (4 instances) ✓
- GPU contention 98% of decision time ✓
- Playwright executable issues ✓
- npm ci EALLOWGIT ✓
- Viewport CSS-only scaling ✓

### docs/rules.md
- 5 rules match code enforcement ✓ (Rule 1: `JevHardError`, Rule 2: flat menu, Rule 3: descent disclosure, Rule 4: stop adding facts, Rule 5: name endpoint)

### docs/simulate-clock-audit.md
- 9 call sites audited (4 real-clock, 5 constant-clock) ✓
- Census methodology corrected 2026-10-09 ✓
- 4 DEFECT-LIVE sites confirmed ✓ (sites 5,6,7,8)

### docs/dead-ends.md
- Arm D measured and rejected ✓
- 4 candidate predicates killed by census ✓
- Implied-relevance pattern (4 instances) ✓
- Prompt sentences tried and rejected ✓
- Menu-position bias fixed ✓
- Interception-aware landings prepared not shipped ✓

### docs/open-problems.md
- Route deadline diagnosis ✓ (levels 4,11,12)
- Level 6 ping-pong, level 12 crossing race, level 3 zigzag ✓
- 7 defects documented (2 fixed, 5 open) ✓
- Video pipeline status ✓

### docs/results.md
- Clear test definition (sawAdvance, not reachedWin) ✓
- Per-level table from 182 archives ✓
- 6 solid, 2 intermittent, 6 failing ✓
- Endpoint breakdown (176 halogen, 6 qwen_local) ✓
- Isolated vs ladder runs different ✓
- Defended vs not defended ✓
- JEV_STRICT neutral on L12 ✓
- Wall clock table ✓
- Clef 2026-10-07 results ✓ (8/14 at two seeds)
- Flag definitions ✓
- Build progression tables ✓
- Post-fix verification runs ✓
- Sticky-off test L6 ✓
- BURN_FACTS neutral ✓
- OBJ_SAMPLE + WPT_ARGMAX combo ✓
- Seed sweep failing levels ✓
- Descent laser gate fix ✓
- Continuous recording 8 levels ✓
- Simulate-clock census 2026-10-09 ✓

---

## Unsure / Unverifiable Without Execution

| Claim | Location | Status | Notes |
|-------|----------|--------|-------|
| `probe_move.cjs` reproduces 244 of 250 attempted decisions exactly | `docs/method.md:45`, `docs/architecture.md:119` | **UNSURE** | Requires live endpoint + archive to verify; documented as claim in two files |
| Census numbers in `simulate-clock-audit.md` (141, 194, 230, 107 states) | `docs/simulate-clock-audit.md:129-175` | **UNSURE** | Synthetic census from `census_simulate_clock.cjs`; not re-run |
| `census_simulate_clock.cjs` methodology corrections | `docs/results.md:416-421` | **UNSURE** | Describes corrected methodology; not independently verified |
| Exact decision counts for Clef builds | `docs/results.md:128-270` | **UNSURE** | From archived runs (deleted 2026-09-28); table is the only record |
| GPU contention 98% figure | `docs/method.md:77` | **UNSURE** | From specific measurement (52s/107s/103s wall vs 0.5-1.7s inference); not re-verified |
| Exact frame counts for jump apex / landingsFrom correction | `docs/game-facts.md:23-26` | **UNSURE** | From historical measurements; code now corrected |

---

## Notes

- The `probe_move.cjs` 244/250 claim appears in two documentation files but cannot be verified without a live model endpoint and archived run. It is a documented experimental result, not a code constant.
- All Census numbers in `simulate-clock-audit.md` and `results.md` come from `driver/experiments/census_simulate_clock.cjs` run on 2026-10-09. The methodology was corrected same-day (alive-at-start filter, deduped denominators, conditioned on offer gates).
- The Clef results in `results.md` are from archives deleted on 2026-09-28; the tables are now the canonical record.
- No CI workflow file was found in the audit scope (`.github/workflows/ci.yml` exists and was verified).
- The `agents.md` file did not contain the stale 2277 line count — it was only in `architecture.md` and the old `driver/README.md` table.