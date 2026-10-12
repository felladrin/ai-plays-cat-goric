#!/usr/bin/env bash
# Full chain: raw recordings -> measurement -> speed plan -> mp4.
#
# The three stages are separate programs with separate outputs on purpose:
#   inspect_recording.cjs  what the recordings actually contain (measurement)
#   speedplan.cjs          measurement -> per-segment speed table (policy)
#   assemble.sh            speed table -> mp4 (mechanical)
#
# Re-running only the last stage is much faster, and is what you want while tuning
# CRF or HOLD.
#
# Usage:  ./pipeline.sh <webm> [webm ...]      (in level order)
#         WITH_CARDS=1 ./pipeline.sh <webm> ...
#         ALIGN=<run_full json> WITH_CARDS=1 ./pipeline.sh <one webm>
#
# WITH_CARDS=1 renders and splices cards. The card IMAGE directory is a separate variable,
# CARDS=<dir>, passed straight through to cards.sh, which defaults it to ./cards. The two are
# deliberately not the same name: cards.sh already reads CARDS as a directory, so a CARDS=1
# flag here would make it look for ./1/title.png.
#
# Cards need card images or an ffmpeg with drawtext; see cards.sh for the error it raises when
# neither is available. The step is opt-in because the cards are the part that may be blocked on
# an ffmpeg build, and the rest of the chain is not.
#
# ALIGN is the run_full.cjs path. Give it the run log and pass exactly ONE webm, because a
# full-ladder recording is a single continuous timeline: the level boundaries come from
# align.cjs mapping the log's wall-clock stamps onto the container's creation_time, not
# from the file list. The per-level path above stays the fallback for when a full ladder
# run never completes.

set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <webm> [webm...]  (recordings, in level order)" >&2
  exit 1
fi

if [ -n "${ALIGN:-}" ]; then
  if [ "$#" -ne 1 ]; then
    echo "ALIGN is set, so this is a single continuous recording: pass exactly one webm, not $#." >&2
    exit 1
  fi
  LOG=$ALIGN
  [ "$LOG" = 1 ] && LOG=$HERE/align.json
  case "$LOG" in *.json) ;; *) echo "ALIGN=$LOG is not a .json path" >&2; exit 1 ;; esac
  echo
  echo "== 0/4 align =="
  node "$HERE/align.cjs" "$LOG" "$1"
  export ALIGN=1
fi

STEPS=3
[ "${WITH_CARDS:-0}" = 1 ] && STEPS=4
[ -n "${ALIGN:-}" ] && STEPS=$((STEPS + 1))

echo
echo "== 1/$STEPS measure =="
node "$HERE/inspect_recording.cjs" "$@"

echo
echo "== 2/$STEPS plan =="
node "$HERE/speedplan.cjs" "$@"

if [ "${WITH_CARDS:-0}" = 1 ]; then
  echo
  echo "== $((STEPS-1))/$STEPS cards =="
  "$HERE/cards.sh"
  echo
  echo "== $STEPS/$STEPS assemble =="
  PLAN="$HERE/speedplan_cards.tsv" "$HERE/assemble.sh"
else
  echo
  echo "== $STEPS/$STEPS assemble =="
  "$HERE/assemble.sh"
fi
