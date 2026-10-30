// Ending: title card, the ending text, then the full credits roll.
// Resolves when the roll finishes or the player skips (press twice).
import { h, sleep, enter } from './dom.js';
import { screen } from './common.js';
import { buildCredits, Roll } from './Credits.js';
import { keyHints } from './glyphs.js';
import * as NARRATIVE from '../game/data/index.js';

const ENDING_NAMES = {
  dawn: { th: 'รุ่งสาง', en: 'Dawn' },
  endless: { th: 'กะดึกนิรันดร์', en: 'The Endless Shift' },
  forgive: { th: 'ขอโทษครับพ่อ', en: 'Forgiveness' },
  wrong_home: { th: 'บ้าน', en: 'Home' },
};

export class Ending {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
  }

  /** e {id, titleTH, titleEN, th, en, credits?: bool (default true), keepBlack?: bool} -> Promise */
  show(e = {}) {
    const ui = this.ui;
    return new Promise((resolve) => {
      const data = NARRATIVE.ENDINGS?.[e.id] || {};
      const names = { th: data.titleTH || ENDING_NAMES[e.id]?.th, en: data.titleEN || ENDING_NAMES[e.id]?.en };
      // text cards: explicit e.th/e.en, else the ending's epilogue from the narrative data
      const cards = e.th || e.en ? [{ th: e.th, en: e.en }] : Array.isArray(data.epilogue) ? data.epilogue : [];
      const subTh = e.subtitleTH ?? data.subtitleTH;
      const subEn = e.subtitleEN ?? data.subtitleEN;
      let skipped = false;
      let skipArm = false;
      let skipWake = null;
      const skipP = new Promise((r) => (skipWake = r));
      const sp = Math.max(0.1, Number(e._speed) || 1); // debug/test time multiplier
      const wait = (ms) => Promise.race([sleep(ms / sp), skipP]);

      const stage1 = h('div', { class: 'dlb-ending__stage' },
        h('div', { class: 'dlb-ending__cap' }, h('span', { class: 'th', attrs: { lang: 'th' } }, subTh || 'ตอนจบ'), subEn || 'Ending'),
        h('div', { class: 'dlb-ending__name-th', attrs: { lang: 'th' } }, e.titleTH || names.th || ''),
        h('div', { class: 'dlb-ending__name-en' }, e.titleEN || names.en || ''));
      const stages = cards.map((c) => h('div', { class: 'dlb-ending__stage' },
        c.th ? h('div', { class: 'dlb-ending__text-th', attrs: { lang: 'th' } }, c.th) : null,
        c.en ? h('div', { class: 'dlb-ending__text-en' }, c.en) : null));
      const roll = buildCredits({ full: true, extra: e.creditsExtra || data.creditsExtra || null });
      const view = h('div', { class: 'dlb-roll-view' }, roll);
      const skip = h('div', { class: 'dlb-skip' }, keyHints([{ keys: [{ kb: 'Escape', pad: 'B' }], th: 'กดอีกครั้งเพื่อข้าม', en: 'Press again to skip' }]));
      const el = screen(`dlb-ending end-${e.id || 'none'}`,
        h('div', { class: 'dlb-ending__bg' }), h('div', { class: 'dlb-ending__tint' }),
        stage1, ...stages, view, skip);
      this.el = el;
      ui.layer.appendChild(el);
      ui._grain(+1, 'ending');
      ui._refreshXhair?.();

      let ctx = null;
      let r = null;
      let skipTmr = 0;
      const trySkip = () => {
        if (skipped) return;
        if (!skipArm) {
          skipArm = true;
          skip.classList.add('is-in');
          clearTimeout(skipTmr);
          skipTmr = setTimeout(() => {
            skipArm = false;
            skip.classList.remove('is-in');
          }, 3200);
          return;
        }
        skipped = true;
        skipWake();
      };
      ctx = ui.nav.push({
        root: el, modal: true, name: 'ending', items: () => [],
        onBack: trySkip,
        onStart: trySkip,
        onAction: (a, cur, { repeat }) => {
          if (a === 'select') {
            trySkip();
            return true;
          }
          if ((a === 'up' || a === 'down') && r) {
            r.nudge((a === 'up' ? -1 : 1) * (repeat ? 50 : 70));
            return true;
          }
          return a !== 'back';
        },
      });

      const run = async () => {
        await enter(el);
        await wait(1600);
        if (!skipped) {
          stage1.classList.add('is-in');
          await wait(5200);
          stage1.classList.remove('is-in');
          await wait(2000);
        }
        for (let i = 0; i < stages.length && !skipped; i++) {
          const st = stages[i];
          const c = cards[i];
          st.classList.add('is-in');
          const len = (c.th || '').length * 0.06 + (c.en || '').split(/\s+/).length * 0.28;
          await wait(Math.max(5, Math.min(16, 2.5 + len)) * 1000);
          st.classList.remove('is-in');
          await wait(2000);
        }
        if (e.credits !== false && !skipped) {
          view.classList.add('is-in');
          await new Promise((res) => {
            r = new Roll(view, roll, { speed: 38 * sp, startDelay: 1.2 / sp, onEnd: () => setTimeout(res, 3500 / sp) });
            r.start();
            skipP.then(res);
          });
          r.stop();
        }
        // out
        clearTimeout(skipTmr);
        ui.nav.remove(ctx);
        for (const s of [stage1, ...stages]) s.classList.remove('is-in');
        view.classList.remove('is-in');
        skip.classList.remove('is-in');
        await sleep(1400);
        ui._grain(-1, 'ending');
        resolve();
        if (!e.keepBlack) {
          await sleep(450);
          el.style.transition = 'opacity 1.8s cubic-bezier(.65,0,.35,1)';
          el.classList.remove('is-in');
          await sleep(1900);
          el.remove();
          if (this.el === el) this.el = null;
          ui._refreshXhair?.();
        }
      };
      run();
    });
  }

  release(secs = 1.8) {
    const el = this.el;
    if (!el) return;
    el.style.transition = `opacity ${secs}s cubic-bezier(.65,0,.35,1)`;
    el.classList.remove('is-in');
    setTimeout(() => {
      el.remove();
      if (this.el === el) this.el = null;
      this.ui._refreshXhair?.();
    }, secs * 1000 + 100);
  }
}
