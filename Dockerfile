# Container image for mev-x.com — the shape the k8s ingress pattern expects.
#
# Two things this must not do, both of which the previous one-liner did:
#   * COPY . — that ships .git, assets/partners-raw/, design/, deploy/ and any
#     scratch file straight into the public root.
#   * Serve on nginx's stock config — no cache policy, no security headers, no
#     branded 404, no www redirect, none of the blocked paths.

FROM alpine:3.20 AS build
RUN apk add --no-cache bash tar
WORKDIR /src
COPY . .
# build.sh assembles dist/ with the repo's working material stripped out.
RUN ./build.sh

FROM nginx:alpine
COPY --from=build /src/dist /usr/share/nginx/html

# Single source of truth for the serving rules: the same vhost the VPS uses.
# Only the listen port and the document root differ inside a container, so they
# are rewritten here rather than kept in a divergent second copy.
COPY deploy/nginx.mev-x.com.conf /etc/nginx/conf.d/default.conf
RUN sed -i \
      -e 's|^    listen 8093 default_server;|    listen 80 default_server;|' \
      -e 's|^    listen \[::\]:8093 default_server;|    listen [::]:80 default_server;|' \
      -e 's|^    root /var/www/mev-x-website;|    root /usr/share/nginx/html;|' \
      /etc/nginx/conf.d/default.conf \
 && nginx -t

EXPOSE 80
