// B's death cinematics (defaults: C's registerDeath() for the same type replaces them).
// Each is short (2–6 s) and ends on a shock; DeathState then hard-cuts to black.
//   roadFold  dragBack  lookBack  trueForm (faceGaze)  home  windowAttack  giantHand (fallback)
//   + flavoured generic ones for every other rule death.
import * as THREE from 'three';
import { g } from '../context.js';
import { registerDefaultDeath } from './index.js';
import { createHumanoid } from '../../characters/index.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, lerp, easeInOut, smoothstep } from '../../core/math.js';
import { resolveLines, dialogueBlock } from '../data/logic.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const P = () => g.postfx.params;
const gore = () => g.settings?.get('gore') ?? 'full';
const play = (id, o = {}) => g.audio?.play?.(id, o);

/** Ride dialogue block (resolved) played inside a cinematic, bounded in time. */
async function sayBlock(ctx, key, maxS = 4) {
  const ride = ctx.ride;
  if (!ride?.data || !key) return;
  const lines = dialogueBlock(ride.data, key, { save: g.save, taxi: g.taxi?.state, hour: g.clock?.hour });
  if (!lines.length) return;
  await Promise.race([g.dialogue.play(lines), ctx.wait(maxS)]);
}

/** Lock the view on a point (world Vector3 or a function) from the driver's eye. */
function lookFromEye(ctx, target, opts = {}) {
  g.cameraRig.cinematic({
    position: () => ctx.eye(_v2),
    lookAt: typeof target === 'function' ? target : () => target,
    fov: opts.fov,
    roll: opts.roll,
    blend: opts.blend ?? 0.25,
  });
}

/** The ghost passenger's true form (head snaps, mouth stretches, gore). */
function trueForm(h, strength = 1) {
  if (!h || h.disposed) return;
  h.setLayer?.(LAYERS.DEFAULT); // seen everywhere now
  h.setGhost({ neckTwist: 1.75 * strength, mouthStretch: 1, stretch: 0.45, jitter: 0.7, stare: 1, noBlink: 1, unlimited: 1, still: 0 }, 9);
  if (gore() !== 'off') h.setGore({ wound: 'neck', amount: gore() === 'reduced' ? 0.55 : 1, bleedMouth: 1, bleedEyes: 0.8, speed: 3 });
  h.setExpression({ smile: 0, sad: 0, fear: 0, anger: 0.4, creepy: 1, surprise: 0 });
  try {
    h.play('neckSnap', { angle: 1.5 });
  } catch (e) {
    /* ignore */
  }
}

/** Something from the back seat: the ghost passenger if any, otherwise a pale shape. */
function backSeatThing(ctx, seat = 'rearRight') {
  const h0 = ctx.humanoid;
  if (h0 && !h0.disposed && ctx.passenger?.data?.identity === 'ghost' && ctx.passenger?.seated) return { h: h0, temp: false };
  const h = createHumanoid({
    id: 'backSeatThing', sex: 'f', age: 30, height: 1.62, build: 'thin', skinTone: 0.15,
    hair: { style: 'long', color: '#0a0909' },
    outfit: { type: 'dress', top: '#bfbcb2', bottom: '#b6b2a6', accent: '#1d1a18', shoes: 'barefoot' },
    face: { seed: 6661, wrinkles: 0, smile: 0, eyeSize: 1.1, noseWidth: 0.95, jaw: 0.9, cheek: 0.9 },
    ghost: { pale: 1, eyes: 'black', wet: 0.6, decay: 0.45, bloodStains: 0.4 },
    noBlink: true,
  });
  h.sitAt(ctx.taxi.seats[seat] || ctx.taxi.seats.rearRight, { pose: 'sitCar' });
  h.setGhost({ stare: 1, noBlink: 1, unlimited: 1, headRoll: 0.4 }, 50);
  return { h, temp: true };
}

async function lunge(ctx, h, seconds = 0.45) {
  if (!h || h.disposed) return;
  const start = h.root.position.clone();
  const eyeLocal = h.root.parent ? h.root.parent.worldToLocal(ctx.eye(_v).clone()) : ctx.eye(_v).clone();
  const target = start.clone().lerp(eyeLocal, 0.78);
  target.y = start.y + 0.12;
  await ctx.during(seconds, (dt, t, k) => {
    h.root.position.lerpVectors(start, target, easeInOut(k));
  });
}

function endShock(ctx, k = 1) {
  ctx.scare(k);
  play('sting_reveal', { volume: 0.8 });
  P().distortion = 0.6;
}

// ------------------------------------------------------------------ r1: the road folds
registerDefaultDeath('roadFold', async (ctx) => {
  const t = ctx.taxi;
  play('giant_hand_rumble', { volume: 0.45 });
  play('sting_low', { volume: 0.8 });
  g.sky?.setFogBoost?.(5, 2.2);
  const p = P();
  const h = ctx.ride?.passenger?.humanoid;
  // the road bends up in front of the car: the view pitches up and rolls while the world fogs over
  lookFromEye(ctx, () => {
    const f = t.forward;
    return _v.copy(ctx.eye(_v2)).addScaledVector(f, 10).add(new THREE.Vector3(0, 6, 0));
  }, { blend: 2.2, roll: 0.5, fov: 88 });
  await ctx.during(2.2, (dt, tt, k) => {
    p.distortion = k * 0.8;
    p.horror = k;
    t.physicsSim.v = lerp(t.physicsSim.v, 0, dt * 0.8);
  });
  // the one you left stands at the windshield
  if (h && !h.disposed) {
    if (h.root.parent !== g.engine.scene) h.detach(g.engine.scene);
    const f = t.forward;
    const pos = t.root.position.clone().addScaledVector(f, 3.1);
    pos.y = g.world.getHeight(pos.x, pos.z);
    h.root.position.copy(pos);
    h.root.rotation.set(0, Math.atan2(f.x, f.z), 0);
    h.setLayer?.(LAYERS.DEFAULT);
    h.setOpacity?.(1);
    h.setMode?.('stand');
    h.setGhost({ stare: 1, noBlink: 1, unlimited: 1, headRoll: 0.35, jitter: 0.3 }, 6);
    h.lookAt(ctx.eye(new THREE.Vector3()), { speed: 20, unlimited: true });
    lookFromEye(ctx, () => h.headPosition, { blend: 0.15, fov: 60 });
  }
  await ctx.wait(0.5);
  endShock(ctx, 1);
  await ctx.wait(0.5);
});

// ------------------------------------------------------------------ ride 4 wrong: dragged back
registerDefaultDeath('dragBack', async (ctx) => {
  const t = ctx.taxi;
  play('child_laugh_far', { volume: 0.8, object: t.anchors.rearLeftSeat });
  // the view goes to the rear-view mirror: he is still sitting there
  lookFromEye(ctx, () => t.anchors.rearviewMirror.getWorldPosition(_v), { blend: 0.8, fov: 48 });
  await ctx.wait(1.4);
  play('sting_low', { volume: 0.9 });
  play('scratch_glass', { object: t.anchors.rearRightSeat });
  t.autopilot(null);
  const p = P();
  await ctx.during(2.4, (dt, tt, k) => {
    t.physicsSim.input.throttle = 0;
    t.physicsSim.input.brake = 0;
    t.physicsSim.v = -lerp(2, 17, easeInOut(k));
    p.distortion = k * 0.7;
    p.horror = 0.3 + k * 0.7;
    g.cameraRig.shake(0.05);
  });
  if (gore() !== 'off') t.addGlassMark?.('rear', 'blood_handprint', new THREE.Vector2(0.45, 0.6), { size: 1.2 });
  endShock(ctx, 1);
  await ctx.wait(0.5);
});

// ------------------------------------------------------------------ r3: you looked back
registerDefaultDeath('lookBack', async (ctx) => {
  const { h, temp } = backSeatThing(ctx, ctx.passenger?.seatId === 'rearLeft' ? 'rearLeft' : 'rearRight');
  lookFromEye(ctx, () => h.headPosition, { blend: 0.2, fov: 58 });
  play('sting_high', { volume: 0.7 });
  h.lookAt(ctx.eye(new THREE.Vector3()), { speed: 30, unlimited: true });
  await sayBlock(ctx, ctx.opts.block || 'onLookBack', 2.2);
  trueForm(h, 0.8);
  await ctx.wait(0.35);
  await lunge(ctx, h, 0.35);
  endShock(ctx, 1);
  await ctx.wait(0.45);
  if (temp) setTimeout(() => h.dispose(), 4000);
});

// ------------------------------------------------------------------ r4: the face (true form)
registerDefaultDeath('trueForm', async (ctx) => {
  const h = ctx.humanoid;
  if (!h || h.disposed) {
    // nothing seated (wrong fork after the passenger left): a generic one
    await genericDeath(ctx, { sound: 'neck_snap' });
    return;
  }
  lookFromEye(ctx, () => h.headPosition, { blend: 0.25, fov: 56 });
  h.lookAt(ctx.eye(new THREE.Vector3()), { speed: 20, unlimited: true });
  await sayBlock(ctx, ctx.opts.block || (ctx.opts.cause === 'faceGaze' ? 'onFaceGaze' : null), 2.6);
  play('neck_snap', { object: h.root, volume: 1 });
  play('bone_crack', { object: h.root, volume: 0.8 });
  trueForm(h, 1);
  await ctx.wait(0.7);
  try {
    if (h._seated) h.play('crawlOverSeat', { distance: 0.7, target: ctx.eye(new THREE.Vector3()) });
  } catch (e) {
    /* ignore */
  }
  await ctx.wait(0.6);
  await lunge(ctx, h, 0.3);
  endShock(ctx, 1);
  await ctx.wait(0.4);
});

// ------------------------------------------------------------------ ride 9 RIGHT: home (wrong_home)
registerDefaultDeath('home', async (ctx) => {
  const t = ctx.taxi;
  const h = ctx.humanoid;
  g.audio?.music?.setMood?.('dawn', { fade: 3 });
  // the taxi rolls to a stop at the village (the old house); he gets out and fades on the porch
  const ref = t.physicsSim.roadRef;
  if (ref) {
    t.autopilot({ splineId: ref.id, stopAt: Math.min(g.world.road.length(ref.id) - 4, ref.s + 14), speedKmh: 14 });
    await Promise.race([ctx.wait(5), new Promise((r) => {
      const off = g.engine.onUpdate(() => {
        if (t.speedKmh < 1) {
          off();
          r();
        }
      }, 0);
    })]);
  }
  t.autopilot(null);
  if (h && !h.disposed && ctx.passenger) {
    const door = ctx.passenger.doorId || 'rr';
    await t.openDoor(door, 1, 0.9);
    const lm = g.world.landmarks.humanVillageStop;
    const out = ctx.passenger.doorOutside(new THREE.Vector3());
    h.detach(g.engine.scene);
    h.root.position.copy(out);
    h.setMode?.('stand');
    const porch = lm ? lm.waitPos.clone().add(lm.waitPos.clone().sub(t.root.position).setY(0).normalize().multiplyScalar(5)) : out.clone().add(new THREE.Vector3(4, 0, 0));
    porch.y = g.world.getHeight(porch.x, porch.z);
    h.walkTo(porch, {});
    lookFromEye(ctx, () => h.headPosition, { blend: 1.6, fov: 50 });
    await ctx.wait(3.2);
    h.stopWalking?.();
    h.lookAt(ctx.eye(new THREE.Vector3()), { speed: 2 });
    h.setExpression({ sad: 0.8, smile: 0.3 });
    await ctx.during(3.2, (dt, tt, k) => h.setOpacity?.(1 - easeInOut(k)));
    t.openDoor(door, 0, 1.2);
  } else await ctx.wait(2);
  play('wind_chime', { volume: 0.5 });
  await ctx.wait(1.4);
});

// ------------------------------------------------------------------ wrong fork (ghost on the human road)
registerDefaultDeath('windowAttack', async (ctx) => {
  const t = ctx.taxi;
  const h = ctx.humanoid;
  if (h && !h.disposed) {
    lookFromEye(ctx, () => h.headPosition, { blend: 0.4, fov: 60 });
    trueForm(h, 0.7);
  }
  const panes = ['fl', 'rl', 'rr', 'fr', 'windshield'];
  for (let i = 0; i < panes.length; i++) {
    play('knock', { object: t.anchors.doorRL, volume: 1, rate: 0.8 + Math.random() * 0.3 });
    if (gore() !== 'off') t.addGlassMark?.(panes[i], 'blood_handprint', new THREE.Vector2(0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.3), { size: 1.1, angle: Math.random() - 0.5 });
    else t.addGlassMark?.(panes[i], 'handprint', new THREE.Vector2(0.5, 0.5), {});
    g.cameraRig.shake(0.25);
    await ctx.wait(0.32);
  }
  if (h && !h.disposed) await lunge(ctx, h, 0.3);
  endShock(ctx, 1);
  await ctx.wait(0.4);
});

// ------------------------------------------------------------------ giant hand (fallback; C registers the real one)
registerDefaultDeath('giantHand', async (ctx) => {
  const t = ctx.taxi;
  play('giant_hand_rumble', { volume: 1 });
  g.sky?.setFogBoost?.(3, 1.5);
  lookFromEye(ctx, () => _v.copy(ctx.eye(_v2)).addScaledVector(t.forward, 12).add(new THREE.Vector3(0, 9, 0)), { blend: 1.5, fov: 80 });
  const p = P();
  await ctx.during(2.4, (dt, tt, k) => {
    g.cameraRig.shake(0.04 + k * 0.08);
    p.horror = k;
    t.physicsSim.v = lerp(t.physicsSim.v, 0, dt);
  });
  play('scream_far', { volume: 0.8 });
  endShock(ctx, 1);
  await ctx.wait(0.5);
});

// ------------------------------------------------------------------ everything else: flavoured generic
async function genericDeath(ctx, f = {}) {
  const t = ctx.taxi;
  const p = P();
  if (f.sound) play(f.sound, { object: f.object || t.root, volume: 1 });
  if (f.look) lookFromEye(ctx, f.look, { blend: 0.35, fov: f.fov ?? 62 });
  if (f.marks && gore() !== 'off') for (const [pane, kind, u, v] of f.marks) t.addGlassMark?.(pane, kind, new THREE.Vector2(u, v), { size: 1.1 });
  if (f.lines) await Promise.race([g.dialogue.play(resolveLines(f.lines, { save: g.save })), ctx.wait(3)]);
  await ctx.during(f.build ?? 1.2, (dt, tt, k) => {
    p.horror = Math.max(p.horror, k);
    g.cameraRig.shake(0.03);
  });
  if (f.after) await f.after();
  endShock(ctx, 1);
  await ctx.wait(0.45);
}
registerDefaultDeath('generic', (ctx) => genericDeath(ctx, { sound: 'sting_low' }));

const V = (th, en) => ({ who: 'voice', th, en, tone: 'whisper' });
const anchor = (n) => () => g.taxi.anchors[n].getWorldPosition(_v);
registerDefaultDeath('nameCall', (ctx) => genericDeath(ctx, { sound: 'whisper', look: anchor('mirrorRight'), marks: [['fr', 'blood_handprint', 0.5, 0.55]] }));
registerDefaultDeath('windowArm', (ctx) => genericDeath(ctx, { sound: 'scratch_glass', look: anchor('windowCrankFR'), marks: [['fr', 'blood_smear', 0.5, 0.4]] }));
registerDefaultDeath('count444', (ctx) =>
  genericDeath(ctx, {
    sound: 'knock',
    look: anchor('mirrorLeft'),
    marks: [['fl', 'blood_handprint', 0.4, 0.5], ['fr', 'blood_handprint', 0.6, 0.5], ['windshield', 'blood_handprint', 0.5, 0.5]],
  }));
registerDefaultDeath('extraPassenger', (ctx) => genericDeath(ctx, { sound: 'child_laugh_far', look: anchor('rearviewMirror'), fov: 46 }));
registerDefaultDeath('ceilingCrawl', (ctx) =>
  genericDeath(ctx, {
    sound: 'thump_roof',
    look: () => _v.copy(ctx.eye(_v2)).add(new THREE.Vector3(0, 1, 0)),
    after: async () => {
      g.taxi.setCabinOverride(0.05, 1);
      play('scratch_glass', { object: g.taxi.anchors.cabinLight });
      if (gore() !== 'off') g.taxi.bleedRoof?.(1);
      await ctx.wait(0.6);
    },
  }));
registerDefaultDeath('trunk', (ctx) =>
  genericDeath(ctx, {
    sound: 'knock_trunk',
    look: anchor('rearviewMirror'),
    after: async () => {
      g.taxi.openDoor('trunk', 1, 0.5);
      await ctx.wait(0.7);
    },
  }));
registerDefaultDeath('radio', (ctx) =>
  genericDeath(ctx, {
    look: anchor('radioKnob'),
    after: async () => {
      g.audio?.radio?.setStatic?.(1);
      await ctx.wait(0.8);
    },
  }));
registerDefaultDeath('breath', (ctx) =>
  genericDeath(ctx, {
    sound: 'breath_neck',
    object: g.taxi?.anchors?.driverEye,
    look: () => _v.copy(ctx.eye(_v2)).addScaledVector(g.taxi.forward, -2).add(new THREE.Vector3(0.2, 0, 0)),
    lines: [V('เห็นหน้าแล้ว', 'Now I see your face.')],
  }));
registerDefaultDeath('roadFigure', (ctx) =>
  genericDeath(ctx, { sound: 'scare_hit', look: () => _v.copy(ctx.eye(_v2)).addScaledVector(g.taxi.forward, 3), marks: [['windshield', 'blood_handprint', 0.5, 0.5], ['windshield', 'blood_splatter', 0.4, 0.6]] }));
registerDefaultDeath('roofHanger', (ctx) =>
  genericDeath(ctx, {
    sound: 'thump_roof',
    look: () => _v.copy(ctx.eye(_v2)).addScaledVector(g.taxi.forward, 2).add(new THREE.Vector3(0, 0.6, 0)),
    marks: [['windshield', 'blood_smear', 0.5, 0.75], ['windshield', 'blood_drip', 0.3, 0.9]],
  }));
registerDefaultDeath('crash', (ctx) => genericDeath(ctx, { sound: 'collision_thud', build: 0.4 }));
registerDefaultDeath('yaiSpeed', (ctx) => genericDeath(ctx, { sound: 'thump_roof', look: () => _v.copy(ctx.eye(_v2)).addScaledVector(g.taxi.forward, 2.2) }));
// QTE deaths: the face rat clamps onto the face; the door is torn open from outside
registerDefaultDeath('faceRat', (ctx) =>
  genericDeath(ctx, {
    sound: 'scream_close',
    look: () => _v.copy(ctx.eye(_v2)).addScaledVector(g.taxi.forward, 0.35).add(new THREE.Vector3(0, -0.12, 0)),
    fov: 40,
    marks: [['windshield', 'blood_splatter', 0.55, 0.35]],
  }));
registerDefaultDeath('doorRattle', (ctx) =>
  genericDeath(ctx, {
    sound: 'door_open',
    look: anchor('windowCrankFR'),
    after: async () => {
      g.taxi.openDoor('fr', 1, 0.25);
      play('scream_close', { volume: 0.8, rate: 0.75 });
      await ctx.wait(0.6);
    },
    marks: [['fr', 'blood_handprint', 0.45, 0.5]],
  }));

export const DEFAULT_DEATHS = true;
void clamp;
void smoothstep;
