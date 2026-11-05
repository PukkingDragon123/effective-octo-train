// Crosshair: a small dot at the centre of the view, always there in gameplay. When core/Interact
// targets something (bus 'interact:target') the dot opens into a thin ring and a short Thai verb
// appears just below it ("เปิดประตู", "หยิบ", "คุย"...). Hidden under menus, full-screen cards and
// while a cinematic camera owns the view.
import { settings } from '../core/Settings.js';
import { engine } from '../core/Engine.js';
import { cameraRig } from '../core/CameraRig.js';
import { h } from './dom.js';

export class Crosshair {
  constructor(ui) {
    this.ui = ui;
    this.th = h('span', { class: 'th', attrs: { lang: 'th' } });
    this.en = h('span', { class: 'en', attrs: { lang: 'en' } });
    this.label = h('div', { class: 'dlb-xhair__label' }, this.th, this.en);
    this.el = h('div', { class: 'dlb-xhair is-hidden', attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'dlb-xhair__dot' }),
      h('div', { class: 'dlb-xhair__ring' }),
      this.label);
    ui.layer.appendChild(this.el);
    this.visible = true; // what the game asked for (setCrosshair)
    this.target = null;
    this._cine = false;
    this.apply();
    // a cinematic camera (cut-scenes, deaths) hides it without the game having to ask
    try {
      engine.onUpdate(() => {
        const cine = (cameraRig?.cineBlend || 0) > 0.5;
        if (cine !== this._cine) {
          this._cine = cine;
          this.apply();
        }
      }, 90, { always: true });
    } catch (e) {
      /* engine not running (UI sandbox) */
    }
  }

  setVisible(v) {
    this.visible = !!v;
    this.apply();
  }

  /** Effective visibility: hidden under menus, full-screen cards and cinematics whatever the game asked. */
  apply() {
    const blocked = this.ui.modalOpen || this.ui._fullscreenCards() > 0 || this._cine;
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
    this.th.textContent = t.labelTH || '';
    this.en.textContent = t.labelEN || '';
    this.el.dataset.icon = t.icon || 'hand';
    this.el.classList.add('is-target');
    this.el.classList.toggle('has-label', prompts && !!(t.labelTH || t.labelEN));
    // restart the label's entrance on every new target
    this.label.classList.remove('is-new');
    void this.label.offsetWidth;
    this.label.classList.add('is-new');
  }

  applySettings() {
    if (this.target) this.setTarget(this.target);
  }
}
