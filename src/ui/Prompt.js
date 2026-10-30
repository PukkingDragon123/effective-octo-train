// Crosshair: a tiny soft dot that blooms into a ring + icon + bilingual label when
// core/Interact targets something (bus 'interact:target').
import { settings } from '../core/Settings.js';
import { h } from './dom.js';
import { iconSVG, glyph } from './glyphs.js';

export class Crosshair {
  constructor(ui) {
    this.ui = ui;
    this.icon = h('div', { class: 'dlb-xhair__icon' });
    this.th = h('span', { class: 'th', attrs: { lang: 'th' } });
    this.en = h('span', { class: 'en' });
    this.label = h('div', { class: 'dlb-xhair__label' }, glyph('interact'), h('div', { class: 'dlb-xhair__txt' }, this.th, this.en));
    this.el = h('div', { class: 'dlb-xhair is-hidden', attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'dlb-xhair__dot' }),
      h('div', {
        class: 'dlb-xhair__ring',
        html: '<svg viewBox="0 0 30 30"><circle class="halo" cx="15" cy="15" r="11"/><circle cx="15" cy="15" r="11"/></svg>',
      }),
      this.icon,
      this.label);
    ui.layer.appendChild(this.el);
    this.visible = true; // what the game asked for (setCrosshair)
    this.target = null;
    this._icon = null;
    this.apply();
  }

  setVisible(v) {
    this.visible = !!v;
    this.apply();
  }

  /** Effective visibility: hidden under menus and full-screen cards whatever the game asked. */
  apply() {
    const blocked = this.ui.modalOpen || this.ui._fullscreenCards() > 0;
    this.el.classList.toggle('is-hidden', !this.visible || blocked);
  }

  /** t = {id, labelEN, labelTH, icon} | null */
  setTarget(t) {
    this.target = t || null;
    if (!t) {
      this.el.classList.remove('is-target', 'has-label');
      return;
    }
    const prompts = settings.get('showPrompts') !== false;
    if (!prompts) {
      // prompts off: keep only the dot (a faint pulse tells you it's usable)
      this.el.classList.remove('is-target', 'has-label');
      return;
    }
    const icon = t.icon || 'hand';
    if (icon !== this._icon) {
      this.icon.innerHTML = iconSVG(icon);
      this._icon = icon;
    }
    this.th.textContent = t.labelTH || '';
    this.en.textContent = t.labelEN || '';
    this.el.classList.add('is-target');
    this.el.classList.toggle('has-label', !!(t.labelTH || t.labelEN));
  }

  applySettings() {
    if (this.target) this.setTarget(this.target);
  }
}
