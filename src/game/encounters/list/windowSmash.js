// The window smash: something keeps pace outside a side or rear window. A palm slaps the glass; a
// knuckle strike stars it; the second blow sends the fractures racing out; the third bursts it —
// slow motion, the camera flinches, tempered nuggets pour over the seats and the dash. A long grey arm
// comes through the hole for your head: a hard QTE (react, then fight it off). Lose and it drags you
// out (death windowArm). Win and it tears itself on the jagged rim going back out. The window stays
// broken for the rest of the night: wind, and rain when it rains.
import * as THREE from 'three';
import { createWindowGhost, CREATURE_SPECS, breakPane, isPaneBroken, paneFrame, panePoint, toBody, dirToBody, bodyOf, humanoidFacing } from '../../../creatures/index.js';
import { S, qte, rand, bloodSpray, bloodDrip } from '../helpers.js';

export function canStart() {
  const t = S.taxi();
  return !!t && S.cameraInside() && ['rr', 'fl', 'rl'].some((p) => !isPaneBroken(t, p));
}

export async function run(E) {
  const t = E.taxi;
  if (!t?.glass?.panes) return;
  const gaze = S.gazeTarget();
  const choices = ['rr', 'fl', 'rl'].filter((p) => !isPaneBroken(t, p) && p !== gaze && t.glass.panes[p]);
  const pane = E.ctx.pane || choices[(Math.random() * choices.length) | 0];
  if (!pane) return;
  E.deathCtx = { pane };
  const body = bodyOf(t);
  const f = paneFrame(t, pane);
  const N = dirToBody(t, f.normal, new THREE.Vector3()).normalize(); // outward
  const up = new THREE.Vector3(0, 1, 0);
  const brk = breakPane(t, pane);
  // the thing at the window, keeping pace (it rides the car's side)
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.roofCrawler }));
  w._attach(t);
  const h = w.humanoid;
  const glass = toBody(t, panePoint(f, 0, 0, 0.02, new THREE.Vector3()), new THREE.Vector3());
  humanoidFacing(N.clone().negate(), up, h.root.quaternion);
  h.root.position.copy(glass).addScaledVector(N, 0.55).addScaledVector(up, -(h.look?.height ?? 1.75) + 0.12);
  h.setGhost({ stare: 1, jitter: 0.35, mouthStretch: 0.35, backbend: -0.25 }, 100);
  h.lookAt(S.engine.camera, { speed: 6, unlimited: true });
  h.setOpacity(0);
  await E.until((dt, el) => (h.setOpacity(Math.min(1, el / 0.6)), el > 0.6), 1);
  const fist = new THREE.Object3D();
  body.add(fist);
  E.track(fist);
  const strike = async (u, v, power) => {
    const p = toBody(t, panePoint(f, u - 0.5, v - 0.5, 0.02, new THREE.Vector3()), new THREE.Vector3());
    const back = p.clone().addScaledVector(N, 0.32);
    h.setHandTarget('R', fist, { weight: 1, fingers: power > 0.3 ? 'grip' : 'flat', grip: 1, blend: 0.05 });
    await E.until((dt, el) => (fist.position.lerpVectors(p, back, 1 - Math.min(1, el / 0.25)), el > 0.25), 0.4);
    await E.until((dt, el) => (fist.position.lerpVectors(back, p, Math.min(1, el / 0.07)), el > 0.07), 0.2);
    E.g.cameraRig?.shake?.(0.12 + power * 0.25);
    return p;
  };
  E.event('encounter:windowSmash');
  // 1. a palm slap, a print
  await strike(0.4, 0.55, 0);
  S.sfx('knock', { object: body, offset3: glass.toArray(), volume: 0.8, rate: 0.7 });
  try {
    t.addGlassMark?.(pane, 'handprint', new THREE.Vector2(0.4, 0.55), { size: 1.2 });
  } catch (e) { /* optional */ }
  if (!(await E.wait(rand(0.7, 1.1)))) return;
  // 2. knuckles: a star; then the fractures run
  const hitU = rand(0.42, 0.6), hitV = rand(0.45, 0.62);
  await strike(hitU, hitV, 0.5);
  await brk.crackAt({ x: hitU, y: hitV }, { strength: 0.45, grow: 0.18 });
  if (!(await E.wait(rand(0.6, 0.9)))) return;
  await strike(hitU + 0.02, hitV - 0.02, 0.8);
  await brk.crackAt({ x: hitU + 0.03, y: hitV - 0.03 }, { strength: 0.85, grow: 0.4 });
  if (!(await E.wait(rand(0.5, 0.8)))) return;
  // 3. it bursts: slow motion, the flinch, glass everywhere
  await strike(hitU, hitV, 1);
  brk.burst({ speed: 3.4 });
  const rig = E.g.cameraRig;
  const inward = dirToBody(t, f.normal, new THREE.Vector3()).negate();
  const off0 = rig?.extraOffset?.clone();
  if (rig?.extraOffset) {
    E.until((dt, el) => {
      const a = Math.sin(Math.min(1, el / 0.5) * Math.PI) * (1 - Math.min(1, el / 0.5));
      rig.extraOffset.copy(off0).addScaledVector(inward, 0.09 * a).add(new THREE.Vector3(0, -0.03 * a, 0));
      return el > 0.5;
    }, 0.8).then(() => rig.extraOffset.copy(off0));
  }
  rig?.shake?.(0.9);
  S.sfx('scream_close', { object: body, offset3: glass.toArray(), volume: 0.8, rate: 1.1 });
  // the long grey arm comes through the hole for your head
  h.setHandTarget('R', null);
  const { hand, center } = w.armThroughWindow(t, pane);
  const eyeL = toBody(t, S.engine.camera.getWorldPosition(new THREE.Vector3()), new THREE.Vector3());
  const reach = eyeL.clone().addScaledVector(inward, -0.14).add(new THREE.Vector3(0, -0.06, 0));
  const start = hand.mesh.position.clone();
  hand.setCurl(-0.25, 30);
  hand.spreadT = 1;
  let reachK = 0;
  E.frame((dt) => {
    reachK = Math.min(1, reachK + dt * 1.6);
    hand.mesh.position.lerpVectors(start, reach, reachK * reachK * (3 - 2 * reachK));
  });
  const dodge = await qte(E, { kind: 'press', action: 'interact', time: 0.95, slowmo: 0.3, dread: 1 });
  if (!E.alive) return;
  hand.setCurl(1.05, 14);
  hand.spreadT = 0;
  S.sfx('bone_crack', { object: hand.mesh, volume: 0.6, rate: 1.3 });
  if (rig) rig.setFocus(body.localToWorld(center.clone()), dodge.ok ? 0.35 : 0.7);
  E.cleanup(() => rig?.setFocus?.(null));
  const fight = await qte(E, { kind: 'mash', action: 'interact', count: dodge.ok ? 10 : 14, time: 3.2, decay: 0.4, slowmo: 0.6, dread: 1 });
  rig?.setFocus?.(null);
  if (!E.alive) return;
  if (!fight.ok) {
    E.violate('windowArm', 'grabbed');
    await E.wait(10);
    return;
  }
  // torn free: it rips itself on the jagged rim going back out
  const out = center.clone().addScaledVector(inward, -0.9);
  const from = hand.mesh.position.clone();
  hand.setCurl(-0.1, 6);
  await E.until((dt, el) => (hand.mesh.position.lerpVectors(from, out, Math.min(1, el / 0.3)), el > 0.3), 0.5);
  const rimW = body.localToWorld(center.clone());
  bloodSpray(rimW, body.localToWorld(center.clone().addScaledVector(inward, -1)).sub(rimW).normalize(), 0.7);
  bloodDrip(rimW, 0.6);
  brk.smear(rimW, null, E.g.blood);
  S.sfx('scream_far', { object: body, offset3: center.toArray(), volume: 0.9, rate: 0.9 });
  hand.mesh.visible = false;
  // the thing falls away behind the car
  h.setVisible(false);
  E.outcome?.('foughtOff');
  await E.wait(1.5);
}
