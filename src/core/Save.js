// Save slots. Each slot stores the night's progress plus the persistent
// "knowledge" the player keeps across deaths/loops.
import { bus } from './Events.js';

const KEY = (i) => `dlbih.save.slot${i}.v1`;
const LAST = 'dlbih.save.last';
export const SLOT_COUNT = 3;

/** A fresh save. Field meanings are documented in docs/ARCHITECTURE.md ("Save data"). */
export function newSaveData() {
  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    playTime: 0, // seconds
    stage: 'intro', // 'intro' | 'tutorial' | 'shift' | 'ending'
    rideIndex: 0, // index into PASSENGERS order (0..8)
    hour: 21, // in-game hour of the current checkpoint (21..30, 30 = 06:00)
    loops: 0, // how many times the night restarted (deaths)
    deathHour: null, // hour at which the player last died (for the time-skip offer)
    deaths: [], // [{rideId, cause, hour}]
    delivered: {}, // rideId -> 'left'|'right' last successful choice
    knowledge: {}, // passengerId -> {identity:'ghost'|'human', notes:[...]} learned facts (persist across loops)
    rulesLearned: [], // rule ids the player has seen proven
    memories: [], // collected memory/clue ids (secret ending)
    flags: {}, // misc story flags
    endingsSeen: [], // ending ids reached in this slot
  };
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch (e) {
    return false;
  }
}
function safeDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {
    /* ignore */
  }
}

class Saves {
  constructor() {
    this.activeSlot = null;
    this.data = null;
    // in-memory fallback when storage is blocked
    this.memory = {};
  }
  /** Returns [{slot, empty, summary}] for the slot picker. */
  list() {
    const out = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const d = this.peek(i);
      out.push({ slot: i, empty: !d, data: d });
    }
    return out;
  }
  peek(i) {
    const raw = safeGet(KEY(i)) ?? this.memory[i] ?? null;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  /** Begin a brand-new game in slot i. */
  create(i) {
    this.activeSlot = i;
    this.data = newSaveData();
    this.write();
    return this.data;
  }
  load(i) {
    const d = this.peek(i);
    if (!d) return null;
    this.activeSlot = i;
    this.data = Object.assign(newSaveData(), d);
    safeSet(LAST, String(i));
    bus.emit('save:loaded', { slot: i, data: this.data });
    return this.data;
  }
  /** Write the active slot (call after mutating saves.data). */
  write() {
    if (this.activeSlot == null || !this.data) return;
    this.data.updatedAt = Date.now();
    const raw = JSON.stringify(this.data);
    if (!safeSet(KEY(this.activeSlot), raw)) this.memory[this.activeSlot] = raw;
    safeSet(LAST, String(this.activeSlot));
    bus.emit('save:written', { slot: this.activeSlot, data: this.data });
  }
  delete(i) {
    safeDel(KEY(i));
    delete this.memory[i];
    if (this.activeSlot === i) {
      this.activeSlot = null;
      this.data = null;
    }
  }
  /** Slot index most recently played, or null. */
  lastUsed() {
    const v = safeGet(LAST);
    if (v == null) return null;
    const i = parseInt(v, 10);
    return this.peek(i) ? i : null;
  }
}

export const saves = new Saves();
