#!/usr/bin/env python3
"""Generate sitemap.xml and blog/rss.xml from the blog articles themselves.

Both files used to be maintained by hand, which meant a new article was one
forgotten edit away from being invisible: absent from the sitemap, absent from
the feed, and discoverable only by crawling the hub page.

Everything here is read out of the article HTML, so adding an article to
blog/ is the whole job. Run from the repo root; build.sh does that for you.

Determinism matters more than it looks. The Docker build runs build.sh inside
a container with no .git and no reliable clock, so nothing may depend on git
history, file mtimes, or the current time -- otherwise the same commit would
produce a different sitemap depending on where it was built, which is the
drift this script exists to prevent. Every date below comes from a meta tag in
the article.
"""
import html
import pathlib
import re
import sys
from datetime import datetime, timezone
from email.utils import format_datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://mev-x.com"

# Pages that are not articles, with the priority/changefreq they get in the
# sitemap. Their lastmod is the newest article date -- see below.
STATIC = [("/", "1.0", "weekly"), ("/blog/", "0.8", "weekly")]


def meta(src, *, name=None, prop=None):
    attr, val = ("name", name) if name else ("property", prop)
    m = re.search(r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(val)), src)
    return m.group(1) if m else ""


def read_articles():
    out = []
    for path in sorted(ROOT.glob("blog/*/index.html")):
        src = path.read_text(encoding="utf-8")
        slug = path.parent.name
        title = re.search(r"<title>(.*?)</title>", src, re.S)
        if not title:
            sys.exit(f"{path}: no <title>")
        published = meta(src, prop="article:published_time")
        modified = meta(src, prop="article:modified_time") or published
        if not published:
            sys.exit(f"{path}: no article:published_time — cannot place it in the feed")
        out.append({
            "slug": slug,
            # The "| MEV-X" suffix is for the browser tab, not for a feed reader
            # that already shows the channel title.
            "title": title.group(1).rsplit("|", 1)[0].strip(),
            "description": meta(src, name="description"),
            "image": meta(src, prop="og:image"),
            "published": published,
            "modified": modified,
        })
    if not out:
        sys.exit("no articles found under blog/*/index.html")
    return out


def as_datetime(day):
    return datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def write(path, text):
    """Write only on change, so an unchanged build leaves the tree clean."""
    path = ROOT / path
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def gen_sitemap(articles, newest):
    urls = [(SITE + loc, newest, freq, pri) for loc, pri, freq in STATIC]
    urls += [
        (f"{SITE}/blog/{a['slug']}/", a["modified"], "monthly", "0.7")
        for a in sorted(articles, key=lambda a: a["published"], reverse=True)
    ]
    body = "\n".join(
        f"  <url>\n"
        f"    <loc>{loc}</loc>\n"
        f"    <lastmod>{lastmod}</lastmod>\n"
        f"    <changefreq>{freq}</changefreq>\n"
        f"    <priority>{pri}</priority>\n"
        f"  </url>"
        for loc, lastmod, freq, pri in urls
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>\n"
    )


def gen_rss(articles, newest):
    items = []
    for a in sorted(articles, key=lambda a: a["published"], reverse=True):
        url = f"{SITE}/blog/{a['slug']}/"
        items.append(
            f"    <item>\n"
            f"      <title>{html.escape(a['title'], quote=False)}</title>\n"
            f"      <link>{url}</link>\n"
            f'      <guid isPermaLink="true">{url}</guid>\n'
            f"      <pubDate>{format_datetime(as_datetime(a['published']))}</pubDate>\n"
            f"      <description>{html.escape(a['description'], quote=False)}</description>\n"
            f'      <enclosure url="{a["image"]}" type="image/jpeg" length="0"/>\n'
            f"    </item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "  <channel>\n"
        "    <title>MEV-X Blog</title>\n"
        f"    <link>{SITE}/blog/</link>\n"
        f'    <atom:link href="{SITE}/blog/rss.xml" rel="self" type="application/rss+xml"/>\n'
        "    <description>Research and engineering notes on MEV protection, atomic "
        "arbitrage, AMM yield, and DEX infrastructure from the team behind MEV-X.</description>\n"
        "    <language>en-us</language>\n"
        f"    <lastBuildDate>{format_datetime(as_datetime(newest))}</lastBuildDate>\n"
        + "\n".join(items) + "\n"
        "  </channel>\n"
        "</rss>\n"
    )


def main():
    articles = read_articles()
    # The homepage and the hub both change when an article does -- a new post
    # appears on both. Deriving their lastmod from the newest article keeps this
    # deterministic; a homepage-only edit does not move it, which is acceptable
    # for a hint field on a page Google already crawls weekly.
    newest = max(a["modified"] for a in articles)

    changed = [
        name for name, text in (
            ("sitemap.xml", gen_sitemap(articles, newest)),
            ("blog/rss.xml", gen_rss(articles, newest)),
        ) if write(name, text)
    ]
    n = len(articles)
    print(f"  seo: {n} articles -> sitemap.xml ({n + len(STATIC)} urls), blog/rss.xml"
          + (f" [rewrote {', '.join(changed)}]" if changed else " [unchanged]"))


if __name__ == "__main__":
    main()
