// The woman on the boot (rule 3, mirrors only): in the rear-view and side mirrors a woman sits on
// the boot lid with her back to you, wringing out long wet hair. She turns round, leans to the rear
// glass and lays a hand flat on it; a print blooms; she asks you to turn and look. In direct view
// there is nobody. Rule 3: whatever you hear from behind, never turn around (B arms r3: lookBack).
import * as THREE from 'three';
import { LAYERS } from '../../../core/layers.js';
import { createCreatureHumanoid, CREATURE_SPECS } from '../../../creatures/index.js';
import { S, rand } from '../helpers.js';

export function canStart() {
  return S.cameraInside() && S.speedKmh() > 15;
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const body = t.bodyInner || t.root;
  const h = E.track(createCreatureHumanoid({ ...CREATURE_SPECS.windowWoman, id: 'bootWoman' }, { layer: LAYERS.REFLECTION_ONLY }));
  body.add(h.root);
  h.setLayer(LAYERS.REFLECTION_ONLY);
  const lid = t.anchors?.trunk?.position || new THREE.Vector3(0, 0.98, 2.12);
  h.root.position.set(0.05, lid.y - 0.42, lid.z - 0.35);
  h.root.rotation.set(0, 0, 0); // facing away from the car (+Z is behind it)
  h.root.rotation.y = Math.PI; // humanoids face -Z: turn to face backwards
  h.setMode('sit');
  h.setGhost({ stare: 1, noBlink: 1, headPitch: 0.35 }, 100);
  h.play('cry', { loop: true });
  S.sfx('thump_roof', { object: t.anchors?.trunk || t.root, volume: 0.5, rate: 0.7 });
  // drips of her hair on the boot lid
  let drip = null;
  try {
    drip = E.g.particles?.emit?.('drips', { object: h.bones?.Head || h.root, radius: 0.15, height: 1.0 });
    E.track(drip);
  } catch (e) { /* optional */ }
  // she is seen in a mirror first
  await E.until(() => S.lookingAtMirror(), E.scheduled ? 12 : 8);
  if (!E.alive) return;
  E.event('encounter:bootWoman');
  E.arm({ mode: 'death', death: 'lookBack', seat: 'rearCenter' });
  await E.wait(rand(2.2, 3.2));
  if (!E.alive) return;
  // she turns round to the rear glass, slowly
  h.stop('cry');
  h.setGhostMotion?.('headRaise');
  const y0 = h.root.rotation.y;
  await E.until((dt, el) => {
    const k = Math.min(1, el / 2.4);
    h.root.rotation.y = y0 - Math.PI * k * k * (3 - 2 * k);
    return k >= 1;
  }, 3);
  if (!E.alive) return;
  h.setMode('crouch');
  const rear = S.fromTaxi(0.05, lid.y + 0.25, lid.z - 0.75);
  const tgt = new THREE.Object3D();
  body.add(tgt);
  tgt.position.copy(body.worldToLocal(rear.clone()));
  E.track(tgt);
  h.play('pressFaceToGlass', { target: tgt, normal: S.taxiForward().negate() });
  h.lookAt(S.engine.camera, { speed: 2, unlimited: true });
  S.sfx('knock', { object: t.anchors?.trunk || t.root, offset3: [0, 0.3, -0.5], volume: 0.5, rate: 0.8 });
  try {
    t.addGlassMark?.('rear', 'handprint', new THREE.Vector2(0.42, 0.52), { size: 1.2 });
    t.setFog?.('rear', 0.55);
  } catch (e) { /* optional */ }
  for (const l of E.resolve(E.def.lines)) {
    if (!E.alive || E._violated) break;
    await E.whisper(l, rear);
    await E.wait(rand(0.8, 1.4));
  }
  if (E.managed) {
    await E.until(() => !!E.outcomeKey || E._violated, Math.max(3, E.duration - E.elapsed));
  } else {
    const looked = await E.until(() => S.lookingBack(), Math.max(3, E.duration - E.elapsed));
    if (looked && E.alive) {
      E.violate('lookBack', 'lookedBack');
      await E.wait(8);
      return;
    }
  }
  if (!E.alive) return;
  // gone from the glass; the print stays
  h.stop('pressFaceToGlass');
  for (let k = 1; k >= 0; k -= 0.1) {
    h.setOpacity(k);
    await E.wait(0.05);
  }
  t.setFog?.('rear', 0.2);
}
