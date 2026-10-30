"""Output writer: encodes maps to WebP, records manifest entries, optional preview sheets."""
import os

import numpy as np
from PIL import Image

from pbcore import encode_normal, resize_tile, save_webp, to_u8

QUALITY = {'color': 86, 'normal': 88, 'rough': 80, 'height': 82, 'rgba': 88}


class Writer:
    def __init__(self, out, old_manifest, preview=None):
        self.out = out
        self.m = {'version': 1, 'textures': {}, 'printed': {}, 'decals': {}, 'overlays': {}}
        for k in self.m:
            if k != 'version' and isinstance(old_manifest.get(k), dict):
                self.m[k] = dict(old_manifest[k])
        self.preview = preview
        if preview:
            os.makedirs(preview, exist_ok=True)

    # -----------------------------------------------------------------------------------
    def _write(self, rel, arr, kind, alpha=False):
        path = os.path.join(self.out, rel)
        q = QUALITY.get(kind, 86)
        n = save_webp(path, arr, quality=q, alpha=alpha)
        if self.preview and kind in ('color', 'rgba'):
            im = Image.fromarray(to_u8(arr[..., :4] if alpha else arr[..., :3]), 'RGBA' if alpha else 'RGB')
            im.thumbnail((512, 512))
            im.save(os.path.join(self.preview, rel.replace('/', '__').replace('.webp', '.png')))
        return n

    def texture(self, key, rel, arr, kind, wrap='repeat', extra=None, alpha=False):
        if kind == 'normal':
            arr = encode_normal(arr)
        nbytes = self._write(rel, arr, kind, alpha=alpha)
        h, w = arr.shape[:2]
        e = {'file': rel, 'size': [w, h], 'srgb': kind in ('color', 'rgba'), 'bytes': nbytes}
        if alpha:
            e['alpha'] = True
        if wrap != 'repeat':
            e['wrap'] = wrap
        if extra:
            e.update(extra)
        self.m['textures'][key] = e

    def surface_family(self, fam, res, size):
        folder = fam.split('/')[0]
        for key, (kind, arr) in res.items():
            if kind in ('rough', 'height'):
                s = max(512, size // 2)
                arr = resize_tile(arr, (s, s))
            self.texture(key, f'{folder}/{key}.webp', arr, kind)

    def entry(self, section, key, rel, arr, alpha=False, extra=None, kind='rgba'):
        nbytes = self._write(rel, arr, kind if alpha else 'color', alpha=alpha)
        h, w = arr.shape[:2]
        e = {'file': rel, 'px': [w, h], 'bytes': nbytes}
        if alpha:
            e['alpha'] = True
        if extra:
            e.update(extra)
        self.m[section][key] = e
        return e

    def total_bytes(self):
        t = 0
        for root, _, files in os.walk(self.out):
            for f in files:
                if f.endswith(('.webp', '.jpg', '.png')):
                    t += os.path.getsize(os.path.join(root, f))
        return t

    def save(self, path):
        import json
        self.m['totalBytes'] = self.total_bytes()
        with open(path, 'w') as f:
            json.dump(self.m, f, indent=1, ensure_ascii=False, sort_keys=True)
