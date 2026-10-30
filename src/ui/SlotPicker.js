// Save slot picker: three slots from saves.list(), overwrite / delete confirmation.
import { saves } from '../core/Save.js';
import { h, enter, leave, clockString, thaiHour } from './dom.js';
import { screen, ember } from './common.js';
import { navItem } from './nav.js';
import { keyHints, NAV_HINTS } from './glyphs.js';

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const thaiNum = (n) => String(n).replace(/\d/g, (d) => THAI_DIGITS[+d]);
const ENDING_IDS = ['dawn', 'endless', 'forgive', 'wrong_home'];

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  try {
    const th = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${th} · ${t}`;
  } catch (e) {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function fmtPlay(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
}

/** Where the save stands, as {big, th, en}. */
export function slotStage(d) {
  if (!d) return null;
  if (d.stage === 'intro') return { big: 'กม.9', th: 'ทางเข้าป่า', en: 'The road in' };
  if (d.stage === 'tutorial') return { big: 'กม.9', th: 'อู่ของอากง', en: 'Ah Kong’s garage' };
  if (d.stage === 'ending') return { big: '06:00', th: 'รุ่งสาง', en: 'Dawn' };
  const hr = d.hour ?? 21;
  return { big: clockString(hr), th: thaiHour(hr), en: hr >= 24 ? 'after midnight' : 'the night shift' };
}

export class SlotPicker {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this._pending = null;
  }

  pick(mode = 'new') {
    if (this._pending) return this._pending;
    this._pending = new Promise((resolve) => this._open(mode, resolve)).finally(() => (this._pending = null));
    return this._pending;
  }

  _open(mode, resolve) {
    const ui = this.ui;
    const nav = ui.nav;
    let ctx = null;
    let busy = false;
    const finish = (v) => {
      nav.remove(ctx);
      ui._grain(-1, 'slots');
      ui._dimMenu(-1);
      leave(this.el, 800, { remove: true });
      this.el = null;
      resolve(v);
    };

    const row = h('div', { class: 'dlb-slots__row' });
    const head = h('div', { class: 'dlb-slots__head' },
      h('span', { class: 'en' }, mode === 'load' ? 'Resume a Shift' : 'Choose a Slot'),
      h('span', { class: 'th', attrs: { lang: 'th' } }, mode === 'load' ? 'เลือกกะที่จะเล่นต่อ' : 'เลือกช่องบันทึกสำหรับกะใหม่'));
    this.el = screen('dlb-slots',
      h('div', { class: 'dlb-backdrop' }),
      head, row,
      h('footer', { class: 'dlb-foot' }, keyHints([NAV_HINTS.moveH, NAV_HINTS.ok, NAV_HINTS.del, NAV_HINTS.back])));

    const slots = [];
    const dels = [];
    const render = (focusIdx = null, focusDel = false) => {
      row.textContent = '';
      slots.length = 0;
      dels.length = 0;
      const list = saves.list();
      let lastUsed = null;
      try {
        lastUsed = saves.lastUsed();
      } catch (e) {
        lastUsed = null;
      }
      for (const s of list) {
        const d = s.data;
        const disabled = mode === 'load' && s.empty;
        const st = slotStage(d);
        const body = s.empty
          ? h('div', { class: 'dlb-vacant' },
            h('span', { class: 'dlb-vacant__lamp', attrs: { lang: 'th' } }, 'ว่าง'),
            h('span', { class: 'dlb-vacant__en' }, 'Empty'))
          : [
            h('div', { class: 'dlb-slot__hour' }, st.big),
            h('div', { class: 'dlb-slot__hourth', attrs: { lang: 'th' } }, st.th, h('span', { style: 'opacity:.6;font-family:var(--f-title);font-style:italic;margin-left:.6em' }, st.en)),
            h('div', { class: 'dlb-slot__meta' },
              h('div', { class: 'm' },
                h('span', { attrs: { lang: 'th' } }, (d.loops || 0) > 0 ? `วนกลับ ${d.loops} รอบ` : 'คืนแรก'),
                h('span', { class: 'en' }, (d.loops || 0) > 0 ? `${d.loops} loop${d.loops > 1 ? 's' : ''}` : 'first night')),
              h('div', { class: 'm' },
                h('span', { attrs: { lang: 'th' } }, 'ตอนจบ'),
                h('span', { class: 'dlb-slot__dots', attrs: { 'aria-label': `${(d.endingsSeen || []).length} of 4 endings` } },
                  ENDING_IDS.map((id) => h('i', { class: (d.endingsSeen || []).includes(id) ? 'on' : '' }))),
                h('span', { class: 'en' }, `${(d.endingsSeen || []).length}/4 endings`)),
              (d.memories || []).length
                ? h('div', { class: 'm' }, h('span', { attrs: { lang: 'th' } }, `ความทรงจำ ${d.memories.length}/7`), h('span', { class: 'en' }, 'memories'))
                : null),
            h('div', { class: 'dlb-slot__date' }, fmtDate(d.updatedAt), d.playTime ? ` · ${fmtPlay(d.playTime)}` : ''),
          ];
        const btn = h('button', {
          class: 'dlb-slot',
          attrs: { 'aria-disabled': disabled ? 'true' : null, 'aria-label': `Slot ${s.slot + 1}${s.empty ? ', empty' : ''}` },
        }, ember(),
        h('div', { class: 'dlb-slot__num', attrs: { 'aria-hidden': 'true' } }, thaiNum(s.slot + 1)),
        h('div', { class: 'dlb-slot__label' }, `slot ${s.slot + 1}${lastUsed === s.slot ? ' · last played' : ''}`),
        body);
        navItem(nav, btn, { activate: () => choose(s) });
        btn.dataset.slot = s.slot;
        slots.push(btn);
        let del = null;
        if (!s.empty) {
          del = h('button', { class: 'dlb-slot__del' }, ember(), h('span', { attrs: { lang: 'th' } }, 'ลบ'), h('span', { class: 'en' }, 'Delete'));
          navItem(nav, del, { activate: () => remove(s) });
          del.dataset.slot = s.slot;
        }
        dels.push(del);
        row.appendChild(h('div', { class: 'dlb-slotcol' }, btn, del || h('div', { style: 'height:38px' })));
      }
      if (ctx) {
        let target = focusDel ? dels[focusIdx] : slots[focusIdx ?? 0];
        if (!target || target.getAttribute('aria-disabled') === 'true') target = slots.find((s) => s.getAttribute('aria-disabled') !== 'true');
        ctx.current = null;
        if (target) nav.focus(target, { silent: true, ctx });
      }
      return lastUsed;
    };

    const choose = async (s) => {
      if (busy) return;
      if (mode === 'load' && s.empty) return;
      if (mode === 'new' && !s.empty) {
        busy = true;
        const st = slotStage(s.data);
        const ok = await ui.confirm({
          th: `เขียนทับช่องที่ ${s.slot + 1}?`, en: `Overwrite slot ${s.slot + 1}?`,
          subTh: `กะเดิม (${st.th} · ${st.big}) จะหายไปตลอดกาล`, subEn: 'The night saved here will be gone for good.',
          yes: { th: 'เขียนทับ', en: 'Overwrite' }, no: { th: 'ยกเลิก', en: 'Cancel' }, danger: true,
        });
        busy = false;
        if (!ok) return;
      }
      finish(s.slot);
    };
    const remove = async (s) => {
      if (busy || s.empty) return;
      busy = true;
      const ok = await ui.confirm({
        th: `ลบช่องที่ ${s.slot + 1}?`, en: `Delete slot ${s.slot + 1}?`,
        subTh: 'ลบแล้วกู้คืนไม่ได้', subEn: 'This cannot be undone.',
        yes: { th: 'ลบ', en: 'Delete' }, no: { th: 'ยกเลิก', en: 'Cancel' }, danger: true,
      });
      busy = false;
      if (!ok) return;
      try {
        saves.delete(s.slot);
      } catch (e) {
        console.warn('[ui] delete slot failed', e);
      }
      render(s.slot, false);
    };

    const idxOf = (el) => (el ? parseInt(el.dataset.slot, 10) : 0);
    const enabled = (el) => el && el.getAttribute('aria-disabled') !== 'true';
    const move = (dir, cur) => {
      const i = idxOf(cur);
      const onDel = cur && cur.classList.contains('dlb-slot__del');
      if (dir === 'down') return onDel ? null : dels[i];
      if (dir === 'up') return onDel ? slots[i] : null;
      const d = dir === 'left' ? -1 : 1;
      for (let n = 1; n <= 3; n++) {
        const j = (i + d * n + 9) % 3;
        const cand = onDel ? dels[j] || slots[j] : slots[j];
        if (enabled(cand)) return cand;
      }
      return null;
    };

    ui.layer.appendChild(this.el);
    const last = render();
    let initial = slots[0];
    if (mode === 'load') initial = slots[last ?? -1] && enabled(slots[last]) ? slots[last] : slots.find(enabled) || slots[0];
    else initial = slots.find((b, i) => saves.list()[i].empty) || slots[0];
    ctx = nav.push({
      root: row, modal: true, layout: 'grid', move, initial, name: 'slots',
      onBack: () => finish(null),
      onDelete: (cur) => {
        const i = idxOf(cur);
        const s = saves.list()[i];
        if (s && !s.empty) remove(s);
      },
    });
    ui._grain(+1, 'slots');
    ui._dimMenu(+1);
    enter(this.el);
  }
}
