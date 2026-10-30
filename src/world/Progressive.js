// Progressive world build: World.build() only builds what the main menu shows (the end of the
// main road, the fork shrine, the start of both branches) and the few set pieces the game reads
// at once; everything else is built afterwards in idle time, in the order the story visits it
// (the intro spur, the garage, then the main road from the junction onwards, the branches).
import { W } from './constants.js';

/** Radius around the menu route that is built before World.build() resolves (m). */
export const SYNC_RADIUS = 150;

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
  add('main', L - 560, L);
  add('ghost', 0, 200);
  add('human', 0, 140);
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
 * Run jobs [{key, run()}] in key order in small time slices (~sliceMs of work, then the event
 * loop and the renderer get the thread back). onSlice(done, total) after every slice.
 * Resolves when every job has run.
 */
export function runInBackground(jobs, { sliceMs = 8, onSlice = null, onDone = null } = {}) {
  jobs.sort((a, b) => a.key - b.key);
  let i = 0;
  return new Promise((resolve) => {
    const step = () => {
      const t0 = performance.now();
      while (i < jobs.length) {
        try {
          jobs[i].run();
        } catch (e) {
          console.error('[world] background build job failed', e);
        }
        i++;
        if (performance.now() - t0 > sliceMs) break;
      }
      try {
        onSlice?.(i, jobs.length);
      } catch (e) {
        console.error('[world] background build', e);
      }
      if (i < jobs.length) setTimeout(step, 0);
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
