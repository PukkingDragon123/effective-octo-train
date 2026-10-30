// Settings panel bound live to core/Settings (every key), with tabs, sliders,
// segmented choices, a controls reference and a live subtitle preview.
import { settings, GRAPHICS_PRESETS, DEFAULT_SETTINGS } from '../core/Settings.js';
import { h, enter, leave } from './dom.js';
import { screen, ember } from './common.js';
import { navItem } from './nav.js';
import { keyHints, NAV_HINTS, CONTROL_GROUPS, controlRowGlyphs, glyph } from './glyphs.js';

const ONOFF = [[false, 'Off', 'ปิด'], [true, 'On', 'เปิด']];
const pct = (v) => `${Math.round(v * 100)}%`;
const FMT = {
  pct,
  x: (v) => `×${v.toFixed(2)}`,
  m: (v) => `${Math.round(v)} m`,
  deg: (v) => `${Math.round(v)}°`,
};

export const SETTINGS_TABS = [
  {
    id: 'graphics', th: 'กราฟิก', en: 'Graphics',
    groups: [
      {
        th: 'คุณภาพ', en: 'Quality',
        rows: [
          { key: 'graphicsPreset', type: 'seg', th: 'ระดับคุณภาพ', en: 'Preset', preset: true, options: [['low', 'Low', 'ต่ำ'], ['medium', 'Medium', 'กลาง'], ['high', 'High', 'สูง'], ['ultra', 'Ultra', 'สูงสุด']] },
          { key: 'resolutionScale', type: 'slider', th: 'ความละเอียดการเรนเดอร์', en: 'Resolution scale', min: 0.5, max: 1, step: 0.05, fmt: 'pct' },
          { key: 'shadows', type: 'seg', th: 'เงา', en: 'Shadows', options: ONOFF },
          { key: 'shadowMapSize', type: 'seg', th: 'ความคมของเงา', en: 'Shadow detail', options: [[512, '512'], [1024, '1K'], [2048, '2K'], [4096, '4K']] },
          { key: 'mirrorResolution', type: 'seg', th: 'ความละเอียดกระจกมองหลัง', en: 'Mirror resolution', options: [[192, '192'], [256, '256'], [384, '384'], [512, '512']] },
          { key: 'glassReflections', type: 'seg', th: 'เงาสะท้อนบนกระจกรถ', en: 'Glass reflections', options: ONOFF },
          { key: 'volumetrics', type: 'seg', th: 'หมอกและลำแสง', en: 'Volumetric fog', options: ONOFF },
          { key: 'foliageDensity', type: 'slider', th: 'ความหนาแน่นของป่า', en: 'Foliage density', min: 0.4, max: 1.3, step: 0.05, fmt: 'pct' },
          { key: 'particles', type: 'slider', th: 'อนุภาค แมลง ฝน ควันธูป', en: 'Particles', min: 0.2, max: 1.3, step: 0.05, fmt: 'pct' },
          { key: 'drawDistance', type: 'slider', th: 'ระยะการมองเห็น', en: 'Draw distance', min: 70, max: 220, step: 10, fmt: 'm' },
        ],
      },
      {
        th: 'ภาพ', en: 'Image',
        rows: [
          { key: 'brightness', type: 'slider', th: 'ความสว่าง', en: 'Brightness', min: 0.6, max: 1.6, step: 0.02, fmt: 'x' },
          { key: 'bloom', type: 'slider', th: 'แสงฟุ้ง', en: 'Bloom', min: 0, max: 1.5, step: 0.05, fmt: 'pct' },
          { key: 'sharpen', type: 'slider', th: 'ความคมชัด', en: 'Sharpening', min: 0, max: 1, step: 0.05, fmt: 'pct' },
          { key: 'vignette', type: 'slider', th: 'ขอบภาพมืด', en: 'Vignette', min: 0, max: 1, step: 0.05, fmt: 'pct' },
        ],
      },
      {
        th: 'กล้องและความสบายตา', en: 'Camera & comfort',
        rows: [
          { key: 'fov', type: 'slider', th: 'มุมมองกล้อง', en: 'Field of view', min: 55, max: 100, step: 1, fmt: 'deg' },
          { key: 'headBob', type: 'slider', th: 'การโยกของศีรษะ', en: 'Head bob', min: 0, max: 1, step: 0.05, fmt: 'pct' },
          { key: 'cameraShake', type: 'slider', th: 'กล้องสั่น', en: 'Camera shake', min: 0, max: 1, step: 0.05, fmt: 'pct' },
          { key: 'gore', type: 'seg', th: 'เลือดและความรุนแรง', en: 'Blood & gore', options: [['full', 'เต็มที่', 'Full'], ['reduced', 'ลดลง', 'Reduced']] },
          { key: 'reduceFlashes', type: 'seg', th: 'ลดแสงวาบและภาพกะพริบ', en: 'Reduce flashes', options: ONOFF },
        ],
      },
    ],
  },
  {
    id: 'audio', th: 'เสียง', en: 'Audio',
    groups: [
      {
        th: 'ระดับเสียง', en: 'Volume',
        rows: [
          { key: 'volMaster', type: 'slider', th: 'เสียงรวม', en: 'Master', min: 0, max: 1, step: 0.05, fmt: 'pct', bus: 'master' },
          { key: 'volMusic', type: 'slider', th: 'ดนตรี', en: 'Music', min: 0, max: 1, step: 0.05, fmt: 'pct', bus: 'music' },
          { key: 'volSfx', type: 'slider', th: 'เสียงประกอบ', en: 'Effects', min: 0, max: 1, step: 0.05, fmt: 'pct', bus: 'sfx' },
          { key: 'volAmbience', type: 'slider', th: 'เสียงบรรยากาศ', en: 'Ambience', min: 0, max: 1, step: 0.05, fmt: 'pct', bus: 'ambience' },
          { key: 'volVoice', type: 'slider', th: 'เสียงพูด', en: 'Voices', min: 0, max: 1, step: 0.05, fmt: 'pct', bus: 'voice' },
        ],
      },
    ],
  },
  {
    id: 'controls', th: 'การควบคุม', en: 'Controls',
    groups: [
      {
        th: 'การมองและการขับ', en: 'Look & drive',
        rows: [
          { key: 'mouseSensitivity', type: 'slider', th: 'ความไวเมาส์', en: 'Mouse sensitivity', min: 0.2, max: 3, step: 0.05, fmt: 'x' },
          { key: 'invertY', type: 'seg', th: 'กลับแกนมองขึ้น–ลง', en: 'Invert look Y', options: ONOFF },
          { key: 'gamepadLookSensitivity', type: 'slider', th: 'ความไวการมองด้วยจอย', en: 'Gamepad look speed', min: 0.2, max: 3, step: 0.05, fmt: 'x' },
          { key: 'touchControls', type: 'seg', th: 'ปุ่มบนจอ (มือถือ)', en: 'Touch controls', options: [['auto', 'อัตโนมัติ', 'Auto'], ['on', 'เปิด', 'On'], ['off', 'ปิด', 'Off']] },
          { key: 'transmission', type: 'seg', th: 'ระบบเกียร์', en: 'Transmission', options: [['auto', 'Auto', 'ออโต้'], ['manual', 'Manual', 'ธรรมดา']] },
          { key: 'showPrompts', type: 'seg', th: 'แสดงคำแนะนำเมื่อเล็งสิ่งของ', en: 'Interaction prompts', options: ONOFF },
        ],
      },
    ],
    reference: true,
  },
  {
    id: 'text', th: 'ภาษาและคำบรรยาย', en: 'Language & Text',
    groups: [
      {
        th: 'คำบรรยาย', en: 'Subtitles',
        rows: [
          { key: 'language', type: 'seg', th: 'ภาษาในเกม', en: 'Game language', thMain: true, options: [['th', 'ไทย', 'Thai'], ['both', 'ไทย + อังกฤษ', 'Thai + English']] },
          { key: 'subtitles', type: 'seg', th: 'ภาษาคำบรรยาย', en: 'Subtitles', thMain: true, options: [['th', 'ไทย', 'Thai'], ['en', 'English', 'อังกฤษ'], ['both', 'ทั้งสอง', 'Both'], ['off', 'ปิด', 'Off']] },
          { key: 'subtitleSize', type: 'slider', th: 'ขนาดตัวอักษร', en: 'Subtitle size', min: 0.75, max: 1.6, step: 0.05, fmt: 'x' },
          {
            key: 'voice', type: 'seg', th: 'เสียงพากย์', en: 'Voices', options: [['auto', 'Auto', 'อัตโนมัติ'], ['murmur', 'Murmur', 'เสียงพึมพำ'], ['off', 'Off', 'ปิด']],
            noteTh: 'อัตโนมัติ = ใช้เสียงภาษาไทยของเครื่องเมื่อมี', noteEn: 'Auto speaks Thai with your system voice when one is installed',
          },
        ],
      },
    ],
    preview: true,
  },
];

const PRESET_KEYS = Object.keys(GRAPHICS_PRESETS.high);
function isCustomPreset() {
  const p = GRAPHICS_PRESETS[settings.get('graphicsPreset')];
  if (!p) return true;
  return PRESET_KEYS.some((k) => settings.get(k) !== p[k]);
}

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export class SettingsPanel {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this._pending = null;
    this.tabIndex = 0;
  }

  open() {
    if (this._pending) return this._pending;
    this._pending = new Promise((resolve) => this._open(resolve)).finally(() => (this._pending = null));
    return this._pending;
  }

  _open(resolve) {
    const ui = this.ui;
    const nav = ui.nav;
    this.rows = [];
    this.tabs = SETTINGS_TABS.map((t, i) => {
      const b = h('button', { class: 'dlb-tab', attrs: { role: 'tab' } }, ember(), h('span', { class: 'en' }, t.en), h('span', { class: 'th', attrs: { lang: 'th' } }, t.th));
      b.type = 'button';
      b.tabIndex = -1;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        if (this.tabIndex !== i) {
          nav.sound('hover');
          this._setTab(i);
        }
      });
      b.style.pointerEvents = 'auto';
      return b;
    });
    this.body = h('div', { class: 'dlb-settings__body', attrs: { role: 'tabpanel' } });
    const tabsEl = h('div', { class: 'dlb-tabs', attrs: { role: 'tablist' } }, this.tabs, h('div', { class: 'dlb-tabs__keys' }, glyph({ kb: 'KeyQ', pad: 'LB' }), ' ', glyph({ kb: 'KeyE', pad: 'RB' })));
    this.el = screen('dlb-settings',
      h('div', { class: 'dlb-backdrop' }),
      h('div', { class: 'dlb-settings__wrap' },
        h('div', { class: 'dlb-settings__head' }, h('span', { class: 'en' }, 'Settings'), h('span', { class: 'th', attrs: { lang: 'th' } }, 'ตั้งค่า')),
        tabsEl,
        this.body));
    ui.layer.appendChild(this.el);

    const close = () => {
      if (!this.el) return;
      off();
      nav.remove(this.ctx);
      this.ctx = null;
      ui._grain(-1, 'settings');
      ui._dimMenu(-1);
      leave(this.el, 700, { remove: true });
      this.el = null;
      resolve();
    };
    this._close = close;
    const off = settings.onChange(() => this._sync());
    this.ctx = nav.push({
      root: this.body, modal: true, name: 'settings', scroller: this.body,
      onBack: close,
      onTab: (d) => {
        nav.sound('hover');
        this._setTab((this.tabIndex + d + SETTINGS_TABS.length) % SETTINGS_TABS.length);
      },
    });
    this._setTab(this.tabIndex, true);
    ui._grain(+1, 'settings');
    ui._dimMenu(+1);
    enter(this.el);
  }

  _setTab(i, first = false) {
    const nav = this.ui.nav;
    this.tabIndex = i;
    this.tabs.forEach((t, j) => {
      t.classList.toggle('is-active', j === i);
      t.setAttribute('aria-selected', j === i ? 'true' : 'false');
    });
    const tab = SETTINGS_TABS[i];
    this.body.textContent = '';
    this.rows = [];
    for (const g of tab.groups) {
      this.body.appendChild(h('div', { class: 'dlb-group' }, h('span', { class: 'en' }, g.en), h('span', { class: 'th', attrs: { lang: 'th' } }, g.th)));
      for (const r of g.rows) this.body.appendChild(this._row(r));
    }
    if (tab.preview) {
      this.preview = h('div', { class: 'dlb-subpreview' });
      this.body.appendChild(this.preview);
    } else this.preview = null;
    if (tab.reference) this._reference();
    // footer actions
    this.body.appendChild(h('div', { class: 'dlb-spacer', style: 'height:26px' }));
    this.body.appendChild(this._button({ en: 'Reset to defaults', th: 'คืนค่าเริ่มต้นทั้งหมด', onSelect: () => this._reset() }));
    this.body.appendChild(this._button({ en: 'Back', th: 'กลับ', onSelect: () => this._close?.() }));
    this.body.scrollTop = 0;
    if (this.ctx) {
      this.ctx.current = null;
      const firstItem = nav.items(this.ctx)[0];
      if (firstItem) nav.focus(firstItem, { silent: true, ctx: this.ctx });
    }
    this._sync();
    if (!first) {
      this.body.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.22,.61,.36,1)' });
    }
  }

  _label(r) {
    return h('div', { class: 'dlb-row__label' },
      h('span', { class: 'en' }, r.en),
      h('span', { class: 'th', attrs: { lang: 'th' } }, r.th),
      r.noteEn ? h('span', { class: 'dlb-row__note' }, r.noteEn) : null);
  }

  _row(r) {
    const nav = this.ui.nav;
    const row = h('div', { class: `dlb-row is-${r.type}`, attrs: { role: r.type === 'slider' ? 'slider' : 'radiogroup', 'aria-label': r.en } }, ember(), this._label(r));
    const ctl = h('div', { class: 'dlb-row__ctl' });
    row.appendChild(ctl);
    const entry = { r, row };
    if (r.type === 'slider') {
      const fill = h('span', { class: 'dlb-slider__fill' });
      const thumb = h('span', { class: 'dlb-slider__thumb' });
      const slider = h('div', { class: 'dlb-slider' }, h('span', { class: 'dlb-slider__track' }), h('span', { class: 'dlb-slider__ticks' }), fill, thumb);
      const value = h('span', { class: 'dlb-value' });
      ctl.append(slider, value);
      entry.update = () => {
        const v = Number(settings.get(r.key) ?? DEFAULT_SETTINGS[r.key] ?? r.min);
        const t = Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
        fill.style.width = `${t * 100}%`;
        thumb.style.left = `${t * 100}%`;
        value.textContent = (FMT[r.fmt] || String)(v);
        row.setAttribute('aria-valuenow', v);
      };
      const setV = (v) => {
        const d = decimals(r.step);
        v = Math.round(Math.max(r.min, Math.min(r.max, v)) / r.step) * r.step;
        v = Number(v.toFixed(d));
        if (v !== settings.get(r.key)) {
          settings.set(r.key, v);
          this._tick(r);
        }
      };
      const fromX = (x) => {
        const b = slider.getBoundingClientRect();
        setV(r.min + ((x - b.left) / Math.max(1, b.width)) * (r.max - r.min));
      };
      slider.style.pointerEvents = 'auto';
      slider.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        nav.pointerFocus(row);
        slider.setPointerCapture?.(e.pointerId);
        fromX(e.clientX);
        const move = (ev) => fromX(ev.clientX);
        const up = () => {
          slider.removeEventListener('pointermove', move);
          slider.removeEventListener('pointerup', up);
          slider.removeEventListener('pointercancel', up);
        };
        slider.addEventListener('pointermove', move);
        slider.addEventListener('pointerup', up);
        slider.addEventListener('pointercancel', up);
      });
      navItem(nav, row, {
        kind: 'slider',
        adjust: (dir, { repeat } = {}) => {
          const v = Number(settings.get(r.key) ?? r.min);
          const span = (r.max - r.min) / r.step;
          const mult = repeat && span > 40 ? 2 : 1;
          setV(v + dir * r.step * mult);
        },
      });
    } else if (r.type === 'seg') {
      const seg = h('div', { class: 'dlb-seg' });
      const tag = r.preset ? h('span', { class: 'dlb-tag' }) : null;
      if (tag) ctl.appendChild(tag);
      ctl.appendChild(seg);
      const opts = r.options.map(([val, a, b]) => {
        const o = h('span', { class: `dlb-seg__opt${r.thMain ? ' th-main' : ''}`, attrs: { role: 'radio' } },
          h('span', { class: 'a', attrs: { lang: r.thMain ? 'th' : 'en' } }, a), b ? h('span', { class: 'b', attrs: { lang: r.thMain ? 'en' : 'th' } }, b) : null);
        o.addEventListener('mousedown', (e) => e.preventDefault());
        o.addEventListener('click', (e) => {
          e.stopPropagation();
          nav.pointerFocus(row);
          if (settings.get(r.key) !== val) {
            nav.sound('hover');
            settings.set(r.key, val);
          }
        });
        seg.appendChild(o);
        return { val, o };
      });
      entry.update = () => {
        const v = settings.get(r.key);
        const custom = r.preset && isCustomPreset();
        for (const { val, o } of opts) {
          const on = val === v;
          o.classList.toggle('is-on', on && !custom);
          o.setAttribute('aria-checked', on ? 'true' : 'false');
          o.style.opacity = on && custom ? '0.8' : '';
        }
        if (tag) tag.textContent = custom ? 'กำหนดเอง · custom' : '';
      };
      const idx = () => Math.max(0, opts.findIndex((o) => o.val === settings.get(r.key)));
      navItem(nav, row, {
        kind: 'choice',
        adjust: (dir) => {
          const i = Math.max(0, Math.min(opts.length - 1, idx() + dir));
          if (opts[i].val !== settings.get(r.key)) {
            nav.sound('hover');
            settings.set(r.key, opts[i].val);
          }
        },
        activate: () => {
          const i = (idx() + 1) % opts.length;
          nav.sound('select');
          settings.set(r.key, opts[i].val);
        },
      });
    }
    this.rows.push(entry);
    return row;
  }

  _button({ en, th, onSelect }) {
    const row = h('div', { class: 'dlb-row is-button', attrs: { role: 'button' } }, ember(),
      h('div', { class: 'dlb-row__label' }, h('span', { class: 'en' }, en), h('span', { class: 'th', attrs: { lang: 'th' } }, th)));
    navItem(this.ui.nav, row, { kind: 'button', activate: onSelect });
    return row;
  }

  _reference() {
    CONTROL_GROUPS.forEach((g, gi) => {
      this.body.appendChild(h('div', { class: 'dlb-group' }, h('span', { class: 'en' }, g.en), h('span', { class: 'th', attrs: { lang: 'th' } }, g.th),
        gi === 0 ? h('span', { class: 'dlb-group__cols' }, h('span', null, 'Keyboard'), h('span', null, 'Gamepad')) : null));
      for (const r of g.rows) {
        const { kb, pad } = controlRowGlyphs(r);
        const row = h('div', { class: 'dlb-row is-info is-ctl' }, ember(),
          h('div', { class: 'dlb-row__label' }, h('span', { class: 'en' }, r.en), h('span', { class: 'th', attrs: { lang: 'th' } }, r.th)),
          h('div', { class: 'dlb-row__ctl' }, kb, pad));
        navItem(this.ui.nav, row, { kind: 'info' });
        this.body.appendChild(row);
      }
    });
  }

  async _reset() {
    const ok = await this.ui.confirm({
      th: 'คืนค่าการตั้งค่าทั้งหมดเป็นค่าเริ่มต้น?', en: 'Restore every setting to its default?',
      yes: { th: 'คืนค่า', en: 'Reset' }, no: { th: 'ยกเลิก', en: 'Cancel' }, danger: true,
    });
    if (ok) settings.reset();
  }

  _tick(r) {
    // tiny audible feedback on the bus being adjusted (throttled in nav.sound)
    if (r.bus) this.ui.nav.sound('hover', { bus: r.bus === 'master' ? 'ui' : r.bus });
    else this.ui.nav.sound('hover', { volume: 0.3 });
  }

  _sync() {
    if (!this.el) return;
    for (const e of this.rows) e.update?.();
    if (this.preview) {
      this.preview.textContent = '';
      this.preview.appendChild(h('div', { class: 'dlb-subpreview__cap' }, 'ตัวอย่าง · preview'));
      const line = this.ui.subs.render({ speakerTH: 'ป้าศรี', speakerEN: 'Auntie Sri', th: 'ดึกขนาดนี้ยังมีแท็กซี่วิ่งอยู่อีกเหรอ หนู', en: 'A taxi, this late? Lucky me, dear.' });
      if (line) {
        line.classList.add('is-in');
        this.preview.appendChild(line);
      } else this.preview.appendChild(h('div', { class: 'dlb-row__note', style: 'text-align:center' }, 'ปิดคำบรรยาย · subtitles are off'));
    }
  }
}
