// The late reflection (rule 4, ghost rides): a passenger who has NO reflection suddenly has one —
// a second behind her. In the rear-view mirror the double copies every movement late, then stops
// copying: it turns its face to the mirror and smiles while she still looks out of the window.
// Then she leans in: "เห็นฉันในกระจกแล้วใช่ไหม... งั้นมองหน้าฉันตรง ๆ สิ". Having a reflection
// does not make her alive. Look at her face directly and rule 4 takes you (B's face-gaze watch).
import * as THREE from 'three';
import { LAYERS } from '../../../core/layers.js';
import { S, g } from '../helpers.js';

export function canStart() {
  const r = g.ride?.data?.clues?.reflection ?? g.ride?.passenger?.reflection;
  return !!S.passengerHumanoid() && r === 'none';
}

export async function run(E) {
  const h = E.passenger;
  if (!h?.createReflectionDouble) return;
  const lag = 1.0;
  E.passengerSeat = S.passengerSeat(E.ctx);
  const dbl = h.createReflectionDouble({ stare: 0 });
  (h.root.parent || S.engine.scene).add(dbl.root);
  dbl.setFollow(false);
  dbl.setLayer?.(LAYERS.REFLECTION_ONLY);
  E.cleanup(() => dbl.dispose());
  // record the passenger's pose every frame, play it back `lag` seconds late
  const bones = h.rig?.bones || [];
  const dBones = dbl.boneList || [];
  const buf = [];
  let t = 0, frozen = null;
  const pool = [];
  const _m = new THREE.Matrix4();
  E.frame((dt) => {
    t += dt;
    h.root.updateWorldMatrix(true, false);
    const rec = pool.pop() || { m: new THREE.Matrix4(), ip: new THREE.Vector3(), iq: new THREE.Quaternion(), b: new Float32Array(bones.length * 7) };
    rec.t = t;
    rec.m.copy(h.root.matrixWorld);
    rec.ip.copy(h.inner.position);
    rec.iq.copy(h.inner.quaternion);
    for (let i = 0; i < bones.length; i++) {
      bones[i].quaternion.toArray(rec.b, i * 7);
      bones[i].position.toArray(rec.b, i * 7 + 4);
    }
    buf.push(rec);
    while (buf.length > 2 && buf[1].t <= t - lag) pool.push(buf.shift());
    const r = frozen || buf[0];
    if (!r) return;
    const parent = dbl.root.parent;
    parent.updateWorldMatrix(true, false);
    _m.copy(parent.matrixWorld).invert().multiply(r.m);
    _m.decompose(dbl.root.position, dbl.root.quaternion, dbl.root.scale);
    dbl.inner.position.copy(r.ip);
    dbl.inner.quaternion.copy(r.iq);
    for (let i = 0; i < dBones.length && i < bones.length; i++) {
      dBones[i].quaternion.fromArray(r.b, i * 7);
      dBones[i].position.fromArray(r.b, i * 7 + 4);
    }
  });
  // 1. it appears (a mirror glance shows it)
  await E.until(() => S.lookingAtMirror('mirror_rear'), E.scheduled ? 14 : 8);
  if (!E.alive) return;
  E.event('encounter:lagReflection');
  S.sfx('sting_low', { volume: 0.4 });
  await E.wait(3.5);
  if (!E.alive) return;
  // 2. it stops copying: the double holds its pose and turns its face to you in the mirror
  frozen = buf[buf.length - 1];
  // the reflection's head turns on its neck toward the mirror, the mouth stretching into a smile
  dbl.setOverrides?.({ stare: 1, neckTwist: E.passengerSeat === 'rearRight' ? 1.15 : -1.15, mouthStretch: 0.4, headRoll: 0.12 }, 1.6);
  S.sfx('whisper', { volume: 0.35, rate: 0.8 });
  await E.until(() => !S.lookingAtMirror('mirror_rear'), 6);
  if (!E.alive) return;
  // 3. the lure: she leans in and asks to be looked at (B's r4 face gaze decides)
  await E.say(E.def.lines);
  await E.wait(Math.max(2, E.duration - E.elapsed));
}
