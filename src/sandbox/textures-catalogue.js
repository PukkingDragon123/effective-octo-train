// Photobashed 2D catalogue sandbox (preloads the photo library first).
//   ?mode=printed&page=N&cols=6&rows=3   every PRINTED_CATALOGUE kind x variant via signTex(kind, {variant})
//   ?mode=decals&gore=full|reduced        blood_* decals (decalTex) over a mid-grey wall
//   ?mode=flowers                         FLOWER_ATLAS cells with names (front / side / wilted)
//   ?mode=foliage                         tex('foliage_world') with the world SLOT names
import * as THREE from 'three';
import {
  signTex, decalTex, tex, preloadTextures, PRINTED_CATALOGUE, DECAL_KINDS, FLOWER_ATLAS, WORLD_FOLIAGE, FONTS, textureStats,
} from '../textures/index.js';

function label(text, w = 1.4, h = 0.1, color = '#e8dcc8') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.max(16, Math.round((512 * h) / w));
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = `600 ${Math.round(c.height * 0.62)}px ${FONTS.lcd}`;
  g.textBaseline = 'middle';
  g.fillText(text, 4, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
}

export default async function ({ engine, cameraRig, params, rendering }) {
  const mode = params.get('mode') || 'printed';
  const page = Number(params.get('page') || 0);
  const scene = engine.scene;
  const bg = new THREE.Color(params.get('bg') || 0x24282c);
  for (const k of ['sky', 'lightPool', 'particles']) if (rendering?.[k]?.group) rendering[k].group.visible = false;
  engine.renderPipeline = (r, s, c) => {
    s.fog = null;
    s.background = bg;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.setRenderTarget(null);
    r.render(s, c);
  };
  await preloadTextures();
  const root = new THREE.Group();
  scene.add(root);
  const eye = new THREE.Object3D();
  scene.add(eye);
  const FOV = 30;
  cameraRig.fovOffset = FOV - (engine.camera.fov || 72);
  const fit = (w, h) => {
    const fov = (FOV * Math.PI) / 180;
    const aspect = engine.camera.aspect || 16 / 9;
    eye.position.set(0, 0, Math.max(h / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / aspect) * 1.05);
    cameraRig.attach(eye);
  };
  const quad = (map, w, h, alpha) =>
    new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: !!alpha, alphaTest: alpha ? 0.02 : 0, side: THREE.DoubleSide }));

  if (mode === 'printed' || mode === 'decals') {
    const specs = [];
    if (mode === 'printed') {
      for (const [kind, e] of Object.entries(PRINTED_CATALOGUE)) for (const v of e.variants) specs.push([kind, v]);
    } else {
      for (const [kind, e] of Object.entries(DECAL_KINDS)) if (kind.startsWith('blood_')) for (const v of e.variants) specs.push([kind, v]);
    }
    const cols = Number(params.get('cols') || 6), rows = Number(params.get('rows') || 3);
    const list = specs.slice(page * cols * rows, (page + 1) * cols * rows);
    const cw = 1.5, ch = 1.45;
    if (mode === 'decals') bg.set(0x6a6862);
    list.forEach(([kind, v], i) => {
      const t = mode === 'printed' ? signTex(kind, { variant: v }) : decalTex(kind, { variant: v, gore: params.get('gore') || undefined });
      const asp = t.userData.aspect || 1;
      let w = 1.3, h = 1.3 / asp;
      if (h > 1.2) (h = 1.2), (w = 1.2 * asp);
      const cx = (i % cols) - (cols - 1) / 2, cy = (rows - 1) / 2 - Math.floor(i / cols);
      const m = quad(t, w, h, t.userData.alpha);
      m.position.set(cx * cw, cy * ch + 0.07, 0);
      root.add(m);
      const sz = t.userData.size ? ` ${t.userData.size[0]}x${t.userData.size[1]}m` : '';
      const l = label(`${kind}:${v}${sz}`, 1.45, 0.1);
      l.position.set(cx * cw, cy * ch - 0.66, 0);
      root.add(l);
    });
    fit(cols * cw, rows * ch);
  } else if (mode === 'flowers' || mode === 'foliage') {
    const key = mode === 'flowers' ? 'flower_atlas' : 'foliage_world';
    const map = tex(key);
    const H = 2.6, W = 2.6;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x55606a, toneMapped: false }));
    back.position.z = -0.01;
    root.add(back);
    root.add(quad(map, W, H, true));
    const cells = mode === 'flowers'
      ? FLOWER_ATLAS.cells.map((c) => [c.uv, `${c.name}/${c.view[0]}`])
      : WORLD_FOLIAGE.slots.map((n, i) => {
        const r = WORLD_FOLIAGE.rect(i);
        return [[r.u0, r.v0, r.u1, r.v1], n];
      });
    for (const [[u0, v0, u1], name] of cells) {
      const l = label(name, (u1 - u0) * W, 0.05, '#ffe060');
      l.position.set(-W / 2 + (u0 + u1) / 2 * W, -H / 2 + v0 * H + 0.03, 0.01);
      root.add(l);
    }
    fit(W * 1.05, H * 1.05);
  }
  window.__texTimings = { stats: textureStats() };
}
