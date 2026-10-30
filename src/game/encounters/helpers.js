// Small helpers shared by encounter modules (./list/*.js).
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { engine } from '../../core/Engine.js';
import * as S from './stage.js';

/** Listen to bus 'taxi:control' for one control; fn(value). Auto-removed with the encounter. */
export function onControl(E, control, fn) {
  const off = bus.on('taxi:control', (e) => {
    if (!E.alive || !e) return;
    if (e.control === control || (control === '*' && e.control)) fn(e.value, e.control);
  });
  E.cleanup(off);
  return off;
}

/** Any bus event, auto-removed. */
export function onBus(E, name, fn) {
  const off = bus.on(name, (d) => E.alive && fn(d));
  E.cleanup(off);
  return off;
}

/** Faint gold glow on a humanoid (monk's blessing) or back to nothing. */
export function goldGlow(h, v) {
  const mats = h?._allMaterials?.() || Object.values(h?.materials || {});
  for (const m of mats) if (m?.emissive) m.emissive.setRGB(0.95, 0.7, 0.28).multiplyScalar(v * 0.35);
}

/**
 * Electrical wires near the road ahead: the props' wire spans keep userData.sample(i, t, out).
 * Returns a world-space polyline (Vector3[]) of one cable, or null. opts { minAhead, maxAhead }.
 */
export function findWire(opts = {}) {
  const root = g.world?.group;
  if (!root) return null;
  const minA = opts.minAhead ?? 25, maxA = opts.maxAhead ?? 110;
  const cands = [];
  root.traverse((o) => {
    if (typeof o.userData?.sample !== 'function') return;
    const p = new THREE.Vector3();
    try {
      o.userData.sample(0, 0.5, p);
    } catch (e) {
      return;
    }
    const a = S.aheadOf(p);
    if (a < minA || a > maxA) return;
    cands.push({ o, a, p });
  });
  if (!cands.length) return null;
  cands.sort((x, y) => x.a - y.a);
  const c = cands[Math.min(cands.length - 1, (Math.random() * Math.min(3, cands.length)) | 0)];
  const nCables = c.o.userData.cables?.length ?? 1;
  const ci = Math.min(nCables - 1, (Math.random() * Math.min(2, nCables)) | 0);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const v = new THREE.Vector3();
    c.o.userData.sample(ci, i / 24, v);
    pts.push(v);
  }
  return pts;
}

/** A sagging cable between two world points (fallback when no real wire is near). */
export function catenary(a, b, sag = 1.2, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return pts;
}

/** Wait until the taxi has passed a world point (it is behind by `margin` metres) or timeout. */
export function passed(E, pos, margin = 4, timeout = 30) {
  return E.until(() => S.aheadOf(pos) < -margin, timeout);
}

/** Look at something for `secs` continuously (deg cone). Returns a stateful checker fn(dt) -> bool. */
export function stare(target, deg = 10, secs = 0.4) {
  let t = 0;
  return (dt) => {
    const p = target.isVector3 ? target : target.getWorldPosition(new THREE.Vector3());
    if (S.isLooking(p, deg)) t += dt;
    else t = Math.max(0, t - dt * 2);
    return t >= secs;
  };
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

/** The ride's passenger appearance spec (CHARACTERS[id].appearance) or a fallback. */
export function passengerSpec(E, fallback) {
  const id = E.passengerId;
  const c = id ? S.CHARACTERS[id] : null;
  return c?.appearance ? { ...c.appearance, id: id + '_double' } : fallback;
}

export { THREE, S, g, engine, bus };
