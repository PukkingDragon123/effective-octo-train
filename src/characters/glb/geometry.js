// Look geometry: hi (or lo) body + fitted clothing shells + skirt + hair merged into ONE
// skinned BufferGeometry (one draw call), cached by geometry key and shared by every character
// with the same shape. Attribute `apart`: 0 body, 1 clothing shell, 2 hair.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHairGeometry } from './hair.js';
import { geometryKey } from './look.js';

const cache = new Map();

function withPart(g, part) {
  const c = g.clone();
  const n = c.attributes.position.count;
  c.setAttribute('apart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'afat', 'apart'].includes(k)) c.deleteAttribute(k);
  if (c.attributes.skinIndex.array instanceof Uint16Array === false) c.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(c.attributes.skinIndex.array), 4));
  return c;
}

/** skirt_knee stretched to mid-calf with a little flare (long dress / shroud) */
function longSkirt(t) {
  if (t._skirtLong) return t._skirtLong;
  const g = t.geos.skirt_knee.clone();
  const p = g.attributes.position;
  const waist = t.yOf(1.0), hemK = t.yOf(0.47), hemL = t.yOf(0.2);
  const k = (waist - hemL) / (waist - hemK);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y >= waist) continue;
    const f = (waist - y) / (waist - hemK);
    p.setY(i, waist - (waist - y) * k);
    const fl = 1 + 0.12 * f * f;
    p.setX(i, p.getX(i) * fl);
    p.setZ(i, (p.getZ(i) + 0.01) * fl - 0.01);
  }
  g.computeVertexNormals();
  t._skirtLong = g;
  return g;
}

export function shellKeys(look) {
  const o = look.outfit;
  const keys = [];
  if (o.top) keys.push('shell_top_' + o.top);
  if (o.sleeve) keys.push('shell_sleeve_' + o.sleeve);
  const b = o.bottom;
  if (b === 'trousers' || b === 'knee' || b === 'shorts' || b === 'loose') keys.push('shell_bot_' + b);
  else if (b === 'skirt_knee' || b === 'skirt_wrap' || b === 'skirt_wrapknee') keys.push(b);
  else if (b === 'skirt_long') keys.push('skirt_long');
  if (o.shoes === 'shoes' || o.shoes === 'school') keys.push('shell_shoe');
  return keys;
}

export function acquireLookGeometry(t, look, lod = 'hi') {
  const key = t.sex + '|' + geometryKey(look, lod);
  let e = cache.get(key);
  if (e) { e.refs++; return e; }
  const parts = [withPart(lod === 'lo' ? t.geos.body_lo : t.geos.body_hi, 0)];
  if (lod !== 'lo') {
    for (const k of shellKeys(look)) {
      const g = k === 'skirt_long' ? longSkirt(t) : t.geos[k];
      if (g) parts.push(withPart(g, 1));
    }
  } else {
    // far LOD: keep the skirt silhouette only
    for (const k of shellKeys(look)) if (k.startsWith('skirt')) parts.push(withPart(k === 'skirt_long' ? longSkirt(t) : t.geos[k], 1));
  }
  const hair = buildHairGeometry(t, look);
  if (hair) parts.push(hair);
  for (const p of parts) if (!p.attributes.normal) p.computeVertexNormals();
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, t.height * 0.5, 0), t.height * 0.9);
  geo.userData.tris = geo.index.count / 3;
  e = { geo, refs: 1, key };
  cache.set(key, e);
  return e;
}
export function releaseLookGeometry(e) {
  if (!e) return;
  if (--e.refs <= 0) { e.geo.dispose(); cache.delete(e.key); }
}
export function geometryStats() {
  return { looks: cache.size };
}
