// Hands on the rear window (rule 14, after midnight): wet palms slap the rear glass, one, then more,
// faster, prints running in the rain; voices beg to be let in out of the rain. The slapping moves to
// the side windows, then the driver's window starts winding itself down. Crank it back up (QTE
// mash) or the arm comes in through the gap (death windowArm).
import * as THREE from 'three';
import { HandRig, paneFrame, panePoint, toBody, dirToBody, bodyOf } from '../../../creatures/index.js';
import { S, qte, rand } from '../helpers.js';

export function canStart() {
  return S.cameraInside() && (S.hour() >= 24);
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const body = bodyOf(t);
  const hands = [];
  const mkHand = () => {
    const H = new HandRig({ shape: { fingerScale: 1.25, bony: 0.7, nails: 0.06, forearm: 1.4, thickness: 0.9, cell: 0.026 }, pale: 0.55, wet: 0.9, twitch: 0.3, detailScale: 26 });
    H.mesh.scale.setScalar(0.1);
    H.setCurl({ i: -0.1, m: -0.1, r: -0.05, p: 0, t: 0.1 }, 100);
    E.cleanup(() => H.dispose());
    hands.push(H);
    return H;
  };
  // place a hand flat-palmed at (u, v) on a pane, `off` metres outside it
  const pose = (H, pane, u, v, off) => {
    const f = paneFrame(t, pane);
    const N = dirToBody(t, f.normal, new THREE.Vector3()).normalize();
    const U = dirToBody(t, f.up, new THREE.Vector3()).normalize();
    const Y = U.clone(), Z = N.clone().negate(), X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    H.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z.crossVectors(X, Y)));
    const p = toBody(t, panePoint(f, u - 0.5, v - 0.5, 0, new THREE.Vector3()), new THREE.Vector3());
    H.mesh.position.copy(p).addScaledVector(N, off).addScaledVector(U, -0.1);
    if (!H.mesh.parent) body.add(H.mesh);
    return N;
  };
  const slap = async (H, pane) => {
    const u = rand(0.18, 0.82), v = rand(0.35, 0.7);
    const N = pose(H, pane, u, v, 0.2);
    const start = H.mesh.position.clone();
    const end = start.clone().addScaledVector(N, -0.19);
    await E.until((dt, el) => {
      H.mesh.position.lerpVectors(start, end, Math.min(1, el / 0.07));
      return el >= 0.07;
    }, 0.2);
    S.sfx('knock', { object: H.mesh, volume: rand(0.6, 0.9), rate: rand(0.65, 0.85) });
    E.g.cameraRig?.shake?.(0.04);
    try {
      t.addGlassMark?.(pane, 'handprint', new THREE.Vector2(u, v), { size: rand(1.05, 1.3), angle: rand(-0.4, 0.4), drag: Math.random() < 0.5 });
    } catch (e) { /* optional */ }
    await E.until((dt, el) => {
      H.mesh.position.lerpVectors(end, start, Math.min(1, el / 0.35));
      return el >= 0.35;
    }, 0.5);
  };
  // 1. the rear window: one hand, then three, faster and faster
  E.event('encounter:rearSlap');
  const h0 = mkHand();
  for (let i = 0; i < 3 && E.alive; i++) {
    await slap(h0, 'rear');
    await E.wait(rand(0.6, 1.0));
  }
  mkHand();
  mkHand();
  const voices = E.resolve(E.def.lines);
  for (let round = 0; round < 7 && E.alive; round++) {
    await Promise.all(hands.map((H, i) => E.wait(i * rand(0.05, 0.16)).then(() => E.alive && slap(H, round > 4 ? (i % 2 ? 'rl' : 'rr') : 'rear'))));
    if (round === 2) E.whisper(voices[0], S.fromTaxi(0, 1.2, 2.2));
    await E.wait(Math.max(0.08, 0.5 - round * 0.06));
  }
  if (!E.alive) return;
  // 2. silence; then the driver's window starts to wind down by itself
  for (const H of hands) H.mesh.visible = false;
  await E.wait(1.2);
  if (!E.alive) return;
  E.whisper(voices[1], S.fromTaxi(1.3, 1.2, -0.1));
  const win = 'fr';
  await t.setControl?.('window', { window: win, amount: 1 }, { source: 'ghost', speed: 0.12 });
  const H = hands[0];
  H.mesh.visible = true;
  pose(H, win, 0.6, 0.98, 0.12);
  H.setCurl({ i: 0.7, m: 0.75, r: 0.7, p: 0.65, t: 0.3 }, 3);
  const res = await qte(E, {
    kind: 'mash', action: 'interact', count: 9, time: 4.8, decay: 0.3, slowmo: 0.9, dread: 0.85,
    onPress: () => S.sfx('window_crank', { object: t.anchors?.windowCrankFR || t.root, volume: 0.5, rate: rand(1.1, 1.4) }),
  });
  if (!E.alive) return;
  if (!res.ok) {
    E.deathCtx = { pane: win };
    E.violate('windowArm', 'opened');
    await E.wait(10);
    return;
  }
  // cranked up: the fingers are pinched out of the gap; then nothing
  await t.setControl?.('window', { window: win, amount: 0 }, { source: 'ghost', speed: 1.6 });
  S.sfx('bone_crack', { object: H.mesh, volume: 0.4, rate: 1.4 });
  H.mesh.visible = false;
  E.report('resolved', { outcome: 'cranked' });
  await E.wait(1.5);
  S.sfx('scratch_glass', { object: t.root, volume: 0.3, rate: 0.5 });
}
