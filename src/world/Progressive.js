// Progressive world build: World.build() only builds what the main menu shows (the end of the
// main road, the fork shrine, the start of both branches) and the few set pieces the game reads
// at once; everything else is built afterwards in idle time, in the order the story visits it
// (the intro spur, the garage, then the main road from the junction onwards, the branches).
import { W } from './constants.js';

/** Radius around the menu route whose terrain + forest is built before World.build() resolves (m). */
export const SYNC_RADIUS = 120;
/** ... and whose props (set pieces, dressing) are built then: what the menu's fog lets you see. */
export const SYNC_PROPS_RADIUS = 85;

/** Should the build be progressive? (A direct start into gameplay builds everything at once.) */
export function autoProgressive() {
  try {
    const p = new URLSearchParams(globalThis.location?.search || '');
    const start = p.get('start');
    if (p.get('sandbox')) return false;
    return !start || start === 'menu';
  } catch (e) {
    return false;
  }
}

/** Points along the menu's live drive (main road end + fork branches) for sync tests. */
export function menuRoute(road) {
  const pts = [];
  const add = (id, s0, s1) => {
    const sp = road.get(id);
    if (!sp) return;
    const a = Math.max(0, s0), b = Math.min(sp.length, s1);
    for (let s = a; s <= b; s += 10) {
      const p = sp.pointAt(s, 0);
      pts.push(p.x, p.z);
    }
  };
  const L = road.length('main');
  add('main', L - 500, L); // the live drive starts 410-470 m before the fork
  add('ghost', 0, 200); // the passenger walks down the left road
  add('human', 0, 10);
  return Float64Array.from(pts);
}

export function nearRoute(route, x, z, r) {
  const r2 = r * r;
  for (let i = 0; i < route.length; i += 2) {
    const dx = route[i] - x, dz = route[i + 1] - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/**
 * Story order of a world position: the intro spur first, then the main road from the junction
 * (garage, sala, ... the fork), the branches, and the stretch between the merge and the junction.
 */
export function storyKey(road, layout, x, z, tmp) {
  const pr = road.project(tmp.set(x, 0, z));
  const L = road.length('main');
  const sJ = layout.landmarks.spurJunction.u * L;
  const spurL = road.length('spur');
  let k;
  if (pr.id === 'spur') k = pr.s;
  else if (pr.id === 'main') k = pr.s >= sJ ? spurL + (pr.s - sJ) : spurL + (L - sJ) + 700 + pr.s;
  else k = spurL + (L - sJ) + pr.s + (pr.id === 'human' ? 350 : 0);
  return k + Math.max(0, pr.distance - W.halfWidth) * 0.5;
}

/**
 * Run jobs [{key, x, z, run()}] in key order in small time slices (~sliceMs of work, then the
 * event loop and the renderer get the thread back). focus() -> {x, z} | null: jobs within
 * URGENT_R of it jump the queue (a resumed save can start anywhere on the road).
 * onSlice(done, total) after every slice. Resolves when every job has run.
 */
const URGENT_R = 230;
export function runInBackground(jobs, { sliceMs = 8, onSlice = null, onDone = null, focus = null } = {}) {
  const queue = jobs.slice().sort((a, b) => a.key - b.key);
  const done = new Uint8Array(queue.length);
  let next = 0, count = 0;
  let urgent = [];
  let lastFx = 1e9, lastFz = 1e9;
  const refreshUrgent = () => {
    const f = focus?.();
    if (!f) return;
    if (Math.hypot(f.x - lastFx, f.z - lastFz) < 40 && urgent.length) return;
    lastFx = f.x;
    lastFz = f.z;
    urgent = [];
    for (let i = next; i < queue.length; i++) {
      if (done[i]) continue;
      const j = queue[i];
      const d = Math.hypot(j.x - f.x, j.z - f.z);
      if (d < URGENT_R) urgent.push([d, i]);
    }
    urgent.sort((a, b) => b[0] - a[0]); // nearest last (pop)
  };
  const take = () => {
    while (urgent.length) {
      const i = urgent.pop()[1];
      if (!done[i]) return i;
    }
    while (next < queue.length && done[next]) next++;
    return next < queue.length ? next : -1;
  };
  return new Promise((resolve) => {
    const step = () => {
      const t0 = performance.now();
      const budget = typeof sliceMs === 'function' ? sliceMs() : sliceMs;
      refreshUrgent();
      while (count < queue.length) {
        const i = take();
        if (i < 0) break;
        done[i] = 1;
        count++;
        try {
          queue[i].run();
        } catch (e) {
          console.error('[world] background build job failed', e);
        }
        if (performance.now() - t0 > budget) break;
      }
      try {
        onSlice?.(count, queue.length);
      } catch (e) {
        console.error('[world] background build', e);
      }
      if (count < queue.length) setTimeout(step, 0);
      else {
        try {
          onDone?.();
        } catch (e) {
          console.error('[world] background build', e);
        }
        resolve();
      }
    };
    setTimeout(step, 0);
  });
}
