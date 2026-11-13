// The late-night news studio for ui.newsReport, in its own WebGL canvas. A real-looking set: the
// curved anchor desk (extruded, graphite, red LED line), a slatted backdrop with coloured practical
// LEDs, a bezelled screen showing the crash photo, and the crew's floor: two broadcast cameras on
// tripods (modelled here), Poly Haven CC0 floodlight stands, a bounce screen, the crew desk with a
// laptop and monitors, an armchair, potted plants, cables on the floor (public/assets/studio, see
// docs/credits/polyhaven.md). On the desk: script pages, notepads, a clipboard, pens, a mug.
// Lit like broadcast: key, fill and rim on the anchor. The anchor and the field reporter are
// createHumanoid people. Shots: 'wide' | 'anchor' | 'screen' | 'wrap' | 'field' (setShot).
//
// It is built once, warmed during idle time (News.prewarm) and reused: setImage() swaps the photo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadCharacterAssets, createHumanoid, randomPerson, HumanoidGLB } from '../characters/index.js';
import { FONTS } from './fonts.js';

const STUDIO_ASSETS = ['flood_lights', 'projector_screen', 'television_02', 'modern_arm_chair_01', 'metal_office_desk', 'classic_laptop', 'office_notepads', 'clipboard', 'stationery_supplies', 'calathea_orbifolia_01', 'planter_pot_clay'];
let assetsP = null;
/** The studio's Poly Haven models (loaded once; a missing one is just left out). */
export function loadStudioAssets() {
  if (assetsP) return assetsP;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  assetsP = Promise.all(STUDIO_ASSETS.map((id) => loader.loadAsync(`assets/studio/${id}.glb`).then((g) => [id, g.scene], (e) => {
    console.warn('[news] studio model missing', id, e?.message || e);
    return [id, null];
  }))).then((list) => Object.fromEntries(list));
  return assetsP;
}

/** Clone the root parts of a model whose names pass test, standing on y = 0, centred in x / z. */
function part(scene, test, { at = [0, 0, 0], rotY = 0, scale = 1 } = {}) {
  if (!scene) return null;
  const g = new THREE.Group();
  for (const c of scene.children) if (test(c.name || '')) g.add(c.clone(true));
  if (!g.children.length) return null;
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const off = new THREE.Vector3(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  for (const c of g.children) c.position.add(off);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  const w = new THREE.Group();
  w.add(g);
  w.position.set(...at);
  w.rotation.y = rotY;
  w.scale.setScalar(scale);
  w.userData.size = b.getSize(new THREE.Vector3()).multiplyScalar(scale);
  return w;
}

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
function studioScreen() {
  const W = 1.9, H = 1.07, r = 0.03;
  const rr = (sh, w, h, rad) => {
    sh.moveTo(-w / 2 + rad, -h / 2);
    sh.lineTo(w / 2 - rad, -h / 2);
    sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rad);
    sh.lineTo(w / 2, h / 2 - rad);
    sh.quadraticCurveTo(w / 2, h / 2, w / 2 - rad, h / 2);
    sh.lineTo(-w / 2 + rad, h / 2);
    sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rad);
    sh.lineTo(-w / 2, -h / 2 + rad);
    sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rad, -h / 2);
  };
  const outer = new THREE.Shape();
  rr(outer, W + 0.06, H + 0.06, r + 0.02);
  const hole = new THREE.Path();
  rr(hole, W, H, r * 0.5);
  outer.holes.push(hole);
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 12 }), new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.3, metalness: 0.6 }));
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xe2e2e2 }));
  screen.position.z = 0.03;
  const g = new THREE.Group();
  g.add(bezel, screen);
  g.userData.draw = (image, headline) => {
    const x = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    x.fillStyle = '#05070a';
    x.fillRect(0, 0, w, h);
    const sw = image?.videoWidth || image?.naturalWidth || image?.width || 0;
    const sh = image?.videoHeight || image?.naturalHeight || image?.height || 0;
    if (sw && sh) {
      try {
        const k = Math.max(w / sw, h / sh);
        x.drawImage(image, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
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
    x.fillRect(64, h - 112, 220, 60);
    x.fillStyle = '#fff';
    x.font = `800 40px ${FONTS.body}`;
    x.textBaseline = 'middle';
    x.fillText('ข่าวด่วน', 86, h - 80);
    void headline; // the headline itself is the lower third's
    tex.needsUpdate = true;
  };
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

/** A handheld news microphone with a plain red flag (lathed body, extruded flag). */
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
    // a plain flag: no station name or logo (owner)
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, h - 10, w, 10);
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
function fieldScene() {
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
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 960;
  plateCanvas.height = 540;
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.9), new THREE.MeshBasicMaterial({ map: plateTex, color: 0x8a8a8a, fog: false }));
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
  const setPlate = (image) => {
    const x = plateCanvas.getContext('2d');
    x.fillStyle = '#05070a';
    x.fillRect(0, 0, 960, 540);
    const sw = image?.width || 0, sh = image?.height || 0;
    if (sw && sh) {
      try {
        const k = Math.max(960 / sw, 540 / sh);
        x.drawImage(image, (960 - sw * k) / 2, (540 - sh * k) / 2, sw * k, sh * k);
      } catch (e) {
        /* tainted */
      }
    }
    plateTex.needsUpdate = true;
  };
  return { scene, red, blue, tapes: [tapeA, tapeB], setPlate };
}

/** A swept tube along points with a radius per t (legs, cables, pan bars). */
function sweepTube(pts, rFn, mat, radial = 10, segs = 40) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // taper: rescale each ring about the curve
  const pos = g.attributes.position;
  const frames = curve.computeFrenetFrames(segs, false);
  const P = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = rFn(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      d.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(P);
      pos.setXYZ(k, P.x + d.x * r, P.y + d.y * r, P.z + d.z * r);
    }
  }
  void frames;
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** A broadcast camera on a tripod: three tapered legs with a spreader, a fluid head, the body
 *  (an extruded side profile with bevels), the zoom lens (lathed), a viewfinder and pan bars. */
function studioCamera() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.35 });
  const headY = 1.12;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const foot = new THREE.Vector3(Math.cos(a) * 0.48, 0.0, Math.sin(a) * 0.48);
    const top = new THREE.Vector3(Math.cos(a) * 0.06, headY - 0.08, Math.sin(a) * 0.06);
    const mid = top.clone().lerp(foot, 0.5);
    g.add(sweepTube([top, mid, foot], (t) => 0.018 - 0.008 * t, metal, 10, 24));
    // ground spreader arm
    g.add(sweepTube([new THREE.Vector3(0, 0.12, 0), foot.clone().multiplyScalar(0.62).setY(0.05)], () => 0.008, metal, 8, 8));
    // rubber foot
    const f = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.032, 0.012], [0.02, 0.03], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 16), black);
    f.position.copy(foot);
    g.add(f);
  }
  // fluid head
  const head = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.1, 0.03], [0.085, 0.07], [0.06, 0.09], [0, 0.09]].map(([x, y]) => new THREE.Vector2(x, y)), 32), metal);
  head.position.y = headY - 0.09;
  g.add(head);
  // the body: a side profile (sloped front, handle hump) extruded 0.16 wide
  const prof = new THREE.Shape();
  prof.moveTo(-0.22, 0);
  prof.lineTo(0.18, 0);
  prof.quadraticCurveTo(0.24, 0, 0.24, 0.05);
  prof.lineTo(0.22, 0.2);
  prof.quadraticCurveTo(0.2, 0.24, 0.14, 0.24);
  prof.lineTo(-0.2, 0.24);
  prof.quadraticCurveTo(-0.24, 0.24, -0.24, 0.2);
  prof.lineTo(-0.24, 0.03);
  prof.quadraticCurveTo(-0.24, 0, -0.22, 0);
  const bg = new THREE.ExtrudeGeometry(prof, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
  bg.translate(0, 0, -0.08);
  bg.rotateY(-Math.PI / 2); // profile's +X becomes the lens axis (-Z, the camera's forward)
  const cam = new THREE.Mesh(bg, body);
  cam.position.y = headY;
  g.add(cam);
  // zoom lens: rings and a hood
  const lp = [[0, 0], [0.05, 0], [0.052, 0.04], [0.048, 0.06], [0.05, 0.14], [0.055, 0.16], [0.054, 0.26], [0.07, 0.3], [0.072, 0.33], [0.066, 0.33], [0, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const lens = new THREE.Mesh(new THREE.LatheGeometry(lp, 32), black);
  lens.rotation.x = -Math.PI / 2;
  lens.position.set(0, headY + 0.12, -0.22);
  g.add(lens);
  // viewfinder on the top left, with its hood
  const vfS = new THREE.Shape();
  vfS.moveTo(-0.06, -0.045);
  vfS.lineTo(0.06, -0.045);
  vfS.lineTo(0.06, 0.045);
  vfS.lineTo(-0.06, 0.045);
  const vf = new THREE.Mesh(new THREE.ExtrudeGeometry(vfS, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 }), black);
  vf.position.set(-0.05, headY + 0.3, 0.02);
  g.add(vf);
  // a red tally lamp on the front
  const tally = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.012, 0], [0.012, 0.006], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y)), 16), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
  tally.rotation.x = -Math.PI / 2;
  tally.position.set(0.06, headY + 0.22, -0.25);
  g.add(tally);
  // pan bars back toward the operator
  for (const sx of [-1, 1]) g.add(sweepTube([new THREE.Vector3(sx * 0.07, headY - 0.02, 0.1), new THREE.Vector3(sx * 0.18, headY - 0.1, 0.42), new THREE.Vector3(sx * 0.24, headY - 0.18, 0.62)], () => 0.011, metal, 8, 16));
  return g;
}

/** A coffee mug: lathed walls with a rolled lip, a swept handle. */
function mug() {
  const g = new THREE.Group();
  const pr = [[0, 0.002], [0.036, 0], [0.04, 0.006], [0.042, 0.09], [0.044, 0.096], [0.04, 0.097], [0.037, 0.09], [0.035, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.25 });
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pr, 40), m));
  g.add(sweepTube([new THREE.Vector3(0.041, 0.075, 0), new THREE.Vector3(0.072, 0.07, 0), new THREE.Vector3(0.075, 0.035, 0), new THREE.Vector3(0.041, 0.025, 0)], () => 0.0065, m, 10, 20));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.036, 32), new THREE.MeshStandardMaterial({ color: 0x2a160c, roughness: 0.15 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.075;
  g.add(coffee);
  return g;
}

/** A cable lying on the floor, wandering between points (a swept tube on a spline). */
function cable(points, r = 0.009) {
  return sweepTube(points.map(([x, z, y = 0.009]) => new THREE.Vector3(x, y, z)), () => r, new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.55 }), 8, points.length * 14);
}

export class NewsStudio {
  /** host: element to fill (or null to build off-screen); opts {image, headline} */
  constructor(host = null, { image = null, headline = '' } = {}) {
    this.host = host;
    this.t = 0;
    this.shotT = 0;
    this.shot = 'wide';
    this.disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x020304, 1);
    renderer.domElement.className = 'dlb-news__canvas';
    this.renderer = renderer;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 40);

    // broadcast lighting: key (warm, high front-left), fill (soft, cool, front-right), rim (blue,
    // behind), a bright ambient, and coloured practicals on the set
    const key = new THREE.SpotLight(0xfff2e2, 70, 10, 0.45, 0.65, 2);
    key.position.set(-1.6, 2.9, 2.2);
    key.target.position.set(-0.36, 1.15, -0.8);
    const fill = new THREE.SpotLight(0xe4ecff, 24, 10, 0.6, 0.9, 2);
    fill.position.set(1.8, 1.6, 2.1);
    fill.target.position.set(-0.36, 1.1, -0.8);
    const rim = new THREE.SpotLight(0xa8c0ff, 40, 8, 0.5, 0.7, 2);
    rim.position.set(0.9, 2.8, -2.0);
    rim.target.position.set(-0.36, 1.25, -0.8);
    const cyan = new THREE.PointLight(0x2ad6ff, 3.5, 5, 2);
    cyan.position.set(-1.9, 1.4, -1.9);
    const mag = new THREE.PointLight(0xff3a8a, 3, 5, 2);
    mag.position.set(2.2, 0.5, -1.8);
    // the lighting grid overhead: an even, clean wash over the whole floor and the crew's gear
    const grid = new THREE.DirectionalLight(0xf4f2ee, 1.3);
    grid.position.set(0.5, 6, 3.5);
    scene.add(key, key.target, fill, fill.target, rim, rim.target, cyan, mag, grid, new THREE.HemisphereLight(0x4a5a70, 0x1a1a1a, 1.0));

    scene.add(backdrop(), desk());
    // practical LED columns either side of the screen and a strip along the foot of the wall
    const led = (color, pts, r) => sweepTube(pts, () => r, new THREE.MeshBasicMaterial({ color, toneMapped: false }), 8, 30);
    scene.add(led(0x2ad6ff, [new THREE.Vector3(-1.85, 0.2, -2.2), new THREE.Vector3(-1.85, 1.4, -2.2), new THREE.Vector3(-1.85, 2.6, -2.2)], 0.018));
    scene.add(led(0x2ad6ff, [new THREE.Vector3(-1.55, 0.2, -2.25), new THREE.Vector3(-1.55, 1.4, -2.25), new THREE.Vector3(-1.55, 2.6, -2.25)], 0.012));
    const strip = [];
    for (let i = 0; i <= 24; i++) {
      const a = -0.6 + (1.2 * i) / 24;
      strip.push(new THREE.Vector3(Math.sin(a) * 5.4, 0.04, 3.2 - Math.cos(a) * 5.4));
    }
    scene.add(led(0xff3a8a, strip, 0.012));
    this.screen = studioScreen();
    this.screen.position.set(0.82, 1.5, -1.9);
    this.screen.rotation.y = -0.18;
    scene.add(this.screen);
    this.paper = pages();
    this.paper.position.set(-0.36, DESK_Y + 0.002, -0.27);
    const mg = mug();
    mg.position.set(0.12, DESK_Y, -0.3);
    scene.add(this.paper, mg);
    // the crew's floor: two cameras with cables running off
    const camA = studioCamera();
    camA.position.set(1.25, 0, 2.3);
    camA.lookAt(-0.36, 0, -0.8);
    const camB = studioCamera();
    camB.position.set(-1.75, 0, 2.05);
    camB.lookAt(-0.2, 0, -0.8);
    scene.add(camA, camB);
    scene.add(cable([[1.25, 2.3], [1.6, 3.0], [1.3, 3.8], [2.2, 4.8], [2.4, 6.5]]), cable([[-1.75, 2.05], [-2.3, 2.8], [-2.0, 3.6], [-2.9, 4.6], [-3.4, 6.2]]), cable([[-2.95, 0.9], [-2.6, 1.8], [-3.3, 2.6], [-4.2, 3.0]], 0.007), cable([[3.1, 0.5], [2.6, 1.3], [3.2, 2.2], [4.3, 2.6]], 0.007));
    this.image = image;
    this.headline = headline;

    // the field: the crash site, a reporter with a microphone
    this.field = fieldScene();
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

    // anchor rig targets
    this.seat = new THREE.Object3D();
    this.seat.position.set(-0.36, 0.5, -0.8);
    this.seat.rotation.y = Math.PI;
    scene.add(this.seat);
    this.handL = new THREE.Object3D();
    this.handR = new THREE.Object3D();
    this.handL.position.set(-0.2, DESK_Y + 0.02, -0.36); // she faces +Z: her left hand is on +X
    this.handR.position.set(-0.52, DESK_Y + 0.02, -0.38);
    this.lookCam = new THREE.Object3D();
    this.lookPaper = new THREE.Object3D();
    this.lookPaper.position.set(-0.36, DESK_Y, -0.25);
    scene.add(this.handL, this.handR, this.lookCam, this.lookPaper);
    this.talking = false;
    this.repTalking = false;

    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.setImage(image, headline);
    if (host) this.attach(host);
    this.ready = this._build();
  }

  /** The set dressing from Poly Haven, the two people, then a full shader compile (off-screen). */
  async _build() {
    try {
      const [A] = await Promise.all([loadStudioAssets(), Promise.race([loadCharacterAssets(), new Promise((_, rej) => setTimeout(() => rej(new Error('character assets timeout')), 15000))])]);
      if (this.disposed) return;
      const sc = this.scene;
      const add = (o) => o && sc.add(o);
      const fl = A.flood_lights;
      const standA = (n) => /standing_double_a/.test(n);
      const standB = (n) => /standing_double_b/.test(n);
      add(part(fl, standA, { at: [-2.95, 0, 0.9], rotY: 0.9 }));
      add(part(fl, standB, { at: [3.1, 0, 0.5], rotY: -0.95 }));
      add(part(fl, (n) => /cable_extension_geo|plug_brick/.test(n), { at: [-2.4, 0, 2.2], rotY: 0.3 }));
      add(part(fl, (n) => /cable_a_geo|plug_a/.test(n), { at: [2.6, 0, 1.6], rotY: -0.6 }));
      add(part(A.projector_screen, () => true, { at: [3.4, 0, -0.7], rotY: -1.2 }));
      // the crew corner: a desk with a laptop and two monitors, an armchair
      const cd = part(A.metal_office_desk, () => true, { at: [-3.7, 0, -0.5], rotY: 1.1 });
      add(cd);
      const deskTop = cd?.userData.size.y ?? 0.79;
      add(part(A.classic_laptop, () => true, { at: [-3.55, deskTop, -0.35], rotY: 1.3 }));
      add(part(A.television_02, () => true, { at: [-3.85, deskTop, -0.95], rotY: 1.0 }));
      add(part(A.modern_arm_chair_01, () => true, { at: [-3.1, 0, 0.75], rotY: 1.9 }));
      // a floor monitor facing the desk
      add(part(A.television_02, () => true, { at: [0.95, 0, 1.25], rotY: Math.PI + 0.3 }));
      // potted plants at the set's edges
      for (const [x, z, pick, s] of [[-2.55, -1.55, /_b$/, 2.4], [2.75, -1.45, /_d$/, 2.2]]) {
        const pot = part(A.planter_pot_clay, () => true, { at: [x, 0, z], scale: 1.6 });
        add(pot);
        add(part(A.calathea_orbifolia_01, (n) => pick.test(n), { at: [x, (pot?.userData.size.y ?? 0.35) * 0.82, z], scale: s }));
      }
      // on the anchor's desk: notepads, a clipboard, a pen cup
      add(part(A.office_notepads, (n) => /a4_stack/.test(n), { at: [0.3, DESK_Y, -0.38], rotY: 0.2 }));
      add(part(A.clipboard, () => true, { at: [-0.85, DESK_Y, -0.3], rotY: 0.5 }));
      add(part(A.stationery_supplies, (n) => /pencilcup|pen_|pencil_new/.test(n), { at: [0.5, DESK_Y, -0.45] }));

      // the anchor
      const spec = randomPerson(4242, { sex: 'f', age: 34, id: 'newsAnchor' });
      spec.hair = { style: 'bob', color: 0x15110f };
      spec.outfit = { type: 'shirt-slacks', sleeve: 'long', top: '#1f2733', bottom: '#1a1d24', shoes: 'shoes' };
      spec.accessories = [];
      if (spec.mh?.look) Object.assign(spec.mh.look, { posture: 'upright', sweat: 0, marks: [] });
      const own = (p) => {
        p._off?.(); // driven by this scene's loop
        p.noThrottle = true;
        p._setLod = function () {
          HumanoidGLB.prototype._setLod.call(this, 'hi');
        };
        p._setLod();
        p.root.traverse((o) => {
          if (o.isMesh) o.frustumCulled = false;
        });
        return p;
      };
      const p = own(createHumanoid(spec));
      p.sitAt(this.seat, { pose: 'sit', blend: 0 });
      p.setHandTarget('L', this.handL, { weight: 1, blend: 0.4, grip: 0.15 });
      p.setHandTarget('R', this.handR, { weight: 1, blend: 0.4, grip: 0.2 });
      p.lookAt(this.lookCam, { weight: 1, speed: 3 });
      this.person = p;
      // the field reporter: a man in a dark windbreaker, microphone in the right hand
      const rs = randomPerson(7331, { sex: 'm', age: 31, id: 'newsReporter' });
      rs.hair = { style: 'short', color: 0x141110 };
      rs.outfit = { type: 'hoodie-jeans', top: '#1e2a3a', bottom: '#22252c', shoes: 'shoes' };
      rs.accessories = [];
      if (rs.mh?.look) Object.assign(rs.mh.look, { posture: 'upright', sweat: 0.3, marks: [] });
      const r = own(createHumanoid(rs));
      this.repSpot.add(r.root);
      r.setHandTarget('R', this.micGrip, { weight: 1, blend: 0.4, grip: 1, orient: false });
      r.lookAt(this.fieldLook, { weight: 1, speed: 3 });
      this.reporter = r;
      for (let i = 0; i < 8; i++) {
        p.update(1 / 30);
        r.update(1 / 30);
      }
      // compile everything now, off-screen, so the first frame of each shot never stalls
      this.setShot('wide');
      this.update(0, true);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.field.scene, this.camera);
      this.warm = true;
    } catch (e) {
      console.warn('[news] studio build failed', e);
      this.person = null;
    }
  }

  /** Show the crash photo on the studio screen and behind the field reporter. */
  setImage(image, headline = this.headline) {
    this.image = image;
    this.headline = headline;
    this.screen.userData.draw(image, headline);
    this.field.setPlate(image);
  }

  attach(host) {
    this.host = host;
    host.appendChild(this.renderer.domElement);
    this.resize();
  }

  detach() {
    this.stop();
    this.renderer.domElement.remove();
    this.host = null;
  }

  resize() {
    const w = this.host?.clientWidth || window.innerWidth, h = this.host?.clientHeight || window.innerHeight;
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

  /** 'wide' | 'anchor' | 'screen' | 'wrap' | 'field' */
  setShot(name) {
    this.shot = name;
    this.shotT = 0;
  }

  /** Stop drawing (the picture is covered or gone). */
  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  start() {
    this.stop();
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

  update(dt, noRender = false) {
    this.t += dt;
    this.shotT += dt;
    if (this.shot === 'field') return this._updateField(dt, noRender);
    const t = this.t, st = this.shotT, cam = this.camera;
    const ease = (k) => k * k * (3 - 2 * k);
    const path = (dur, from, to, lookFrom, lookTo, fov) => {
      const k = ease(Math.min(1, st / dur));
      cam.position.lerpVectors(from, to, k);
      cam.position.x += Math.sin(t * 0.4) * 0.004;
      cam.position.y += Math.sin(t * 0.33) * 0.003;
      cam.lookAt(_lk.lerpVectors(lookFrom, lookTo, k));
      if (cam.fov !== fov) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    };
    if (this.shot === 'wide') path(5, V3(1.4, 2.15, 6.4), V3(0.5, 1.9, 5.3), V3(-0.1, 1.1, -0.9), V3(-0.25, 1.05, -0.8), 38);
    else if (this.shot === 'anchor') path(8, V3(0.12, 1.2, 2.3), V3(-0.14, 1.17, 1.65), V3(-0.08, 1.06, -0.85), V3(-0.28, 1.06, -0.85), 30);
    else if (this.shot === 'screen') path(4, V3(0.25, 1.46, 0.7), V3(0.5, 1.5, -0.15), V3(0.82, 1.5, -1.9), V3(0.82, 1.5, -1.9), 34);
    else path(6, V3(-0.12, 1.18, 1.9), V3(0.7, 1.75, 4.9), V3(-0.3, 1.06, -0.85), V3(-0.25, 1.05, -0.8), 34); // wrap: pull back
    this.lookCam.position.copy(cam.position);
    const p = this.person;
    if (p) {
      const glance = t % 4.6 > 3.7;
      p.lookAt(glance ? this.lookPaper : this.lookCam, { weight: 1, speed: glance ? 5 : 3 });
      const gs = this.talking ? Math.max(0, Math.sin(t * 1.9)) * Math.max(0, Math.sin(t * 0.7 + 1)) : 0;
      this.handR.position.set(-0.52 + 0.05 * gs, DESK_Y + 0.02 + 0.08 * gs, -0.38 + 0.05 * gs);
      p.update(dt);
    }
    if (!noRender) this.renderer.render(this.scene, cam);
  }

  _updateField(dt, noRender) {
    const t = this.t, st = this.shotT, F = this.field, cam = this.camera;
    const ph = (t % 0.72) / 0.72;
    const flash = (a) => ((ph > a && ph < a + 0.07) || (ph > a + 0.14 && ph < a + 0.21) ? 1 : 0);
    F.red.intensity = 26 * flash(0.0);
    F.blue.intensity = 30 * flash(0.5);
    for (const tp of F.tapes) tp.update(t);
    const k = Math.min(1, st / 8);
    const hx = Math.sin(t * 1.3) * 0.012 + Math.sin(t * 3.7) * 0.004;
    const hy = Math.sin(t * 1.1 + 1) * 0.01 + Math.sin(t * 4.1) * 0.003;
    if (cam.fov !== 34) {
      cam.fov = 34;
      cam.updateProjectionMatrix();
    }
    cam.position.set(0.22 - 0.06 * k + hx, 1.56 + hy, 2.0 - 0.35 * k);
    cam.lookAt(-0.12 + hx * 0.3, 1.46 + hy * 0.4, 0);
    this.fieldLook.position.copy(cam.position);
    const g = this.repTalking ? Math.max(0, Math.sin(t * 2.1)) * 0.02 : 0;
    this.mic.position.set(-0.06, 1.33 + g, 0.24);
    this.reporter?.update(dt);
    if (!noRender) this.renderer.render(F.scene, cam);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this._resize);
    for (const p of [this.person, this.reporter]) {
      try {
        p?.dispose();
      } catch (e) {
        /* ignore */
      }
      p?.root?.removeFromParent(); // their meshes may share template data: never disposed here
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _lk = new THREE.Vector3();
