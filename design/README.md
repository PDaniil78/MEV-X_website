# Design sources

Not deployed — `deploy/deploy.sh` excludes this directory.

## og-image.svg

Source for `assets/img/og-image.png`, the 1200×630 social preview used by every
page's `og:image` / `twitter:image`. It mirrors the live hero: the same
`linear-gradient(150deg,…)` base with the blue and violet blooms from
`css/style.css`, League Gothic for the headline, Inter for the eyebrow and sub,
and the `mevx.svg` wordmark inlined as a data URI so the file renders standalone.

Regenerate after a hero copy or palette change:

    rsvg-convert -w 1200 -h 630 design/og-image.svg -o /tmp/og.png
    convert /tmp/og.png -strip -define png:compression-level=9 assets/img/og-image.png

Needs Inter and League Gothic installed locally (fontconfig) — the SVG references
them by family name. Grab the TTFs from Google Fonts and drop them in `~/.fonts`.
