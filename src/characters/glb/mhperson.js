// Runtime MakeHuman-lite: builds a person (body shape, joints, fitted proxies, merged geometry, morph
// texture and a skeleton template compatible with the rest of the GLB character code) from a recipe
// (mhrecipe.js) and the pack (mhpack.js).
//
//   positions  P = B0 + Σ w_k (B_k - B0) + Σ face axes          (bodies are T-posed MakeHuman bodies)
//   joints     J = Σ w_k J_k                                     (Quaternius names, T-pose rest)
//   proxies    p = Σ bw_j P[bi_j] + S ⊙ offset                   (MakeHuman mhclo-style fitting)
//   morphs     20 expression channels per vertex in a float texture (face / proxy vertices only)
//
// Rest orientations equal the Quaternius skeleton's for every person, so the CC0 Universal Animation
// Library clips play unchanged; only the pelvis translation track is scaled per person.
import * as THREE from 'three';
import { MH, arr } from './mhpack.js';
import { EXTRA_BONES } from './assets.js';
import { MORPH_CHANNELS, NCH, MORPH_TEX_W } from './mhmaterials.js';

const PART = { body: 0, shell: 1, hair: 2, brows: 3, lashes: 4, teeth: 5, tongue: 6, eyes: 7, veil: 8, lod: 0 };
const CH_SRC = {
  blinkL: ['fu:eyeBlinkLeft'], blinkR: ['fu:eyeBlinkRight'], wideL: ['fu:eyeWideLeft'], wideR: ['fu:eyeWideRight'],
  squintL: ['fu:eyeSquintLeft', 'fu:cheekSquintLeft'], squintR: ['fu:eyeSquintRight', 'fu:cheekSquintRight'],
  lidsDown: ['fu:eyeLookDownLeft', 'fu:eyeLookDownRight'], lidsUp: ['fu:eyeLookUpLeft', 'fu:eyeLookUpRight'],
  browInnerUp: ['fu:browInnerUp'], browDown: ['fu:browDownLeft', 'fu:browDownRight'], browOuterUp: ['fu:browOuterUpLeft', 'fu:browOuterUpRight'],
  jawOpen: ['fu:jawOpen'], smileL: ['fu:mouthSmileLeft'], smileR: ['fu:mouthSmileRight'], frown: ['fu:mouthFrownLeft', 'fu:mouthFrownRight'],
  stretch: ['fu:mouthStretchLeft', 'fu:mouthStretchRight'], pucker: ['fu:mouthPucker'],
  sneer: ['fu:noseSneerLeft', 'fu:noseSneerRight', 'fu:mouthUpperUpLeft', 'fu:mouthUpperUpRight'],
  lowerDown: ['fu:mouthLowerDownLeft', 'fu:mouthLowerDownRight'], uncanny: ['ghost:uncanny'],
};

let D = null;
function dec() {
  if (D) return D;
  const m = MH.meta;
  D = {
    nb: m.nb,
    b0: arr(m.b0),
    b0j: arr(m.b0joints),
    body: { rv: arr(m.body.rv), uv: arr(m.body.uv), tris: arr(m.body.tris), base: arr(m.body.baseTris) },
    skinI: arr(m.skin.i),
    skinW: arr(m.skin.w),
    mask: arr(m.mask),
    bodies: {},
    morphs: {},
    proxies: {},
    chan: null,
  };
  return D;
}
function bodyData(name) {
  const d = dec();
  if (d.bodies[name]) return d.bodies[name];
  const b = MH.meta.bodies[name];
  if (!b) return null;
  d.bodies[name] = { d: arr(b.d), s: b.s, j: arr(b.joints), height: b.height };
  return d.bodies[name];
}
function morphData(name) {
  const d = dec();
  if (name in d.morphs) return d.morphs[name];
  const m = MH.meta.morphs[name];
  d.morphs[name] = m ? { i: arr(m.i), d: arr(m.d), s: m.s } : null;
  return d.morphs[name];
}
function proxyData(key) {
  const d = dec();
  if (key in d.proxies) return d.proxies[key];
  const p = MH.meta.proxies[key];
  if (!p) return (d.proxies[key] = null);
  const uvq = arr(p.uv), bwq = arr(p.bw), offq = arr(p.off);
  const uv = new Float32Array(uvq.length);
  for (let i = 0; i < uv.length; i++) uv[i] = (uvq[i] / 65535) * 1.5 - 0.25;
  const bw = new Float32Array(bwq.length);
  for (let i = 0; i < bw.length; i++) bw[i] = bwq[i] / 65535;
  const off = new Float32Array(offq.length);
  for (let i = 0; i < off.length; i++) off[i] = offq[i] * p.offs;
  d.proxies[key] = { ...p, uvd: uv, bi: arr(p.bi), bwd: bw, offd: off, si: arr(p.si), sw: arr(p.sw), weld: arr(p.weld), trisA: arr(p.tris), hideA: p.hide ? arr(p.hide) : null };
  return d.proxies[key];
}
/** dense per-channel deltas over the base vertices (built once) */
function channels() {
  const d = dec();
  if (d.chan) return d.chan;
  d.chan = MORPH_CHANNELS.map((ch) => {
    const out = new Float32Array(d.nb * 3);
    for (const name of CH_SRC[ch] || []) {
      const m = morphData(name);
      if (!m) continue;
      for (let k = 0; k < m.i.length; k++) {
        const v = m.i[k] * 3;
        out[v] += m.d[k * 3] * m.s;
        out[v + 1] += m.d[k * 3 + 1] * m.s;
        out[v + 2] += m.d[k * 3 + 2] * m.s;
      }
    }
    return out;
  });
  return d.chan;
}

export function hasProxy(key) { return !!(MH.meta && MH.meta.proxies[key]); }

// ------------------------------------------------------------------------------------ positions
function positions(recipe) {
  const d = dec();
  const n3 = d.nb * 3;
  const P = Float32Array.from(d.b0);
  let sw = 0;
  for (const [, w] of recipe.bodies) sw += w;
  sw = sw || 1;
  for (const [name, w0] of recipe.bodies) {
    const b = bodyData(name);
    if (!b) continue;
    const k = (w0 / sw) * b.s;
    for (let i = 0; i < n3; i++) P[i] += b.d[i] * k;
  }
  for (const [axis, v] of Object.entries(recipe.face || {})) {
    if (!v) continue;
    const m = morphData('fa:' + axis + (v > 0 ? '+' : '-'));
    if (!m) continue;
    const k = Math.abs(v) * m.s;
    for (let j = 0; j < m.i.length; j++) {
      const o = m.i[j] * 3;
      P[o] += m.d[j * 3] * k;
      P[o + 1] += m.d[j * 3 + 1] * k;
      P[o + 2] += m.d[j * 3 + 2] * k;
    }
  }
  return P;
}
function jointsOf(recipe) {
  const d = dec();
  const J = new Float32Array(d.b0j.length);
  let sw = 0;
  for (const [, w] of recipe.bodies) sw += w;
  sw = sw || 1;
  let used = 0;
  for (const [name, w0] of recipe.bodies) {
    const b = bodyData(name);
    if (!b) continue;
    const w = w0 / sw;
    used += w;
    for (let i = 0; i < J.length; i++) J[i] += b.j[i] * w;
  }
  if (used < 0.999) for (let i = 0; i < J.length; i++) J[i] += d.b0j[i] * (1 - used);
  return J;
}

// ------------------------------------------------------------------------------------ proxies
function fitProxy(px, P) {
  const n = px.nv;
  const out = new Float32Array(n * 3);
  const S = [1, 1, 1];
  for (let ax = 0; ax < 3; ax++) {
    const pr = px.pairs[ax], ref = px.ref[ax];
    if (!pr || !(ref > 1e-4)) continue;
    const v = Math.abs(P[pr[0] * 3 + ax] - P[pr[1] * 3 + ax]) / ref;
    S[ax] = Math.min(2, Math.max(0.5, v));
  }
  const bi = px.bi, bw = px.bwd, off = px.offd;
  for (let i = 0; i < n; i++) {
    const a = bi[i * 3] * 3, b = bi[i * 3 + 1] * 3, c = bi[i * 3 + 2] * 3;
    const wa = bw[i * 3], wb = bw[i * 3 + 1], wc = bw[i * 3 + 2];
    for (let k = 0; k < 3; k++) out[i * 3 + k] = P[a + k] * wa + P[b + k] * wb + P[c + k] * wc + S[k] * off[i * 3 + k];
  }
  return out;
}
/** smooth normals (averaged across uv seams through the weld map) */
function normalsOf(pos, tris, weld, nWeld) {
  const acc = new Float32Array(nWeld * 3);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
    const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      const w = weld ? weld[v] : v;
      acc[w * 3] += nx; acc[w * 3 + 1] += ny; acc[w * 3 + 2] += nz;
    }
  }
  const n = pos.length / 3;
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const w = weld ? weld[v] : v;
    const x = acc[w * 3], y = acc[w * 3 + 1], z = acc[w * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    out[v * 3] = x / l; out[v * 3 + 1] = y / l; out[v * 3 + 2] = z / l;
  }
  return out;
}

// ------------------------------------------------------------------------------------ build
const personCache = new Map();

/**
 * Build (or fetch from cache) a person. recipe: { key, bodies:[[name,w]], face:{axis:v}, sex, hair, brows,
 * lashes, shells:[keys], veil:bool, uvRects }. Returns { key, P, J, t-ish data, geo, eyeGeo, morphTex, ... }.
 */
export function buildPerson(recipe) {
  const cached = personCache.get(recipe.key);
  if (cached) { cached.refs++; return cached; }
  const d = dec();
  const P = positions(recipe);
  const J = jointsOf(recipe);
  const chan = channels();
  const rects = MH.tex?.rects || {};
  // ---- parts to merge
  const parts = [];
  const hide = new Set();
  for (const key of recipe.shells || []) {
    const px = proxyData(key);
    if (!px) continue;
    parts.push({ key, px, part: px.part });
    if (px.hideA && !(recipe.keepSkin || []).includes(key)) for (const t of px.hideA) hide.add(t);
  }
  const headParts = [];
  if (recipe.hair && proxyData('hair_' + recipe.hair)) headParts.push({ key: 'hair_' + recipe.hair, px: proxyData('hair_' + recipe.hair), part: PART.hair });
  if (recipe.brows && proxyData('brows_' + recipe.brows)) headParts.push({ key: 'brows_' + recipe.brows, px: proxyData('brows_' + recipe.brows), part: PART.brows, rect: rects['brows_' + recipe.brows] });
  if (recipe.lashes && proxyData('lashes_' + recipe.lashes)) headParts.push({ key: 'lashes_' + recipe.lashes, px: proxyData('lashes_' + recipe.lashes), part: PART.lashes, rect: rects['lashes_' + recipe.lashes] });
  if (recipe.veil && proxyData('hair_veil')) headParts.push({ key: 'hair_veil', px: proxyData('hair_veil'), part: PART.veil });
  // teeth + tongue go LAST in the index buffer: a closed or distant mouth draws [0, mouthStart) only
  if (proxyData('teeth')) headParts.push({ key: 'teeth', px: proxyData('teeth'), part: PART.teeth, rect: rects.teeth, mouth: true });
  if (proxyData('tongue')) headParts.push({ key: 'tongue', px: proxyData('tongue'), part: PART.tongue, rect: rects.tongue, mouth: true });
  parts.push(...headParts);
  // ---- body
  const B = d.body;
  const nbv = B.rv.length;
  const keepTri = [];
  const ntri = B.tris.length / 3;
  for (let t = 0; t < ntri; t++) if (!hide.has(t)) keepTri.push(t);
  let total = nbv;
  for (const p of parts) total += p.px.nv;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const si = new Uint16Array(total * 4), swt = new Float32Array(total * 4);
  const apart = new Float32Array(total), amask = new Float32Array(total), amorph = new Float32Array(total).fill(-1);
  const index = [];
  // body normals on the base vertices (all body triangles, hidden ones included)
  const baseN = (() => {
    const acc = new Float32Array(d.nb * 3);
    const bt = B.base;
    for (let t = 0; t < bt.length; t += 3) {
      const a = bt[t], b = bt[t + 1], c = bt[t + 2];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const v of [a, b, c]) { acc[v * 3] += nx; acc[v * 3 + 1] += ny; acc[v * 3 + 2] += nz; }
    }
    return acc;
  })();
  // morph rows: collected per vertex (20 channels)
  const rows = [];
  const morphOf = (getDelta, vi) => {
    let any = false;
    const row = new Float32Array(NCH * 3);
    for (let c = 0; c < NCH; c++) {
      const dl = getDelta(chan[c]);
      row[c * 3] = dl[0]; row[c * 3 + 1] = dl[1]; row[c * 3 + 2] = dl[2];
      if (Math.abs(dl[0]) + Math.abs(dl[1]) + Math.abs(dl[2]) > 2e-6) any = true;
    }
    if (any) { amorph[vi] = rows.length; rows.push(row); }
  };
  const tmp = [0, 0, 0];
  for (let i = 0; i < nbv; i++) {
    const b = B.rv[i];
    pos[i * 3] = P[b * 3]; pos[i * 3 + 1] = P[b * 3 + 1]; pos[i * 3 + 2] = P[b * 3 + 2];
    const nx = baseN[b * 3], ny = baseN[b * 3 + 1], nz = baseN[b * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
    uv[i * 2] = B.uv[i * 2]; uv[i * 2 + 1] = B.uv[i * 2 + 1];
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = d.skinI[b * 4 + k]; swt[i * 4 + k] = d.skinW[b * 4 + k] / 255; }
    apart[i] = 0;
    amask[i] = d.mask[b];
    morphOf((ch) => { tmp[0] = ch[b * 3]; tmp[1] = ch[b * 3 + 1]; tmp[2] = ch[b * 3 + 2]; return tmp; }, i);
  }
  for (const t of keepTri) index.push(B.tris[t * 3], B.tris[t * 3 + 1], B.tris[t * 3 + 2]);
  // ---- proxies
  let base = nbv;
  const eyeFit = (() => { const px = proxyData('eyes'); return px ? { px, p: fitProxy(px, P) } : null; })();
  let mouthStart = -1;
  for (const pt of parts) {
    const px = pt.px;
    if (pt.mouth && mouthStart < 0) mouthStart = index.length;
    const fp = fitProxy(px, P);
    const nn = normalsOf(fp, px.trisA, px.weld, px.nv);
    const rect = pt.rect;
    for (let i = 0; i < px.nv; i++) {
      const v = base + i;
      pos[v * 3] = fp[i * 3]; pos[v * 3 + 1] = fp[i * 3 + 1]; pos[v * 3 + 2] = fp[i * 3 + 2];
      nor[v * 3] = nn[i * 3]; nor[v * 3 + 1] = nn[i * 3 + 1]; nor[v * 3 + 2] = nn[i * 3 + 2];
      let u = px.uvd[i * 2], w = px.uvd[i * 2 + 1];
      if (rect) { u = rect[0] + u * (rect[2] - rect[0]); w = rect[1] + w * (rect[3] - rect[1]); }
      uv[v * 2] = u; uv[v * 2 + 1] = w;
      for (let k = 0; k < 4; k++) { si[v * 4 + k] = px.si[i * 4 + k]; swt[v * 4 + k] = px.sw[i * 4 + k] / 255; }
      apart[v] = pt.part;
      // morph deltas through the binding (head proxies and shells near the face / neck)
      const a = px.bi[i * 3], b = px.bi[i * 3 + 1], c = px.bi[i * 3 + 2];
      const wa = px.bwd[i * 3], wb = px.bwd[i * 3 + 1], wc = px.bwd[i * 3 + 2];
      morphOf((ch) => {
        tmp[0] = ch[a * 3] * wa + ch[b * 3] * wb + ch[c * 3] * wc;
        tmp[1] = ch[a * 3 + 1] * wa + ch[b * 3 + 1] * wb + ch[c * 3 + 1] * wc;
        tmp[2] = ch[a * 3 + 2] * wa + ch[b * 3 + 2] * wb + ch[c * 3 + 2] * wc;
        return tmp;
      }, v);
    }
    const tr = px.trisA;
    for (let k = 0; k < tr.length; k++) index.push(tr[k] + base);
    base += px.nv;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(swt, 4));
  geo.setAttribute('apart', new THREE.BufferAttribute(apart, 1));
  geo.setAttribute('amask', new THREE.BufferAttribute(amask, 1));
  geo.setAttribute('amorph', new THREE.BufferAttribute(amorph, 1));
  geo.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  geo.userData.tris = index.length / 3;
  geo.userData.mouthStart = mouthStart < 0 ? index.length : mouthStart;
  // ---- morph texture
  let morphTex = null;
  if (rows.length) {
    const texels = rows.length * NCH;
    const H = Math.ceil(texels / MORPH_TEX_W);
    const data = new Float32Array(MORPH_TEX_W * H * 4);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < NCH; c++) {
        const k = (r * NCH + c) * 4;
        data[k] = row[c * 3]; data[k + 1] = row[c * 3 + 1]; data[k + 2] = row[c * 3 + 2];
      }
    }
    morphTex = new THREE.DataTexture(data, MORPH_TEX_W, H, THREE.RGBAFormat, THREE.FloatType);
    morphTex.minFilter = morphTex.magFilter = THREE.NearestFilter;
    morphTex.generateMipmaps = false;
    morphTex.needsUpdate = true;
  }
  // ---- eyes (separate draw: glossy material, eye bones)
  let eyeGeo = null, eyeCenters = null, eyeRadius = 0.0118;
  if (eyeFit) {
    const px = eyeFit.px, fp = eyeFit.p;
    const n = px.nv;
    // eyeball centres = bounding-box centres of each eyeball (the iris side is denser)
    const bl = new THREE.Box3(), br = new THREE.Box3(), _p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      _p.set(fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]);
      (_p.x >= 0 ? bl : br).expandByPoint(_p);
    }
    eyeCenters = [bl.isEmpty() ? new THREE.Vector3(0.032, 0, 0) : bl.getCenter(new THREE.Vector3()), br.isEmpty() ? new THREE.Vector3(-0.032, 0, 0) : br.getCenter(new THREE.Vector3())];
    if (!bl.isEmpty()) eyeRadius = (bl.max.x - bl.min.x) / 2;
    eyeGeo = new THREE.BufferGeometry();
    const uvE = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) uvE[i] = px.uvd[i];
    eyeGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    eyeGeo.setAttribute('normal', new THREE.BufferAttribute(normalsOf(fp, px.trisA, px.weld, n), 3));
    eyeGeo.setAttribute('uv', new THREE.BufferAttribute(uvE, 2));
    eyeGeo.setIndex(new THREE.BufferAttribute(Uint32Array.from(px.trisA), 1));
    eyeGeo.userData.side = Float32Array.from({ length: n }, (_, i) => (fp[i * 3] >= 0 ? 1 : -1));
  }
  const L = MH.meta.landmarks;
  const lm = {};
  for (const [k, v] of Object.entries(L)) lm[k] = new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  const person = { key: recipe.key, recipe, P, J, geo, eyeGeo, eyeCenters, eyeRadius, morphTex, lm, refs: 1, lo: null, bodyGeo: null, noMouth: null };
  personCache.set(recipe.key, person);
  return person;
}

export function releasePerson(person) {
  if (!person) return;
  if (--person.refs > 0) return;
  person.geo.dispose();
  person.noMouth?.dispose();
  person.eyeGeo?.dispose();
  person.lo?.dispose();
  person.bodyGeo?.dispose();
  person.morphTex?.dispose();
  personCache.delete(person.key);
}

/**
 * A view of a merged geometry without its trailing mouth range (teeth + tongue): shares every buffer
 * (no extra memory, no re-upload), only the draw range is shorter.
 */
export function noMouthView(geo) {
  const start = geo.userData.mouthStart;
  if (!(start >= 0) || start >= geo.index.count) return geo;
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index);
  g.setDrawRange(0, start);
  g.boundingSphere = geo.boundingSphere;
  g.boundingBox = geo.boundingBox;
  g.userData = { ...geo.userData, tris: start / 3, noMouth: true };
  // (released together with the person: disposing frees the shared GL buffers)
  return g;
}

/** the person's merged geometry without teeth / tongue (closed or distant mouth) */
export function personNoMouth(person) {
  if (!person.noMouth) person.noMouth = noMouthView(person.geo);
  return person.noMouth;
}

/** far LOD: the low-poly MakeHuman proxy body + the same clothes and hair (built on demand) */
export function personLod(person) {
  if (person.lo) return person.lo;
  const r = person.recipe;
  const key = r.sex === 'f' ? 'lod_f' : 'lod_m';
  const px = proxyData(key);
  if (!px) return (person.lo = person.geo);
  const parts = [{ px, part: 0 }];
  for (const k of r.shells || []) { const s = proxyData(k); if (s) parts.push({ px: s, part: s.part }); }
  if (r.hair && proxyData('hair_' + r.hair)) parts.push({ px: proxyData('hair_' + r.hair), part: 2 });
  let total = 0;
  for (const p of parts) total += p.px.nv;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const si = new Uint16Array(total * 4), swt = new Float32Array(total * 4), apart = new Float32Array(total), amask = new Float32Array(total), amorph = new Float32Array(total).fill(-1);
  const index = [];
  let base = 0;
  for (const pt of parts) {
    const fp = fitProxy(pt.px, person.P);
    const nn = normalsOf(fp, pt.px.trisA, pt.px.weld, pt.px.nv);
    pos.set(fp, base * 3);
    nor.set(nn, base * 3);
    for (let i = 0; i < pt.px.nv; i++) {
      uv[(base + i) * 2] = pt.px.uvd[i * 2]; uv[(base + i) * 2 + 1] = pt.px.uvd[i * 2 + 1];
      for (let k = 0; k < 4; k++) { si[(base + i) * 4 + k] = pt.px.si[i * 4 + k]; swt[(base + i) * 4 + k] = pt.px.sw[i * 4 + k] / 255; }
      apart[base + i] = pt.part;
    }
    for (let k = 0; k < pt.px.trisA.length; k++) index.push(pt.px.trisA[k] + base);
    base += pt.px.nv;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(swt, 4));
  g.setAttribute('apart', new THREE.BufferAttribute(apart, 1));
  g.setAttribute('amask', new THREE.BufferAttribute(amask, 1));
  g.setAttribute('amorph', new THREE.BufferAttribute(amorph, 1));
  g.setIndex(total > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  g.userData.tris = index.length / 3;
  person.lo = g;
  return g;
}

/** body-only bind geometry (model space) for the head-surface sampling of hair.js / accessories.js */
export function personBodyGeometry(person) {
  if (person.bodyGeo) return person.bodyGeo;
  const d = dec();
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(d.nb * 3);
  pos.set(person.P);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(d.body.base), 1));
  person.bodyGeo = g;
  return g;
}

// ------------------------------------------------------------------------------------ skeleton template
const _q = new THREE.Quaternion();

function computeRestWorld(t) {
  const n = t.names.length;
  t.Gq = new Array(n);
  t.Gp = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = t.parent[i];
    if (p < 0) { t.Gq[i] = t.restQuat[i].clone(); t.Gp[i] = t.restPos[i].clone(); }
    else {
      t.Gq[i] = t.Gq[p].clone().multiply(t.restQuat[i]);
      t.Gp[i] = t.restPos[i].clone().multiply(t.restScale[p]).applyQuaternion(t.Gq[p]).add(t.Gp[p]);
    }
  }
}

const interp = (p, x) => {
  let i = 0;
  while (i < p.length - 2 && x > p[i + 1][0]) i++;
  const [x0, y0] = p[i], [x1, y1] = p[i + 1];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
};

/**
 * Skeleton template for a person (same fields as assets.js templates: names, parent, index, rest TRS,
 * Gp/Gq, boneInverses, eyes, face landmarks, height, yref/yOf, clips, geos.body_hi).
 */
export function personTemplate(person, sharedClipsFn) {
  if (person.t) return person.t;
  const meta = MH.meta;
  const names = meta.bones.names.slice();
  const parent = meta.bones.parent.slice();
  const index = {};
  names.forEach((n, i) => (index[n] = i));
  const gq = meta.bones.gq.map((q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]));
  const gp = names.map((_, i) => new THREE.Vector3(person.J[i * 3], person.J[i * 3 + 1], person.J[i * 3 + 2]));
  const restQuat = [], restPos = [], restScale = [];
  for (let i = 0; i < names.length; i++) {
    const p = parent[i];
    if (p < 0) { restQuat.push(gq[i].clone()); restPos.push(gp[i].clone()); }
    else {
      const inv = gq[p].clone().invert();
      restQuat.push(inv.clone().multiply(gq[i]));
      restPos.push(gp[i].clone().sub(gp[p]).applyQuaternion(inv));
    }
    restScale.push(new THREE.Vector3(1, 1, 1));
  }
  const r = person.recipe;
  const t = { sex: r.sex, id: person.key, isMH: true, names, parent, index, restPos, restQuat, restScale };
  computeRestWorld(t);
  // ---- landmarks
  const lm = person.lm;
  const eyeC = person.eyeCenters || [new THREE.Vector3(0.032, lm.brow.y - 0.02, lm.brow.z - 0.012), new THREE.Vector3(-0.032, lm.brow.y - 0.02, lm.brow.z - 0.012)];
  t.eyeRadius = person.eyeRadius;
  t.eyeCenters = [eyeC[0].clone(), eyeC[1].clone()];
  t.eyes = t.eyeCenters.map((c) => new THREE.Vector3(c.x, c.y, c.z + t.eyeRadius * 0.92));
  t.eyeMid = t.eyes[0].clone().add(t.eyes[1]).multiplyScalar(0.5);
  t.iod = Math.abs(t.eyes[0].x - t.eyes[1].x);
  t.height = lm.top.y;
  t.headTop = t.height - t.Gp[index.Head].y;
  const mouthY = (lm.upperLipEdge.y + lm.lowerLipEdge.y) / 2;
  t.face = {
    eyeSurfaceZ: t.eyes[0].z + 0.0015,
    mouth: new THREE.Vector3(0, mouthY, Math.max(lm.upperLip.z, lm.lowerLip.z)),
    mouthHalfW: Math.abs(lm.mouthL.x - lm.mouthR.x) / 2,
    noseTip: lm.noseTip.clone(),
    chinY: lm.chin.y,
    lipTop: lm.upperLip.y,
    lipBot: lm.lowerLip.y,
    browY: lm.brow.y,
    top: lm.top.clone(),
    profile: [],
  };
  const G = (n) => t.Gp[index[n]];
  t.zpairs = [[G('foot_l').y, 0.075], [G('calf_l').y, 0.48], [G('thigh_l').y, 0.9], [G('spine_01').y, 1.05], [G('spine_03').y, 1.24],
    [G('upperarm_l').y, 1.405], [G('neck_01').y, 1.445], [G('Head').y, 1.555], [t.height, 1.784]];
  const inv = t.zpairs.map(([a, b]) => [b, a]);
  t.yref = (y) => interp(t.zpairs, y);
  t.yOf = (yr) => interp(inv, yr);
  t.headTable = [];
  t.torsoTable = [];
  // ---- helper bones (eyes, hair chains), placed in model space like assets.js
  const head = index.Head;
  const extra = [];
  for (const n of EXTRA_BONES) {
    const par = n === 'hair_2' ? index.hair_1 : n === 'hair_3' ? index.hair_2 : n === 'hairL_2' ? index.hairL_1 : n === 'hairR_2' ? index.hairR_1 : head;
    const i = names.length;
    names.push(n); parent.push(par); index[n] = i; extra.push(i);
    restPos.push(new THREE.Vector3()); restQuat.push(new THREE.Quaternion()); restScale.push(new THREE.Vector3(1, 1, 1));
  }
  computeRestWorld(t);
  const hp = t.Gp[head];
  const place = {
    eye_l: t.eyeCenters[0], eye_r: t.eyeCenters[1],
    hair_1: new THREE.Vector3(0, hp.y + 0.08, hp.z - 0.09), hair_2: new THREE.Vector3(0, hp.y - 0.06, hp.z - 0.12), hair_3: new THREE.Vector3(0, hp.y - 0.22, hp.z - 0.13),
    hairL_1: new THREE.Vector3(0.075, hp.y + 0.04, hp.z - 0.01), hairL_2: new THREE.Vector3(0.09, hp.y - 0.1, hp.z - 0.04),
    hairR_1: new THREE.Vector3(-0.075, hp.y + 0.04, hp.z - 0.01), hairR_2: new THREE.Vector3(-0.09, hp.y - 0.1, hp.z - 0.04),
  };
  for (const i of extra) {
    const wp = place[names[i]];
    const p = parent[i];
    const pq = extra.includes(p) ? new THREE.Quaternion() : t.Gq[p];
    const pp = extra.includes(p) ? place[names[p]] : t.Gp[p];
    restQuat[i].copy(pq).invert();
    restPos[i].copy(wp).sub(pp).applyQuaternion(restQuat[i]);
  }
  computeRestWorld(t);
  t.boneInverses = names.map((_, i) => new THREE.Matrix4().compose(t.Gp[i], t.Gq[i], new THREE.Vector3(1, 1, 1)).invert());
  // ---- eye skinning (eye bones by side)
  if (person.eyeGeo && !person.eyeGeo.attributes.skinIndex) {
    const side = person.eyeGeo.userData.side;
    const n = side.length;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = side[i] > 0 ? index.eye_l : index.eye_r; sw[i * 4] = 1; }
    person.eyeGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    person.eyeGeo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  t.geos = { body_hi: personBodyGeometry(person) };
  t.clips = sharedClipsFn(t);
  void _q;
  person.t = t;
  return t;
}
