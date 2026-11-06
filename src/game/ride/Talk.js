// Talking with the passenger while they ride (data/talk.js). Interact while looking at them (front
// seat) or at their face in the rear-view mirror (back seats: turning round is rule 3): Ton picks
// one of up to three questions he has not asked yet, or says nothing (ends it). Answers go through
// the ride's own dialogue queue, so they never talk over a scripted beat. Some passengers question
// Ton first, once, ~20 s into the ride; that reply changes their trust (trust.<pid>.talkAsk).
//
//   installTalk(ride) -> { dispose(), converse() }
import * as THREE from 'three';
import { g } from '../context.js';
import { interact } from '../../core/Interact.js';
import { LAYERS } from '../../core/layers.js';
import { C, O, SIL } from '../data/lines.js';
import { TALK, TALK_QUESTIONS, TALK_LABELS } from '../data/talk.js';
import { resolveLines } from '../data/logic.js';

export function installTalk(ride) {
  const pid = ride.data?.id;
  const T = TALK[pid];
  if (!T) return { dispose() {}, converse() {} };
  const asked = new Set();
  let busy = false;
  let round = 0;
  let alive = true;
  const items = [];
  const ctx = () => ({ save: g.save, taxi: g.taxi?.state, hour: g.clock?.hour, passengerId: pid });
  const can = () => alive && ride.alive && ride.phase === 'riding' && ride.passenger?.aboard !== false && !busy && !ride.playing && !(ride.queue?.length) && g.dialogue?.idle !== false && !g.qte?.active;

  const reg = (object, pos, size, reach) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshBasicMaterial());
    box.layers.set(LAYERS.INTERACT);
    box.position.set(pos[0], pos[1], pos[2]);
    object.add(box);
    const it = interact.register({ id: `talk.${pid}.${items.length}`, object: box, labelTH: 'คุย', labelEN: 'Talk', icon: 'talk', reach, enabled: () => can() && Object.keys(TALK_QUESTIONS).some((k) => T[k] && !asked.has(k)), onUse: () => converse() });
    items.push(() => {
      interact.unregister(it);
      box.removeFromParent();
      box.geometry.dispose();
    });
  };
  const seat = ride.data?.seat || 'rearLeft';
  if (seat === 'frontPassenger' && ride.passenger?.humanoid?.root) reg(ride.passenger.humanoid.root, [0, 0.62, 0], [0.45, 0.55, 0.4], 1.8);
  const mir = g.taxi?.anchors?.rearviewMirror;
  if (mir) reg(mir, [0, 0.01, 0], [0.22, 0.08, 0.07], 1.4); // their face in the mirror

  async function converse() {
    if (!can()) return;
    busy = true;
    try {
      for (let n = 0; n < 4 && alive && ride.alive; n++) {
        const left = Object.keys(TALK_QUESTIONS).filter((k) => T[k] && !asked.has(k)).slice(0, 3);
        if (!left.length) break;
        const id = `talk.${pid}.${round++}`;
        const branches = {};
        for (const k of left) branches[k] = [TALK_QUESTIONS[k], ...T[k]];
        const line = C([...left.map((k) => O(k, TALK_LABELS[k].th, TALK_LABELS[k].en)), SIL('(nothing)')], { id, timeout: 9, branches });
        const r = await ride.playLines(resolveLines([line], ctx()), { front: true });
        const key = r?.choices?.[id];
        if (!key || key === 'silent') break;
        asked.add(key);
        bumpKnowledge(key);
      }
    } catch (e) {
      console.warn('[talk]', e);
    } finally {
      busy = false;
    }
  }

  // what Ton learnt goes on the paper as a pencil note when the knowledge system takes notes
  function bumpKnowledge(key) {
    try {
      g.knowledge?.noteTalk?.(pid, key);
      if (g.save) {
        const f = (g.save.flags ||= {});
        f[`talked.${pid}.${key}`] = true;
      }
    } catch (e) {
      /* optional */
    }
  }

  // some of them question you first
  let askT = 0;
  const off = T.asks
    ? g.engine.onUpdate((dt) => {
        if (!alive || !ride.alive || ride.phase !== 'riding') return;
        askT += dt;
        if (askT < 20 || g.save?.flags?.[`talkAsked.${pid}`]) return;
        if (busy || ride.playing || ride.queue?.length || g.dialogue?.idle === false) return;
        if (g.save) (g.save.flags ||= {})[`talkAsked.${pid}`] = true;
        busy = true;
        ride.playLines(resolveLines(T.asks, ctx())).finally(() => (busy = false));
      }, 31)
    : null;

  return {
    converse,
    dispose() {
      alive = false;
      off?.();
      for (const f of items.splice(0)) f();
    },
  };
}
