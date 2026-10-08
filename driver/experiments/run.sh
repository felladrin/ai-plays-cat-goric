#!/bin/zsh
# The one runner. Replaces runl.sh, sweep6.sh, sweep6b.sh, sweep6b.sh, sweep6c.sh
# and sweep6d.sh: five generations of the same idea, which cost a killed run and a
# permission round-trip before they were collapsed into this.
#
#   run.sh <level>...            run each level once, in sequence, headless 360x360
#   run.sh classify <level>...   n=2 per level; if the two disagree on
#                                deaths/decisions/steps, run three more (n=5)
#   run.sh video <level>         run one level with VIDEO=1 at the same 360x360,
#                                then copy the webm aside as CLEARED or FAILED
#   run.sh keep <level>          archive a FINISHED run as a result, after checking
#                                the wrapper line against the JSON field by field
#   run.sh gemonly <level>...    run each level on the one-line gem-only variant of
#                                the clause, then put the real build BACK
#
# ARCHIVE NAMES, BEFORE THE `cleared` FIX: the name embeds cleared-${...}, and the
# archiver used to read `won`, which is false on a run that cleared. Every archive
# written before 2026-09-27 has an UNRELIABLE cleared- field in its FILENAME. The
# JSON is the authority. Existing archives are NOT renamed -- renaming them would
# destroy the audit trail. Read the JSON, not the name.
#
# Every run archives the previous artifacts for that level first. That is not
# optional: lvl.sh truncates /tmp/par_L<N>_flash.log on launch, and run_level.cjs
# rewrites out/run_level_<N>_*.json INCREMENTALLY during the run, so a relaunch
# takes the previous sample's per-decision log with it. Copies land in out/runs/,
# which the root .gitignore already covers via out/.
#
# ARCHIVE NAMING. These are the PREVIOUS sample, never this launch's result, so
# they are named PRE_L<N>_ and stamped with the CONTENT's own mtime. An earlier
# version stamped them with the launch time and dropped the PRE_ prefix, which
# wrote run_level_11_halogen_11_20260927-002747.json containing 25 September
# content from a three-commits-older build: a filename that read as a current
# result and was not one. The `pre_` prefix the older wrappers used is restored.
#
# Runs in the BACKGROUND so a level never sits in a tool-call foreground. Poll with
#   pgrep -f "^node run_level" | wc -l   1 = in flight, 0 = landed
#   cat /tmp/lvl<L>.out                  the one-line summary, written by lvl.sh only
#                                       after node exits, so EMPTY while in flight
# Never launch two of these for the same level: they collide on one JSON. Use
# pgrep, not `ps -o command=` (truncates in a pipe and silently matches nothing),
# and anchor at ^node, because a shell whose command line merely mentions
# run_level.cjs would otherwise look like a kill candidate.
set -u
cd /Users/victor/Repositories/js13k-2021
mkdir -p out/runs

# Only a known keyword is a mode. Reading $1 as the mode unconditionally ate the
# first level of `run.sh 11 13 12` and ran 13 12 instead, which is how L11 went
# unmeasured on a build where it was the only level never run.
mode=levels
case ${1:-} in
  classify|video|keep|gemonly) mode=$1; shift ;;
esac
[[ $# -ge 1 ]] || { echo "usage: run.sh [classify|video|keep|gemonly] <level>..."; exit 2; }

# GEM-ONLY COUNTERFACTUAL. The variant is driver/decision.patched_gemonly.cjs, which
# differs from the real build by exactly one line: the clause gains
# /^gem_/.test(target.name), so it may only fire for gems.
#
# The restore is a trap rather than a step at the end of the loop, and that is the whole
# point of the mode. Three counterfactuals were run by hand in this project and after
# the third the working tree was left on the variant, so the tree silently disagreed
# with HEAD with nothing running to explain it, and the next run would have looked like
# the real build without being one. A trap fires on normal exit, on a failing command
# and on interrupt, which a trailing step does not.
# Overridable so a multi-change stack can be measured through the SAME mechanism
# (refuse-on-dirty, md5 both ways, trap on EXIT, post-restore tree check) instead
# of an ad hoc copy. Default is unchanged, so `run.sh gemonly` still means exactly
# what its header says.
GEMONLY_SRC=${PATCHED_SRC:-driver/decision.patched_gemonly.cjs}
GEMONLY_BAK=/tmp/decision.real.inflight
GEMONLY_WAS=""

gemonly_in() {
  # Refuse on a dirty tree. If decision.cjs already differs from HEAD then a restore
  # cannot be exact, and a counterfactual that silently discards uncommitted work is
  # worse than one that declines to run.
  local dirty; dirty=$(git status --porcelain driver/decision.cjs)
  if [[ -n $dirty ]]; then
    echo "  REFUSING gemonly: driver/decision.cjs differs from HEAD ($dirty)"
    echo "  Commit or stash it first; the swap has to be exactly reversible."
    exit 1
  fi
  GEMONLY_WAS=$(md5 -q driver/decision.cjs)
  cp driver/decision.cjs $GEMONLY_BAK
  cp $GEMONLY_SRC driver/decision.cjs
  local got; got=$(md5 -q driver/decision.cjs)
  if [[ $got != $(md5 -q $GEMONLY_SRC) ]]; then
    echo "  REFUSING gemonly: swap-in md5 $got does not match the variant"
    cp $GEMONLY_BAK driver/decision.cjs
    exit 1
  fi
  echo "  [gemonly] swapped in $got (real build was $GEMONLY_WAS)"
}

gemonly_out() {
  [[ -f $GEMONLY_BAK ]] || return 0
  cp $GEMONLY_BAK driver/decision.cjs
  local got; got=$(md5 -q driver/decision.cjs)
  if [[ $got == "$GEMONLY_WAS" ]]; then
    echo "  [gemonly] restored $got"
  else
    echo "  [gemonly] *** RESTORE MISMATCH: got $got, expected $GEMONLY_WAS ***"
  fi
  local dirty; dirty=$(git status --porcelain driver/decision.cjs)
  if [[ -n $dirty ]]; then
    echo "  [gemonly] *** TREE STILL DIFFERS FROM HEAD: $dirty ***"
  else
    echo "  [gemonly] tree agrees with HEAD"
  fi
}

if [[ $mode == gemonly ]]; then
  gemonly_in
  trap gemonly_out EXIT
fi

  archive() {
    local lvl=$1 f base stamp
    # The previous run's prompt dump, resolved from the .path pointer onelevel()
    # wrote at launch. Included so the dump travels with its par log and JSON and
    # cannot be separated from the run that produced it.
    local pdump=""
    [[ -f /tmp/prompt_dump_L${lvl}.path ]] && pdump=$(< /tmp/prompt_dump_L${lvl}.path)
    local files=(/tmp/par_L${lvl}_flash.log /tmp/lvl${lvl}.out out/run_level_${lvl}_halogen.json)
    [[ -n $pdump && -f $pdump ]] && files+=($pdump)
    for f in $files; do

    [ -f "$f" ] || continue
# A file a live process still holds open is a run in progress. The parse check
# below cannot catch this: run_level.cjs rewrites the JSON incrementally, so a
# snapshot taken at decision 208 PARSES FINE and is indistinguishable from a
# finished run by any check on the bytes. That is how two 208/209-decision
# partial snapshots came to exist under result-shaped names. Only "is anyone
# still writing it" separates the two, so that is what gets tested.
    local holders
    holders=$(lsof -t "$f" 2>/dev/null | tr '\n' ' ')
    if [[ -n ${holders// /} ]]; then
        echo "  SKIP $f: held open by pid ${holders% } -- run still in progress"
        continue
    fi
    # A JSON that will not parse is a run caught mid-write, not a finished
    # sample. Copying it would put a truncated log under a result-shaped name.
    case $f in
      *.json)
        node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$f" 2>/dev/null \
          || { echo "  SKIP $f: unparseable JSON, caught mid-write"; continue } ;;
    esac
    # Stamp from the content, not from now: this file was last written by the
    # previous run, and its mtime is that run's end.
    stamp=$(date -r "$f" +%Y%m%d-%H%M%S)
    base=$(basename "$f")
    cp "$f" "out/runs/PRE_L${lvl}_${base%.*}_${stamp}.${f##*.}"
    echo "  archived PREVIOUS $f -> out/runs/PRE_L${lvl}_${base%.*}_${stamp}.${f##*.}"
  done
}

# Archive a finished run as a result. Refuses unless the wrapper line and the JSON
# agree on every field, so a number can never be recorded that the two sources
# disagree about.
if [[ $mode == keep ]]; then
  lvl=$1
  node -e '
    const fs = require("fs"), lvl = process.argv[1];
    const J = `out/run_level_${lvl}_halogen.json`, W = `/tmp/lvl${lvl}.out`;
    if (!fs.existsSync(W) || !fs.readFileSync(W, "utf8").trim())
      { console.log("  REFUSING: " + W + " is empty, so no run has finished"); process.exit(1); }
    const kv = {};
    for (const m of fs.readFileSync(W, "utf8").matchAll(/(cleared|steps|deaths|decisions|gems)=(\S+)/g)) kv[m[1]] = m[2];
    const d = JSON.parse(fs.readFileSync(J, "utf8"));
        // `cleared` is NOT in the JSON: run_level.cjs:435 sets it as a local and
        // never serialises it. The JSON carries `won` and `sawAdvance` instead.
        //
        // `won` is the WRONG source. It is false on a run that cleared (L0:
        // won=false sawAdvance=true), and true via run_level.cjs:436 on an L13
        // wrap. Reading it here is how every archive so far was refused.
        //
        // `sawAdvance` alone is also wrong, and for the one run that matters most:
        // run_level.cjs:405-409 checks `s.level === 14` BEFORE the
        // `s.level !== levelIndex` block and breaks, so a level-13 run reaching
        // the victory screen sets won/reachedWin and exits with sawAdvance=FALSE.
        // The winning run would be archived as a failure.
        //   sawAdvance  -> levels 0..12, plus L13 whose index wraps
        //   reachedWin  -> L13 reaching the victory screen
        // `won` is deliberately not used: it is also set at :408, which is a
        // different event from clearing the target level.
        const cleared = !!(d.sawAdvance || d.reachedWin);
        const got = { cleared: String(cleared), steps: String(d.steps), deaths: String(d.deaths),
                  decisions: String(d.decisions), gems: String(d.peakGemsCollected) };
    let ok = true;
    for (const k of Object.keys(kv)) {
      const same = kv[k] === got[k];
      if (!same) ok = false;
      console.log("  " + k.padEnd(10) + " wrapper=" + String(kv[k]).padEnd(6) +
                  " json=" + String(got[k]).padEnd(6) + (same ? " AGREE" : " *** MISMATCH ***"));
    }
    if (!ok) { console.log("  REFUSING to archive: wrapper and JSON disagree"); process.exit(1); }
    const name = `out/runs/L${lvl}_RESULT_${got.steps}steps_${got.deaths}deaths_` +
                 `${got.decisions}dec_${got.gems}gems_cleared-${got.cleared}.json`;
        fs.copyFileSync(J, name);
        console.log("  VERIFIED -> " + name);
        // The prompt dump travels with the result, named for the same run. A
        // result archive whose prompts are not beside it cannot answer whether
        // the clause fired, which is the question the run exists to answer.
        const pptr = `/tmp/prompt_dump_L${lvl}.path`;
        if (fs.existsSync(pptr)) {
          const pd = fs.readFileSync(pptr, "utf8").trim();
          if (pd && fs.existsSync(pd)) {
            const dn = pd.replace(/\.jsonl$/, "")
              .replace(/prompt_dump_L(\d+)_/, "L$1_PROMPTS_");
            fs.copyFileSync(pd, dn);
            console.log("  PROMPTS  -> " + dn);
          }
        }

  ' $lvl || exit 1
  exit 0
fi

# One level, foreground-blocking on purpose: a queue must not start the next level
# while this one still holds the endpoint. Prints nothing but the summary line.
# REFUSE TO LAUNCH A LEVEL THAT IS ALREADY IN FLIGHT.
#
# Two runs of one level were launched four seconds apart and ran concurrently.
# They shared /tmp/par_L<N>_flash.log and out/run_level_<N>_halogen.json, so both
# wrote to the same files, and the result was three mutually inconsistent
# artifacts: a JSON reading 61 decisions/303 steps, a par log at step 1110, and
# two PRE_L archives five seconds apart holding 208- and 209-decision partial
# snapshots. Nothing in that set was a result and all of it looked like one.
#
# The cause was a LAUNCH, not a build: `( ... & disown )` reports disown's exit
# status rather than the job's, so "no current job" read as a failed launch and
# the level was started a second time. run.sh's own header already said "Never
# launch two of these for the same level"; this makes the runner enforce it
# instead of trusting the caller to have read the comment.
#
# Two independent tests, because either alone has a blind spot:
#   1. a run_level process for THIS level is alive   -> someone is mid-run
#   2. any live process holds one of this level's artifacts open for writing
# Test 2 is the one that catches a run whose driver died but whose browser or
# node child still holds the file, and it is also what makes archive() safe.
preflight() {
local lvl=$1 pids holder
pids=$(pgrep -f "^node run_level.cjs .*\b${lvl}\$" 2>/dev/null | tr '\n' ' ')
if [[ -n ${pids// /} ]]; then
echo " REFUSING level $lvl: a run is already in flight (pid ${pids% })"
echo " Two runs of one level collide on out/run_level_${lvl}_halogen.json."
echo " Wait for it, or kill it deliberately, then relaunch."
exit 1
fi
# lsof on each artifact. A file open for write is a run in progress even when
# the process name is not the one test 1 looks for.
for f in /tmp/par_L${lvl}_flash.log /tmp/lvl${lvl}.out out/run_level_${lvl}_halogen.json; do
[[ -f $f ]] || continue
holder=$(lsof -t "$f" 2>/dev/null | tr '\n' ' ')
if [[ -n ${holder// /} ]]; then
echo " REFUSING level $lvl: $f is held open by pid ${holder% }"
echo " A live run is still writing it; archiving or relaunching now would"
echo " capture a half-written file under a result-shaped name."
exit 1
fi
done
}

onelevel() {
local lvl=$1 video=$2 dump
preflight $lvl
archive $lvl
  # PROMPT_DUMP: record the exact prompt text per decision, so a run answers "did
  # the on-THIS-floor clause fire, how often, on which decisions" as a side effect
  # instead of us inferring it. The par log has no prompt text at all, so without
  # this a run that lands identical to baseline is UNFALSIFIABLE -- it cannot be
  # distinguished from a run where the clause never fired.
  #
  # A fresh timestamped path per launch, because the dump APPENDS (appendFileSync)
  # and lvl.sh truncates only the par log. A fixed path would silently concatenate
  # two runs and every count would be wrong. The chosen path is written to
  # .path so archive() and `keep` can find it.
  dump=/tmp/prompt_dump_L${lvl}_$(date +%Y%m%d-%H%M%S).jsonl
  print -r -- "$dump" > /tmp/prompt_dump_L${lvl}.path
  if [[ $video == 1 ]]; then
    VIDEO=1 PROMPT_DUMP=$dump zsh driver/experiments/lvl.sh $lvl > /tmp/lvl${lvl}.out 2>&1
  else
    PROMPT_DUMP=$dump zsh driver/experiments/lvl.sh $lvl > /tmp/lvl${lvl}.out 2>&1
  fi
  local summary
  summary=$(cat /tmp/lvl${lvl}.out)
  echo "[$(date +%H:%M:%S)] L$lvl: $summary"
  return 0
}

# The three fields that define an outcome. gems matters too, so include it.
fingerprint() {
  grep -oE '^deaths: [0-9]+|^decisions made: [0-9]+|^total steps: [0-9]+|^gems collected \(this level, PEAK\): [0-9]+' /tmp/par_L$1_flash.log 2>/dev/null | tr '\n' ' '
}

if [[ $mode == video ]]; then
  lvl=$1
  ts=$(date +%Y%m%d-%H%M%S)
  archive $lvl
  VIDEO=1 zsh driver/experiments/lvl.sh $lvl > /tmp/lvl${lvl}.out 2>&1
  echo "[$(date +%H:%M:%S)] L$lvl (VIDEO=1): $(cat /tmp/lvl${lvl}.out)"
  for v in out/level_${lvl}_halogen.webm out/level_${lvl}_halogen_cleared.webm; do
    if [ -f "$v" ]; then
      res=FAILED
      [[ $v == *cleared* ]] && res=CLEARED
      tgt="out/L${lvl}_VIDEO1_${ts}_${res}.webm"
      cp "$v" "$tgt"
      ls -l "$tgt"
      cp "$v" "out/runs/L${lvl}_VIDEO1_${ts}_${res}.webm"
    fi
  done
  exit 0
fi

if [[ $mode == classify ]]; then
  for lvl in "$@"; do
    echo "=== classifying L$lvl (n=2, going to n=5 if the two disagree) ==="
    onelevel $lvl 0
    a=$(fingerprint $lvl)
    cp /tmp/par_L${lvl}_flash.log out/runs/classify_L${lvl}_a_$(date +%Y%m%d-%H%M%S).log 2>/dev/null
    onelevel $lvl 0
    b=$(fingerprint $lvl)
    if [[ $a == $b && -n $a ]]; then
      echo "L$lvl OBSERVED-IDENTICAL 2/2 -> stopping here: $a"
      continue
    fi
    echo "L$lvl VARIES (run1 '$a' vs run2 '$b') -> three more for n=5"
    for i in 1 2 3; do onelevel $lvl 0; done
    echo "L$lvl done at n=5; read out/runs/classify_L${lvl}_* for the samples"
  done
  exit 0
fi

for lvl in "$@"; do
  onelevel $lvl 0
done
