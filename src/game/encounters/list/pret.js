// เปรต (the pret, 23–04:30, left roadside): five metres of starved body standing among the trees by the
// road, its high thin whistle carrying through the fog. As the taxi comes near, its head comes down,
// slowly, in held steps, toward the cab, and keeps bowing after it in the mirror.
// The folk rule (Ah Kong's r12, do not stop for what stands by the road; and never look up into a
// pret's face): drive on with your eyes off it and it passes. Stop near it, or hold its face in view
// looking up, and it notices: in stop-motion jumps it is beside the car, its neck stretching down to
// the passenger window. QTE still: eyes down, hold the amulet. Fail: it takes your head and the
// pinhole mouth tears wide (death pret; early in the game it screams in your face and lets go).
import { createPret, pretGeometry, prebuildSculpts } from '../../../creatures/index.js';
import { S, THREE, qte, rand } from '../helpers.js';
import { earlyGame } from '../scare.js';

export function canStart() {
  return S.cameraInside() && S.speedKmh() > 15;
}

export async function run(E) {
  // the sculpt is built in slices between frames (no hitch), before anything is placed
  try {
    await prebuildSculpts(() => pretGeometry());
  } catch (e) {
    console.warn('[pret] sculpt', e);
    return;
  }
  if (!E.alive) return;
  const p = createPret();
  E.debug = { p };
  let handed = false;
  E.cleanup(() => {
    if (handed) setTimeout(() => !p._inDeath && !p.disposed && p.dispose(), 20000);
    else p.dispose();
  });
  // among the trees on the near (left) side, facing the road and the oncoming cab
  const lat = -rand(6.2, 7.6);
  const spot = S.roadAhead(rand(135, 165), lat);
  const face = spot.right.clone().addScaledVector(spot.tangent, -0.7).normalize(); // toward the oncoming cab
  p.standAt(spot.pos, face);
  p.setGhostMotion('stopMotion', { instant: true });
  p.setOpacity(0);
  p.lookAt(() => S.fromTaxi(0, 1.3, 0));
  // a little cold light among the trunks, enough for a shape in the fog
  const lampAt = new THREE.Object3D();
  lampAt.position.copy(spot.pos).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(spot.right, 1.6);
  S.engine.scene.add(lampAt);
  E.track(lampAt);
  const lamp = E.track(S.tempLight({ object: lampAt, color: 0x9fb0c8, intensity: 0, distance: 10, decay: 1.6, flicker: 'none', glow: false, priority: 5 }));
  const head = () => p.headPosition;
  let shown = false, cried = 0, lowering = null, lookT = 0, stopT = 0, warned = false, noticed = null;
  await E.until((dt, el) => {
    const d = S.distTo(spot.pos);
    // fade in out of the fog, lit low
    const vis = d < 125 ? 1 : 0;
    if (vis && p.opacity < 1) p.setOpacity(Math.min(1, p.opacity + dt * 0.6));
    lamp?.setIntensity?.(1.6 * p.opacity);
    if (!shown && p.opacity > 0.4 && S.onScreen(head())) {
      shown = true;
      E.event('encounter:pret');
    }
    // its cry, again and again as you come
    if (d < 140 && el - cried > 6.5) {
      cried = el;
      p.whistle({ volume: d < 60 ? 1 : 0.75 });
    }
    // the head comes down toward the cab
    if (!lowering && d < 80) {
      lowering = p.lowerHead(() => S.fromTaxi(-0.4, 1.4, 0), { duration: 9, dist: 2.4 });
      p.setGhostMotion('tiltHold');
    }
    // r12 and the old word: do not stop for it, do not look up into its face
    const looking = S.isLooking(head(), 14) && S.lookPitchDeg() > 8 && d < 70;
    lookT = looking ? lookT + dt : Math.max(0, lookT - dt * 0.5);
    stopT = S.speedKmh() < 6 && d < 45 ? stopT + dt : Math.max(0, stopT - dt);
    if (!warned && (lookT > 0.5 || stopT > 0.7)) {
      warned = true;
      E.whisperRandom(head().clone());
      p.whistle({ volume: 1, rate: 1.08 });
    }
    if (lookT > 1.1) noticed = 'lookedUp';
    else if (stopT > 1.6) noticed = 'stopped';
    if (noticed) return true;
    // left behind: still bowing after you in the mirror
    return S.aheadOf(spot.pos) < -45;
  }, 70);
  if (!E.alive) return;
  if (!noticed) {
    E.outcome?.('passed');
    p.setGhostMotion('watcher');
    await E.wait(rand(3, 5));
    await p.vanish(2.5);
    return;
  }
  // it noticed you: in jumps it is beside the car, its neck coming down to the passenger window
  E.outcome?.('noticed');
  S.sfx('sting_reveal', { volume: 1 });
  p.setGhostMotion('nightmare');
  p.maxStretch = 5;
  const jump = () => {
    // three metres off the passenger side, a step ahead of the door, facing the cab
    const pos = S.fromTaxi(-3.0, 0, -0.6);
    pos.y = S.ground(pos.x, pos.z, pos.y);
    p.standAt(pos, S.taxiPos().sub(pos).setY(0).normalize());
  };
  jump();
  let jt = 0;
  E.frame((dt) => {
    jt += dt;
    if (jt > 0.42) {
      jt = 0;
      jump(); // keeps pace, but only in held frames
    }
  });
  p.whistle({ volume: 1, ref: 5, rate: 1.15 });
  p.lowerHead(() => S.fromTaxi(-1.05, 1.3, -0.15), { duration: 2.2, dist: 0.35 });
  S.taxi()?.setFog?.('fl', 0.5);
  E.cleanup(() => S.taxi()?.setFog?.('fl', 0.12));
  const res = await qte(E, {
    kind: 'still', action: 'amulet', hold: 3.2, time: 8.5, grace: 1.2, tolerance: 0.6, dread: 1,
    ok: () => S.lookPitchDeg() < 4 && !S.isLooking(head(), 22),
  });
  if (!E.alive) return;
  if (res.ok) {
    // its whistle breaks; the neck draws back up into the dark in jerks, and it is gone
    S.sfx('amulet_hum', { volume: 0.7 });
    p.whistle({ volume: 0.8, rate: 0.82 });
    E.outcome?.('repelled');
    await p.raiseHead(1.6);
    await p.vanish(1.2);
    return;
  }
  // it has you: the pinhole tears open in your face
  p.lowerHead(() => S.engine.camera.getWorldPosition(new THREE.Vector3()), { duration: 0.7, dist: 0.26, steps: true });
  if (!(await E.wait(0.7))) return;
  p.openMouth(0.55, 5);
  S.sfx('scream_far', { synth: true, object: p.faceAnchor, volume: 1, rate: 1.25 });
  S.sfx('scare_hit', { volume: 1 });
  S.cameraRig.shake(0.9);
  if (!(await E.wait(0.9))) return;
  if (earlyGame('pret', 'r12')) {
    // this early it lets go: the head snaps back up into the trees
    p.openMouth(0, 4);
    E.outcome?.('released');
    await p.raiseHead(0.6);
    await p.vanish(0.8);
    return;
  }
  handed = true;
  E.deathCtx = { pret: p, fair: true, fromQte: true };
  E.violate('pret', 'eaten');
  await E.wait(12);
}
