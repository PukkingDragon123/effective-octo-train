// Shared vehicle materials (created lazily once) + per-instance emissive lens materials.
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { tex, signTex } from '../textures/index.js';
import * as VT from './VehicleTextures.js';

let shared = null;

function setIf(mat, key, val) {
  if (val && key in mat) mat[key] = val;
}

/** Materials shared by every taxi (body atlas is created by TaxiModel and passed in). */
export function sharedMaterials() {
  if (shared) return shared;
  const m = {};
  const T = (k, r) => {
    try {
      return tex(k, r ? { repeat: r } : {});
    } catch (e) {
      return null;
    }
  };
  m.blackTrim = paintedMaterial({ color: 0x141414, roughness: 0.62, map: T('rubber', [3, 3]), brush: 0.3, name: 'taxi_blacktrim' });
  m.rubber = paintedMaterial({ color: 0x0e0e0e, roughness: 0.85, map: T('rubber', [6, 6]), brush: 0.2, name: 'taxi_rubber' });
  m.chrome = paintedMaterial({ color: 0xb9b6ad, metalness: 0.72, roughness: 0.3, map: T('chrome_dirty', [2, 2]), brush: 0.25, name: 'taxi_chrome' });
  m.chromeDull = paintedMaterial({ color: 0x8c8a84, metalness: 0.6, roughness: 0.45, map: T('chrome_dirty', [3, 3]), brush: 0.3, name: 'taxi_chrome_dull' });
  m.underbody = paintedMaterial({ color: 0x1b1814, roughness: 0.95, map: T('rust', [4, 4]), brush: 0.5, name: 'taxi_under' });
  m.wheelWell = paintedMaterial({ color: 0x100e0c, roughness: 0.98, name: 'taxi_wheelwell' });
  m.tire = paintedMaterial({ map: VT.tireTex(), roughness: 0.92, brush: 0.3, name: 'taxi_tire' });
  m.tire.map.repeat.set(6, 1);
  m.sidewall = paintedMaterial({ map: VT.sidewallTex(), roughness: 0.9, brush: 0.3, name: 'taxi_sidewall' });
  m.drum = paintedMaterial({ color: 0x3a2a20, roughness: 0.9, metalness: 0.3, map: T('rust', [1, 1]), name: 'taxi_drum' });
  m.headliner = paintedMaterial({ color: 0xbfb39a, roughness: 0.97, map: T('headliner', [4, 4]), brush: 0.6, name: 'taxi_headliner' });
  m.pillarTrim = paintedMaterial({ color: 0x9c9384, roughness: 0.9, map: T('dash_plastic', [3, 3]), brush: 0.5, name: 'taxi_pillartrim' });
  m.lensClear = paintedMaterial({ color: 0xd8d6cf, roughness: 0.15, metalness: 0.1, name: 'taxi_lensclear' });
  m.darkMetal = paintedMaterial({ color: 0x24221f, roughness: 0.7, metalness: 0.4, map: T('rust', [2, 2]), name: 'taxi_darkmetal' });
  m.rust = paintedMaterial({ color: 0x8a5a3a, roughness: 0.95, map: T('rust', [2, 2]), name: 'taxi_rust' });
  m.plate = paintedMaterial({ map: plateTexture(), roughness: 0.55, brush: 0.3, name: 'taxi_plate' });
  m.cowl = paintedMaterial({ color: 0x151515, roughness: 0.75, map: T('rubber', [6, 2]), name: 'taxi_cowl' });
  m.trunkInside = paintedMaterial({ color: 0x2a2620, roughness: 0.98, map: T('carpet', [3, 3]), side: THREE.BackSide, name: 'taxi_trunkin' });
  const an = VT.maxAnisotropy();
  for (const k in m) {
    for (const slot of ['map', 'normalMap', 'roughnessMap']) {
      const t = m[k][slot];
      if (t && t.isTexture && t.anisotropy < an) {
        t.anisotropy = an;
        t.needsUpdate = true;
      }
    }
  }
  shared = m;
  return m;
}

function plateTexture() {
  try {
    const t = signTex('plate', { text: 'ทข 4521', province: 'กรุงเทพมหานคร' });
    if (t) return t;
  } catch (e) {
    /* fall through */
  }
  return VT.plateTexFallback();
}

/** Per-taxi emissive materials (lights are toggled independently per car). */
export function lensMaterials() {
  const head = paintedMaterial({ map: VT.headlightTex(), emissiveMap: VT.headlightTex(), emissive: 0xfff1d6, emissiveIntensity: 0, roughness: 0.18, metalness: 0.1, brush: 0.15, name: 'taxi_head' });
  const tl = VT.taillightTex();
  const tail = paintedMaterial({ map: tl, emissiveMap: tl, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.25, brush: 0.15, name: 'taxi_tail' });
  const reverse = paintedMaterial({ map: tl, emissiveMap: tl, emissive: 0xfff4e6, emissiveIntensity: 0, roughness: 0.25, brush: 0.15, name: 'taxi_reverse' });
  // separate materials (clone() would drop the painted shader patch)
  const ind = (name) => paintedMaterial({ map: tl, emissiveMap: tl, emissive: 0xffa21e, emissiveIntensity: 0, roughness: 0.25, brush: 0.15, name });
  const indL = ind('taxi_indL');
  const indR = ind('taxi_indR');
  const roofSign = paintedMaterial({ map: VT.roofSignTex(), emissiveMap: VT.roofSignTex(), emissive: 0xfff2d8, emissiveIntensity: 0, roughness: 0.4, brush: 0.2, name: 'taxi_roofsign' });
  const vacant = paintedMaterial({ map: VT.vacantTex(), emissiveMap: VT.vacantTex(), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3, brush: 0.1, name: 'taxi_vacant' });
  return { head, tail, reverse, indL, indR, roofSign, vacant };
}

export function bodyMaterial(atlas) {
  const m = paintedMaterial({ map: atlas.map, normalMap: atlas.normalMap, roughness: 1.0, metalness: 0.05, brush: 0.45, wet: 0.7, dirt: 0.2, name: 'taxi_body' });
  setIf(m, 'roughnessMap', atlas.roughnessMap);
  if (m.normalScale) m.normalScale.set(0.7, 0.7);
  return m;
}
