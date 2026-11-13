// Checkpoints (respawn after the off-road death; the loop count does not change for it).
// Saved at: the intro start, the garage arrival, each ride's start (after boarding) and before the
// fork. Kept in g.save.checkpoint (persisted), so a reload can respawn the same way.
//
//   saveCheckpoint(kind, data?)   kind 'intro' | 'garage' | 'ride' | 'fork'
//   getCheckpoint() -> { kind, state, hour, ride?, s?, progress?, dist?, tSeated?, restart? } | null
//   restoreCheckpoint() -> bool   switches state to it (the target state fades the scene in)
import { g } from '../context.js';
import { bus } from '../../core/Events.js';

let mem = null;

export function saveCheckpoint(kind, data = {}) {
  const cp = { kind, state: g.fsm?.currentName || null, hour: g.clock?.hour ?? 21, at: Date.now(), ...data };
  mem = cp;
  if (g.save) {
    g.save.checkpoint = cp;
    try {
      g.persist?.();
    } catch (e) {
      /* ignore */
    }
  }
  bus.emit('checkpoint:saved', cp);
  return cp;
}

export function getCheckpoint() {
  return mem || g.save?.checkpoint || null;
}

/** No usable checkpoint: the start of the current ride (on shift), else the garage. */
export function restoreFallback() {
  try {
    const s = g.save || {};
    if (s.stage === 'shift' || g.ride) g.fsm.go('shift', { ride: s.rideIndex ?? 0, hour: s.hour ?? 21, respawn: true });
    else g.fsm.go('garage', { restart: (s.loops || 0) > 0, arrived: false });
    return true;
  } catch (e) {
    console.error('[checkpoint] fallback failed', e);
    return false;
  }
}

export function restoreCheckpoint() {
  const cp = getCheckpoint() || { kind: g.save?.stage === 'shift' ? 'ride' : 'intro', ride: g.save?.rideIndex ?? 0, hour: g.save?.hour ?? 21 };
  try {
    if (Number.isFinite(cp.hour)) g.clock?.set(cp.hour);
    switch (cp.kind) {
      case 'garage':
        g.fsm.go('garage', { arrived: false, restart: !!cp.restart, checkpoint: cp });
        break;
      case 'ride':
      case 'fork':
        // the ride starts over: the passenger back at their pickup, the taxi on the road before it
        g.fsm.go('shift', { ride: cp.ride ?? 0, hour: cp.hour, respawn: true });
        break;
      case 'intro':
      default:
        g.fsm.go('intro', { checkpoint: cp });
    }
    bus.emit('checkpoint:restored', cp);
    return true;
  } catch (e) {
    console.error('[checkpoint] restore failed', e);
    return false;
  }
}
