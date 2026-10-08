#!/usr/bin/env bash
# Run each level in ISOLATION and report the outcome, so one failing level does
# not hide the state of the levels after it (a ladder run stops at the first
# failure). Results land in out/survey.tsv.
set -u
cd "$(dirname "$0")"
EP="${ENDPOINT:-qwen_local}"
OUT="${OUT_DIR:-../out}"
mkdir -p "$OUT"
TSV="$OUT/survey_${EP}.tsv"
printf 'level\tcleared\tstalled\tdeaths\tdecisions\tpeak_mf\tpeak_gems\tsteps\tsecs\n' > "$TSV"
# A stopped sweep can leave an orphaned `node run_level.cjs` behind: TaskStop (and
# Ctrl-C) kills this shell, not the child. The orphan keeps writing the SAME output
# file as the next run, and the two interleave -- which produced a decision log
# where the cat moved 180px between consecutive decisions and moving frames went
# backwards. Refuse to start rather than produce a corrupt table.
if pgrep -f "node run_level.cjs" >/dev/null 2>&1; then
  echo "REFUSING: a run_level.cjs process is already running; results would interleave." >&2
  ps -eo pid,args | grep "[r]un_level.cjs" >&2
  exit 1
fi
trap 'pkill -P $$ -f "node run_level.cjs" 2>/dev/null; exit 130' INT TERM

for lvl in "$@"; do
  echo "=== level $lvl ==="
  t0=$(date +%s)
  node run_level.cjs "$EP" "$lvl" > "$OUT/survey_${EP}_L${lvl}.log" 2>&1
  secs=$(( $(date +%s) - t0 ))
  node -e '
    const fs=require("fs"), p=process.argv[1];
    let j; try { j=JSON.parse(fs.readFileSync(p,"utf8")); } catch(e){ console.log([process.argv[2],"READ_FAIL","","","","","","",process.argv[3]].join("\t")); process.exit(0); }
    console.log([j.levelIndex,j.sawAdvance,j.stalled,j.deaths,j.decisions,j.peakMovingFrames,j.peakGemsCollected,j.steps,process.argv[3]].join("\t"));
  ' "$OUT/run_level_${lvl}_${EP}.json" "$lvl" "$secs" | tee -a "$TSV"
done
echo "--- survey done ---"
cat "$TSV"
