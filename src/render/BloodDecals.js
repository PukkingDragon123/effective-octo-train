// Photo-based blood for 2D surfaces (glass panes, screens): the CC0 blood decals in
// public/assets/textures/decals (photobashed from ambientCG photos, see
// docs/credits/textures.md) and an anatomical handprint generator textured with them.
//
// Canvas convention (glass blood canvases): rgb = blood colour, alpha = thickness
// (thin = translucent film, thick = opaque coagulated blood); the glass shader turns that
// into a stain / body / wet glint and darkens it with the light around it.
//
//   preloadBloodDecals()                          start loading (called at import)
//   bloodDecalImage(kind, variant?)               HTMLImageElement or null while loading
//   paintBloodHandprint(g, x, y, s, rot, opts)    palm + fingers + thumb, creases, ridges,
//                                                 coagulated centre, thin edges, drag streaks
//   paintBloodDecal(g, kind, x, y, w, h, rot, o)  smear / drip / spatter / pool photo decal
import { settings } from '../core/Settings.js';
import { makeRng } from '../core/math.js';

const PATH = 'assets/textures/decals/';
const VARIANTS = { handprint: 2, smear: 2, drip: 3, spatter: 3, pool: 3 };
const _imgs = new Map();
const reducedGore = () => settings.get('gore') === 'reduced';

function load(key) {
  if (_imgs.has(key) || typeof Image === 'undefined') return _imgs.get(key);
  const img = new Image();
  img.decoding = 'async';
  img.src = PATH + key + '.webp';
  _imgs.set(key, img);
  return img;
}

/** Start loading every decal (small WebPs, ~0.5 MB in all). */
export function preloadBloodDecals() {
  for (const [kind, n] of Object.entries(VARIANTS)) {
    for (let v = 0; v < n; v++) {
      load(`blood_${kind}_${v}`);
      load(`blood_${kind}_${v}_reduced`);
    }
  }
}

/** A loaded decal image ('handprint'|'smear'|'drip'|'spatter'|'pool'), or null while loading. */
export function bloodDecalImage(kind, variant = 0) {
  const n = VARIANTS[kind];
  if (!n) return null;
  const key = `blood_${kind}_${((variant % n) + n) % n}${reducedGore() ? '_reduced' : ''}`;
  const img = load(key);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c;
}

// ---------------------------------------------------------------------------
// anatomical handprint
// ---------------------------------------------------------------------------
// units of s (palm width ~0.74 s), fingers toward -y; right hand (thumb at -x)
const FINGERS = [
  // base x, base y, length, width, angle (rad from -y), pressure of the 3 pads (prox, mid, tip)
  { x: -0.27, y: -0.12, len: 0.62, w: 0.17, a: -0.14, p: [0.5, 0.62, 0.95] },
  { x: -0.09, y: -0.15, len: 0.68, w: 0.18, a: -0.04, p: [0.55, 0.66, 1.0] },
  { x: 0.09, y: -0.13, len: 0.64, w: 0.17, a: 0.05, p: [0.5, 0.62, 0.95] },
  { x: 0.26, y: -0.07, len: 0.5, w: 0.145, a: 0.17, p: [0.42, 0.55, 0.85] },
];
const THUMB = { x: -0.36, y: 0.26, len: 0.52, w: 0.2, a: -0.95, p: [0.75, 0.95] };

function pad(m, cx, cy, ang, len, w0, w1, alpha) {
  // a tapered capsule from (cx, cy) along `ang` (fingers point to -y)
  m.save();
  m.translate(cx, cy);
  m.rotate(ang);
  m.globalAlpha = alpha;
  m.beginPath();
  const r0 = w0 / 2, r1 = w1 / 2;
  m.moveTo(-r0, -r0 * 0.4);
  m.lineTo(-r1, -len + r1);
  m.quadraticCurveTo(-r1, -len, 0, -len);
  m.quadraticCurveTo(r1, -len, r1, -len + r1);
  m.lineTo(r0, -r0 * 0.4);
  m.quadraticCurveTo(r0, r0 * 0.25, 0, r0 * 0.25);
  m.quadraticCurveTo(-r0, r0 * 0.25, -r0, -r0 * 0.4);
  m.fill();
  m.restore();
}

function digit(m, f, S, spread, ridges, rng) {
  // three phalanx pads with unprinted joint creases between them
  const ang = f.a * spread;
  const L = f.len * S, W = f.w * S;
  const seg = f.p.length === 3 ? [[0, 0.43], [0.47, 0.73], [0.77, 1.0]] : [[0, 0.5], [0.55, 1.0]];
  const dx = Math.sin(ang), dy = -Math.cos(ang);
  for (let i = 0; i < seg.length; i++) {
    const [a, b] = seg[i];
    const t0 = a * L, t1 = b * L;
    const w0 = W * (1 - 0.1 * a), w1 = W * (1 - 0.12 * b);
    pad(m, f.x * S + dx * t0, f.y * S + dy * t0, ang, t1 - t0, w0, w1, f.p[i] * (0.85 + rng() * 0.15));
  }
  // fingerprint ridges on the tip pad: fine concentric loops, slightly unprinted
  const tx = f.x * S + dx * L * 0.88, ty = f.y * S + dy * L * 0.88;
  ridges.push({ x: tx, y: ty, ang, w: W * 0.5, h: L * 0.13 });
}

/**
 * Paint a bloody handprint into a 2D context (rgb colour, alpha thickness).
 * s = hand scale in px (palm width ~0.74 s, hand length ~1.35 s), rot = radians (0 =
 * fingers up). opts { seed, left (mirror), spread=1, drag (0..1 slide-down streaks),
 *   pressure=1, wet=1 }.
 */
export function paintBloodHandprint(g, x, y, s, rot = 0, opts = {}) {
  const rng = makeRng(opts.seed ?? ((Math.random() * 1e9) | 0));
  const reduced = reducedGore();
  const S = s;
  const N = Math.ceil(S * 2.0);
  const m = canvas(N, N).getContext('2d');
  m.translate(N / 2, N * 0.56);
  if (opts.left) m.scale(-1, 1);
  m.fillStyle = '#fff';
  const spread = opts.spread ?? 1;
  // ---- palm: knuckle line, little-finger edge, two heel pads, thenar bulge -------------------
  m.globalAlpha = 0.88;
  m.beginPath();
  m.moveTo(-0.37 * S, -0.1 * S);
  m.quadraticCurveTo(0, -0.2 * S, 0.35 * S, -0.06 * S);
  m.quadraticCurveTo(0.4 * S, 0.15 * S, 0.33 * S, 0.38 * S);
  m.quadraticCurveTo(0.27 * S, 0.62 * S, 0.06 * S, 0.6 * S);
  m.quadraticCurveTo(0.0, 0.55 * S, -0.08 * S, 0.6 * S);
  m.quadraticCurveTo(-0.33 * S, 0.66 * S, -0.43 * S, 0.34 * S);
  m.quadraticCurveTo(-0.46 * S, 0.1 * S, -0.37 * S, -0.1 * S);
  m.fill();
  // ---- fingers + thumb -------------------------------------------------------------------
  const ridges = [];
  for (const f of FINGERS) digit(m, f, S, spread, ridges, rng);
  digit(m, THUMB, S, spread, ridges, rng);
  m.globalAlpha = 1;
  // ---- the hollow of the palm barely touches the glass ------------------------------------
  m.globalCompositeOperation = 'destination-out';
  {
    const gr = m.createRadialGradient(0.0, 0.18 * S, 0, 0.0, 0.18 * S, 0.3 * S);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = gr;
    m.fillRect(-0.5 * S, -0.2 * S, S, 0.8 * S);
  }
  // ---- creases: heart, head and life lines, the crease at the finger roots ----------------
  m.strokeStyle = 'rgba(0,0,0,0.85)';
  m.lineCap = 'round';
  const crease = (w, pts) => {
    m.lineWidth = w * S;
    m.beginPath();
    m.moveTo(pts[0] * S, pts[1] * S);
    m.bezierCurveTo(pts[2] * S, pts[3] * S, pts[4] * S, pts[5] * S, pts[6] * S, pts[7] * S);
    m.stroke();
  };
  crease(0.022, [0.36, 0.04, 0.15, 0.0, -0.05, -0.02, -0.2, -0.05]); // heart line
  crease(0.02, [-0.37, 0.07, -0.12, 0.12, 0.08, 0.18, 0.26, 0.24]); // head line
  crease(0.022, [-0.33, 0.02, -0.16, 0.18, -0.15, 0.4, -0.1, 0.58]); // life line round the thenar
  crease(0.014, [-0.36, -0.1, -0.1, -0.17, 0.12, -0.15, 0.34, -0.07]); // finger roots
  // ---- skin ridges: fine loops on the finger tips + a fine grain over the palm ------------
  m.strokeStyle = 'rgba(0,0,0,0.32)';
  m.lineWidth = Math.max(0.6, S * 0.009);
  for (const r of ridges) {
    for (let k = 1; k <= 6; k++) {
      m.beginPath();
      m.ellipse(r.x, r.y, r.w * k / 6, r.h * k / 3.2, r.ang, 0, Math.PI * 2);
      m.stroke();
    }
  }
  // ---- incomplete transfer: speckled holes, heavier toward the outline ---------------------
  for (let k = 0; k < 220; k++) {
    m.fillStyle = `rgba(0,0,0,${0.35 + rng() * 0.5})`;
    const rr = S * (0.004 + rng() * rng() * 0.03);
    m.beginPath();
    m.arc((rng() - 0.5) * 1.1 * S, (rng() - 0.75) * 1.4 * S + 0.2 * S, rr, 0, Math.PI * 2);
    m.fill();
  }
  m.globalCompositeOperation = 'source-over';
  const mask = m.canvas;

  // ---- colour from the photo decals, coagulated (darker, thicker) centre, thin edges -------
  const c = canvas(N, N).getContext('2d');
  const photo = bloodDecalImage('pool', rng.int(0, 2)) || bloodDecalImage('smear', 0);
  if (photo) {
    // a random crop of the photo blood: real tone variation, tide marks and texture
    const cw = photo.naturalWidth * 0.55, ch = photo.naturalHeight * 0.55;
    c.drawImage(photo, rng() * (photo.naturalWidth - cw), rng() * (photo.naturalHeight - ch), cw, ch, 0, 0, N, N);
    c.globalCompositeOperation = 'destination-over';
  }
  c.fillStyle = reduced ? 'rgb(44,14,13)' : 'rgb(92,5,10)';
  c.fillRect(0, 0, N, N);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(mask, 0, 0);
  // thickness profile: the interior (blurred mask) is thick and dark, the outline a thin film
  const thick = canvas(N, N).getContext('2d');
  thick.filter = `blur(${Math.max(1, S * 0.035).toFixed(1)}px)`;
  thick.drawImage(mask, 0, 0);
  thick.filter = 'none';
  c.globalCompositeOperation = 'source-atop';
  const core = canvas(N, N).getContext('2d');
  core.drawImage(thick.canvas, 0, 0);
  core.globalCompositeOperation = 'source-in';
  core.fillStyle = reduced ? 'rgb(18,6,6)' : 'rgb(34,1,4)';
  core.fillRect(0, 0, N, N);
  c.globalAlpha = 0.55;
  c.drawImage(core.canvas, 0, 0);
  c.globalAlpha = 1;
  // alpha = mask x (0.5 + 0.5 x interior): edges translucent, centres opaque
  const prof = canvas(N, N).getContext('2d');
  prof.fillStyle = 'rgba(255,255,255,0.5)';
  prof.fillRect(0, 0, N, N);
  prof.globalAlpha = 0.5;
  prof.drawImage(thick.canvas, 0, 0);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(prof.canvas, 0, 0);
  // wet glints on the thickest pads (tips, heel)
  if ((opts.wet ?? 1) > 0 && !reduced) {
    c.globalCompositeOperation = 'source-atop';
    for (let k = 0; k < 10; k++) {
      const f = k < 5 ? (k < 4 ? FINGERS[k] : THUMB) : null;
      const ang = f ? f.a * spread : 0;
      const gx = f ? f.x * S + Math.sin(ang) * f.len * S * 0.86 : (rng() - 0.5) * 0.4 * S;
      const gy = f ? f.y * S - Math.cos(ang) * f.len * S * 0.86 : (0.45 + rng() * 0.1) * S;
      c.fillStyle = `rgba(200,120,110,${0.25 + rng() * 0.25})`;
      c.beginPath();
      c.ellipse(N / 2 + (opts.left ? -gx : gx) + S * 0.03, N * 0.56 + gy - S * 0.02, S * 0.018, S * 0.008, ang - 0.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.globalCompositeOperation = 'source-over';

  // ---- onto the target: drag streaks first (the hand slid down), then the print ------------
  const pressure = opts.pressure ?? 1;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const drag = opts.drag === true ? 1 : opts.drag || 0;
  if (drag > 0) {
    const steps = 14;
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      g.globalAlpha = (0.05 + 0.2 * (1 - t)) * pressure;
      // stretched copies give streaks along every pad, thinning toward the end
      g.drawImage(c.canvas, -N / 2, -N * 0.56 + t * drag * 1.1 * S, N, N * (1 + 0.15 * t));
    }
  }
  g.globalAlpha = pressure;
  g.drawImage(c.canvas, -N / 2, -N * 0.56);
  g.restore();
  g.globalAlpha = 1;
  // where the heavy pads sit (for drips): fingertips + heel, in target space
  const out = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const put = (lx, ly) => out.push({ x: x + (lx * cr - ly * sr), y: y + (lx * sr + ly * cr) });
  for (const f of FINGERS) put((opts.left ? -1 : 1) * (f.x * S + Math.sin(f.a) * f.len * S * 0.9), f.y * S - Math.cos(f.a) * f.len * S * 0.8);
  put(0, 0.58 * S + drag * 1.1 * S);
  return out;
}

/**
 * Draw a photo decal ('smear'|'drip'|'spatter'|'pool') centred at (x, y), w x h px, rotated.
 * opts { variant, alpha=1, anchorTop (drip: (x, y) is the top edge) }. Returns false while
 * the image is still loading (the caller can fall back to a procedural mark).
 */
export function paintBloodDecal(g, kind, x, y, w, h, rot = 0, opts = {}) {
  const img = bloodDecalImage(kind, opts.variant ?? ((Math.random() * 3) | 0));
  if (!img) return false;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = opts.alpha ?? 1;
  g.drawImage(img, -w / 2, opts.anchorTop ? 0 : -h / 2, w, h);
  g.restore();
  g.globalAlpha = 1;
  return true;
}

preloadBloodDecals();
