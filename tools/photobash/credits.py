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
        prov = {'polyhaven': 'Poly Haven', 'ambientcg': 'ambientCG', 'url': s.get('site', 'Wikimedia Commons'),
                'hiaphat': 'เฮียผัด (owner)'}[s['provider']]
        asset = s['asset'] if s['provider'] != 'hiaphat' else f"{s['asset']} (from {s.get('origin', '?')})"
        rows.append(f"| {asset} | {prov} | {authors} | {s['licence']} | <{s['page']}> | {s['used_by']} |")
    md = """# Texture credits (photobashed library)

Every photographic source used by `tools/photobash/` to build `public/assets/textures/` is listed
below. Almost all of them are **CC0 1.0 / public domain** (no attribution required; credited anyway).
Licence checked on each source page: Poly Haven (https://polyhaven.com/license: CC0 for all
assets), ambientCG (https://docs.ambientcg.com/license/: CC0 for all assets), Wikimedia Commons
files marked CC0 1.0 on their file page.

**Borrowed from the owner's other game เฮียผัด** (provider "เฮียผัด (owner)"): processed PBR sets from
its `public/assets/textures/pbr/` folder. Only sets whose rows in its `CREDITS.md` are CC0, Public
Domain Mark or CC BY were taken (its unverified web photos were not). The original photo / scan each
set was made from is named in the asset column. **CC BY 2.0 rows require this attribution** (keep it
in the shipped credits): "Texture - Galvanized metal" by Andrew Beeston and "water ripples texture 1
of 3" by JunCTionS, both on Flickr, licensed CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/),
modified (tiled, recoloured, combined with other scans).

**Stock photos for printed matter** (`st_*` rows): the picture on every poster, calendar, wall
picture, product label / pack, newspaper, lottery ticket, offering label and sticker is a real
photograph found through Openverse (https://openverse.org) with the CC0 filter, from Flickr (CC0
1.0 "public domain dedication" on the Flickr photo page), the WordPress Photo Directory (CC0 1.0 for
every photo), the Metropolitan Museum Open Access (CC0 1.0), or Wikimedia Commons (CC0 1.0 on the
file page; the same files as docs/credits/screens.md). No Unsplash, Pexels or Pixabay imports. No
royal images, brands, logos or portraits of real people (the missing-person poster shows a helmet).
Each photo is cover-cropped, lightly graded and printed by `tools/photobash/stockprint.py`.

Rejected / not used: anything NC, ND, BY-SA or with unknown licence; Flickr results other than the
CC0 photos listed here and the two CC BY photos named above; photos showing brands, logos or identifiable people.
Brand names on packs are fictional; text is set in Srisakdi (SIL OFL 1.1, Cadson Demak, bundled via
@fontsource/srisakdi).

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
