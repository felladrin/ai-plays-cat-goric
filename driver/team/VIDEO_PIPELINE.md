# Video pipeline

Status: the assembly pipeline is built and proven end to end, on the three existing
recordings, with cards. The vehicle is `run_full.cjs`, which records the whole ladder into
**one continuous webm** — so the primary path is a single input, and level boundaries have to
be recovered from the log rather than from a file list. That recovery is built and proven
against a real container. Nothing here has seen a real overlay or a real 14-level take.

**Known defect, fixed but not yet re-verified end to end:** `concat -c copy` over segments
encoded with B-frames duplicates frames at segment boundaries while still reporting the
correct total, so a duration check passes and the content is wrong. The fix is `-bf 0` on
every segment encode. It is verified on a three-segment subset and is in `assemble.sh` and
`cards.sh`; the full 411-row assemble has not been re-run since. See the retry story,
answer 4.

```
driver/video/inspect_recording.cjs   measure motion bursts in one recording
driver/video/align.cjs               run log wall-clock stamps -> video frames (+ self-check)
driver/video/speedplan.cjs           turn bursts into a segment plan + a length budget
driver/video/cards.sh                render title/level cards, splice them into the plan
driver/video/assemble.sh             one ffmpeg per plan row, concat at -c copy
driver/video/pipeline.sh             align? -> inspect -> speedplan -> cards? -> assemble
```

```sh
# PRIMARY: one continuous take from run_full.cjs, cut against its own log
HOLD=12 WITH_CARDS=1 ALIGN=out/run_full_halogen.json ./pipeline.sh out/video/page@<guid>.webm

# FALLBACK: the three existing per-level recordings, stitched
HOLD=12 WITH_CARDS=1 ./pipeline.sh ../../out/level_0_halogen_cleared.webm \
                         ../../out/level_1_halogen_cleared.webm \
                         ../../out/level_2_halogen_cleared.webm
```

## The vehicle: `run_full.cjs`, not fourteen files

`run_full.cjs` plays the whole ladder in **one browser session** and records it as **one
continuous file**:

| line | what |
|---|---|
| `:123` | a single `chromium.launch` |
| `:129` | a single `browser.newContext({ viewport, recordVideo: { dir, size } })` — `recordVideo` is **unconditional**, not gated behind `VIDEO=1` |
| `:322-325` | `if (s.level === 14) { await shot("level14_VICTORY"); won = true; break; }` |
| `:620-628` | `page.video().path()` before `context.close()`, then the path is printed. **No rename** — the file keeps Playwright's opaque `page@<guid>.webm` name |

Consequences for this pipeline:

1. **Concat is not the primary path.** One input, one timeline. `assemble.sh` is kept
   because the per-level path stays the fallback if a full take never completes, and because
   a hybrid is the likely answer to a bad segment (see *The retry story*).
2. **Level boundaries are not file boundaries.** They are moments inside one stream, and
   nothing in the container knows where they are. Only the log knows. That is what
   `align.cjs` exists for.
3. **A full take is all-or-nothing in a way fourteen separate runs are not.** The L0
   regression gate, the spawn-state divergence and the 40,000-step cap all now threaten the
   entire recording rather than one level. See *The retry story*.
4. **The victory screen is in the file.** It was not in any per-level recording. Item 4 of
   the old "what still has to happen" list is closed by the vehicle itself.

## The clock: `Date.now()` **is** the recording's clock

This matters because the editor needs to know which frame a decision lands on, and the
answer had to be exact rather than approximate. It is exact.

`playwright-core@1.64.0-alpha` (`~/.nvm/.../@playwright/cli/node_modules/playwright-core`),
module `packages/playwright-core/src/server/videoRecorder.ts`, in the bundled
`lib/coreBundle.js`:

- `kDefaultFps = 25` (:37765). `FfmpegVideoRecorder` sets **`this._creationTimeMs = Date.now()`**
  in its constructor (:37813).
- every frame is written as `_emitFrame(frame, timestamp - this._creationTimeMs)` →
  `writeClusterHeader(Math.max(0, Math.round(timestampMs)), …)` (:37862, :37866-37868). So
  cluster timestamps are **epoch-ms minus a `Date.now()` epoch**.
- `timestamp` is `frame.frameSwapWallTime`, and at :46201 (and :48314)
  `frameSwapWallTime = event.timestamp * 1e3 + this._screencastClockOffset`, where
  `_screencastClockOffset = Date.now() - event.timestamp * 1e3` is captured **once**
  (:46197-46198). Frames are anchored to `Date.now()` at the first frame and advanced by the
  browser's own monotonic clock, so there is no cross-process drift.
- the ffmpeg args include **`-metadata creation_time=${new Date(this._creationTimeMs).toISOString()}`
  at :37825. That tag is the recording's exact zero point and is what `align.cjs` reads.
- `_stop()` (:37870-37887) appends one final duplicate frame at
  `lastFrame.timestamp + Math.max(monotonicTime() - lastWriteNodeTime, 1e3) - creationTimeMs`,
  i.e. a **synthetic tail of at least 1000ms**.

So a stamp taken with `Date.now()` anywhere in the driver converts to a video position with
`videoMs = wallMs - Date.parse(creation_time)`. The only error is the one frame of
asynchronous paint between `overlay.update()` returning and the next screencast sample, i.e.
**±1 frame / ±40ms**, which is also the quantisation floor and which nothing downstream needs
to beat.

**Empirical corroboration** on the three existing files (`ffprobe -show_entries format_tags`):

| file | `creation_time` | duration |
|---|---|---|
| `level_0_halogen_cleared.webm` | 2026-09-24T00:58:28.442Z | 67.800 |
| `level_1_halogen_cleared.webm` | 2026-09-24T00:59:35.395Z | 229.040 |
| `level_2_halogen_cleared.webm` | 2026-09-24T01:06:34.844Z | 235.560 |

Last four PTS on `level_0` are 67.640/67.680/67.720/67.760 — exactly 40ms apart to the end, so
the file is uniform 25fps CFR throughout. Subtracting the ≥1s synthetic tail, `level_0`'s last
real frame is at 66.760, i.e. a real end of `00:59:35.202`; `level_1`'s recorder was created
at `00:59:35.395`, **193ms later**, which is exactly the sequence "finalise and rename the
previous file, construct the next recorder". Frames are never dropped — ffmpeg's default CFR
duplicates to fill gaps.

*Caveat, stated because it is a real gap in the evidence:* those files report
`ENCODER=Lavf61.1.100` (FFmpeg 7.1) while this Playwright build bundles
`n7.0.1-playwright-build-1011`. The source read gives the mechanism; the file measurements
confirm the behaviour. Re-verify the self-check after the first real take.

## The two edits (approved, additive, not committed)

Both runners now stamp the log on the screencast clock. `node --check` passes on both;
`git --no-pager diff --stat` is `run_full.cjs +47`, `run_level.cjs +94/-1`. **No control flow
was touched** — no loop bound, no await moved, no early return added, and the spawn-state
assertion is byte-for-byte unchanged.

> `git diff driver/run_level.cjs` also shows **`FRAME_TRACE` changes that are not mine** — a
> const block at :84-96, a `window.bridge.clearTrace()` call, a `frameTrace.push(…)` block and
> a `frame_trace_L<n>` dump. That is pre-existing uncommitted work by another agent. It is the
> `M` that has been in `git status` all along.

| runner | added |
|---|---|
| `run_level.cjs` | `videoEpochHintMs`; `deathLog[]` with `wallMs`; `video: { recorded, epochHintMs, endWallMs }` in the flush payload; `decisionWallMs` captured **after** the overlay paint and **before** `log.push`; `endWallMs` after the while loop and before `readState()` |
| `run_full.cjs` | the same, plus **`transitions[]` with `wallMs` per level change** (`transitions.push({ level, wallMs, step })`), `victoryWallMs` as the first statement inside `if (s.level === 14)`, `levelStartWallMs` on the per-level record, and `wallMs` on both `deathLog` push sites |

`transitions[]` is the single most important addition. With fourteen per-level files the
boundaries were filenames; with one take they are invisible without it.

Two things the edits had to get right:

- **The decision stamp must follow the paint.** It is taken after the `overlay.update()`
  evaluate and before the log push, so the frame it names is the first frame in which the
  bars are visible. Capturing it before the evaluate would point the editor at the spinner.
- **The decision stamp must precede the flush.** My first attempt stamped `decisionsLog` at
  the push site, which sits *after* `flushJson()` — a synchronous whole-file JSON write whose
  cost grows with the log, so the stamp would have been biased late by an unbounded amount.
  Fixed by capturing `const decisionWallMs = Date.now()` immediately after the overlay
  evaluate and before `flushJson()`.

**Timing.** Victor constrained this to "must not alter the decision loop's timing". Both
runners already call `Date.now()` twice per decision (`_t0` before the classifier, `_lat`
after it), so one more call per decision is provably the same order of magnitude as the
instrumentation that already exists.

**Test.** `driver/test_death_history.cjs` gained a structural guard for both runners, placed
immediately after the existing "BOTH runners must drive the on-page decision panel" check and
in the same form, so it matches house style. It asserts: the epoch comes from `Date.now()`
(explicitly rejecting `performance.now()`, which is not comparable across processes);
`endWallMs` exists and is inside the flushed `video: {}` block; `decisionWallMs` is assigned
at an index **after** `window.overlay.update(`; `wallMs: decisionWallMs` is on the log entry;
`deathLog.push` carries a `wallMs`; and, for `run_full.cjs`, that `transitions.push` and
`victoryWallMs` exist. One final assertion requires `run_level.cjs` to still contain the
literal `SPAWN STATE VIOLATED`, which encodes "do not alter the spawn-state assertion" as an
executable check.

`node driver/test_death_history.cjs` → exit 0, suite green:
`OK: both runners stamp decisions, deaths and boundaries on the screencast clock`.

It is **structural, not behavioural** — it proves wiring and ordering in the source, not that
a run produced sane numbers. Teeth proof: each of the 8 guard regexes was run against the real
source and against a mutated copy; **all 8 report `real=true mutated=false`**. The mutations
were `Number(process.hrtime.bigint())` for the epoch, `performance.now()` for `endWallMs`,
moving the decision stamp before the paint, renaming the field to `latencyMs:`, dropping
`wallMs` from `deathLog`, dropping it from the transitions push, deleting the victory stamp,
and replacing `SPAWN STATE VIOLATED`.

## `align.cjs`: log stamps → video frames, with a self-check

`node driver/video/align.cjs <run_full_*.json> <webm> [out.json]`

- reads `creation_time` from `ffprobe -show_format`, `Date.parse` → `zeroMs`;
- requires a top-level `log.video` block, and says so plainly if the log predates the
  screencast-clock change;
- places every `wallMs` on a frame: `place(wallMs, zeroMs, lastFrame)` → `{ms, frame, residual}`,
  rounded to nearest, clamped to `[0, lastFrame]`;
- `COUNT_FRAMES=1` optionally runs a full `ffprobe -count_frames` to confirm CFR (off by
  default — it is a full decode);
- writes `align.json` with `video`, `check`, `levels[]` (each with `frame`, `residual`,
  `missingStamp`), `victory`, `end`, `decisions[]`, `deaths[]`.

**The self-check is the load-bearing part**, because a misaligned cut is worse than no cut.
The predicted end is `(endWallMs - zeroMs) + 40ms` (the synthetic final frame's slot) and the
ceiling adds the ≥1000ms synthetic tail; the floor is `(lastDecisionWallMs - zeroMs) + 1000ms`.
If the measured duration falls outside `[floor, ceiling]` the tool **refuses and prints
"STOP — do not cut this file"** with the offset expressed in frames. A separate branch fires
when `floor > ceiling`, which is a *different* fault with a *different* fix — a stamp sitting
after the run ended, i.e. an internally inconsistent log rather than a misalignment — and
conflating the two would send the reader hunting through the wrong file. That branch fired
for real on the first fixture (a level's decisions stamped at 78s inside a 67.8s file) and
diagnosed it correctly.

`node driver/video/align.cjs --selftest` → **13/13 pass**, exit 0: exact frame boundary,
off-boundary, `.475` rounds down, `.525` rounds up, negative clamps to 0, past-the-end clamps
to `lastFrame`, first frame, signed residual, absent stamp returns null, the window accepts an
in-range value, rejects too-short, rejects too-long, and a 30-minute mapping (1,800,000ms →
frame 45000). The self-test caught a real bug in itself on the first run — it compared
`lastDecisionWallMs` (an absolute epoch) instead of `lastDecisionWallMs - zeroMs`, which put
the window at 79s on a 60s run and failed 2 of 13.

**Proof against a real container.** A synthetic fixture log (2 levels, 29 decisions, stamps
built to be consistent with the real file) run against the actual
`out/level_0_halogen_cleared.webm` with `COUNT_FRAMES=1`:

```
align: level_0_halogen_cleared.webm  1695 frames  1:08  zero=2026-09-24T00:58:28.442000Z
  self-check PASS  delta 400ms inside [45000, 68440]  epoch hint lag 12ms
  levels 2  decisions 29  deaths 0
    L 0  frame 0     L 1  frame 500
```

Verified independently: level 0's decision frames come out `50, 100, 150, 200, 250` and level
1's `525, 550, … 1100` — both **exactly the constructed values**; `countedFrames 1695` equals
the implied 1695; decision frames are strictly monotonic. So the ffprobe path, tag parsing,
clamping, the self-check and the frame arithmetic are all proven against a real container.

**Not proven:** that a real `run_full.cjs` run produces consistent stamps. That needs one
real take, and nothing else can substitute for it.

## Cards on level boundaries, not file boundaries

`cards.sh` takes `ALIGN`: unset/`0` = per-file (the fallback, unchanged), `1` =
`$HERE/align.json`, any other value = that path. Align mode **refuses if the plan names more
than one input file** — a take is one timeline, and a multi-file plan in align mode would cut
the wrong file. `pipeline.sh` enforces the same thing before `align.cjs` runs.

It also refuses if there are no placed levels, if any level is `missingStamp`, or if **level 1
is not at frame 0** (a card cannot precede the start of the file, and the mapping is suspect).

### How the card text gets rendered — no install

Not by ffmpeg. The ffmpeg on this machine has no `drawtext` filter and no `subtitles`, built
without `--enable-libfreetype`/`--enable-libass`, so it cannot draw a letter. It is
**`cardpng.cjs`**, which lays the cards out as HTML in a real browser and screenshots them at
1280x720, resolving Playwright through `driver/config.cjs` — the same `resolvePlaywright()` and
`browserExecutablePath()` that `run_level.cjs:69` and `run_full.cjs:39` call. So it needs no new
dependency and no install:

```sh
export PLAYWRIGHT_MODULE=/Users/victor/Repositories/MiniSearch/node_modules/playwright
export CHROME="$(cat /tmp/chrome_path.txt)"
```

Both are the project's existing arrangement, set by `driver/experiments/lvl.sh:7-8` and
documented in `driver/README.md`; the chromium is already in `~/Library/Caches/ms-playwright`.
`cardpng.cjs` renders a static HTML string and never opens the harness, the game or any model
endpoint, so it cannot perturb a measurement or count as a level run. A pre-rendered
`cards/<name>.png` is used as-is and never re-rendered, so a hand-supplied card survives a
re-run. If the render fails, `cards.sh` exits 1 and prints these two lines.

Because the PNG is now a finished opaque design rather than a mask, it is looped straight into
an encode. The earlier version thresholded it to a luminance mask over a flat background, which
was only necessary when images had to be drawn without a text renderer — and which would have
handled this design badly: the 1px rule sits at luma **85**, so the old threshold of 60 would
have cleared it by 25 levels, and anti-aliasing at fractional pixel offsets would have dropped
parts of the line. Direct overlay is both simpler and strictly more faithful.

**`MIN_INK` was retuned from 3000 to 2000, and the measurement is the reason.** Real rendered
cards measure: title 25,928 px, LEVEL 0 4,591, LEVEL 2 4,427, **LEVEL 1 2,941** — the digit 1
is far thinner than 0 or 8, so a floor drawn from the title card or an even-numbered level
would have rejected it. The worst blank render ever measured 1,518 px. 2,000 sits inside that
gap. The guard still catches the failure it exists for: a render with correct layout metrics
and no visible glyphs.

The placement rule is one sentence: **a card goes immediately before the row that first
covers its boundary.** That single rule covers all three cases that occur — boundary strictly
inside a row (the row is split), boundary exactly on a row edge, and boundary inside a *gap
in the plan*. The gap case is real, not hypothetical: `speedplan.tsv` has a genuine 4-frame
hole at 19.84–20.00s, because a still gap shorter than `HOLD` is kept whole and a motion
burst can start immediately after the previous one ended.

All three proven: boundary in a plan gap at 20.0s → card between the last level-0 row
(19.76–19.84) and the first level-1 row (20.0–20.48), 407 → 409 rows; boundary strictly inside
a hold at 19.52s → that 12-frame hold split into 19.28–19.52 (6f) + card + 19.52–19.76 (6f),
407 → 410. A malformed `align.json` refuses with **exit code 1**. File mode is unchanged:
407 → 411 rows, title + 3 level cards.

*Three bugs worth not repeating.* (1) A card emitted at the tail of the *previous* row over a
closed interval, and a `<=` skip guard, each silently dropped the card in the edge and gap
cases — 408 and 410 rows instead of 409, with no error. (2) In awk, `mode == 0` where `mode`
holds a *filesystem path* is **true**: awk converts the non-numeric string to 0 for a numeric
comparison, so every align run silently took the per-file branch. Pass a bare `IS_ALIGN=0|1`.
(3) An uninitialised `bi` compares as 0, so the first boundary loop fired on the very first
row and produced a card named `level.card.mp4`. Also, when checking a shell pipeline's status,
check the exit of the command under test, not of `tail`. (4) `CARDS=1` as "render the cards"
collided with `cards.sh`'s own `CARDS`, which is the card image **directory** — the flag made
it look for `./1/title.png` and `mkdir -p` a directory literally named `1`. The opt-in is now
`WITH_CARDS=1`, and `CARDS=<dir>` passes straight through. Caught by running the documented
invocation, not by reading it.

## Measured inputs

All VP8 1280x720, 25fps CFR (PTS verified uniform at 0.000/0.040/0.080; `nb_frames` is
absent from the WebM headers, so these counts come from `ffprobe -count_frames`).

| input | frames | duration | bytes | motion frames | motion bursts |
|---|---|---|---|---|---|
| `level_0_halogen_cleared.webm` | 1695 | 67.80s | 2,686,574 | 65 | 33 |
| `level_1_halogen_cleared.webm` | 5726 | 229.04s | 7,496,855 | 161 | 80 |
| `level_2_halogen_cleared.webm` | 5889 | 235.56s | 7,727,138 | 180 | 89 |
| **total** | **13310** | **532.40s** | **17,910,567** | **406** | **202** |

These are 45 decisions in 532.40s, i.e. **11.83s of wall clock per decision** — model latency
dominating 96% stillness, exactly as the architecture predicts. Two uses:

- the fallback cut's raw length;
- **a real estimate of what a take costs.** At 11.83s/decision and 697 decisions, a full
  ladder take is **137 minutes / 2.29 hours** of recording, at the measured 269 kb/s
  (265–317 across the three) that is **~277MB**, compressing 15x down to a ~9-minute cut.
  Budget disk and wall clock on that number, not on the cut length.

## The measurement the policy rests on

`inspect_recording.cjs` crops the game canvas (x 0..720) and the overlay panel (x 720..1280)
separately and counts pixels that move by more than 20 grey levels between consecutive
frames. Cross-checked against ffmpeg's independent `mpdecimate`:

| detector | changed frames | share |
|---|---|---|
| >20 grey levels, 360x360 downscale | 406 / 13310 | 3.05% |
| `mpdecimate` (all codecs, no threshold) | 842 / 13310 | 6.33% |

**93.7–97.0% of every recording is pixel-identical to its predecessor.** Mean motion burst
is 2.01 frames — 80ms. That is not a screencast fault. The driver calls `gameLoop.stop()`
and steps the game by hand, K=6 frames per decision at `STEP_DELAY_MS=16` under HEADED
(`run_level.cjs:57`, `:100`, `:658`), so the page is genuinely static for the whole
model round trip. Under `run_full.cjs` the same holds: `K=6`, `STEP_DELAY_MS = HEADED ? 16 : 0`
at `:45`.

The two detectors disagree by 2x, so the true motion fraction is a range, not a number. It
does not change the policy. It is why `PIXEL_DELTA` in `inspect_recording.cjs` is a knob.

## The policy: gap compression with a floor

A uniform 6x, which the original brief asked for, spends its budget in exactly the wrong
place: it compresses the 80ms of motion — the only part a viewer can watch — and leaves 94%
of the runtime as proportionally just as much stillness.

- **motion** — every measured burst plays at 1.0x, untouched. The source is already 16ms per
  stepped frame, so 1.0 here is 0.96x real time. No resample touches it.
- **hold** — every still stretch is cut to its **last `HOLD` frames** and kept at 1.0x.
  Nothing is resampled to hit a rate; compression is done by not emitting the dropped frames.

The hold sits at the *tail* of the gap. `run_level.cjs:572` calls `overlay.thinking(true)`,
then awaits the model, then `:572` calls `overlay.update(payload)` — the bars are painted at
the *end* of the wait, immediately before the key press that moves the cat. Keeping the tail
preserves "these bars caused this movement" as a visible adjacency. Keeping the head would
show the thinking spinner and throw the bars away. The decision stamp was placed to match: it
follows the paint, so `align.cjs` names the first frame in which the bars are visible.

## Proof

| run | plan rows | output | predicted frames |
|---|---|---|---|
| `HOLD=4` (160ms) | 407 | 00:00:48.56, 1214 frames, 1389 kb/s | 1216 |
| `HOLD=12` (480ms) | 407 | 00:01:51.96, 2799 frames, 745 kb/s | 2801 |
| `HOLD=12` + cards | 411 | 00:02:01.04, 3026 frames, 690 kb/s | 3024 |

Content survived: 202 input motion bursts → 201 in the output (one merge at a level
boundary). Median gap between bursts went from 1.80–3.28s to 0.24s. Motion is **33.9% of the
cut** at `HOLD=4`, against 3.05% of the raw. The four cards are present in the output at the
head, measured by the white block in the rendered card image.

Three ffmpeg traps, all load-bearing, all documented in `assemble.sh`:

1. the plan is read on **fd 3** (`done 3< "$PLAN"`) plus `-nostdin` — ffmpeg inherits stdin
   and swallows the rest of the loop, truncating the plan at row 219 with no error;
2. **trim in the filter graph** (`trim=start=A:end=B,setpts=(PTS-STARTPTS)/SPEED`), not
   `-ss`/`-t` — input seek snaps to VP8 keyframes and drifts;
3. **`-frames:v N` is required** — without it the `-r 25` resampler lands exactly one frame
   long per row, 16s of phantom runtime across 407 rows.

Cost is 0.292s per plan row, because each row re-decodes its source from frame 0. 411 rows
took 2:01. A 14-level 697-decision cut is ~1400 rows ≈ **7 minutes** of assembly.

## Length: the budget is decision count, not wall clock

**Superseded.** The first version of this section summed all 14 `out/run_level_<n>_halogen.json`
archives to 3413 decisions, and reported that `HOLD` could be at most 3.24 frames with 10
minutes tight. That number is wrong by 7.6x and wrong in the direction that hides a problem
rather than reporting one: it counted failing runs. Kept because "how long is a video of a run
that fails" is a real number we may want if no full clear happens.

**Current.** The 14 archives split cleanly:

| archives | decisions | levels | mean per level |
|---|---|---|---|
| cleared | 347 | 7 | 50 |
| failing | 2656 | 7 | 379 |

A cleared level costs about 50 decisions; a failing one about 379, because it ran to the
3000-step or 40-death cap and its decision count is a count of flailing. The video being
budgeted is a video of the game being beaten, so every level in it is a cleared level:

```
DECISIONS = 347 + 50 * 7 = 697          (cleared estimate, stable)
FAILING14 = 2656 + 379 * 7 = 5309       (7.6x, snapshot taken mid-re-run, will move)
```

14 cleared levels, 697 decisions, motion at 1.0x:

| `HOLD` | read time | holds alone | + motion (detector..mpdecimate) |
|---|---|---|---|
| 4 | 160ms | 1.86 min | 2.79 – 3.80 min |
| 8 | 320ms | 3.72 min | 4.65 – 5.65 min |
| 10 | 400ms | 4.65 min | 5.58 – 6.58 min |
| 12 | 480ms | 5.58 min | 6.51 – 7.51 min |
| 15 | 600ms | 6.97 min | 7.90 – 8.91 min |
| 20 | 800ms | 9.29 min | 10.23 – 11.23 min |
| 24 | 960ms | 11.15 min | 12.09 – 13.09 min |

A failing 14-level cut at `HOLD=12` is 49.59 minutes of holds and motion.

So the problem is the opposite of the one the brief described. 10 minutes is not tight, it is
loose: at a comfortable 320ms read time the whole 14-level cut lands around 5 minutes. The
budget has to be *filled*, and `HOLD` should not be inflated to do it.

25fps quantises `HOLD` to 40ms steps, so useful values are 4/8/10/12/15/20. A 500ms hold is
`HOLD=12` or 13, never 12.5.

## What HOLD should be

`HOLD` is the one number that cannot be derived from these files: it is how long a viewer
needs on the overlay panel. Two hard bounds and a recommendation.

- **Floor, 4 frames / 160ms.** Not a guess. `harness.html` transitions `.bar-fill width` over
  0.15s and `run_level.cjs:572` calls `thinking(false)` and `update(payload)` in the same
  `evaluate`, so the bars are still growing for 150ms after the decision lands. A shorter hold
  cuts mid-animation and the viewer never sees the bar reach its chosen value.
- **Start at 12 frames / 480ms.** The arithmetic above leaves room, and legibility is the one
  thing that cannot be bought back after the fact.
- **Raise to 15 or 20 only if a real recording shows the bars are being missed**, which the
  budget can absorb: 20 frames is 10.2–11.2 minutes, still inside the 8–12 minute window.

What to look at, in order, once one real take exists:

1. Watch it at 1x with the overlay panel in view. If the chosen bar is still visibly growing
   when the cat moves, `HOLD` is too short — that is the 160ms floor, and it is visible.
2. Read the chosen option and the runner-up out loud. If you can do that on a decision you
   found interesting, the hold is long enough. If you cannot, it is not.
3. Check the right-hand third of the panel. On the three existing files the panel ink spans
   x 740..1092 only — the right 188px of the 560px panel is empty and there are no
   right-aligned bar values. If the real overlay is the same, the *numbers* are not
   readable at any `HOLD`, and the fix is the overlay, not the ramp.
4. Only then decide. Nothing above can be done blind.

## What fills the rest

`HOLD` at 12 gives 6.5–7.5 minutes. The remaining 1.5–3.5 minutes should be deliberate
content, not longer holds. Built from the 6 stable cleared archives: 5 deaths over 309
decisions is 1.6 per 100, which scales to about 11 deaths over 697.

| item | n | each | total | implementable today? |
|---|---|---|---|---|
| title card | 1 | 3.0s | 3.0s | yes — `cards.sh`, needs a text renderer |
| per-level cards | 14 | 2.0s | 28.0s | yes — `cards.sh` on `transitions[]` |
| level-clear beat, uncompressed | 14 | 1.5s | 21.0s | yes — 1.5s before each `transitions[]` stamp |
| deaths, uncompressed | 11 | 3.0s | 33.0s | **now yes** — `deathLog[].wallMs` → `align.cjs` |
| victory screen, uncompressed | 1 | 10.0s | 10.0s | **now yes** — `victoryWallMs`, and the screen is in the take |
| slow holds on the interesting decisions | 56 | 0.6s | 33.6s | **now yes** — `decisionsLog[].wallMs` + `policyMode` |
| **total** | | | **128.6s = 2.14 min** | all 128.6s, gated on one real take |

The bottom three rows were "no — needs a video timestamp" and are now unblocked: that was the
single highest-value recording-side change, and both runners now emit it. What is still
"implementable today" is separate — the *code* is written, but it cannot be exercised until a
real take exists, and the card text still needs a renderer.

Grand totals: `HOLD=10` → 7.7–8.7 min; `HOLD=12` → **8.7–9.7 min, in the window**; `HOLD=15`
→ 10.1–11.1 min. The slow-hold term is the one assumption that could break the window, and it
cannot: a sampling fraction anywhere from 2% to 30% moves the total only between 9.2 and 11.2
minutes. So fill the time with content that earns it, and if there is not enough, the answer
is a longer `HOLD`, not a shorter sampling fraction.

**What makes a decision "interesting"** is already machine-detectable. The driver uses argmax
while the position is working and samples only where it has failed before — a prior death at
that 10px position, or a revisit inside the sliding window — with escalating temperature.
`policyMode` and `temperature` are in the overlay payload (`run_level.cjs:39-53`), so a
decision where the panel shows non-argmax is objectively identifiable. The blocker used to be
that the logs carried no video timestamp and were not paired with the recordings. **Both are
fixed**: the log now stamps each decision and the aligner places each stamp on a frame of the
file it was recorded into.

## The retry story

This is the part that changed most, because one take is not fourteen independent tries.

**What can stop a take.** `run_full.cjs` halts on: the L0 regression gate
(`:345-350` — if L0 completes with any death at all, `stopped = {reason:"L0_regression_gate"}`);
the backward-jump guard (`:333-337`, `reason:"restarted"`); the per-level unwinnable reset
(`:373-393`, `MAX_DEATHS_PER_LEVEL=10`; the cap has two distinct outcomes, `death_cap_unwinnable` at `:390` and `death_cap` at `:579`);
`MAX_TOTAL_STEPS=40000`; or a signal. `installFlush` is registered with `exitOnSignal:false`
at `:247`, so `SIGTERM` flushes the log *without* exiting, which is what lets the video
finalise at `:620-628`. A take that stops is still a valid recording of everything up to that
point — it is just not the deliverable.

Two details of that list matter for planning. The death cap is enforced by an
`if (stopped) break;` at `:316`, and the comment there records why: the helpers that set
`stopped` cannot break the loop themselves, and without that check the cap *never fired* — a
run once reached 178 deaths on one level and burned two hours. That incident is the same
scale as the 2.29-hour take estimate below, so treat 2.3 hours as a realistic ceiling on a
take rather than an average. And `shot(level<NN>_entry)` at `:351` sits *after* the L0 gate
at `:345`, so a take killed by the gate has no `level01_entry.png` — consistent, since the
take ended there, but it means the L0 audit in step 3 below is the only evidence available
for that case.

**The risk that has no guard, and how far it actually reaches.** `run_level.cjs:439-446`
asserts the spawn state and throws `SPAWN STATE VIOLATED`. **`run_full.cjs` has no such
assert** — `recordVideo` is unconditional at `:129`, so nothing in the runner notices a
screencast-induced frame cost. The approval for this work said *no behaviour change*, so
adding the assert was out of scope and it is not there.

An earlier draft of this section said the divergence therefore "applies to every level of
the take". **That was wrong**, and the correction is the most useful thing found while
writing this up. `window.bridge.gameLoop.stop()` is called exactly once in the whole file,
at `:157`, before the decision loop begins; the level-transition branch at `:341-370` never
touches it, and never calls `resetCurrentLevel()`. A level change is *observed*, not
performed: the driver reads `s.level`, notices it moved, clears its own bookkeeping
(`visitCounts`, `decideMemo`, `lastChosen`, `deathHistory`) and takes a screenshot. The game
reaches the exit on its own, while the driver is the only thing calling `stepFrame`.

So the divergence window — the frames the screencast can steal between `gameLoop.stop()`
and the first `readState()` — exists **once per take, at level 0, and nowhere else**. After
that first state read the game is a pure function of the frames the driver steps, and a
compositor frame cannot change it. `shot()` at `:351` does not reopen the window for the same
reason: a screenshot forces compositor frames, not game frames.

This does not make the missing assert harmless, because that one window is the whole of
level 0 and everything after it inherits the state it produced. But it changes the failure
mode from "any level might silently start part-way through" to "the take is either sound
from the first read onward or it is wrong from the start", and the second is detectable.
It is also why the L0 regression gate is load-bearing rather than a nicety.

**So the retry story, in the three forms it actually gets asked in:**

### In plain terms: three questions this has to answer

**Is a take that goes wrong at level 9 worth anything?** Yes, and this is the question that
decides whether the deliverable is achievable at all. The backward-jump guard at `:333`
means the game never re-enters a cleared level, so a take that stops at level 9 has nine
*consecutive cleared* levels in one continuous recording. That is nine levels of good
footage, not a ruined tape. A second take supplies 9–13, the two plans concat, and the
per-level cards turn the join into a deliberate transition rather than a cut — which is
worth doing anyway on editorial grounds. So the honest worst case is "N takes, each
contributing a suffix, joined by cards", not "one lucky take or nothing".

Note also that a take which struggles at level 9 is *not* the VIDEO=1 failure described
above — that window is level 0 only. A bad level 9 is the model failing, which is the thing
the video is actually about.

**The salvage claim depends on the concat being frame-exact, and it was not.** The answer
above is only worth anything if two plans can be joined without losing or duplicating frames.
While
verifying the assembled output pixel-by-pixel against the source card images, two segment
boundaries in a 411-row plan came out wrong: with libx264's default B-frames the concat
demuxer emits 65 frames where the plan says 63, duplicating frames across each boundary.
The **total** frame count still matched, so every duration check in this document passed
while the content was wrong. The fix is `-bf 0` on every segment encode, verified on a
three-segment subset: 12 content frames, a 50-frame card, 1 frame — with B-frames the card
landed at 12..63, with `-bf 0` it lands at exactly 12..61 in a 63-frame file. **As of this
revision that fix is in `assemble.sh` and `cards.sh` but has not been re-verified end to end
on a full 411-row assemble**, so treat multi-take concatenation as unproven until it is.
This is a caution on the salvage plan, not a reason to abandon it: the defect is in the
muxer, not in the takes, and it is deterministic rather than intermittent.

**How many attempts is reasonable?** Three. The takes are prefix-covering and monotone, so
each attempt only has to clear the levels the previous ones did not reach, which makes
attempts *cheaper*, not more expensive: a take that reaches level 9 is roughly half the
2.29-hour full-ladder estimate to reproduce. Three takes is ≈7 hours and very likely covers
all fourteen levels, because a prefix of nine plus a prefix of five is a prefix of fourteen.
This is a different shape from the per-level path, where any level can fail independently
and you may need one attempt per level.

**How do you tell a diverged take from a genuine failure?** Three signals, cheapest first:

1. **`out/shots/level00_start.png`.** The cat must be at the level-0 spawn. This is the
   only image a take always has, including a gate-killed one (`level<NN>_entry` at `:351`
   is *after* the gate at `:346`, so a gate-killed take has no `level01_entry.png`). One
   glance and it answers the question directly.
2. **L0's numbers against the measured baseline.** The archives record L0 clearing in
   **5 decisions / 78 steps / 0 deaths**, consistently. A recorded take whose L0 takes more
   than about ten decisions, or any death at all, is not measuring the model — the measured
   run has never died on L0. This is the quantitative version of signal 1.
3. **`align.cjs`'s self-check.** If the duration window fails, the log and the container do
   not belong together. That is a different fault with a different fix, and it is the only
   one of the three that needs no human.

The discriminator in one line: **a diverged take is bad at level 0; a genuine failure is bad
at some level above 0.** That holds because the only unobserved frame window in the runner is
before the first state read, and that read is level 0.

**Operational order:**

1. **Run the take. Do not pre-emptively trim.** The assert in `run_level.cjs` means a
   *measured* run cannot be recorded if it diverged; the take has no such protection, so the
   check has to come afterwards.
2. **Audit `out/shots/level00_start.png` first, before reading anything else.** If the spawn
   is wrong, stop and read `## What still has to happen` item 2 before burning a second
   2.3-hour take.
3. **If the take fails the L0 gate, check the spawn state before the model's competence.** A
   diverged-spawn L0 will almost certainly produce a death, so the gate is likely to fire at
   level 1 on a *harness* fault rather than a model fault. The gate is a feature here: it
   fails fast instead of burning 2.3 hours.
4. **If the take is sound but stops early, take another one and concatenate.** Per the first
   question above, this is the expected path, not the failure path. `align.cjs` is per-log, so
   each take's cut comes from its own log and the plans simply concatenate.
5. **If a specific level is unusable, re-shoot just that level with `run_level.cjs`**, which
   *does* assert and will refuse to record a diverged run. The plan format already supports
   the hybrid: a plan is a list of `(file, start, end)` rows, so the take supplies continuity
   and the re-shot file supplies its level.
6. **If the takes are unusable overall, fall back to the per-level path** — fourteen separate
   runs, each retryable in isolation, each protected by the spawn assert. That path is what
   everything here was originally built for and it is unchanged and proven.
7. **Recommendation for Victor: put the spawn assert in `run_full.cjs` as its own change.**
   It is four lines mirroring `run_level.cjs:439-446` and it is the difference between "the
   take is trustworthy" and "the take has to be audited from a screenshot". I did not make it
   because the approval excluded behaviour changes, and guessing at behaviour inside someone
   else's runner is exactly the kind of change that should be its own reviewed diff. Note the
   scope is now known to be small: one window, at level 0, not one per level.

## What still has to happen

1. **One real take, watched, to set `HOLD`.** Nothing else can be calibrated without it.
   Overlay legibility cannot be validated on the three existing files at all: `window.overlay`
   is defined at `harness.html:114` and driven at `run_level.cjs:545` and `:572`, but it landed
   in commit `b9d962d` on 2026-09-26 17:16. The three inputs are dated 2026-09-23, three days
   earlier. Their panels hold three text bands and nothing else. This is expected, not a
   defect.
2. **One real take, run through `align.cjs`, to close the self-check.** The clock mechanism is
   read from Playwright's source and corroborated on three files, but they were made by a
   different Playwright build. The self-check is what turns that into a guarantee, and it
   cannot be exercised blind.
3. **The model does not currently beat all 14 levels.** The measured archive has 6 clears —
   L0, L1, L5, L7, L8, L9 — and 8 failures: L2, L3, L4, L6, L10, L11, L12, L13. L10 hit
   `MAX_DEATHS=40`. Seven of those were being re-run while this was written. Until all 14
   clear there is no 14-level video, only a 14-level attempt. And note `run_full.cjs`'s
   `MAX_DEATHS_PER_LEVEL=10` is much tighter than `run_level.cjs`'s 40: the cleared archives
   average 0.8 deaths per level but L9 had 2, so a single bad level can trip the unwinnable
   reset on a take that would otherwise have succeeded.
4. **`run_full.cjs` has no `SPAWN STATE VIOLATED` guard.** See *The retry story*. The top risk
   on the recording side, and the one thing here that needs a change to a runner. Its scope is
   now known and small: one window, at level 0, because `gameLoop.stop()` is called exactly once
   at `run_full.cjs:157`.
5. **~~Card text needs a renderer that this machine does not have.~~ RESOLVED, nothing
   installed.** The ffmpeg still has no `drawtext`, but the text no longer goes through ffmpeg:
   `cardpng.cjs` renders the cards in a browser through the project's existing
   `PLAYWRIGHT_MODULE` (`driver/experiments/lvl.sh:7`) and the already-cached chromium. See *How
   the card text gets rendered*. The cards are real, verified and spliced. **No item in this
   document now needs an install.**
6. **Verify the overlay shows the level number.** The payload already carries it —
   `overlayPayload` at `run_level.cjs:39-53` passes `level`, `gems`, `deaths`,
   `movingFrames`, `countdown`, `policyMode`, `temperature`, `priorDeaths`, `latencyMs` — and
   the panel renders `#policy` and `#stats`. Whether the real overlay fills the panel's right
   third, and whether the probability numbers are readable at 1280x720, is unknown.
7. **Three orphaned `out/video/page@*.webm` files** (one truncated, `dur=N/A`, dated
   2026-09-23 22:04) are leftovers from a crash between `context.close()` and the rename.
   `run_level.cjs:760-772` now reads `page.video().path()` before closing, so this should not
   recur there — but `run_full.cjs:620-628` has the same shape and the same exposure, and a
   crash mid-take loses the file's usable name, so look for the guid in the take's stdout.
8. **Re-verify the assemble after the `-bf 0` fix, and re-check the cards pixel-by-pixel.**
   A concat defect was found by comparing output frames against the source card images, and it
   passed every duration check in this document while corrupting the content. That check is
   the one that caught it and it is not automated: it was a frame-aligned brightness scan
   looking for the card runs at their planned offsets. Make it a runnable check before
   trusting any full-length assemble, including the multi-take concatenation in the retry
   story. A duration or frame-count assertion is not sufficient and will not catch a repeat
   of this class of bug.
9. **Not needed any more:** the run logs used to carry no wall-clock timestamps, so real model
   latency was unrecoverable from the archive. Both runners now stamp, so `classifierMs` and
   the per-decision gap are both measurable from a real run. Under this policy it is still
   irrelevant — gaps are cut, not measured — but the data exists if the overlay or the
   narrative ever wants it.

## Known junk in driver/video/

`analyze_frames.cjs`, `measure_activity.cjs`, `activity.json`, `analysis.json`, `_probe/`,
`_work/`, `textpng.js` and `cards/` are superseded scratch from earlier passes, used by
nothing in the pipeline. `textpng.js` is a failed attempt at drawing card text through AppKit;
it produces a PNG whose layout metrics are right but whose glyphs render about a ninth of the
requested size, so the four cards in `cards/` are unusable and the `MIN_INK` guard rejects
them. Victor has directed that these stay where they are and that they are listed in
`AWAY_DECISIONS.md` as cleanup for him, so they have deliberately **not** been removed.

### `align.json` currently holds FIXTURE data

**`driver/video/align.json` is not a real alignment.** It is the output of the `align.cjs`
proof, built from a synthetic two-level log chosen to be consistent with
`level_0_halogen_cleared.webm` so the arithmetic could be checked against a real container
without running a level. Its level numbers, decision frames and self-check figures are
constructed, and none of them describe any real run.

It is left in place rather than deleted — deletions need Victor's approval, and the cost of a
stale file is zero. It does not need cleaning: `align.cjs` writes to whatever `--out` it is
given and `pipeline.sh` passes `$HERE/align.json`, so the first real
`ALIGN=out/run_full_<which>.json ./pipeline.sh <webm>` overwrites it in place.

**If you are reading this and `align.json` has a `check` block whose numbers you do not
recognise, you are looking at the fixture.** The tell is that its video is
`level_0_halogen_cleared.webm`, which is a *per-level* file: a real alignment from
`run_full.cjs` names a take.

`driver/video/align.json` currently holds **fixture data from the aligner proof**, not the
output of a real run. It is left in place and will be overwritten by the first real
`ALIGN=… ./pipeline.sh` invocation; until then, treat it as a test artefact and not as an
alignment.
