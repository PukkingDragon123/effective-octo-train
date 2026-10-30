// Main menu (over the live cinematic) and the pause menu.
import { h, enter, leave, clockString, thaiHourWords, parseClock } from './dom.js';
import { screen, titleLockup, menuItem } from './common.js';
import { keyHints, NAV_HINTS } from './glyphs.js';

export class MainMenu {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this.ctx = null;
  }

  show(handlers = {}) {
    const ui = this.ui;
    if (this.el) this._teardown(true);
    const nav = ui.nav;
    const can = typeof handlers.canResume === 'function' ? !!handlers.canResume() : !!handlers.canResume;
    const call = (fn, fallback) => () => {
      if (typeof fn === 'function') fn();
      else fallback?.();
    };
    const items = [
      menuItem(nav, { en: 'New Game', th: 'เริ่มเกมใหม่', onSelect: call(handlers.onNew) }),
      menuItem(nav, { en: 'Resume', th: 'เล่นต่อ', disabled: !can, onSelect: call(handlers.onResume) }),
      menuItem(nav, { en: 'Settings', th: 'ตั้งค่า', onSelect: call(handlers.onSettings, () => ui.showSettings()) }),
      menuItem(nav, { en: 'Credits', th: 'ทีมผู้สร้าง', onSelect: call(handlers.onCredits, () => ui.showCredits()) }),
    ];
    if (handlers.onQuit) items.push(menuItem(nav, { en: 'Quit', th: 'ออกจากเกม', onSelect: call(handlers.onQuit) }));
    this.list = h('nav', { class: 'dlb-list dlb-menu__list', attrs: { 'aria-label': 'Main menu' } }, items);
    this.el = screen('dlb-menu',
      h('div', { class: 'dlb-menu__shade' }),
      h('div', { class: 'dlb-menu__col' }, titleLockup({ align: 'left' }), this.list),
      h('footer', { class: 'dlb-foot' },
        h('div', { class: 'dlb-foot__brand' }, 'Pukking Dragon ', h('i', null, '· a night-shift ghost story')),
        keyHints([NAV_HINTS.move, NAV_HINTS.ok])));
    ui.layer.appendChild(this.el);
    this.ctx = nav.push({ root: this.list, modal: true, initial: can ? 1 : 0, name: 'menu' });
    enter(this.el);
    ui._grain(+1, 'menu');
  }

  /** Dim while a sub-screen (settings, slots, credits) is on top. */
  dim(v) {
    this.el?.classList.toggle('is-dimmed', !!v);
  }

  async hide() {
    if (!this.el) return;
    await this._teardown(false);
  }

  async _teardown(instant) {
    const el = this.el;
    this.el = null;
    if (this.ctx) this.ui.nav.remove(this.ctx);
    this.ctx = null;
    this.ui._grain(-1, 'menu');
    if (instant) el.remove();
    else await leave(el, 1700, { remove: true });
  }
}

export class PauseMenu {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this.ctx = null;
  }

  /** handlers {onResume, onSettings, onQuitToMenu, time?:'02:14'|hour, th?, en?} */
  show(handlers = {}) {
    const ui = this.ui;
    if (this.el) this._teardown(true);
    const nav = ui.nav;
    const resume = () => {
      this.hide();
      handlers.onResume?.();
    };
    const quit = async () => {
      const ok = await ui.confirm({
        th: 'กลับสู่เมนูหลัก?', en: 'Return to the main menu?',
        subTh: 'ความคืบหน้าหลังจุดบันทึกล่าสุดจะหายไป', subEn: 'Progress since the last checkpoint will be lost.',
        yes: { th: 'กลับเมนู', en: 'Quit' }, no: { th: 'ยกเลิก', en: 'Cancel' }, danger: true,
      });
      if (!ok) return;
      this.hide();
      handlers.onQuitToMenu?.();
    };
    const list = h('nav', { class: 'dlb-list', attrs: { 'aria-label': 'Pause menu' } },
      menuItem(nav, { en: 'Resume', th: 'เล่นต่อ', onSelect: resume }),
      menuItem(nav, { en: 'Settings', th: 'ตั้งค่า', onSelect: () => (handlers.onSettings ? handlers.onSettings() : ui.showSettings()) }),
      menuItem(nav, { en: 'Quit to Menu', th: 'กลับสู่เมนูหลัก', onSelect: quit }));
    let timeEl = null;
    if (handlers.time == null && Number.isFinite(ui._hour) && handlers.showTime !== false) handlers = { ...handlers, time: ui._hour };
    if (handlers.time != null) {
      const hr = typeof handlers.time === 'number' ? handlers.time : parseClock(handlers.time);
      const t = typeof handlers.time === 'number' ? clockString(handlers.time) : handlers.time;
      timeEl = h('div', { class: 'dlb-pause__time' },
        h('div', { class: 't' }, t),
        h('span', { class: 'th', attrs: { lang: 'th' } }, handlers.th || (hr != null ? thaiHourWords(hr) : '')),
        handlers.en ? h('span', { class: 'en' }, handlers.en) : null);
    }
    this.el = screen('dlb-pause',
      h('div', { class: 'dlb-backdrop' }),
      timeEl,
      h('div', { class: 'dlb-pause__col' },
        h('div', { class: 'dlb-pause__head' }, h('span', { class: 'en' }, 'Paused'), h('span', { class: 'th', attrs: { lang: 'th' } }, 'หยุดพักชั่วคราว')),
        list),
      h('footer', { class: 'dlb-foot' }, h('div', { class: 'dlb-foot__brand' }, 'Pukking Dragon'), keyHints([NAV_HINTS.move, NAV_HINTS.ok, NAV_HINTS.back])));
    ui.layer.appendChild(this.el);
    this.ctx = nav.push({ root: list, modal: true, name: 'pause', onBack: resume, onStart: resume });
    enter(this.el);
    ui._grain(+1, 'pause');
  }

  get visible() {
    return !!this.el;
  }

  hide() {
    if (!this.el) return;
    this._teardown(false);
  }

  _teardown(instant) {
    const el = this.el;
    this.el = null;
    if (this.ctx) this.ui.nav.remove(this.ctx);
    this.ctx = null;
    this.ui._grain(-1, 'pause');
    if (instant) el.remove();
    else leave(el, 900, { remove: true });
  }
}
