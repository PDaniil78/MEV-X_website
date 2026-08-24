#!/usr/bin/env python3
"""Render the social preview cards.

Without arguments: rebuilds assets/img/og-image.png (the site-wide card) and one
1200x630 card per blog post at assets/blog/<slug>/og.jpg.

The layout mirrors the live hero: the 150deg base gradient with the blue and
violet blooms from css/style.css, League Gothic headline, Inter eyebrow, and the
mevx.svg wordmark inlined as a data URI. Text is measured with ImageMagick
against the real TTFs, so long titles wrap and shrink instead of overflowing.

Needs: rsvg-convert, ImageMagick, and Inter + League Gothic installed for
fontconfig (see design/README.md).
"""
import base64, glob, html, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = pathlib.Path.home() / ".fonts"
GOTHIC = FONTS / "LeagueGothic-400.ttf"
INTER_SB = FONTS / "Inter-600.ttf"

W, H = 1200, 630
MARGIN = 90
MAXW = W - 2 * MARGIN          # 1020px text column
BAND_CENTER = 372              # vertical centre of the headline block


TRACKING = 1.2   # letter-spacing on the headline, in px
SAFETY = 24      # librsvg/pango sets slightly wider than ImageMagick measures


def measure(font: pathlib.Path, size: int, text: str) -> int:
    """Rendered width in px, via ImageMagick against the real font file.

    ImageMagick has no letter-spacing, and pango tends to set a shade wider than
    it measures, so add the tracking back and keep a margin — otherwise a long
    line clears the check here and still overhangs the column in the PNG.
    """
    out = subprocess.run(
        ["convert", "-font", str(font), "-pointsize", str(size),
         f"label:{text}", "-format", "%w", "info:"],
        capture_output=True, text=True, check=True)
    return int(out.stdout.strip()) + int(TRACKING * max(len(text) - 1, 0)) + SAFETY


def wrap(text: str, size: int, max_lines: int):
    """Greedy word wrap. Returns None if it needs more than max_lines."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if cur and measure(GOTHIC, size, trial) > MAXW:
            lines.append(cur); cur = w
            if len(lines) > max_lines:
                return None
        else:
            cur = trial
    lines.append(cur)
    if len(lines) > max_lines or any(measure(GOTHIC, size, l) > MAXW for l in lines):
        return None
    return lines


def fit(text: str, start=112, floor=52, max_lines=3):
    """Largest size at which the headline fits the column in <= max_lines."""
    for size in range(start, floor - 1, -4):
        lines = wrap(text, size, max_lines)
        if lines:
            return size, lines
    return floor, wrap(text, floor, 99) or [text]


def svg(eyebrow: str, lines, size: int, logo_uri: str) -> str:
    lh = size * 0.98
    cap = size * 0.72
    block = (len(lines) - 1) * lh + cap
    first = BAND_CENTER - block / 2 + cap
    heads = "\n".join(
        f'  <text x="{MARGIN}" y="{first + i * lh:.1f}" font-family="League Gothic" '
        f'font-weight="400" font-size="{size}" letter-spacing="1.2" fill="#ffffff">'
        f'{html.escape(l)}</text>'
        for i, l in enumerate(lines))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="base" gradientUnits="userSpaceOnUse" x1="313.6" y1="-181" x2="886.4" y2="811">
      <stop offset="0" stop-color="#221f28"/><stop offset="0.52" stop-color="#17151b"/><stop offset="1" stop-color="#0b0a0e"/>
    </linearGradient>
    <radialGradient id="blue" gradientUnits="userSpaceOnUse" cx="1248" cy="-63" r="1500" gradientTransform="translate(0,-63) scale(1,0.5067) translate(0,63)">
      <stop offset="0" stop-color="#284ECD" stop-opacity="0.30"/><stop offset="0.52" stop-color="#284ECD" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="violet" gradientUnits="userSpaceOnUse" cx="-72" cy="668" r="1300" gradientTransform="translate(0,668) scale(1,0.6308) translate(0,-668)">
      <stop offset="0" stop-color="#8B5CF6" stop-opacity="0.14"/><stop offset="0.55" stop-color="#8B5CF6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="haze" gradientUnits="userSpaceOnUse" cx="72" cy="-101" r="1100" gradientTransform="translate(0,-101) scale(1,0.5091) translate(0,101)">
      <stop offset="0" stop-color="#CED4E4" stop-opacity="0.08"/><stop offset="0.58" stop-color="#CED4E4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{W}" height="{H}" fill="url(#base)"/>
  <rect width="{W}" height="{H}" fill="url(#haze)"/>
  <rect width="{W}" height="{H}" fill="url(#violet)"/>
  <rect width="{W}" height="{H}" fill="url(#blue)"/>
  <image x="{MARGIN}" y="62" height="46" width="104" xlink:href="{logo_uri}"/>
  <text x="{MARGIN}" y="204" font-family="Inter" font-weight="600" font-size="19" letter-spacing="3.8" fill="#B9B0CC" fill-opacity="0.6">{html.escape(eyebrow)}</text>
{heads}
  <line x1="{MARGIN}" y1="556" x2="{W - MARGIN}" y2="556" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>
  <text x="{MARGIN}" y="588" font-family="Inter" font-weight="400" font-size="19" fill="#ffffff" fill-opacity="0.35">mev-x.com</text>
</svg>
'''


def render(svg_text: str, out: pathlib.Path):
    tmp = out.with_suffix(".tmp.svg")
    tmp.write_text(svg_text)
    png = out.with_suffix(".tmp.png")
    subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), str(tmp), "-o", str(png)], check=True)
    if out.suffix in (".jpg", ".jpeg"):
        # JPEG, not WebP: LinkedIn and some scrapers still refuse WebP og:image,
        # and a preview that silently fails to render is worse than a few extra KB.
        subprocess.run(["convert", str(png), "-strip", "-interlace", "Plane",
                        "-quality", "88", str(out)], check=True)
    else:
        subprocess.run(["convert", str(png), "-strip",
                        "-define", "png:compression-level=9", str(out)], check=True)
    tmp.unlink(); png.unlink()
    return out.stat().st_size


def meta(path: pathlib.Path, prop: str):
    m = re.search(rf'<meta property="{prop}" content="([^"]*)"', path.read_text())
    return html.unescape(m.group(1)) if m else None


def main():
    logo = base64.b64encode((ROOT / "assets/img/mevx.svg").read_bytes()).decode()
    logo_uri = "data:image/svg+xml;base64," + logo

    # Site-wide card — mirrors the hero copy in index.html.
    size, lines = fit("MEV-boosted yield layer for AMMs.")
    n = render(svg("MEV-X HOMELANDER · SUPPORTS ALL EVM CHAINS", lines, size, logo_uri),
               ROOT / "assets/img/og-image.png")
    print(f"{'assets/img/og-image.png':<52} {size:>3}pt  {n // 1024:>4} KB")

    # One card per post.
    for f in sorted(glob.glob(str(ROOT / "blog/*/index.html"))):
        p = pathlib.Path(f)
        slug = p.parent.name
        title = meta(p, "og:title")
        section = meta(p, "article:section") or "Blog"
        size, lines = fit(title)
        out = ROOT / "assets/blog" / slug / "og.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        n = render(svg(f"MEV-X BLOG · {section.upper()}", lines, size, logo_uri), out)
        print(f"{'assets/blog/' + slug + '/og.jpg':<52} {size:>3}pt  {n // 1024:>4} KB  {len(lines)} lines")


if __name__ == "__main__":
    main()
