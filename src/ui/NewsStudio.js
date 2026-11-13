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

/** A roadside delineator post (lathed: flanged foot, tapered shaft, rounded cap, red bands). */
function post() {
  const prof = [[0, 0], [0.09, 0], [0.09, 0.012], [0.05, 0.03], [0.042, 0.06], [0.036, 0.95], [0.03, 0.985], [0.016, 1.0], [0, 1.003]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 32);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i);
    const band = (y > 0.72 && y < 0.8) || (y > 0.86 && y < 0.93);
    col.set(band ? [0.75, 0.08, 0.06] : [0.85, 0.84, 0.8], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
}

/** Police tape strung between a and b with a sag; returns {mesh, update(t)} (it flutters). */
function policeTape(a, b) {
  const tex = canvasTex(1024, 64, (x, w, h) => {
    x.fillStyle = '#f2c81a';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#111';
    x.fillRect(0, 0, w, 6);
    x.fillRect(0, h - 6, w, 6);
    x.font = `700 34px ${FONTS.sign}`;
    x.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) x.fillText('เขตเกิดเหตุ ห้ามผ่าน', 20 + i * 345, h / 2 + 2);
  });
  tex.wrapS = THREE.RepeatWrapping;
  const N = 80, W = 0.07;
  const len = a.distanceTo(b);
  tex.repeat.set(len / 1.6, 1);
  const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
  for (let i = 0; i <= N; i++) {
    uv.set([i / N, 0, i / N, 1], i * 4);
    if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  const p = new THREE.Vector3();
  const update = (t) => {
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      p.lerpVectors(a, b, k);
      const env = Math.sin(Math.PI * k);
      p.y -= 0.12 * env;
      const tw = Math.sin(t * 5.3 + k * 9) * 0.5 * env; // twist in the night wind
      const flap = Math.sin(t * 3.1 + k * 13) * 0.012 * env;
      for (let s2 = 0; s2 < 2; s2++) {
        const o = (i * 2 + s2) * 3, sgn = s2 ? 0.5 : -0.5;
        pos[o] = p.x;
        pos[o + 1] = p.y + sgn * W * Math.cos(tw);
        pos[o + 2] = p.z + sgn * W * Math.sin(tw) + flap;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  update(0);
  return { mesh, update };
}

/** A handheld news microphone with the station's flag (lathed body, extruded flag). */
function microphone() {
  const g = new THREE.Group();
  const prof = [[0, -0.2], [0.012, -0.2], [0.014, -0.17], [0.017, -0.06], [0.019, -0.02], [0.022, -0.005], [0.024, 0.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.35, metalness: 0.5 }));
  const ball = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 0.5;
    ball.push(new THREE.Vector2(Math.cos(a) * 0.027, Math.sin(a) * 0.03));
  }
  const grille = new THREE.Mesh(new THREE.LatheGeometry(ball, 28), new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.45, metalness: 0.8 }));
  grille.position.y = 0.0;
  const flagTex = canvasTex(256, 128, (x, w, h) => {
    x.fillStyle = '#b3121b';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.font = `800 46px ${FONTS.title}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('ราตรีทีวี', w / 2, h / 2 + 4);
  });
  const sq = new THREE.Shape();
  const r = 0.008, a2 = 0.034;
  sq.moveTo(-a2 + r, -a2);
  sq.lineTo(a2 - r, -a2);
  sq.quadraticCurveTo(a2, -a2, a2, -a2 + r);
  sq.lineTo(a2, a2 - r);
  sq.quadraticCurveTo(a2, a2, a2 - r, a2);
  sq.lineTo(-a2 + r, a2);
  sq.quadraticCurveTo(-a2, a2, -a2, a2 - r);
  sq.lineTo(-a2, -a2 + r);
  sq.quadraticCurveTo(-a2, -a2, -a2 + r, -a2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.0185, 0, Math.PI * 2, true);
  sq.holes.push(hole);
  const flagG = new THREE.ExtrudeGeometry(sq, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
  flagG.rotateX(Math.PI / 2);
  // project the flag artwork onto its four sides
  const fp = flagG.attributes.position, fuv = flagG.attributes.uv;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), y = fp.getY(i), z = fp.getZ(i);
    const u = Math.abs(x) > Math.abs(z) ? (z / 0.068 + 0.5) : (x / 0.068 + 0.5);
    fuv.setXY(i, u, 1 - (-y / 0.05));
  }
  const flag = new THREE.Mesh(flagG, new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.4 }));
  flag.position.y = -0.03;
  g.add(body, grille, flag);
  return g;
}

/** The crash site at night: asphalt, the wreck photo far behind, posts and tape, police lights. */
function fieldScene(image) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030406);
  scene.fog = new THREE.FogExp2(0x05070a, 0.07);
  const asphalt = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#17181a';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      const v = 18 + Math.random() * 40;
      x.fillStyle = `rgba(${v},${v},${v + 2},${0.5 + Math.random() * 0.5})`;
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    x.fillStyle = 'rgba(214,180,60,0.75)';
    x.fillRect(w * 0.62, 0, 14, h);
  });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(3, 3);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.82 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // the wreck, far behind in the dark: the crash photo as a distant plate
  const sw = image?.width || 16, sh = image?.height || 9;
  const plateTex = new THREE.CanvasTexture(image || document.createElement('canvas'));
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(14, (14 * sh) / sw), new THREE.MeshBasicMaterial({ map: plateTex, color: 0x8a8a8a, fog: false }));
  plate.position.set(-1.5, 2.6, -12);
  scene.add(plate);
  // delineator posts and the tape across the verge
  const pa = new THREE.Vector3(-2.6, 0.92, -1.6), pb = new THREE.Vector3(1.4, 0.92, -1.9);
  for (const q of [pa, pb, new THREE.Vector3(-0.6, 0.92, -1.75)]) {
    const m = post();
    m.position.set(q.x, 0, q.z);
    scene.add(m);
  }
  const tapeA = policeTape(pa, new THREE.Vector3(-0.6, 0.92, -1.75));
  const tapeB = policeTape(new THREE.Vector3(-0.6, 0.92, -1.75), pb);
  scene.add(tapeA.mesh, tapeB.mesh);
  // police lights off to the left, and the crew's work light behind
  const red = new THREE.PointLight(0xff2a1a, 0, 14, 2);
  red.position.set(-3.2, 1.4, -1.2);
  const blue = new THREE.PointLight(0x2a5cff, 0, 14, 2);
  blue.position.set(-2.6, 1.3, -2.4);
  const work = new THREE.SpotLight(0xcfd8ff, 18, 12, 0.5, 0.8, 2);
  work.position.set(1.6, 2.4, -2.2);
  work.target.position.set(0, 1.3, 0);
  // the camera's own LED light, a soft key on the reporter's face
  const camLight = new THREE.SpotLight(0xf3f0ff, 16, 8, 0.5, 0.9, 2);
  camLight.position.set(0.3, 1.7, 2.2);
  camLight.target.position.set(0, 1.45, 0);
  scene.add(red, blue, work, work.target, camLight, camLight.target, new THREE.HemisphereLight(0x223344, 0x080808, 0.35));
  return { scene, red, blue, tapes: [tapeA, tapeB] };
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
    // the field: the crash site, a reporter with a microphone
    this.field = fieldScene(image);
    this.repSpot = new THREE.Object3D();
    this.repSpot.rotation.y = Math.PI; // faces the camera (+Z)
    this.field.scene.add(this.repSpot);
    this.mic = microphone();
    this.mic.position.set(-0.06, 1.33, 0.24);
    this.mic.rotation.set(0.35, 0, 0.12);
    this.micGrip = new THREE.Object3D();
    this.micGrip.position.set(0, -0.12, 0);
    this.mic.add(this.micGrip);
    this.fieldLook = new THREE.Object3D();
    this.field.scene.add(this.mic, this.fieldLook);
    this.shot = 'studio';
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
      // the field reporter: a man in a dark windbreaker, standing, microphone in the right hand
      const rs = randomPerson(7331, { sex: 'm', age: 31, id: 'newsReporter' });
      rs.hair = { style: 'short', color: 0x141110 };
      rs.outfit = { type: 'hoodie-jeans', top: '#1e2a3a', bottom: '#22252c', shoes: 'shoes' };
      rs.accessories = [];
      if (rs.mh?.look) Object.assign(rs.mh.look, { posture: 'upright', sweat: 0.3, marks: [] });
      const r = createHumanoid(rs);
      r._off?.();
      r.noThrottle = true;
      r._setLod = function () {
        HumanoidGLB.prototype._setLod.call(this, 'hi');
      };
      r._setLod();
      this.repSpot.add(r.root);
      r.root.position.set(0, 0, 0);
      r.setHandTarget('R', this.micGrip, { weight: 1, blend: 0.4, grip: 1, orient: false });
      r.lookAt(this.fieldLook, { weight: 1, speed: 3 });
      r.root.traverse((o) => {
        if (o.isMesh) o.frustumCulled = false;
      });
      this.reporter = r;
      for (let i = 0; i < 8; i++) r.update(1 / 30);
      // compile both sets now, while the screen is still dark: a first-use compile mid-programme
      // would freeze the picture for a moment
      this.update(0);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.field.scene, this.camera);
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

  /** on: talking; who: 'anchor' (default) | 'reporter'. */
  setTalking(on, who = 'anchor') {
    this.talking = !!on && who === 'anchor';
    this.repTalking = !!on && who === 'reporter';
    this.person?.setTalking(this.talking, 0.9);
    this.reporter?.setTalking(this.repTalking, 1);
  }

  /** 'studio' | 'field' */
  setShot(name) {
    this.shot = name;
    this.shotT = 0;
  }

  /** Stop drawing (the picture is covered); dispose() later, off-screen. */
  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
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
    this.shotT = (this.shotT || 0) + dt;
    const t = this.t;
    if (this.shot === 'field') return this._updateField(dt);
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

  _updateField(dt) {
    const t = this.t, st = this.shotT, F = this.field, cam = this.camera;
    // police lights: red and blue double flashes, out of step
    const ph = (t % 0.72) / 0.72;
    const flash = (a) => ((ph > a && ph < a + 0.07) || (ph > a + 0.14 && ph < a + 0.21) ? 1 : 0);
    F.red.intensity = 26 * flash(0.0);
    F.blue.intensity = 30 * flash(0.5);
    for (const tp of F.tapes) tp.update(t);
    // handheld: a slow push with breathing and small corrections
    const k = Math.min(1, st / 8);
    const hx = Math.sin(t * 1.3) * 0.012 + Math.sin(t * 3.7) * 0.004;
    const hy = Math.sin(t * 1.1 + 1) * 0.01 + Math.sin(t * 4.1) * 0.003;
    cam.position.set(0.22 - 0.06 * k + hx, 1.56 + hy, 2.0 - 0.35 * k);
    cam.lookAt(-0.12 + hx * 0.3, 1.46 + hy * 0.4, 0);
    this.fieldLook.position.copy(cam.position);
    // the microphone rises a little on stressed words
    const g = this.repTalking ? Math.max(0, Math.sin(t * 2.1)) * 0.02 : 0;
    this.mic.position.set(-0.06, 1.33 + g, 0.24);
    this.reporter?.update(dt);
    this.renderer.render(F.scene, cam);
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
    try {
      this.reporter?.dispose();
    } catch (e) {
      /* ignore */
    }
    this.reporter?.root?.removeFromParent();
    this.field?.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Array.isArray(o.material)) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
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
