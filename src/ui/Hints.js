// Tutorial hints (bottom-left, key glyphs follow the last used device) and toasts.
import { h, sleep } from './dom.js';
import { glyph, iconSVG } from './glyphs.js';
import { ember } from './common.js';

export class Hints {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this._timer = 0;
    this._seq = 0;
  }

  /** {th, en, keys?: [token], duration?: s (default 6, 0 = until cleared)} | null */
  show(hint) {
    clearTimeout(this._timer);
    const seq = ++this._seq;
    const old = this.el;
    this.el = null;
    if (old) {
      old.classList.remove('is-in');
      setTimeout(() => old.remove(), 800);
    }
    if (!hint) return;
    const keys = [].concat(hint.keys || []).filter((k) => k != null && k !== '');
    const el = h('div', { class: 'dlb-hint', attrs: { role: 'status' } },
      keys.length ? h('div', { class: 'dlb-hint__keys' }, keys.map((k) => glyph(k))) : null,
      hint.th ? h('div', { class: 'dlb-hint__th', attrs: { lang: 'th' } }, hint.th) : null,
      hint.en ? h('div', { class: 'dlb-hint__en' }, hint.en) : null);
    this.ui.layer.appendChild(el);
    this.el = el;
    const delay = old ? 380 : 0;
    setTimeout(() => {
      if (seq !== this._seq) return;
      void el.offsetWidth;
      requestAnimationFrame(() => el.classList.add('is-in'));
    }, delay);
    const dur = hint.duration ?? 6;
    if (dur > 0) this._timer = setTimeout(() => this.show(null), dur * 1000 + delay);
  }
}

export class Toasts {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this._timer = 0;
  }

  show(th, en, { duration = 2.8, icon = null } = {}) {
    if (th && typeof th === 'object') ({ th, en } = th);
    clearTimeout(this._timer);
    if (this.el) this.el.remove();
    const el = h('div', { class: 'dlb-toast', attrs: { role: 'status' } },
      icon ? h('span', { class: 'dlb-toast__icon', html: iconSVG(icon) }) : h('span', { class: 'dlb-toast__mark' }, ember()),
      h('span', null, th ? h('span', { class: 'th', attrs: { lang: 'th' } }, th) : null, en ? h('span', { class: 'en' }, en) : null));
    this.ui.layer.appendChild(el);
    this.el = el;
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.add('is-in'));
    this._timer = setTimeout(async () => {
      el.classList.remove('is-in');
      await sleep(900);
      el.remove();
      if (this.el === el) this.el = null;
    }, duration * 1000);
  }
}
