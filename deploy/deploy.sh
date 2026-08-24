#!/usr/bin/env bash
# Build and push the site to the mev-x.com server.
#   usage: deploy/deploy.sh [user@host] [remote-root]
#
# build.sh assembles dist/ with the repo's working material stripped out, and
# only dist/ is ever copied — so raw logo sources, design files and this deploy
# directory cannot end up in the public root.
set -euo pipefail

TARGET="${1:-root@204.168.153.69}"
REMOTE_ROOT="${2:-/var/www/mev-x-website}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

"$REPO/build.sh"

# --delete so files removed from the repo (the old PNG article images, say)
# actually disappear from the server instead of lingering.
rsync -avz --delete "$REPO/dist/" "$TARGET:$REMOTE_ROOT/"

ssh "$TARGET" 'nginx -t && systemctl reload nginx'
echo
echo "Deployed to $TARGET:$REMOTE_ROOT"
echo "Verify: curl -sI http://204.168.153.69:8093/ | head -3"
