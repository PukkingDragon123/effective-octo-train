// กระหัง (Krahang): a gaunt old man who flies at night with two rice-winnowing baskets (กระด้ง)
// as wings, gripping their rims, and a wooden pestle (สากกะเบือ) tucked between his legs as a
// tail. The baskets are woven bamboo trays with rattan-bound rims (a procedural twill texture),
// the pestle a lathe-turned, worn hardwood stick. He flies prone, legs trailing, wings beating
// with a dry woven whump; his eyes glow.
//   const k = createKrahang(); scene.add(k.root); await k.flyPath([p0, p1, p2], 9);
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { paintedMaterial } from '../render/index.js';
import { SPECS, human } from './humans.js';
import { Entity, TAU, damp, clamp, noise, worldPos, animate } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
let SHARED = null;

function weaveTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6e5634';
  g.fillRect(0, 0, S, S);
  // diagonal 2/2 twill of flat bamboo strips (alternating over/under), each strip shaded + nicked
  const N = 32, w = S / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const over = ((i + j) >> 1) % 2 === 0;
    const x = i * w, y = j * w;
    const base = over ? [176, 140, 86] : [146, 112, 66];
    const n = ((i * 7 + j * 13) % 11) / 11;
    const r = base[0] - 18 * n, gg = base[1] - 16 * n, b = base[2] - 12 * n;
    const grad = over ? g.createLinearGradient(x, y, x + w, y) : g.createLinearGradient(x, y, x, y + w);
    grad.addColorStop(0, `rgb(${r * 0.72},${gg * 0.72},${b * 0.7})`);
    grad.addColorStop(0.18, `rgb(${r},${gg},${b})`);
    grad.addColorStop(0.82, `rgb(${r * 0.95},${gg * 0.95},${b * 0.93})`);
    grad.addColorStop(1, `rgb(${r * 0.66},${gg * 0.66},${b * 0.64})`);
    g.fillStyle = grad;
    g.fillRect(x + 0.6, y + 0.6, w - 1.2, w - 1.2);
    // fibre lines along the strip
    g.strokeStyle = 'rgba(70,50,28,0.35)';
    g.lineWidth = 0.7;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      if (over) { g.moveTo(x, y + (k * w) / 4); g.lineTo(x + w, y + (k * w) / 4 + (n - 0.5)); } else { g.moveTo(x + (k * w) / 4, y); g.lineTo(x + (k * w) / 4 + (n - 0.5), y + w); }
      g.stroke();
    }
  }
  // soot, rice dust and age
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 14;
    g.fillStyle = Math.random() < 0.6 ? `rgba(30,22,12,${0.03 + Math.random() * 0.06})` : `rgba(230,220,190,${0.02 + Math.random() * 0.05})`;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function shared() {
  if (SHARED) return SHARED;
  const R = 0.36;
  // shallow woven tray: ring geometry with planar uvs, dished, a little warped
  const tray = new THREE.RingGeometry(0.004, R, 56, 10);
  const p = tray.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const r = Math.hypot(x, y) / R;
    const warp = Math.sin(Math.atan2(y, x) * 3 + 0.7) * 0.006 * r;
    p.setZ(i, -0.05 * (1 - r * r) + 0.012 * r * r * r + warp);
  }
  tray.rotateX(-Math.PI / 2); // lies in XZ, dish opening upward (+Y)
  tray.computeVertexNormals();
  const rim = new THREE.TorusGeometry(R, 0.017, 8, 72);
  rim.rotateX(-Math.PI / 2);
  rim.translate(0, 0.012, 0);
  // rattan binding wraps around the rim
  // pestle: lathe-turned, waisted, worn ends
  const prof = [];
  const L = 1.05;
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const y = t * L;
    const end = Math.min(t, 1 - t);
    const r = 0.034 + 0.016 * Math.pow(1 - Math.min(1, end * 4.5), 1.5) - 0.006 * Math.sin(t * Math.PI);
    prof.push(new THREE.Vector2(Math.max(0.004, r * Math.min(1, end * 40 + 0.25)), y));
  }
  const pestle = new THREE.LatheGeometry(prof, 18);
  pestle.translate(0, -L * 0.5, 0);
  const weave = weaveTexture();
  SHARED = {
    tray, rim, pestle,
    trayMat: paintedMaterial({ map: weave, color: 0xffffff, roughness: 0.82, side: THREE.DoubleSide, brush: 0.35, wet: 0.25, puddles: 0 }),
    rimMat: paintedMaterial({ color: 0x5a3f22, roughness: 0.7, brush: 0.4, wet: 0.2, puddles: 0 }),
    wrapMat: paintedMaterial({ color: 0x8a6a3e, roughness: 0.75, brush: 0.5, wet: 0.2, puddles: 0 }),
    woodMat: paintedMaterial({ color: 0x4a3322, roughness: 0.55, brush: 0.55, wet: 0.2, puddles: 0 }),
  };
  for (const m of [SHARED.trayMat, SHARED.rimMat, SHARED.wrapMat, SHARED.woodMat]) m.userData.shared = true;
  for (const g of [tray, rim, pestle]) g.userData.shared = true;
  return SHARED;
}

function basket() {
  const S = shared();
  const g = new THREE.Group();
  g.name = 'kradong';
  const t = new THREE.Mesh(S.tray, S.trayMat);
  const r = new THREE.Mesh(S.rim, S.rimMat);
  g.add(t, r);
  for (const m of [t, r]) { m.castShadow = true; m.receiveShadow = true; }
  // rattan lashing knots along the rim (small wraps)
  const knot = new THREE.TorusGeometry(0.024, 0.006, 5, 10);
  knot.userData.shared = false;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const k = new THREE.Mesh(knot, S.wrapMat);
    k.position.set(Math.cos(a) * 0.36, 0.012, Math.sin(a) * 0.36);
    k.rotation.y = -a;
    g.add(k);
  }
  return g;
}

export class Krahang extends Entity {
  constructor(opts = {}) {
    super('krahang');
    this.h = human(SPECS.krahang, opts);
    this.humanoid = this.h;
    this.frame = new THREE.Group(); // flight frame: -Z = heading
    this.frame.name = 'krahangFrame';
    this.root.add(this.frame);
    this.body = new THREE.Group(); // pitch: prone flight
    this.frame.add(this.body);
    this.body.add(this.h.root);
    this.body.rotation.x = -1.15;
    this.h.root.position.set(0, -0.95, 0); // body centre (hips) at the frame origin
    this.h.setMode('float');
    this.h.setGhost({ levitate: 0.3, stare: 1, unlimited: 1 }, 100);
    this.h.setExpression({ creepy: 0.6 });
    // wings: pivots at the shoulders, a basket held by its inner rim
    this.wings = {};
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1; // the character faces -Z: its left is -X
      const pivot = new THREE.Group();
      this.frame.add(pivot);
      const b = basket();
      b.position.set(sg * 0.62, 0, 0.05);
      b.rotation.set(0, 0, sg * 0.08);
      pivot.add(b);
      const grip = new THREE.Object3D();
      grip.position.set(-sg * 0.33, 0.02, 0.02); // inner rim (toward the body)
      b.add(grip);
      this.wings[side] = { pivot, basket: b, grip, sg };
    }
    // pestle tail
    const S = shared();
    this.tail = new THREE.Mesh(S.pestle, S.woodMat);
    this.tail.castShadow = true;
    this.tail.name = 'saak';
    this.frame.add(this.tail);
    this.flap = 0;
    this.flapRate = 1.15;
    this.path = null;
    this.vel = new THREE.Vector3();
    this._lastDown = false;
    this._bank = 0;
  }

  /** Fly along world points at `speed` m/s (Catmull-Rom). Resolves at the end. */
  flyPath(points, speed = 9) {
    const pts = points.map((p) => p.clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const L = curve.getLength();
    this.path = { curve, L, s: 0, speed };
    this.root.position.set(0, 0, 0);
    curve.getPointAt(0, _v);
    this._place(_v, curve.getTangentAt(0, _v2), 0);
    return new Promise((res) => (this.path.resolve = res));
  }

  _place(pos, tan, dt) {
    const parent = this.root.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      this.frame.position.copy(parent.worldToLocal(pos.clone()));
    } else this.frame.position.copy(pos);
    const yaw = Math.atan2(-tan.x, -tan.z);
    const pitch = Math.asin(clamp(tan.y, -1, 1));
    // bank into turns (yaw rate)
    const dyaw = this._yaw === undefined ? 0 : yaw - this._yaw;
    this._yaw = yaw;
    let d = dyaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    this._bank = damp(this._bank, clamp((dt > 0 ? d / dt : 0) * 0.35, -0.6, 0.6), 2, dt || 0.016);
    this.frame.rotation.set(pitch * 0.6, yaw, this._bank, 'YXZ');
  }

  step(dt) {
    const t = this.time;
    if (this.path) {
      const P = this.path;
      P.s += P.speed * dt * (0.85 + 0.3 * Math.max(0, Math.sin(this.flap)));
      const u = Math.min(1, P.s / P.L);
      P.curve.getPointAt(u, _v);
      P.curve.getTangentAt(u, _v2);
      this._place(_v, _v2, dt);
      if (u >= 1) {
        const r = P.resolve;
        this.path = null;
        r?.(true);
      }
    }
    // wing beat: quick powerful downstroke, slow recovery
    this.flap += dt * TAU * this.flapRate;
    const ph = this.flap % TAU;
    const s = Math.sin(ph);
    const stroke = s > 0 ? Math.pow(s, 0.7) : -Math.pow(-s, 1.6) * 0.8;
    for (const side of ['L', 'R']) {
      const w = this.wings[side];
      // shoulder positions from the skeleton (frame space)
      const ua = this.h.bones[side === 'L' ? 'upperarm_l' : 'upperarm_r'];
      if (ua) {
        ua.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(ua.matrixWorld);
        this.frame.updateWorldMatrix(true, false);
        this.frame.worldToLocal(_v);
        w.pivot.position.lerp(_v, dt > 0 ? 0.5 : 1);
      }
      w.pivot.rotation.set(0.15, 0, -w.sg * (0.55 * stroke - 0.08) + noise.noise2D(t * 0.6, w.sg) * 0.05);
      w.basket.rotation.x = -0.25 * stroke; // feathering
      this.h.setHandTarget(side, w.grip, { weight: 1, fingers: 'grip', grip: 1, blend: 0.15 });
    }
    if (s > 0.92 && !this._lastDown) {
      this._lastDown = true;
      audio.play('paper_rustle', { object: this.frame, volume: 0.65, rate: 0.42 });
      audio.play('bush_scrape', { object: this.frame, volume: 0.25, rate: 0.7 });
    } else if (s < 0.5) this._lastDown = false;
    // body undulation with the beat; legs trail
    this.body.rotation.x = -1.15 + stroke * 0.06;
    this.body.position.y = -stroke * 0.12;
    // pestle tail between the legs, trailing behind and a little down, swinging
    const pel = this.h.bones.pelvis;
    if (pel) {
      pel.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(pel.matrixWorld);
      this.frame.worldToLocal(_v);
      this.tail.position.copy(_v).add(_v2.set(0, -0.05, 0.42));
    }
    this.tail.rotation.set(Math.PI / 2 + 0.25 + stroke * 0.08, 0, noise.noise2D(t * 0.9, 5.5) * 0.15);
  }

  /** Fade out (dispersing into the canopy). */
  async vanish(d = 1.5) {
    await animate(d, (k) => {
      this.h.setOpacity(1 - k);
      for (const w of Object.values(this.wings)) w.basket.visible = k < 0.85;
      this.tail.visible = k < 0.85;
    });
  }

  dispose() {
    this.h.dispose();
    super.dispose();
  }
}

export { _m, _q, worldPos };
