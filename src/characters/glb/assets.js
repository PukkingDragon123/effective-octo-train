// GLB character assets: CC0 Quaternius "Universal Base Characters" bodies (processed for
// Hia Phat in Blender: hi/lo bodies, plane-cut clothing shells, atlas UVs, `_FAT` build
// attribute) and the CC0 Quaternius "Universal Animation Library" clips (anims.glb).
//
// loadTemplates() loads everything once and prepares one TEMPLATE per sex:
//   names / parent / rest TRS of the 65-bone UE-style skeleton (+ our helper bones),
//   normalized shared geometries (position, normal, uv, skinIndex, skinWeight, afat),
//   the face-subdivided hi body, retargeted AnimationClips (shared by every instance),
//   measured landmarks (eyes, head table, height mapping) from body_<sex>.json.
//
// Model space = glTF space: Y up, the character faces +Z, its left is +X (bones `_l`).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { subdivideRegion } from './subdivide.js';

export const EXTRA_BONES = ['eye_l', 'eye_r', 'hair_1', 'hair_2', 'hair_3', 'hairL_1', 'hairL_2', 'hairR_1', 'hairR_2'];

export const TEMPLATES = { m: null, f: null };
let _loading = null;

const assetURL = (p) => new URL(p, document.baseURI).href;

function loadGLB(path) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => loader.load(assetURL(path), resolve, undefined, reject));
}
async function loadJSON(path) {
  const r = await fetch(assetURL(path));
  if (!r.ok) throw new Error(`[characters-glb] ${path}: HTTP ${r.status}`);
  return r.json();
}

function interp(pairs, x) {
  const p = pairs;
  let i = 0;
  while (i < p.length - 2 && x > p[i + 1][0]) i++;
  const [x0, y0] = p[i], [x1, y1] = p[i + 1];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
}

/** fill zero radii (sparse sampling in the measurement) from neighbours */
function fillZeros(rows, c0, c1) {
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < rows.length; i++)
      for (let c = c0; c <= c1; c++) {
        if (rows[i][c] > 0) continue;
        const nb = [];
        if (c > c0 && rows[i][c - 1] > 0) nb.push(rows[i][c - 1]);
        if (c < c1 && rows[i][c + 1] > 0) nb.push(rows[i][c + 1]);
        if (i > 0 && rows[i - 1][c] > 0) nb.push(rows[i - 1][c]);
        if (i < rows.length - 1 && rows[i + 1][c] > 0) nb.push(rows[i + 1][c]);
        if (nb.length) rows[i][c] = nb.reduce((a, b) => a + b, 0) / nb.length;
      }
}

/** Copy the attributes we use into a fresh BufferGeometry with skin indices in template bone order. */
function normalizeGeometry(g, remap) {
  const out = new THREE.BufferGeometry();
  const n = g.attributes.position.count;
  out.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(g.attributes.position.array), 3));
  if (g.attributes.normal) out.setAttribute('normal', new THREE.Float32BufferAttribute(Float32Array.from(g.attributes.normal.array), 3));
  const uv = g.attributes.uv;
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv ? Float32Array.from(uv.array) : new Float32Array(n * 2), 2));
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const idx = si ? si.getComponent(i, k) : 0;
      SI[i * 4 + k] = remap ? remap[idx] ?? 0 : idx;
      const w = sw ? sw.getComponent(i, k) : k === 0 ? 1 : 0;
      SW[i * 4 + k] = w;
      s += w;
    }
    if (s > 0) for (let k = 0; k < 4; k++) SW[i * 4 + k] /= s;
  }
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  const fat = g.attributes._fat;
  out.setAttribute('afat', new THREE.Float32BufferAttribute(fat ? Float32Array.from(fat.array) : new Float32Array(n), 1));
  if (g.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  else out.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: n }, (_, i) => i), 1));
  if (!g.attributes.normal) out.computeVertexNormals();
  return out;
}

function worldPosOf(scene, name) {
  const o = scene.getObjectByName(name);
  if (!o) return new THREE.Vector3();
  scene.updateMatrixWorld(true);
  return o.getWorldPosition(new THREE.Vector3());
}

/** Retarget the UAL clips onto a template skeleton: q' = Rt · Rs⁻¹ · q (rest-pose delta, as Hia Phat);
 *  pelvis translation as a scaled delta from the source rest. Leaf and root tracks are dropped. */
function retargetClips(anims, t) {
  const src = new Map();
  anims.scene.traverse((o) => src.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() }));
  const ratio = t.Gp[t.index.pelvis].y / Math.max(0.1, worldPosOf(anims.scene, 'pelvis').y);
  const tq = new THREE.Quaternion(), sq = new THREE.Quaternion(), vq = new THREE.Quaternion();
  const clips = new Map();
  for (const clip of anims.animations) {
    const name = clip.name.replace(/_Armature$/, '');
    const tracks = [];
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.');
      const node = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
      if (!(node in t.index) || /leaf/.test(node) || node === 'root') continue;
      const s = src.get(node);
      if (prop === 'quaternion') {
        const vals = Float32Array.from(tr.values);
        if (s) {
          sq.copy(s.q).invert();
          tq.copy(t.restQuat[t.index[node]]).multiply(sq);
          for (let k = 0; k < vals.length; k += 4) {
            vq.set(vals[k], vals[k + 1], vals[k + 2], vals[k + 3]).premultiply(tq);
            vals[k] = vq.x; vals[k + 1] = vq.y; vals[k + 2] = vq.z; vals[k + 3] = vq.w;
          }
        }
        // constant tracks (2 identical keys) are dropped: the bone keeps its (possibly procedural) rest
        if (vals.length === 8 && Math.abs(vals[0] - vals[4]) + Math.abs(vals[1] - vals[5]) + Math.abs(vals[2] - vals[6]) + Math.abs(vals[3] - vals[7]) < 1e-6) {
          const r = t.restQuat[t.index[node]];
          if (Math.abs(Math.abs(r.x * vals[0] + r.y * vals[1] + r.z * vals[2] + r.w * vals[3]) - 1) < 1e-6) continue;
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, Float32Array.from(tr.times), vals));
      } else if (prop === 'position' && node === 'pelvis' && s) {
        const vals = Float32Array.from(tr.values);
        const rp = t.restPos[t.index.pelvis];
        for (let k = 0; k < vals.length; k += 3) {
          vals[k] = rp.x + (vals[k] - s.p.x) * ratio;
          vals[k + 1] = rp.y + (vals[k + 1] - s.p.y) * ratio;
          vals[k + 2] = rp.z + (vals[k + 2] - s.p.z) * ratio;
        }
        tracks.push(new THREE.VectorKeyframeTrack(tr.name, Float32Array.from(tr.times), vals));
      }
    }
    const c = new THREE.AnimationClip(name, clip.duration, tracks);
    c.optimize();
    clips.set(name, c);
  }
  return clips;
}

async function loadTemplate(sex, anims) {
  const [gltf, info] = await Promise.all([loadGLB(`assets/characters/body_${sex}.glb`), loadJSON(`assets/characters/body_${sex}.json`)]);
  gltf.scene.updateMatrixWorld(true);
  let skeleton = null;
  const meshes = [];
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      meshes.push(o);
      if (!skeleton) skeleton = o.skeleton;
    }
  });
  if (!skeleton) throw new Error('[characters-glb] no skeleton in body_' + sex);
  const names = skeleton.bones.map((b) => b.name);
  const index = {};
  names.forEach((n, i) => (index[n] = i));
  const parent = skeleton.bones.map((b) => (b.parent && b.parent.isBone ? names.indexOf(b.parent.name) : -1));
  const restPos = skeleton.bones.map((b) => b.position.clone());
  const restQuat = skeleton.bones.map((b) => b.quaternion.clone());
  const restScale = skeleton.bones.map((b) => b.scale.clone());
  // fold the armature node transform into the root bone
  const ri = parent.indexOf(-1);
  const arm = skeleton.bones[ri].parent;
  if (arm) {
    arm.updateMatrixWorld(true);
    const m = new THREE.Matrix4().compose(restPos[ri], restQuat[ri], restScale[ri]).premultiply(arm.matrixWorld);
    m.decompose(restPos[ri], restQuat[ri], restScale[ri]);
  }
  const t = { sex, info, names, parent, index, restPos, restQuat, restScale };
  // ---- helper bones (eyes, hair chains): appended after the template bones
  const head = index.Head;
  const extra = [];
  const addBone = (name, par) => {
    const i = names.length;
    names.push(name);
    parent.push(par);
    index[name] = i;
    extra.push(i);
    restPos.push(new THREE.Vector3());
    restQuat.push(new THREE.Quaternion());
    restScale.push(new THREE.Vector3(1, 1, 1));
    return i;
  };
  for (const n of EXTRA_BONES) {
    const par = n === 'hair_2' ? index.hair_1 : n === 'hair_3' ? index.hair_2 : n === 'hairL_2' ? index.hairL_1 : n === 'hairR_2' ? index.hairR_1 : head;
    addBone(n, par);
  }
  computeRestWorld(t);
  // place helper bones in model space, then convert to parent-local rest
  const headP = t.Gp[head];
  const eyeL = new THREE.Vector3().fromArray(info.eyes[0]);
  const eyeR = new THREE.Vector3().fromArray(info.eyes[1]);
  const top = info.height;
  const hc = headP.clone().add(new THREE.Vector3(0, 0.1, (info.headCenterZ || 0) - 0.01));
  const place = {
    eye_l: eyeL, eye_r: eyeR,
    hair_1: new THREE.Vector3(0, headP.y + 0.08, headP.z - 0.09),
    hair_2: new THREE.Vector3(0, headP.y - 0.06, headP.z - 0.12),
    hair_3: new THREE.Vector3(0, headP.y - 0.22, headP.z - 0.13),
    hairL_1: new THREE.Vector3(0.075, headP.y + 0.04, headP.z - 0.01),
    hairL_2: new THREE.Vector3(0.09, headP.y - 0.1, headP.z - 0.04),
    hairR_1: new THREE.Vector3(-0.075, headP.y + 0.04, headP.z - 0.01),
    hairR_2: new THREE.Vector3(-0.09, headP.y - 0.1, headP.z - 0.04),
  };
  void top; void hc;
  for (const i of extra) {
    const wp = place[names[i]];
    const p = parent[i];
    // local rest: identity world rotation (model axes) -> local q = Gq[p]^-1
    restQuat[i].copy(t.Gq[p]).invert();
    restPos[i].copy(wp).sub(t.Gp[p]).applyQuaternion(restQuat[i]);
  }
  computeRestWorld(t);
  t.boneInverses = names.map((_, i) => new THREE.Matrix4().compose(t.Gp[i], t.Gq[i], new THREE.Vector3(1, 1, 1)).invert());
  // ---- geometries
  const geos = {};
  for (const m of meshes) {
    const local = m.skeleton.bones.map((b) => index[b.name] ?? 0);
    const g = normalizeGeometry(m.geometry, local);
    if (!m.matrixWorld.equals(new THREE.Matrix4())) g.applyMatrix4(m.matrixWorld);
    g.computeBoundingSphere();
    geos[m.name] = g;
  }
  t.geos = geos;
  // ---- landmarks
  t.height = info.height;
  t.eyes = [eyeL, eyeR];
  t.eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5);
  t.iod = info.iod;
  t.zpairs = info.zmap.map(([z, yr]) => [z, yr]);
  t.yref = (y) => interp(t.zpairs, y); // model y -> 1.70 m reference y (painter coordinates)
  const inv = info.zmap.map(([z, yr]) => [yr, z]);
  t.yOf = (yr) => interp(inv, yr);
  const ht = info.headTable.map((r) => r.slice());
  fillZeros(ht, 2, 10);
  t.headTable = ht; // rows [ry (m above Head bone), cz (m, +forward), r(0°,22.5°..180°)]
  t.headTop = info.height - headP.y;
  // measured face landmarks (model space) for the face painter, shader masks and eye placement
  measureFace(t);
  // face-detail subdivision of the hi body (eyes, mouth, nose region)
  t.geos.body_hi = subdivideRegion(t.geos.body_hi, (p) => faceWeight(t, p), 2);
  // ---- clips
  t.clips = retargetClips(anims, t);
  return t;
}

function computeRestWorld(t) {
  const n = t.names.length;
  t.Gq = new Array(n);
  t.Gp = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = t.parent[i];
    if (p < 0) {
      t.Gq[i] = t.restQuat[i].clone();
      t.Gp[i] = t.restPos[i].clone();
    } else {
      t.Gq[i] = t.Gq[p].clone().multiply(t.restQuat[i]);
      t.Gp[i] = t.restPos[i].clone().multiply(t.restScale[p]).applyQuaternion(t.Gq[p]).add(t.Gp[p]);
    }
  }
}

/** 0..1 weight of the face detail area (eyes, nose, mouth) at a model-space point */
export function faceWeight(t, p) {
  const e = t.eyeMid;
  if (p.z < e.z - 0.03) return 0;
  const dx = Math.abs(p.x) / 0.07;
  const dy = (p.y - (e.y - 0.035)) / (p.y > e.y - 0.035 ? 0.065 : 0.07);
  const d = Math.sqrt(dx * dx + dy * dy);
  return d < 1 ? 1 : 0;
}

/** Ray-cast the hi body (bind pose) to find the skin surface in front of the eyes and mouth. */
function measureFace(t) {
  const g = t.geos.body_hi;
  const pos = g.attributes.position, idx = g.index.array;
  const ray = new THREE.Ray();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  const castZ = (x, y) => {
    ray.origin.set(x, y, 0.4);
    ray.direction.set(0, 0, -1);
    let best = -1;
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(pos, idx[i]);
      if (a.y < y - 0.03 || a.y > y + 0.03 || a.z < 0) continue;
      b.fromBufferAttribute(pos, idx[i + 1]);
      c.fromBufferAttribute(pos, idx[i + 2]);
      if (ray.intersectTriangle(a, b, c, false, hit) && hit.z > best) best = hit.z;
    }
    return best;
  };
  const e = t.eyes[0];
  t.face = {
    eyeSurfaceZ: castZ(e.x, e.y),
    profile: [],
  };
  // vertical profile at x=0 from chin to brow: find nose tip (max z) and mouth (concavity below nose)
  const prof = [];
  for (let y = e.y + 0.05; y > e.y - 0.13; y -= 0.002) prof.push([y, castZ(0, y), castZ(0.012, y)]);
  t.face.profile = prof;
  let nose = prof[0];
  for (const r of prof) if (r[0] < e.y - 0.01 && r[0] > e.y - 0.07 && r[1] > nose[1]) nose = r;
  t.face.noseTip = new THREE.Vector3(0, nose[0], nose[1]);
  // lips: the most forward point between nose base and chin, mouth line = deepest crease between lips
  const below = prof.filter((r) => r[0] < nose[0] - 0.012 && r[0] > nose[0] - 0.075);
  let lipTop = null, lipBot = null;
  // upper lip = first local max of z below the nose base, lower lip = next local max
  const maxima = [];
  for (let i = 1; i < below.length - 1; i++) if (below[i][1] >= below[i - 1][1] && below[i][1] >= below[i + 1][1]) maxima.push(below[i]);
  if (maxima.length >= 2) { lipTop = maxima[0]; lipBot = maxima[1]; }
  else if (maxima.length === 1) { lipTop = maxima[0]; lipBot = [maxima[0][0] - 0.01, maxima[0][1]]; }
  else { lipTop = [nose[0] - 0.022, nose[1] - 0.012]; lipBot = [nose[0] - 0.034, nose[1] - 0.016]; }
  let crease = lipTop;
  for (const r of below) if (r[0] < lipTop[0] && r[0] > lipBot[0] && r[1] < crease[1]) crease = r;
  if (crease === lipTop) crease = [(lipTop[0] + lipBot[0]) / 2, Math.min(lipTop[1], lipBot[1])];
  t.face.mouth = new THREE.Vector3(0, crease[0], Math.max(lipTop[1], lipBot[1]));
  t.face.lipTop = lipTop[0];
  t.face.lipBot = lipBot[0];
  // chin: lowest point with z > mouth z - 0.03 near x=0
  t.face.chinY = t.face.mouth.y - 0.045;
}

/** Load and prepare the GLB character assets once. Resolves to TEMPLATES ({m, f}). */
export function loadTemplates() {
  if (_loading) return _loading;
  _loading = (async () => {
    const anims = await loadGLB('assets/characters/anims.glb');
    const [m, f] = await Promise.all([loadTemplate('m', anims), loadTemplate('f', anims)]);
    TEMPLATES.m = m;
    TEMPLATES.f = f;
    return TEMPLATES;
  })();
  return _loading;
}

export function templateFor(sex) {
  const t = sex === 'f' ? TEMPLATES.f || TEMPLATES.m : TEMPLATES.m || TEMPLATES.f;
  if (!t) throw new Error('[characters-glb] call await loadCharacterAssets() before creating characters');
  return t;
}
