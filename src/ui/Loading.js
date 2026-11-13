// Loading screen: no words at all. A single joss stick burns in Ah Kong's urn in the dark (the
// 3D IncenseScene); its burning front is the progress. When loading is done a pale hand comes out
// of the dark and takes the stick by itself, then the menu comes up. If WebGL is unavailable a
// thin 2D stick burns instead.
import { h, enter, leave, clamp01, sleep } from './dom.js';
import { screen } from './common.js';
import { IncenseScene } from './IncenseScene.js';

/** Proverb-like lines (kept for other modules; the loading screen itself shows no text). */
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

/** Longest the hand sequence may take before the game moves on regardless (ms). */
const INTRO_CAP_MS = 4200;

export class Loading {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this.progress = 0;
  }

  _build() {
    this.burn = h('span', { class: 'dlb-incense__burn' }, h('span', { class: 'dlb-incense__ember' }));
    this.stick = h('div', { class: 'dlb-incense', attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'loading' } },
      h('span', { class: 'dlb-incense__stick' }), this.burn);
    this.el = screen('dlb-loading', this.stick, h('div', { class: 'dlb-loading__vignette' }));
    this.ui.layer.appendChild(this.el);
    // the real thing: a 3D stick burning in Ah Kong's urn (the 2D stick stays as the fallback)
    try {
      this.stage = h('div', { class: 'dlb-loading__3d', attrs: { 'aria-hidden': 'true' } });
      this.el.insertBefore(this.stage, this.el.firstChild);
      this.scene3d = new IncenseScene(this.stage);
      window.__dlbIntro = this.scene3d; // QA handle (headless traces)
      this.el.classList.add('has-3d');
    } catch (e) {
      console.warn('[loading] 3D incense unavailable', e);
      this.stage?.remove();
      this.scene3d = null;
    }
  }

  /** th / en status strings are accepted for the contract but never shown. */
  show(progress = 0) {
    if (!this.el) this._build();
    if (this.el.hidden || this.el.classList.contains('is-leaving')) enter(this.el);
    this.set(progress);
    this.ui._refreshXhair?.();
  }

  set(progress) {
    const p = clamp01(Number(progress) || 0);
    this.progress = p;
    this.burn.style.width = (p * 100).toFixed(2) + '%';
    this.scene3d?.setProgress(p);
    this.stick.setAttribute('aria-valuenow', Math.round(p * 100));
  }

  /**
   * The intro, automatic (no click gate): the burnt-down stick is taken by a pale hand. Audio is
   * unlocked later by the first gesture in the menu. cue(name) fires on 'start' | 'reach' |
   * 'grab' | 'pull' so the game can add sound. Never takes longer than INTRO_CAP_MS, whatever the
   * render loop does (a stalled GPU, a hidden tab).
   */
  async playIntro(cue = () => {}) {
    if (!this.el) return;
    const safeCue = (n) => {
      try {
        cue(n);
      } catch (e) {
        /* sound is optional */
      }
    };
    this.el.classList.add('is-ready');
    safeCue('start');
    const grab = this.scene3d ? this.scene3d.playGrab(safeCue) : sleep(700);
    await Promise.race([Promise.resolve(grab).catch(() => {}), sleep(INTRO_CAP_MS)]);
  }

  /** Kept for the old call site: there is no gate any more, it just plays the intro. */
  waitForStart(cue) {
    return this.playIntro(cue);
  }

  async hide() {
    if (!this.el || this.el.hidden) return;
    await leave(this.el, 900);
    this.scene3d?.dispose();
    this.scene3d = null;
    this.stage?.remove();
    this.el.classList.remove('has-3d', 'is-ready');
    this.ui._refreshXhair?.();
  }
}
