// Top-level game state machine. A state is an object:
//   { name, async enter(params, g), exit(g), update(dt, g) }
// enter() may be long-running (cinematics) — it should check `this.active` /
// scope.alive before continuing after awaits, because the state can be left mid-way
// (e.g. death during a ride). Each state gets a fresh `scope` (src/game/util.js)
// that is disposed on exit, so per-frame hooks never leak.
import { bus } from '../core/Events.js';
import { Scope } from './util.js';

export class StateMachine {
  constructor(g) {
    this.g = g;
    this.states = new Map();
    this.current = null;
    this.currentName = null;
    this.transitioning = false;
  }

  register(state) {
    this.states.set(state.name, state);
    return this;
  }

  is(name) {
    return this.currentName === name;
  }

  /** Switch state. Returns the promise from the new state's enter(). */
  async go(name, params = {}) {
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state ${name}`);
    const prev = this.current;
    if (prev) {
      prev.active = false;
      try {
        prev.scope?.dispose();
        await prev.exit?.(this.g, name);
      } catch (err) {
        console.error(`[fsm] exit ${prev.name} failed`, err);
      }
    }
    this.current = next;
    this.currentName = name;
    next.active = true;
    next.scope = new Scope();
    if (next.update) next.scope.onUpdate((dt) => next.update(dt, this.g), 0);
    bus.emit('game:state', { state: name, from: prev?.name ?? null, params });
    try {
      return await next.enter?.(params, this.g);
    } catch (err) {
      console.error(`[fsm] enter ${name} failed`, err);
      return undefined;
    }
  }
}
