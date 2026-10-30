// Tiny global event bus. Modules communicate through named events instead of
// importing each other directly (see docs/ARCHITECTURE.md for the event list).

class EventBus {
  constructor() {
    this.map = new Map();
  }
  /** Subscribe. Returns an unsubscribe function. */
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  once(name, fn) {
    const off = this.on(name, (d) => {
      off();
      fn(d);
    });
    return off;
  }
  off(name, fn) {
    this.map.get(name)?.delete(fn);
  }
  emit(name, data) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[bus] handler for "${name}" failed`, err);
      }
    }
  }
  /** Promise that resolves the next time `name` fires (optionally matching a predicate). */
  wait(name, predicate = null) {
    return new Promise((resolve) => {
      const off = this.on(name, (d) => {
        if (predicate && !predicate(d)) return;
        off();
        resolve(d);
      });
    });
  }
}

export const bus = new EventBus();
