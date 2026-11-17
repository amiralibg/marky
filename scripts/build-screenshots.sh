#!/bin/bash
# Build the website's screenshot assets from raw Marky window captures.
#
# The captures are `screencapture -o -l <window>` shots of the app window on a
# Retina display: window only, no OS drop shadow, with the window's own rounded
# corners already transparent. They only need scaling down; the site adds its
# own ring (and, for the hero, the pop shadow).
#
# RAW holds one PNG per scene, named as below (live.png, read.png, ...): the
# seven scenes the website gallery shows (website/src/components/Gallery.tsx).
set -euo pipefail

RAW="${RAW:-$HOME/Documents/Marky-Screenshots-Source}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/website/public/screenshots"
WIDTH=1800   # 2x for a ~900px display width

mkdir -p "$OUT"
rm -f "$OUT"/*.webp "$OUT"/*.png 2>/dev/null || true

for name in live read source math daily graph themes; do
  magick "$RAW/$name.png" -resize "${WIDTH}x" -strip \
    -quality 82 -define webp:method=6 -define webp:alpha-quality=100 "$OUT/$name.webp"
  printf '%-10s %s  %s\n' "$name" "$(magick identify -format '%wx%h' "$OUT/$name.webp")" \
    "$(du -h "$OUT/$name.webp" | cut -f1)"
done

echo "---"
du -sh "$OUT"
