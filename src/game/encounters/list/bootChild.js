// A child's voice from the boot (rule 5): small knocks, then "พี่ครับ... ในนี้มืดมากเลย". It begs
// to be let out. Promise to open it and the lid unlatches by itself and something far heavier than
// a child drags at the car: keep your foot down (QTE hold throttle). Then three hard knocks: rule 5
// is armed (B: stop and you die). Opening the boot yourself is the same as stopping.
import { RULE_PARAMS } from '../../data/rules.js';
import { S, qte, rand, g, THREE } from '../helpers.js';

export function canStart() {
  return S.cameraInside() && !g.ride;
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const trunk = t.anchors?.trunk || t.root;
  g.dialogue?.setSpeaker?.('bootChild', { nameTH: '', nameEN: '', voice: { gender: 'm', age: 7, pitch: 1.45, rate: 0.9, ghost: 0.45, whisper: true } });
  // opening the boot yourself (any time while it runs)
  let selfLid = false;
  E.frame(() => {
    if (!selfLid && !E._violated && (t.state?.doors?.trunk ?? 0) > 0.25) {
      E.outcomeKey ? E.violate('trunk', 'opened') : E.outcome('opened');
    }
  });
  // 1. small knocks, scratching
  for (let i = 0; i < 3 && E.alive; i++) {
    S.sfx('knock_trunk', { object: trunk, volume: 0.28, rate: rand(1.5, 1.8) });
    if (i === 1) S.sfx('scratch_glass', { object: trunk, volume: 0.25, rate: 1.6 });
    await E.wait(rand(0.7, 1.2));
  }
  if (!E.alive) return;
  // 2. the voice
  await E.say(E.def.lines, { object: trunk });
  if (!E.alive || E.outcomeKey) return E._outcomeP;
  E.event('encounter:bootChild');
  const key = await E.ask();
  if (key && !E.outcomeKey) E.outcome(key);
  await E._outcomeP;
  if (!E.alive || E._violated) return;
  if (E.outcomeKey === 'open') {
    // the latch clicks; the lid lifts on its own; the car is dragged back
    selfLid = true;
    S.sfx('glovebox', { object: trunk, volume: 0.6, rate: 0.6 });
    t.openDoor?.('trunk', 0.22, 1.4);
    S.sfx('rumble_sub', { object: trunk, volume: 0.8 });
    const sim = t.physicsSim;
    const res = await qte(E, {
      kind: 'hold', action: 'forward', hold: 2.6, time: 6, drain: 0.5, slowmo: 0.85, dread: 0.9,
      onTick: (st, dt) => {
        if (sim) sim.v *= Math.exp(-(st.held ? 0.25 : 1.4) * dt);
        if (Math.random() < dt * 3) S.sfx('scratch_glass', { object: trunk, volume: 0.5, rate: 0.5 });
      },
    });
    if (!E.alive) return;
    if (!res.ok) {
      E.violate('trunk', 'dragged');
      await E.wait(10);
      return;
    }
    t.openDoor?.('trunk', 0, 0.12);
    S.sfx('door_close', { object: trunk, volume: 1, rate: 0.8 });
    E.g.cameraRig?.shake?.(0.3);
    await E.wait(0.4);
    selfLid = false;
  }
  // 3. three hard knocks: rule 5 is armed now
  const [a, b] = RULE_PARAMS.knockIntervalSeconds;
  for (let i = 1; i <= 3 && E.alive; i++) {
    S.sfx('knock_trunk', { object: trunk, volume: 0.9 + i * 0.05, rate: 0.9 });
    if (i === 1) E.event('knock1');
    if (i < 3) await E.wait(rand(a, b));
  }
  if (!E.alive) return;
  if (!E.managed) E.event('knock3');
  E.arm({});
  // the voice is not a child's any more
  E.whisper({ who: 'voice', th: 'จอดสิ...', en: 'Stop...', tone: 'whisper' }, trunk.getWorldPosition ? trunk.getWorldPosition(new THREE.Vector3()) : null);
  if (E.managed) {
    await E.until(() => !!E.outcomeKey && E.outcomeKey !== 'open' && E.outcomeKey !== 'no' && E.outcomeKey !== 'silent', RULE_PARAMS.knockDangerSeconds + 2);
    return;
  }
  const st = (() => {
    let s = 0;
    return (dt) => ((s = S.speedKmh() < RULE_PARAMS.knockStopSpeedKmh ? s + dt : 0), s > RULE_PARAMS.knockStopSeconds);
  })();
  const stopped = await E.until(st, RULE_PARAMS.knockDangerSeconds);
  if (stopped && E.alive) E.violate('trunk', 'stopped');
}
