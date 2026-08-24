#!/usr/bin/env bash
# Push the static site to the mev-x.com VPS.
#   usage: deploy/deploy.sh [user@host]  (default: root@204.168.153.69)
# Excludes raw logo sources and scratch files so they never reach the public root.
set -euo pipefail

TARGET="${1:-root@204.168.153.69}"
REMOTE_ROOT="/var/www/mev-x-website"
LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

rsync -avz --delete \
  --exclude '.git/' \
  --exclude '.claude/' \
  --exclude 'deploy/' \
  --exclude 'assets/partners-raw/' \
  --exclude '_variants.html' \
  --exclude 'README.md' \
  --exclude 'design/' \
  --exclude 'Dockerfile' \
  "$LOCAL_ROOT"/ "$TARGET:$REMOTE_ROOT/"

ssh "$TARGET" 'nginx -t && systemctl reload nginx'
echo "Deployed to $TARGET:$REMOTE_ROOT"
