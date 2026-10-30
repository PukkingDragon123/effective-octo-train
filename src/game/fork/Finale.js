// Ride 9 finale (engineer B): the mist gate, the last rule test, the empty dawn drive back to the
// shrine fork, the ending. Flags (logic.GAMEPLAY_FLAGS): somchaiFork (set by Fork.js),
// gateLookBack (the gate's setOnLookBack), fatherDelivered, finalFork. The ending is
// logic.resolveEnding(moment, ctx) → fsm.go('ending', { id }).
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { wait, until } from '../util.js';
import { clamp } from '../../core/math.js';
import { resolveEnding, resolveLines } from '../data/logic.js';
import { CHARACTERS } from '../data/characters.js';
import { driveToStop, taxiRoad, fogFade, teleportAlong } from '../ride/fx.js';
import { dropOff } from './Fork.js';

const ctx = () => ({ save: g.save, taxi: g.taxi.state, hour: g.clock.hour });

function goEnding(id) {
  if (!id) return;
  const s = g.save;
  if (s) {
    s.endingsSeen ||= [];
    if (!s.endingsSeen.includes(id)) s.endingsSeen.push(id);
    s.stage = 'ending';
    g.persist();
  }
  g.rules?.reset?.();
  g.fsm.go('ending', { id, ending: id });
}

export async function finale(ride) {
  const data = ride.data;
  const fin = data.finale || {};
  const t = g.taxi;
  const p = ride.passenger;
  const alive = () => ride.alive;
  const flags = g.save.flags;

  // ---------------------------------------------------------------- 1. the mist gate
  const drop = dropOff('left');
  await driveToStop(drop.id, drop.s, alive);
  if (!alive()) return 'dead';
  ride.phase = 'gate';
  ride.r3Phase = 'gate';
  g.audio?.music?.setMood?.('silence', { fade: 3 });
  g.sky?.setFogBoost?.(2.8, 5);
  g.sky?.setGroundMist?.(2.4, 5);
  ride.emit('gateReached');
  await Promise.race([ride.playBlock('arriveCorrect', { interrupt: true, clearQueue: true }), wait(10)]);
  if (!alive()) return 'dead';

  // he steps out and walks into the mist ahead of the car
  const L = g.world.road.length(drop.id);
  const smp = g.world.road.sample(drop.id, Math.min(L - 4, drop.s + 26));
  await p.alight({ to: smp.pos.clone(), fade: 9 });
  if (!alive()) return 'dead';
  t.setControlsEnabled(false);
  await wait(2.6);
  if (!alive()) return 'dead';

  // ---------------------------------------------------------------- 2. his voice from the back seat
  const ch = CHARACTERS.somchai || {};
  g.dialogue.setSpeaker('somchaiBack', { nameTH: ch.nameTH || 'สมชาย', nameEN: ch.nameEN || 'Somchai', voice: { ...(ch.voice || {}), ghost: 0.35 }, humanoid: null, object: t.anchors.rearRightSeat });
  g.dialogue.alias('somchai', 'somchaiBack');
  g.dialogue.alias('passenger', 'somchaiBack');
  let lookedBack = false;
  const offLook = bus.on('rules:lookBack', () => {
    lookedBack = true;
    g.dialogue.interrupt();
  });
  // "Dad... not yet": his voice comes right behind your head
  const headrest = new THREE.Object3D();
  headrest.position.copy(t.anchors.driverEye.position).add(new THREE.Vector3(0, -0.02, 0.3));
  t.anchors.driverEye.parent.add(headrest);
  const offWait = bus.on('dialogue:choice', (d) => {
    if (d?.id === 'somchai_gate' && d.key === 'wait') {
      g.dialogue.setSpeaker('somchaiBack', { object: headrest });
      g.audio?.play?.('breath_neck', { object: headrest, volume: 0.35 });
    }
  });
  // rule 3 has no exception: looking back at the gate is the endless shift
  g.rules?.arm('r3', { until: 600, force: true, params: { mode: 'ending', ending: 'endless', setOnLookBack: { gateLookBack: true }, seat: 'rearRight' } });
  t.setControlsEnabled(true); // he said: just drive (the gate test runs while you can drive on)
  g.audio?.play?.('breath', { object: t.anchors.rearRightSeat, volume: 0.25 });
  let key = 'silent';
  try {
    await g.dialogue.play(resolveLines(fin.stepOut || [], ctx()));
    if (!lookedBack && alive()) {
      const reply = resolveLines(fin.gateReply ? [fin.gateReply] : [], ctx());
      const r = await g.dialogue.play(reply);
      key = r.choices.somchai_gate ?? 'silent';
      if (key === 'sorry' && !lookedBack) {
        // forgiveness: the mist turns gold
        g.cine.amulet(0.55, 3);
        g.postfx.params.tint.setRGB(1.08, 0.98, 0.82);
        g.postfx.params.temperature = 0.25;
        g.sky?.setFogBoost?.(2.2, 4);
      }
    }
    if (!lookedBack && alive() && key !== 'sorry') await g.dialogue.play(resolveLines(fin.walkAway || [], ctx()));
    // the test lasts a little longer: his presence fades from the seat
    if (!lookedBack && alive()) await until(() => lookedBack || !alive(), key === 'wait' ? 6 : 4.5);
  } finally {
    offLook();
    offWait();
    headrest.removeFromParent();
    g.rules?.disarm('r3', lookedBack ? 'lookedBack' : 'drove');
    g.dialogue.alias('somchai', null);
    g.dialogue.alias('passenger', null);
  }
  if (!alive()) return 'dead';

  if (lookedBack || flags.gateLookBack) {
    flags.gateLookBack = true;
    await Promise.race([g.dialogue.play(resolveLines(fin.endless || [], ctx())), wait(5)]);
    const e = resolveEnding('gate', ctx());
    goEnding(e?.id || 'endless');
    return 'ending';
  }
  flags.fatherDelivered = true;
  g.knowledge?.learnPassenger(data.id, data.identity);
  (g.save.delivered ||= {}).somchai = 'left';
  g.save.flags.fatherDelivered = true;
  g.persist();

  // ---------------------------------------------------------------- 3. the empty dawn drive
  ride.phase = 'lastFork';
  g.cine.amulet(0, 4);
  g.audio?.music?.setMood?.('dawn', { fade: 6 });
  g.sky?.setFogBoost?.(1.6, 8);
  g.clock?.advanceTo(29.78);
  const start = taxiRoad();
  await until(() => {
    if (!alive()) return true;
    const r = taxiRoad();
    return !r || (start && r.id === start.id && r.s > start.s + 70) || r.id === 'main';
  }, 30);
  if (!alive()) return 'dead';
  // the road folds back to the shrine fork one last time
  await fogFade(() => teleportAlong('main', g.world.fork.decisionS - 230, { lateral: -1.55, keepHeading: false, speed: clamp(t.speedKmh, 15, 35) }), { tint: '#f6e7cf', after: 1.5 });
  if (!alive()) return 'dead';
  g.clock?.advanceTo(29.85);
  // Ah Kong through the radio: which way home?
  if (!t.state.radioOn) t.setControl('radio', true);
  g.dialogue.setSpeaker('ahKongRadio', { ...(CHARACTERS.ahKong ? { nameTH: CHARACTERS.ahKong.nameTH, nameEN: CHARACTERS.ahKong.nameEN, voice: { ...CHARACTERS.ahKong.voice, ghost: 0.4 } } : {}), humanoid: null, object: t.anchors.radioKnob });
  g.dialogue.alias('ahKong', 'ahKongRadio');
  g.audio?.radio?.setStatic?.(0.35);
  await wait(1.2);
  await Promise.race([g.dialogue.play(resolveLines(fin.lastFork || [], ctx())), wait(10)]);
  g.dialogue.alias('ahKong', null);
  g.audio?.radio?.setStatic?.(0);
  if (!alive()) return 'dead';

  // ---------------------------------------------------------------- 4. the last fork
  let side = null;
  await until(() => {
    if (!alive()) return true;
    const r = taxiRoad();
    if (!r) return false;
    if ((r.id === 'ghost' || r.id === 'human') && r.s > 4) side = r.id === 'ghost' ? 'left' : 'right';
    else if (r.id === 'main' && r.s >= g.world.fork.decisionS && Math.abs(r.lateral) > 2.7) side = r.lateral < 0 ? 'left' : 'right';
    return !!side;
  });
  if (!alive() || !side) return 'dead';
  flags.finalFork = side;
  g.persist();
  const e = resolveEnding('finalFork', ctx());
  // let the choice breathe: a few seconds down the chosen road
  await wait(2.5);
  goEnding(e?.id || (side === 'left' ? 'join_father' : 'dawn'));
  return 'ending';
}

void THREE;
