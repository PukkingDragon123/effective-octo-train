// Door handles rattling (local encounter, at most once a night, the car slow or stopped): something
// outside tries the doors one after another. The rear handles clack; a pale handprint blooms on the
// driver's glass; then the driver's handle is wrenched, harder and harder. QTE: HOLD THE LOCK
// (F / LMB / pad A / touch): the ring fills while you hold. Let go and the door cracks open, cold air
// and fingers in the gap; let the ring empty and it is torn open (death 'doorRattle').
import { S, THREE, g, rand } from '../helpers.js';

export const stationary = true;

export function canStart() {
  const t = S.taxi();
  if (!t || !S.cameraInside() || S.speedKmh() > 25) return false;
  const d = t.state?.doors || {};
  if (Math.max(d.fl || 0, d.fr || 0, d.rl || 0, d.rr || 0) > 0.05) return false;
  const ph = g.ride?.phase;
  return ph !== 'boarding' && ph !== 'resolving';
}

export async function run(E) {
  const t = E.taxi;
  if (!t || !S.cameraInside()) return;
  const body = t.bodyInner || t.root;
  const at = (x, y, z) => ({ object: body, offset3: [x, y, z] });
  E.event('encounter:doorRattle');
  // 1. the rear handles, one side then the other; the car rocks on its springs
  for (const [x, z] of [[-0.92, 0.55], [0.92, 0.6]]) {
    S.sfx('knock', { ...at(x, 0.95, z), volume: 0.55, rate: 1.7, count: 3, interval: 0.11 });
    E.g.cameraRig.shake(0.05);
    if (!(await E.wait(rand(0.8, 1.1)))) return;
  }
  // 2. a hand on the driver's glass, right beside your face
  try {
    t.addGlassMark?.('fr', 'handprint', new THREE.Vector2(0.32, 0.4), { size: 1.0, angle: -0.3 });
  } catch (e) {
    /* cosmetic */
  }
  S.sfx('scratch_glass', { ...at(0.95, 1.2, -0.05), volume: 0.5, rate: 0.8 });
  if (!(await E.wait(0.5))) return;
  const qte = E.g.qte;
  if (!qte) {
    await E.wait(E.duration);
    return;
  }
  // 3. the driver's handle: hold the lock
  let rattle = 0;
  let crack = 0;
  const res = await qte.run({
    kind: 'hold',
    action: 'interact',
    hold: 3.0,
    time: 6.5,
    drain: 0.45,
    slowmo: 0.85,
    dread: 0.9,
    onTick: (st, dt) => {
      rattle -= dt;
      const held = qte._down('interact');
      // the door gives a little whenever the lock is not held
      crack += ((held ? 0 : 0.06) - crack) * Math.min(1, dt * (held ? 10 : 3));
      t.state.doors.fr = Math.max(0, crack);
      if (rattle <= 0) {
        rattle = rand(0.14, 0.3) * (1.2 - st.progress * 0.5);
        S.sfx('knock', { ...at(0.95, 0.95, -0.1), volume: 0.5 + st.t * 0.07, rate: rand(1.4, 2.0) });
        E.g.cameraRig.shake(held ? 0.03 : 0.08);
      }
    },
  });
  t.state.doors.fr = 0;
  if (!E.alive) return;
  if (!res.ok) {
    E.violate('doorRattle', 'opened');
    await E.wait(10);
    return;
  }
  // relief: the rattling stops dead. Fingernails drag slowly along the door, away to the back.
  S.sfx('door_close', { ...at(0.95, 0.9, 0), volume: 0.35 });
  if (!(await E.wait(1.0))) return;
  S.sfx('scratch_glass', { ...at(0.95, 1.0, 0.8), volume: 0.35, rate: 0.6 });
  if (!(await E.wait(1.6))) return;
  S.sfx('giggle', { ...at(1.6, 1.0, 3), volume: 0.3, rate: 0.8 });
  await E.wait(1.2);
}
