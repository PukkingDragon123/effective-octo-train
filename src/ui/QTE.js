// The QTE prompt (driven by src/game/systems/QTE.js): one small mark at the centre of the screen.
// A key / button glyph inside a thin ring: the ring fills while you hold, throbs while you mash,
// closes for a timed press, and a chevron points the way for a swerve. No words.
//   const p = new QTEPrompt(root); p.show({kind, token, dir}); p.set(k, {held, ring, dir, warn, shaky});
//   p.pulse(); p.setDir('left'|'right'); p.result(ok); p.hide(instant)
import { h } from './dom.js';
import { glyph } from './glyphs.js';

const R = 30;
const C = 2 * Math.PI * R;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class QTEPrompt {
  constructor(root) {
    this.root = root || document.getElementById('ui') || document.body;
    this.el = null;
    this._timer = 0;
  }

  _build() {
    const ring = svg('svg', { viewBox: '0 0 80 80', class: 'dlb-qte__ring', 'aria-hidden': 'true' });
    ring.append(svg('circle', { cx: 40, cy: 40, r: R, class: 'dlb-qte__track' }));
    this.arc = svg('circle', { cx: 40, cy: 40, r: R, class: 'dlb-qte__arc', 'stroke-dasharray': `${C} ${C}`, 'stroke-dashoffset': C, transform: 'rotate(-90 40 40)' });
    ring.append(this.arc);
    this.closing = svg('circle', { cx: 40, cy: 40, r: R + 7, class: 'dlb-qte__closing' });
    ring.append(this.closing);
    this.glyphBox = h('span', { class: 'dlb-qte__glyph' });
    this.tap = h('span', { class: 'dlb-qte__tap', attrs: { 'aria-hidden': 'true' } });
    this.chevL = h('span', { class: 'dlb-qte__chev is-l', html: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5 5 8l5.5 5.5"/></svg>' });
    this.chevR = h('span', { class: 'dlb-qte__chev is-r', html: '<svg viewBox="0 0 16 16"><path d="M5.5 2.5 11 8l-5.5 5.5"/></svg>' });
    this.el = h('div', { class: 'dlb-qte', attrs: { role: 'status', 'aria-live': 'off' } }, this.chevL, h('div', { class: 'dlb-qte__core' }, ring, this.glyphBox, this.tap), this.chevR);
    this.el.hidden = true;
    this.root.appendChild(this.el);
  }

  show({ kind = 'hold', token = 'interact', dir = null } = {}) {
    if (!this.el || !this.el.isConnected) this._build();
    clearTimeout(this._timer);
    const el = this.el;
    el.className = `dlb-qte is-${kind}`;
    this.glyphBox.replaceChildren();
    if (kind === 'steer') this.setDir(dir || 'left');
    else if (token) this.glyphBox.append(glyph(token));
    this.set(kind === 'press' || kind === 'steer' ? 1 : 0, {});
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('is-in');
  }

  /** k 0..1: the ring's fill (hold / mash / still) or the time left (press / steer). */
  set(k, o = {}) {
    if (!this.el) return;
    const v = Math.max(0, Math.min(1, k));
    this.arc.setAttribute('stroke-dashoffset', String(C * (1 - v)));
    if (o.ring) this.closing.style.transform = `scale(${0.62 + 0.38 * v})`;
    this.el.classList.toggle('is-held', !!o.held);
    this.el.classList.toggle('is-shaky', !!o.shaky);
    this.el.style.setProperty('--warn', String(o.warn ?? 0));
    this.el.style.setProperty('--k', String(v));
  }

  setDir(dir) {
    if (!this.el) return;
    this.el.classList.toggle('is-dir-l', dir === 'left');
    this.el.classList.toggle('is-dir-r', dir !== 'left');
    this.glyphBox.replaceChildren(glyph(dir === 'left' ? 'left' : 'right'));
  }

  pulse() {
    if (!this.el) return;
    this.el.classList.remove('is-pulse');
    void this.el.offsetWidth;
    this.el.classList.add('is-pulse');
  }

  result(ok) {
    if (!this.el) return;
    this.el.classList.add(ok ? 'is-ok' : 'is-fail');
    this.set(ok ? 1 : 0, {});
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), ok ? 380 : 520);
  }

  hide(instant = false) {
    if (!this.el) return;
    const el = this.el;
    clearTimeout(this._timer);
    el.classList.remove('is-in');
    if (instant) {
      el.hidden = true;
      return;
    }
    this._timer = setTimeout(() => {
      if (!el.classList.contains('is-in')) el.hidden = true;
    }, 420);
  }
}
