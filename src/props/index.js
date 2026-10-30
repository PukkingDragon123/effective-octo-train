// Roadside props & set pieces (contract: docs/ARCHITECTURE.md "props").
//
// Every factory returns plain data: { object: THREE.Object3D, ...named local anchors }.
// Anchors are THREE.Object3D children of `object` (so they follow when the prop is placed),
// unless documented as Vector3 arrays. Common extra fields on most results:
//   colliders:       [{x,z,r} | {x,z,hx,hz,yaw}]  local-space walk blockers (core/colliders)
//   lights:          [spec]   ready for lightPool.add(spec) (spec.object = lamp anchor, spec.height
//                             = lamp height above the prop's ground so ground pools land right)
//   lightSpec:       spec     the main lamp's spec (also in lights)
//   lampControllers: [{on, scale, kind, handle}]  emissive lamp-mesh flicker (setLampOn)
//   walkSurfaces:    [{x,z,hx,hz,yaw,y} | {ramp:true,...,y0,y1}]  raised floors (local) the
//                    on-foot controller can use for ground height (sala floor, shrine platform...)
//
// CONVENTIONS
// * Units metres, Y up, prop origin on the ground. Every roadside prop's FRONT faces local +Z
//   (the side you walk up to = the road side). roadsideYaw(travelYaw, side) turns it to the road.
//   Exceptions (documented per factory): poles/streetlights (wires along ±Z, lamp arm toward +X),
//   bridge (deck along Z, place at the road centre with yaw = travel yaw), ghost gate (spans X,
//   placed across the road), shrine Ma Ruay (origin = the fork point on the main road).
// * Lights are NOT registered automatically: call addPropLights(result) once the prop is placed
//   (or pass opts.lights === true to the factory). Emissive lamp meshes then follow the pooled
//   light's live flicker level; disposeProp(result) removes everything.
// * Small details (offerings, clutter) live in a THREE.LOD child that hides beyond ~30–45 m.
// * Materials: all non-emissive materials are shared singletons with identical attribute
//   layouts (position, normal, uv, color + index), so the world may merge props per chunk by
//   material. Emissive lamp meshes use per-lamp materials (flicker).
//
// FACTORIES (opts are all optional; seed makes each instance unique and deterministic)
// createElectricPole({seed, height=9, lean, transformer, lamp:null|'sodium'|'fluorescent'|'dying',
//     lampSide=+1, crossArms=2, telecom=true, meters, notices, stripes, coils})
//   -> {object, wireAnchors:Vector3[] (local), wireKinds:('hv'|'lv'|'tel')[], lampAnchor?, lightSpec?,
//       lights, colliders, transformerAnchor?, humAnchor, topAnchor, lampControllers}
// createWireSpan(anchorsA, anchorsB, {sag, seed, messy=1, kinds, drops, coils}) -> Object3D
//     (world/common space; userData.cables + userData.sample(i, t, out) for the wire crawler)
// connectPoles(poleA, poleB, opts) -> Object3D  (pairs anchors by kind, world space)
// createStreetlight({kind:'sodium'|'fluorescent'|'dying', height, seed, lean, broken})
//   -> {object, lampAnchor, lightSpec, lights, colliders, lampControllers}
// createSpiritHouse({style:'thai'|'chinese'|'twin', size=1, seed, offerings=true, age=0.7})
//   -> {object, incenseAnchor, candleAnchor, candleAnchors, offeringAnchor, smokeAnchor,
//       groundOfferingAnchor, lights, colliders}
// createSala({variant:1|2, seed}) -> {object, seats[], waitSpot, lampAnchor, lightSpec, lights,
//       colliders, shadowSpots[] (behind the back pillars), clockAnchor, floorHeight, walkSurfaces}
// createShrineMaRuay({setback=14, noseZ=-6, seed, lanternCount, handSpawn:[x,z]})
//   -> {object, statueAnchor, statueFaceAnchor, statueHead (swappable Group), altarAnchor,
//       lanternAnchors[], incenseAnchors[], smokeAnchors[], leftSignAnchor, rightSignAnchor,
//       handSpawnAnchor, burnerAnchor, furnaceAnchor, forecourtAnchor, colliders, lights,
//       footprint:{x,z,hx,hz}, walkSurfaces}
// createLanternString(a, b, {count, sag, white, size, lightEvery}) -> {object, lanternAnchors, lights}
// createGarage({seed}) -> {object, oldManSeat, guestSeat, taxiSpot (yaw: taxi faces the road),
//       bikeSpot, playerArrive, tableAnchor, keysAnchor, ashtrayAnchor, lampAnchor, lightSpec,
//       lights, colliders, altarAnchor, smokeAnchor, radioAnchor, fanAnchor, fanBlades, fanOn,
//       calendarAnchor, dogBowlAnchor, mosquitoCoilAnchor, lampControllers, walkSurfaces}
// createBusStop({seed}) -> {object, waitSpot, seats[], lampAnchor, lightSpec, lights, colliders}
// createNoodleStall({seed}) -> {object, vendorSpot, customerSpots[], counterAnchor, lampAnchor,
//       lampAnchors[], steamAnchor, tables[], lights, colliders}
// createBridge({width=7.4, length=26, depth=3.6, seed, broken}) -> {object, colliders, deckY,
//       railAnchors, nameAnchor}
// createGuardrail(points:Vector3[], {delineators=true, damaged, seed, postSpacing=4, height,
//       faceSide=+1, lampEvery=2}) -> {object, lampAnchors[], lights, colliders} (points' space)
// createBuddhaStatue({pose:'seated'|'standing', size, seed, broken, moss, offerings, sash})
//   -> {object, headAnchor, offeringAnchor, candleAnchors, lights, colliders}
// createForestTemple({seed, platformY=1.2}) -> {object, gateAnchor, waitSpot, bellAnchor,
//       buddhaAnchor, candleAnchors, lights, colliders, walkSurfaces}
// createAccidentMemorial({seed}) -> {object, waitSpot, helmetAnchor, helmet (Object3D),
//       candleAnchors, smokeAnchor, lights, colliders}
// createGhostGate({seed, width=9.5, height=5}) -> {object, walkTarget, gateCenter, lanternAnchors,
//       lights, colliders}
// createVillageStop({seed, houseDistance=24}) -> {object, walkTarget, waitSpot, windowAnchor,
//       lampAnchor, seats, lights, colliders}
// createSignPost(kind, {...signTex opts, seed, bent, age}) -> {object, signAnchor, colliders}
// createConvexMirror({seed, height, size}) -> {object, mirrorAnchor, mirror, colliders}
// createIncensePot({seed, size, stand, sticks, metal}) -> {object, smokeAnchor, colliders}
// createPond({seed, radius=6, lotus, reeds}) -> {object, waterMesh, waterLevel, colliders}
// createClothWrap(radius, y0, y1, {seed, colors, garland}) -> Object3D
// createDressing(kind, opts) -> {object, colliders, lights}  (kinds: DRESSING_KINDS + extras)
import { lightPool } from '../render/index.js';
import * as poles from './poles.js';
import * as shrines from './shrines.js';
import * as sala from './sala.js';
import * as maruay from './maruay.js';
import * as garage from './garage.js';
import * as roadside from './roadside.js';
import * as temple from './temple.js';
import * as pond from './pond.js';
import * as dressing from './dressing.js';

/** Wrap a factory so `opts.lights === true` registers its lights right away. */
function lit(fn, optsIndex = 0) {
  return (...args) => {
    const r = fn(...args);
    const o = args[optsIndex];
    if (o && o.lights === true && r && r.lights) addPropLights(r);
    return r;
  };
}

export const createElectricPole = lit(poles.createElectricPole);
export const createWireSpan = poles.createWireSpan;
export const connectPoles = poles.connectPoles;
export const createStreetlight = lit(poles.createStreetlight);
export const setLampOn = poles.setLampOn;
export const sampleCable = poles.sampleCable;
export const createSpiritHouse = lit(shrines.createSpiritHouse);
export const createIncensePot = shrines.createIncensePot;
export const createClothWrap = shrines.createClothWrap;
export const createSala = lit(sala.createSala);
export const createBusStop = lit(sala.createBusStop);
export const createShrineMaRuay = lit(maruay.createShrineMaRuay);
export const createLanternString = lit(maruay.createLanternString, 2);
export const createGarage = lit(garage.createGarage);
export const createNoodleStall = lit(roadside.createNoodleStall);
export const createBridge = roadside.createBridge;
export const createGuardrail = lit(roadside.createGuardrail, 1);
export const createSignPost = roadside.createSignPost;
export const createConvexMirror = roadside.createConvexMirror;
export const createAccidentMemorial = lit(roadside.createAccidentMemorial);
export const createGhostGate = lit(roadside.createGhostGate);
export const createVillageStop = lit(roadside.createVillageStop);
export const createBuddhaStatue = lit(temple.createBuddhaStatue);
export const createForestTemple = lit(temple.createForestTemple);
export const createPond = pond.createPond;
export const createDressing = lit(dressing.createDressing, 1);
export { LIGHT_PRESETS, lightSpec, flickerValue } from './lib/lights.js';

/**
 * Yaw that turns a prop (front = local +Z) toward the road.
 * travelYaw: yaw of the road travel direction at the prop (local −Z along travel, the
 * landmark `yaw`); side: 'L' | 'R' (the road edge the prop stands on);
 * 'C' -> travelYaw (the prop faces the oncoming traffic).
 */
export function roadsideYaw(travelYaw, side) {
  if (side === 'L') return travelYaw + Math.PI / 2;
  if (side === 'R') return travelYaw - Math.PI / 2;
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
  // emissive lamp meshes follow the pooled light's live flicker level
  for (const c of result.lampControllers || []) c.handle = result.lightHandles[c.lightIndex ?? 0] || null;
  return result.lightHandles;
}

/** Remove lights, detach and dispose geometries (+ per-instance materials) of a prop result. */
export function disposeProp(result) {
  if (!result) return;
  for (const h of result.lightHandles || []) h.remove?.();
  result.lightHandles = null;
  const obj = result.object || result;
  obj.parent?.remove(obj);
  obj.traverse?.((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose(); // kit output geometries are never shared between props
    if (o.material && o.material.userData?.perInstance) o.material.dispose();
  });
}

/** Names of all factories (used by the sandbox gallery). */
export const PROP_FACTORIES = [
  'createElectricPole', 'createWireSpan', 'createStreetlight', 'createSpiritHouse', 'createSala', 'createShrineMaRuay',
  'createGarage', 'createBusStop', 'createNoodleStall', 'createBridge', 'createGuardrail', 'createBuddhaStatue',
  'createForestTemple', 'createAccidentMemorial', 'createGhostGate', 'createVillageStop', 'createSignPost',
  'createConvexMirror', 'createIncensePot', 'createPond', 'createClothWrap', 'createDressing',
];

/** The contract's dressing kinds (createDressing also accepts the extras listed in dressing.js). */
export const DRESSING_KINDS = [
  'plastic_chair', 'crate', 'garland', 'offering_tray', 'red_soda_bottles', 'zebra_statues', 'thai_dancer_figurine',
  'broken_scooter', 'water_jar', 'tire', 'sandbags', 'cone', 'trash_bag', 'shrine_table',
];
