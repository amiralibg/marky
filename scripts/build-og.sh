#!/bin/bash
# Render the social card (website/og/card.html) to website/public/og.png.
#
# The card is drawn in the site's own fonts and palette, so it is rendered by
# headless Chrome rather than composed in ImageMagick. We shoot at 2x and
# downsample to the exact 1200x630 Open Graph asks for — that antialiases the
# serif headline far better than rendering at 1x.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CARD="$ROOT/website/og/card.html"
OUT="$ROOT/website/public/og.png"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=)" >&2; exit 1; }

# --allow-file-access-from-files is what lets the card pull the woff2 files and
# the app icon in over file://; without it the headline falls back to Times.
"$CHROME" \
  --headless \
  --disable-gpu \
  --hide-scrollbars \
  --allow-file-access-from-files \
  --force-device-scale-factor=2 \
  --window-size=1200,630 \
  --screenshot="$TMP/og@2x.png" \
  "file://$CARD" 2>/dev/null

magick "$TMP/og@2x.png" -resize 1200x630 -strip -define png:compression-level=9 "$OUT"

printf '%-24s %s  %s\n' "$(basename "$OUT")" \
  "$(magick identify -format '%wx%h' "$OUT")" "$(du -h "$OUT" | cut -f1)"
