#!/usr/bin/env bash
# Rebuild and restart the mevx-website container on the box.
#
# :8093 is a Docker container, not a system nginx — there is no /etc/nginx and
# no /var/www on the host, so deploy/deploy.sh (rsync + systemctl) does not
# apply here. The Dockerfile builds dist/ and bakes in deploy/nginx.mev-x.com.conf,
# so the image is the unit of deployment and the whole config ships with it.
#
# Run this ON the box, from a checkout of master. Needs docker access, not root.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${NAME:-mevx-website}"
PORT="${PORT:-8093}"
TAG="mevx-website:$(git rev-parse --short HEAD)"

docker build -t "$TAG" -t mevx-website:latest .

# Keep the outgoing container under a dated name so rollback is one command,
# rather than deleting the only known-good artifact before the new one is proven.
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  OLD="$NAME-old-$(date +%Y-%m-%d-%H%M)"
  docker rename "$NAME" "$OLD"
  docker stop "$OLD" >/dev/null
  echo "previous container kept as $OLD  (rollback: docker rm -f $NAME && docker rename $OLD $NAME && docker start $NAME)"
fi

docker run -d --name "$NAME" --restart unless-stopped -p "$PORT:80" "$TAG"

sleep 2
echo
echo "deployed $TAG"
curl -sS -m 10 -o /dev/null -w "  GET /            %{http_code}\n" "http://127.0.0.1:$PORT/"
curl -sS -m 10 "http://127.0.0.1:$PORT/" | grep -o 'G-TTYVV3PXVL' | head -1 | sed 's/^/  GA4 measurement  /'
curl -sS -m 10 "http://127.0.0.1:$PORT/nope-xyz" | grep -o '404 — page not found' | sed 's/^/  branded 404      /'
