// ผีตายโหง at the accident curve (22–23, 00–01): a crushed, blood-soaked figure crouched by the
// wreaths and the old wrecked motorbike, twitching. As the headlights reach it, it stands up the
// wrong way and turns its ruined face to the car; a few broken steps toward the road; gone.
import { createPhiTaiHong } from '../../../creatures/index.js';
import { bloodDecalMaterial } from '../../../render/index.js';
import { S, THREE, engine } from '../helpers.js';

export async function run(E) {
  const lm = S.landmark('accidentCurve');
  let pos;
  const helmet = lm?.anchors?.helmetAnchor || lm?.prop?.helmetAnchor;
  if (helmet?.isObject3D) pos = helmet.getWorldPosition(new THREE.Vector3());
  else if (lm?.waitPos) pos = new THREE.Vector3(lm.waitPos.x, lm.waitPos.y ?? 0, lm.waitPos.z);
  else pos = S.roadAhead(55, -5.2).pos;
  const r0 = S.roadAhead(0, 0);
  pos.addScaledVector(r0.right, -0.8);
  pos.y = S.ground(pos.x, pos.z, pos.y);
  const p = E.track(createPhiTaiHong({ sex: Math.random() < 0.7 ? 'm' : 'f' }));
  engine.scene.add(p.root);
  p.root.position.copy(pos);
  p.root.rotation.y = Math.atan2(-r0.right.x, -r0.right.z); // facing the road
  p.crouch();
  // a fresh pool under it
  try {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), bloodDecalMaterial({ seed: 7, smear: 0.6, wetness: 1, coverage: 0.75, opacity: 0.95 }));
    decal.position.copy(pos).add(new THREE.Vector3(0, 0.02, 0));
    engine.scene.add(decal);
    E.track(decal);
  } catch (e) { /* optional */ }
  // wait for the headlights
  await E.until(() => S.distTo(pos) < 26 && S.aheadOf(pos) > 2, 45);
  if (!E.alive) return;
  E.event('encounter:phiTaiHong');
  E.whisperRandom(pos.clone().add(new THREE.Vector3(0, 1, 0)));
  await p.rise(E.taxi?.root);
  const road = pos.clone().addScaledVector(r0.right, 2.4);
  p.walkBroken(road, 0.5);
  E.frame(() => p.humanoid.lookAt(engine.camera, { speed: 3, unlimited: true }));
  await E.until(() => S.aheadOf(pos) < -6, E.duration + 10);
  if (!E.alive) return;
  // in the mirror it is standing in the road behind you, then not
  await E.wait(1.2);
  E.whisperRandom(pos);
  await p.vanish(0.6);
}
