// Supernatural creatures, folklore entities and animals (contract: docs/ARCHITECTURE.md "creatures").
//
// Humanoid entities are built on the characters system (painted faces, eyes, hair springs,
// clothing, IK, the ghost deformation layer and gore); everything else is SDF-sculpted, surface-
// netted and skinned here (sculpt.js) with rest-space triplanar painted detail (skin.js).
// Every factory returns an Entity { root, update(dt), dispose(), ...behaviour }. Entities run
// themselves every frame (engine order 22); `update()` is a no-op kept for the contract.
//
//   createYaiSpeed()     ยายสปีด: runAlongside(taxi, 'L'|'R', {along, lat}), setAlong(z), turnHead(on),
//                        landOnHood(taxi), throwOff(taxi), passAndVanish(), stop(), setGaze(target)
//   createKrasue()       กระสือ: floatTo(pos, speed) -> Promise, placeHead(pos), notice(target), setGlow(v), flee(dir)
//   createKrahang()      กระหัง: flyPath(points, speed) -> Promise, vanish()
//   createNangTani()     นางตานี: appear(), vanish(), gaze(target), beckon(target), setGlow(v)
//   createWireCrawler()  crawlAlong(points, speed, {from, to}) -> Promise, vanish()
//   createForestGiant()  walkPast(from, to, duration) -> Promise, catchLight(seconds), vanish()
//   createGiantHand({scale})  rise(duration), grab(target, {height, from, lift, sink, humanoid}), sink(), release()
//   createPhiTaiHong({sex})   crouch(), rise(target), walkBroken(to), vanish()
//   createWindowGhost({spec}) perform(kind, opts): upsideDownHead fingersDoorFrame faceAgainstGlass roofCrawler
//                        runBeside treeWatch standInRoad knockWindow; armThroughWindow(taxi, pane); stop()
//   createFaceRat()      หนูผีหน้าคน: hideAt(taxi, 'footwell'|'headrest'), leapAt({hold, exit}), vanish()
//   createEgretFlock(n)  dawn egrets: takeOff(origin, dir)
//   createAnimal('elephant'|'elephantCalf'|'dog', {tint, scale, groundFn})
//                        walkTo(pos,{speed,gait}), followPath(points,{speed}), follow(leader, offset), chase(obj,
//                        {speed, offset, until}), place(pos, yaw), lookAt(t), setGait(g), bark(n), trumpet(), rumble()
// Humanoid creatures expose `.humanoid` (setGhost / setGore / play / setLayer / createReflectionDouble).
// Requires `await loadCharacterAssets()` (done at boot) before creating the humanoid ones.
import { YaiSpeed } from './YaiSpeed.js';
import { Krasue } from './Krasue.js';
import { Krahang } from './Krahang.js';
import { NangTani } from './NangTani.js';
import { WireCrawler } from './WireCrawler.js';
import { ForestGiant } from './ForestGiant.js';
import { GiantHand } from './GiantHand.js';
import { PhiTaiHong } from './PhiTaiHong.js';
import { WindowGhost } from './WindowGhost.js';
import { createAnimal, Quadruped, DOG_COATS, animalGeometry } from './Animals.js';
import { createFaceRat, FaceRat, faceRatGeometry } from './FaceRat.js';
import { createEgretFlock, EgretFlock, egretGeometry } from './Birds.js';
import { HandRig, handGeometry } from './hand.js';
import { organGeometries } from './Krasue.js';
import { prebuildSculpts, nextSlice } from './sculpt.js';
import { detailTextureAsync } from './skin.js';
import { SPECS, human } from './humans.js';
import { paneFrame, panePoint, toBody, dirToBody, bodyOf, humanoidFacing } from './taxiGeo.js';

/** ยายสปีด — old grandmother who sprints beside cars. Methods: runAlongside(taxi, side:'L'|'R', opts), stop(), setGaze(target) */
export function createYaiSpeed(opts = {}) {
  return new YaiSpeed(opts);
}
/** กระสือ — floating woman's head with glowing dangling entrails. Methods: floatTo(pos), setGlow(v) */
export function createKrasue(opts = {}) {
  return new Krasue(opts);
}
/** กระหัง — man flying with rice-winnowing-basket wings and a pestle tail. Methods: flyPath(points, speed) */
export function createKrahang(opts = {}) {
  return new Krahang(opts);
}
/** นางตานี — woman in green sabai under banana trees (feet don't touch the ground). */
export function createNangTani(opts = {}) {
  return new NangTani(opts);
}
/** Long-limbed thing that crawls along electrical wires. Methods: crawlAlong(curvePoints, speed) */
export function createWireCrawler(opts = {}) {
  return new WireCrawler(opts);
}
/** Something enormous moving between trees (seen briefly in streetlight). Methods: walkPast(from, to, duration) */
export function createForestGiant(opts = {}) {
  return new ForestGiant(opts);
}
/** The gigantic ghostly hand at ศาลเจ้ามารวย. Methods: rise(duration) -> Promise, grab(targetObject3D) -> Promise, sink() */
export function createGiantHand(opts = {}) {
  return new GiantHand(opts);
}
/** ผีตายโหง — violent-death ghost at the accident site (broken, wet, twitching). */
export function createPhiTaiHong(opts = {}) {
  return new PhiTaiHong(opts);
}
/** Generic window-scare puppet: a ghost humanoid driven by scripted procedural behaviours
 *  (upside-down head at windshield, fingers on the door frame, face pressed to glass, roof crawler). */
export function createWindowGhost(opts = {}) {
  return new WindowGhost(opts);
}

/**
 * Build the sculpted geometries and their detail textures ahead of time so the first elephant / dog /
 * hand / face rat / egret / krasue never hitches a frame. Every SDF build and texture runs in ~4 ms
 * slices between rendered frames (sculpt.js prebuildSculpts, skin.js detailTextureAsync); only the
 * cheap entity assembly (materials, rigs) runs whole, once per kind, to warm the rest.
 * kinds: subset of ['hand','dog','rat','elephant','elephantCalf','egret','krasue'].
 */
export async function prewarmCreatures(kinds = ['hand', 'dog', 'rat', 'elephant', 'elephantCalf', 'egret', 'krasue']) {
  const geo = {
    hand: () => handGeometry({ fingerScale: 1.32, bony: 0.8, nails: 0.17, forearm: 2.6, thickness: 0.88, cell: 0.026 }),
    dog: () => animalGeometry('dog'), elephant: () => animalGeometry('elephant'), elephantCalf: () => animalGeometry('elephantCalf'),
    rat: () => faceRatGeometry(), egret: () => egretGeometry(), krasue: () => organGeometries(),
  };
  const detail = { hand: ['ghostSkin'], dog: ['fur'], elephant: ['hide'], elephantCalf: ['hide'], rat: ['fur', 'ghostSkin'], krasue: ['organ'] };
  for (const k of kinds) {
    try {
      for (const d of detail[k] || []) await detailTextureAsync(d);
      if (geo[k]) await prebuildSculpts(geo[k]);
      await nextSlice();
      // the rest of the entity (materials, rig, textures painted on canvases) is light: warm it once
      if (k === 'dog' || k === 'elephant' || k === 'elephantCalf') createAnimal(k).dispose();
      else if (k === 'rat') createFaceRat().dispose();
      else if (k === 'egret') createEgretFlock(1).dispose();
    } catch (e) {
      console.warn('[creatures] prewarm', k, e);
    }
  }
}

export { createAnimal, createFaceRat, createEgretFlock, EgretFlock, Quadruped, FaceRat, DOG_COATS, HandRig, handGeometry, SPECS as CREATURE_SPECS, human as createCreatureHumanoid };
export { paneFrame, panePoint, toBody, dirToBody, bodyOf, humanoidFacing };
export { YaiSpeed, Krasue, Krahang, NangTani, WireCrawler, ForestGiant, GiantHand, PhiTaiHong, WindowGhost };
