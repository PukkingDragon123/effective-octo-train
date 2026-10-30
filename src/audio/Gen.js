// Synthesis job service: runs generator tasks in a small pool of module workers
// (so heavy synthesis never hitches the frame), with a priority queue, result
// de-duplication and a synchronous fallback (no Worker support, offline tests).
import { runTask } from './Synth/registry.js';

export class GenService {
  constructor({ workers = 2, sync = false } = {}) {
    this.sync = sync;
    this.pool = [];
    this.queue = []; // {id, type, args, prio, resolve, reject}
    this.pending = new Map(); // key -> promise
    this.nextId = 1;
    this.inflight = new Map(); // id -> job
    this.busy = 0;
    if (!sync && typeof Worker !== 'undefined') {
      try {
        for (let i = 0; i < workers; i++) {
          const w = new Worker(new URL('./Synth/worker.js', import.meta.url), { type: 'module' });
          w.onmessage = (e) => this._onMessage(w, e.data);
          w.onerror = (e) => {
            console.warn('[audio] synth worker error, falling back to main thread', e.message || e);
            this._fallback();
          };
          w._busy = false;
          this.pool.push(w);
        }
      } catch (e) {
        this.pool = [];
      }
    }
    if (!this.pool.length) this.sync = true;
  }

  _fallback() {
    for (const w of this.pool) {
      try {
        w.terminate();
      } catch (e) {
        /* ignore */
      }
    }
    this.pool = [];
    this.sync = true;
    // re-run inflight + queued jobs synchronously (spread over ticks)
    const jobs = [...this.inflight.values(), ...this.queue];
    this.inflight.clear();
    this.queue = [];
    for (const j of jobs) setTimeout(() => this._runLocal(j), 0);
  }

  _runLocal(j) {
    try {
      j.resolve(runTask(j.type, j.args));
    } catch (err) {
      j.reject(err);
    }
  }

  /** Synchronous generation (main thread). */
  runSync(type, args) {
    return runTask(type, args);
  }

  /**
   * Run a task; returns a Promise of {channels, sr, meta}. `key` de-duplicates identical
   * requests while pending. prio: 0 urgent (sound requested now) .. 2 background warm-up.
   */
  run(type, args, key = null, prio = 1) {
    if (key && this.pending.has(key)) {
      const p = this.pending.get(key);
      if (prio < p._prio) this._bump(p._jobId, prio);
      return p;
    }
    let job;
    const p = new Promise((resolve, reject) => {
      job = { id: this.nextId++, type, args, prio, resolve, reject };
    });
    p._prio = prio;
    p._jobId = job.id;
    if (key) {
      this.pending.set(key, p);
      const clear = () => this.pending.delete(key);
      p.then(clear, clear);
    }
    if (this.sync) {
      // keep the API async but do the work promptly
      if (prio === 0) this._runLocal(job);
      else setTimeout(() => this._runLocal(job), 0);
      return p;
    }
    this.queue.push(job);
    this.queue.sort((a, b) => a.prio - b.prio || a.id - b.id);
    this._pump();
    return p;
  }

  /** Run a state-setting task on the main thread and in every worker (e.g. registering sample PCM). */
  broadcast(type, args) {
    try {
      runTask(type, args);
    } catch (e) {
      /* ignore */
    }
    for (const w of this.pool) {
      try {
        w.postMessage({ id: -this.nextId++, type, args });
      } catch (e) {
        /* ignore */
      }
    }
  }

  _bump(jobId, prio) {
    const j = this.queue.find((q) => q.id === jobId);
    if (j) {
      j.prio = prio;
      this.queue.sort((a, b) => a.prio - b.prio || a.id - b.id);
    }
  }

  _pump() {
    for (const w of this.pool) {
      if (w._busy || !this.queue.length) continue;
      const job = this.queue.shift();
      w._busy = true;
      this.inflight.set(job.id, job);
      w.postMessage({ id: job.id, type: job.type, args: job.args });
    }
  }

  _onMessage(w, msg) {
    if (msg.id < 0) return; // broadcast acknowledgement (the worker's job slot is untouched)
    w._busy = false;
    const job = this.inflight.get(msg.id);
    this.inflight.delete(msg.id);
    if (job) {
      if (msg.ok) job.resolve(msg.res);
      else {
        console.warn('[audio] synth task failed', job.type, job.args?.id || '', msg.error);
        job.reject(new Error(msg.error));
      }
    }
    this._pump();
  }

  get idle() {
    return !this.queue.length && !this.inflight.size;
  }

  dispose() {
    for (const w of this.pool) w.terminate();
    this.pool = [];
  }
}
