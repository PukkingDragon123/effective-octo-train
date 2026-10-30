// Credits content (shared by the menu credits and the ending roll) + a slow film roll.
import { h, enter, leave } from './dom.js';
import { screen, titleLockup } from './common.js';
import { keyHints, NAV_HINTS } from './glyphs.js';
import * as NARRATIVE from '../game/data/index.js';

const SECTIONS = [
  {
    th: 'เกม', en: 'The game',
    lines: [
      { role: { th: 'เรื่อง ออกแบบ และกำกับ', en: 'Story, design & direction' }, name: 'Pukking Dragon' },
      { role: { th: 'โลก ตัวละคร และภูตผี', en: 'World, characters & spirits' }, name: 'Pukking Dragon', small: 'sculpted & painted in code' },
      { role: { th: 'แอนิเมชัน', en: 'Animation' }, name: 'Pukking Dragon', small: 'procedural, frame by frame' },
      { role: { th: 'ดนตรีและเสียง', en: 'Music & sound' }, name: 'Pukking Dragon', small: 'synthesised with Web Audio' },
      { role: { th: 'เสียงพากย์ภาษาไทย', en: 'Thai voices' }, name: 'Your system’s Thai voice', th: 'เสียงภาษาไทยในเครื่องของคุณ', small: 'or a procedural murmur' },
    ],
  },
  {
    full: true, th: 'ผู้โดยสารยามวิกาล', en: 'Passengers of the night',
    lines: [
      { role: { th: 'ต้น', en: 'the driver' }, name: 'Ton' },
      { role: { th: 'สมชาย', en: 'his father' }, name: 'Somchai' },
      { role: { th: 'อากง', en: 'keeper of the KM 9 garage' }, name: 'Ah Kong' },
      { role: { th: 'ป้าศรี', en: 'jasmine garland seller' }, name: 'Auntie Sri' },
      { role: { th: 'ผู้หญิงชุดขาว', en: 'going to the old hospital' }, name: 'The Woman in White' },
      { role: { th: 'ลุงเปี๊ยก', en: 'singer of old luk thung' }, name: 'Uncle Piak' },
      { role: { th: 'น้องเอ็ม', en: 'his mum is waiting with dinner' }, name: 'Boy “M”' },
      { role: { th: 'คุณนวล', en: 'of the banana grove' }, name: 'Khun Nuan' },
      { role: { th: 'หลวงพี่', en: 'a wandering forest monk' }, name: 'Luang Phi' },
      { role: { th: 'ลุงสมาน', en: 'in the sequinned jacket' }, name: 'Uncle Saman' },
      { role: { th: 'ยายบัว', en: 'flower-garland seller' }, name: 'Grandma Bua' },
      { role: { th: 'ป้าเล็ก', en: 'the all-night noodle shop' }, name: 'Auntie Lek' },
      { role: { th: 'ยายสปีด', en: 'faster than your taxi' }, name: 'Yai Speed' },
    ],
  },
  {
    th: 'เทคโนโลยีและสัญญาอนุญาต', en: 'Technology & licences',
    lines: [
      { role: { th: 'กราฟิกสามมิติ', en: '3D rendering' }, name: 'three.js', small: 'MIT License' },
      { role: { th: 'เครื่องมือสร้างเกม', en: 'Build tooling' }, name: 'Vite', small: 'MIT License' },
      { role: { th: 'เสียงและเสียงพูด', en: 'Sound & speech' }, name: 'Web Audio · Web Speech', small: 'the open web platform' },
    ],
  },
  {
    th: 'แบบอักษร', en: 'Typefaces',
    lines: [
      { role: { th: 'ตัวอักษรทั้งหมด', en: 'Typeface' }, name: 'Srisakdi', small: 'Cadson Demak · SIL Open Font License 1.1' },
    ],
  },
];

const TYPEFACES = SECTIONS.find((x) => x.en === 'Typefaces');
const ASSETS = {
  th: 'ทรัพยากรภายนอก', en: 'Third-party assets',
  lines: [
    { role: { th: 'โครงร่างมนุษย์และท่าทางพื้นฐาน', en: 'Base human meshes & animation clips' }, name: 'Quaternius', small: 'Universal Base Characters \u00b7 Universal Animation Library \u00b7 CC0 1.0' },
  ],
};
const PROCEDURAL_NOTE = {
  th: 'พื้นผิว โลก ฉาก ใบหน้า เสียง และดนตรีทั้งหมด สร้างขึ้นด้วยโค้ด',
  en: 'Every texture, the world, its props, the faces, the sound and the music are generated in code.',
};

/** Credits sections from the narrative data (src/game/data/credits.js) when available. */
function dataSections(full) {
  const C = NARRATIVE.CREDITS;
  if (!Array.isArray(C) || !C.length) return null;
  const out = [];
  for (const sec of C) {
    if (sec.id === 'cast' && !full) continue; // the cast list spoils the ending
    const lines = [];
    for (const e of sec.entries || []) {
      if (e.roleEN === 'Fonts') continue; // detailed in our Typefaces section
      if (e.en && /procedurally generated/i.test(e.en)) {
        lines.push({ note: PROCEDURAL_NOTE });
        continue;
      }
      if (e.name != null) {
        const m = /^(.*?)\s*[\u2014\u00b7]\s*(.*)$/.exec(String(e.name));
        lines.push({ role: { th: e.roleTH || '', en: e.roleEN || '' }, name: m ? m[1] : e.name, small: m ? m[2] : '' });
      } else if (e.th === e.en) lines.push({ title: e.en });
      else lines.push({ note: { th: e.th, en: e.en } });
    }
    out.push({ th: sec.titleTH, en: sec.titleEN, lines });
    if (sec.id === 'tech') out.push(TYPEFACES, ASSETS);
  }
  if (!out.includes(TYPEFACES)) out.push(TYPEFACES, ASSETS);
  return out;
}

function line(l) {
  if (l.note) return h('p', { class: 'dlb-cr-note', attrs: { lang: 'th' } }, l.note.th, l.note.en ? h('span', { class: 'en' }, l.note.en) : null);
  if (l.title) return h('p', { class: 'dlb-cr-note', style: 'font-family:var(--f-title);letter-spacing:.3em;font-size:13px;text-transform:uppercase;color:var(--bone-3)' }, l.title);
  return h('div', { class: 'dlb-cr-line' },
    h('div', { class: 'role' }, h('span', { attrs: { lang: 'th' } }, l.role.th), h('span', { class: 'en' }, l.role.en)),
    h('span', { class: 'dot' }),
    h('div', { class: 'name' }, l.th ? h('span', { class: 'th', attrs: { lang: 'th' } }, l.th) : null, l.name, l.small ? h('small', null, l.small) : null));
}

/** Build the credits column. opts { full } (full = ending roll: cast + dedication), extra: [{th,en}] */
export function buildCredits({ full = false, extra = null } = {}) {
  const fromData = dataSections(full);
  const parts = [];
  parts.push(h('div', { class: 'dlb-cr-block' }, titleLockup({ align: 'center' })));
  parts.push(h('div', { class: 'dlb-cr-block dlb-cr-made' },
    h('div', { class: 'dlb-cr-made__cap' }, h('span', { attrs: { lang: 'th' } }, 'สร้างโดย'), h('span', { class: 'en' }, 'made by')),
    h('div', { class: 'dlb-cr-made__name' }, 'Pukking Dragon'),
    h('div', { class: 'dlb-cr-made__mark' })));
  for (const s of fromData || SECTIONS) {
    if (s.full && !full) continue;
    parts.push(h('div', { class: 'dlb-cr-sec' },
      h('div', { class: 'dlb-cr-sec__h' }, h('span', { class: 'en' }, s.en), h('span', { class: 'th', attrs: { lang: 'th' } }, s.th)),
      s.lines.map(line)));
  }
  if (!fromData) parts.push(h('div', { class: 'dlb-cr-sec' },
    h('p', { class: 'dlb-cr-note', attrs: { lang: 'th' } }, 'พื้นผิว โมเดล แอนิเมชัน เสียง และดนตรีทั้งหมดในเกมนี้ สร้างขึ้นด้วยโค้ดทั้งสิ้น',
      h('span', { class: 'en' }, 'All textures, models, animation, sound and music are procedurally generated in code. No photographs, no recordings.')),
    h('p', { class: 'dlb-cr-note', attrs: { lang: 'th' } }, 'ตัวละคร สถานที่ และเหตุการณ์ทั้งหมดเป็นเรื่องสมมุติ หากบังเอิญคล้ายผู้ใด ถือเป็นเรื่องเหนือธรรมชาติ',
      h('span', { class: 'en' }, 'All characters, places and events are fictional. Any resemblance is purely supernatural.'))));
  if (extra && extra.length) {
    parts.push(h('div', { class: 'dlb-cr-sec' }, extra.map((x) => h('p', { class: 'dlb-cr-dedic', attrs: { lang: 'th' } }, x.th, x.en ? h('span', { class: 'en' }, x.en) : null))));
  }
  if (full) {
    parts.push(h('div', { class: 'dlb-cr-sec' },
      h('p', { class: 'dlb-cr-dedic', attrs: { lang: 'th' } }, 'แด่พ่อทุกคนที่ล้างรถทุกเช้า เผื่อลูกจะกลับบ้าน',
        h('span', { class: 'en' }, 'For every father who washed the car each morning, in case his child came home.'))));
  }
  const closing = NARRATIVE.CREDITS_CLOSING;
  parts.push(h('div', { class: 'dlb-cr-sec', style: full ? 'margin-bottom:40vh' : '' },
    h('div', { class: 'dlb-cr-thanks', attrs: { lang: 'th' } }, 'ขอบคุณที่นั่งรถไปด้วยกันจนถึงเช้า',
      h('span', { class: 'en' }, 'Thank you for riding with us until morning.')),
    h('div', { class: 'dlb-hair is-center', style: 'margin-top:2.2em;width:120px' }),
    h('div', { class: 'dlb-cr-note', style: 'margin-top:1.6em', attrs: { lang: 'th' } }, 'กลับบ้านดี ๆ นะ', h('span', { class: 'en' }, 'Get home safe.')),
    closing ? h('div', { class: 'dlb-cr-note', style: 'margin-top:2.4em;opacity:.7', attrs: { lang: 'th' } }, closing.th, h('span', { class: 'en' }, closing.en)) : null));
  return h('div', { class: 'dlb-roll' }, parts);
}

/** Auto-scrolling film roll with manual nudge (keys / wheel). */
export class Roll {
  /** startFrac: where the roll's top starts, as a fraction of the view height (0.55 = below centre) */
  constructor(view, roll, { speed = 30, startDelay = 2.2, startFrac = 0.55, onEnd = null } = {}) {
    this.view = view;
    this.roll = roll;
    this.speed = speed;
    this.delay = startDelay;
    this.onEnd = onEnd;
    this.startFrac = startFrac;
    this.y = 0;
    this.manualHold = 0;
    this.ended = false;
    this._last = 0;
    this._raf = 0;
    this._vel = 0;
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.nudge(e.deltaY * 0.8);
    }, { passive: false });
  }

  get max() {
    // stop when the roll's bottom edge sits at ~75% of the view
    const H = this.view.clientHeight;
    return Math.max(0, this.roll.scrollHeight - H * (0.75 - this.startFrac));
  }

  start() {
    this._last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._last = now;
      if (this.view.closest('.dlb-still')) return; // frozen for headless screenshots
      if (this.delay > 0) this.delay -= dt;
      else if (this.manualHold > 0) this.manualHold -= dt;
      else this.y += this.speed * dt;
      this.y += this._vel * dt;
      this._vel *= Math.exp(-6 * dt);
      const max = this.max;
      if (this.y > max) {
        this.y = max;
        if (!this.ended) {
          this.ended = true;
          this.onEnd?.();
        }
      }
      if (this.y < 0) this.y = 0;
      this.roll.style.transform = `translate3d(0, ${(this.view.clientHeight * this.startFrac - this.y).toFixed(1)}px, 0)`;
    };
    this._raf = requestAnimationFrame(tick);
  }

  nudge(px) {
    this._vel += px * 5;
    this.manualHold = 2.5;
    this.delay = 0;
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }
}

export class CreditsScreen {
  constructor(ui) {
    this.ui = ui;
    this._pending = null;
  }

  open() {
    if (this._pending) return this._pending;
    this._pending = new Promise((resolve) => this._open(resolve)).finally(() => (this._pending = null));
    return this._pending;
  }

  _open(resolve) {
    const ui = this.ui;
    const roll = buildCredits({ full: false });
    const view = h('div', { class: 'dlb-roll-view' }, roll);
    const el = screen('dlb-credits', h('div', { class: 'dlb-backdrop' }), view);
    ui.layer.appendChild(el);
    const r = new Roll(view, roll, { speed: 26, startDelay: 3.2, startFrac: 0.16 });
    let ctx = null;
    const close = () => {
      r.stop();
      ui.nav.remove(ctx);
      ui._grain(-1, 'credits');
      ui._dimMenu(-1);
      leave(el, 900, { remove: true });
      resolve();
    };
    ctx = ui.nav.push({
      root: view, modal: true, name: 'credits', items: () => [],
      onBack: close,
      onAction: (a, cur, { repeat }) => {
        if (a === 'up' || a === 'down') {
          r.nudge((a === 'up' ? -1 : 1) * (repeat ? 50 : 70));
          return true;
        }
        if (a === 'select') {
          ui.nav.sound('back');
          close();
          return true;
        }
        return false;
      },
    });
    r.start();
    ui._grain(+1, 'credits');
    ui._dimMenu(+1);
    enter(el);
  }
}
