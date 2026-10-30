// Taxi interior: dashboard (binnacle, analog gauges, LED taxi meter, cassette radio,
// vents, glovebox), steering wheel + column + stalks + ignition, pedals, gear lever,
// handbrake, seats (wooden bead cover on the driver seat, fabric covers), headliner
// details, sun visors (photo), rearview mirror with amulets + jasmine garland, dash
// decorations (Buddha figure, stickers, coins, receipts, tissue box), door cards with
// cranks / handles / lock pins, dome light, floor, mats and the rear parcel shelf.
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { tex, signTex } from '../textures/index.js';
import { MergeBuilder, GridSurface, xform, roundedBox, lathe, rod, tube, extrude, roundRectPts, roundRectPlane, pillow, deform, boxUV, planarUV } from './geom.js';
import * as VT from './VehicleTextures.js';
import { sharedMaterials } from './Materials.js';
import { DIM, belt } from './TaxiBody.js';
import { makeRng, lerp, clamp, noise, smoothstep } from '../core/math.js';
import { FONTS } from '../ui/fonts.js';

const T = (k, r) => {
  try {
    return tex(k, r ? { repeat: r } : {});
  } catch (e) {
    return null;
  }
};
const S = (kind, opts) => {
  try {
    return signTex(kind, opts);
  } catch (e) {
    return null;
  }
};

let sharedMats = null;
function interiorMaterials() {
  if (sharedMats) return sharedMats;
  const m = {};
  m.dash = paintedMaterial({ color: 0x3b3833, map: T('dash_plastic', [3, 3]), normalMap: T('dash_plastic_normal', [3, 3]), roughness: 0.8, brush: 0.5, name: 'int_dash' });
  m.dashMat = paintedMaterial({ color: 0x2e2822, map: T('carpet', [5, 5]), roughness: 1.0, brush: 0.6, name: 'int_dashmat' });
  m.plasticDark = paintedMaterial({ color: 0x1d1c1b, map: T('dash_plastic', [4, 4]), roughness: 0.7, brush: 0.4, name: 'int_plasticdark' });
  m.plasticBeige = paintedMaterial({ color: 0x8c8272, map: T('dash_plastic', [4, 4]), roughness: 0.8, brush: 0.5, name: 'int_plasticbeige' });
  m.vinyl = paintedMaterial({ color: 0x5c4434, map: T('leather_seat', [2, 2]), normalMap: T('leather_seat_normal', [2, 2]), roughness: 0.62, brush: 0.55, name: 'int_vinyl' });
  m.fabric = paintedMaterial({ color: 0x8a7a62, map: T('fabric_seat', [3, 3]), normalMap: T('fabric_seat_normal', [3, 3]), roughness: 0.95, brush: 0.6, name: 'int_fabric' });
  m.lace = paintedMaterial({ color: 0xd8d0bc, map: T('fabric_seat', [6, 6]), roughness: 0.95, brush: 0.5, name: 'int_lace' });
  m.carpet = paintedMaterial({ color: 0x2b2722, map: T('carpet', [4, 4]), normalMap: T('carpet_normal', [4, 4]), roughness: 1.0, brush: 0.6, name: 'int_carpet' });
  m.rubberMat = paintedMaterial({ color: 0x151413, map: T('rubber', [4, 4]), roughness: 0.85, name: 'int_rubbermat' });
  m.chrome = paintedMaterial({ color: 0xb4b0a6, metalness: 0.7, roughness: 0.32, map: T('chrome_dirty', [1, 1]), brush: 0.25, name: 'int_chrome' });
  m.metal = paintedMaterial({ color: 0x55524c, metalness: 0.6, roughness: 0.5, brush: 0.3, name: 'int_metal' });
  m.gold = paintedMaterial({ color: 0xc8a048, metalness: 0.75, roughness: 0.35, map: T('gold_leaf', [1, 1]), brush: 0.3, name: 'int_gold' });
  m.wood = paintedMaterial({ map: VT.woodGrainTex(), color: 0xffffff, roughness: 0.55, brush: 0.4, name: 'int_wood' });
  m.wheel = paintedMaterial({ color: 0x24201c, map: T('leather_seat', [6, 1]), roughness: 0.55, brush: 0.4, name: 'int_wheel' });
  m.paper = paintedMaterial({ color: 0xe8e0cc, roughness: 0.9, brush: 0.3, side: THREE.DoubleSide, name: 'int_paper' });
  m.jasmine = paintedMaterial({ color: 0xf2eedc, roughness: 0.7, brush: 0.3, translucency: 0.4, name: 'int_jasmine' });
  m.rose = paintedMaterial({ color: 0xa8141c, roughness: 0.6, brush: 0.3, name: 'int_rose' });
  m.marigold = paintedMaterial({ color: 0xe08a14, roughness: 0.7, brush: 0.3, name: 'int_marigold' });
  m.ribbon = paintedMaterial({ color: 0xc81e3a, roughness: 0.5, brush: 0.2, side: THREE.DoubleSide, name: 'int_ribbon' });
  m.string = paintedMaterial({ color: 0xc8b088, roughness: 0.8, brush: 0.1, name: 'int_string' });
  m.coin = paintedMaterial({ color: 0xb8b2a2, metalness: 0.7, roughness: 0.4, brush: 0.2, name: 'int_coin' });
  m.coinGold = paintedMaterial({ color: 0xc89c50, metalness: 0.7, roughness: 0.4, brush: 0.2, name: 'int_coingold' });
  m.tissue = paintedMaterial({ color: 0xd8c8b8, roughness: 0.9, brush: 0.3, name: 'int_tissue' });
  m.tissueBox = paintedMaterial({ color: 0xc87a8c, map: T('fabric_seat', [2, 2]), roughness: 0.85, brush: 0.4, name: 'int_tissuebox' });
  m.pedalRubber = paintedMaterial({ color: 0x121212, map: T('rubber', [2, 2]), roughness: 0.9, name: 'int_pedal' });
  m.sticker = (key) => paintedMaterial({ map: VT.stickerTex(key), transparent: true, alphaTest: 0.05, roughness: 0.6, brush: 0.2, depthWrite: false, name: 'int_sticker_' + key });
  m.photo = paintedMaterial({ map: VT.childPhotoTex(), roughness: 0.7, brush: 0.2, side: THREE.DoubleSide, name: 'int_photo' });
  sharedMats = m;
  return m;
}

/** Per-instance emissive / dynamic materials. */
function instanceMaterials() {
  const g = (kind) => paintedMaterial({ map: VT.gaugeTex(kind, false), emissiveMap: VT.gaugeTex(kind, true), emissive: 0x6dffb0, emissiveIntensity: 0, roughness: 0.5, brush: 0.1, name: 'int_gauge_' + kind });
  const meter = new VT.DynamicCanvas(256, 96);
  const radio = new VT.DynamicCanvas(256, 48);
  const warn = new VT.DynamicCanvas(256, 32);
  return {
    gauges: { speed: g('speed'), tacho: g('tacho'), fuel: g('fuel'), temp: g('temp') },
    needle: paintedMaterial({ color: 0xff5a22, emissive: 0xff4a10, emissiveIntensity: 0.2, roughness: 0.4, brush: 0.1, name: 'int_needle' }),
    meterCanvas: meter,
    meter: paintedMaterial({ map: meter.texture, emissiveMap: meter.texture, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.25, brush: 0.05, name: 'int_meterdisp' }),
    radioCanvas: radio,
    radio: paintedMaterial({ map: radio.texture, emissiveMap: radio.texture, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3, brush: 0.05, name: 'int_radiodisp' }),
    warnCanvas: warn,
    warn: paintedMaterial({ map: warn.texture, emissiveMap: warn.texture, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.4, brush: 0.05, name: 'int_warn' }),
    dome: paintedMaterial({ color: 0xe8dcc0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4, brush: 0.1, name: 'int_dome' }),
    radioFace: paintedMaterial({ map: VT.radioFaceTex(), roughness: 0.55, brush: 0.2, name: 'int_radioface' }),
  };
}

// ---------------------------------------------------------------------------
// Layout constants (taxi-local)
// ---------------------------------------------------------------------------
export const INT = {
  dashHalfW: 0.745,
  wheelCenter: new THREE.Vector3(0.37, 0.84, -0.26),
  colDir: new THREE.Vector3(0, -0.45, -1).normalize(), // column axis pointing into the dash
  clusterZ: -0.668,
  clusterY: 0.86,
  radio: new THREE.Vector3(0.0, 0.735, -0.598),
  meter: new THREE.Vector3(-0.06, 0.975, -0.72),
  seatDriver: new THREE.Vector3(0.37, 0.5, 0.14),
  seatPass: new THREE.Vector3(-0.37, 0.5, 0.14),
  rearSeatZ: 1.02,
  floorY: 0.24,
  gearBase: new THREE.Vector3(0.05, 0.38, -0.24),
  hbBase: new THREE.Vector3(0.1, 0.36, 0.06),
  mirrorPos: new THREE.Vector3(0.0, 1.228, -0.455),
};

// dash profile rows (z, y) from the windshield back over the top and down the face
const DASH_PROFILE = [
  [-1.0, 0.912], [-0.92, 0.924], [-0.82, 0.934], [-0.72, 0.94], [-0.66, 0.938], [-0.627, 0.929], [-0.608, 0.911],
  [-0.6, 0.886], [-0.598, 0.8], [-0.6, 0.752], [-0.605, 0.7], [-0.61, 0.64], [-0.612, 0.6], [-0.6, 0.575], [-0.585, 0.555],
  [-0.59, 0.52], [-0.63, 0.5], [-0.75, 0.49], [-0.9, 0.48],
];

function binBump(x) {
  // driver binnacle hood bump over x in [0.1, 0.66]
  return smoothstep(0.08, 0.16, x) * (1 - smoothstep(0.58, 0.66, x));
}

function buildDash(mb) {
  const xs = [];
  const keys = [-0.745, -0.7, -0.62, -0.6, -0.5, -0.4, -0.3, -0.22, -0.2, -0.14, -0.1, -0.05, 0, 0.05, 0.08, 0.1, 0.12, 0.14, 0.2, 0.3, 0.37, 0.44, 0.5, 0.56, 0.6, 0.62, 0.64, 0.66, 0.7, 0.745];
  xs.push(...keys);
  const nR = DASH_PROFILE.length;
  const grid = new GridSurface(nR, xs.length, (r, c) => {
    const x = xs[c];
    let [z, y] = DASH_PROFILE[r];
    const bow = 0.02 * (1 - (x / 0.745) ** 2);
    if (r >= 5) z += bow;
    // binnacle hood: lift top rows 2..6 and push the lip back over the gauges
    const b = binBump(x);
    if (r >= 2 && r <= 7) y += 0.058 * b * (r === 2 ? 0.4 : 1);
    if (r >= 5 && r <= 7) z += 0.05 * b;
    if (r === 7) y -= 0.012 * b;
    return [x, y, z];
  }, { invert: false });
  // which way do normals face? rows go down/back, cols go +x: normal = dr x dc. For the top
  // rows dr = +z (toward driver), dc = +x -> z × x = +y (up) OK.
  const hole = (r, c) => {
    const xa = xs[c], xb = xs[c + 1];
    const cluster = r >= 7 && r <= 9 && xa >= 0.14 - 1e-6 && xb <= 0.62 + 1e-6;
    const glove = r >= 9 && r <= 11 && xa >= -0.62 - 1e-6 && xb <= -0.2 + 1e-6;
    return cluster || glove;
  };
  const topRows = (r) => r <= 4;
  mb.add('dashMat', grid.build((r, c) => topRows(r) && !hole(r, c), { uv: (r, c) => { const p = grid.get(r, c); return [p.x * 1.2, p.z * 1.2]; } }));
  mb.add('dash', grid.build((r, c) => !topRows(r) && !hole(r, c), { uv: (r, c) => { const p = grid.get(r, c); return [p.x * 1.5, p.y * 1.5]; } }));
  // end caps of the dash (against the doors)
  for (const sx of [-1, 1]) {
    const pts = DASH_PROFILE.map(([z, y]) => new THREE.Vector2(z, y));
    pts.push(new THREE.Vector2(-1.0, 0.48));
    const shape = new THREE.Shape(pts);
    const g = new THREE.ShapeGeometry(shape);
    // shape is in (z,y) plane -> map to x = sx*0.745
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getX(i), y = p.getY(i);
      p.setXYZ(i, sx * 0.745, y, z);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    if (Math.sign(n.getX(0)) !== sx) {
      g.index ? g.setIndex([...g.index.array].reverse()) : null;
      g.computeVertexNormals();
    }
    planarUV(g, 'x', 0.6);
    mb.add('dash', g);
  }
  // cluster recess box (walls) behind the hole
  const cz = INT.clusterZ;
  const x0 = 0.14, x1 = 0.62, yTop = DASH_PROFILE[7][1] + 0.046, yBot = DASH_PROFILE[9][1];
  const zf = -0.598 + 0.02;
  const wall = (w, h, d, pos) => mb.add('plasticDark', xform(new THREE.BoxGeometry(w, h, d), pos));
  wall(x1 - x0, 0.01, zf - cz, [(x0 + x1) / 2, yBot, (zf + cz) / 2]);
  wall(x1 - x0, 0.01, zf - cz + 0.03, [(x0 + x1) / 2, yTop, (zf + cz) / 2 - 0.01]);
  wall(0.01, yTop - yBot, zf - cz, [x0, (yTop + yBot) / 2, (zf + cz) / 2]);
  wall(0.01, yTop - yBot, zf - cz, [x1, (yTop + yBot) / 2, (zf + cz) / 2]);
  wall(x1 - x0, yTop - yBot, 0.01, [(x0 + x1) / 2, (yTop + yBot) / 2, cz - 0.006]);
  // glovebox cavity
  const gz0 = -0.6, gz1 = -0.82;
  const gy0 = DASH_PROFILE[11][1] - 0.005, gy1 = DASH_PROFILE[9][1];
  const gw = (w, h, d, pos) => mb.add('plasticDark', xform(new THREE.BoxGeometry(w, h, d), pos));
  gw(0.42, 0.01, gz0 - gz1, [-0.41, gy0, (gz0 + gz1) / 2]);
  gw(0.42, 0.01, gz0 - gz1, [-0.41, gy1, (gz0 + gz1) / 2]);
  gw(0.01, gy1 - gy0, gz0 - gz1, [-0.62, (gy0 + gy1) / 2, (gz0 + gz1) / 2]);
  gw(0.01, gy1 - gy0, gz0 - gz1, [-0.2, (gy0 + gy1) / 2, (gz0 + gz1) / 2]);
  gw(0.42, gy1 - gy0, 0.01, [-0.41, (gy0 + gy1) / 2, gz1]);
  return { grid, xs };
}

function vent(mb, cx, cy, cz, w, h, slats = 5, mat = 'plasticDark') {
  mb.add(mat, xform(extrude(roundRectPts(w + 0.016, h + 0.016, 0.008, 2), 0.014, 0.002), [cx, cy, cz]));
  mb.add('black', xform(new THREE.BoxGeometry(w, h, 0.01), [cx, cy, cz + 0.004]));
  for (let i = 0; i < slats; i++) {
    const y = cy - h / 2 + ((i + 0.5) / slats) * h;
    mb.add(mat, xform(new THREE.BoxGeometry(w - 0.004, 0.003, 0.02), [cx, y, cz + 0.008], [-0.25, 0, 0]));
  }
}

function seatShape(width, depth, height, opts = {}) {
  const g = roundedBox(width, height, depth, Math.min(0.045, height / 2 - 0.002), 4);
  // subdivide-ish via pillow + custom deform
  pillow(g, opts.pillow ?? 0.02, [0.4, 1, 0.6]);
  const hw = width / 2;
  deform(g, (v) => {
    const u = v.x / hw;
    if (v.y > 0) {
      // side bolsters + centre sag
      v.y += (opts.bolster ?? 0.025) * smoothstep(0.55, 0.95, Math.abs(u)) - (opts.sag ?? 0.012) * (1 - u * u);
    }
  });
  return g;
}

/** Bead cover on a seat: instanced wooden beads following cushion + backrest surfaces. */
function beadCover(m, seatPos, cushionTopFn, backFn, rows) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pts = [];
  const rng = makeRng(31337);
  const r = 0.0105;
  // cushion: grid in x (across) and z (front->back)
  for (let iz = 0; iz < 19; iz++) {
    for (let ix = 0; ix < 20; ix++) {
      const x = -0.215 + ix * 0.0226 + (iz % 2) * 0.0113;
      if (Math.abs(x) > 0.225) continue;
      const z = -0.33 + iz * 0.0226;
      const y = cushionTopFn(x, z) + r * 0.85;
      pts.push([x, y, z, rng]);
    }
  }
  // backrest: along its surface (param s up the back)
  for (let is = 0; is < 26; is++) {
    for (let ix = 0; ix < 20; ix++) {
      const x = -0.215 + ix * 0.0226 + (is % 2) * 0.0113;
      if (Math.abs(x) > 0.225) continue;
      const p = backFn(x, 0.04 + is * 0.0226);
      pts.push([p.x, p.y + r * 0.3, p.z - r * 0.9, rng]);
    }
  }
  const mesh = new THREE.InstancedMesh(geo, m.wood, pts.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  pts.forEach(([x, y, z], i) => {
    const sc = r * rng.range(0.88, 1.08);
    s.set(sc, sc * 0.92, sc);
    q.setFromEuler(new THREE.Euler(rng() * 6, rng() * 6, rng() * 6));
    p.set(seatPos.x + x, seatPos.y + y, seatPos.z + z);
    mtx.compose(p, q, s);
    mesh.setMatrixAt(i, mtx);
    const t = rng();
    col.setRGB(lerp(0.55, 0.85, t), lerp(0.36, 0.56, t), lerp(0.2, 0.32, t));
    if (rng() < 0.08) col.multiplyScalar(0.6);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'beadCover';
  return mesh;
}

function buildFrontSeat(mb, m, pos, driver) {
  // pos = H-point (hip joint). Cushion top ~7 cm below it, backrest 14 cm behind it.
  const mat = driver ? 'vinyl' : 'fabric';
  const cushTilt = 0.1, backTilt = 0.32;
  const cush = seatShape(0.5, 0.48, 0.12, { bolster: 0.03, sag: 0.018 });
  xform(cush, [pos.x, pos.y - 0.13, pos.z - 0.12], [cushTilt, 0, 0]);
  mb.add(mat, boxUV(cush, 0.25));
  const bz = pos.z + 0.15, by = pos.y - 0.13;
  const back = seatShape(0.5, 0.12, 0.62, { bolster: 0.0, sag: 0.0, pillow: 0.025 });
  back.translate(0, 0.31, 0.06);
  xform(back, [pos.x, by, bz], [backTilt, 0, 0]);
  mb.add(mat, boxUV(back, 0.25));
  for (const sx of [-1, 1]) {
    const b = roundedBox(0.065, 0.48, 0.14, 0.03, 3);
    b.translate(0, 0.27, 0.05);
    xform(b, [pos.x + sx * 0.235, by, bz - 0.01], [backTilt, 0, 0]);
    mb.add(mat, boxUV(b, 0.25));
  }
  // headrest + posts
  const top = new THREE.Vector3(0, 0.62, 0.06).applyAxisAngle(new THREE.Vector3(1, 0, 0), backTilt);
  const hrY = by + top.y + 0.1, hrZ = bz + top.z + 0.02;
  const hr = roundedBox(0.27, 0.17, 0.09, 0.035, 3);
  pillow(hr, 0.01);
  xform(hr, [pos.x, hrY, hrZ], [0.2, 0, 0]);
  mb.add(driver ? 'vinyl' : 'lace', boxUV(hr, 0.2));
  for (const sx of [-0.07, 0.07]) mb.add('chrome', rod([pos.x + sx, hrY - 0.06, hrZ - 0.0], [pos.x + sx, hrY - 0.15, hrZ - 0.03], 0.0055, 6));
  // frame & rails
  mb.add('metal', xform(new THREE.BoxGeometry(0.42, 0.12, 0.44), [pos.x, pos.y - 0.25, pos.z - 0.1]));
  for (const sx of [-0.18, 0.18]) mb.add('metal', xform(new THREE.BoxGeometry(0.03, 0.025, 0.62), [pos.x + sx, INT.floorY + 0.03, pos.z - 0.1]));
  // backrest rear shell
  const shell = roundedBox(0.48, 0.6, 0.02, 0.01, 2);
  shell.translate(0, 0.3, 0.125);
  xform(shell, [pos.x, by, bz], [backTilt, 0, 0]);
  mb.add('plasticDark', shell);
  // recline lever
  mb.add('plasticDark', xform(roundedBox(0.02, 0.03, 0.12, 0.008, 2), [pos.x + (driver ? 0.27 : -0.27), pos.y - 0.17, pos.z + 0.02]));
  // bead placement functions (seat-local, relative to the H-point)
  const cushionTop = (x, z) => {
    // z relative to H; cushion centre at -0.12, tilt raises the front
    const u = x / 0.25;
    const zc = z + 0.12;
    const prof = 0.03 * smoothstep(0.55, 0.95, Math.abs(u)) - 0.018 * (1 - u * u) + 0.012 * (1 - Math.pow(zc / 0.24, 2));
    return -0.13 + 0.06 + prof - zc * Math.tan(cushTilt) + 0.004;
  };
  const backFn = (x, sUp) => {
    const u = x / 0.25;
    const lumbar = 0.02 * (1 - u * u) * Math.sin((Math.PI * sUp) / 0.62);
    const local = new THREE.Vector3(x, sUp, 0.0 - lumbar - 0.002);
    local.applyAxisAngle(new THREE.Vector3(1, 0, 0), backTilt);
    return new THREE.Vector3(local.x, by - pos.y + local.y, bz - pos.z + local.z);
  };
  return { cushionTop, backFn };
}

function buildRearBench(mb, m) {
  const z = INT.rearSeatZ, y = 0.47;
  const cush = seatShape(1.36, 0.5, 0.13, { bolster: 0.01, sag: 0.02 });
  xform(cush, [0, y - 0.13, z - 0.12], [0.08, 0, 0]);
  mb.add('fabric', boxUV(cush, 0.3));
  const back = seatShape(1.36, 0.12, 0.6, { bolster: 0, sag: 0, pillow: 0.03 });
  back.translate(0, 0.3, 0.06);
  xform(back, [0, y - 0.13, z + 0.15], [0.36, 0, 0]);
  mb.add('fabric', boxUV(back, 0.3));
  for (const sx of [-0.23, 0.23]) {
    mb.add('fabricDark', xform(new THREE.BoxGeometry(0.008, 0.006, 0.44), [sx, y - 0.062, z - 0.12], [0.08, 0, 0]));
  }
  mb.add('carpet', xform(new THREE.BoxGeometry(1.36, 0.2, 0.42), [0, 0.3, z - 0.05]));
  for (const sx of [-0.4, 0.4]) {
    const hr = roundedBox(0.26, 0.11, 0.07, 0.03, 3);
    xform(hr, [sx, y - 0.13 + 0.6 * Math.cos(0.36) + 0.04, z + 0.15 + 0.6 * Math.sin(0.36) + 0.05], [0.36, 0, 0]);
    mb.add('lace', boxUV(hr, 0.2));
  }
  const shelf = new THREE.BoxGeometry(1.42, 0.02, 0.24);
  xform(shelf, [0, 0.945, 1.46], [0.06, 0, 0]);
  mb.add('carpet', boxUV(shelf, 0.4));
  for (const sx of [-0.45, 0.45]) {
    const sp = new THREE.CylinderGeometry(0.07, 0.07, 0.012, 20);
    xform(sp, [sx, 0.958, 1.47], [0.06, 0, 0]);
    mb.add('plasticDark', sp);
  }
}

function buildFloor(mb) {
  const y = INT.floorY;
  // floor pan with a transmission tunnel (grid deform)
  const g = new THREE.PlaneGeometry(1.52, 2.6, 30, 26);
  g.rotateX(-Math.PI / 2);
  deform(g, (v) => {
    const t = Math.abs(v.x) / 0.16;
    v.y = y + 0.14 * Math.max(0, 1 - t * t) * (v.z < 0.9 ? 1 : 0.6);
    // footwell slopes up into the firewall
    if (v.z < -0.75) v.y += (-0.75 - v.z) * 0.9;
  });
  xform(g, [0, 0, -0.25]);
  planarUV(g, 'y', 0.5);
  mb.add('carpet', g);
  // firewall
  const fw = new THREE.PlaneGeometry(1.52, 0.4);
  xform(fw, [0, 0.62, -1.05]);
  mb.add('black', fw);
  // floor mats
  for (const [x, z, w, d] of [[0.38, -0.55, 0.5, 0.55], [-0.38, -0.55, 0.5, 0.55], [0.4, 0.65, 0.48, 0.4], [-0.4, 0.65, 0.48, 0.4]]) {
    const mat = roundedBox(w, 0.01, d, 0.004, 1);
    deform(mat, (v) => {
      v.y += 0.004 * Math.sin(v.x * 30) * Math.sin(v.z * 25);
      if (z < 0 && v.z + z < -0.72) v.y += (-0.72 - (v.z + z)) * 0.85;
    });
    xform(mat, [x, y + 0.012, z]);
    planarUV(mat, 'y', 0.4);
    mb.add('rubberMat', mat);
  }
  // centre console (between seats, around gear lever)
  const con = roundedBox(0.2, 0.16, 0.62, 0.03, 3);
  xform(con, [0.04, 0.4, -0.22]);
  mb.add('plasticDark', con);
  // gear boot surround
  mb.add('plasticDark', xform(roundedBox(0.16, 0.02, 0.22, 0.01, 2), [INT.gearBase.x, 0.485, INT.gearBase.z]));
  // coin tray in front of the shifter
  mb.add('plasticDark', xform(roundedBox(0.13, 0.03, 0.09, 0.01, 2), [0.04, 0.5, -0.45]));
  mb.add('black', xform(new THREE.BoxGeometry(0.11, 0.004, 0.07), [0.04, 0.516, -0.45]));
  // lower centre stack (heater panel)
  const st = roundedBox(0.22, 0.26, 0.12, 0.02, 2);
  xform(st, [0, 0.58, -0.6]);
  mb.add('dash', st);
}

/** Pendulum hanging item: group at the pivot; children hang along -Y. */
class Swing {
  constructor(pivot, length, damping = 1.6) {
    this.pivot = pivot;
    this.len = length;
    this.ax = 0; // rotation about x (fore-aft swing)
    this.az = 0; // rotation about z (side swing)
    this.vx = 0;
    this.vz = 0;
    this.damping = damping;
  }
  /** acc = car-local linear acceleration (m/s^2), yawAcc for twist */
  step(dt, accX, accZ, kick = 0) {
    const g = 9.81, L = this.len;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      // pendulum: theta'' = -(g/L) sin(theta) - (a/L) cos(theta)
      const tx = -(g / L) * Math.sin(this.ax) + (accZ / L) * Math.cos(this.ax) - this.damping * this.vx;
      const tz = -(g / L) * Math.sin(this.az) - (accX / L) * Math.cos(this.az) - this.damping * this.vz;
      this.vx += tx * h + kick * (Math.random() - 0.5) * 0.4;
      this.vz += tz * h + kick * (Math.random() - 0.5) * 0.4;
      this.ax += this.vx * h;
      this.az += this.vz * h;
    }
    this.ax = clamp(this.ax, -1.2, 1.2);
    this.az = clamp(this.az, -1.2, 1.2);
    this.pivot.rotation.x = this.ax;
    this.pivot.rotation.z = this.az;
  }
}

/**
 * Build the interior. ext = exterior build result (for doors). Returns parts for animation.
 */
export function buildTaxiInterior(ext) {
  const m = interiorMaterials();
  const im = instanceMaterials();
  const group = new THREE.Group();
  group.name = 'taxiInterior';
  const mb = new MergeBuilder();
  const parts = { swings: [], rattles: [], im };

  buildDash(mb);
  // vents: centre pair, outer ends
  vent(mb, -0.06, 0.835, -0.594, 0.09, 0.045);
  vent(mb, 0.06, 0.835, -0.594, 0.09, 0.045);
  vent(mb, -0.68, 0.84, -0.6, 0.08, 0.05);
  vent(mb, 0.69, 0.845, -0.6, 0.07, 0.05);
  // defroster slot
  mb.add('black', xform(new THREE.BoxGeometry(1.2, 0.004, 0.02), [0, 0.914, -0.97]));
  // radio surround + faceplate
  mb.add('plasticDark', xform(roundedBox(0.2, 0.075, 0.02, 0.006, 2), [INT.radio.x, INT.radio.y, INT.radio.z - 0.004]));
  // heater control panel with sliders
  mb.add('plasticDark', xform(roundedBox(0.19, 0.06, 0.012, 0.006, 2), [0, 0.655, -0.538]));
  for (let i = 0; i < 3; i++) {
    mb.add('black', xform(new THREE.BoxGeometry(0.05, 0.004, 0.004), [-0.06 + i * 0.06, 0.66, -0.531]));
    mb.add('plasticBeige', xform(roundedBox(0.012, 0.016, 0.012, 0.003, 1), [-0.07 + i * 0.065 + (i === 1 ? 0.02 : 0), 0.66, -0.528]));
  }
  // ashtray / lighter
  mb.add('chrome', xform(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 12).rotateX(Math.PI / 2), [0.07, 0.61, -0.536]));

  // ---- floor, console, seats ------------------------------------------------------------------
  buildFloor(mb);
  const dSeat = buildFrontSeat(mb, m, INT.seatDriver, true);
  buildFrontSeat(mb, m, INT.seatPass, false);
  buildRearBench(mb, m);
  // fabric seat cover drape on the passenger seat (patterned cloth over backrest top)
  {
    const drape = new THREE.PlaneGeometry(0.46, 0.3, 8, 6);
    deform(drape, (v) => {
      v.z = 0.012 * Math.sin(v.x * 18) * (0.5 - v.y);
    });
    const p = INT.seatPass;
    xform(drape, [p.x, p.y + 0.36, p.z + 0.27], [0.32, 0, 0]);
    mb.add('lace', drape);
  }

  // ---- headliner details ------------------------------------------------------------------------
  // dome light housing + lens
  mb.add('plasticBeige', xform(roundedBox(0.17, 0.018, 0.09, 0.008, 2), [0, 1.355, 0.25]));
  const domeLens = new THREE.Mesh(xform(roundedBox(0.13, 0.012, 0.06, 0.006, 2), [0, 1.344, 0.25]), im.dome);
  group.add(domeLens);
  parts.domeLens = domeLens;
  // grab handles over doors
  for (const sx of [-1, 1]) {
    for (const z of [0.35]) {
      mb.add('plasticBeige', tube([[sx * 0.66, 1.26, z - 0.1], [sx * 0.62, 1.24, z - 0.06], [sx * 0.615, 1.235, z + 0.06], [sx * 0.66, 1.26, z + 0.1]], 0.009, 12, 6));
    }
  }

  // ---- sagging headliner over the rear seat (glue gave up years ago; pinned back with drawing pins)
  buildHeadlinerSag(group, ext, m);

  // ---- steering column, wheel, stalks, ignition ---------------------------------------------------
  const wc = INT.wheelCenter;
  const colDir = INT.colDir;
  const colBase = wc.clone().addScaledVector(colDir, 0.36);
  mb.add('plasticDark', (() => {
    const g = new THREE.CylinderGeometry(0.045, 0.06, 0.3, 14);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), colDir.clone().negate());
    const mid = wc.clone().addScaledVector(colDir, 0.21);
    return xform(g, [mid.x, mid.y, mid.z], q);
  })());
  // column shroud box near the wheel (stalks mount here)
  const shroudC = wc.clone().addScaledVector(colDir, 0.09);
  mb.add('plasticDark', (() => {
    const g = roundedBox(0.13, 0.09, 0.12, 0.025, 3);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), colDir);
    return xform(g, [shroudC.x, shroudC.y - 0.015, shroudC.z], q);
  })());
  // steering wheel group: rotates about the column axis
  const steerPivot = new THREE.Group();
  steerPivot.position.copy(wc);
  steerPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), colDir); // local -Z = into dash
  const steerSpin = new THREE.Group();
  steerPivot.add(steerSpin);
  {
    const wb = new MergeBuilder();
    const R = 0.19;
    // rim with grip ripples
    const rim = new THREE.TorusGeometry(R, 0.0165, 10, 64);
    deform(rim, (v) => {
      const a = Math.atan2(v.y, v.x);
      const ripple = 1 + 0.06 * Math.max(0, Math.sin(a * 36)) * (Math.abs(Math.sin(a)) > 0.3 ? 1 : 0);
      const len = Math.hypot(v.x, v.y);
      const k = (len - R) * ripple + R;
      v.x *= k / len;
      v.y *= k / len;
      v.z *= ripple;
    }, false);
    wb.add('wheel', rim);
    // two spokes down-left / down-right + hub
    for (const a of [-2.45, -0.69]) {
      const g = roundedBox(0.15, 0.04, 0.016, 0.008, 2);
      g.translate(0.075 + 0.03, 0, 0);
      g.rotateZ(a);
      xform(g, [0, 0, 0.012]);
      wb.add('wheel', g);
    }
    const hub = roundedBox(0.13, 0.095, 0.05, 0.022, 3);
    pillow(hub, 0.006);
    xform(hub, [0, -0.01, 0.022]);
    wb.add('wheel', hub);
    // fictional emblem on the horn pad
    wb.add('chrome', xform(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 16).rotateX(Math.PI / 2), [0, -0.005, 0.049]));
    steerSpin.add(wb.build({ wheel: m.wheel, chrome: m.chrome }));
    // wheel tilt: plane facing the driver
  }
  group.add(steerPivot);
  parts.steering = { pivot: steerPivot, spin: steerSpin };
  // horn pad proxy anchor
  const hornAnchor = new THREE.Object3D();
  hornAnchor.position.set(0, -0.005, 0.05);
  steerSpin.add(hornAnchor);
  parts.hornAnchor = hornAnchor;

  // stalks (lights right, wipers left) on the shroud
  const stalk = (side) => {
    const piv = new THREE.Group();
    const base = shroudC.clone().add(new THREE.Vector3(side * 0.065, 0.0, 0.0));
    piv.position.copy(base);
    const g = new MergeBuilder();
    g.add('pd', rod([0, 0, 0], [side * 0.13, -0.01, 0.02], 0.007, 8, 0.0085));
    g.add('pd', xform(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 10).rotateZ(Math.PI / 2), [side * 0.145, -0.011, 0.022]));
    piv.add(g.build({ pd: m.plasticDark }));
    group.add(piv);
    return piv;
  };
  parts.stalkLights = stalk(1);
  parts.stalkWipers = stalk(-1);
  // ignition key slot (right side of the column shroud)
  const keySlot = new THREE.Group();
  keySlot.position.copy(shroudC).add(new THREE.Vector3(0.07, -0.02, -0.02));
  keySlot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.8, 0.1, 0.6).normalize());
  {
    const g = new MergeBuilder();
    g.add('chrome', xform(new THREE.CylinderGeometry(0.017, 0.019, 0.012, 16).rotateX(Math.PI / 2), [0, 0, 0]));
    g.add('black', xform(new THREE.BoxGeometry(0.003, 0.012, 0.004), [0, 0, 0.006]));
    keySlot.add(g.build({ chrome: m.chrome, black: blackMat() }));
  }
  const key = new THREE.Group();
  {
    const g = new MergeBuilder();
    g.add('metal', xform(new THREE.BoxGeometry(0.004, 0.012, 0.03), [0, 0, 0.012]));
    g.add('black', xform(roundedBox(0.03, 0.026, 0.008, 0.006, 2).rotateY(Math.PI / 2), [0, 0, 0.034]));
    g.add('metal', xform(new THREE.TorusGeometry(0.012, 0.0018, 6, 16), [0, -0.015, 0.042], [0, Math.PI / 2, 0]));
    key.add(g.build({ metal: m.chrome, black: blackMat() }));
    // keychain amulet swinging
    const kp = new THREE.Group();
    kp.position.set(0, -0.026, 0.042);
    const tag = new THREE.Mesh(xform(roundedBox(0.018, 0.024, 0.004, 0.003, 1), [0, -0.03, 0]), m.gold);
    kp.add(tag);
    key.add(kp);
    parts.swings.push(new Swing(kp, 0.03, 3));
  }
  key.visible = false;
  keySlot.add(key);
  group.add(keySlot);
  parts.keySlot = keySlot;
  parts.key = key;

  // ---- instrument cluster -----------------------------------------------------------------------
  const clusterGroup = new THREE.Group();
  clusterGroup.position.set(0.38, INT.clusterY, INT.clusterZ + 0.004);
  clusterGroup.rotation.x = -0.12;
  group.add(clusterGroup);
  const gaugeDefs = [
    ['fuel', -0.19, -0.01, 0.034],
    ['tacho', -0.088, 0.0, 0.056],
    ['speed', 0.075, 0.0, 0.062],
    ['temp', 0.18, -0.01, 0.034],
  ];
  parts.needles = {};
  for (const [kind, x, y, r] of gaugeDefs) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), im.gauges[kind]);
    face.position.set(x, y, 0.0);
    clusterGroup.add(face);
    // bezel ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.003, 0.003, 6, 40), m.chrome);
    ring.position.set(x, y, 0.002);
    clusterGroup.add(ring);
    // needle
    const piv = new THREE.Group();
    piv.position.set(x, y, 0.006);
    const big = kind === 'speed' || kind === 'tacho';
    const nl = r * (big ? 0.86 : 0.75);
    const ng = new THREE.BoxGeometry(0.0028, nl, 0.0016);
    ng.translate(0, nl / 2 - r * 0.12, 0);
    piv.add(new THREE.Mesh(ng, im.needle));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 12).rotateX(Math.PI / 2), blackMat());
    cap.position.z = 0.002;
    piv.add(cap);
    clusterGroup.add(piv);
    // sweep: canvas angle a (clockwise from +x) -> rotation.z = -a - PI/2 ... computed in controls
    parts.needles[kind] = { pivot: piv, big };
  }
  // warning light strip
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.025), im.warn);
  warn.position.set(-0.005, -0.068, 0.002);
  clusterGroup.add(warn);
  parts.cluster = clusterGroup;

  // ---- taxi meter -------------------------------------------------------------------------------
  {
    const meter = new THREE.Group();
    meter.position.copy(INT.meter);
    meter.rotation.set(-0.3, 0.12, 0);
    const g = new MergeBuilder();
    g.add('pd', roundedBox(0.2, 0.065, 0.1, 0.01, 2));
    g.add('pd', xform(roundedBox(0.16, 0.012, 0.06, 0.004, 1), [0, -0.038, 0.0]));
    for (let i = 0; i < 3; i++) g.add('beige', xform(roundedBox(0.022, 0.012, 0.012, 0.003, 1), [-0.06 + i * 0.03, -0.022, 0.052]));
    g.add('red', xform(new THREE.BoxGeometry(0.012, 0.012, 0.006), [0.075, -0.022, 0.051]));
    meter.add(g.build({ pd: m.plasticDark, beige: m.plasticBeige, red: m.rose }));
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.165, 0.034), im.meter);
    disp.position.set(0, 0.008, 0.0505);
    meter.add(disp);
    // mounting bracket
    const br = new THREE.Mesh(xform(new THREE.BoxGeometry(0.06, 0.03, 0.02), [0, -0.045, -0.02]), m.metal);
    meter.add(br);
    group.add(meter);
    parts.meter = meter;
    // small receipt printer slip sticking out
    const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.07), new THREE.MeshBasicMaterial({ visible: false }));
    void slip;
  }

  // ---- radio ------------------------------------------------------------------------------------
  {
    const radio = new THREE.Group();
    radio.position.copy(INT.radio);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.05), im.radioFace);
    face.position.z = 0.0075;
    radio.add(face);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.0104), im.radio);
    disp.position.set(0.0004, -0.0101, 0.0082);
    radio.add(disp);
    const knob = (x) => {
      const k = new THREE.Group();
      k.position.set(x, 0.002, 0.012);
      const g = new MergeBuilder();
      g.add('k', new THREE.CylinderGeometry(0.0095, 0.011, 0.014, 18).rotateX(Math.PI / 2));
      g.add('c', xform(new THREE.BoxGeometry(0.0015, 0.008, 0.002), [0, 0.004, 0.0075]));
      k.add(g.build({ k: m.plasticDark, c: m.chrome }));
      radio.add(k);
      return k;
    };
    parts.radioKnobVol = knob(-0.0675);
    parts.radioKnobTune = knob(0.0675);
    group.add(radio);
    parts.radio = radio;
  }

  // ---- gear lever ------------------------------------------------------------------------------
  {
    const piv = new THREE.Group();
    piv.position.copy(INT.gearBase).setY(0.48);
    const g = new MergeBuilder();
    g.add('metal', rod([0, 0, 0], [0, 0.17, 0.02], 0.0065, 8));
    const knob = new THREE.SphereGeometry(0.022, 16, 12);
    knob.scale(1, 0.85, 1.1);
    g.add('knob', xform(knob, [0, 0.185, 0.022]));
    // boot
    const boot = lathe([[0.045, 0], [0.04, 0.02], [0.03, 0.045], [0.016, 0.07], [0.009, 0.09]], 12);
    deform(boot, (v) => {
      v.x += 0.002 * Math.sin(v.y * 160);
      v.z += 0.002 * Math.sin(v.y * 160);
    });
    g.add('boot', boot);
    piv.add(g.build({ metal: m.chrome, knob: m.wood, boot: m.rubberMat }));
    group.add(piv);
    parts.gear = piv;
    // auto selector gate plate (P R N D 2 L)
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.13), gatePlateMat());
    gate.rotation.x = -Math.PI / 2;
    gate.position.set(INT.gearBase.x + 0.05, 0.497, INT.gearBase.z);
    group.add(gate);
    parts.gearGate = gate;
  }

  // ---- handbrake --------------------------------------------------------------------------------
  {
    const piv = new THREE.Group();
    piv.position.copy(INT.hbBase).setY(0.47);
    const g = new MergeBuilder();
    const lever = roundedBox(0.03, 0.025, 0.26, 0.01, 2);
    lever.translate(0, 0, -0.13);
    g.add('pd', lever);
    const grip = roundedBox(0.034, 0.03, 0.1, 0.012, 2);
    grip.translate(0, 0.0, -0.21);
    g.add('grip', grip);
    g.add('chrome', xform(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 8).rotateX(Math.PI / 2), [0, 0.003, -0.268]));
    piv.add(g.build({ pd: m.metal, grip: m.plasticDark, chrome: m.chrome }));
    group.add(piv);
    parts.handbrake = piv;
    mb.add('rubberMat', xform(roundedBox(0.06, 0.012, 0.16, 0.006, 1), [INT.hbBase.x, 0.475, INT.hbBase.z - 0.05]));
  }

  // ---- pedals -----------------------------------------------------------------------------------
  parts.pedals = {};
  for (const [name, x, w] of [['clutch', 0.19, 0.06], ['brake', 0.33, 0.075], ['throttle', 0.49, 0.045]]) {
    const piv = new THREE.Group();
    piv.position.set(x, 0.62, -0.84);
    const g = new MergeBuilder();
    const len = name === 'throttle' ? 0.42 : 0.38;
    g.add('metal', xform(new THREE.BoxGeometry(0.012, len, 0.012), [0, -len / 2, 0]));
    g.add('pad', xform(roundedBox(w, name === 'throttle' ? 0.11 : 0.06, 0.016, 0.006, 2), [0, -len - 0.01, 0.01], [-0.35, 0, 0]));
    piv.add(g.build({ metal: m.metal, pad: m.pedalRubber }));
    group.add(piv);
    parts.pedals[name] = piv;
  }

  // ---- glovebox lid --------------------------------------------------------------------------------
  {
    const piv = new THREE.Group();
    const yb = DASH_PROFILE[11][1] + 0.002;
    piv.position.set(-0.41, yb, -0.607);
    const g = new MergeBuilder();
    const lid = roundedBox(0.42, DASH_PROFILE[9][1] - DASH_PROFILE[11][1] - 0.004, 0.018, 0.006, 2);
    lid.translate(0, (DASH_PROFILE[9][1] - DASH_PROFILE[11][1]) / 2, 0);
    g.add('dash', boxUV(lid, 0.3));
    g.add('chrome', xform(roundedBox(0.06, 0.012, 0.008, 0.003, 1), [0, DASH_PROFILE[9][1] - DASH_PROFILE[11][1] - 0.025, 0.012]));
    piv.add(g.build({ dash: m.dash, chrome: m.chrome }));
    // sticker "safe travel" on the lid
    const st = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), m.sticker('safe'));
    st.position.set(0.09, 0.05, 0.0095);
    piv.add(st);
    group.add(piv);
    parts.glovebox = piv;
    // contents anchor (memory letter)
    const anchor = new THREE.Object3D();
    anchor.position.set(-0.41, DASH_PROFILE[11][1] + 0.02, -0.7);
    group.add(anchor);
    parts.gloveAnchor = anchor;
    // an envelope inside
    const env = new THREE.Mesh(xform(new THREE.BoxGeometry(0.16, 0.004, 0.11), [-0.4, DASH_PROFILE[11][1] + 0.01, -0.7], [0, 0.2, 0]), m.paper);
    group.add(env);
  }

  // ---- sun visors ---------------------------------------------------------------------------------
  parts.visors = {};
  for (const [id, x] of [['driver', 0.35], ['passenger', -0.35]]) {
    const piv = new THREE.Group();
    piv.position.set(x, 1.3, -0.29);
    const g = new MergeBuilder();
    const v = roundedBox(0.4, 0.15, 0.022, 0.01, 3);
    pillow(v, 0.004);
    v.translate(0, -0.075, 0);
    g.add('v', boxUV(v, 0.2));
    g.add('rod', rod([-0.2, 0, 0], [0.22, 0, 0], 0.006, 6));
    piv.add(g.build({ v: m.plasticBeige, rod: m.metal }));
    piv.rotation.x = 1.45; // stowed (flat under the headliner)
    if (id === 'driver') {
      // photo tucked under an elastic strap, facing the driver when flipped down
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.08), m.photo);
      ph.position.set(0.1, -0.08, 0.0125);
      ph.rotation.z = 0.08;
      piv.add(ph);
      const strap = new THREE.Mesh(xform(new THREE.BoxGeometry(0.1, 0.012, 0.004), [0.1, -0.06, 0.013]), blackMat());
      piv.add(strap);
      const anchor = new THREE.Object3D();
      anchor.position.copy(ph.position);
      piv.add(anchor);
      parts.photoAnchor = anchor;
      // yantra sticker on the visor
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), m.sticker('yantra'));
      st.position.set(-0.12, -0.075, 0.0125);
      piv.add(st);
    }
    group.add(piv);
    parts.visors[id] = piv;
  }

  // ---- rearview mirror (housing) + amulets + garland ------------------------------------------------
  {
    const mp = INT.mirrorPos;
    mb.add('plasticDark', rod([0, 1.33, -0.38], [mp.x, mp.y + 0.025, mp.z + 0.01], 0.008, 8));
    mb.add('plasticDark', xform(roundedBox(0.05, 0.02, 0.05, 0.008, 2), [0, 1.335, -0.375]));
    const mirror = new THREE.Group();
    mirror.position.copy(mp);
    // face the driver eye
    const eye = new THREE.Vector3(0.37, 1.15, 0.26);
    const toEye = eye.clone().sub(mp).normalize();
    const back = new THREE.Vector3(0, -0.02, 1).normalize(); // view direction through the rear window
    const n = toEye.clone().add(back).normalize();
    mirror.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const hg = roundedBox(0.255, 0.075, 0.035, 0.016, 3);
    hg.translate(0, 0, -0.016);
    mirror.add(new THREE.Mesh(hg, m.plasticDark));
    const mount = new THREE.Object3D();
    mount.position.set(0, 0, 0.003);
    mount.userData.size = [0.235, 0.058];
    mirror.add(mount);
    group.add(mirror);
    parts.rearviewMount = mount;
    parts.rearview = mirror;
    // amulets hanging from the stem
    const rng = makeRng(88);
    const amuletTex = S('amulet_face', {});
    const amuletMat = paintedMaterial({ map: amuletTex, color: amuletTex ? 0xffffff : 0x8a6a3a, roughness: 0.5, brush: 0.2, name: 'int_amuletface' });
    const hangs = [[-0.012, 0.13], [0.008, 0.155], [0.022, 0.11]];
    hangs.forEach(([dx, L], i) => {
      const piv = new THREE.Group();
      piv.position.set(mp.x + dx, mp.y - 0.005, mp.z - 0.005);
      const g = new MergeBuilder();
      g.add('s', rod([0, 0, 0], [0, -L, 0], 0.0009, 4));
      const fr = roundedBox(0.026 + i * 0.004, 0.036 + i * 0.004, 0.006, 0.006, 2);
      g.add('gold', xform(fr, [0, -L - 0.018, 0]));
      piv.add(g.build({ s: m.string, gold: m.gold }));
      for (const sz of [1, -1]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.02 + i * 0.004, 0.028 + i * 0.004), amuletMat);
        face.position.set(0, -L - 0.018, sz * 0.0035);
        if (sz < 0) face.rotation.y = Math.PI;
        piv.add(face);
      }
      group.add(piv);
      parts.swings.push(new Swing(piv, L + 0.018, 0.9 + rng() * 0.6));
    });
    // jasmine garland: loop of buds + tassel with rose + ribbons
    const gp = new THREE.Group();
    gp.position.set(mp.x - 0.03, mp.y - 0.01, mp.z);
    const budGeo = new THREE.SphereGeometry(0.0055, 6, 5);
    budGeo.scale(1, 1.6, 1);
    const buds = [];
    const loopN = 42;
    for (let i = 0; i < loopN; i++) {
      const a = (i / loopN) * Math.PI * 2;
      // a narrow hanging loop (U shape)
      const x = Math.sin(a) * 0.018;
      const y = -0.05 - 0.05 * (1 - Math.cos(a));
      buds.push([x, y, Math.cos(a * 2) * 0.004]);
    }
    const bud = new THREE.InstancedMesh(budGeo, m.jasmine, loopN + 12);
    const mt = new THREE.Matrix4();
    buds.forEach(([x, y, z], i) => {
      mt.makeRotationFromEuler(new THREE.Euler(rng() * 0.6, rng() * 3, rng() * 0.6)).setPosition(x, y, z);
      bud.setMatrixAt(i, mt);
    });
    // tassel buds below
    for (let i = 0; i < 12; i++) {
      mt.makeRotationFromEuler(new THREE.Euler(0, rng() * 3, 0)).setPosition((rng() - 0.5) * 0.012, -0.165 - i * 0.008, (rng() - 0.5) * 0.012);
      bud.setMatrixAt(loopN + i, mt);
    }
    gp.add(bud);
    const g = new MergeBuilder();
    g.add('s', rod([0, 0, 0], [0, -0.05, 0], 0.0009, 4));
    const rose = new THREE.IcosahedronGeometry(0.013, 1);
    deform(rose, (v) => v.multiplyScalar(1 + 0.15 * Math.sin(v.x * 400) * Math.sin(v.y * 300)));
    g.add('rose', xform(rose, [0, -0.15, 0]));
    g.add('mari', xform(new THREE.IcosahedronGeometry(0.009, 1), [0, -0.135, 0.004]));
    for (const sx of [-1, 1]) {
      const rib = new THREE.PlaneGeometry(0.01, 0.09, 1, 6);
      deform(rib, (v) => {
        v.x += Math.sin(v.y * 40) * 0.003;
      });
      g.add('rib', xform(rib, [sx * 0.008, -0.23, 0], [0, 0, sx * 0.08]));
    }
    gp.add(g.build({ s: m.string, rose: m.rose, mari: m.marigold, rib: m.ribbon }));
    group.add(gp);
    parts.swings.push(new Swing(gp, 0.12, 1.1));
  }

  // ---- dashboard decorations ------------------------------------------------------------------------
  {
    // little golden Buddha on the dash (passenger side, near the windshield)
    const b = new MergeBuilder();
    const base = lathe([[0.0, 0], [0.032, 0], [0.034, 0.006], [0.03, 0.012], [0.026, 0.016], [0, 0.016]], 20);
    b.add('gold', base);
    const lotus = lathe([[0.026, 0.016], [0.03, 0.022], [0.024, 0.026], [0, 0.026]], 16);
    b.add('gold', lotus);
    const legs = new THREE.SphereGeometry(0.024, 16, 10);
    legs.scale(1, 0.38, 0.75);
    b.add('gold', xform(legs, [0, 0.032, 0]));
    const body = new THREE.SphereGeometry(0.014, 16, 12);
    body.scale(1, 1.55, 0.85);
    b.add('gold', xform(body, [0, 0.055, -0.002]));
    const head = new THREE.SphereGeometry(0.0085, 16, 12);
    b.add('gold', xform(head, [0, 0.083, 0]));
    b.add('gold', xform(new THREE.ConeGeometry(0.004, 0.012, 10), [0, 0.096, 0]));
    const halo = new THREE.TorusGeometry(0.016, 0.0015, 6, 24);
    b.add('gold', xform(halo, [0, 0.08, -0.008]));
    const buddha = new THREE.Group();
    buddha.add(b.build({ gold: m.gold }));
    buddha.position.set(-0.2, 0.938, -0.86);
    buddha.rotation.y = 0.15;
    group.add(buddha);
    parts.rattles.push({ obj: buddha, base: buddha.position.clone(), amp: 0.0012 });
    // tiny jasmine offering at its base
    // stickers
    const cartoon = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), m.sticker('cartoon'));
    cartoon.position.set(-0.45, 0.842, -0.5955);
    cartoon.rotation.z = -0.12;
    group.add(cartoon);
    parts.stickerAnchor = cartoon;
    // receipts tucked by the meter & in the vent
    const rTex = S('receipt', { lines: ['รับ 35.00', 'ขอบคุณครับ'] });
    const rMat = paintedMaterial({ map: rTex, color: rTex ? 0xffffff : 0xe8e0cc, roughness: 0.9, brush: 0.2, side: THREE.DoubleSide, name: 'int_receipt' });
    for (const [x, y, z, rx, ry, rz] of [[0.04, 0.955, -0.74, -1.3, 0.3, 0.1], [-0.08, 0.86, -0.585, 0.15, 0.1, 0.2], [0.07, 0.944, -0.8, -1.57, 0, 0.8]]) {
      const r = new THREE.PlaneGeometry(0.055, 0.09, 1, 4);
      deform(r, (v) => {
        v.z += 0.006 * Math.sin(v.y * 30);
      });
      const mesh = new THREE.Mesh(r, rMat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      group.add(mesh);
    }
    // coins in the tray
    const coinGeo = new THREE.CylinderGeometry(0.0105, 0.0105, 0.0018, 14);
    const coins = new THREE.InstancedMesh(coinGeo, m.coin, 14);
    const mt = new THREE.Matrix4();
    const rng = makeRng(5);
    for (let i = 0; i < 14; i++) {
      mt.makeRotationFromEuler(new THREE.Euler(rng.range(-0.2, 0.2), rng() * 6, rng.range(-0.2, 0.2)));
      const s = rng() < 0.4 ? 1.15 : 0.95;
      mt.scale(new THREE.Vector3(s, 1, s));
      mt.setPosition(0.04 + rng.range(-0.045, 0.045), 0.52 + (i % 4) * 0.0018, -0.45 + rng.range(-0.025, 0.025));
      coins.setMatrixAt(i, mt);
    }
    group.add(coins);
    parts.coins = coins;
    // tissue box on the dash, passenger side
    const tb = new MergeBuilder();
    tb.add('box', xform(roundedBox(0.2, 0.07, 0.11, 0.012, 2), [0, 0.035, 0]));
    const tis = new THREE.PlaneGeometry(0.06, 0.05, 4, 4);
    deform(tis, (v) => {
      v.z = 0.01 * Math.sin(v.x * 50) + 0.01 * Math.sin(v.y * 40);
    });
    tb.add('tis', xform(tis, [0, 0.09, 0], [0, 0, 0]));
    const tissueBox = new THREE.Group();
    tissueBox.add(tb.build({ box: m.tissueBox, tis: m.tissue }));
    tissueBox.position.set(-0.5, 0.94, -0.84);
    tissueBox.rotation.y = 0.25;
    group.add(tissueBox);
    parts.rattles.push({ obj: tissueBox, base: tissueBox.position.clone(), amp: 0.0018 });
    // second tissue box on the parcel shelf
    const tb2 = tissueBox.clone();
    tb2.position.set(0.35, 0.975, 1.42);
    tb2.rotation.set(0.08, -0.2, 0);
    group.add(tb2);
    // a small calendar card + pen tucked behind the meter
    const pen = new THREE.Mesh(rod([0, 0, 0], [0.13, 0.0, 0.01], 0.004, 6), m.plasticBeige);
    pen.position.set(-0.3, 0.945, -0.7);
    group.add(pen);
  }

  // ---- vacant lamp ('ว่าง') inside the windshield, passenger side --------------------------------
  {
    const vl = new THREE.Group();
    vl.position.set(-0.46, 0.958, -0.93);
    vl.rotation.x = 0.0;
    const g = new MergeBuilder();
    g.add('pd', roundedBox(0.16, 0.08, 0.045, 0.01, 2));
    vl.add(g.build({ pd: m.plasticDark }));
    parts.vacantGroup = vl;
    group.add(vl);
  }

  // ---- door cards (added into door groups) -------------------------------------------------------
  parts.doorCards = {};
  parts.cranks = {};
  parts.lockPins = {};
  parts.innerHandles = {};
  for (const id of ['fl', 'fr', 'rl', 'rr']) {
    const d = ext.doors[id];
    const card = buildDoorCard(id, d, m, parts);
    d.inner.add(card);
    parts.doorCards[id] = card;
  }

  // ---- merge static stuff -------------------------------------------------------------------------
  const staticMeshes = mb.build({
    dash: m.dash, dashMat: m.dashMat, plasticDark: m.plasticDark, plasticBeige: m.plasticBeige, black: blackMat(), chrome: m.chrome,
    vinyl: m.vinyl, fabric: m.fabric, fabricDark: m.plasticDark, lace: m.lace, carpet: m.carpet, rubberMat: m.rubberMat, metal: m.metal,
  });
  for (const mesh of staticMeshes.children) mesh.receiveShadow = true;
  group.add(staticMeshes);

  // bead cover on the driver seat (seat-local functions)
  const dp = INT.seatDriver;
  const beads = beadCover(m, new THREE.Vector3(dp.x, dp.y, dp.z), dSeat.cushionTop, dSeat.backFn);
  group.add(beads);
  parts.beads = beads;

  return { group, parts, materials: { ...m, ...im } };
}

/** Height of the headliner surface at (x, z), from raycasts against the shell's headliner mesh. */
function headlinerHeightFn(ext) {
  const hl = ext.shell.getObjectByName('headliner');
  const fallback = (x, z) => 1.36 - 0.06 * (x / 0.72) ** 2 - 0.03 * smoothstep(0.75, 1.1, z);
  if (!hl) return fallback;
  hl.updateWorldMatrix(true, false);
  const rc = new THREE.Raycaster();
  rc.layers.enableAll();
  rc.far = 0.9;
  const o = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const side = hl.material.side;
  hl.material.side = THREE.DoubleSide;
  // coarse grid of probes, bilinear in between
  const X0 = -0.6, X1 = 0.6, Z0 = 0.3, Z1 = 1.1, NX = 7, NZ = 5;
  const grid = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = lerp(X0, X1, i / (NX - 1)), z = lerp(Z0, Z1, j / (NZ - 1));
      o.set(x, 0.75, z);
      rc.set(o, up);
      const hit = rc.intersectObject(hl, false).find((h) => h.point.y > 1.15);
      grid.push(hit ? hit.point.y : fallback(x, z));
    }
  }
  hl.material.side = side;
  return (x, z) => {
    const fx = clamp((x - X0) / (X1 - X0), 0, 1) * (NX - 1), fz = clamp((z - Z0) / (Z1 - Z0), 0, 1) * (NZ - 1);
    const i = Math.min(NX - 2, Math.floor(fx)), j = Math.min(NZ - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j;
    const a = grid[j * NX + i], b = grid[j * NX + i + 1], c = grid[(j + 1) * NX + i], d = grid[(j + 1) * NX + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
}

function buildHeadlinerSag(group, ext, m) {
  const height = headlinerHeightFn(ext);
  const W = 1.0, D = 0.56, cz = 0.8;
  const pins = [[-0.42, 0.56], [0.12, 0.54], [0.44, 0.7], [-0.18, 1.04], [0.38, 1.03]];
  const g = new THREE.PlaneGeometry(W, D, 20, 12);
  g.rotateX(Math.PI / 2); // faces down into the cabin; plane y -> z
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) + cz;
    const u = clamp(x / W + 0.5, 0, 1), v = clamp((z - (cz - D / 2)) / D, 0, 1);
    const su = Math.max(0, Math.sin(Math.PI * u)), sv = Math.max(0, Math.sin(Math.PI * v));
    // a tired belly: deepest behind the middle, bubbly where the foam backing crumbled
    let sag = 0.07 * Math.pow(su, 0.7) * Math.pow(sv, 0.9);
    sag *= 0.75 + 0.35 * (noise.noise2D(x * 6.0 + 3.1, z * 6.0) * 0.5 + 0.5);
    sag += 0.006 * noise.noise2D(x * 22, z * 22) * su * sv;
    for (const [px, pz] of pins) {
      const d2 = ((x - px) ** 2 + (z - pz) ** 2) / 0.0045;
      sag *= 1 - Math.exp(-d2) * 0.92;
    }
    p.setXYZ(i, x, height(x, z) - 0.006 - Math.max(0, sag), z);
    uv.setXY(i, x * 1.5, z * 1.5);
  }
  g.computeVertexNormals();
  const mat = sharedMaterials().headliner;
  const sheet = new THREE.Mesh(g, mat);
  sheet.name = 'headlinerSag';
  sheet.receiveShadow = true;
  group.add(sheet);
  // drawing pins (coloured plastic heads) holding it up
  const pinCols = [0xb8261c, 0xd8b02a, 0x2a5aa0, 0xb8261c, 0xe8e2d0];
  pins.forEach(([px, pz], k) => {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 10), paintedMaterial({ color: pinCols[k % pinCols.length], roughness: 0.45, brush: 0.1, name: 'int_pin' }));
    head.position.set(px, height(px, pz) - 0.009, pz);
    group.add(head);
  });
}

let _black = null;
function blackMat() {
  if (!_black) _black = paintedMaterial({ color: 0x080808, roughness: 0.9, brush: 0.1, name: 'int_black' });
  return _black;
}

let _gate = null;
function gatePlateMat() {
  if (_gate) return _gate;
  const c = VT.makeCanvas(64, 160);
  const g = c.getContext('2d');
  g.fillStyle = '#16171a';
  g.fillRect(0, 0, 64, 160);
  g.fillStyle = '#c9cdc4';
  g.font = `700 20px ${FONTS.lcd}`;
  g.textAlign = 'center';
  ['P', 'R', 'N', 'D', '2', 'L'].forEach((s, i) => g.fillText(s, 46, 22 + i * 25));
  g.fillStyle = '#050505';
  g.fillRect(14, 10, 8, 140);
  _gate = paintedMaterial({ map: VT.toTexture(c), roughness: 0.6, brush: 0.1, name: 'int_gate' });
  return _gate;
}

/** Door card: inner panel following the door, armrest, handle, crank, lock pin, speaker, pocket. */
function buildDoorCard(id, d, m, parts) {
  const sx = d.sx;
  const front = id[0] === 'f';
  const [z0, z1] = front ? [DIM.frontDoor[0] + 0.015, DIM.frontDoor[1] - 0.012] : [DIM.rearDoor[0] + 0.012, DIM.rearDoor[1] - 0.015];
  const xIn = sx * 0.756; // card surface plane
  const yBot = 0.27;
  const card = new THREE.Group();
  const mb = new MergeBuilder();
  // main card: grid over (z, y) with slight curvature and a sill cap
  const nZ = 10, nY = 8;
  const yTop = (z) => belt(z) - 0.004;
  const grid = new GridSurface(nY + 2, nZ, (r, c) => {
    const z = lerp(z0, z1, c / (nZ - 1));
    if (r <= nY) {
      const y = lerp(yBot, yTop(z) - 0.02, r / nY);
      const bulge = 0.012 * Math.sin((r / nY) * Math.PI) * Math.sin((c / (nZ - 1)) * Math.PI);
      return [sx * (0.756 - bulge), y, z];
    }
    // sill cap rolling over toward the glass slot
    return [sx * 0.768, yTop(z), z];
  });
  // orientation: rows up, cols +z: dr x dc = y x z = +x -> for the right door (sx>0) the card faces
  // into the cabin (-x) so flip there.
  const g = grid.build(() => true, { flip: sx > 0, uv: (r, c) => { const p = grid.get(r, c); return [p.z * 2.2, p.y * 2.2]; } });
  mb.add('trim', g);
  // lower carpeted band
  const band = new THREE.PlaneGeometry(z1 - z0 - 0.02, 0.1);
  band.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
  xform(band, [sx * 0.752, yBot + 0.07, (z0 + z1) / 2]);
  mb.add('carpet', band);
  // armrest
  const arm = roundedBox(0.06, 0.04, (z1 - z0) * 0.55, 0.015, 2);
  xform(arm, [sx * 0.73, 0.68, lerp(z0, z1, front ? 0.55 : 0.45)]);
  mb.add('trimDark', arm);
  // map pocket (front doors)
  if (front) {
    mb.add('trimDark', xform(roundedBox(0.03, 0.09, (z1 - z0) * 0.6, 0.01, 2), [sx * 0.74, 0.36, lerp(z0, z1, 0.5)]));
    // speaker grille
    const sp = new THREE.CylinderGeometry(0.055, 0.055, 0.008, 20);
    sp.rotateZ(Math.PI / 2);
    xform(sp, [sx * 0.75, 0.47, lerp(z0, z1, 0.22)]);
    mb.add('black', sp);
  }
  // inner door handle (chrome lever in a recess)
  const hz = front ? z0 + 0.14 : z0 + 0.1;
  mb.add('trimDark', xform(roundedBox(0.012, 0.05, 0.11, 0.008, 2), [sx * 0.752, 0.8, hz]));
  const handle = new THREE.Group();
  handle.position.set(sx * 0.744, 0.8, hz + 0.045);
  handle.add(new THREE.Mesh(xform(roundedBox(0.012, 0.016, 0.085, 0.005, 2), [0, 0, -0.04]), m.chrome));
  card.add(handle);
  parts.innerHandles[id] = handle;
  // window crank
  const crank = new THREE.Group();
  crank.position.set(sx * 0.748, 0.59, front ? z0 + 0.3 : z0 + 0.22);
  {
    const cg = new MergeBuilder();
    cg.add('chrome', xform(new THREE.CylinderGeometry(0.014, 0.016, 0.02, 12).rotateZ(Math.PI / 2), [-sx * 0.01, 0, 0]));
    cg.add('chrome', xform(roundedBox(0.008, 0.012, 0.085, 0.004, 1), [-sx * 0.02, 0, 0.035]));
    cg.add('knob', xform(new THREE.CylinderGeometry(0.009, 0.01, 0.035, 10).rotateZ(Math.PI / 2), [-sx * 0.04, 0, 0.072]));
    crank.add(cg.build({ chrome: m.chrome, knob: blackMat() }));
  }
  card.add(crank);
  parts.cranks[id] = crank;
  // lock pin on the sill (rear end)
  const pin = new THREE.Mesh(xform(new THREE.CylinderGeometry(0.0045, 0.006, 0.05, 8), [0, 0.0, 0]), m.chrome);
  pin.position.set(sx * 0.762, yTop(z1 - 0.05) + 0.012, z1 - 0.05);
  card.add(pin);
  parts.lockPins[id] = pin;
  card.add(mb.build({ trim: m.plasticBeige, trimDark: m.plasticDark, carpet: m.carpet, black: blackMat(), chrome: m.chrome }));
  return card;
}

export { Swing };
