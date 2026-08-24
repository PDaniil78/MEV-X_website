# Design sources

Not deployed — `build.sh` and `deploy/deploy.sh` both exclude this directory.

## Social preview cards

`make-og.py` renders every `og:image` on the site:

| output | used by |
| --- | --- |
| `assets/img/og-image.png` | `index.html`, `blog/index.html` |
| `assets/blog/<slug>/og.jpg` | that blog post |

The layout mirrors the live hero — the same `linear-gradient(150deg,…)` base with
the blue and violet blooms from `css/style.css`, League Gothic headline, Inter
eyebrow, and the `mevx.svg` wordmark inlined as a data URI so the SVG renders
standalone. Post titles come straight from each page's `og:title`, and the
eyebrow from its `article:section`, so the cards cannot drift out of sync with
the pages.

Article cards are JPEG rather than WebP on purpose: LinkedIn and some other
scrapers still refuse WebP `og:image`, and a preview that silently fails to
render costs more than a few KB.

Long titles wrap to at most three lines and shrink until they fit the 1020px
column. Widths are measured with ImageMagick against the real TTFs, plus the
headline tracking and a safety margin — librsvg sets slightly wider than
ImageMagick measures, and without that margin a long title clears the check and
still overhangs the column in the final PNG.

### Regenerating

    python3 design/make-og.py

Run it after changing a post title, the hero copy, or the palette. Requires
`rsvg-convert`, ImageMagick, and Inter + League Gothic available to fontconfig:

    curl -s "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=League+Gothic" \
      | grep -oE 'https://[^)]+\.ttf' | xargs -n1 -I{} curl -sO {} --output-dir ~/.fonts
    fc-cache -f

`og-image.svg` is the standalone single-card source, kept for hand-editing the
layout; `make-og.py` carries the same geometry inline.

### Cache busting

`_headers` serves `/assets/*` as `immutable`, so a regenerated card keeps its old
copy in CDN and scraper caches. After regenerating, bump the `?v=` on the
affected `og:image` / `twitter:image` URLs.
