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

echo "dist/ built:"
echo "  $(find dist -type f | wc -l) files, $(du -sh dist | cut -f1)"
