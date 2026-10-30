// Quick-time events (g.qte). One minimal prompt at screen centre (src/ui/QTE.js): a key / button
// glyph that fills while you hold it, pulses while you mash it, rings closed for a timed press,
// points left / right for a swerve. No words. Keyboard, gamepad and touch (any touch is the button;
// for a swerve, the side of the screen you touch is the direction).
//
//   await g.qte.run(spec) -> { ok, reason: 'done'|'timeout'|'moved'|'released'|'cancelled', progress }
//   spec {
//     kind:   'hold'  fill while held (drains when released)             { action, hold, time, drain }
//             'mash'  each press fills, it leaks back                      { action, count, time, decay }
//             'press' one press inside the window (too early is ignored)   { action, time, open }
//             'steer' a sequence of swerves                               { dirs:['left','right',...], time (per step) }
//             'still' hold AND keep the view still (the breath)            { action, hold, time, grace, failTime, tolerance, ok() }
//     action: an input action ('interact', 'amulet', 'handbrake', ...) or 'brake' (S / ↓ / LT / B)
//     time:   real seconds before it fails      slowmo: engine.timeScale while it runs (eased; 1 = none)
//     dread:  0..1 extra FOV push / horror tint while it runs (camera feel)
//     onTick(state, dt) · onPress() · ok(): extra condition for 'still' / 'hold' · fail(state): true ends it as failed
//   }
//   g.qte.active (the running spec or null) · g.qte.cancel() · bus 'qte:start' {kind} / 'qte:end' {ok, reason}
// QTEs run in real time (slow motion does not stretch the window) and freeze while the game is paused.
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { input } from '../../core/Input.js';
import { engine } from '../../core/Engine.js';
import { clamp, damp } from '../../core/math.js';
import { QTEPrompt } from '../../ui/QTE.js';

const STEER_DEAD = 0.55;

export class QTE {
  constructor() {
    this.active = null;
    this.ui = null;
    this._off = null;
    this._touch = { down: false, taps: 0, side: 0 };
    this._slow = 1; // current slow-motion factor we own
    this._slowTarget = 1;
    this._slowOff = null;
    this._resolve = null;
    this._onTouch = this._onTouch.bind(this);
  }

  install() {
    if (this._installed) return this;
    this._installed = true;
    // a state change (death, menu, ending) never leaves a prompt or slow motion behind
    bus.on('game:state', () => this.cancel());
    bus.on('death:start', () => this.cancel());
    return this;
  }

  /** Run one QTE. Resolves { ok, reason, progress }. A new run cancels the previous one. */
  run(spec = {}) {
    if (this.active) this.cancel();
    const s = {
      kind: spec.kind || 'hold',
      action: spec.action || 'interact',
      time: spec.time ?? 3,
      hold: spec.hold ?? 1.2,
      count: spec.count ?? 8,
      decay: spec.decay ?? 0.35,
      drain: spec.drain ?? 0.8,
      open: spec.open ?? 0,
      grace: spec.grace ?? 1.2,
      failTime: spec.failTime ?? 0.9,
      tolerance: spec.tolerance ?? 0.6, // rad/s of look movement allowed for 'still'
      dirs: spec.dirs || ['left', 'right', 'left'],
      slowmo: spec.slowmo ?? 1,
      dread: spec.dread ?? 0.6,
      ...spec,
    };
    const st = { t: 0, progress: 0, fail: 0, step: 0, stepT: 0, engaged: false, done: false, presses: 0 };
    this.active = s;
    this.state = st;
    this._touch.taps = 0;
    this._touch.down = false;
    this._prevTaps = 0;
    try {
      this.ui ||= new QTEPrompt(g.ui?.root || document.getElementById('ui'));
      this.ui.show({ kind: s.kind, token: this._token(s), dir: s.kind === 'steer' ? s.dirs[0] : null, time: s.time });
    } catch (e) {
      console.warn('[qte] prompt', e);
    }
    window.addEventListener('touchstart', this._onTouch, { passive: true });
    window.addEventListener('touchend', this._onTouch, { passive: true });
    window.addEventListener('touchcancel', this._onTouch, { passive: true });
    this._slowTo(s.slowmo, 0.18);
    g.camfx?.qte?.(true, s.dread);
    g.audio?.play?.('heartbeat', { volume: 0.55, bus: 'sfx' });
    bus.emit('qte:start', { kind: s.kind, action: s.action });
    const p = new Promise((res) => (this._resolve = res));
    this._off = engine.onUpdate((dt) => this._tick(dt), -60, { always: true });
    return p;
  }

  /** Stop the running QTE without a result (resolves { ok:false, reason:'cancelled' }). */
  cancel() {
    if (!this.active) {
      this._slowTo(1, 0.01);
      return;
    }
    this._finish(false, 'cancelled', true);
  }

  // ------------------------------------------------------------------ internals
  _token(s) {
    if (s.kind === 'steer') return null;
    if (s.action === 'brake') return { kb: ['S'], pad: ['LT'] };
    return s.action;
  }

  _onTouch(e) {
    const t = this._touch;
    if (e.type === 'touchstart') {
      t.taps++;
      const x = e.changedTouches?.[0]?.clientX ?? window.innerWidth / 2;
      t.side = x < window.innerWidth / 2 ? -1 : 1;
    }
    t.down = (e.touches?.length || 0) > 0;
    if (!t.down) t.side = 0;
  }

  _down(action) {
    if (this._touch.down) return true;
    if (action === 'brake') return input.axis.brake > 0.5 || input.down('back') || input.down('handbrake');
    return input.down(action);
  }
  _pressed(action) {
    const taps = this._touch.taps - this._prevTaps;
    if (taps > 0) return true;
    if (action === 'brake') return input.pressed('back') || input.pressed('handbrake');
    return input.pressed(action);
  }

  _tick(rawDt) {
    const s = this.active;
    const st = this.state;
    if (!s || st.done) return;
    if (engine.paused) return; // the window freezes with the pause menu
    const dt = Math.min(rawDt, 0.1);
    st.t += dt;
    const ui = this.ui;
    // the world can end it early (the car reached the hand, the arm got a grip...)
    try {
      if (s.fail?.(st)) return this._finish(false, 'failed');
    } catch (e) {
      console.warn('[qte] fail()', e);
    }
    switch (s.kind) {
      case 'hold': {
        const held = this._down(s.action) && (!s.ok || s.ok());
        if (held) {
          st.engaged = true;
          st.progress += dt / Math.max(0.05, s.hold);
        } else st.progress = Math.max(0, st.progress - dt * s.drain / Math.max(0.05, s.hold));
        ui?.set(st.progress, { held });
        if (st.progress >= 1) return this._finish(true, 'done');
        break;
      }
      case 'mash': {
        if (this._pressed(s.action)) {
          st.presses++;
          st.progress += 1 / Math.max(1, s.count);
          ui?.pulse();
          s.onPress?.(st);
        }
        st.progress = Math.max(0, st.progress - s.decay * dt);
        ui?.set(st.progress, {});
        if (st.progress >= 1) return this._finish(true, 'done');
        break;
      }
      case 'press': {
        const k = clamp(st.t / Math.max(0.05, s.time), 0, 1);
        ui?.set(1 - k, { ring: true, open: st.t >= s.open });
        if (st.t >= s.open && this._pressed(s.action)) {
          ui?.pulse();
          return this._finish(true, 'done');
        }
        break;
      }
      case 'steer': {
        const want = s.dirs[st.step] === 'left' ? -1 : 1;
        st.stepT += dt;
        const steer = input.axis.steer || 0;
        const key = want < 0 ? input.down('left') : input.down('right');
        const touch = this._touch.down && this._touch.side === want;
        const hit = key || touch || steer * want > STEER_DEAD;
        st.progress = st.step / s.dirs.length;
        ui?.set(1 - clamp(st.stepT / Math.max(0.05, s.time), 0, 1), { ring: true, dir: s.dirs[st.step] });
        if (hit) {
          st.step++;
          st.stepT = 0;
          ui?.pulse();
          s.onPress?.(st, want);
          if (st.step >= s.dirs.length) {
            st.progress = 1;
            return this._finish(true, 'done');
          }
          ui?.setDir(s.dirs[st.step]);
          break;
        }
        if (st.stepT > s.time) return this._finish(false, 'timeout');
        this._prevTaps = this._touch.taps;
        s.onTick?.(st, dt);
        return;
      }
      case 'still': {
        const held = this._down(s.action);
        const lookSpeed = (Math.abs(input.look.dx) + Math.abs(input.look.dy)) / Math.max(1e-3, rawDt);
        st.look = damp(st.look || 0, lookSpeed, 12, dt);
        const still = st.look < s.tolerance;
        const extra = !s.ok || s.ok();
        if (held) st.engaged = true;
        const good = held && still && extra;
        if (good) st.progress += dt / Math.max(0.05, s.hold);
        if ((!good && (st.engaged || st.t > s.grace)) || (!still && st.engaged)) st.fail += dt;
        else st.fail = Math.max(0, st.fail - dt * 0.6);
        ui?.set(st.progress, { held, shaky: !still, warn: clamp(st.fail / s.failTime, 0, 1) });
        if (st.progress >= 1) return this._finish(true, 'done');
        if (st.fail > s.failTime) return this._finish(false, !still ? 'moved' : 'released');
        break;
      }
      default:
        break;
    }
    this._prevTaps = this._touch.taps;
    s.onTick?.(st, dt);
    if (st.t > s.time) this._finish(false, 'timeout');
  }

  _finish(ok, reason, silent = false) {
    const s = this.active;
    const st = this.state;
    if (!s) return;
    st.done = true;
    this.active = null;
    this._off?.();
    this._off = null;
    window.removeEventListener('touchstart', this._onTouch);
    window.removeEventListener('touchend', this._onTouch);
    window.removeEventListener('touchcancel', this._onTouch);
    try {
      if (silent) this.ui?.hide(true);
      else this.ui?.result(ok);
    } catch (e) {
      /* ui optional */
    }
    // success eases straight back to real speed; failure lingers a breath in slow motion
    this._slowTo(1, ok ? 0.35 : silent ? 0.05 : 0.6);
    g.camfx?.qte?.(false);
    if (!silent) {
      if (ok) {
        g.audio?.play?.('breath', { volume: 0.6, rate: 0.85 });
        g.camfx?.relief?.();
      } else g.audio?.play?.('sting_low', { volume: 0.6 });
    }
    const out = { ok, reason, progress: clamp(st.progress, 0, 1) };
    bus.emit('qte:end', out);
    const r = this._resolve;
    this._resolve = null;
    r?.(out);
  }

  /** Ease engine.timeScale toward `to` over `secs` real seconds (only the part we own). */
  _slowTo(to, secs) {
    this._slowTarget = to;
    this._slowOff?.();
    this._slowOff = null;
    const from = this._slow;
    if (Math.abs(from - to) < 1e-3) return;
    let t = 0;
    this._slowOff = engine.onUpdate(
      (dt) => {
        if (engine.paused) return;
        t += dt;
        const k = clamp(t / Math.max(0.01, secs), 0, 1);
        const v = from + (to - from) * (k * k * (3 - 2 * k));
        // multiply into whatever else scales time (cinematics), never stomp it
        engine.timeScale = clamp((engine.timeScale / this._slow) * v, 0.02, 4);
        this._slow = v;
        if (k >= 1) {
          this._slowOff?.();
          this._slowOff = null;
          if (to === 1) {
            engine.timeScale = Math.abs(engine.timeScale - 1) < 0.02 ? 1 : engine.timeScale;
            this._slow = 1;
          }
        }
      },
      -95,
      { always: true },
    );
  }
}

/** Install g.qte once. */
export function ensureQTE() {
  if (!g.qte) g.qte = new QTE().install();
  return g.qte;
}
