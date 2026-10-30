"""Core photobash toolkit: tileable image maths, painterly overpaint, weathering layers,
normal/roughness baking and web output.

Images are float32 numpy arrays in [0, 1], shape (H, W, C), sRGB-encoded colour.
Everything that touches neighbours uses wrap-around borders so tileable inputs stay
seamless. Height fields are (H, W) floats. Normal maps follow the OpenGL convention
(green = up in the image), matching src/textures/painter.js.
"""
import json
import math
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

# ---------------------------------------------------------------------------------------
# IO
# ---------------------------------------------------------------------------------------
RAW = os.environ.get('PHOTOBASH_RAW', '')


def raw_path(src_id, name):
    """Path of a fetched map; name is a map key ('diffuse', 'color', 'normalgl', ...) or a filename."""
    d = os.path.join(RAW, src_id)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    files = {k.lower(): v for k, v in meta['files'].items()}
    fn = files.get(name.lower())
    if fn is None:
        for k, v in files.items():
            if k.startswith(name.lower()):
                fn = v
                break
    if fn is None:
        raise KeyError(f'{src_id}: no map {name} (have {list(files)})')
    return os.path.join(d, fn)


def has_map(src_id, name):
    try:
        raw_path(src_id, name)
        return True
    except (KeyError, FileNotFoundError):
        return False


def load(src_id, name, size=None, mode='RGB'):
    """Load a source map as float32 [0,1]. size=(w,h) resizes the WHOLE tile (keeps seamless)."""
    im = Image.open(raw_path(src_id, name))
    im = im.convert(mode)
    a = np.asarray(im, dtype=np.float32) / 255.0
    if size is not None:
        a = resize_tile(a, size)
    return a


def load_file(path, mode='RGB'):
    return np.asarray(Image.open(path).convert(mode), dtype=np.float32) / 255.0


def resize_tile(a, size, wrap=True):
    """Resize a (tileable) image to size=(w,h). Wrap-pads first so borders stay seamless."""
    w, h = size
    H, W = a.shape[:2]
    if (W, H) == (w, h):
        return a.copy()
    interp = cv2.INTER_AREA if w < W else cv2.INTER_CUBIC
    if not wrap:
        return np.clip(cv2.resize(a, (w, h), interpolation=interp), 0, 1)
    p = max(8, W // 32)
    pad = [(p, p), (p, p)] + ([(0, 0)] if a.ndim == 3 else [])
    big = np.pad(a, pad, mode='wrap')
    sx, sy = w / W, h / H
    out = cv2.resize(big, (int(round((W + 2 * p) * sx)), int(round((H + 2 * p) * sy))), interpolation=interp)
    ox, oy = int(round(p * sx)), int(round(p * sy))
    out = out[oy:oy + h, ox:ox + w]
    return np.clip(out, 0, 1).astype(np.float32)


def to_u8(a):
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_webp(path, a, quality=86, alpha=False, lossless_alpha=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, axis=2)
    mode = 'RGBA' if (alpha and a.shape[2] == 4) else 'RGB'
    im = Image.fromarray(to_u8(a[..., :4] if mode == 'RGBA' else a[..., :3]), mode)
    kw = dict(quality=quality, method=6)
    if mode == 'RGBA':
        kw['alpha_quality'] = 100
        kw['exact'] = False
    im.save(path, 'WEBP', **kw)
    return os.path.getsize(path)


def save_jpg(path, a, quality=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if a.ndim == 2:
        Image.fromarray(to_u8(a), 'L').save(path, 'JPEG', quality=quality, optimize=True, progressive=True)
    else:
        Image.fromarray(to_u8(a[..., :3]), 'RGB').save(path, 'JPEG', quality=quality, optimize=True,
                                                        progressive=True, subsampling=0)
    return os.path.getsize(path)


# ---------------------------------------------------------------------------------------
# Tileable filters & noise
# ---------------------------------------------------------------------------------------
def blur(a, sigma, wrap=True):
    if sigma <= 0:
        return a.copy()
    mode = 'wrap' if wrap else 'reflect'
    if a.ndim == 3:
        return ndimage.gaussian_filter(a, (sigma, sigma, 0), mode=mode)
    return ndimage.gaussian_filter(a, sigma, mode=mode)


def blur_dir(a, length, axis=0, wrap=True):
    """Box-ish motion blur along axis (0 = vertical/v, 1 = horizontal/u), one-sided downward if length>0."""
    k = int(abs(length))
    if k < 2:
        return a.copy()
    w = np.linspace(1.0, 0.2, k).astype(np.float32)
    w /= w.sum()
    kern = np.zeros(2 * k - 1, np.float32)
    kern[k - 1:] = w if length > 0 else w
    if length > 0:
        kern = kern[::-1]  # trail extends downward (towards +row)
    mode = 'wrap' if wrap else 'nearest'
    return ndimage.convolve1d(a, kern, axis=axis, mode=mode)


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def norm01(f):
    lo, hi = np.percentile(f, 0.5), np.percentile(f, 99.5)
    return np.clip((f - lo) / max(1e-6, hi - lo), 0, 1).astype(np.float32)


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(size, scale=8.0, octaves=5, seed=0, beta=1.0, aniso=(1.0, 1.0)):
    """Perfectly tileable fractal noise in [0,1] via FFT-filtered white noise.
    scale ~ number of features across the tile; aniso stretches (u, v) frequency."""
    w, h = (size, size) if isinstance(size, int) else size
    if isinstance(scale, (tuple, list)):  # (features across u, features across v)
        su, sv = scale
        scale, aniso = su, (1.0, sv / su)
    rng = np.random.default_rng(seed)
    wn = rng.standard_normal((h, w)).astype(np.float32)
    F = np.fft.rfft2(wn)
    fy = np.fft.fftfreq(h)[:, None] * h / aniso[1]
    fx = np.fft.rfftfreq(w)[None, :] * w / aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    lo = scale * 0.5
    hi = scale * (2 ** octaves)
    amp = np.where((f >= lo * 0.5) & (f <= hi), (f / lo) ** (-beta), 0.0)
    amp *= np.exp(-((lo * 0.5 / np.maximum(f, 1e-6)) ** 4))
    out = np.fft.irfft2(F * amp, s=(h, w)).astype(np.float32)
    return norm01(out)


def cells(size, n, seed=0, jitter=1.0):
    """Tileable Worley distance field F1 (0 at feature points) and cell id map."""
    w, h = (size, size) if isinstance(size, int) else size
    rng = np.random.default_rng(seed)
    pts = rng.random((n, 2)) * [w, h]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    best = np.full((h, w), 1e9, np.float32)
    ids = np.zeros((h, w), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px)
        dx = np.minimum(dx, w - dx)
        dy = np.abs(yy - py)
        dy = np.minimum(dy, h - dy)
        d = np.sqrt(dx * dx + dy * dy)
        m = d < best
        best[m] = d[m]
        ids[m] = i
    return best / (math.sqrt(w * h / n)), ids


def offset_wrap(a, dx, dy):
    return np.roll(np.roll(a, int(dy), axis=0), int(dx), axis=1)


# ---------------------------------------------------------------------------------------
# Colour
# ---------------------------------------------------------------------------------------
def rgb2hsv(a):
    return cv2.cvtColor(np.clip(a, 0, 1).astype(np.float32), cv2.COLOR_RGB2HSV)  # H 0..360


def hsv2rgb(a):
    return np.clip(cv2.cvtColor(a.astype(np.float32), cv2.COLOR_HSV2RGB), 0, 1)


def saturate(a, s):
    L = lum(a)[..., None]
    return np.clip(L + (a - L) * s, 0, 1)


def hex2rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def match_stats(a, target_mean, strength=1.0, std_scale=None, mask=None):
    """Shift the colour mean toward target_mean (sRGB rgb) keeping detail; optional std scaling."""
    m = a.reshape(-1, 3).mean(0) if mask is None else (a * mask[..., None]).reshape(-1, 3).sum(0) / max(1, mask.sum())
    t = np.asarray(target_mean, np.float32)
    out = a.copy()
    if std_scale is not None:
        out = m + (out - m) * std_scale
    # multiplicative for colour (keeps darks dark), blended with additive
    ratio = (t + 0.02) / (m + 0.02)
    out = out * (1 - strength) + (out * ratio) * strength
    return np.clip(out, 0, 1)


def grade(a, sat=0.85, contrast=1.0, gamma=1.0, tint=None, tint_amt=0.0, shadow_tint=None, shadow_amt=0.0,
          lift=0.0):
    """Restrained night-palette grade for albedo: desaturate, gentle contrast, optional tints."""
    out = saturate(a, sat)
    if contrast != 1.0:
        m = lum(out).mean()
        out = np.clip(m + (out - m) * contrast, 0, 1)
    if gamma != 1.0:
        out = out ** gamma
    if tint is not None and tint_amt:
        out = out * (1 - tint_amt) + out * hex2rgb(tint) * 1.6 * tint_amt
    if shadow_tint is not None and shadow_amt:
        L = lum(out)[..., None]
        w = (1 - sstep(0.05, 0.45, L)) * shadow_amt
        out = out * (1 - w) + (out * 0.6 + hex2rgb(shadow_tint) * L * 0.8) * w
    if lift:
        out = out + lift * (1 - out)
    return np.clip(out, 0, 1)


def set_lum_mean(a, target, strength=1.0):
    m = lum(a).mean()
    f = (target / max(m, 1e-4)) ** strength
    return np.clip(a * f, 0, 1)


# ---------------------------------------------------------------------------------------
# Frequency separation & painterly overpaint
# ---------------------------------------------------------------------------------------
def split_freq(a, sigma):
    low = blur(a, sigma)
    return low, a - low


def kuwahara(a, r=4):
    """Fast 4-quadrant Kuwahara (wrap) on an RGB image: flat painterly colour patches."""
    pad = r
    p = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode='wrap')
    L = lum(p)
    k = r + 1
    mean = cv2.blur(p, (k, k), borderType=cv2.BORDER_REFLECT)
    m1 = cv2.blur(L, (k, k), borderType=cv2.BORDER_REFLECT)
    m2 = cv2.blur(L * L, (k, k), borderType=cv2.BORDER_REFLECT)
    var = m2 - m1 * m1
    H, W = a.shape[:2]
    best_v = np.full((H, W), 1e9, np.float32)
    out = np.zeros_like(a)
    h2 = r // 2
    for oy in (-h2, h2):
        for ox in (-h2, h2):
            v = var[pad + oy:pad + oy + H, pad + ox:pad + ox + W]
            c = mean[pad + oy:pad + oy + H, pad + ox:pad + ox + W]
            m = v < best_v
            best_v[m] = v[m]
            out[m] = c[m]
    return out


def flow_angle(a, sigma=6):
    """Dominant structure direction (radians, image space) from the structure tensor (wrap)."""
    L = lum(a) if a.ndim == 3 else a
    gx = ndimage.sobel(L, axis=1, mode='wrap')
    gy = ndimage.sobel(L, axis=0, mode='wrap')
    jxx, jyy, jxy = blur(gx * gx, sigma), blur(gy * gy, sigma), blur(gx * gy, sigma)
    ang = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2  # along edges
    return ang.astype(np.float32)


def _bristle(n, rng):
    b = rng.random(n).astype(np.float32)
    b = ndimage.gaussian_filter1d(b, 0.8)
    return 0.55 + 0.45 * (b - b.min()) / max(1e-6, b.max() - b.min())


def brush_strokes(canvas, src, n, length, width, seed=0, angle=None, opacity=0.6, jitter=0.06,
                  mask=None, wrap=True, angle_jitter=0.35, value_jitter=0.05):
    """Paint n soft bristle strokes onto canvas (in place). Colour comes from src at the stroke
    centre (+ small hue/value jitter). angle: None (random), float, or (H,W) field. mask (H,W)
    gives stroke probability. Strokes wrap around the tile borders."""
    rng = np.random.default_rng(seed)
    H, W = canvas.shape[:2]
    C = canvas.shape[2]
    if mask is not None:
        prob = mask.ravel().astype(np.float64)
        prob = prob / prob.sum() if prob.sum() > 0 else None
    else:
        prob = None
    idx = rng.choice(H * W, size=n, p=prob)
    ys, xs = idx // W, idx % W
    for i in range(n):
        x, y = int(xs[i]), int(ys[i])
        L = length * (0.6 + rng.random() * 0.8)
        Wd = max(1.5, width * (0.6 + rng.random() * 0.7))
        if angle is None:
            a = rng.random() * math.pi
        elif np.isscalar(angle):
            a = angle + (rng.random() - 0.5) * angle_jitter * 2
        else:
            a = float(angle[y, x]) + (rng.random() - 0.5) * angle_jitter * 2
        col = src[y, x, :3] * (1 + (rng.random() - 0.5) * value_jitter * 2)
        col = col + (rng.random(3) - 0.5) * jitter * 0.3
        R = int(L / 2 + Wd + 3)
        size = 2 * R + 1
        yy, xx = np.mgrid[-R:R + 1, -R:R + 1].astype(np.float32)
        ca, sa = math.cos(a), math.sin(a)
        u = xx * ca + yy * sa  # along stroke
        v = -xx * sa + yy * ca  # across
        t = np.clip(np.abs(u) / (L / 2), 0, 1.5)
        taper = Wd / 2 * (1 - 0.55 * t ** 2)
        shape = sstep(0.0, 1.5, taper - np.abs(v)) * sstep(1.02, 0.85, t)
        # bristle streaks along the stroke
        br = _bristle(64, rng)
        vi = np.clip(((v / max(Wd, 1) + 0.5) * 63).astype(np.int32), 0, 63)
        alpha = shape * br[vi] * opacity * (0.75 + rng.random() * 0.25)
        ys_ = (np.arange(y - R, y + R + 1) % H) if wrap else np.clip(np.arange(y - R, y + R + 1), 0, H - 1)
        xs_ = (np.arange(x - R, x + R + 1) % W) if wrap else np.clip(np.arange(x - R, x + R + 1), 0, W - 1)
        reg = canvas[np.ix_(ys_, xs_)]
        al = alpha[..., None]
        reg[..., :3] = reg[..., :3] * (1 - al) + col[None, None, :] * al
        canvas[np.ix_(ys_, xs_)] = reg
    return canvas


def painterly(a, sigma=6, strokes=1800, length=26, width=9, seed=1, opacity=0.55, detail=1.08, kuwa=5,
              angle=None, mask=None, keep=0.0):
    """Frequency-separated overpaint: paint brushwork over the LOW frequencies of the photo,
    then put the photo's high-frequency detail back on top (sharp, never blurry)."""
    low, high = split_freq(a, sigma)
    base = kuwahara(low, kuwa) if kuwa else low.copy()
    base = base * (1 - keep) + low * keep
    if angle is None:
        angle = flow_angle(a, sigma=8)
    if strokes:
        brush_strokes(base, low, strokes, length, width, seed=seed, angle=angle, opacity=opacity, mask=mask)
    return np.clip(base + high * detail, 0, 1)


def unsharp(a, sigma=1.0, amount=0.5):
    return np.clip(a + (a - blur(a, sigma)) * amount, 0, 1)


# ---------------------------------------------------------------------------------------
# Weathering layers (all tileable)
# ---------------------------------------------------------------------------------------
def cavity_from_height(h, sigma=6):
    """0 = exposed, 1 = deep crevice."""
    return np.clip((blur(h, sigma) - h) * 6 + 0.5, 0, 1) * 2 - 1


def apply_grime(a, cav, amount=0.5, color='#2a2620', noise_seed=3, scale=6):
    n = fbm(a.shape[1::-1], scale, 4, noise_seed)
    m = np.clip(cav, 0, 1) * 0.7 + sstep(0.45, 0.85, n) * 0.5
    m = np.clip(m * amount, 0, 1)[..., None]
    c = hex2rgb(color)
    return np.clip(a * (1 - m) + (a * c * 2.2) * m, 0, 1), m[..., 0]


def apply_layer(a, layer, mask, mode='normal'):
    m = np.clip(mask, 0, 1)[..., None]
    if mode == 'multiply':
        return np.clip(a * (1 - m) + a * layer * m, 0, 1)
    if mode == 'overlay':
        o = np.where(a < 0.5, 2 * a * layer, 1 - 2 * (1 - a) * (1 - layer))
        return np.clip(a * (1 - m) + o * m, 0, 1)
    return np.clip(a * (1 - m) + layer * m, 0, 1)


def streaks(size, n=60, seed=5, length=(0.2, 0.7), width=(1, 4), soft=1.2):
    """Vertical water/rust streak field (tileable), running DOWN the image (towards +row)."""
    w, h = (size, size) if isinstance(size, int) else size
    rng = np.random.default_rng(seed)
    f = np.zeros((h, w), np.float32)
    for _ in range(n):
        x = rng.random() * w
        y0 = rng.random() * h
        L = h * (length[0] + rng.random() * (length[1] - length[0]))
        wd = width[0] + rng.random() * (width[1] - width[0])
        amp = 0.35 + rng.random() * 0.65
        ys = np.arange(int(y0), int(y0 + L)) % h
        t = (np.arange(len(ys)) / max(1, len(ys))).astype(np.float32)
        prof = amp * (1 - t) ** 1.5 * (0.7 + 0.3 * np.sin(t * 17 + rng.random() * 6))
        wob = (np.cumsum(rng.standard_normal(len(ys))) * 0.15).astype(np.float32)
        for k, yy in enumerate(ys):
            xc = x + wob[k]
            x0, x1 = int(math.floor(xc - wd)), int(math.ceil(xc + wd))
            for xx in range(x0, x1 + 1):
                d = abs(xx - xc) / wd
                if d < 1:
                    f[yy, xx % w] = max(f[yy, xx % w], prof[k] * (1 - d * d))
    return blur(f, soft)


def edge_wear(h, amount=0.5, sigma=2.0):
    """Exposed ridges (positive curvature) from a height field: where paint chips first."""
    lap = ndimage.laplace(blur(h, sigma), mode='wrap')
    return np.clip(-lap * 40 * amount, 0, 1)


# ---------------------------------------------------------------------------------------
# Normals & roughness
# ---------------------------------------------------------------------------------------
def normal_from_height(h, strength=4.0, wrap=True):
    mode = 'wrap' if wrap else 'nearest'
    dx = ndimage.sobel(h, axis=1, mode=mode) * 0.125 * strength
    dy = ndimage.sobel(h, axis=0, mode=mode) * 0.125 * strength
    nx, ny = -dx, dy  # image rows grow downward = -v (OpenGL convention, like painter.js)
    nz = np.ones_like(h)
    inv = 1 / np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx * inv, ny * inv, nz * inv], -1).astype(np.float32)


def decode_normal(img):
    n = img[..., :3] * 2 - 1
    n /= np.linalg.norm(n, axis=2, keepdims=True) + 1e-6
    return n.astype(np.float32)


def encode_normal(n):
    n = n / (np.linalg.norm(n, axis=2, keepdims=True) + 1e-6)
    return np.clip(n * 0.5 + 0.5, 0, 1).astype(np.float32)


def blend_normals(base, detail, k=1.0):
    """Whiteout blend of two decoded normals; k scales the detail."""
    d = detail.copy()
    d[..., :2] *= k
    n = np.stack([base[..., 0] + d[..., 0], base[..., 1] + d[..., 1], base[..., 2] * d[..., 2]], -1)
    return n / (np.linalg.norm(n, axis=2, keepdims=True) + 1e-6)


def scale_normal(n, k):
    m = n.copy()
    m[..., :2] *= k
    return m / (np.linalg.norm(m, axis=2, keepdims=True) + 1e-6)


def flat_normal(h, w):
    n = np.zeros((h, w, 3), np.float32)
    n[..., 2] = 1
    return n


# ---------------------------------------------------------------------------------------
# Alpha helpers (foliage, decals)
# ---------------------------------------------------------------------------------------
def bleed_rgb(rgba, passes=24):
    """Spread opaque colours into transparent texels so mipmaps never halo (keeps alpha)."""
    rgb = rgba[..., :3].copy()
    a = rgba[..., 3]
    filled = a > 0.02
    acc = rgb * filled[..., None]
    wsum = filled.astype(np.float32)
    cur_rgb, cur_w = acc, wsum
    out = rgb.copy()
    known = filled.copy()
    for i in range(passes):
        cur_rgb = cv2.blur(cur_rgb, (3, 3))
        cur_w = cv2.blur(cur_w, (3, 3))
        new = (~known) & (cur_w > 1e-4)
        out[new] = cur_rgb[new] / cur_w[new][:, None]
        known |= new
        cur_rgb = out * known[..., None]
        cur_w = known.astype(np.float32)
        if known.all():
            break
    if not known.all():
        mean = rgb[filled].mean(0) if filled.any() else np.array([0.15, 0.2, 0.1])
        out[~known] = mean
    return np.concatenate([out, a[..., None]], -1)


def crisp_alpha(a, lo=0.35, hi=0.65):
    return sstep(lo, hi, a)


class Manifest:
    def __init__(self, root):
        self.root = root
        self.data = {'version': 1, 'textures': {}, 'printed': {}, 'decals': {}, 'overlays': {}}
        self.bytes = 0

    def add_texture(self, key, rel, size, srgb=True, alpha=False, wrap='repeat', extra=None, nbytes=0):
        e = {'file': rel, 'size': list(size), 'srgb': srgb}
        if alpha:
            e['alpha'] = True
        if wrap != 'repeat':
            e['wrap'] = wrap
        if extra:
            e.update(extra)
        self.data['textures'][key] = e
        self.bytes += nbytes

    def save(self, path):
        with open(path, 'w') as f:
            json.dump(self.data, f, indent=1, ensure_ascii=False)
