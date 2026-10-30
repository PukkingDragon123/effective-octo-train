// Main menu (over the live cinematic) and the pause menu.
import { h, enter, leave } from './dom.js';
import { screen, titleLockup, menuItem } from './common.js';

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
    const items = [];
    if (can) items.push(menuItem(nav, { en: 'Continue', th: 'เล่นต่อ', onSelect: call(handlers.onResume) }));
    items.push(
      menuItem(nav, { en: 'New Game', th: 'เริ่มใหม่', onSelect: call(handlers.onNew) }),
      menuItem(nav, { en: 'Settings', th: 'ตั้งค่า', onSelect: call(handlers.onSettings, () => ui.showSettings()) }),
      menuItem(nav, { en: 'Credits', th: 'ผู้สร้าง', onSelect: call(handlers.onCredits, () => ui.showCredits()) }),
    );
    if (handlers.onQuit) items.push(menuItem(nav, { en: 'Quit', th: 'ออก', onSelect: call(handlers.onQuit) }));
    this.list = h('nav', { class: 'dlb-list dlb-menu__list', attrs: { 'aria-label': 'Main menu' } }, items);
    this.el = screen('dlb-menu',
      h('div', { class: 'dlb-menu__shade' }),
      h('div', { class: 'dlb-menu__col' }, titleLockup({ align: 'left' }), this.list));
    ui.layer.appendChild(this.el);
    this.ctx = nav.push({ root: this.list, modal: true, initial: 0, name: 'menu' });
    enter(this.el);
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
    if (instant) el.remove();
    else await leave(el, 1200, { remove: true });
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
        th: 'กลับไปเมนู?', en: 'Back to the menu?',
        yes: { th: 'กลับ', en: 'Yes' }, no: { th: 'ไม่', en: 'No' }, danger: true,
      });
      if (!ok) return;
      this.hide();
      handlers.onQuitToMenu?.();
    };
    const list = h('nav', { class: 'dlb-list', attrs: { 'aria-label': 'Pause menu' } },
      menuItem(nav, { en: 'Resume', th: 'เล่นต่อ', onSelect: resume }),
      menuItem(nav, { en: 'Settings', th: 'ตั้งค่า', onSelect: () => (handlers.onSettings ? handlers.onSettings() : ui.showSettings()) }),
      menuItem(nav, { en: 'Main Menu', th: 'เมนู', onSelect: quit }));
    this.el = screen('dlb-pause', h('div', { class: 'dlb-backdrop' }), h('div', { class: 'dlb-pause__col' }, list));
    ui.layer.appendChild(this.el);
    this.ctx = nav.push({ root: list, modal: true, name: 'pause', onBack: resume, onStart: resume });
    enter(this.el);
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
    if (instant) el.remove();
    else leave(el, 900, { remove: true });
  }
}
