// Texture gallery sandbox.
//   ?mode=grid&page=N      every colour key: flat unlit swatch (left) + lit sphere with normal/rough maps (right)
//   ?mode=key&key=asphalt  one texture large: 2x2 tiled swatch + lit sphere + normal map, orbiting point light
//   ?mode=signs&page=N     signage wall (signTex kinds)
//   ?mode=atlas&key=leaf_banana   foliage atlas over a backdrop with cell outlines
//   &post=1 keeps the game's post pipeline (default: plain render so colours are judged raw)
//   &cols=4&rows=3 grid layout, &t=seconds of light animation
import * as THREE from 'three';
import { tex, signTex, TEXTURE_KEYS, SIGN_KINDS, FOLIAGE_ATLAS, ROAD_MARKINGS, textureStats, FONTS, preloadTextures } from '../textures/index.js';

const DATA_SUFFIX = /_(normal|rough|height)$/;

function label(text, w = 1.6, h = 0.16, color = '#e8dcc8') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = `600 ${Math.round(c.height * 0.62)}px ${FONTS.lcd}`;
  g.textBaseline = 'middle';
  g.fillText(text, 6, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
  return m;
}

function companion(key, suffix) {
  const k = key + suffix;
  if (TEXTURE_KEYS.includes(k)) return tex(k);
  const base = key.replace(/_(green|yellow)$/, '');
  if (TEXTURE_KEYS.includes(base + suffix)) return tex(base + suffix);
  return null;
}

export default async function ({ engine, cameraRig, params, rendering }) {
  const mode = params.get('mode') || 'grid';
  const page = Number(params.get('page') || 0);
  const post = params.get('post') === '1';
  const scene = engine.scene;
  scene.background = new THREE.Color(params.get('bg') || 0x1b1d20);
  const renderer = engine.renderer;
  const bgColor = scene.background.clone();
  if (!post) {
    // isolate from the game's render stack: no fog, sky, pooled lights or particles
    for (const k of ['sky', 'lightPool', 'particles']) if (rendering?.[k]?.group) rendering[k].group.visible = false;
    engine.renderPipeline = (r, s, c) => {
      s.fog = null;
      s.background = bgColor;
      r.toneMapping = THREE.NeutralToneMapping;
      r.toneMappingExposure = 1.0;
      r.setRenderTarget(null);
      r.render(s, c);
    };
  }

  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight(0xb8c4d0, 0x30281f, 0.55));
  const dir = new THREE.DirectionalLight(0xfff8f0, 1.7);
  scene.add(dir, dir.target);
  const point = new THREE.PointLight(0xfff0dc, 22, 12, 2);
  scene.add(point);

  const eye = new THREE.Object3D();
  scene.add(eye);
  const FOV = 28;
  cameraRig.fovOffset = FOV - (engine.camera.fov || 72);
  const fitCamera = (width, height) => {
    const fov = (FOV * Math.PI) / 180;
    const aspect = engine.camera.aspect || 16 / 9;
    const dH = height / 2 / Math.tan(fov / 2);
    const dW = width / 2 / Math.tan(fov / 2) / aspect;
    eye.position.set(0, 0, Math.max(dH, dW) * 1.04);
    cameraRig.attach(eye);
  };

  const timings = [];
  const time = (k, fn) => {
    const t0 = performance.now();
    const r = fn();
    timings.push([k, Math.round(performance.now() - t0)]);
    return r;
  };
  let animate = (t) => {
    dir.position.set(Math.cos(t * 0.8) * 4, 3 + Math.sin(t * 0.5), 4);
  };

  if (params.get('preload') === '1') {
    const t0 = performance.now();
    await preloadTextures(TEXTURE_KEYS, null, { workers: params.get('workers') !== '0' });
    window.__preloadMs = Math.round(performance.now() - t0);
    console.log('[textures sandbox] preload ms', window.__preloadMs);
  }
  if (mode === 'grid') {
    const cols = Number(params.get('cols') || 4), rows = Number(params.get('rows') || 3);
    const keys = TEXTURE_KEYS.filter((k) => !DATA_SUFFIX.test(k));
    const per = cols * rows;
    const list = keys.slice(page * per, page * per + per);
    const cw = 2.2, ch = 1.25;
    list.forEach((key, i) => {
      const cx = (i % cols) - (cols - 1) / 2, cy = (rows - 1) / 2 - Math.floor(i / cols);
      const g = new THREE.Group();
      g.position.set(cx * cw, cy * ch, 0);
      const map = time(key, () => tex(key));
      const alpha = !!map.userData.alpha;
      const blend = /^glass_dirt|^road_/.test(key);
      const isData = map.colorSpace !== THREE.SRGBColorSpace;
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: alpha, alphaTest: alpha && !blend ? 0.5 : 0, side: THREE.DoubleSide }));
      quad.position.set(-0.52, 0.05, 0);
      g.add(quad);
      if (alpha) {
        const back = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.02), new THREE.MeshBasicMaterial({ color: 0x55606a, toneMapped: false }));
        back.position.set(-0.52, 0.05, -0.01);
        g.add(back);
      }
      const nrm = companion(key, '_normal'), rough = companion(key, '_rough');
      const geo = alpha ? new THREE.PlaneGeometry(1, 1) : new THREE.SphereGeometry(0.48, 64, 32);
      const mat = new THREE.MeshStandardMaterial({
        map: isData ? null : map, color: isData ? 0x888888 : 0xffffff, normalMap: isData && key === 'water_ripple' ? map : nrm, roughnessMap: rough,
        roughness: 1, metalness: /chrome|gold|metal_painted|rust/.test(key) ? (key === 'chrome_dirty' ? 0.9 : key === 'gold_leaf' ? 0.8 : 0.15) : 0,
        alphaTest: alpha ? 0.5 : 0, side: alpha ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (nrm) mat.normalScale.set(1, 1);
      const sph = new THREE.Mesh(geo, mat);
      sph.position.set(0.52, 0.05, 0);
      if (!alpha) sph.rotation.y = -0.6;
      g.add(sph);
      const l = label(key + (nrm ? '  +N' : '') + (rough ? '+R' : ''), 2.1, 0.13);
      l.position.set(0, -0.53, 0);
      g.add(l);
      root.add(g);
    });
    fitCamera(cols * cw, rows * ch);
  } else if (mode === 'key') {
    const key = params.get('key') || 'asphalt';
    const map = time(key, () => tex(key));
    const nrm = companion(key, '_normal'), rough = companion(key, '_rough');
    const alpha = !!map.userData.alpha;
    const rep = Number(params.get('rep') || 2);
    const tiled = map.clone();
    tiled.repeat.set(rep, rep);
    tiled.needsUpdate = true;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tiled, toneMapped: false, transparent: alpha, alphaTest: alpha ? 0.5 : 0 }));
    quad.position.set(-1.6, 0, 0);
    root.add(quad);
    if (nrm) {
      const nq = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: nrm, toneMapped: false }));
      nq.position.set(2.65, -0.55, 0);
      root.add(nq);
    }
    if (rough) {
      const rq = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: rough, toneMapped: false }));
      rq.position.set(2.65, 0.55, 0);
      root.add(rq);
    }
    // lit plane (tilted, like a road / wall seen at an angle) + sphere
    const mat = new THREE.MeshStandardMaterial({ map, normalMap: nrm, roughnessMap: rough, roughness: 1, alphaTest: alpha ? 0.5 : 0, side: THREE.DoubleSide });
    const sph = new THREE.Mesh(alpha ? new THREE.PlaneGeometry(1.5, 1.5) : new THREE.SphereGeometry(0.75, 96, 48), mat);
    sph.position.set(0.85, 0.35, 0);
    root.add(sph);
    const tilt = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), mat.clone());
    tilt.material.map = map.clone();
    tilt.material.map.repeat.set(2, 1);
    tilt.material.map.needsUpdate = true;
    tilt.rotation.x = -1.1;
    tilt.position.set(0.85, -0.85, 0.2);
    root.add(tilt);
    const l = label(key, 2, 0.14);
    l.position.set(-1.6, 1.12, 0);
    root.add(l);
    point.position.set(0.85, 0.35, 1.6);
    animate = (t) => {
      point.position.set(0.85 + Math.cos(t * 1.3) * 1.3, 0.35 + Math.sin(t * 0.9) * 0.9, 1.4);
      dir.position.set(-2, 3, 3);
      dir.intensity = 0.9;
    };
    fitCamera(6.3, 2.5);
  } else if (mode === 'signs') {
    const kinds = Object.keys(SIGN_KINDS);
    const specs = [];
    for (const k of kinds) for (const v of SIGN_KINDS[k].gallery || [{}]) specs.push([k, v]);
    const cols = Number(params.get('cols') || 6), rows = Number(params.get('rows') || 3);
    const per = cols * rows;
    const list = specs.slice(page * per, page * per + per);
    const cw = 1.5, ch = 1.45;
    list.forEach(([kind, o], i) => {
      const cx = (i % cols) - (cols - 1) / 2, cy = (rows - 1) / 2 - Math.floor(i / cols);
      const t = time(kind, () => signTex(kind, o));
      const asp = t.userData.aspect || 1;
      let w = 1.3, h = 1.3 / asp;
      if (h > 1.2) (h = 1.2), (w = 1.2 * asp);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: !!t.userData.alpha, alphaTest: t.userData.alpha ? 0.05 : 0 }));
      m.position.set(cx * cw, cy * ch + 0.07, 0);
      root.add(m);
      const l = label(kind + (Object.keys(o).length ? ' ' + Object.values(o).join(',') : ''), 1.45, 0.1);
      l.position.set(cx * cw, cy * ch - 0.66, 0);
      root.add(l);
    });
    bgColor.set(params.get('bg') || 0x2a2e33);
    fitCamera(cols * cw, rows * ch);
  } else if (mode === 'sign') {
    const kind = params.get('kind') || 'km_marker';
    let o = {};
    try {
      o = JSON.parse(params.get('opts') || '{}');
    } catch (e) {
      /* ignore */
    }
    const t = time(kind, () => signTex(kind, o));
    const asp = t.userData.aspect || 1;
    let w = 4, h = 4 / asp;
    if (h > 2.3) (h = 2.3), (w = 2.3 * asp);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: !!t.userData.alpha, alphaTest: t.userData.alpha ? 0.05 : 0 }));
    root.add(m);
    if (t.userData.normalMap) {
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, normalMap: t.userData.normalMap, roughness: 0.5, metalness: 0.3, transparent: true, alphaTest: 0.05 }));
      m.position.x = -w * 0.55;
      lit.position.x = w * 0.55;
      root.add(lit);
      point.position.set(w * 0.55, 0, 2);
      animate = (tt) => point.position.set(w * 0.55 + Math.cos(tt * 1.5) * 1.5, Math.sin(tt) * 1.2, 1.5);
    }
    bgColor.set(params.get('bg') || 0x2a2e33);
    fitCamera(t.userData.normalMap ? w * 2.3 : w * 1.1, 2.5);
  } else if (mode === 'atlas') {
    const key = params.get('key') || 'leaf_banana';
    const map = time(key, () => tex(key));
    const at = FOLIAGE_ATLAS[key] || ROAD_MARKINGS[key];
    const asp = map.image.width / map.image.height;
    const H = 2.4, W = H * asp;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x6f7c88, toneMapped: false }));
    back.position.set(-W * 0.55, 0, -0.01);
    root.add(back);
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map, toneMapped: false, alphaTest: 0.5, side: THREE.DoubleSide }));
    flat.position.set(-W * 0.55, 0, 0);
    root.add(flat);
    if (at && at.cells) {
      const pts = [];
      for (const c of at.cells) {
        const [u0, v0, u1, v1] = c.uv;
        const x0 = -W * 0.55 - W / 2 + u0 * W, x1 = -W * 0.55 - W / 2 + u1 * W, y0 = -H / 2 + v0 * H, y1 = -H / 2 + v1 * H;
        pts.push(x0, y0, 0.01, x1, y0, 0.01, x1, y0, 0.01, x1, y1, 0.01, x1, y1, 0.01, x0, y1, 0.01, x0, y1, 0.01, x0, y0, 0.01);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      root.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xff4040 })));
    }
    // lit version on a dark night backdrop
    const back2 = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x0d1418, toneMapped: false }));
    back2.position.set(W * 0.55, 0, -0.01);
    root.add(back2);
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, normalMap: companion(key, '_normal') }));
    lit.position.set(W * 0.55, 0, 0);
    root.add(lit);
    point.position.set(W * 0.55, 0, 1.5);
    animate = (t) => point.position.set(W * 0.55 + Math.cos(t) * W * 0.4, Math.sin(t * 0.7) * H * 0.3, 1.2);
    fitCamera(W * 2.2, H * 1.05);
  }

  engine.onUpdate((dt, t) => animate(t + Number(params.get('t') || 0)), 1);
  animate(Number(params.get('t') || 0));
  window.__texTimings = { timings, stats: textureStats() };
  console.log('[textures sandbox] timings', JSON.stringify(timings));
}
