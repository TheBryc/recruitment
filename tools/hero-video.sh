#!/usr/bin/env bash
# Builds the silent home-page background loop from the "Become a BRYC Fellow"
# recruitment video. Uses only the b-roll shots (classrooms, the building,
# group work): no interviews, name captions, or end card.
#
# Usage, from the repository root:
#   tools/hero-video.sh path/to/become-a-bryc-fellow.mp4
#
# Writes media/hero-loop.mp4 (no audio, up to 1280 wide) and media/hero-poster.jpg.
# The times below match the 1:29 edit of the video. A higher-resolution copy of
# the same edit works as-is and gives a sharper result.
set -euo pipefail

src="${1:?Give the path to the recruitment video}"
out="media"
mkdir -p "$out"

# start end (seconds), in play order
shots=(
  "2.80 3.84"    # building exterior with the BRYC mural
  "3.92 5.22"    # hallway
  "11.95 12.85"  # students at laptops, from above (starts after a caption fades)
  "12.93 14.56"  # typing
  "19.52 22.32"  # full classroom
  "25.23 26.36"  # mentors at a table
  "26.44 27.49"  # Fellow on a laptop
  "42.42 44.67"  # group work
  "44.75 46.00"  # the name tag wall
  "52.59 53.56"  # tutoring table
  "53.64 54.97"  # classroom lesson
  "60.14 61.35"  # check-in
  "61.43 63.15"  # Fellows in the hallway
  "63.23 64.15"  # Fellows together
  "64.23 65.86"  # Fellows talking
  "70.86 71.87"  # studying together
  "72.86 74.08"  # mentor teaching
  "74.16 76.28"  # presentation
)

filters=""; labels=""
for i in "${!shots[@]}"; do
  read -r a b <<<"${shots[$i]}"
  filters+="[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,scale='min(1280,iw)':-2,fps=24000/1001,format=yuv420p[v${i}];"
  labels+="[v${i}]"
done
filters+="${labels}concat=n=${#shots[@]}:v=1:a=0[out]"

ffmpeg -v error -y -i "$src" -filter_complex "$filters" -map "[out]" -an \
  -c:v libx264 -preset slow -crf 26 -profile:v high -g 48 -movflags +faststart \
  "$out/hero-loop.mp4"

# Poster: the loop's first frame, shown before the video starts, and instead of it for people who
# turn off motion or save data.
ffmpeg -v error -y -ss 2.80 -i "$src" -frames:v 1 -vf "scale='min(1280,iw)':-2" -q:v 4 "$out/hero-poster.jpg"

ls -lh "$out/hero-loop.mp4" "$out/hero-poster.jpg"
