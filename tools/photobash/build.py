#!/usr/bin/env python3
"""Build the photobashed texture library.

    python3 -I tools/photobash/fetch.py --raw <raw>        # once: download CC0 sources
    python3 -I tools/photobash/build.py --raw <raw> [--only surfaces,foliage,printed,decals,overlays]
                                         [--keys asphalt,bark] [--preview <dir>]

Writes public/assets/textures/<family>/<key>.webp and public/assets/textures/manifest.json
(the manifest is merged: sections that are not rebuilt keep their previous entries).
Pillow + numpy + scipy + opencv-python-headless (+ raqm-enabled Pillow for Thai text).
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'textures')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True)
    ap.add_argument('--only', default='surfaces,foliage,printed,decals,overlays')
    ap.add_argument('--keys', default='')
    ap.add_argument('--preview', default='')
    a = ap.parse_args()
    os.environ['PHOTOBASH_RAW'] = os.path.abspath(a.raw)
    import pbcore
    pbcore.RAW = os.path.abspath(a.raw)
    from writer import Writer

    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path)) if os.path.exists(man_path) else {}
    w = Writer(OUT, old, preview=a.preview or None)
    only = set(a.only.split(','))
    keys = set(k for k in a.keys.split(',') if k)
    t0 = time.time()
    if 'surfaces' in only:
        from surfaces import SURFACES
        for fam, (fn, size) in SURFACES.items():
            if keys and not any(k in fam for k in keys):
                continue
            t1 = time.time()
            res = fn(size)
            w.surface_family(fam, res, size)
            print(f'{fam:28s} {time.time() - t1:5.1f}s', flush=True)
    if 'foliage' in only:
        import foliage
        foliage.build(w, keys)
    if 'printed' in only:
        import printed
        printed.build(w, keys)
    if 'decals' in only:
        import gore
        gore.build(w, keys)
    if 'overlays' in only:
        import overlays
        overlays.build(w, keys)
    w.save(man_path)
    print(f'done in {time.time() - t0:.0f}s; library {w.total_bytes() / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
