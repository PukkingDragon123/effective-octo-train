// Loading screen: title lockup, an incense stick burning down as the progress bar,
// and slowly rotating proverb-like lines.
import { h, enter, leave, clamp01 } from './dom.js';
import { screen, titleLockup } from './common.js';

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
  }

  show(progress = 0, th = '', en = '') {
    if (!this.el) this._build();
    if (this.el.hidden || this.el.classList.contains('is-leaving')) {
      enter(this.el);
      this.ui._grain(+1, 'loading');
      this._startLines();
    }
    this.set(progress, th, en);
  }

  set(progress, th, en) {
    const p = clamp01(Number(progress) || 0);
    this.progress = p;
    const w = (p * 100).toFixed(2) + '%';
    // the stick burns from its tip (right) toward the red base (left); ash trails behind
    this.burn.style.width = w;
    this.pct.textContent = Math.round(p * 100) + '%';
    this.el.querySelector('.dlb-incense').setAttribute('aria-valuenow', Math.round(p * 100));
    if (th !== undefined) this.statusTh.textContent = th || '';
    if (en !== undefined) this.statusEn.textContent = en || '';
  }

  _startLines() {
    clearInterval(this._timer);
    const show = () => {
      const l = LOADING_LINES[this._lineIdx % LOADING_LINES.length];
      this._lineIdx++;
      this.line.classList.add('is-out');
      setTimeout(() => {
        this.lineTh.textContent = l.th;
        this.lineEn.textContent = l.en;
        this.line.classList.remove('is-out');
      }, this._lineIdx === 1 ? 2600 : 1500);
    };
    this._lineIdx = Math.floor(Math.random() * LOADING_LINES.length);
    show();
    this._timer = setInterval(show, 7200);
  }

  async hide() {
    if (!this.el || this.el.hidden) return;
    clearInterval(this._timer);
    this.ui._grain(-1, 'loading');
    await leave(this.el, 1700);
  }
}
