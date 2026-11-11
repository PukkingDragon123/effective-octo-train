// Objective line (ui/Objective.js) by key (data/kongTalk.js OBJECTIVES), e.g. setObjective('shrine'),
// setObjective('deliver', { dest: 'บ้านห้วยทราย' }). Cleared in the menu, on death and in endings.
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { objective } from '../../ui/Objective.js';
import { OBJECTIVES } from '../data/kongTalk.js';

const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');

export function setObjective(key, vars = {}) {
  install();
  const o = OBJECTIVES[key];
  if (!o) return objective.clear();
  objective.setBoth((g.settings?.get?.('language') ?? 'th') === 'both');
  objective.set({ th: fill(o.th, vars.th ? { dest: vars.th } : vars), en: fill(o.en, vars.en ? { dest: vars.en } : vars) });
}
export const objectiveDone = () => {
  target = null;
  objective.done();
};
export const clearObjective = () => {
  target = null;
  objective.clear();
};

/** A checklist: title + steps [{ id, th, en?, done? }] (ticked in any order with tickObjective). */
export function setChecklist(title, steps) {
  objective.setBoth((g.settings?.get?.('language') ?? 'th') === 'both');
  objective.set({ th: title.th || title, en: title.en || '', steps });
}
export const tickObjective = (id) => objective.tick(id);

// ---- the marker toward the current target (Object3D | Vector3 | () => Vector3 | null)
let target = null;
let minDist = 2.5;
export function setObjectiveTarget(t, opts = {}) {
  target = t || null;
  minDist = opts.minDist ?? 2.5;
}
const _p = new THREE.Vector3(), _c = new THREE.Vector3();
let installed = false;
function update() {
  if (!target || !g.engine?.camera) return objective.marker(null);
  try {
    const cam = g.engine.camera;
    if (typeof target === 'function') {
      const v = target();
      if (!v) return objective.marker(null);
      _p.copy(v);
    } else if (target.isVector3) _p.copy(target);
    else target.getWorldPosition(_p);
    const dist = cam.position.distanceTo(_p);
    if (dist < minDist || (g.cameraRig?.cineBlend ?? 0) > 0.5) return objective.marker(null);
    _c.copy(_p).project(cam);
    const W = window.innerWidth, H = window.innerHeight;
    const behind = _c.z > 1;
    let x = _c.x, y = _c.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const on = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86;
    if (on) return objective.marker({ x: (x * 0.5 + 0.5) * W, y: (-y * 0.5 + 0.5) * H - 18, dist, off: false });
    // off screen: an arrow on the edge, pointing at it
    const ang = Math.atan2(-y, x);
    const k = 1 / Math.max(Math.abs(Math.cos(ang)) / 0.88, Math.abs(Math.sin(ang)) / 0.8);
    const ex = Math.cos(ang) * k, ey = Math.sin(ang) * k;
    objective.marker({ x: (ex * 0.5 + 0.5) * W, y: (ey * 0.5 + 0.5) * H, dist, off: true, angle: ang + Math.PI / 2 });
  } catch (e) {
    objective.marker(null);
  }
}
function install() {
  if (installed || !g.engine) return;
  installed = true;
  g.engine.onUpdate(update, 95, { always: true });
}

bus.on('game:state', ({ state } = {}) => {
  install();
  if (['menu', 'death', 'ending'].includes(state)) clearObjective();
});
