// The window smash: something keeps pace outside a side window. A palm slaps the glass (and the head
// turns to the sound: the view is pulled to the pane and a cold light finds its face); a knuckle strike
// stars it; the second blow sends the fractures racing out; the third bursts it: slow motion, the
// camera flinches, tempered nuggets pour over the seats and the dash. A long grey arm comes through
// the hole for your head: a hard QTE (react, then fight it off). Lose and it GRABS you, pulls its face
// in through the hole to yours and SCREAMS; early in the game it then lets go and drops away, later it
// EATS you (death windowArm). Win and it tears itself on the jagged rim going back out. The window
// stays broken for the rest of the night: wind, and rain when it rains.
// The Director guarantees one on the first night, in ride 2 or 3 (Director.js _guaranteeSmash).
import * as THREE from 'three';
import { createWindowGhost, CREATURE_SPECS, breakPane, isPaneBroken, paneFrame, panePoint, toBody, dirToBody, bodyOf, humanoidFacing } from '../../../creatures/index.js';
import { S, qte, rand, bloodSpray, bloodDrip } from '../helpers.js';
import { grab, scream, eat, release, earlyGame, makeVisible } from '../scare.js';

const PANES = ['fr', 'fl', 'rr', 'rl'];

export function canStart() {
  const t = S.taxi();
  return !!t && S.cameraInside() && PANES.some((p) => !isPaneBroken(t, p) && t.glass?.panes?.[p]);
}

/** The pane: the driver's own window first (right by Ton's head), else the passenger side, else the rear. */
function pickPane(t, ctx) {
  if (ctx.pane && t.glass.panes[ctx.pane] && !isPaneBroken(t, ctx.pane)) return ctx.pane;
  const seat = S.passengerSeat(ctx);
  const order = Math.random() < 0.7 ? ['fr', 'fl', 'rr', 'rl'] : ['fl', 'fr', 'rr', 'rl'];
  // a passenger in the front seat would be in the arm's way at fl
  const ok = order.filter((p) => t.glass.panes[p] && !isPaneBroken(t, p) && !(p === 'fl' && seat === 'frontPassenger'));
  return ok[0] || null;
}

export async function run(E) {
  const t = E.taxi;
  if (!t?.glass?.panes) return;
  const pane = pickPane(t, E.ctx);
  if (!pane) return;
  E.deathCtx = { pane };
  const body = bodyOf(t);
  const f = paneFrame(t, pane);
  const N = dirToBody(t, f.normal, new THREE.Vector3()).normalize(); // outward
  const up = new THREE.Vector3(0, 1, 0);
  const brk = breakPane(t, pane);
  const rig = E.g.cameraRig;
  // the thing at the window, keeping pace (it rides the car's side)
  const w = E.track(createWindowGhost({ spec: CREATURE_SPECS.roofCrawler }));
  w._attach(t);
  const h = w.humanoid;
  E.debug = { w, h, brk, pane };
  const glass = toBody(t, panePoint(f, 0, 0, 0.02, new THREE.Vector3()), new THREE.Vector3());
  humanoidFacing(N.clone().negate(), up, h.root.quaternion);
  h.root.position.copy(glass).addScaledVector(N, 0.55).addScaledVector(up, -(h.look?.height ?? 1.75) + 0.12);
  makeVisible(h);
  h.setGhost({ stare: 1, jitter: 0.35, mouthStretch: 0.35, backbend: -0.25 }, 100);
  h.lookAt(S.engine.camera, { speed: 6, unlimited: true });
  h.setGhostMotion?.('nightmare');
  h.setOpacity(0);
  // a cold light outside the pane, low: it finds the face, nothing else
  const lampAt = new THREE.Object3D();
  lampAt.position.copy(glass).addScaledVector(N, 0.25).add(new THREE.Vector3(0, -0.25, 0));
  body.add(lampAt);
  E.track(lampAt);
  const lamp = E.track(S.tempLight({ object: lampAt, color: 0xb9c6dc, intensity: 0, distance: 2.6, decay: 2, flicker: 'none', glow: false, priority: 7 }));
  // the gaze is pulled to the pane: a target that rides the car, set well out beyond the glass along
  // the eye's line to it (a near target is unstable: the eye itself moves as the head turns)
  const glassW = new THREE.Vector3();
  const far = glass.clone().addScaledVector(N, 6);
  const look = (strength) => {
    if (!rig) return;
    rig.setFocus(glassW, strength);
  };
  E.frame(() => body.localToWorld(glassW.copy(far)));
  E.cleanup(() => rig?.setFocus?.(null));
  await E.until((dt, el) => (h.setOpacity(Math.min(1, el / 0.6)), lamp?.setIntensity?.(Math.min(1, el / 0.6) * 1.4), el > 0.6), 1);
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
  // 1. a palm slap, a print; the head snaps round to it
  await strike(0.4, 0.55, 0);
  S.sfx('knock', { object: body, offset3: glass.toArray(), volume: 1, rate: 0.7 });
  S.sfx('sting_high', { volume: 0.8 });
  look(1.6); // hard: the driving view's own recentring fights a soft pull
  try {
    t.addGlassMark?.(pane, 'handprint', new THREE.Vector2(0.4, 0.55), { size: 1.2 });
  } catch (e) { /* optional */ }
  if (!(await E.wait(rand(0.9, 1.2)))) return;
  look(0.8); // held there: you can fight it, it will not let you for long
  // 2. knuckles: a star; then the fractures run
  const hitU = rand(0.42, 0.6), hitV = rand(0.45, 0.62);
  await strike(hitU, hitV, 0.5);
  await brk.crackAt({ x: hitU, y: hitV }, { strength: 0.45, grow: 0.18 });
  if (!(await E.wait(rand(0.6, 0.9)))) return;
  await strike(hitU + 0.02, hitV - 0.02, 0.8);
  await brk.crackAt({ x: hitU + 0.03, y: hitV - 0.03 }, { strength: 0.85, grow: 0.4 });
  look(0.7);
  if (!(await E.wait(rand(0.5, 0.8)))) return;
  // 3. it bursts: slow motion, the flinch, glass everywhere
  await strike(hitU, hitV, 1);
  brk.burst({ speed: 3.4 });
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
  S.sfx('scream_far', { synth: true, object: body, offset3: glass.toArray(), volume: 1, rate: 1.05 });
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
  rig?.setFocus?.(null);
  const dodge = await qte(E, { kind: 'press', action: 'interact', time: 0.95, slowmo: 0.3, dread: 1 });
  if (!E.alive) return;
  hand.setCurl(1.05, 14);
  hand.spreadT = 0;
  S.sfx('bone_crack', { object: hand.mesh, volume: 0.6, rate: 1.3 });
  if (rig) rig.setFocus(glassW, dodge.ok ? 0.3 : 0.55);
  const fight = await qte(E, { kind: 'mash', action: 'interact', count: dodge.ok ? 10 : 14, time: 3.2, decay: 0.4, slowmo: 0.6, dread: 1 });
  rig?.setFocus?.(null);
  if (!E.alive) return;
  if (!fight.ok) {
    // it has you: the arm lets the head go only to make room for its face, pulled in through the hole
    hand.mesh.visible = false;
    lamp?.setIntensity?.(2.2);
    const c = grab(h, { from: 0.85, dist: 0.33, lunge: 0.18, restore: false });
    E.cleanup(() => c.stop());
    S.sfx('breath_neck', { volume: 1, rate: 0.7 });
    if (!(await E.wait(0.55))) return;
    await scream(h, 0.9);
    if (!E.alive) return;
    if (earlyGame('windowArm', 'jumpscare')) {
      // this early it lets go: shoved back, it drops away from the window
      await release(h, c);
      bloodDrip(body.localToWorld(center.clone()), 0.4);
      S.sfx('scream_far', { synth: true, object: body, offset3: center.toArray(), volume: 0.7, rate: 0.7 });
      E.outcome?.('released');
      await E.wait(1.2);
      return;
    }
    await eat(h, c);
    c.stop();
    E.deathCtx = { pane, eaten: true, fair: true, fromQte: true };
    E.violate('windowArm', 'eaten');
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
  S.sfx('scream_far', { synth: true, object: body, offset3: center.toArray(), volume: 0.9, rate: 0.9 });
  hand.mesh.visible = false;
  // the thing falls away behind the car
  lamp?.setIntensity?.(0);
  h.setVisible(false);
  E.outcome?.('foughtOff');
  await E.wait(1.5);
}
