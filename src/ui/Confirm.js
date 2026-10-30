// Centered yes/no confirmation (overwrite slot, delete slot, quit, reset settings).
import { h, enter, leave } from './dom.js';
import { screen, menuItem } from './common.js';

/** opts { th, en, subTh?, subEn?, yes:{th,en}, no:{th,en}, danger } -> Promise<boolean> */
export function confirmDialog(ui, opts) {
  return new Promise((resolve) => {
    const nav = ui.nav;
    let done = false;
    let ctx = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      nav.remove(ctx);
      leave(el, 600, { remove: true });
      resolve(v);
    };
    const no = menuItem(nav, { en: opts.no?.en || 'Cancel', th: opts.no?.th || 'ยกเลิก', onSelect: () => finish(false) });
    const yes = menuItem(nav, { en: opts.yes?.en || 'Confirm', th: opts.yes?.th || 'ตกลง', danger: !!opts.danger, onSelect: () => finish(true) });
    const row = h('div', { class: 'dlb-confirm__opts' }, no, yes);
    const el = screen('dlb-confirm',
      h('div', { class: 'dlb-backdrop' }),
      h('div', { class: 'dlb-confirm__box', attrs: { role: 'alertdialog' } },
        h('div', { class: 'dlb-confirm__th', attrs: { lang: 'th' } }, opts.th),
        opts.en ? h('div', { class: 'dlb-confirm__en' }, opts.en) : null,
        opts.subTh ? h('div', { class: 'dlb-confirm__en', style: 'font-size:14px;opacity:.8;margin-top:1.4em;font-style:normal;font-family:var(--f-body)' }, opts.subTh) : null,
        opts.subEn ? h('div', { class: 'dlb-confirm__en', style: 'font-size:14px;opacity:.7;margin-top:.2em' }, opts.subEn) : null,
        row));
    ui.layer.appendChild(el);
    ctx = nav.push({ root: row, modal: true, layout: 'horizontal', initial: no, onBack: () => finish(false), name: 'confirm' });
    enter(el);
  });
}
