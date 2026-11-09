"""Write the GitHub Pages redirect pages (9 Nov 2026): the study now lives on alizeebaudez.com, in English and French.

GitHub Pages can't send a server redirect, so each old page sends visitors on three ways at once:
- a script that keeps the #finding anchor (the anchors are the same on the new pages),
- a meta refresh for browsers without JavaScript,
- a canonical link, so search engines move the page's signals to the new address,
plus a visible link in case all of that is blocked. The German beta goes to the English page.
The full microsite stays in the git history; assets/ and social/ stay, so images in old shares keep loading.

Usage: python3 scripts/redirect-page.py (from the repository root)
"""
from pathlib import Path

TARGETS = {
    'index.html': ('en', 'https://alizeebaudez.com/en/research/cross-border-ai-visibility-study',
                   'Cross-border AI visibility study 2026', 'The study has moved to alizeebaudez.com.', 'Open the study'),
    'fr/index.html': ('fr', 'https://alizeebaudez.com/fr/recherche/etude-visibilite-ia-transfrontaliere',
                      'Étude de visibilité IA transfrontalière 2026', 'L’étude a déménagé sur alizeebaudez.com.', 'Ouvrir l’étude'),
    'de/index.html': ('de', 'https://alizeebaudez.com/en/research/cross-border-ai-visibility-study',
                      'Cross-border AI visibility study 2026', 'Die Studie ist umgezogen: Sie finden sie jetzt auf alizeebaudez.com (auf Englisch).',
                      'Zur Studie'),
}

PAGE = """<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="canonical" href="{url}">
<meta http-equiv="refresh" content="0; url={url}">
<script>location.replace({url_js} + location.search + location.hash);</script>
<style>
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3eee6; color: #1e2430;
         font: 18px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 16px; }}
  a {{ color: #7a2836; }}
  @media (prefers-color-scheme: dark) {{ body {{ background: #1e2430; color: #eee9e0; }} a {{ color: #e3a53a; }} }}
</style>
</head>
<body>
<p>{moved} <a href="{url}">{cta} →</a></p>
</body>
</html>
"""

for rel, (lang, url, title, moved, cta) in TARGETS.items():
    Path(rel).write_text(PAGE.format(lang=lang, url=url, url_js=repr(url).replace("'", '"'), title=title, moved=moved, cta=cta),
                         encoding='utf-8')
    print('wrote', rel, '->', url)
