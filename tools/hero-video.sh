#!/usr/bin/env bash
# Builds the silent home-page background loop from the "Become a BRYC Fellow"
# recruitment video. Uses only the b-roll shots (classrooms, the building,
# group work): no interviews, name captions, or end card.
#
# Usage, from the repository root:
#   tools/hero-video.sh path/to/become-a-bryc-fellow.mp4
#
# Writes, with no audio:
#   media/hero-loop.mp4      up to 1920 wide, for computers
#   media/hero-loop-720.mp4  up to 1280 wide, for phones (smaller download)
#   media/hero-poster.jpg    the first frame, shown before the video plays
# The times below match the 1:29 edit of the video ("Fellow Recruitment
# Video.mp4" in Drive is the 4K original). Any copy of the same edit works.
set -euo pipefail

src="${1:?Give the path to the recruitment video}"
out="media"
mkdir -p "$out"

# start end (seconds), in time order
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

# Keep only the listed shots, in one pass over the video (shots must stay in
# time order). Picking frames this way keeps memory low even for a 4K source.
expr=""
for shot in "${shots[@]}"; do
  read -r a b <<<"$shot"
  expr+="${expr:++}between(t\\,${a}\\,${b})"
done
filters="[0:v]select='${expr}',setpts=N/(24000/1001)/TB,scale='min(1920,iw)':-2,format=yuv420p,split=2[big][small];[small]scale='min(1280,iw)':-2[small720]"

enc=(-an -c:v libx264 -preset slow -profile:v high -g 48 -movflags +faststart)
ffmpeg -v error -y -i "$src" -filter_complex "$filters" \
  -map "[big]" "${enc[@]}" -crf 27 -maxrate 2500k -bufsize 5000k "$out/hero-loop.mp4" \
  -map "[small720]" "${enc[@]}" -crf 27 -maxrate 1200k -bufsize 2400k "$out/hero-loop-720.mp4"

# Poster: the loop's first frame, shown before the video starts, and instead of it for people who
# turn off motion or save data.
ffmpeg -v error -y -ss 2.80 -i "$src" -frames:v 1 -vf "scale='min(1920,iw)':-2" -q:v 5 "$out/hero-poster.jpg"

ls -lh "$out/hero-loop.mp4" "$out/hero-loop-720.mp4" "$out/hero-poster.jpg"
