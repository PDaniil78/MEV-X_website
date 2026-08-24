# Putting mev-x.com on 204.168.153.69

Handoff for whoever has SSH on the box. Everything below was established by
probing the server from outside; confirm each assumption once you are on it.

## The code

```
git clone https://github.com/PDaniil78/MEV-X_website.git   # branch: master
```

`master` is current — the site content is final and verified, and nothing in it
is waiting on a decision. Do not deploy from any other branch or remote in this
repo's history; several exist and they are behind.

Never copy the working tree to a server or into an image directly. `build.sh`
assembles `dist/`, which is the only thing that should ever be published — the
repo root also holds raw logo sources, design files, this deploy directory and
scratch files, none of which belong in a public root.

## What only a human can do

These block progress and cannot be done from a shell session, so raise them
early rather than discovering them mid-run:

- **Path A** — creating the tunnel in the Cloudflare dashboard and copying its
  connector token; then deleting the Webflow DNS records at cutover.
- **Path C** — cluster access has to be granted by whoever holds it.
- **Cloudflare DNS** — the cutover record, on the account that owns the zone.
- **Webflow** — detaching the custom domain, in the Webflow project settings.
- **Search Console** — verifying the domain and submitting the sitemap.

## What is already running

Corrected from the first session on the box — the original table here was
inferred from outside and got two things wrong. Trust this version.

| port | listener | notes |
| --- | --- | --- |
| 22 | sshd | login is `pdaniil178`, **not root**; sudo prompts for a password |
| 80 | Next.js, bound directly | Homelander app. Not behind nginx. Do not touch. |
| 8080 | uvicorn | some Python backend. Do not touch. |
| 8093 | **Docker container `mevx-website`** (nginx:alpine), host 8093 → container 80 | |
| 443 | nothing | closed or filtered |

The two corrections that matter:

**:8093 is a container, not a system nginx.** There is no `/etc/nginx`, no
`/var/www`, and no nginx binary on the host — the `Server: nginx/1.29.7` header
comes from inside the image. Anything in this runbook that said to edit host
nginx config or rsync into `/var/www` was wrong; the image is the unit of
deployment and `deploy/nginx.mev-x.com.conf` ships inside it.

**There is no root.** That rules out `apt install`, writing to `/etc`, and
`systemctl` — which is what blocked the first attempt at Path A. Path A below
is rewritten to need none of them.

Docker itself is usable without root, since the site container is already being
managed from this account. Everything below relies on that and nothing more.

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

Needs no open inbound port, no certificate, no firewall change, **and no root**.
Cloudflare terminates TLS and the connector dials out to the site container.

Run the connector as a container and manage the tunnel from the Cloudflare
dashboard. This avoids all three things the host cannot give you: no `apt`, no
`/etc/cloudflared`, no systemd unit — `--restart unless-stopped` is what
survives a reboot. It also avoids `cloudflared tunnel login`, whose browser flow
a shell session cannot complete anyway.

**A human does this part**, in the Cloudflare dashboard:

1. Zero Trust → Networks → Tunnels → *Create a tunnel* → **Cloudflared**.
2. Name it `mev-x-website`. Copy the connector **token** it shows.
3. Leave the public hostname config for after the connector is up.

**Then on the box**, with that token:

```sh
docker run -d --name cloudflared --restart unless-stopped --network host \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TOKEN>

docker logs -f cloudflared      # wait for "Registered tunnel connection"
```

`--network host` is what lets the connector reach the site on
`http://localhost:8093` without touching the existing container or creating a
docker network. (The tidier alternative is a user-defined network with both
containers on it, addressing the site as `http://mevx-website:80` — do that if
`--network host` is unavailable.)

The token is a credential: pass it through the environment or a file rather
than pasting it into a shell history that gets shared.

### Prove the tunnel on a throwaway hostname first

Routing `mev-x.com` to the tunnel *is* the cutover — the record changes the
moment the command returns. So do not let the production domain be the first
hostname this tunnel ever serves. Add a preview hostname to the same tunnel,
verify everything through it, and only then route the real one.

In the tunnel's **Public Hostnames** tab, add one:

| field | value |
| --- | --- |
| Subdomain | `preview` |
| Domain | `mev-x.com` |
| Service | `HTTP` → `localhost:8093` |

Saving it creates the DNS record automatically.

`preview.mev-x.com` has no existing record, so this touches nothing live. It
gives you the whole real path — Cloudflare TLS, the tunnel, Host forwarding
into nginx — under a name nobody is using. Run the verification checklist below
against `https://preview.mev-x.com/` and fix anything it turns up while the
production domain is still quietly on Webflow.

### The cutover

Only once preview is clean:

Add two more public hostnames the same way — `mev-x.com` (empty subdomain) and
`www.mev-x.com`, both pointing at `HTTP` → `localhost:8093`.

The existing Webflow A and CNAME records are in the way. Delete them in the
Cloudflare DNS tab first, or the tunnel's record cannot be created; that
deletion is the moment the domain stops serving Webflow.

Afterwards, delete the `preview.mev-x.com` public hostname and its DNS record — a second hostname serving an identical copy of the site is exactly
the duplicate-content problem the canonical tags exist to prevent. (While it is
up it is harmless: nothing links to it and it is not in the sitemap.)

## Path B — nginx owns 80 and 443

**Not applicable to this box as it stands**: there is no root and no system
nginx, and :80 belongs to a live Next.js process. Kept for a machine that does
have a system nginx and an account that can restart it.

This restructures the front door of a running production app, so it is the
riskier option the day before a send.

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

## Path C — the k8s cluster

Confirmed from outside, so the premise is sound: `homelander.mev-x.com` and
`partner.portal.mev-x.com` both resolve to the same eight Hetzner addresses,
every one of which answers an unknown `Host` with an nginx default-backend 404
— a host-routed ingress. The certificate on `homelander.mev-x.com` is a Let's
Encrypt one scoped to exactly that single SAN, which is what automated
per-host issuance (cert-manager or equivalent) produces.

This is where the site should live long term. It is not, however, a good thing
to gate a launch on, because step one is obtaining cluster access from another
human and everything after it is discovery work of unknown duration. Path A
puts the site on the domain tonight and Path C can replace it later — the DNS
TTL is 30s, so swapping the record is instant and reversible either way.

The image is ready: `Dockerfile` builds `dist/` in an alpine stage and serves
it from `nginx:alpine` using the same vhost as Path A and Path B, with only the
listen port and document root rewritten. It runs `nginx -t` during the build,
so a broken config fails the image rather than the rollout. **It has not been
built here — this environment has no container runtime.** Build it once before
trusting it.

Do not write the manifests from scratch. Read the existing Homelander
Deployment/Service/Ingress in the namespace and copy their conventions — the
`ingressClassName`, the cert-manager issuer name and annotations, resource
limits, and whatever the cluster uses for image pull. The skeleton below marks
what must come from there:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mev-x-website
  annotations:
    cert-manager.io/cluster-issuer: <COPY FROM THE HOMELANDER INGRESS>
spec:
  ingressClassName: <COPY FROM THE HOMELANDER INGRESS>
  tls:
    - hosts: [mev-x.com, www.mev-x.com]
      secretName: mev-x-website-tls
  rules:
    - host: mev-x.com
      http: { paths: [{ path: /, pathType: Prefix,
              backend: { service: { name: mev-x-website, port: { number: 80 } } } }] }
    - host: www.mev-x.com          # the container redirects www -> apex itself
      http: { paths: [{ path: /, pathType: Prefix,
              backend: { service: { name: mev-x-website, port: { number: 80 } } } }] }
```

Two things to check once it is up, before touching DNS:

- The ingress controller may add its own `Strict-Transport-Security`. Two
  identical headers are harmless, but if the ingress adds a *different* max-age
  drop the one in `deploy/nginx.mev-x.com.conf` and let the cluster own it.
- Reach the pod by `Host` header before the DNS change
  (`curl -H 'Host: mev-x.com' http://<ingress-ip>/`) and run the whole
  verification checklist below against it. Nothing about the cutover should be
  the first time the container serves a request.

---

## Deploying the site itself

Safe to do at any time — it only changes what :8093 serves, and nothing public
points there yet.

```sh
git pull                       # master
deploy/deploy-container.sh
```

That builds the image (which runs `build.sh`, so only `dist/` is published, and
`nginx -t`, so a broken config fails the build rather than the rollout), renames
the outgoing container to a dated name instead of deleting it, starts the new
one on 8093, and prints three smoke checks.

Rollback is one line, printed by the script, and the previous container is still
sitting there stopped.

`deploy/deploy.sh` is for a host running a system nginx — **not this box**. It
is kept for whatever machine eventually runs one.

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

Path A: `docker stop cloudflared`, then restore in Cloudflare DNS —
`mev-x.com` A `198.202.211.1`, `www` CNAME `cdn.webflow.com`.
To roll back the site itself rather than the domain, `deploy-container.sh`
prints the one-line command and leaves the previous container stopped, not
deleted.
Path B: restore the same two records.

Either way it is a 30-second TTL and the Webflow project is untouched.
