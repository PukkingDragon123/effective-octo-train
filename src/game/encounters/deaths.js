// Creature-heavy death cinematics, registered with B's death module (registerDeath) when it exists
// and playable locally (sandbox) through playDeath(type, ctx). Each one ends on black; the death
// module then shows the card and restarts the loop. Gore-aware (settings.gore 'reduced' = darker,
// sparser blood, no lingering close-ups).
//   giantHand  ceilingCrawl  windowArm  trueForm  yaiSpeed  roofHanger  roadFigure  extraPassenger
//   windowAttack  breath
import * as THREE from 'three';
import { g } from '../context.js';
import { engine } from '../../core/Engine.js';
import { cameraRig } from '../../core/CameraRig.js';
import { settings } from '../../core/Settings.js';
import { LAYERS } from '../../core/layers.js';
import { postfx, sky, particles } from '../../render/index.js';
import { CHARACTERS } from '../data/characters.js';
import {
  createGiantHand, createWindowGhost, createYaiSpeed, CREATURE_SPECS, createCreatureHumanoid, paneFrame, panePoint, toBody, dirToBody, humanoidFacing, bodyOf,
} from '../../creatures/index.js';
import * as S from './stage.js';

const _v = new THREE.Vector3();
const gore = () => (settings.get('gore') ?? 'full') !== 'reduced';

// ---------------------------------------------------------------- toolkit
function sleep(s) {
  return new Promise((res) => {
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt;
      if (t >= s) {
        off();
        res();
      }
    }, -50);
  });
}
function anim(d, fn) {
  return new Promise((res) => {
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt;
      const k = Math.min(1, t / d);
      try {
        fn(k, dt);
      } catch (e) {
        console.error(e);
      }
      if (k >= 1) {
        off();
        res();
      }
    }, 21);
  });
}
const ease = (k) => k * k * (3 - 2 * k);
function fadeTo(v, d) {
  if (g.cine?.fade) return g.cine.fade(v, d);
  const p = postfx.params;
  const a = p.fade ?? 0;
  return anim(d, (k) => (p.fade = a + (v - a) * k));
}
function letterbox(on) {
  if (g.cine?.letterbox) g.cine.letterbox(on, 0.5);
  else postfx.params.letterbox = on ? 1 : 0;
}
const eyeWorld = () => engine.camera.getWorldPosition(new THREE.Vector3());
/** Cinematic shot from the driver's eye (follows the moving car) looking at lookFn(). */
function povShot(lookFn, opts = {}) {
  const t = g.taxi;
  const eye = t?.anchors?.driverEye;
  const pos = () => (eye ? eye.getWorldPosition(new THREE.Vector3()) : eyeWorld());
  cameraRig.cinematic({ position: opts.position || pos, lookAt: lookFn, fov: opts.fov, roll: opts.roll ?? 0, blend: opts.blend ?? 0.25, cut: !!opts.cut });
}
function shake(a) {
  cameraRig.shake(a);
}
function splash(a) {
  if (!gore()) a *= 0.5;
  postfx.bloodSplash?.(a);
}
function bloodBurst(pos, dir, radius = 0.15) {
  try {
    const b = particles.emit('blood', { position: pos.clone(), burst: true, autoDispose: true, radius, direction: dir || new THREE.Vector3(0, 1, 0) });
    b.burst?.();
  } catch (e) { /* optional */ }
}
async function blackout(d = 0.45) {
  S.sfx('scare_hit', { volume: 1 });
  await fadeTo(1, d);
}
/** Cleanup after black. */
function restore(list = []) {
  for (const x of list) {
    try {
      x?.dispose?.();
    } catch (e) {
      console.error(e);
    }
  }
  cameraRig.release(0.01);
  letterbox(false);
  if (g.taxi) {
    g.taxi.physics.frozen = false;
    g.taxi.setCabinOverride?.(null);
  }
  sky.setFogBoost?.(1, 0.5);
}
function freezeTaxi() {
  const t = g.taxi;
  if (!t) return null;
  t.physics.frozen = true;
  const sim = t.physicsSim;
  return { pos: sim.pos.clone(), pitch: sim.groundPitch, roll: sim.groundRoll, yaw: sim.yaw };
}
function unfreezeTaxi(saved) {
  const t = g.taxi;
  if (!t || !saved) return;
  const sim = t.physicsSim;
  sim.pos.copy(saved.pos);
  sim.groundPitch = saved.pitch;
  sim.groundRoll = saved.roll;
  sim.yaw = saved.yaw;
  sim.v = 0;
  t.physics.frozen = false;
}
function passengerOr(spec, seat = 'rearLeft', ctx = {}) {
  const h = S.passengerHumanoid(ctx);
  if (h) return { h, own: false };
  const t = g.taxi;
  const hh = createCreatureHumanoid(spec, { layer: LAYERS.DEFAULT });
  if (t?.seats?.[seat]) hh.sitAt(t.seats[seat], { pose: 'sitCar' });
  else engine.scene.add(hh.root);
  return { h: hh, own: true };
}

// ---------------------------------------------------------------- deaths
export const DEATHS = {
  /** Wrong fork with a living passenger: the hand rises out of the left road's fog and crushes the car. */
  async giantHand(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    letterbox(true);
    sky.setFogBoost?.(1.7, 1.5);
    // the fork's brake QTE (fork/HandBrake.js) hands over the hand it already raised
    const given = ctx.opts?.hand && !ctx.opts.hand.disposed ? ctx.opts.hand : null;
    const hand = given || createGiantHand({ scale: 4.6 });
    if (!given) {
      engine.scene.add(hand.root);
      const ahead = S.roadAhead(11, -1);
      hand.root.position.copy(ahead.pos);
      hand.root.rotation.y = ahead.yaw + Math.PI;
    }
    povShot(() => hand.lightAnchor.getWorldPosition(new THREE.Vector3()), { blend: given ? 0.3 : 0.6 });
    S.sfx('sting_reveal', { volume: 1 });
    if (!given) await hand.rise(1.6);
    await sleep(given ? 0.15 : 0.4);
    // the palm comes from the driver's side, fingers over the roof
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(t.root.quaternion).setY(0).normalize();
    const grabP = hand.grab(t.root, { height: 1.55, from: right.clone().negate(), lift: false, sink: false, attach: false, gore: false });
    povShot(() => (hand.hand.b.m3 ? hand.hand.b.m3.getWorldPosition(new THREE.Vector3()) : eyeWorld().add(right)), { blend: 0.35 });
    await grabP;
    shake(1);
    S.sfx('collision_thud', { object: t.root, volume: 1, rate: 0.6 });
    S.sfx('bone_crack', { object: t.root, volume: 1, rate: 0.5 });
    for (const [pane, u, v] of [['windshield', 0.7, 0.6], ['windshield', 0.3, 0.75], ['fr', 0.5, 0.5], ['fl', 0.4, 0.6], ['rr', 0.5, 0.4]]) {
      try {
        t.addGlassMark(pane, 'scratch', new THREE.Vector2(u, v), { size: 2.2 });
      } catch (e) { /* optional */ }
    }
    // lifted into the fog
    const sim = t.physicsSim;
    const y0 = sim.pos.y, py0 = hand.pivot.position.y;
    S.sfx('rumble_rise', { object: t.root, volume: 1 });
    await anim(2.0, (k) => {
      const e = ease(k);
      sim.pos.y = y0 + e * 4.5;
      sim.groundRoll = (saved?.roll || 0) - e * 0.45;
      sim.groundPitch = (saved?.pitch || 0) + Math.sin(k * 9) * 0.03 * k;
      hand.pivot.position.y = py0 + e * 4.5;
      if (k > 0.5) shake(0.05);
    });
    if (gore()) {
      S.sfx('scream_close', { volume: 0.7, rate: 0.85 });
      splash(0.85);
    }
    S.sfx('bone_crack', { volume: 1, rate: 0.7 });
    await sleep(0.25);
    await blackout(0.5);
    unfreezeTaxi(saved);
    restore([hand]);
  },

  /** The cabin light came back on: something is on the headliner, crawling to you, face first. */
  async ceilingCrawl(ctx = {}) {
    const t = g.taxi;
    freezeTaxi();
    t?.setCabinOverride?.(0.9, 0.6);
    const w = createWindowGhost({ spec: CREATURE_SPECS.roofCrawler });
    const body = bodyOf(t);
    body.add(w.root);
    const h = w.humanoid;
    h.root.position.set(0.1, 0.12, 1.15);
    h.root.rotation.set(0, 0, 0);
    const opts = { height: 1.2, speed: 1.3 };
    h.play('ceilingCrawl', opts);
    h.setGhost({ mouthStretch: 0.4, jitter: 0.5 }, 4);
    h.setGore({ bleedEyes: 0.8, bleedMouth: 1, speed: 2 });
    h.lookAt(engine.camera, { speed: 8, unlimited: true });
    S.sfx('scratch_glass', { object: body, offset3: [0, 1.3, 0.8], volume: 0.8, rate: 0.6 });
    // the eye is pulled up to the roof
    povShot(() => h.headPosition.clone(), { blend: 0.5, fov: 66 });
    await sleep(0.35);
    t?.setCabinOverride?.(0.05, 1);
    S.sfx('sting_reveal', { volume: 1 });
    await anim(1.6, (k) => {
      h.root.position.z = 1.15 - ease(k) * 0.95;
      t?.setCabinOverride?.(k % 0.3 < 0.15 ? 0.7 : 0.05, 1);
    });
    // it drops its face to yours
    h.setGhost({ mouthStretch: 1, jitter: 0.9 }, 10);
    await anim(0.35, (k) => (opts.height = 1.2 - k * 0.3));
    S.sfx('scream_close', { volume: 1, rate: 1.1 });
    shake(0.9);
    splash(0.9);
    await sleep(gore() ? 0.35 : 0.15);
    await blackout(0.3);
    restore([w]);
  },

  /** A window was open: a long grey arm reaches in, takes your head and drags you out. */
  async windowArm(ctx = {}) {
    const t = g.taxi;
    const pane = ctx.pane || ctx.opts?.pane || 'fr';
    const saved = freezeTaxi();
    const w = createWindowGhost({ spec: CREATURE_SPECS.tallMan });
    w.humanoid.setVisible(false);
    const { hand, inward, center } = w.armThroughWindow(t, pane);
    const body = bodyOf(t);
    const eyeL = toBody(t, eyeWorld(), new THREE.Vector3());
    S.sfx('sting_high', { volume: 1 });
    povShot(() => hand.b.m2.getWorldPosition(new THREE.Vector3()), { blend: 0.15 });
    hand.setCurl(-0.25, 20);
    hand.spreadT = 1;
    const start = hand.mesh.position.clone();
    const reach = eyeL.clone().addScaledVector(inward, -0.12).add(new THREE.Vector3(0, -0.05, 0));
    await anim(0.55, (k) => hand.mesh.position.lerpVectors(start, reach, ease(k)));
    hand.setCurl(1, 14);
    hand.spreadT = 0;
    S.sfx('bone_crack', { volume: 1 });
    shake(1);
    splash(0.5);
    // dragged toward the window: the camera follows the hand out
    const eyePos = () => body.localToWorld(hand.mesh.position.clone().addScaledVector(inward, 0.12));
    cameraRig.cinematic({ position: eyePos, lookAt: () => body.localToWorld(center.clone().addScaledVector(inward, 2)), blend: 0.15, roll: 0.6 });
    await anim(0.7, (k) => hand.mesh.position.lerpVectors(reach, center.clone().addScaledVector(inward, -1.2), ease(k)));
    try {
      t.addGlassMark(pane, 'blood_smear', new THREE.Vector2(0.5, 0.4), { size: 1.6, drag: true });
    } catch (e) { /* optional */ }
    S.sfx('scream_close', { volume: 0.9, rate: 0.8 });
    splash(1);
    await blackout(0.35);
    unfreezeTaxi(saved);
    restore([w]);
  },

  /** Rule 4 (looked at the face) and wrong-fork true forms. Variant by passenger. */
  async trueForm(ctx = {}) {
    const t = g.taxi;
    const pid = S.passengerId(ctx) || ctx.passengerId || 'womanWhite';
    const seat = S.passengerSeat(ctx) || 'rearLeft';
    const spec = { ...(CHARACTERS[pid]?.appearance || CREATURE_SPECS.windowWoman), id: pid + '_true' };
    const { h, own } = passengerOr(spec, seat, ctx);
    const saved = freezeTaxi();
    h.setLayer?.(LAYERS.DEFAULT);
    h.setOpacity?.(1);
    povShot(() => h.headPosition.clone(), { blend: 0.35, fov: 62 });
    h.lookAt(engine.camera, { speed: 10, unlimited: true });
    await sleep(0.5);
    if (pid === 'womanWhite') {
      S.sfx('neck_snap', { volume: 1 });
      h.play('neckSnap', { dir: 1, angle: 1.55 });
      h.setGore({ wound: 'neck', amount: 1, bleedEyes: 0.9, bleedMouth: 0.8, speed: gore() ? 2 : 1 });
      await sleep(0.7);
      h.setGhost({ mouthStretch: 0.8, jitter: 0.7, stare: 1 }, 6);
    } else if (pid === 'nuan') {
      h.setGhost({ levitate: 0.25, headRoll: 0.4, mouthStretch: 1, jitter: 0.4, stare: 1 }, 3);
      S.sfx('giggle', { volume: 1, rate: 0.7 });
      await sleep(0.8);
    } else if (pid === 'saman') {
      h.setExpression?.({ smile: 1, creepy: 1 });
      h.setGhost({ mouthStretch: 1, headRoll: -0.3, jitter: 0.3, stare: 1 }, 4);
      S.sfx('giggle', { volume: 1, rate: 0.55 });
      await sleep(0.8);
    } else if (pid === 'boyM') {
      h.setGore({ bleedMouth: 1, bleedEyes: 1, amount: 1, speed: 2 });
      h.setGhost({ neckTwist: Math.PI, stare: 1, jitter: 0.3 }, 1.2);
      S.sfx('child_laugh_far', { volume: 1, rate: 0.6 });
      await sleep(1.2);
    } else {
      h.setGhost({ mouthStretch: 0.9, headRoll: 0.8, jitter: 0.6, stare: 1 }, 4);
      h.setGore({ bleedEyes: 1, bleedMouth: 1, speed: 2 });
      await sleep(0.7);
    }
    S.sfx('sting_reveal', { volume: 1 });
    h.play('crawlOverSeat', { target: engine.camera, distance: 0.75 });
    await sleep(gore() ? 1.6 : 1.1);
    S.sfx('scream_close', { volume: 1 });
    shake(0.8);
    splash(0.9);
    if (gore()) bloodBurst(h.headPosition, eyeWorld().sub(h.headPosition).normalize(), 0.08);
    await sleep(0.2);
    await blackout(0.3);
    unfreezeTaxi(saved);
    if (own) h.dispose();
    else {
      h.stop?.('crawlOverSeat');
      h.setGhost?.({ mouthStretch: 0, jitter: 0, neckTwist: 0, headRoll: 0, levitate: 0 }, 50);
    }
    restore([]);
  },

  /** Racing Granny: she comes through the windshield. */
  async yaiSpeed(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    let y = ctx.yai && !ctx.yai.disposed ? ctx.yai : null;
    const own = !y;
    if (!y) {
      y = createYaiSpeed();
      engine.scene.add(y.root);
      y.runAlongside(t, 'L', { along: -0.5 });
      await sleep(0.1);
      await y.landOnHood(t);
    }
    povShot(() => y.humanoid.headPosition.clone(), { blend: 0.2, fov: 60 });
    y.humanoid.setGhost({ mouthStretch: 1, jitter: 1 }, 8);
    S.sfx('giggle', { volume: 1, rate: 0.6 });
    await sleep(0.6);
    // the glass gives
    for (const [u, v] of [[0.6, 0.55], [0.75, 0.4], [0.5, 0.7]]) {
      try {
        t.addGlassMark('windshield', 'scratch', new THREE.Vector2(u, v), { size: 2.5 });
        if (gore()) t.addGlassMark('windshield', 'blood_splatter', new THREE.Vector2(u, v), { size: 1.4 });
      } catch (e) { /* optional */ }
    }
    S.sfx('collision_thud', { volume: 1, rate: 0.7 });
    S.sfx('scream_close', { volume: 1, rate: 1.3 });
    const h = y.humanoid;
    const p0 = h.root.position.clone();
    const eyeL = toBody(t, eyeWorld(), new THREE.Vector3());
    await anim(0.3, (k) => h.root.position.lerpVectors(p0, eyeL.clone().add(new THREE.Vector3(0, -1.1, -0.3)), ease(k)));
    shake(1);
    splash(1);
    await blackout(0.25);
    unfreezeTaxi(saved);
    restore(own ? [y] : []);
  },

  /** Rule 13 (wiped the blood): what hangs from the roof slides down onto the glass and in. */
  async roofHanger(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    const w = createWindowGhost({ spec: CREATURE_SPECS.roofCrawler });
    const p = w.perform('upsideDownHead', { taxi: t, duration: 3.2, side: 0.3 });
    povShot(() => S.fromTaxi(0.3, 1.25, -0.75), { blend: 0.4 });
    await sleep(1.4);
    w.humanoid.setGhost({ mouthStretch: 1, jitter: 0.8 }, 6);
    w.humanoid.setGore({ bleedEyes: 1, bleedMouth: 1, speed: 2 });
    try {
      t.addGlassMark('windshield', 'blood_smear', new THREE.Vector2(0.62, 0.8), { size: 1.6, drag: true });
      t.addGlassMark('windshield', 'blood_handprint', new THREE.Vector2(0.4, 0.6), { size: 1.4, drag: true });
    } catch (e) { /* optional */ }
    S.sfx('thump_roof', { volume: 1, rate: 0.6 });
    S.sfx('scream_close', { volume: 0.9, rate: 0.9 });
    shake(0.8);
    await sleep(0.5);
    splash(0.9);
    await blackout(0.3);
    w.stop();
    void p;
    unfreezeTaxi(saved);
    restore([w]);
  },

  /** Rule 12 (braked for the figure): it reaches the windshield, then it is inside. */
  async roadFigure(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    const w = createWindowGhost({ spec: CREATURE_SPECS.roadFigure });
    const body = bodyOf(t);
    w._attach(t);
    const h = w.humanoid;
    const ws = paneFrame(t, 'windshield');
    const face = toBody(t, panePoint(ws, 0.15, 0.1, 0.02, _v), new THREE.Vector3());
    const N = dirToBody(t, ws.normal, new THREE.Vector3()).normalize();
    humanoidFacing(N.clone().negate().setY(0).normalize(), new THREE.Vector3(0, 1, 0), h.root.quaternion);
    h.root.position.copy(face).addScaledVector(N, 0.3).add(new THREE.Vector3(0, -(h.look?.height ?? 1.7) + 0.1, 0));
    const tgt = new THREE.Object3D();
    tgt.position.copy(face);
    body.add(tgt);
    h.play('pressFaceToGlass', { target: tgt, normal: ws.normal.clone() });
    h.setGhost({ mouthStretch: 0.7, jitter: 0.5 }, 5);
    postfx.flash?.(0xdfe8ff, 0.2);
    S.sfx('sting_reveal', { volume: 1 });
    povShot(() => h.headPosition.clone(), { blend: 0.15 });
    try {
      t.addGlassMark('windshield', 'face', new THREE.Vector2(0.62, 0.6), { size: 1.2 });
      t.addGlassMark('windshield', 'handprint', new THREE.Vector2(0.45, 0.55), { size: 1.3 });
      t.addGlassMark('windshield', 'handprint', new THREE.Vector2(0.8, 0.52), { size: 1.3 });
    } catch (e) { /* optional */ }
    await sleep(1.1);
    // through the glass
    h.stop('pressFaceToGlass');
    const p0 = h.root.position.clone();
    const eyeL = toBody(t, eyeWorld(), new THREE.Vector3());
    S.sfx('scream_close', { volume: 1, rate: 0.75 });
    await anim(0.28, (k) => h.root.position.lerpVectors(p0, eyeL.clone().add(new THREE.Vector3(0, -(h.look?.height ?? 1.7) + 0.2, -0.35)), ease(k)));
    shake(1);
    splash(0.8);
    await blackout(0.25);
    tgt.removeFromParent();
    unfreezeTaxi(saved);
    restore([w]);
  },

  /** Rule 16 (spoke to the child in the mirror): she is in the front seat now. */
  async extraPassenger(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    const h = createCreatureHumanoid({ ...CHARACTERS.extraChild.appearance, id: 'extraChildFront' }, { layer: LAYERS.DEFAULT });
    if (t?.seats?.frontPassenger) h.sitAt(t.seats.frontPassenger, { pose: 'sitCar' });
    else engine.scene.add(h.root);
    h.setGhost({ stare: 1, noBlink: 1, still: 1 }, 100);
    h.setExpression({ smile: 0.6, creepy: 0.8 });
    t?.setCabinOverride?.(0.25, 0.4);
    povShot(() => h.headPosition.clone(), { blend: 1.2, fov: 64 });
    S.sfx('child_laugh_far', { volume: 0.6, rate: 0.8 });
    await sleep(1.4);
    h.lookAt(engine.camera, { speed: 0.8, unlimited: true });
    S.whisper({ th: 'พี่ทักหนูแล้วนะ', en: 'You spoke to me.', tone: 'whisper' }, h.headPosition.clone(), CHARACTERS.extraChild.voice);
    await sleep(1.6);
    h.setGhost({ neckTwist: 0.9, mouthStretch: 1, jitter: 0.6 }, 6);
    h.setGore({ bleedEyes: 1, bleedMouth: 0.8, speed: 2 });
    S.sfx('sting_reveal', { volume: 1 });
    h.play('crawlOverSeat', { target: engine.camera, distance: 0.45 });
    await sleep(0.8);
    S.sfx('scream_close', { volume: 1, rate: 1.5 });
    shake(0.8);
    splash(0.7);
    await blackout(0.3);
    unfreezeTaxi(saved);
    restore([h]);
  },

  /** A ghost taken the human way: every window fills with slapping hands, then the passenger turns. */
  async windowAttack(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    letterbox(true);
    sky.setFogBoost?.(1.5, 1);
    povShot(() => S.fromTaxi(-0.6, 1.0, 0.6), { blend: 0.8 });
    const panes = ['fl', 'rl', 'rr', 'fr', 'windshield', 'rear'];
    for (let i = 0; i < 16; i++) {
      const pane = panes[(Math.random() * panes.length) | 0];
      try {
        t.addGlassMark(pane, gore() && i % 3 === 0 ? 'blood_handprint' : 'handprint', new THREE.Vector2(0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6), { size: 1.1 + Math.random() * 0.4, angle: Math.random() - 0.5, drag: Math.random() < 0.3 });
      } catch (e) { /* optional */ }
      S.sfx('knock', { object: t?.root, volume: 0.6 + Math.random() * 0.4, rate: 0.7 + Math.random() * 0.5, offset3: [Math.random() - 0.5, 1.1, Math.random() * 2 - 1] });
      shake(0.08);
      await sleep(0.08 + Math.random() * 0.12);
    }
    t?.setFog?.('all', 0.9);
    await sleep(0.4);
    await DEATHS.trueForm({ ...ctx, _noRestore: true });
    unfreezeTaxi(saved);
    restore([]);
  },

  /** Rule 8 failed: you turn, and the face is right there. */
  async breath(ctx = {}) {
    const t = g.taxi;
    const saved = freezeTaxi();
    const h = createCreatureHumanoid(CREATURE_SPECS.windowWoman, { layer: LAYERS.DEFAULT });
    const body = bodyOf(t);
    body.add(h.root);
    h.root.position.set(0.32, 0.05, 0.62);
    h.root.rotation.set(0, Math.PI * 0.9, 0);
    h.setMode('crouch');
    h.setGhost({ stare: 1, noBlink: 1, mouthStretch: 0.5, headRoll: 0.3 }, 100);
    h.lookAt(engine.camera, { speed: 20, unlimited: true });
    S.sfx('breath_neck', { object: t?.anchors?.driverEye, volume: 1 });
    povShot(() => h.headPosition.clone(), { blend: 0.45, fov: 58 });
    await sleep(0.7);
    S.sfx('sting_reveal', { volume: 1 });
    h.setGhost({ mouthStretch: 1, jitter: 0.8 }, 8);
    h.setGore({ bleedEyes: 1, bleedMouth: 1, speed: 3 });
    await sleep(0.5);
    S.sfx('scream_close', { volume: 1 });
    shake(0.9);
    splash(0.8);
    await blackout(0.25);
    unfreezeTaxi(saved);
    restore([h]);
  },
};

/** Play a death locally (sandbox / when B's death module is missing). */
export async function playDeath(type, ctx = {}) {
  const fn = DEATHS[type];
  if (!fn) {
    await fadeTo(1, 0.6);
    return;
  }
  try {
    await fn(ctx);
  } catch (e) {
    console.error('[deaths]', type, e);
    await fadeTo(1, 0.3);
  }
}

let _registered = false;
/** Register every creature death with B's death module (src/game/death/index.js) when it exists. */
export function registerCreatureDeaths() {
  if (_registered) return;
  _registered = true;
  const mods = import.meta.glob('../death/index.js');
  const load = mods['../death/index.js'];
  const reg = (m) => {
    const r = m?.registerDeath || g.registerDeath;
    if (typeof r !== 'function') return;
    for (const [type, fn] of Object.entries(DEATHS)) {
      try {
        r(type, fn);
      } catch (e) {
        console.warn('[deaths] registerDeath failed', type, e);
      }
    }
  };
  if (load) load().then(reg).catch((e) => console.warn('[deaths] death module unavailable', e));
  else if (g.registerDeath) reg(null);
}
