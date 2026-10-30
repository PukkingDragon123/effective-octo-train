// Loading screen: title lockup, an incense stick burning down as the progress bar,
// and slowly rotating proverb-like lines.
import { h, enter, leave, clamp01 } from './dom.js';
import { screen, titleLockup } from './common.js';
import * as NARRATIVE from '../game/data/index.js';
import { IncenseScene } from './IncenseScene.js';

export const LOADING_LINES = [
  { th: 'ไม่ว่าจะได้ยินอะไรจากเบาะหลัง อย่าหันไปมอง', en: 'Whatever you hear from the back seat, don’t look.' },
  { th: 'ทุกเส้นทางไปจบที่ศาลเจ้า', en: 'Every road ends at the shrine.' },
  { th: 'ซ้ายสำหรับคนตาย ขวาสำหรับคนเป็น', en: 'Left for the dead. Right for the living.' },
  { th: 'ธูปหมดดอกเมื่อไร ก็ถึงเวลาออกเดินทาง', en: 'When the incense burns down, it is time to go.' },
  { th: 'ถ้ามีเสียงเรียกชื่อจากข้างนอก อย่าขานรับ', en: 'If something outside calls your name, don’t answer.' },
  { th: 'บางคนขึ้นรถเพื่อกลับบ้าน บางคนไม่มีบ้านให้กลับแล้ว', en: 'Some ride to go home. Some have no home left to go to.' },
  { th: 'ผ่านศาลให้บีบแตรสองครั้ง ขอทางเจ้าที่', en: 'Honk twice when you pass a shrine. Ask the spirits for passage.' },
  { th: 'คืนจะยาวเสมอ สำหรับคนที่ยังไม่ได้ขอโทษ', en: 'The night is always long for those who never said sorry.' },
  { th: 'กระจกไม่เคยโกหก', en: 'The mirror never lies.' },
];

export class Loading {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this.progress = 0;
    this._lineIdx = 0;
    this._timer = 0;
  }

  _build() {
    this.ember = h('span', { class: 'dlb-incense__ember' });
    this.ash = h('span', { class: 'dlb-incense__ash' });
    this.burn = h('span', { class: 'dlb-incense__burn' }, this.ash, this.ember,
      h('span', { class: 'dlb-smoke' }), h('span', { class: 'dlb-smoke' }), h('span', { class: 'dlb-smoke' }));
    this.statusTh = h('span', { class: 'th', attrs: { lang: 'th' } });
    this.statusEn = h('span', { class: 'en' });
    this.pct = h('span', { class: 'dlb-loading__pct' }, '0%');
    this.lineTh = h('span', { class: 'th', attrs: { lang: 'th' } });
    this.lineEn = h('span', { class: 'en' });
    this.line = h('div', { class: 'dlb-loading__line is-out' }, this.lineTh, this.lineEn);
    this.el = screen('dlb-loading',
      h('div', { class: 'dlb-loading__inner' },
        titleLockup({ presents: true, align: 'center' }),
        h('div', { class: 'dlb-incense', attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 } },
          h('span', { class: 'dlb-incense__stick' }), this.burn),
        h('div', { class: 'dlb-loading__status' }, this.statusTh, this.statusEn, this.pct)),
      this.line);
    this.ui.layer.appendChild(this.el);
    // the real thing: a 3D stick burning in Ah Kong's urn (the 2D stick stays as the fallback)
    try {
      this.stage = h('div', { class: 'dlb-loading__3d', attrs: { 'aria-hidden': 'true' } });
      this.el.insertBefore(this.stage, this.el.firstChild);
      this.scene3d = new IncenseScene(this.stage);
      this.el.classList.add('has-3d');
    } catch (e) {
      console.warn('[loading] 3D incense unavailable', e);
      this.stage?.remove();
      this.scene3d = null;
    }
  }

  show(progress = 0, th = '', en = '') {
    if (!this.el) this._build();
    if (this.el.hidden || this.el.classList.contains('is-leaving')) {
      enter(this.el);
      this.ui._grain(+1, 'loading');
      this._startLines();
    }
    this.set(progress, th, en);
    this.ui._refreshXhair?.();
  }

  set(progress, th, en) {
    const p = clamp01(Number(progress) || 0);
    this.progress = p;
    const w = (p * 100).toFixed(2) + '%';
    // the stick burns from its tip (right) toward the red base (left); ash trails behind
    this.burn.style.width = w;
    this.pct.textContent = Math.round(p * 100) + '%';
    this.scene3d?.setProgress(p);
    this.el.querySelector('.dlb-incense').setAttribute('aria-valuenow', Math.round(p * 100));
    if (th !== undefined) this.statusTh.textContent = th || '';
    if (en !== undefined) this.statusEn.textContent = en || '';
  }

  _startLines() {
    clearInterval(this._timer);
    const lines = Array.isArray(NARRATIVE.LOADING_LINES) && NARRATIVE.LOADING_LINES.length ? NARRATIVE.LOADING_LINES.concat(LOADING_LINES.slice(0, 4)) : LOADING_LINES;
    const show = () => {
      const l = lines[this._lineIdx % lines.length];
      this._lineIdx++;
      this.line.classList.add('is-out');
      setTimeout(() => {
        this.lineTh.textContent = l.th;
        this.lineEn.textContent = l.en;
        this.line.classList.remove('is-out');
      }, this._lineIdx === 1 ? 2600 : 1500);
    };
    // owner: almost no text. The burning stick is the progress; no rotating lines.
    void show;
  }

  /**
   * Hold on the burnt-down stick until the player presses something (this is also the gesture
   * that unlocks audio), then play the hand taking the incense. cue(name) fires on
   * 'start' | 'reach' | 'grab' | 'pull' so the game can add sound.
   */
  async waitForStart(cue = () => {}) {
    if (!this.el) return;
    this.el.classList.add('is-ready');
    this.statusTh.textContent = '';
    this.statusEn.textContent = '';
    this.pct.textContent = '';
    this.start = h('div', { class: 'dlb-loading__start' },
      h('span', { class: 'th', attrs: { lang: 'th' } }, 'แตะเพื่อเริ่ม'), h('span', { class: 'en' }, 'press any key'));
    this.el.appendChild(this.start);
    await new Promise((resolve) => {
      let raf = 0;
      const t0 = performance.now();
      const done = (e) => {
        if (performance.now() - t0 < 350) return;
        if (e?.type === 'keydown' && (e.key === '`' || e.repeat)) return;
        window.removeEventListener('pointerdown', done, true);
        window.removeEventListener('keydown', done, true);
        cancelAnimationFrame(raf);
        resolve();
      };
      window.addEventListener('pointerdown', done, true);
      window.addEventListener('keydown', done, true);
      const poll = () => {
        for (const pad of navigator.getGamepads?.() || []) if (pad?.buttons?.some((b) => b.pressed)) return done();
        raf = requestAnimationFrame(poll);
      };
      raf = requestAnimationFrame(poll);
    });
    this.start.classList.add('is-gone');
    try {
      cue('start');
    } catch (e) {
      /* sound is optional */
    }
    if (this.scene3d) await this.scene3d.playGrab((n) => {
      try {
        cue(n);
      } catch (e) {
        /* sound is optional */
      }
    });
  }

  async hide() {
    if (!this.el || this.el.hidden) return;
    clearInterval(this._timer);
    this.ui._grain(-1, 'loading');
    await leave(this.el, 1700);
    this.scene3d?.dispose();
    this.scene3d = null;
    this.stage?.remove();
    this.start?.remove();
    this.el.classList.remove('has-3d', 'is-ready');
    this.ui._refreshXhair?.();
  }
}
