// The fork at ศาลเจ้ามารวย (rule r2: LEFT for the dead, RIGHT for the living). Engineer B.
//   resolveFork(ride, side) -> Promise<'next'|'dead'|'ending'|'retry'>
//     correct: ghosts walk into the mist gate, humans get off at the village stop and pay.
//     wrong:   arriveWrong, the wrong-aftermath encounter (ride 4), then g.kill(deathOnWrong).
//              A living passenger down the LEFT road: the giant hand rises ahead, a QTE (hold the
//              brake, HandBrake.js). Stop in time and the road folds back before the fork ('retry',
//              once per ride); miss it and the hand takes the car.
//     ride 9:  somchaiFork flag → wrong_home (a death and an ending) or the gate finale (Finale.js).
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { resolveEnding } from '../data/logic.js';
import { driveToStop } from '../ride/fx.js';
import { finale } from './Finale.js';
import { giantHandBrake } from './HandBrake.js';

const _v = new THREE.Vector3();

/** (spline, s) of the drop-off on a branch: the mist gate (ghost) or the village stop (human). */
export function dropOff(side) {
  const w = g.world;
  const id = side === 'left' ? 'ghost' : 'human';
  const lm = w.landmarks[side === 'left' ? 'ghostGate' : 'humanVillageStop'];
  const L = w.road.length(id);
  let s = lm?.roadRef?.id === id ? lm.roadRef.s : L * (side === 'left' ? 0.45 : 0.42);
  if (side === 'left') s -= 9; // stop short of the gate: they walk through it
  else s += 2.2;
  return { id, s: Math.max(20, Math.min(L - 10, s)), lm };
}

export async function resolveFork(ride, side) {
  const data = ride.data;
  const alive = () => ride.alive;
  ride.phase = 'resolving';
  const flags = g.save.flags;
  const ctx = () => ({ save: g.save, taxi: g.taxi.state, hour: g.clock.hour });
  g.sky?.setFogBoost?.(side === 'left' ? 2.6 : 1.3, 4);
  g.sky?.setGroundMist?.(side === 'left' ? 2.2 : 1.1, 4);

  // ---------------------------------------------------------------- ride 9: the father
  if (data.id === 'somchai') {
    flags.somchaiFork = side;
    const e = resolveEnding('fork', ctx());
    if (e) {
      // wrong_home: he realises where he is (arriveWrong), then A's EndingState stages the house
      // and the porch; it counts as a death and loops the night (EndingState → garage restart)
      await Promise.race([ride.playBlock('arriveWrong', { interrupt: true, clearQueue: true }), wait(16)]);
      if (!alive()) return 'dead';
      g.knowledge?.learnPassenger(data.id, data.identity);
      g.rules?.reset?.();
      g.fsm.go('ending', { id: e.id, ending: e.id });
      return 'ending';
    }
    return finale(ride);
  }

  const correct = side === data.fork;
  // ---------------------------------------------------------------- wrong
  if (!correct) {
    g.audio?.music?.setMood?.('tension', { fade: 2 });
    const death = data.deathOnWrong || 'giantHand';
    if (death === 'giantHand' && side === 'left' && !ride._handWarned && g.qte) {
      // the hand rises ahead while they are still realising where they are: hold the brake
      ride._handWarned = true;
      const talk = ride.playBlock('arriveWrong', { interrupt: true, clearQueue: true });
      await Promise.race([talk, wait(2.4)]);
      if (!alive()) return 'dead';
      const r = await giantHandBrake(ride);
      if (!alive()) return 'dead';
      g.knowledge?.learnPassenger(data.id, data.identity);
      if (r.survived) {
        ride.phase = 'riding';
        return 'retry';
      }
      g.kill?.('giantHand', { cause: 'wrongFork', hand: r.hand });
      return 'dead';
    }
    await Promise.race([ride.playBlock('arriveWrong', { interrupt: true, clearQueue: true }), wait(14)]);
    if (!alive()) return 'dead';
    if (data.wrongAftermath) {
      const p = ride.passenger;
      // ride 4: the boy is gone, his reflection stays seated
      if (p?.humanoid && !p.disposed) p.humanoid.setGhost({ stare: 1, unlimited: 1 }, 4);
      const handle = ride.startEncounter(data.wrongAftermath);
      await Promise.race([handle?.done || wait(6), wait(9)]);
      if (!alive()) return 'dead';
    }
    g.knowledge?.learnPassenger(data.id, data.identity);
    g.kill?.(data.deathOnWrong || 'giantHand', { cause: 'wrongFork' });
    return 'dead';
  }

  // ---------------------------------------------------------------- correct
  const drop = dropOff(side);
  await driveToStop(drop.id, drop.s, alive);
  if (!alive()) return 'dead';
  const t = g.taxi;
  const p = ride.passenger;
  ride.phase = 'resolving';
  if (side === 'left') ride.emit('gateReached');
  await Promise.race([ride.playBlock('arriveCorrect', { interrupt: true, clearQueue: true }), wait(18)]);
  if (!alive()) return 'dead';
  const human = data.identity === 'human';
  const pay = p.payment;
  if (human) {
    // coins / notes from a warm hand
    try {
      p.humanoid.play('pay')?.catch?.(() => {});
    } catch (e) {
      /* ignore */
    }
    g.audio?.play?.(pay?.type === 'coins' ? 'coins' : 'paper_rustle', { object: p.humanoid.root, volume: 0.7 });
    await wait(1.2);
  }
  // the fare is settled: meter off, the ว่าง lamp lights again
  if (t.state.meterOn) t.setControl('meter', false);
  // where they go: ghosts into the mist through the gate, people up the village lane
  const L = g.world.road.length(drop.id);
  const toS = Math.min(L - 4, drop.s + (human ? 4 : 22));
  const smp = g.world.road.sample(drop.id, toS);
  const to = smp.pos.clone().addScaledVector(smp.right, human ? -9 : 0);
  await p.alight({ to, fade: human ? 0 : 5 });
  if (!alive()) return 'dead';
  if (!human) {
    // what they leave behind
    if (data.id === 'womanWhite') t.setInteriorBlood(p.seatId, g.settings.get('gore') === 'reduced' ? 0.25 : 0.45);
    if (data.id === 'boyM') t.setInteriorBlood(p.seatId, 0.2);
    g.audio?.play?.(pay?.type === 'leaves' ? 'paper_rustle' : 'paper_rustle', { object: t.seats[p.seatId], volume: 0.4 });
    g.audio?.play?.('wind_chime', { position: to, volume: 0.35 });
  }
  if (pay?.note) {
    await wait(human ? 0.6 : 2.2);
    if (!alive()) return 'dead';
    await Promise.race([ride.playLines([{ who: 'player', th: pay.note.th, en: pay.note.en, tone: 'thought', pause: 0.8 }]), wait(8)]);
  }
  if (!alive()) return 'dead';
  g.knowledge?.learnPassenger(data.id, data.identity);
  (g.save.delivered ||= {})[data.id] = side;
  // let the walker get a head start, then hand the car back
  t.setControlsEnabled(true);
  g.sky?.setFogBoost?.(1, 6);
  g.sky?.setGroundMist?.(1, 6);
  setTimeout(() => {
    if (!p.disposed && !human) p.gone = true;
  }, 6000);
  void _v;
  return 'next';
}
