// Flower cards for props: dense clusters of the photobashed FLOWER_ATLAS cards (tex('flower_atlas'))
// on modelled cords, stems and wreath rings. Every head is cross-carded (a face-on card plus two
// three-quarter cards through the flower axis) so it reads as 3D from any side; cards are slightly
// curled, double-sided, translucent and flutter a little in the wind. All cards of a prop go into ONE
// kit bucket (one draw call per prop chunk) with uv:'keep' (atlas uvs) and per-card vertex tint.
import * as THREE from 'three';
import { foliageMaterial } from '../../render/index.js';
import { tex, flowerCell } from '../../textures/index.js';

let _mat = null;
/** Shared alpha-tested flower-card material (atlas + normal map). */
export function flowerMat() {
  if (_mat) return _mat;
  let map = null, normalMap = null;
  try {
    map = tex('flower_atlas');
    normalMap = tex('flower_atlas_normal');
  } catch (e) {
    /* textures unavailable (should not happen): plain tinted cards */
  }
  _mat = foliageMaterial({
    name: 'props_flowers', map, normalMap, vertexColors: true, color: 0xffffff, alphaTest: 0.5,
    translucency: 0.55, roughness: 0.62, wind: 'leaf', windStrength: 0.18, flutter: 0.6, brush: 0.35,
    headlightBoost: 0.12, wet: 0.4,
  });
  _mat.userData.uvMode = 'keep';
  _mat.userData.shadows = false;
  return _mat;
}

const geoCache = new Map();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Card geometry for an atlas cell: a curled quad, uvs mapped to the cell, pivot at the origin.
 * anchor: 'center' (face-on heads), 'head' (three-quarter card positioned so the head centre sits at the
 * origin), 'top' (ribbons hang down from the origin), 'bottom' (stems/sprigs stand on the origin).
 */
function cardGeo(cell, anchor, curl = 0.12) {
  const key = cell.name + ':' + cell.view + ':' + anchor + ':' + curl;
  let g = geoCache.get(key);
  if (g) return g;
  const [u0, v0, u1, v1] = cell.uv;
  const aspect = (u1 - u0) / (v1 - v0);
  const w = aspect >= 1 ? 1 : aspect, h = aspect >= 1 ? 1 / aspect : 1;
  g = new THREE.PlaneGeometry(w, h, 2, cell.kind === 'ribbon' ? 6 : 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const oy = anchor === 'top' ? -h / 2 : anchor === 'bottom' ? h / 2 : anchor === 'head' ? h * 0.12 : 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // curl: edges bend toward the viewer (+z), ribbons ripple
    const z = cell.kind === 'ribbon' ? Math.sin((y / h) * 7.0) * 0.06 * h : (x * x + y * y) * curl;
    pos.setXYZ(i, x, y + oy, z);
    uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  }
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

/** Quaternion turning +Z to dir, then spinning `spin` radians about dir. */
function orient(dir, spin = 0, out = new THREE.Quaternion()) {
  _d.set(dir[0] ?? dir.x, dir[1] ?? dir.y, dir[2] ?? dir.z).normalize();
  out.setFromUnitVectors(_z, _d);
  if (spin) out.multiply(_q2.setFromAxisAngle(_z, spin));
  return out;
}

function tintColor(tint, shade) {
  _c.set(tint ?? 0xffffff);
  if (shade != null) _c.multiplyScalar(shade);
  return _c.getHex();
}

/**
 * One cross-carded flower head. name: FLOWER_ATLAS flower name ('jasmine', 'jasmine_bud', 'marigold',
 * 'rose_red', 'rose_white', 'chrys_white', 'chrys_yellow', 'crown_purple', 'crown_white', 'frangipani',
 * 'lotus', 'lotus_bud', 'orchid', 'leaves', 'buds', 'petals').
 * o: { p:[x,y,z] head centre, dir:[x,y,z] facing (flower axis), size (m), wilted, spin (rad), tint, shade,
 *      sides=2 (three-quarter cards through the axis), face=true }.
 */
export function flowerHead(k, name, o = {}) {
  const m = flowerMat();
  const size = o.size ?? 0.04;
  const dir = o.dir ?? [0, 1, 0];
  const spin = o.spin ?? 0;
  const color = tintColor(o.tint, o.shade);
  const front = flowerCell(name, 'front', !!o.wilted);
  const side = flowerCell(name, 'side', !!o.wilted);
  if (front && o.face !== false) {
    k.add(m, cardGeo(front, 'center', 0.14), { p: o.p, r: orient(dir, spin, _q).clone(), s: size, color, w: false, uv: 'keep' });
  }
  const nSides = o.sides ?? 2;
  if (side && nSides > 0) {
    // three-quarter cards: planes that contain the flower axis, the card's up = the axis
    _d.set(dir[0] ?? dir.x, dir[1] ?? dir.y, dir[2] ?? dir.z).normalize();
    for (let i = 0; i < nSides; i++) {
      const a = spin + (i * Math.PI) / nSides;
      // basis: card up (+Y) -> axis, card normal (+Z) -> a direction perpendicular to the axis
      const up = _d.clone();
      const ref = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(ref, up).normalize();
      const t2 = new THREE.Vector3().crossVectors(up, t1).normalize();
      const nrm = t1.multiplyScalar(Math.cos(a)).add(t2.multiplyScalar(Math.sin(a))).normalize();
      const xAxis = new THREE.Vector3().crossVectors(up, nrm).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, nrm));
      k.add(m, cardGeo(side, 'head', 0.08), { p: o.p, r: q, s: size * 1.05, color, w: false, uv: 'keep' });
    }
  }
}

/** A single card standing / hanging at p: name + view ('side' default), anchor 'bottom' | 'top' | 'center'. */
export function flowerCard(k, name, o = {}) {
  const cell = flowerCell(name, o.view ?? 'side', !!o.wilted);
  if (!cell) return;
  const r = o.q || (o.dir ? orient(o.dir, o.spin ?? 0, new THREE.Quaternion()) : o.r);
  k.add(flowerMat(), cardGeo(cell, o.anchor ?? 'bottom', o.curl ?? 0.08), {
    p: o.p, r, s: o.size ?? 0.05, color: tintColor(o.tint, o.shade), w: false, uv: 'keep',
  });
}

/** Satin ribbon tail hanging from p (two crossed cards). colour: 'red'|'white'|'yellow'|'purple' or a hex tint on white. */
export function ribbonTail(k, o = {}) {
  const named = typeof o.color === 'string' && ['red', 'white', 'yellow', 'purple'].includes(o.color);
  const name = named ? 'ribbon_' + o.color : 'ribbon_white';
  const tint = named ? 0xffffff : o.color ?? 0xffffff;
  const len = o.len ?? 0.12;
  const yaw = o.yaw ?? 0;
  for (let i = 0; i < 2; i++) {
    const cell = flowerCell(name, i ? 'side' : 'front');
    if (!cell) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tilt ?? 0, yaw + i * 1.2, (o.swing ?? 0) * (i ? -1 : 1)));
    k.add(flowerMat(), cardGeo(cell, 'top', 0), { p: o.p, r: q, s: len, color: tint, w: false, uv: 'keep' }); // card is 1 unit tall
  }
}

/** Pick an atlas flower for an arbitrary tint (wreath palettes etc.): {name, tint}. */
export function flowerForColor(hex, kind = 'chrys') {
  _c.set(hex);
  const hsl = {};
  _c.getHSL(hsl);
  if (hsl.l > 0.78 || hsl.s < 0.18) return { name: kind === 'chrys' ? 'chrys_white' : 'jasmine', tint: 0xffffff };
  const h = hsl.h * 360;
  if (h >= 40 && h < 70) return { name: 'chrys_yellow', tint: 0xffffff };
  if (h >= 18 && h < 40) return { name: 'marigold', tint: 0xffffff };
  if (h < 18 || h > 330) return { name: hsl.l < 0.35 ? 'rose_red' : 'rose_white', tint: hsl.l < 0.35 ? 0xffffff : hex };
  // purple / pink / blue: white chrysanthemum dyed with the colour (brightened)
  _c.offsetHSL(0, 0, 0.18);
  return { name: 'chrys_white', tint: _c.getHex() };
}

/** Is this a wilted / dried tint (dark, low saturation brownish)? */
export function isWiltedColor(hex) {
  _c.set(hex);
  const hsl = {};
  _c.getHSL(hsl);
  return (hsl.l < 0.56 && hsl.s < 0.36) || hsl.l < 0.25;
}
