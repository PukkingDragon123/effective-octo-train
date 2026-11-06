// The late-night news studio for ui.newsReport: its own WebGL canvas (like IncenseScene), a curved
// anchor desk (extruded plan and front band, graphite with a red LED line), a slatted backdrop wall,
// a bezelled studio screen showing the crash photo, script pages on the desk, key / fill / rim
// lights, and a news anchor (createHumanoid) seated at the desk, talking, gesturing with one hand
// and glancing down at the script. The camera pushes in slowly.
import * as THREE from 'three';
import { loadCharacterAssets, createHumanoid, randomPerson, HumanoidGLB } from '../characters/index.js';
import { FONTS } from './fonts.js';

const DESK_Y = 0.76;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The desk: a bowed crescent top (extruded, bevelled) over a curved front band, a red LED line. */
function desk() {
  const g = new THREE.Group();
  const plan = new THREE.Shape();
  plan.moveTo(-1.2, 0);
  plan.quadraticCurveTo(0, 0.38, 1.2, 0);
  plan.lineTo(1.12, -0.6);
  plan.quadraticCurveTo(0, -0.3, -1.12, -0.6);
  plan.closePath();
  const topG = new THREE.ExtrudeGeometry(plan, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 5, curveSegments: 64 });
  topG.rotateX(Math.PI / 2);
  const top = new THREE.Mesh(topG, new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.22, metalness: 0.35 }));
  top.position.y = DESK_Y;
  // the front: a band following the bow, 3 cm thick, extruded down to the floor
  const band = new THREE.Shape();
  const N = 48;
  const front = (t, inset) => {
    const x = -1.16 + 2.32 * t;
    const z = 2 * t * (1 - t) * (0.34 - inset * 1.2) - 0.02 - inset;
    return [x * (1 - inset * 0.3), z];
  };
  for (let i = 0; i <= N; i++) {
    const [x, z] = front(i / N, 0);
    if (i === 0) band.moveTo(x, z);
    else band.lineTo(x, z);
  }
  for (let i = N; i >= 0; i--) band.lineTo(...front(i / N, 0.03));
  band.closePath();
  const frontG = new THREE.ExtrudeGeometry(band, { depth: DESK_Y - 0.06, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  frontG.rotateX(Math.PI / 2);
  const brushed = canvasTex(1024, 256, (x, w, h) => {
    x.fillStyle = '#16191e';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = 24 + Math.random() * 18;
      x.strokeStyle = `rgba(${v},${v + 2},${v + 6},0.35)`;
      x.beginPath();
      const y = Math.random() * h;
      x.moveTo(0, y);
      x.lineTo(w, y + (Math.random() - 0.5) * 2);
      x.stroke();
    }
  });
  brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  brushed.repeat.set(1.2, 1.2);
  const frontM = new THREE.Mesh(frontG, new THREE.MeshStandardMaterial({ map: brushed, roughness: 0.42, metalness: 0.75 }));
  frontM.position.y = DESK_Y - 0.05;
  // the LED line along the front, a hand-span under the top
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const [x, z] = front(i / 64, -0.004);
    pts.push(new THREE.Vector3(x, DESK_Y - 0.11, z));
  }
  const led = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.0045, 8), new THREE.MeshBasicMaterial({ color: 0xff4a32, toneMapped: false }));
  g.add(top, frontM, led);
  return g;
}

/** Script pages, slightly curled, printed with lines of text. */
function pages() {
  const tex = canvasTex(512, 724, (x, w, h) => {
    x.fillStyle = '#efece4';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#c8161d';
    x.fillRect(40, 40, 120, 14);
    for (let i = 0; i < 26; i++) {
      x.fillStyle = `rgba(30,32,36,${0.55 + Math.random() * 0.2})`;
      x.fillRect(40, 90 + i * 22, (w - 80) * (i % 6 === 5 ? 0.5 : 0.75 + Math.random() * 0.25), 7);
    }
  });
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const geo = new THREE.PlaneGeometry(0.21, 0.297, 10, 14);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.004 * Math.sin((p.getY(i) / 0.297 + 0.5) * Math.PI) + 0.002 * (p.getX(i) / 0.105) ** 2);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
    m.rotation.set(-Math.PI / 2, 0, 0.05 * (k - 1) + 0.12);
    m.position.set(k * 0.004, 0.0008 * k, k * 0.003);
    g.add(m);
  }
  return g;
}

/** The studio screen: bevelled bezel (rounded rectangle with a hole, extruded) and the image. */
function studioScreen(image, headline) {
  const W = 1.9, H = 1.07, r = 0.03;
  const rr = (s, w, h, rad) => {
    s.moveTo(-w / 2 + rad, -h / 2);
    s.lineTo(w / 2 - rad, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rad);
    s.lineTo(w / 2, h / 2 - rad);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - rad, h / 2);
    s.lineTo(-w / 2 + rad, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rad);
    s.lineTo(-w / 2, -h / 2 + rad);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rad, -h / 2);
  };
  const outer = new THREE.Shape();
  rr(outer, W + 0.06, H + 0.06, r + 0.02);
  const hole = new THREE.Path();
  rr(hole, W, H, r * 0.5);
  outer.holes.push(hole);
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 12 }), new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.3, metalness: 0.6 }));
  const tex = canvasTex(1280, 720, (x, w, h) => {
    x.fillStyle = '#05070a';
    x.fillRect(0, 0, w, h);
    const sw = image?.videoWidth || image?.naturalWidth || image?.width || 0;
    const sh = image?.videoHeight || image?.naturalHeight || image?.height || 0;
    if (sw && sh) {
      try {
        const s = Math.max(w / sw, h / sh);
        x.drawImage(image, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s);
      } catch (e) {
        /* tainted */
      }
    }
    const v = x.createLinearGradient(0, h * 0.55, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.75)');
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#c8161d';
    x.fillRect(64, h - 168, 210, 58);
    x.fillStyle = '#fff';
    x.font = `600 40px ${FONTS.title}`;
    x.textBaseline = 'middle';
    x.fillText('ข่าวด่วน', 84, h - 138);
    x.font = `600 46px ${FONTS.title}`;
    const words = String(headline || '').split(' ');
    let line = '', y = h - 70;
    for (const wd of words) {
      if (x.measureText(line + wd).width > w - 140 && line) break;
      line += wd + ' ';
    }
    x.fillText(line.trim(), 64, y);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xd8d8d8 }));
  screen.position.z = 0.03;
  const g = new THREE.Group();
  g.add(bezel, screen);
  return g;
}

/** The set behind: a curved wall of vertical acoustic slats with two cool light lines, and a floor. */
function backdrop() {
  const g = new THREE.Group();
  const tex = canvasTex(2048, 512, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#05070c');
    gr.addColorStop(0.55, '#0c1524');
    gr.addColorStop(1, '#070a10');
    x.fillStyle = gr;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 24) {
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(i, 0, 3, h);
      x.fillStyle = 'rgba(120,150,200,0.05)';
      x.fillRect(i + 3, 0, 2, h);
    }
    for (const y of [0.3, 0.74]) {
      const lg = x.createLinearGradient(0, h * y - 10, 0, h * y + 10);
      lg.addColorStop(0, 'rgba(150,180,230,0)');
      lg.addColorStop(0.5, 'rgba(190,210,245,0.55)');
      lg.addColorStop(1, 'rgba(150,180,230,0)');
      x.fillStyle = lg;
      x.fillRect(0, h * y - 10, w, 20);
    }
  });
  // swept curved wall (radius 5.5 m, 80 degrees, 3.4 m tall)
  const R = 5.5, A = (80 * Math.PI) / 180, segs = 96;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = -A / 2 + (A * i) / segs;
    for (const [y, v] of [[0, 0], [3.4, 1]]) {
      pos.push(Math.sin(a) * R, y, -Math.cos(a) * R);
      uv.push(i / segs, v);
    }
  }
  for (let i = 0; i < segs; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wg.setIndex(idx);
  wg.computeVertexNormals();
  const wall = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.8 }));
  wall.position.z = 3.2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.32, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  g.add(wall, floor);
  return g;
}

export class NewsStudio {
  /** @param host element to fill; opts {image, headline} */
  constructor(host, { image, headline } = {}) {
    this.host = host;
    this.t = 0;
    this.disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x020304, 1);
    renderer.domElement.className = 'dlb-news__canvas';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);

    // key (warm, high front-left of the anchor), fill (cool, low right), rim (blue, behind), ambient
    const key = new THREE.SpotLight(0xfff0de, 55, 9, 0.42, 0.7, 2);
    key.position.set(-1.4, 2.7, 2.0);
    key.target.position.set(-0.35, 1.15, -0.78);
    const fill = new THREE.SpotLight(0xdfe7ff, 12, 9, 0.6, 0.9, 2);
    fill.position.set(1.6, 1.4, 1.9);
    fill.target.position.set(-0.35, 1.1, -0.78);
    const rim = new THREE.DirectionalLight(0x9db6ff, 1.4);
    rim.position.set(1.2, 2.4, -3);
    rim.target.position.set(-0.35, 1.1, -0.8);
    scene.add(key, key.target, fill, fill.target, rim, rim.target, new THREE.HemisphereLight(0x1d2a3c, 0x0a0a0a, 0.5));

    scene.add(backdrop(), desk());
    this.screen = studioScreen(image, headline);
    this.screen.position.set(0.82, 1.5, -1.9);
    this.screen.rotation.y = -0.18;
    scene.add(this.screen);
    this.paper = pages();
    this.paper.position.set(-0.36, DESK_Y + 0.002, -0.27);
    scene.add(this.paper);

    // anchor rig targets
    this.seat = new THREE.Object3D();
    this.seat.position.set(-0.36, 0.5, -0.8);
    this.seat.rotation.y = Math.PI;
    scene.add(this.seat);
    this.handL = new THREE.Object3D();
    this.handR = new THREE.Object3D();
    // she faces +Z, so her left hand is on the +X side
    this.handL.position.set(-0.2, DESK_Y + 0.03, -0.3);
    this.handR.position.set(-0.52, DESK_Y + 0.03, -0.32);
    this.lookCam = new THREE.Object3D();
    this.lookPaper = new THREE.Object3D();
    this.lookPaper.position.set(-0.36, DESK_Y, -0.25);
    scene.add(this.handL, this.handR, this.lookCam, this.lookPaper);
    this.talking = false;

    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
    this.ready = this._anchor();
  }

  async _anchor() {
    try {
      await Promise.race([loadCharacterAssets(), new Promise((_, rej) => setTimeout(() => rej(new Error('character assets timeout')), 6000))]);
      if (this.disposed) return;
      const spec = randomPerson(4242, { sex: 'f', age: 34, id: 'newsAnchor' });
      spec.hair = { style: 'bob', color: 0x15110f };
      spec.outfit = { type: 'shirt-slacks', sleeve: 'long', top: '#1f2733', bottom: '#1a1d24', shoes: 'shoes' };
      spec.accessories = [];
      if (spec.mh?.look) Object.assign(spec.mh.look, { posture: 'upright', sweat: 0, marks: [] });
      const p = createHumanoid(spec);
      // driven by this scene's own loop, always at full detail
      p._off?.();
      p.noThrottle = true;
      p._setLod = function () {
        HumanoidGLB.prototype._setLod.call(this, 'hi');
      };
      p._setLod();
      p.sitAt(this.seat, { pose: 'sit', blend: 0 });
      p.setHandTarget('L', this.handL, { weight: 1, blend: 0.4, grip: 0.15 });
      p.setHandTarget('R', this.handR, { weight: 1, blend: 0.4, grip: 0.2 });
      p.lookAt(this.lookCam, { weight: 1, speed: 3 });
      p.root.traverse((o) => {
        if (o.isMesh) o.frustumCulled = false;
      });
      this.person = p;
      for (let i = 0; i < 8; i++) p.update(1 / 30); // settle into the pose before the first frame
    } catch (e) {
      console.warn('[news] anchor unavailable', e);
      this.person = null;
    }
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setTalking(on) {
    this.talking = !!on;
    this.person?.setTalking(this.talking, 0.9);
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    // the camera: a slow push from a two-shot (anchor + screen) toward the anchor
    const k = Math.min(1, t / 12);
    const e = k * k * (3 - 2 * k);
    const cam = this.camera;
    cam.position.set(0.12 - 0.26 * e + Math.sin(t * 0.4) * 0.006, 1.2 - 0.03 * e + Math.sin(t * 0.33) * 0.004, 2.35 - 0.7 * e);
    cam.lookAt(-0.06 - 0.2 * e, 1.06, -0.85);
    this.lookCam.position.copy(cam.position);
    // a glance down at the script now and then; a small hand gesture on stressed phrases
    const p = this.person;
    if (p) {
      const glance = (t % 4.6) > 3.7;
      p.lookAt(glance ? this.lookPaper : this.lookCam, { weight: 1, speed: glance ? 5 : 3 });
      const g = this.talking ? Math.max(0, Math.sin(t * 1.9)) * Math.max(0, Math.sin(t * 0.7 + 1)) : 0;
      this.handR.position.set(-0.52 + 0.05 * g, DESK_Y + 0.03 + 0.09 * g, -0.32 + 0.04 * g);
      p.update(dt);
    }
    this.renderer.render(this.scene, cam);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    try {
      this.person?.dispose();
    } catch (e) {
      /* ignore */
    }
    // the person's meshes may share template data with other characters: never dispose them here
    this.person?.root?.removeFromParent();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        m.map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
