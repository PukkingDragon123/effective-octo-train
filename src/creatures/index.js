// Supernatural creatures & folklore entities built on top of characters/
// (contract: docs/ARCHITECTURE.md "creatures").
// STUB IMPLEMENTATION — implemented in a later phase; signatures must stay.
import * as THREE from 'three';
import { createHumanoid } from '../characters/index.js';

/** Every factory returns an Entity: { root, update(dt), dispose(), ...behaviour methods } */

/** ยายสปีด — old grandmother who sprints beside cars. Methods: runAlongside(taxi, side:'L'|'R', opts) , stop(), setGaze(target) */
export function createYaiSpeed(opts = {}) {
  const h = createHumanoid({ id: 'yaiSpeed', sex: 'f', age: 84, height: 1.45 });
  return { root: h.root, humanoid: h, runAlongside() {}, stop() {}, update() {}, dispose() { h.dispose(); } };
}
/** กระสือ — floating woman's head with glowing dangling entrails. Methods: floatTo(pos), setGlow(v) */
export function createKrasue(opts = {}) {
  const root = new THREE.Group();
  return { root, floatTo() {}, setGlow() {}, update() {}, dispose() { root.removeFromParent(); } };
}
/** กระหัง — man flying with rice-winnowing-basket wings and a pestle tail. Methods: flyPath(points, speed) */
export function createKrahang(opts = {}) {
  const root = new THREE.Group();
  return { root, flyPath() {}, update() {}, dispose() { root.removeFromParent(); } };
}
/** นางตานี — woman in green sabai under banana trees (feet don't touch the ground). */
export function createNangTani(opts = {}) {
  const h = createHumanoid({ id: 'nangTani', sex: 'f', age: 24 });
  return { root: h.root, humanoid: h, update() {}, dispose() { h.dispose(); } };
}
/** Long-limbed thing that crawls along electrical wires. Methods: crawlAlong(curvePoints, speed) */
export function createWireCrawler(opts = {}) {
  const root = new THREE.Group();
  return { root, crawlAlong() {}, update() {}, dispose() { root.removeFromParent(); } };
}
/** Something enormous moving between trees (seen briefly in streetlight). Methods: walkPast(from, to, duration) */
export function createForestGiant(opts = {}) {
  const root = new THREE.Group();
  return { root, walkPast() { return Promise.resolve(); }, update() {}, dispose() { root.removeFromParent(); } };
}
/** The gigantic ghostly hand at ศาลเจ้ามารวย. Methods: rise(duration) -> Promise, grab(targetObject3D) -> Promise, sink() */
export function createGiantHand(opts = {}) {
  const root = new THREE.Group();
  return { root, rise() { return Promise.resolve(); }, grab() { return Promise.resolve(); }, sink() { return Promise.resolve(); }, update() {}, dispose() { root.removeFromParent(); } };
}
/** ผีตายโหง — violent-death ghost at the accident site (broken, wet, twitching). */
export function createPhiTaiHong(opts = {}) {
  const h = createHumanoid({ id: 'phiTaiHong', sex: opts.sex || 'm', age: 30, ghost: { pale: 0.8, decay: 0.4, bloodStains: 0.6 } });
  return { root: h.root, humanoid: h, update() {}, dispose() { h.dispose(); } };
}
/** Generic window-scare puppet: a ghost humanoid driven by scripted procedural behaviours
 *  (upside-down head at windshield, fingers on the door frame, face pressed to glass, roof crawler). */
export function createWindowGhost(opts = {}) {
  const h = createHumanoid({ id: 'windowGhost', sex: opts.sex || 'f', age: 25, ghost: { pale: 0.9, eyes: 'black' } });
  return { root: h.root, humanoid: h, perform() { return Promise.resolve(); }, update() {}, dispose() { h.dispose(); } };
}
