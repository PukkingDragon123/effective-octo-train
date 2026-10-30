#!/usr/bin/env python3
"""Write docs/credits/textures.md from sources.py and the fetched meta.json files.

    python3 -I tools/photobash/credits.py --raw <raw>
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sources import SOURCES  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True)
    a = ap.parse_args()
    rows = []
    for s in SOURCES:
        meta_p = os.path.join(a.raw, s['id'], 'meta.json')
        meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
        authors = ', '.join(meta.get('authors') or [s.get('author', '?')])
        prov = {'polyhaven': 'Poly Haven', 'ambientcg': 'ambientCG', 'url': 'Wikimedia Commons'}[s['provider']]
        rows.append(f"| {s['asset']} | {prov} | {authors} | {s['licence']} | <{s['page']}> | {s['used_by']} |")
    md = """# Texture credits (photobashed library)

Every photographic source used by `tools/photobash/` to build `public/assets/textures/` is listed
below. All of them are **CC0 1.0 / public domain** (no attribution required; credited anyway).
Licence checked on each source page: Poly Haven (https://polyhaven.com/license: CC0 for all
assets), ambientCG (https://docs.ambientcg.com/license/: CC0 for all assets), Wikimedia Commons
files marked CC0 1.0 on their file page.

Rejected / not used: anything NC, ND, BY-SA or with unknown licence; Flickr results (rate limited,
not needed); photos showing brands, logos or identifiable people. All printed matter, packaging,
signage and labels are ORIGINAL fictional designs (no real brands); text is set in Srisakdi
(SIL OFL 1.1, Cadson Demak, bundled via @fontsource/srisakdi). Poster portraits are painted,
generic and not of real people.

Rebuild: `python3 -I tools/photobash/fetch.py --raw <dir>` then
`python3 -I tools/photobash/build.py --raw <dir>` (see docs/ARCHITECTURE.md, textures).
`*` in "used by" = the key and its `_normal` / `_rough` / `_height` companions.

| asset | provider | author(s) | licence | source page | used by |
|---|---|---|---|---|---|
""" + '\n'.join(rows) + '\n'
    out = os.path.join(ROOT, 'docs', 'credits', 'textures.md')
    with open(out, 'w') as f:
        f.write(md)
    print('wrote', out, len(rows), 'sources')


if __name__ == '__main__':
    main()
