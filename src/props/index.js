// Roadside props & set pieces (contract: docs/ARCHITECTURE.md "props").
//
// Every factory returns plain data: { object: THREE.Object3D, ...named local anchors }.
// Anchors are THREE.Object3D children of `object` (so they follow when the prop is placed),
// unless documented as Vector3 arrays. Common extra fields on most results:
//   colliders: [{x,z,r} | {x,z,hx,hz,yaw}]   local-space walk blockers (core/colliders)
//   lights:    [spec]                          ready for lightPool.add(spec) (spec.object = lamp anchor)
//   lightSpec: spec                            the main lamp's spec (same object as lights[0])
//   lampControllers: [{on, scale, kind}]       emissive-mesh flicker controllers (setLampOn)
//
// CONVENTIONS
// * Units metres, Y up. Every roadside prop's FRONT faces local +Z (the side you walk up
//   to / the road side). Use roadsideYaw(travelYaw, side) to turn it toward the road.
// * Lights are NOT registered automatically: the world (or caller) calls
//   addPropLights(result) when the prop is placed. Pass opts.lights === true to a factory
//   to register immediately.
// * Materials: all non-emissive materials are shared singletons with identical attribute
//   layouts (position, normal, uv, color, index), so the world may merge many props per
//   chunk by material. Emissive lamp meshes use per-lamp materials (flicker).
import * as THREE from 'three';
import { lightPool } from '../render/index.js';

export { createElectricPole, createWireSpan, createStreetlight, setLampOn, sampleCable } from './poles.js';
export {
  createSpiritHouse, createSala, createShrineMaRuay, createGarage, createBusStop, createNoodleStall, createBridge,
  createGuardrail, createBuddhaStatue, createForestTemple, createAccidentMemorial, createGhostGate, createVillageStop,
  createSignPost, createConvexMirror, createIncensePot, createPond, createClothWrap, createDressing,
} from './_stubs.js';
export { LIGHT_PRESETS, lightSpec, flickerValue } from './lib/lights.js';

/**
 * Yaw that turns a prop (front = local +Z) toward the road.
 * travelYaw: yaw of the road travel direction at the prop (local −Z along travel);
 * side: 'L' | 'R' (which road edge the prop stands on). 'C' -> travelYaw + PI (faces oncoming traffic).
 */
export function roadsideYaw(travelYaw, side) {
  if (side === 'L') return travelYaw - Math.PI / 2;
  if (side === 'R') return travelYaw + Math.PI / 2;
  return travelYaw;
}

/**
 * Register all lights of a prop result with the light pool (call after the prop is in the
 * scene graph and positioned). Returns the handles (also stored on result.lightHandles).
 */
export function addPropLights(result, pool = lightPool) {
  if (!result || !result.lights) return [];
  if (result.lightHandles) return result.lightHandles;
  result.lightHandles = result.lights.map((spec) => pool.add(spec));
  return result.lightHandles;
}

/** Remove lights, detach and dispose per-instance materials of a prop result. */
export function disposeProp(result) {
  if (!result) return;
  for (const h of result.lightHandles || []) h.remove?.();
  result.lightHandles = null;
  const obj = result.object || result;
  obj.parent?.remove(obj);
  obj.traverse?.((o) => {
    if (o.isMesh && o.material && o.material.userData?.perInstance) o.material.dispose();
    if (o.isMesh && o.geometry && o.geometry.userData?.perInstance) o.geometry.dispose();
  });
}

/** Names of all factories (used by the sandbox gallery). */
export const PROP_FACTORIES = [
  'createElectricPole', 'createWireSpan', 'createStreetlight', 'createSpiritHouse', 'createSala', 'createShrineMaRuay',
  'createGarage', 'createBusStop', 'createNoodleStall', 'createBridge', 'createGuardrail', 'createBuddhaStatue',
  'createForestTemple', 'createAccidentMemorial', 'createGhostGate', 'createVillageStop', 'createSignPost',
  'createConvexMirror', 'createIncensePot', 'createPond', 'createClothWrap', 'createDressing',
];

export const DRESSING_KINDS = [
  'plastic_chair', 'crate', 'garland', 'offering_tray', 'red_soda_bottles', 'zebra_statues', 'thai_dancer_figurine',
  'broken_scooter', 'water_jar', 'tire', 'sandbags', 'cone', 'trash_bag', 'shrine_table',
];

