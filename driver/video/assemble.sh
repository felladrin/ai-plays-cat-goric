#!/usr/bin/env bash
# Assemble the level recordings into one mp4 using the plan from speedplan.cjs.
#
# Reads driver/video/speedplan.tsv, which speedplan.cjs derives from the motion bursts
# measured in the recordings. One row per segment, TAB separated:
#
#   <file>  <start_sec>  <end_sec>  <speed>  <class>  <out_frames>
#
# <class> is `motion` (a measured burst, played at real speed) or `hold` (the tail of a
# think pause, kept at real speed for HOLD frames). Nothing in the plan is a still
# stretch being resampled fast; the compression is done by NOT emitting the dropped
# frames, so motion is never degraded by a resample. See the header of speedplan.cjs for
# the measurement that motivates this.
#
# Each row becomes one ffmpeg invocation (trim in the filter graph, so the cut is
# frame-accurate rather than snapped to a VP8 keyframe), the segments are concatenated
# with the concat demuxer at -c copy, and the result is muxed to H.264 mp4.
#
# Re-run the whole chain from the raw recordings with:
#
#   ./pipeline.sh            # measure, plan, assemble
#   ./assemble.sh            # assemble from an existing speedplan.tsv
#
# Env:
# A row whose file column is an absolute path is used as-is; that is how cards.sh splices
# its rendered cards into the same plan without a second code path here.
#
#   OUT      final mp4 path            (default ../../out/video_all.mp4)
#   SRC_DIR  where the recordings live  (default ../../out)
#   WORK     scratch dir for segments  (default ./_work)
#   CRF      x264 quality, lower=better (default 20)
#
# Every segment is encoded with -bf 0. This is not a quality setting, it is a correctness
# requirement, and it was found by pixel-verifying the output rather than by reading this
# file. libx264 emits B-frames by default, which makes PTS != DTS. The concat demuxer
# shifts each segment by DTS, so at every segment boundary the leading B-frames of the
# next segment land in the wrong place and are emitted as extra copies. Measured on a
# three-segment subset (12 + 50 + 1 frames, card in the middle): with B-frames the output
# decoded 65 frames instead of 63, with the card at 12..63 instead of 12..61; with -bf 0
# it decodes exactly 63 frames with the card at 12..61. The total frame count still came
# out right, so a duration check does not catch this -- only comparing a known frame
# against its source does.

set -euo pipefail

FFMPEG=${FFMPEG:-/opt/homebrew/bin/ffmpeg}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PLAN=${PLAN:-$HERE/speedplan.tsv}
# WORK defaults to a fresh mktemp -d; see below.
OUT=${OUT:-$HERE/../../out/video_all.mp4}
SRC_DIR=${SRC_DIR:-$HERE/../../out}
CRF=${CRF:-20}

if [ ! -f "$PLAN" ]; then
  echo "no speed plan at $PLAN -- run speedplan.cjs first" >&2
  exit 1
fi

# The plan stores bare filenames so it stays readable; resolve them against SRC_DIR.
declare -a SRC ABS
SRC=()
seen=" "
while IFS=$'\t' read -r f _ _ _ _ _; do
  [ -n "$f" ] || continue
  case "$seen" in
    *" $f "*) ;;
    *)
      seen="$seen$f "
      SRC+=("$f")
      case "$f" in
        /*) p=$f ;;
        *) p=$SRC_DIR/$f ;;
      esac
      if [ -f "$p" ]; then ABS+=("$p"); else ABS+=(""); fi
      ;;
  esac
done < "$PLAN"

echo "plan:   $PLAN ($(wc -l < "$PLAN" | tr -d ' ') segments)"
echo "work:   $WORK"
echo "output: $OUT"

# Segments go to a fresh directory every run rather than a wiped one. Deleting a
# directory tree is a destructive operation and this repo's rules put those behind
# Victor's explicit approval, with pre-authorization explicitly not covering them. The
# segments are small (a few hundred kB for a 400-row plan), so leaving them costs
# nothing that matters and keeps this script free of rm.
if [ -z "${WORK:-}" ]; then
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/assemble.XXXXXXXX")
fi
mkdir -p "$WORK"

i=0
# The plan is read on fd 3, not stdin: ffmpeg inherits stdin and will happily swallow
# the rest of the loop's input, which truncates the plan partway through with no error.
while IFS=$'\t' read -r file start end speed class frames <&3; do
  [ -n "$file" ] || continue
  src=""
  for k in "${!SRC[@]}"; do
    if [ "${SRC[$k]}" = "$file" ]; then src="${ABS[$k]}"; fi
  done
  if [ ! -f "$src" ]; then
    echo "missing source for '$file' at row $((i + 1))" >&2
    exit 1
  fi

  seg=$(printf '%s/seg_%04d.mp4' "$WORK" "$i")
  i=$((i + 1))

  # -ss/-t as INPUT options seek by keyframe and would drift on VP8. Trimming in the
  # filter graph decodes from the start, so the boundaries land on exact frames.
  # setpts scales the timestamps, which is what actually changes playback speed. At the
  # policy's speeds of 1.0 this is a no-op, but the plan stays expressive if HOLD or
  # MOTION_SPEED is ever set to something else.
  # -frames:v pins the output length: without it the -r 25 resampler lands one frame
  # long per segment, which is 16s of phantom runtime across a 400-row plan.
  vf="trim=start=${start}:end=${end},setpts=(PTS-STARTPTS)/${speed}"

  "$FFMPEG" -nostdin -hide_banner -loglevel error -y \
    -i "$src" \
    -vf "$vf" \
    -frames:v "$frames" -r 25 -an \
    -c:v libx264 -preset veryfast -crf "$CRF" -pix_fmt yuv420p -bf 0 \
    -video_track_timescale 25000 \
    "$seg"
done 3< "$PLAN"

echo "segments: $i"

# Concatenate in PLAN ORDER, not alphabetical: the plan is already in level order, and
# an alphabetical sort would put level_10 before level_2.
list="$WORK/concat.txt"
: > "$list"
for f in "$WORK"/seg_*.mp4; do
  printf "file '%s'\n" "$f" >> "$list"
done

"$FFMPEG" -hide_banner -loglevel error -y -f concat -safe 0 -i "$list" -c copy "$OUT"

echo "wrote $OUT"
"$FFMPEG" -hide_banner -i "$OUT" 2>&1 | grep -E "Duration|Stream #" || true
