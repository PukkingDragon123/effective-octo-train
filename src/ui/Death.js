// Death card: a slow red-black bleed, the Thai line large and the English small,
// then black. Resolves while still black; the black then fades out on its own so the
// game can reset the scene (21:00, the garage) underneath.
import { h, sleep, enter } from './dom.js';
import { screen } from './common.js';
import * as NARRATIVE from '../game/data/index.js';

export class DeathCard {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
  }

  /** d {th, en, sub?: {th,en} | false, hold?: seconds text stays (default 4.2), keepBlack?: bool} */
  async show(d = {}) {
    if (this.el) this.el.remove();
    const sub = d.sub === false ? null : d.sub || NARRATIVE.DEATH_FOOTER || { th: 'สามทุ่ม · อู่ กม.9', en: '21:00 · KM 9 Garage' };
    const el = screen('dlb-death',
      h('div', { class: 'dlb-death__bg' }),
      h('div', { class: 'dlb-death__veins' }),
      h('div', { class: 'dlb-death__txt' },
        d.th ? h('div', { class: 'dlb-death__th', attrs: { lang: 'th' } }, d.th) : null,
        d.en ? h('div', { class: 'dlb-death__en' }, d.en) : null,
        sub ? h('div', { class: 'dlb-death__sub' }, h('span', { class: 'th', attrs: { lang: 'th' } }, sub.th), sub.en ? h('span', { class: 'en' }, sub.en) : null) : null),
      h('div', { class: 'dlb-death__black' }));
    this.el = el;
    this.ui.layer.appendChild(el);
    this.ui._grain(+1, 'death');
    this.ui._refreshXhair?.();
    await enter(el); // opacity 0 -> 1 over 2.6 s (red-black bleed)
    await sleep(1500);
    el.classList.add('is-text');
    await sleep((d.hold ?? 4.2) * 1000 + 1200);
    el.classList.add('is-black');
    await sleep(1900);
    this.ui._grain(-1, 'death');
    if (!d.keepBlack) {
      // let the game reset under the black, then fade back in
      setTimeout(() => {
        el.style.transition = 'opacity 1.6s cubic-bezier(.65,0,.35,1)';
        el.classList.remove('is-in');
        setTimeout(() => {
          el.remove();
          if (this.el === el) this.el = null;
          this.ui._refreshXhair?.();
        }, 1700);
      }, 450);
    }
  }

  /** Remove a death card kept black with keepBlack. */
  release(secs = 1.6) {
    const el = this.el;
    if (!el) return;
    el.style.transition = `opacity ${secs}s cubic-bezier(.65,0,.35,1)`;
    el.classList.remove('is-in');
    setTimeout(() => {
      el.remove();
      if (this.el === el) this.el = null;
      this.ui._refreshXhair?.();
    }, secs * 1000 + 100);
  }
}
