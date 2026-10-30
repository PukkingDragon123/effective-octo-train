// The KM 9 garage as a stage: the taxi waiting on the road in front of the open shop front,
// the single fluorescent tube, Ah Kong smoking beside the cab (or on his stool), mosquito-coil
// and altar smoke, moths at the tube. Shared by the intro, the garage, the tutorial and endings.
import * as THREE from 'three';
import { g } from '../context.js';
import { lm, wpos, wyaw, yawTo, garageTaxiPose, parkTaxi, taxiPoint, ground } from './common.js';

const _v = new THREE.Vector3();

/** Ah Kong standing at a world point, facing `yaw` (or a point). */
export function ahKongStand(pos, face) {
  const h = g.ahKong;
  if (!h) return;
  if (h._seated) h.detach(g.engine.scene);
  if (h.root.parent !== g.engine.scene) g.engine.scene.attach(h.root);
  h.stopWalking?.();
  h.setGroundFn?.((x, z) => ground(x, z));
  h.root.visible = true;
  h.setOpacity?.(1);
  const p = pos.clone();
  p.y = ground(p.x, p.z);
  h.root.position.copy(p);
  const yaw = typeof face === 'number' ? face : face ? yawTo(p, face) : 0;
  h.root.rotation.set(0, yaw, 0);
  h.setMode('stand');
}

/** Ah Kong on his stool by the table. */
export function ahKongSit() {
  const A = lm('garage')?.anchors || {};
  const h = g.ahKong;
  if (!h || !A.oldManSeat) return false;
  h.stopWalking?.();
  h.root.visible = true;
  h.sitAt(A.oldManSeat, { pose: 'sit', blend: 0.01 });
  return true;
}

/** Turn Ah Kong to face a point (stood). */
export function ahKongFace(p) {
  const h = g.ahKong;
  if (!h || h._seated) return;
  h.root.rotation.y = yawTo(h.root.position, p);
}

/**
 * Stage the garage. opts { ahKong: 'besideTaxi'|'stool'|'dark'|'none', interactions:bool }
 * -> { taxiPose, ahSpot (world), ahYaw }
 */
export function setupGarage(stage, opts = {}) {
  const G = lm('garage');
  const A = G?.anchors || {};
  const tp = garageTaxiPose();
  if (opts.parkTaxi !== false) parkTaxi(tp.pos, tp.yaw);
  g.taxi.setInteractionsEnabled(!!opts.interactions);
  // Ah Kong beside the cab on the garage side, near the rear door, facing back up the road
  const ahSpot = taxiPoint(-1.35, 0, 1.1, new THREE.Vector3());
  ahSpot.y = ground(ahSpot.x, ahSpot.z);
  const ahYaw = tp.yaw + Math.PI * 0.82;
  const where = opts.ahKong || 'besideTaxi';
  if (where !== 'keep') g.ahKong.root.visible = where !== 'none';
  if (where === 'stool' || where === 'dark') {
    if (!ahKongSit()) ahKongStand(ahSpot, ahYaw);
  } else if (where !== 'none' && where !== 'keep') ahKongStand(ahSpot, ahYaw);
  g.ahKong.setExpression?.({ smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 });
  // smoke and moths
  if (A.mosquitoCoilAnchor) stage.emit('incense', { object: A.mosquitoCoilAnchor, count: 30, intensity: 0.5 });
  if (A.smokeAnchor) stage.emit('incense', { object: A.smokeAnchor, count: 40, intensity: 0.7 });
  if (A.lampAnchor) stage.emit('moths', { object: A.lampAnchor, count: 18, radius: 0.9 });
  smokeRig(stage, g.ahKong);
  try {
    g.audio?.setEnvironment?.('garage');
  } catch (e) {
    /* ignore */
  }
  // the tube's hum
  if (A.lampAnchor) stage.loop('fluorescent_flicker', { object: A.lampAnchor, volume: 0.35 });
  return { taxiPose: tp, ahSpot, ahYaw, anchors: A };
}

/** Ah Kong's cigarette: smoke from the tip, a puff when he exhales, a drag every few seconds. */
export function smokeRig(stage, h, opts = {}) {
  if (!h) return;
  try {
    const cig = h.held?.cigarette?.mesh || h.holdItem?.('cigarette', 'R');
    if (cig) stage.emit('incense', { object: cig, count: 26, intensity: 0.55 });
  } catch (e) {
    /* held props optional */
  }
  const mouth = new THREE.Object3D();
  g.engine.scene.add(mouth);
  stage.add(() => mouth.removeFromParent());
  const puff = stage.emit('smoke', { object: mouth, count: 30, intensity: 0, radius: 0.06 });
  let puffT = 0;
  const prevExhale = h.onExhale;
  h.onExhale = () => {
    puffT = 1.6;
  };
  stage.add(() => {
    h.onExhale = prevExhale;
  });
  let next = opts.first ?? 2.5;
  stage.update((dt) => {
    if (!h.root.visible) return;
    mouth.position.copy(h.headPosition || h.root.position);
    _v.set(-Math.sin(h.root.rotation.y), 0, -Math.cos(h.root.rotation.y));
    mouth.position.addScaledVector(_v, 0.12);
    mouth.position.y -= 0.06;
    puffT = Math.max(0, puffT - dt);
    puff.setIntensity(puffT > 0 ? Math.min(1, puffT) : 0);
    next -= dt;
    if (next <= 0 && !h.anim?.talking && !g.dialogue?.busy) {
      next = 7 + Math.random() * 5;
      h.play?.('smoke')?.catch?.(() => {});
    }
  }, 22);
}

/** World pose helpers for the garage. */
export function garageAnchorPos(name, out = new THREE.Vector3()) {
  const a = lm('garage')?.anchors?.[name];
  return a ? wpos(a, out) : null;
}
export function garageFrontYaw() {
  const G = lm('garage');
  return G ? (G.yaw ?? 0) : 0;
}
export { wyaw };

/** Walk a humanoid to a world point around the parked taxi (never through it). -> Promise */
export async function walkAroundTaxi(h, target, timeout = 14) {
  const t = g.taxi;
  t.root.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(t.root.matrixWorld).invert();
  const a = h.root.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const b = target.clone().applyMatrix4(inv);
  const pts = [];
  const insideZ = (z) => z > -2.6 && z < 2.6;
  if (Math.sign(a.x) !== Math.sign(b.x) && (insideZ(a.z) || insideZ(b.z))) {
    // round the nearer end of the car
    const zEnd = a.z + b.z > -0.4 ? 3.0 : -3.1;
    pts.push(new THREE.Vector3(Math.sign(a.x) * 1.45, 0, zEnd), new THREE.Vector3(Math.sign(b.x) * 1.45, 0, zEnd));
  }
  pts.push(b);
  const deadline = g.engine.time + timeout;
  for (const p of pts) {
    const w = p.clone().applyMatrix4(t.root.matrixWorld);
    w.y = ground(w.x, w.z);
    const left = Math.max(0.5, deadline - g.engine.time);
    await Promise.race([h.walkTo(w), new Promise((r) => setTimeout(r, left * 1000))]);
  }
}

/**
 * Once the taxi has driven off, Ah Kong goes back to his stool (out of sight of the road),
 * so a later pass of the garage finds him sitting under the tube, not standing in the lane.
 */
export function retireAhKong() {
  let t = 0;
  const off = g.engine.onUpdate((dt) => {
    t += dt;
    if (t < 2) return;
    t = 0;
    const h = g.ahKong;
    if (!h || h._seated) return off();
    if (!g.fsm?.is('shift')) return off();
    const far = g.engine.camera.position.distanceTo(h.root.position) > 70;
    if (far) {
      h.stopWalking?.();
      h.lookAt?.(null);
      if (!ahKongSit()) h.root.visible = false;
      off();
    }
  }, 30);
  return off;
}
