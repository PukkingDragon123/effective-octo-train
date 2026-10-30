// หนูผีหน้าคน (local encounter, at most once a night): a bandicoot rat with a man's face hides in
// the passenger footwell (or behind the passenger headrest when someone sits in front). Scratching,
// a wet sniff. When you look toward the noise — or after a while, from the edge of your view — it
// leaps at your face screeching; face, fur and whiskers fill the view; then it scrambles over the
// dash and out of an open window, or is gone.
import { createFaceRat } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export function canStart() {
  return S.cameraInside();
}

export async function run(E) {
  const t = E.taxi;
  if (!t || !S.cameraInside()) return;
  const front = S.passengerSeat(E.ctx) === 'frontPassenger';
  const spot = E.ctx.spot || (front ? 'headrest' : Math.random() < 0.7 ? 'footwell' : 'headrest');
  const rat = E.track(createFaceRat());
  rat.hideAt(t, spot);
  const at = () => rat.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0));
  // cues from where it hides
  let cue = 0;
  const cues = (async () => {
    while (E.alive && rat.pose === 'crouch') {
      await E.wait(rand(0.9, 1.8));
      if (!E.alive || rat.pose !== 'crouch') break;
      S.sfx(cue++ % 3 === 2 ? 'whisper' : 'scratch_glass', { position: at(), volume: cue % 3 === 2 ? 0.25 : 0.3, rate: rand(1.8, 2.4) });
    }
  })();
  void cues;
  // it waits until it is looked toward (or gives up waiting and comes from the edge of the view)
  let lookT = 0;
  await E.until((dt) => {
    if (S.isLooking(at(), 24)) lookT += dt;
    return lookT > 0.35;
  }, E.ctx.wait ?? rand(6, 9));
  if (!E.alive) return;
  E.event('encounter:faceRat');
  E.report?.('start');
  const qte = E.g.qte;
  const leap = rat.leapAt({ hold: qte ? 0.6 : 0.4 });
  if (!qte) {
    await leap;
    await E.wait(0.5);
    return;
  }
  // QTE: it lands on your face (wind-up 0.28 s + flight 0.24 s) — SWAT IT OFF, one timed press
  await E.wait(0.5);
  if (!E.alive) return;
  const res = await qte.run({ kind: 'press', action: 'interact', time: 1.35, slowmo: 0.3, dread: 1 });
  if (!E.alive) return;
  if (!res.ok) {
    // it clamps on and does not let go
    E.violate('faceRat', 'bit');
    await E.wait(10);
    return;
  }
  // swatted: flung against the passenger glass, squealing, gone under the seats
  rat.vanish();
  rat.light?.remove?.();
  rat.light = null;
  S.sfx('thump_roof', { object: t.anchors?.frontPassengerSeat || t.root, volume: 0.9, rate: 1.6 });
  S.sfx('scream_close', { object: t.anchors?.frontPassengerSeat || t.root, volume: 0.55, rate: 2.3 });
  E.g.camfx?.flinch?.(0.5);
  const fx = E.g.camfx;
  if (fx) {
    // the arm swings across: the head turns with the swat
    let k = 1;
    const off = E.frame((dt) => {
      k = Math.max(0, k - dt * 3);
      fx.tugYaw = 0.09 * k * k;
      if (k <= 0) {
        fx.tugYaw = 0;
        off();
      }
    });
    E.cleanup(() => (fx.tugYaw = 0));
  }
  try {
    t.addGlassMark?.('fl', 'blood_smear', new THREE.Vector2(0.45, 0.42), { size: 0.9, drag: true });
  } catch (e) {
    /* cosmetic */
  }
  await Promise.race([leap, E.wait(2)]);
  await E.wait(0.4);
}
