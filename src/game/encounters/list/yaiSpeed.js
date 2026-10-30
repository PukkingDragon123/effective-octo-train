// ยายสปีด (23–01): Granny sprints alongside at any speed with an impossible gait, overtakes, and
// turns her head 180° to grin at you. Slow down under 35 km/h and she passes and is gone. Stare at
// her and speed up and she lands on the hood (scare); the amulet throws her off. Keep flooring it
// with her on the glass and she comes through it.
import { createYaiSpeed } from '../../../creatures/index.js';
import { S, onBus, rand } from '../helpers.js';

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const y = E.track(createYaiSpeed({ world: E.g.world }));
  S.engine.scene.add(y.root);
  const side = 'L';
  y.runAlongside(t, side, { along: 10, lat: 2.0, world: E.g.world });
  E.event('yaiSpeed');
  E.event('encounter:yaiSpeed');
  let amulet = false;
  onBus(E, 'amulet:hold', (e) => (amulet = !!e?.active));
  // she catches up from behind (side mirror first), then runs beside the driver's line of sight
  y.setAlong(0.2, 1.9);
  let stareT = 0, slowT = 0, v0 = null, phase = 'run', turned = false;
  const laugh = async () => {
    while (E.alive && phase === 'run') {
      await E.wait(rand(2.5, 4.5));
      if (E.alive && phase === 'run') E.whisperRandom(y.humanoid.headPosition.clone());
    }
  };
  laugh();
  const ok = await E.until((dt, el) => {
    const kmh = t.speedKmh;
    if (!turned && el > 4) {
      turned = true;
      y.setAlong(-1.4);
      y.turnHead(true);
    }
    // slowing down: she passes
    if (kmh < 35 && el > 2.5) slowT += dt;
    else slowT = 0;
    if (slowT > 1.5) {
      E.outcome('slowed');
      return true;
    }
    // staring + accelerating: the hood
    const looking = S.isLooking(y.humanoid.headPosition, 14);
    if (looking) {
      stareT += dt;
      if (v0 === null) v0 = kmh;
    } else {
      stareT = Math.max(0, stareT - dt);
      if (stareT === 0) v0 = null;
    }
    if (stareT > 0.6 && v0 !== null && kmh > v0 + 8) {
      E.outcome('raced');
      return true;
    }
    return false;
  }, E.duration);
  phase = 'done';
  if (!E.alive) return;
  if (!ok || E.outcomeKey === 'slowed') {
    if (!E.outcomeKey) E.outcome('slowed');
    S.sfx('giggle', { object: y.humanoid.root, volume: 0.5, rate: 0.7 });
    await y.passAndVanish();
    return;
  }
  // raced: she lands on the hood
  await y.landOnHood(t);
  const kmhAtLand = t.speedKmh;
  let floor = 0;
  const res = await E.until((dt, el) => {
    if (amulet || E.g.director?.amuletHeld) return 'amulet';
    if (t.speedKmh > Math.max(70, kmhAtLand + 10)) floor += dt;
    if (floor > 2.2) return 'death';
    return el > 6.5;
  }, 8);
  if (!E.alive) return;
  if (floor > 2.2) {
    E.deathCtx = { yai: y };
    E.violate('yaiSpeed', 'raced');
    await E.wait(12); // she stays on the glass through the death cinematic
    return;
  }
  void res;
  S.sfx('amulet_hum', { volume: 0.7 });
  await y.throwOff(t);
}
