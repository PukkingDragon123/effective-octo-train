// Hand-animation test bench: cycles every hand path and measures it (window.__handsReport).
//   left:   Sri cycles the gesture actions (hail palm-down wave, wai, point, wave, giveItem, pay, nod, laugh)
//   middle: Ah Kong smokes (the burning cigarette, hand to the lips)
//   right:  Somchai sits, hands on the knees, talking (gestures)
//   player: Ton at a test wheel: steering sweeps, reach requests, held items (paper, keys, coffee, phone)
// Metrics per hand and frame: wrist bend (hand vs forearm), hand-orientation jumps (flips), finger-joint
// jumps (snaps), wrist inside the torso (penetration). ?hour=22 &cam=npc|wheel
import * as THREE from 'three';
import { sky, paintedMaterial } from '../render/index.js';
import { loadCharacterAssets, createHumanoidGLB, PlayerBodyGLB } from '../characters/glb/index.js';
import { CHARACTERS } from '../game/data/characters.js';

const SPEC = (id) => ({ ...(CHARACTERS[id]?.appearance || {}), id });
const ACTS = ['hail', 'wai', 'point', 'wave', 'giveItem', 'pay', 'nod', 'laugh'];
const HOLD = ['paper', 'keys', 'coffee', 'phone', null];

export default async function ({ engine, cameraRig, params }) {
  await loadCharacterAssets();
  const scene = engine.scene;
  sky.setHour(+(params.get('hour') || 22));
  scene.add(new THREE.HemisphereLight(0x5a6a80, 0x1a1612, 0.9));
  const key = new THREE.DirectionalLight(0xffe2c0, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), paintedMaterial({ color: 0x2a2724, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const sri = createHumanoidGLB(SPEC('sri'));
  sri.root.position.set(-1.1, 0, 0);
  sri.root.rotation.y = Math.PI;
  const kong = createHumanoidGLB(SPEC('ahKong'));
  kong.root.position.set(0, 0, 0);
  kong.root.rotation.y = Math.PI;
  if (!kong.held.cigarette) kong.holdItem('cigarette', 'R');
  const som = createHumanoidGLB(SPEC('somchai'));
  const stool = new THREE.Object3D();
  stool.position.set(1.15, 0.46, 0);
  stool.rotation.y = Math.PI;
  scene.add(stool);
  som.sitAt(stool, { pose: 'sit' });
  som.setTalking(true);
  for (const h of [sri, kong]) scene.add(h.root);

  // the player at a test wheel (off to the side)
  const seat = new THREE.Object3D();
  seat.position.set(4, 0.5, 0);
  scene.add(seat);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.34, -0.4);
  pivot.rotation.x = -0.45;
  seat.add(pivot);
  const spin = new THREE.Group();
  pivot.add(spin);
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 10, 48), paintedMaterial({ color: 0x1b1a19, roughness: 0.55 })));
  const reachT = new THREE.Object3D();
  reachT.position.set(0.25, 0.3, -0.45);
  seat.add(reachT);
  const player = new PlayerBodyGLB(SPEC('player'));
  scene.add(player.root);
  player.enterVehicle({ kind: 'taxi', anchors: { driverSeat: seat, steeringWheel: pivot }, parts: { steering: { spin } }, steeringRadius: 0.19 });

  // ---- cycle
  let t = 0, ai = -1, hi = -1;
  const all = [sri, kong, som, player.humanoid];
  engine.onUpdate((dt) => {
    t += dt;
    const a = Math.floor(t / 3.2) % ACTS.length;
    if (a !== ai) { if (ai >= 0) sri.stop(ACTS[ai]); ai = a; sri.play(ACTS[a]); }
    spin.rotation.z = Math.sin(t * 0.9) * 1.1;
    const hidx = Math.floor(t / 4) % HOLD.length;
    if (hidx !== hi) { hi = hidx; player.hold(HOLD[hidx]); }
    if (Math.floor(t / 6) !== Math.floor((t - dt) / 6)) player.reach(reachT, { hand: 'R' });
  }, 5);

  // ---- metrics (after the characters, order 20)
  const R = (window.__handsReport = { frames: 0, maxWristBend: {}, flips: {}, snaps: {}, torso: {} });
  const prevQ = new Map(), prevF = new Map();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q = new THREE.Quaternion();
  engine.onUpdate(() => {
    R.frames++;
    for (const h of all) {
      const id = h.look.id, I = h.t.index;
      for (const s of ['l', 'r']) {
        const k = id + '_' + s;
        const lo = h.rig.bones[I['lowerarm_' + s]], hb = h.rig.bones[I['hand_' + s]], mid = h.rig.bones[I['middle_01_' + s]];
        if (!lo || !hb || !mid) continue;
        lo.getWorldPosition(v1); hb.getWorldPosition(v2); mid.getWorldPosition(v3);
        const bend = v2.clone().sub(v1).angleTo(v3.clone().sub(v2));
        R.maxWristBend[k] = Math.max(R.maxWristBend[k] || 0, +bend.toFixed(2));
        hb.getWorldQuaternion(q);
        const pq = prevQ.get(k);
        if (pq && pq.angleTo(q) > 0.7) R.flips[k] = (R.flips[k] || 0) + 1;
        prevQ.set(k, q.clone());
        for (const f of ['index', 'middle', 'ring', 'pinky']) {
          const b = h.rig.bones[I[`${f}_02_${s}`]];
          if (!b) continue;
          const fk = k + f, pf = prevF.get(fk);
          if (pf && pf.angleTo(b.quaternion) > 0.45) R.snaps[k] = (R.snaps[k] || 0) + 1;
          prevF.set(fk, b.quaternion.clone());
        }
        const sp1 = h.rig.worldPos(I.spine_01, new THREE.Vector3()), sp3 = h.rig.worldPos(I.spine_03, new THREE.Vector3());
        const ab = sp3.clone().sub(sp1), kk = THREE.MathUtils.clamp(v2.clone().sub(sp1).dot(ab) / ab.lengthSq(), 0, 1);
        if (v2.distanceTo(sp1.addScaledVector(ab, kk)) < 0.09 * h.scale) R.torso[k] = (R.torso[k] || 0) + 1;
      }
    }
  }, 30);

  // ---- camera
  const eye = new THREE.Object3D();
  if (params.get('cam') === 'wheel') eye.position.set(4.9, 1.35, -1.2);
  else eye.position.set(0, 1.35, 3.4);
  scene.add(eye);
  const look = params.get('cam') === 'wheel' ? new THREE.Vector3(4, 0.95, -0.2) : new THREE.Vector3(0, 1.0, 0);
  const d = look.clone().sub(eye.position);
  cameraRig.attach(eye, scene, { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });
  cameraRig.lookEnabled = false;
  window.__chars = all;
}
