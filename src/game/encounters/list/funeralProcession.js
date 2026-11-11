// A funeral procession crossing the road (r12's exception: a procession WALKS, it does not stand).
// Out of the trees on the left: a monk leading with the white sacred thread, four bearers with a
// gilded coffin on bamboo poles at their shoulders, mourners in white and black, barefoot, eyes
// down; chanting, a gong. You must STOP before them and SWITCH THE ENGINE OFF (hold to turn the
// key) until the last mourner has crossed. Drive into them, move off, or keep the engine running
// when the coffin crosses your lane: they turn their faces to you all at once (death 'procession').
import * as THREE from 'three';
import { createCoffin, createCreatureHumanoid, CREATURE_SPECS, DynamicTube } from '../../../creatures/index.js';
import { paintedMaterial } from '../../../render/index.js';
import { S, qte, rand, g } from '../helpers.js';

export const stationary = true;
export function canStart() {
  return S.cameraInside() && S.speedKmh() > 15;
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const D0 = E.ctx.distance ?? 62;
  const a = S.roadAhead(D0, -8.5), b = S.roadAhead(D0 + 1.5, 10);
  const centre = S.roadAhead(D0 + 0.7, -1.55).pos; // where it crosses our lane
  const P = b.pos.clone().sub(a.pos).setY(0).normalize();
  const Q = new THREE.Vector3(-P.z, 0, P.x);
  const yaw = Math.atan2(-P.x, -P.z);
  const gy = (x, z) => S.ground(x, z, a.pos.y);
  // ---- the procession (offsets behind the leader along -P, lateral along Q)
  const members = [];
  const add = (spec, off, lat, role) => {
    const h = E.track(createCreatureHumanoid(spec));
    S.engine.scene.add(h.root);
    h.setGhost({ headPitch: role === 'monk' ? 0.15 : 0.45, stare: 1, still: 0.2 }, 100);
    h.setMode('walk', { formal: true });
    members.push({ h, off, lat, role });
    return h;
  };
  const monk = add(CREATURE_SPECS.alms(0), 0, 0, 'monk');
  for (let i = 0; i < 4; i++) add(CREATURE_SPECS.mourner(i), i < 2 ? -2.6 : -6.0, i % 2 ? 0.62 : -0.62, 'bearer');
  for (let i = 4; i < 8; i++) add(CREATURE_SPECS.mourner(i), -7.6 - (i - 4) * 1.25, i % 2 ? 0.35 : -0.35, i === 7 ? 'last' : 'mourner');
  const coffin = createCoffin();
  E.track(coffin);
  S.engine.scene.add(coffin.root);
  coffin.root.rotation.y = Math.atan2(P.x, P.z);
  // white sacred thread from the monk's hand to the coffin
  const threadMat = paintedMaterial({ color: 0xf2efe6, roughness: 0.8, brush: 0.2, puddles: 0 });
  const thread = new DynamicTube(14, 4, () => 0.0045, threadMat);
  S.engine.scene.add(thread.mesh);
  E.track(thread.mesh);
  E.cleanup(() => threadMat.dispose());
  const threadPts = Array.from({ length: 14 }, () => new THREE.Vector3());
  // a cold light walking with them (readable at 60 m in the fog)
  const lamp = E.track(S.tempLight({ position: a.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), color: 0xd6e2ff, intensity: 0, distance: 12, decay: 1.6, flicker: 'none', glow: false, priority: 6 }));
  const chant = E.track(S.sfxLoop('monk_chant', { position: a.pos, volume: 0.0 }));
  let along = -1; // leader's progress along the path (m)
  const pathLen = a.pos.distanceTo(b.pos);
  let walking = false, turned = false, speed = 1.0;
  const anchor = new THREE.Vector3();
  const place = (dt) => {
    if (walking) along += speed * dt;
    anchor.copy(a.pos).addScaledVector(P, along);
    for (const m of members) {
      const p = anchor.clone().addScaledVector(P, m.off).addScaledVector(Q, m.lat);
      p.y = gy(p.x, p.z);
      m.h.root.position.copy(p);
      if (!turned) m.h.root.rotation.y = yaw;
      m.h.setOpacity(Math.min(1, Math.max(0, (m.off + along + 3) / 3)) * (m.fade ?? 1));
    }
    const cc = anchor.clone().addScaledVector(P, -4.3);
    cc.y = gy(cc.x, cc.z) + 1.33 + Math.sin(E.elapsed * 3.6) * 0.015;
    coffin.root.position.copy(cc);
    coffin.root.visible = along - 4.3 + 2 > -1;
    // bearers' hands on the poles
    const grips = coffin.root.userData.grips;
    members.filter((m) => m.role === 'bearer').forEach((m, i) => {
      // coffin local +X is -Q: a bearer on the +Q side holds the x = -0.44 pole
      const grip = grips[(i < 2 ? 2 : 0) + (m.lat > 0 ? 0 : 1)];
      m.h.setHandTarget(m.lat > 0 ? 'L' : 'R', grip, { weight: 1, fingers: 'grip', grip: 1, blend: 0.2 });
    });
    // the thread sags from the monk's hand to the coffin's front finial
    const hand = monk.bones?.hand_r || monk.bones?.handR;
    const h0 = hand ? hand.getWorldPosition(new THREE.Vector3()) : monk.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const h1 = coffin.root.localToWorld(new THREE.Vector3(0, 0.72, 1.0));
    for (let i = 0; i < threadPts.length; i++) {
      const k = i / (threadPts.length - 1);
      threadPts[i].lerpVectors(h0, h1, k).y -= Math.sin(k * Math.PI) * 0.35;
    }
    thread.set(threadPts);
    lamp?.setPosition?.(cc.clone().add(new THREE.Vector3(0, 2.2, 0)));
    chant?.setPosition?.(cc);
  };
  place(0);
  E.frame((dt) => place(dt));
  // ---- they come out of the trees as the car approaches
  await E.until(() => S.aheadOf(centre) < 58, 30);
  if (!E.alive) return;
  walking = true;
  E.event('encounter:funeralProcession');
  E.report('start', { exception: true });
  lamp?.setIntensity?.(9);
  chant?.setVolume?.(0.7, 2);
  let gongT = 0;
  E.frame((dt) => {
    gongT -= dt;
    if (gongT <= 0) {
      gongT = rand(3.2, 4.4);
      S.sfx('gong', { position: anchor, volume: 0.55, rate: 0.82 });
    }
  });
  // the rule, said once, from the procession
  let hinted = false;
  // ---- watch: stop in time, engine off before the coffin crosses the lane, never move off
  let phase = 'approach', fail = null, keyQte = null, stopT = 0;
  const lanePassed = () => {
    const last = members[members.length - 1];
    return last.h.root.position.clone().sub(centre).dot(P) > 3;
  };
  const coffinInLane = () => Math.abs(coffin.root.position.clone().sub(centre).dot(P)) < 2.2;
  const done = await E.until((dt) => {
    const d = S.aheadOf(centre), kmh = S.speedKmh();
    if (!hinted && d < 46) {
      hinted = true;
      E.whisper(E.def.lines?.[0], anchor.clone().add(new THREE.Vector3(0, 1.5, 0)));
    }
    if (phase === 'approach') {
      if (kmh < 3) stopT += dt;
      else stopT = 0;
      if (d < 8 && kmh > 3) return (fail = 'drove');
      if (stopT > 0.6 && d > 3) phase = 'stopped';
      if (lanePassed() && d > 8) return true; // they were gone before you arrived
    } else {
      if (kmh > 4) return (fail = 'movedOff');
      const engineOn = !!t.state?.engineOn;
      if (engineOn && !keyQte && stopT > 1.2) {
        // hold to turn the key back (or switch off yourself)
        keyQte = qte(E, { kind: 'hold', action: 'interact', hold: 1.6, time: 7, drain: 0.6, dread: 0.5 }).then((r) => {
          if (r.ok && E.alive) t.setControl?.('ignition', 'off', { source: 'ghost' });
        });
      }
      stopT += dt;
      if (engineOn && coffinInLane()) return (fail = 'engine');
      if (lanePassed()) return true;
    }
    return false;
  }, 75);
  if (!E.alive) return;
  if (fail) {
    // every face turns to the car at once
    turned = true;
    walking = false;
    for (const m of members) {
      m.h.stop?.('walk');
      m.h.setMode('stand');
      m.h.lookAt(S.engine.camera, { speed: 14, unlimited: true });
      m.h.setGhost({ headPitch: 0, headRoll: 0.25, stare: 1, mouthStretch: 0.3 }, 12);
    }
    S.sfx('sting_reveal', { volume: 1 });
    S.sfx('gong', { position: anchor, volume: 1, rate: 0.6 });
    await E.wait(0.9);
    E.violate('procession', fail);
    await E.wait(10);
    return;
  }
  // passed: the last mourner stops at the glass and looks in, then they are gone into the fog
  const last = members[members.length - 1];
  if (S.distTo(last.h.root.position) < 14) {
    last.h.lookAt(S.engine.camera, { speed: 1, weight: 0.9 });
    await E.wait(2.2);
  }
  E.outcome('waited');
  E.report('resolved', { exception: true, outcome: 'waited' });
  await E.until((dt) => {
    for (const m of members) m.fade = Math.max(0, (m.fade ?? 1) - dt * 0.35);
    coffin.root.visible = members[0].fade > 0.35;
    return members[0].fade <= 0;
  }, 5);
  void g;
}
