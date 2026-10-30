// Hour card: large thin numerals + Thai/English chapter title, ~4.5 s.
import { h, sleep, enter, leave, parseClock, thaiHour, clockString } from './dom.js';
import { screen } from './common.js';

export class Chapter {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this._seq = 0;
  }

  /** c {time:'23:00' | hour number, th, en, word?: Thai time word, duration?: total seconds (default 4.6)} */
  async show(c = {}) {
    const seq = ++this._seq;
    if (this.el) {
      const old = this.el;
      this.el = null;
      leave(old, 900, { remove: true });
    }
    const hour = typeof c.time === 'number' ? c.time : parseClock(c.time);
    const time = typeof c.time === 'number' ? clockString(c.time) : String(c.time || '');
    const [hh, mm] = time.split(':');
    const word = c.word ?? (hour != null ? thaiHour(hour) : '');
    const el = screen('dlb-chapter',
      h('div', { class: 'dlb-chapter__in' },
        word ? h('div', { class: 'dlb-chapter__word', attrs: { lang: 'th' } }, word) : null,
        h('div', { class: 'dlb-chapter__time', attrs: { 'aria-label': time } }, hh ?? time, mm != null ? h('span', { class: 'c' }, ':') : null, mm ?? ''),
        h('div', { class: 'dlb-chapter__hair' }),
        c.th ? h('div', { class: 'dlb-chapter__th', attrs: { lang: 'th' } }, c.th) : null,
        c.en ? h('div', { class: 'dlb-chapter__en' }, c.en) : null));
    this.ui.layer.appendChild(el);
    this.el = el;
    await enter(el);
    const total = Math.max(2.5, c.duration ?? 4.6);
    await sleep((total - 1.5) * 1000);
    if (seq !== this._seq) return;
    this.el = null;
    await leave(el, 1500, { remove: true });
  }
}
