// GLB character system (alternative to the SDF characters in src/characters/*.js) with the
// same public API as the contract in src/characters/index.js.
//
//   await loadCharacterAssets();            // once at boot (loads + prepares the GLBs/clips)
//   const h = createHumanoidGLB(PRESETS.auntieSri);
//   const player = new PlayerBodyGLB();      // first-person body (PlayerBody API)
//
// Assets: CC0 Quaternius "Universal Base Characters" + "Universal Animation Library",
// processed for Hia Phat (docs/credits/characters.md). Everything else (faces, eyes, hair,
// fabrics, accessories, procedural animation layers) is generated in code here.
//   assets.js    GLB loading, templates, helper bones, clip retargeting, face subdivision
//   look.js      spec -> look (outfits, skin, hair, ghost)
//   atlas.js / face.js / painter.js / layout.js   painterly procedural textures
//   geometry.js / hair.js / eyes.js / accessories.js / subdivide.js   meshes
//   materials.js render's skinMaterial/paintedMaterial + face deformation, eyelids, twist
//   rig.js       per-instance skeleton, additive/world rotations, two-bone IK
//   anim.js      mixer modes / crossfades; actions.js procedural actions; ghost.js ghost layer
//   Humanoid.js  the runtime character; PlayerBody.js the first-person body
import * as THREE from 'three';
import { paintedMaterial } from '../../render/index.js';
import { loadTemplates, TEMPLATES } from './assets.js';
import { HumanoidGLB, LOD_DISTANCE } from './Humanoid.js';
import { PlayerBodyGLB } from './PlayerBody.js';
import { ACTIONS } from './actions.js';
import { OUTFIT_TYPES } from './look.js';

export { HumanoidGLB, PlayerBodyGLB, ACTIONS, OUTFIT_TYPES, LOD_DISTANCE, TEMPLATES };
export { PRESETS, PASSENGERS } from '../Presets.js';

/** Load and prepare the GLB bodies + animation clips (idempotent). */
export async function loadCharacterAssets() {
  await loadTemplates();
  return true;
}

/** Create a character from an appearance spec (same format as createHumanoid). Requires loadCharacterAssets(). */
export function createHumanoidGLB(spec = {}) {
  return new HumanoidGLB(spec);
}

/** Alias with the contract's name, so callers can swap modules: `import { createHumanoid } from './characters/glb/index.js'`. */
export const createHumanoid = createHumanoidGLB;

/** Animals (contract stub, unchanged from src/characters/index.js): elephant | elephantCalf | dog. */
export function createQuadruped(kind, opts = {}) {
  void opts;
  const root = new THREE.Group();
  const s = kind === 'elephant' ? 3 : kind === 'elephantCalf' ? 1.5 : 0.6;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s * 0.6, s * 0.6, s), paintedMaterial({ color: 0x555555 }));
  m.position.y = s * 0.6;
  root.add(m);
  return { root, setGait() {}, walkTo(p) { root.position.copy(p); return Promise.resolve(); }, lookAt() {}, bark() {}, update() {}, dispose() { root.removeFromParent(); } };
}
export const Humanoid = HumanoidGLB;
export const PlayerBody = PlayerBodyGLB;
