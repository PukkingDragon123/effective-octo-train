// Characters: procedural skinned humans, faces, IK and procedural animation
// (contract: docs/ARCHITECTURE.md "characters").
//
// Implementation lives in this directory:
//   SDF.js / Mesher.js / Decimate.js  sculpting primitives, surface nets, QEM decimation
//   Rig.js        proportions, skeleton layout, bone frames, FK
//   BodyBuilder.js / Clothing.js / Hands.js / Head.js / Face.js / Hair.js / Accessories.js  geometry & paint
//   IK.js / ProcAnim.js / Actions.js / Ghost.js  animation layers
//   Humanoid.js   the runtime character;  PlayerBody.js / PlayerController.js  first-person body
//   Presets.js    the passengers' appearance specs
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { Humanoid } from './Humanoid.js';
import { PlayerBody } from './PlayerBody.js';

/**
 * Appearance spec for createHumanoid (all optional):
 * { id, sex:'m'|'f', age: 6..90, height (m), build:'thin'|'average'|'heavy', skinTone: 0..1 (light..dark),
 *   hair: { style:'short'|'long'|'bob'|'bun'|'bald'|'shaved'|'gray-short'|'ponytail'|'messy'|'pompadour', color },
 *   outfit: { type:'tshirt-pants'|'shirt-slacks'|'dress'|'school-uniform'|'monk-robe'|'sabai'|'taxi-uniform'|
 *             'market-vendor'|'tank-sarong'|'hoodie-jeans'|'old-woman-sarong'|'farmer'|'shroud'|'tank-pants'|'singer'|'tshirt-shorts',
 *             top, bottom, accent, shoes:'sandals'|'shoes'|'barefoot', topStyle?, bottomStyle?, sleeve?, length? },
 *   accessories: ['glasses','cap','headscarf','garland','shoulder-bag','basket','amulet-necklace','helmet','cigarette','lunchbox','umbrella'],
 *   face: { seed, wrinkles 0..1, smile 0..1 (resting), eyeSize, noseWidth, jaw, cheek },
 *   ghost: { pale 0..1, eyes:'normal'|'black'|'white'|'glow', wet 0..1, decay 0..1, bloodStains 0..1 },
 *   quality: 0.5..1.5 (triangle budget scale), noBlink: bool }
 *
 * Humanoid API (see Humanoid.js): setMode, walkTo, lookAt, setHandTarget, setFootTarget, sitAt, detach,
 * setTalking, setExpression, setGhost, play, stop, setLayer, createReflectionDouble, setVisible, setOpacity,
 * update, dispose; extras: setGroundFn(fn), stopWalking(), double.setFollow(bool), double.setOverrides(o).
 */
export { Humanoid, PlayerBody };
export { PRESETS, PASSENGERS } from './Presets.js';

/** Create a character from an appearance spec (geometry cached per body-shape hash). */
export function createHumanoid(spec = {}) {
  return new Humanoid(spec);
}

/** Animals. kind: 'elephant'|'elephantCalf'|'dog'. -> { root, setGait('idle'|'walk'|'trot'|'run'), walkTo(pos, opts) -> Promise, lookAt(t), bark(), update(dt), dispose() } */
export function createQuadruped(kind, opts = {}) {
  const root = new THREE.Group();
  const s = kind === 'elephant' ? 3 : kind === 'elephantCalf' ? 1.5 : 0.6;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s * 0.6, s * 0.6, s), paintedMaterial({ color: 0x555555 }));
  m.position.y = s * 0.6;
  root.add(m);
  return { root, setGait() {}, walkTo(p) { root.position.copy(p); return Promise.resolve(); }, lookAt() {}, bark() {}, update() {}, dispose() { root.removeFromParent(); } };
}
