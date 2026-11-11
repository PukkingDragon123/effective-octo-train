// Krathong on the flood (rule 10): the road dips under black water; a slow drift of krathong —
// banana-leaf floats with candles and incense lit — crosses it in the mist. Rule 10: honk twice to ask
// the spirits for passage: the krathong part, the candles flare gold. Drive in without asking: the
// candles gutter out one by one, pale hands rise out of the water and hold the wheels: rev free
// (QTE mash throttle) or the water keeps you (death 'flood').
import * as THREE from 'three';
import { RULE_PARAMS } from '../../data/rules.js';
import { createKrathong, createFloodWater, HandRig, bodyOf } from '../../../creatures/index.js';
import { S, qte, rand, onControl, g } from '../helpers.js';

export const stationary = true;
export function canStart() {
  return S.cameraInside() && S.speedKmh() > 15 && !g.ride;
}

export async function run(E) {
  const t = E.taxi;
  if (!t) return;
  const D = E.ctx.distance ?? 70;
  const r = S.roadAhead(D, 0);
  const water = createFloodWater(10, 14);
  water.root.position.copy(r.pos).add(new THREE.Vector3(0, 0.1, 0));
  water.root.rotation.y = r.yaw;
  S.engine.scene.add(water.root);
  E.cleanup(() => water.dispose());
  // the drift: krathong crossing from the left verge to the right
  const kr = [];
  for (let i = 0; i < 11; i++) {
    const k = createKrathong(rand(0.9, 1.15));
    S.engine.scene.add(k.root);
    E.cleanup(() => k.dispose());
    const light = E.track(S.tempLight({ object: k.flame, color: 0xffb35a, intensity: 0.6, distance: 3.5, decay: 2, flicker: 'candle', glow: { size: 0.22, color: 0xffc070, opacity: 0.9 }, priority: 2 }));
    kr.push({ k, light, lat: -5 + rand(-1, 2) - i * 0.9, along: rand(-5.5, 5.5), spin: rand(-0.3, 0.3), ph: rand(0, 6), lit: 1, part: 0 });
  }
  let mist = null;
  try {
    mist = E.g.particles?.emit?.('mist', { position: r.pos.clone(), radius: 14, height: 1.0, intensity: 1.3 });
    E.track(mist);
  } catch (e) { /* optional */ }
  const frogs = E.track(S.sfxLoop('frog_croak', { position: r.pos, volume: 0.35 }));
  void frogs;
  // honks: twice within the window = asking for passage
  let honks = [], asked = false;
  onControl(E, 'horn', (on) => {
    if (!on || asked) return;
    const now = E.elapsed;
    honks = honks.filter((x) => now - x < RULE_PARAMS.honkWindowSeconds);
    honks.push(now);
    if (honks.length >= 2 && S.aheadOf(r.pos) > 4) asked = true;
  });
  let gutter = 0;
  E.frame((dt, el) => {
    water.update(el);
    for (const c of kr) {
      c.lat += dt * 0.22;
      if (c.lat > 5.5) c.lat = -5.5;
      // asked: they drift aside from the lane, leaving a path
      const push = asked ? Math.sign(c.along || 1) * 2.4 : 0;
      c.part += (push - c.part) * (1 - Math.exp(-dt * 0.8));
      const p = r.pos.clone().addScaledVector(r.right, c.lat).addScaledVector(r.tangent, c.along + c.part);
      p.y = r.pos.y + 0.1 + Math.sin(el * 1.3 + c.ph) * 0.02;
      c.k.root.position.copy(p);
      c.k.root.rotation.set(Math.sin(el + c.ph) * 0.06, c.ph + el * c.spin, Math.cos(el * 0.8 + c.ph) * 0.05);
      const want = asked ? 1.6 : gutter > c.ph / 6 ? 0 : 1;
      c.lit += (want - c.lit) * (1 - Math.exp(-dt * 2));
      c.light?.setIntensity?.(0.6 * c.lit);
    }
  });
  await E.until(() => S.aheadOf(r.pos) < 45, 40);
  if (!E.alive) return;
  E.event('encounter:krathongFlood');
  E.report('start');
  let whispered = false;
  const entered = await E.until(() => {
    if (!whispered && S.aheadOf(r.pos) < 26 && !asked) {
      whispered = true;
      E.whisper(E.def.lines[0], r.pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
    }
    return S.aheadOf(r.pos) < 6.5;
  }, 60);
  if (!E.alive) return;
  if (!entered || asked) {
    if (asked) {
      S.sfx('wind_chime', { position: r.pos, volume: 0.5 });
      try {
        if (g.rules && 'respect' in g.rules) g.rules.respect = (g.rules.respect || 0) + 1;
      } catch (e) { /* optional */ }
      E.outcome('honked');
      E.report('resolved', { outcome: 'honked' });
    }
    await E.until(() => S.aheadOf(r.pos) < -10, 30);
    return;
  }
  // entered without asking: the candles die, hands come up and hold the wheels
  S.sfx('splash', { object: t.root, volume: 0.9, rate: 0.8 });
  for (let i = 0; i < 6; i++) {
    gutter = (i + 1) / 6;
    await E.wait(0.12);
  }
  const body = bodyOf(t);
  const hands = [];
  for (const [x, z] of [[-0.8, -1.4], [0.8, -1.35], [-0.85, 1.2]]) {
    const H = new HandRig({ shape: { fingerScale: 1.3, bony: 0.85, nails: 0.1, forearm: 2.6, thickness: 0.85, cell: 0.026 }, pale: 0.7, wet: 1, twitch: 0.4, detailScale: 22 });
    H.mesh.scale.setScalar(0.12);
    body.add(H.mesh);
    H.mesh.position.set(x * 1.1, -0.6, z);
    H.mesh.rotation.set(0, 0, x < 0 ? 0.5 : -0.5);
    H.setCurl(-0.2, 100);
    E.cleanup(() => H.dispose());
    hands.push({ H, y0: -0.6, x });
  }
  S.sfx('sting_reveal', { volume: 0.9 });
  const sim = t.physicsSim;
  const res = await qte(E, {
    kind: 'mash', action: 'forward', count: 11, time: 5.2, decay: 0.35, slowmo: 0.85, dread: 1,
    onTick: (st, dt) => {
      if (sim) sim.v *= Math.exp(-2.2 * dt * (1 - st.progress * 0.7));
      for (const h of hands) {
        h.H.mesh.position.y += (0.35 - h.H.mesh.position.y) * (1 - Math.exp(-dt * 4));
        h.H.setCurl(0.95, 6);
      }
      if (Math.random() < dt * 2) S.sfx('splash', { object: t.root, volume: 0.4, rate: rand(0.7, 1.1) });
    },
  });
  if (!E.alive) return;
  if (!res.ok) {
    E.violate('flood', 'held');
    await E.wait(10);
    return;
  }
  // torn free: the hands slide back under
  S.sfx('splash', { object: t.root, volume: 1, rate: 0.7 });
  for (const h of hands) h.H.setCurl(-0.3, 4);
  await E.until((dt) => {
    for (const h of hands) h.H.mesh.position.y -= dt * 1.5;
    return hands[0].H.mesh.position.y < -0.9;
  }, 2);
  E.report('resolved', { outcome: 'tornFree' });
  await E.until(() => S.aheadOf(r.pos) < -10, 20);
}
