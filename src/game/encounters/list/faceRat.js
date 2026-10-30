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
  await rat.leapAt({ hold: 0.4 });
  await E.wait(0.5);
}
