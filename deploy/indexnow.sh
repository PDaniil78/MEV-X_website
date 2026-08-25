#!/usr/bin/env bash
# Ping IndexNow with every URL in sitemap.xml.
#
# IndexNow is a push protocol: rather than waiting for a crawler to come back,
# it tells Bing and Yandex that a URL changed. Google does not participate —
# there the equivalent is "Request indexing" in Search Console, by hand.
#
# The key is verified by fetching https://mev-x.com/$KEY.txt, which must
# contain exactly the key and nothing else. That file lives in the repo root so
# build.sh copies it into dist/ like any other root file. This script lives in
# deploy/ because deploy/ is excluded from dist/ — it is a tool, not content.
set -euo pipefail
cd "$(dirname "$0")/.."

KEY=f1fbb259f19fb264ec31a6f119f51bdd
HOST=mev-x.com

payload=$(grep -oE '<loc>[^<]+</loc>' sitemap.xml | sed 's|</\?loc>||g' |
  python3 -c '
import json, sys
host, key = sys.argv[1], sys.argv[2]
urls = [l.strip() for l in sys.stdin if l.strip()]
print(json.dumps({
    "host": host,
    "key": key,
    "keyLocation": f"https://{host}/{key}.txt",
    "urlList": urls,
}))' "$HOST" "$KEY")

count=$(python3 -c 'import json,sys;print(len(json.loads(sys.argv[1])["urlList"]))' "$payload")

echo "Key must be live first:"
curl -sS -o /dev/null -w "  https://$HOST/$KEY.txt -> %{http_code}\n" "https://$HOST/$KEY.txt"

echo "Submitting $count URLs to IndexNow..."
curl -sS -X POST "https://api.indexnow.org/IndexNow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "$payload" \
  -w "\nHTTP %{http_code}\n"
echo "200 or 202 means accepted."
