#!/usr/bin/env bash
# Assemble the publishable site into dist/.
#
# There is no build step for the site itself — this only exists to keep source
# material out of the public root. Cloudflare Pages runs it as the build
# command, with dist/ as the output directory.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist

# Everything except the repo's working material: raw logo sources, design
# sources, server configs, scratch files and docs meant for contributors.
tar -cf - \
  --exclude='./.git' \
  --exclude='./.github' \
  --exclude='./.claude' \
  --exclude='./dist' \
  --exclude='./deploy' \
  --exclude='./design' \
  --exclude='./assets/partners-raw' \
  --exclude='./_variants.html' \
  --exclude='./README.md' \
  --exclude='./Dockerfile' \
  --exclude='./build.sh' \
  . | tar -xf - -C dist

# Stamp the ?v= cache-buster from the content of the assets themselves.
#
# css/js are served `immutable` for a year, so a stale ?v= does not merely
# delay an update -- it pins every browser that already fetched that URL to the
# old file permanently. Editing the CSS and forgetting to bump the number by
# hand has burned this project twice. Deriving it from a content hash means the
# URL cannot disagree with what it points at.
css_v=$(sha256sum css/style.css | cut -c1-10)
js_v=$(sha256sum js/main.js     | cut -c1-10)

find dist -name '*.html' -print0 | xargs -0 sed -i \
  -e "s|style\.css?v=[A-Za-z0-9]*|style.css?v=$css_v|g" \
  -e "s|main\.js?v=[A-Za-z0-9]*|main.js?v=$js_v|g"

echo "dist/ built:"
echo "  $(find dist -type f | wc -l) files, $(du -sh dist | cut -f1)"
echo "  style.css?v=$css_v   main.js?v=$js_v"
