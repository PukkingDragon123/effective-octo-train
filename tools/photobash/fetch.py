#!/usr/bin/env python3
"""Download the CC0 photo sources listed in sources.py into a raw directory.

    python3 -I tools/photobash/fetch.py --raw <dir> [--only id,id] [--force]

Each source lands in <raw>/<id>/ as plain image files (<map>.<ext>) plus meta.json
(provider, page, licence, authors as reported by the provider API). Downloads are treated
as untrusted data: nothing from them is executed, zip members are extracted by basename
only (no paths), and only image files are kept.
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources import SOURCES  # noqa: E402

UA = 'PukkingDragonTextureTool/1.0 (offline game texture pipeline)'
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp')


def get(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 + i * 3)
    raise RuntimeError(f'download failed {url}: {last}')


def get_json(url):
    return json.loads(get(url).decode('utf-8'))


def looks_like_image(b):
    return b[:3] == b'\xff\xd8\xff' or b[:8] == b'\x89PNG\r\n\x1a\n' or (b[:4] == b'RIFF' and b[8:12] == b'WEBP')


def fetch_polyhaven(s, dest):
    files = get_json(f"https://api.polyhaven.com/files/{s['asset']}")
    info = get_json(f"https://api.polyhaven.com/info/{s['asset']}")
    got = {}
    for m in s['maps']:
        if m == 'tonemapped':
            url = files['tonemapped']['url']
            ext = '.jpg'
        else:
            key = next((k for k in files if k.lower() == m.lower()), None)
            if not key:
                print('  missing map', m)
                continue
            res = files[key].get(s['res']) or files[key].get('2k') or files[key].get('1k')
            fmt = 'png' if ('alpha' in m.lower() and 'png' in res) else 'jpg'
            url = res[fmt]['url']
            ext = '.' + fmt
        b = get(url)
        if not looks_like_image(b):
            raise RuntimeError('not an image: ' + url)
        name = m.lower() + ext
        with open(os.path.join(dest, name), 'wb') as f:
            f.write(b)
        got[m] = name
    return got, {'authors': list((info.get('authors') or {}).keys()), 'name': info.get('name')}


def fetch_ambientcg(s, dest):
    url = f"https://ambientcg.com/get?file={s['asset']}_{s['res']}-JPG.zip"
    b = get(url)
    got = {}
    with zipfile.ZipFile(io.BytesIO(b)) as z:
        for info in z.infolist():
            base = os.path.basename(info.filename)
            if not base.lower().endswith(IMG_EXT) or info.file_size > 200_000_000:
                continue
            data = z.read(info)
            if not looks_like_image(data):
                continue
            # map name: suffix after the last '_' (Color, NormalGL, Roughness, Displacement, Opacity, AmbientOcclusion)
            stem = os.path.splitext(base)[0]
            m = stem.rsplit('_', 1)[-1]
            name = m.lower() + os.path.splitext(base)[1].lower()
            with open(os.path.join(dest, name), 'wb') as f:
                f.write(data)
            got[m] = name
    return got, {'authors': ['Lennart Demes']}


def fetch_url(s, dest):
    try:
        b = get(s['url'], tries=1)
    except RuntimeError:
        # some hosts (Wikimedia) reject urllib's request signature: retry with curl (no shell)
        import subprocess
        tmp = os.path.join(dest, 'photo.download')
        subprocess.run(['curl', '-sSL', '--fail', '-A', UA, s['url'], '-o', tmp], check=True, timeout=180)
        with open(tmp, 'rb') as f:
            b = f.read()
        os.remove(tmp)
    if not looks_like_image(b):
        raise RuntimeError('not an image: ' + s['url'])
    with open(os.path.join(dest, 'photo.jpg'), 'wb') as f:
        f.write(b)
    return {'photo': 'photo.jpg'}, {'authors': [s['author']]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    only = set(x for x in a.only.split(',') if x)
    os.makedirs(a.raw, exist_ok=True)
    for s in SOURCES:
        if only and s['id'] not in only:
            continue
        dest = os.path.join(a.raw, s['id'])
        meta_path = os.path.join(dest, 'meta.json')
        if os.path.exists(meta_path) and not a.force:
            continue
        os.makedirs(dest, exist_ok=True)
        print('fetch', s['id'], flush=True)
        try:
            fn = {'polyhaven': fetch_polyhaven, 'ambientcg': fetch_ambientcg, 'url': fetch_url}[s['provider']]
            got, extra = fn(s, dest)
        except Exception as e:  # noqa: BLE001
            print('  FAILED', e, flush=True)
            continue
        meta = {k: s[k] for k in ('id', 'provider', 'asset', 'licence', 'page', 'used_by') if k in s}
        meta.update(extra)
        meta['files'] = got
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=1)
        if s['provider'] == 'url':
            time.sleep(2)


if __name__ == '__main__':
    main()
