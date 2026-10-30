// Focus navigation for every UI screen: keyboard (arrows/WASD + Enter/Esc), gamepad
// (d-pad / left stick + A/B, LB/RB for tabs, X delete, Start) and mouse share one
// virtual focus per "context". Contexts stack (menu -> settings -> confirm), only the
// top one receives input.
//
// While a *modal* context is open the UI swallows the nav keys before core/Input
// sees them and consumes every gameplay action each frame, so the game never reacts
// to menu input; after it closes, buttons still held are drained until released.
import { input, KEY_BINDINGS } from '../core/Input.js';
import { engine } from '../core/Engine.js';
import { audio } from '../audio/index.js';

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'select', NumpadEnter: 'select', Space: 'select', KeyF: 'select',
  Escape: 'back', Backspace: 'back',
  KeyQ: 'prevTab', KeyE: 'nextTab', PageUp: 'prevTab', PageDown: 'nextTab',
  Delete: 'delete', KeyX: 'delete', KeyP: 'start',
  Digit1: 'digit1', Digit2: 'digit2', Digit3: 'digit3', Digit4: 'digit4',
};

const ALL_ACTIONS = Object.keys(KEY_BINDINGS);
// button-like actions that must not leak into gameplay right after a menu closes
const DRAIN_ACTIONS = ALL_ACTIONS.filter((a) => !['forward', 'back', 'left', 'right', 'run', 'leanLeft', 'leanRight'].includes(a));

function isEnabled(el) {
  return el && el.getAttribute('aria-disabled') !== 'true' && !el.hidden && el.isConnected;
}

export class Nav {
  constructor(ui) {
    this.ui = ui;
    this.stack = [];
    this._padPrev = null;
    this._rep = {};
    this._raf = 0;
    this._drain = false;
    this._lastHoverSound = 0;
    this._modal = false;
  }

  install() {
    window.addEventListener('keydown', (e) => this._onKey(e), true);
    window.addEventListener('keyup', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && this.ui.root?.contains(e.target)) e.preventDefault();
    }, true);
    window.addEventListener('mousedown', (e) => {
      if (this._modal && this.ui.root && !this.ui.root.contains(e.target)) {
        // clicks on the bare 3D view while a menu is open must not reach the game
        // (no pointer-lock request, no Mouse0 'interact')
        e.stopPropagation();
      }
    }, true);
    engine.onUpdate(() => this._consume(), -99, { always: true });
  }

  get top() {
    return this.stack[this.stack.length - 1] || null;
  }

  /**
   * ctx = { root, modal=true, layout:'vertical'|'horizontal'|'grid', items?():Element[], initial?:Element|index,
   *   onBack?(), onTab?(dir), onDelete?(el), onDigit?(n), onStart?(), onAction?(action, el) -> bool,
   *   move?(dir, el) -> Element, keymap?: {code: action} (non-modal contexts only react to these),
   *   consumeActions?: [action] (non-modal: actions to hide from gameplay while open), wrap=true }
   */
  push(ctx) {
    ctx = { modal: true, layout: 'vertical', wrap: true, ...ctx };
    ctx.current = null;
    this.stack.push(ctx);
    const items = this.items(ctx);
    let first = null;
    if (ctx.initial instanceof Element) first = ctx.initial;
    else if (typeof ctx.initial === 'number') first = items[ctx.initial];
    if (!isEnabled(first)) first = items.find(isEnabled) || null;
    if (first) this.focus(first, { silent: true, ctx });
    this._update();
    return ctx;
  }

  remove(ctx) {
    const i = this.stack.indexOf(ctx);
    if (i >= 0) this.stack.splice(i, 1);
    this._update();
  }

  items(ctx) {
    if (ctx.items) return ctx.items().filter(Boolean);
    return [...ctx.root.querySelectorAll('[data-nav]')].filter((el) => !el.hidden);
  }

  owns(ctx, el) {
    return this.items(ctx).includes(el);
  }

  focus(el, { silent = false, ctx = this.top } = {}) {
    if (!ctx || !el) return;
    if (ctx.current === el) return;
    if (ctx.current) ctx.current.classList.remove('is-focus');
    ctx.current = el;
    el.classList.add('is-focus');
    el._nav?.onFocus?.();
    ctx.onFocus?.(el);
    const sc = ctx.scroller;
    if (sc && sc.contains(el)) {
      const r = el.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      const pad = Math.min(80, s.height * 0.18);
      if (r.top < s.top + pad) sc.scrollBy({ top: r.top - s.top - pad, behavior: 'smooth' });
      else if (r.bottom > s.bottom - pad) sc.scrollBy({ top: r.bottom - s.bottom + pad, behavior: 'smooth' });
    }
    if (!silent) this.sound('hover');
  }

  /** Called by item pointerenter / click. */
  pointerFocus(el) {
    const ctx = this.top;
    if (!ctx || !isEnabled(el) || !this.owns(ctx, el)) return false;
    this.focus(el);
    return true;
  }

  sound(kind, opts = {}) {
    const id = kind === 'select' ? 'ui_select' : kind === 'back' ? 'ui_back' : 'ui_hover';
    if (id === 'ui_hover') {
      const now = performance.now();
      if (now - this._lastHoverSound < 45) return;
      this._lastHoverSound = now;
    }
    try {
      audio.play(id, { bus: 'ui', volume: id === 'ui_hover' ? 0.55 : 0.9, ...opts });
    } catch (e) {
      /* audio not ready */
    }
  }

  _move(ctx, dir) {
    const items = this.items(ctx);
    if (!items.length) return;
    let i = items.indexOf(ctx.current);
    if (i < 0) i = dir > 0 ? -1 : items.length;
    for (let n = 0; n < items.length; n++) {
      i += dir;
      if (i < 0 || i >= items.length) {
        if (!ctx.wrap) return;
        i = (i + items.length) % items.length;
      }
      if (isEnabled(items[i])) {
        this.focus(items[i], { ctx });
        return;
      }
    }
  }

  handle(action, { repeat = false } = {}) {
    const ctx = this.top;
    if (!ctx) return;
    const cur = ctx.current && ctx.current.isConnected ? ctx.current : null;
    if (ctx.onAction && ctx.onAction(action, cur, { repeat })) return;
    const nav = cur?._nav;
    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right': {
        const d = action === 'up' || action === 'left' ? -1 : 1;
        const vertical = action === 'up' || action === 'down';
        if (ctx.layout === 'grid' && ctx.move) {
          const el = ctx.move(action, cur);
          if (el && isEnabled(el)) this.focus(el, { ctx });
          return;
        }
        if (ctx.layout === 'horizontal') {
          if (!vertical) this._move(ctx, d);
          else if (nav?.adjust) nav.adjust(-d);
          return;
        }
        if (vertical) this._move(ctx, d);
        else if (nav?.adjust) nav.adjust(d, { repeat });
        return;
      }
      case 'select':
        if (cur && isEnabled(cur) && nav?.activate) {
          if (nav.kind !== 'choice') this.sound('select');
          try {
            audio.init?.();
          } catch (e) {
            /* ignore */
          }
          nav.activate({ source: 'nav' });
        }
        return;
      case 'back':
        if (ctx.onBack) {
          this.sound('back');
          ctx.onBack();
        }
        return;
      case 'prevTab':
      case 'nextTab':
        ctx.onTab?.(action === 'prevTab' ? -1 : 1);
        return;
      case 'delete':
        ctx.onDelete?.(cur);
        return;
      case 'start':
        if (ctx.onStart) ctx.onStart();
        return;
      default:
        if (action.startsWith('digit')) ctx.onDigit?.(parseInt(action.slice(5), 10));
    }
  }

  // ------------------------------------------------------------- keyboard ----
  _onKey(e) {
    const ctx = this.top;
    if (!ctx) return;
    this.ui.setDevice?.('keyboard');
    let act = null;
    if (ctx.keymap) act = ctx.keymap[e.code] || null;
    else if (ctx.modal) act = KEYMAP[e.code] || null;
    if (!act) {
      if (ctx.modal && e.code === 'Tab') e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat && (act === 'select' || act === 'back' || act === 'delete' || act === 'start' || act.startsWith('digit'))) return;
    this.handle(act, { repeat: e.repeat });
  }

  // -------------------------------------------------------------- gamepad ----
  _padState() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return null;
    const b = (i) => {
      const x = pad.buttons[i];
      return !!x && (x.pressed || x.value > 0.5);
    };
    const ax = pad.axes || [];
    return {
      up: b(12) || (ax[1] || 0) < -0.6,
      down: b(13) || (ax[1] || 0) > 0.6,
      left: b(14) || (ax[0] || 0) < -0.6,
      right: b(15) || (ax[0] || 0) > 0.6,
      select: b(0),
      back: b(1),
      delete: b(2),
      prevTab: b(4),
      nextTab: b(5),
      start: b(9),
    };
  }

  _padLoop() {
    this._raf = 0;
    if (!this.stack.length) {
      this._padPrev = null;
      return;
    }
    this._raf = requestAnimationFrame(() => this._padLoop());
    const st = this._padState();
    if (!st) {
      this._padPrev = null;
      return;
    }
    if (!this._padPrev) {
      this._padPrev = st; // don't fire for buttons already held when the menu opened
      return;
    }
    const now = performance.now();
    const ctx = this.top;
    let any = false;
    for (const k in st) {
      if (st[k] && !this._padPrev[k]) {
        any = true;
        this._rep[k] = now + 380;
        this._padFire(ctx, k, false);
      } else if (st[k] && (k === 'up' || k === 'down' || k === 'left' || k === 'right') && now > this._rep[k]) {
        this._rep[k] = now + 90;
        this._padFire(ctx, k, true);
      }
    }
    if (any) this.ui.setDevice?.('gamepad');
    this._padPrev = st;
  }

  _padFire(ctx, k, repeat) {
    if (!ctx) return;
    if (ctx.padmap) {
      const a = ctx.padmap[k];
      if (a) this.handle(a, { repeat });
      return;
    }
    if (!ctx.modal) return;
    this.handle(k, { repeat });
  }

  // ------------------------------------------------- gameplay input gating ----
  _update() {
    const modal = this.stack.some((c) => c.modal);
    if (modal !== this._modal) {
      this._modal = modal;
      this.ui.root?.classList.toggle('is-modal', modal);
      if (modal) {
        try {
          if (document.pointerLockElement) document.exitPointerLock?.();
        } catch (e) {
          /* ignore */
        }
      } else {
        this._drain = true;
      }
      this.ui._onModalChange?.(modal);
    }
    if (this.stack.length && !this._raf) this._raf = requestAnimationFrame(() => this._padLoop());
  }

  _consume() {
    if (this._modal) {
      for (const a of ALL_ACTIONS) input.consume(a);
      return;
    }
    const top = this.top;
    if (top?.consumeActions) for (const a of top.consumeActions) input.consume(a);
    if (this._drain) {
      let any = false;
      for (const a of DRAIN_ACTIONS) {
        if (input.down(a)) {
          any = true;
          input.consume(a);
        }
      }
      if (!any) this._drain = false;
    }
  }
}

/**
 * Turn an element into a nav item. spec { kind:'button'|'slider'|'choice'|'info', activate?, adjust?, onFocus? }
 */
export function navItem(nav, el, spec = {}) {
  el._nav = { kind: 'button', ...spec };
  el.setAttribute('data-nav', '');
  if (el.tagName === 'BUTTON') {
    el.type = 'button';
    el.tabIndex = -1;
  }
  el.addEventListener('mousedown', (e) => e.preventDefault()); // keep DOM focus off buttons
  el.addEventListener('pointerenter', () => {
    nav.ui.setDevice?.('keyboard');
    nav.pointerFocus(el);
  });
  if (spec.activate) {
    el.addEventListener('click', (e) => {
      if (!isEnabled(el)) return;
      if (!nav.pointerFocus(el) && nav.top?.current !== el) return;
      if (el._nav.kind !== 'choice') nav.sound('select');
      try {
        audio.init?.();
      } catch (err) {
        /* ignore */
      }
      el._nav.activate({ source: 'pointer', event: e });
    });
  }
  return el;
}
