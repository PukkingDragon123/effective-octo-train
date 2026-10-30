// Dialogue choice: 2–3 options, keyboard (←/→, 1–3, Enter), gamepad (d-pad + A), mouse,
// optional timeout ring. Non-modal by default: gameplay keeps running (WASD still drive).
import { h, sleep } from './dom.js';
import { ember } from './common.js';
import { navItem } from './nav.js';

export class Choice {
  constructor(ui) {
    this.ui = ui;
    this.active = null;
  }

  /** c {options:[{key, th, en}], timeout?: s, defaultKey?, th?, en? (question), modal?: bool} -> Promise<key> */
  show(c) {
    if (this.active) this.active.cancel();
    const ui = this.ui;
    const nav = ui.nav;
    const options = (c.options || []).slice(0, 4);
    const fallback = c.defaultKey ?? options[0]?.key;
    return new Promise((resolve) => {
      let done = false;
      let ctx = null;
      let tmr = 0;
      let lowTmr = 0;
      const finish = async (key, chosenEl) => {
        if (done) return;
        done = true;
        clearTimeout(tmr);
        clearTimeout(lowTmr);
        nav.remove(ctx);
        if (chosenEl) {
          chosenEl.classList.add('is-chosen');
          nav.sound('select');
          await sleep(420);
        }
        el.classList.remove('is-in');
        setTimeout(() => el.remove(), 700);
        if (this.active === handle) this.active = null;
        resolve(key);
      };
      const btns = options.map((o, i) => {
        const b = h('button', { class: 'dlb-choice__opt' }, ember(),
          h('span', { class: 'k' }, String(i + 1)),
          o.th ? h('span', { class: 'th', attrs: { lang: 'th' } }, o.th) : null,
          o.en ? h('span', { class: 'en' }, o.en) : null);
        navItem(nav, b, { kind: 'choice', activate: () => finish(o.key, b) });
        return b;
      });
      const rowKids = [];
      btns.forEach((b, i) => {
        if (i) rowKids.push(h('span', { class: 'dlb-choice__sep' }));
        rowKids.push(b);
      });
      const row = h('div', { class: 'dlb-choice__row' }, rowKids);
      let timer = null;
      if (c.timeout > 0) {
        const C = 2 * Math.PI * 15;
        timer = h('div', {
          class: 'dlb-choice__timer',
          html: `<svg viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="15"/><circle class="fg" cx="17" cy="17" r="15" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"/></svg>`,
        });
        const fg = timer.querySelector('.fg');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fg.style.transition = `stroke-dashoffset ${c.timeout}s linear`;
          fg.style.strokeDashoffset = C.toFixed(2);
        }));
        lowTmr = setTimeout(() => timer.classList.add('is-low'), c.timeout * 700);
        tmr = setTimeout(() => finish(fallback, null), c.timeout * 1000);
      }
      const el = h('div', { class: 'dlb-choice', attrs: { role: 'dialog' } },
        c.th || c.en ? h('div', { class: 'dlb-choice__q' }, c.th ? h('span', { class: 'th', attrs: { lang: 'th' } }, c.th) : null, c.en ? h('span', { class: 'en' }, c.en) : null) : null,
        row, timer);
      ui.layer.appendChild(el);
      void el.offsetWidth;
      requestAnimationFrame(() => el.classList.add('is-in'));
      const keymap = {
        ArrowLeft: 'left', ArrowRight: 'right', Enter: 'select', NumpadEnter: 'select',
        Digit1: 'digit1', Digit2: 'digit2', Digit3: 'digit3', Digit4: 'digit4',
      };
      const modal = !!c.modal;
      ctx = nav.push({
        root: row, modal, layout: 'horizontal', wrap: false, name: 'choice',
        items: () => btns,
        initial: Math.max(0, options.findIndex((o) => o.key === (c.focusKey ?? c.defaultKey))),
        keymap: modal ? null : keymap,
        padmap: modal ? null : { left: 'left', right: 'right', select: 'select' },
        consumeActions: ['interact', 'confirm', 'indicatorLeft', 'indicatorRight', 'skip'],
        onDigit: (n) => {
          const b = btns[n - 1];
          if (b) finish(options[n - 1].key, b);
        },
      });
      const handle = { cancel: () => finish(fallback, null) };
      this.active = handle;
    });
  }
}
