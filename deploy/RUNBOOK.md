# Putting mev-x.com on 204.168.153.69

Handoff for whoever has SSH on the box. Everything below was established by
probing the server from outside; confirm each assumption once you are on it.

## What is already running

| port | listener | notes |
| --- | --- | --- |
| 22 | sshd | |
| 80 | **Next.js, bound directly** | Homelander app. No `Server:` header and Next's own 404 page — it is *not* behind nginx. |
| 8080 | uvicorn | some Python backend |
| 8093 | nginx/1.29.7 | this static site |
| 443 | **nothing** | closed or filtered |

Two consequences drive everything else: **nginx cannot take port 80** without
first moving a live app off it, and **443 is not reachable**, so certbot's
HTTP-01 challenge cannot complete as things stand.

## DNS as it stands

The zone is on Cloudflare (`nancy`/`tanner.ns.cloudflare.com`), so whoever owns
that account can change it.

```
mev-x.com.        30  IN  A      198.202.211.1     <- Webflow
www.mev-x.com.    30  IN  CNAME  cdn.webflow.com.  <- Webflow
```

TTL is 30s, so a cutover propagates in about a minute. Do not touch the
`route1/2/3.mx.cloudflare.net` MX records or the SPF TXT (Cloudflare Email
Routing — that is the team's mail), nor `homelander.mev-x.com` and
`partner.portal.mev-x.com`, which point at separate Hetzner machines.

The current Webflow site is a single page with no internal links — `/about`,
`/products`, `/contact` all 404 and there is no sitemap. Nothing is indexed
that needs a redirect map.

---

## Path A — Cloudflare Tunnel (recommended)

Needs no open inbound port, no certificate, no firewall change, and never
touches the Next.js app on :80. Cloudflare terminates TLS and `cloudflared`
dials out to nginx on localhost.

```sh
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | tee /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared

cloudflared tunnel login          # prints a URL — a human opens it and picks the mev-x.com zone
cloudflared tunnel create mev-x-website
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /root/.cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: mev-x.com
    service: http://127.0.0.1:8093
  - hostname: www.mev-x.com
    service: http://127.0.0.1:8093
  - service: http_status:404
```

```sh
cloudflared tunnel route dns --overwrite-dns mev-x-website mev-x.com
cloudflared tunnel route dns --overwrite-dns mev-x-website www.mev-x.com
cloudflared service install
systemctl enable --now cloudflared
```

`--overwrite-dns` is required: the Webflow A and CNAME records are in the way,
and without it the route command refuses rather than replacing them. **That
command is the cutover** — run it only once the site has been verified on
`http://204.168.153.69:8093/`.

`cloudflared tunnel login` opens a browser flow. A headless session cannot
complete it; hand that one step to a human.

## Path B — nginx owns 80 and 443

Only if a tunnel is ruled out. This restructures the front door of a running
production app, so it is the riskier option the day before a send.

1. Move Next.js off :80 — bind it to `127.0.0.1:3000` (change the service unit
   / `PORT`, then restart) and confirm the app still answers there.
2. Give nginx :80 and :443, with a vhost for the Homelander hostname that does
   `proxy_pass http://127.0.0.1:3000`, plus `default_server` pointing at the
   same proxy so nothing that reaches the box by IP changes behaviour.
3. Open 443: `ufw allow 443/tcp` (or the provider's firewall — 443 may be
   blocked upstream rather than locally, check both).
4. Point DNS at the box **with the Cloudflare proxy off (grey cloud)**,
   otherwise certbot's HTTP-01 challenge is answered by Cloudflare, not you.
5. `certbot --nginx -d mev-x.com -d www.mev-x.com`
6. `nginx -t && systemctl reload nginx`, verify over HTTPS, then turn the proxy
   back on (orange cloud) and set SSL mode **Full (strict)**.

---

## Deploying the site itself

Independent of path, and safe to do right now — it only updates what :8093
already serves.

```sh
deploy/deploy.sh root@204.168.153.69 /var/www/mev-x-website
```

`build.sh` assembles `dist/` first, so raw logo sources, `design/`, `deploy/`
and scratch files never reach the public root. The rsync uses `--delete`, which
matters this time: the article images moved from PNG to WebP, and the old PNGs
must actually disappear rather than linger.

Confirm the remote root before the first run — it is whatever the existing
:8093 vhost points at:

```sh
grep -rn '8093' /etc/nginx/ | head
```

Then install the vhost from `deploy/nginx.mev-x.com.conf`, which replaces
whatever currently serves :8093 and adds the caching, security headers, the
branded 404 and the blocks on `/assets/partners-raw/` and friends. Its default
`listen 8093` is what Path A wants; Path B swaps in the commented ssl block.

One thing to know before you install it: it sends
`Strict-Transport-Security: max-age=31536000; includeSubDomains`. Both live
subdomains (`homelander`, `partner.portal`) already serve valid HTTPS, so this
is safe today — but any *future* HTTP-only subdomain will be unreachable in
browsers that have seen the header. Drop `includeSubDomains` if that is a
concern.

## Verifying the cutover

```sh
curl -sI  https://mev-x.com/ | head -3                     # 200, not Webflow
curl -sI  https://www.mev-x.com/ | grep -i location        # 301 -> https://mev-x.com/
curl -so /dev/null -w '%{http_code}\n' https://mev-x.com/blog/
curl -s   https://mev-x.com/nope-xyz | grep -o '404 — page not found'   # our 404, not nginx's
curl -s   https://mev-x.com/robots.txt
curl -so /dev/null -w '%{http_code}\n' https://mev-x.com/assets/partners-raw/   # must be 404
curl -s   https://mev-x.com/ | grep -o 'G-TTYVV3PXVL'      # GA4 live
```

On a phone, check that the burger menu opens and that the blog index scrolls
without stutter — those were the two faults fixed in `3e88d42`.

Then: re-scrape the social previews (X Card Validator, `@WebpageBot` on
Telegram), verify the domain in Google Search Console, submit
`https://mev-x.com/sitemap.xml`, and request indexing on the newly published
post.

Finally, detach the custom domain in Webflow (Project Settings → Publishing),
or the project keeps claiming it.

## Rolling back

Path A: `systemctl stop cloudflared`, then restore in Cloudflare DNS —
`mev-x.com` A `198.202.211.1`, `www` CNAME `cdn.webflow.com`.
Path B: restore the same two records.

Either way it is a 30-second TTL and the Webflow project is untouched.
