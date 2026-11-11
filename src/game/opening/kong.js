// Ah Kong in motion and in voice. He never teleports: he turns, gets up, walks (round the taxi),
// and sits down on his stool with a transition. He talks through the dialogue system: idle chatter
// between cigarettes, reactions, and scolding that escalates in three levels (data/kongTalk.js);
// at level 3 the caller has him do the task himself.
//
//   kongTurn(pointOrYaw, dur) · kongStand() · kongWalk(pos, {face, speed, timeout}) · kongSit()
//   kongSay(lines, {queue}) · kongIdle(stage, enabledFn) · new Nag(ctx, [t1, t2, t3]) · scold(ctx, level)
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { easeInOut } from '../../core/math.js';
import { lm, wpos, yawTo, ground, runLines, resolve } from './common.js';
import { KONG_IDLE, KONG_SCOLD, KONG_ASK } from '../data/kongTalk.js';
import { C, O, SIL } from '../data/lines.js';

const SPEED = 1.3; // m/s: brisk for his age

/** Walk to a world point around the parked taxi (never through it), at his pace. */
async function walkRound(h, target, timeout) {
  const t = g.taxi;
  const pts = [];
  if (t?.root) {
    t.root.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(t.root.matrixWorld).invert();
    const a = h.root.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const b = target.clone().applyMatrix4(inv);
    const inside = (z) => z > -2.6 && z < 2.6;
    if (Math.sign(a.x) !== Math.sign(b.x) && (inside(a.z) || inside(b.z)) && Math.abs(a.x) < 4 && Math.abs(b.x) < 4) {
      const zEnd = a.z + b.z > -0.4 ? 3.0 : -3.1;
      for (const sx of [Math.sign(a.x), Math.sign(b.x)]) pts.push(new THREE.Vector3(sx * 1.45, 0, zEnd).applyMatrix4(t.root.matrixWorld));
    }
  }
  pts.push(target);
  const end = g.engine.time + timeout;
  for (const p of pts) {
    p.y = ground(p.x, p.z);
    const left = Math.max(0.5, end - g.engine.time);
    await Promise.race([h.walkTo(p, { speed: SPEED }), wait(left)]);
  }
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const kong = () => g.ahKong;

/** Turn to face a point (or a yaw) over `dur` seconds. Resolves when he faces it. */
export function kongTurn(to, dur = 0.7) {
  const h = kong();
  if (!h || h._seated || !to) return Promise.resolve();
  const y0 = h.root.rotation.y;
  let d = (typeof to === 'number' ? to : yawTo(h.root.position, to)) - y0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) < 0.04) return Promise.resolve();
  const T = Math.max(0.25, dur * Math.min(1, Math.abs(d) / 1.6 + 0.35));
  return new Promise((res) => {
    let t = 0;
    const off = g.engine.onUpdate((dt) => {
      if (h.walk || h._seated) {
        off();
        return res();
      }
      t += dt;
      h.root.rotation.y = y0 + d * easeInOut(Math.min(1, t / T));
      if (t >= T) {
        off();
        res();
      }
    }, 22);
  });
}

/** Up from his stool: he rises and takes a half step forward (the pose blends to standing). */
export async function kongStand() {
  const h = kong();
  if (!h?._seated) return;
  const seat = h.root.parent;
  seat?.getWorldQuaternion?.(_q);
  const yaw = _e.setFromQuaternion(_q, 'YXZ').y;
  const p = h.root.getWorldPosition(new THREE.Vector3());
  p.add(_v.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(0.3));
  p.y = ground(p.x, p.z);
  h.detach?.(g.engine.scene);
  if (h.root.parent !== g.engine.scene) g.engine.scene.attach(h.root);
  h._seated = false;
  h.setGroundFn?.((x, z) => ground(x, z));
  h.root.position.copy(p);
  h.root.rotation.set(0, yaw, 0);
  h.setMode?.('stand');
  await wait(0.4);
}

/** Walk somewhere (round the parked taxi when it is in the way), then face something. */
export async function kongWalk(pos, o = {}) {
  const h = kong();
  if (!h || !pos) return;
  h.root.visible = true;
  await kongStand();
  const target = pos.clone();
  target.y = ground(target.x, target.z);
  if (h.root.position.distanceTo(target) > 0.3) {
    await kongTurn(target, 0.5);
    const timeout = o.timeout ?? Math.min(24, h.root.position.distanceTo(target) / 1.0 + 3);
    const go = o.aroundTaxi === false ? h.walkTo(target, { speed: o.speed ?? SPEED }) : walkRound(h, target, timeout);
    await Promise.race([go, wait(timeout)]);
    if (h.walk) h.stopWalking?.();
  }
  if (o.face) await kongTurn(o.face, 0.6);
}

/** Back to his stool: he walks up to it, turns his back to it and sits down. */
export async function kongSit() {
  const h = kong();
  const seat = lm('garage')?.anchors?.oldManSeat;
  if (!h || !seat || h._seated) return;
  const sp = wpos(seat, new THREE.Vector3());
  seat.getWorldQuaternion(_q);
  const fwd = _v.set(0, 0, -1).applyQuaternion(_q).setY(0).normalize().clone(); // a seated man faces −Z
  const approach = sp.clone().addScaledVector(fwd, 0.42);
  await kongWalk(approach, { face: approach.clone().addScaledVector(fwd, 2) });
  if (h._seated) return;
  h.sitAt(seat, { pose: 'sit', blend: 0.55 });
  await wait(0.55);
}

/** Say lines (skipped when someone is already talking, unless queue). */
export function kongSay(lines, o = {}) {
  if (!lines?.length) return Promise.resolve();
  // once Ton is in the car (outside the tutorial, where he instructs through the window) he lets him go
  if (!o.inCar && g.actions?.inTaxi && g.fsm?.currentName !== 'tutorial') return Promise.resolve();
  if (!o.queue && g.dialogue?.busy) return Promise.resolve();
  return runLines(resolve(lines), { alive: o.alive });
}

/**
 * Ton asks him something: "what next?" (answered with `nextLines`), "why pray?", "where were you?"
 * (opts.where), or nothing. Short answers through the dialogue system.
 */
export function kongAsk(nextLines, opts = {}) {
  if (g.dialogue?.busy) return Promise.resolve();
  const A = KONG_ASK.options;
  const opt = [O('next', A.next.th, A.next.en), O('whyPray', A.whyPray.th, A.whyPray.en)];
  if (opts.where) opt.push(O('where', A.where.th, A.where.en));
  opt.push(SIL());
  const next = nextLines?.length ? nextLines : KONG_ASK.nothingLeft;
  const line = C(opt, { id: 'askKong', timeout: 8, branches: { next: [{ who: 'player', th: A.next.th, en: A.next.en }, ...next], whyPray: [{ who: 'player', th: A.whyPray.th, en: A.whyPray.en }, ...KONG_ASK.whyPray], where: [{ who: 'player', th: A.where.th, en: A.where.en }, ...KONG_ASK.where], silent: [] } });
  return runLines(resolve([line]));
}

/** Scold, level 1..3 (data/kongTalk.js KONG_SCOLD[ctx]). */
export function scold(ctx, level) {
  const set = KONG_SCOLD[ctx] || KONG_SCOLD.slow;
  return kongSay(set[Math.max(0, Math.min(2, level - 1))], { queue: level >= 2 });
}

/** Idle chatter while he waits or watches (one line every 30–50 s, between other talk). */
export function kongIdle(stage, enabled) {
  let next = 16 + Math.random() * 10;
  let i = Math.floor(Math.random() * KONG_IDLE.length);
  stage.update((dt) => {
    if (!enabled() || g.dialogue?.busy || !kong()?.root?.visible || g.actions?.inTaxi) return;
    next -= dt;
    if (next > 0) return;
    next = 30 + Math.random() * 20;
    kongSay([KONG_IDLE[i++ % KONG_IDLE.length]]);
  }, 31);
}

/** Slowness meter: update(dt) returns the level just reached (1..3), else 0; reset() on progress. */
export class Nag {
  constructor(ctx = 'slow', times = [25, 50, 80]) {
    this.ctx = ctx;
    this.times = times;
    this.reset();
  }
  reset() {
    this.t = 0;
    this.level = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.level < 3 && this.t >= this.times[this.level]) return ++this.level;
    return 0;
  }
}
