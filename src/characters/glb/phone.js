// A modern Thai budget smartphone (original, unbranded): rounded slab body with soft bevels, a thin black
// bezel, a lit (emissive) lock screen under a cracked screen protector, a rounded camera bump with three
// lenses and a flash on the back. 7.6 x 16.4 x 0.86 cm. Local frame: screen faces +Z, top of the phone +Y.
import * as THREE from 'three';
import { paintedMaterial } from '../../render/index.js';
import { FONTS } from '../../ui/fonts.js';

const W = 0.076, H = 0.164, D = 0.0086, RAD = 0.0105;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** the lock screen: night wallpaper, the time, a message notification, and the cracked protector */
function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 780;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 780);
  bg.addColorStop(0, '#1b2a3a'); bg.addColorStop(0.55, '#2c3b44'); bg.addColorStop(1, '#3a2f2a');
  g.fillStyle = bg; g.fillRect(0, 0, 360, 780);
  // wallpaper: a soft temple silhouette at dusk
  g.fillStyle = 'rgba(10,14,18,0.75)';
  g.beginPath(); g.moveTo(0, 640); g.lineTo(80, 610); g.lineTo(130, 520); g.lineTo(150, 470); g.lineTo(170, 520); g.lineTo(220, 600); g.lineTo(360, 630); g.lineTo(360, 780); g.lineTo(0, 780); g.fill();
  g.fillStyle = '#e9edf0';
  g.textAlign = 'center';
  g.font = `600 22px ${FONTS?.body || 'sans-serif'}`;
  g.fillText('พฤหัสบดี 12 ธันวาคม', 180, 118);
  g.font = `300 104px ${FONTS?.body || 'sans-serif'}`;
  g.fillText('02:47', 180, 215);
  // status bar
  g.font = '600 16px sans-serif'; g.textAlign = 'left'; g.fillText('TH-NET 4G', 18, 30);
  g.textAlign = 'right'; g.fillText('17%', 342, 30);
  // notification card
  g.fillStyle = 'rgba(235,238,240,0.88)';
  const ny = 268, nh = 92;
  g.beginPath(); g.roundRect ? g.roundRect(18, ny, 324, nh, 16) : g.rect(18, ny, 324, nh); g.fill();
  g.fillStyle = '#2a2f33'; g.textAlign = 'left';
  g.font = `700 18px ${FONTS?.body || 'sans-serif'}`; g.fillText('แม่', 36, ny + 30);
  g.font = `400 18px ${FONTS?.body || 'sans-serif'}`; g.fillText('ต้น ถึงไหนแล้วลูก กลับบ้านดีๆ นะ', 36, ny + 62);
  g.font = '400 13px sans-serif'; g.textAlign = 'right'; g.fillStyle = '#6a7075'; g.fillText('02:41', 326, ny + 30);
  // cracked screen protector: an impact star in the lower corner, long cracks, chipped glints
  const rnd = (() => { let s = 17; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const ox = 300, oy = 700;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  for (let k = 0; k < 11; k++) {
    let x = ox, y = oy, a = -Math.PI * 0.5 - rnd() * Math.PI * 0.95;
    g.lineWidth = 0.6 + rnd() * 1.1;
    g.beginPath(); g.moveTo(x, y);
    const len = 60 + rnd() * (k < 3 ? 520 : 200);
    for (let d = 0; d < len; d += 14) { a += (rnd() - 0.5) * 0.35; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(ox, oy, 8 + k * 9 + rnd() * 4, Math.PI * 0.9, Math.PI * 1.9); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox - 26, oy - 10); g.lineTo(ox - 12, oy - 28); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const bevel = 0.0016;
  const body = new THREE.ExtrudeGeometry(roundedRect(W - 2 * bevel, H - 2 * bevel, RAD - bevel), { depth: D - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  body.translate(0, 0, -(D - 2 * bevel) / 2);
  const glass = new THREE.ShapeGeometry(roundedRect(W - 0.0012, H - 0.0012, RAD - 0.0006), 10);
  glass.translate(0, 0, D / 2 + 0.0001);
  const screen = new THREE.ShapeGeometry(roundedRect(W - 0.0052, H - 0.0062, RAD - 0.003), 10);
  // uv 0..1 over the screen rectangle
  const p = screen.attributes.position, uv = screen.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (W - 0.0052) + 0.5, p.getY(i) / (H - 0.0062) + 0.5);
  screen.translate(0, 0, D / 2 + 0.0002);
  const bump = new THREE.ExtrudeGeometry(roundedRect(0.024, 0.034, 0.006), { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 2, curveSegments: 8 });
  bump.rotateY(Math.PI);
  bump.translate(-W / 2 + 0.019, H / 2 - 0.024, -D / 2);
  const lenses = [];
  for (const [x, y, r] of [[-W / 2 + 0.019, H / 2 - 0.0155, 0.0052], [-W / 2 + 0.019, H / 2 - 0.0315, 0.0042], [-W / 2 + 0.0095, H / 2 - 0.0315, 0.0019]]) {
    const ring = new THREE.LatheGeometry([[0, 0], [r * 0.82, 0], [r, -0.0003], [r, -0.0011], [r * 0.82, -0.0013]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, y, -D / 2 - 0.0014);
    lenses.push(ring);
  }
  const mats = {
    body: paintedMaterial({ color: 0x2b3442, roughness: 0.42, metalness: 0.0, brush: 0.08, wet: 0, puddles: 0, name: 'phone-body' }),
    bezel: paintedMaterial({ color: 0x08090b, roughness: 0.18, brush: 0, wet: 0, puddles: 0, name: 'phone-bezel' }),
    lens: paintedMaterial({ color: 0x0c0d10, roughness: 0.08, metalness: 0.3, brush: 0, wet: 0, puddles: 0, name: 'phone-lens' }),
  };
  SHARED = { body, glass, screen, bump, lenses, mats };
  return SHARED;
}

/** A phone instance: { root, screenMat, setScreen(on) }. */
export function buildPhone() {
  const S = shared();
  const root = new THREE.Group();
  root.name = 'phone';
  const tex = screenTexture();
  const screenMat = paintedMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.12, brush: 0, wet: 0, puddles: 0, atmoRim: 0, name: 'phone-screen' });
  root.add(new THREE.Mesh(S.body, S.mats.body), new THREE.Mesh(S.glass, S.mats.bezel), new THREE.Mesh(S.screen, screenMat), new THREE.Mesh(S.bump, S.mats.body));
  for (const l of S.lenses) root.add(new THREE.Mesh(l, S.mats.lens));
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return {
    root,
    screenMat,
    setScreen(on) { screenMat.emissiveIntensity = on ? 0.9 : 0; screenMat.color.setScalar(on ? 1 : 0.05); },
    dispose() { root.removeFromParent(); tex.dispose(); screenMat.dispose(); },
  };
}
