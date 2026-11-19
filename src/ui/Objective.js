// The current objective: one short Thai line at the top-left ("ไหว้ศาลพระภูมิ", "ขับไปรับลูกค้า").
// It cross-fades when the task changes, is struck through and fades out when done. Self-contained
// (its own small stylesheet), mounted in the UI root.
//
//   objective.set({ th, en?, steps?: [{ id, th, en?, done? }] } | 'ข้อความ' | null)   steps = a checklist
//   objective.tick(id) (a step done, any order) · objective.done() · objective.clear() · objective.setBoth(bool)
//   objective.marker({ x, y (px), dist (m), off (bool), angle (rad, for the edge arrow) } | null)
import { FONTS } from './fonts.js';

const CSS = `
.dlb-obj { position: absolute; top: max(28px, calc(env(safe-area-inset-top) + 24px)); left: max(32px, calc(env(safe-area-inset-left) + 28px));
  max-width: min(46vw, 560px); z-index: 24; pointer-events: none; display: flex; align-items: flex-start; gap: 14px;
  font-family: ${FONTS.body}; color: #ebe5d8; opacity: 0; transform: translateY(-6px);
  transition: opacity 0.4s cubic-bezier(.22,.61,.36,1), transform 0.4s cubic-bezier(.22,.61,.36,1);
  text-shadow: 0 1px 0 rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9), 0 2px 10px rgba(0,0,0,0.55); }
.dlb-obj::before { content: ''; position: absolute; left: -16px; top: -12px; right: -40px; bottom: -14px; z-index: -1;
  background: radial-gradient(closest-side, rgba(0,0,0,0.45), rgba(0,0,0,0)); }
.dlb-obj.is-on { opacity: 1; transform: none; }
.dlb-obj__mark { flex: none; width: 10px; height: 10px; margin-top: 0.62em; border: 1.5px solid #d0402e; transform: rotate(45deg); }
.dlb-obj__text { display: flex; flex-direction: column; line-height: 1.5; }
.dlb-obj__th { font-weight: 600; font-size: clamp(18px, 0.9vw + 10px, 26px); letter-spacing: 0;
  background: linear-gradient(currentColor, currentColor) no-repeat 0 60% / 0% 1.5px; transition: background-size 0.5s ease; }
.dlb-obj__en { font-size: clamp(12px, 0.4vw + 9px, 14px); opacity: 0.6; margin-top: 0; text-transform: uppercase; letter-spacing: 0.2em; font-family: ${FONTS.title}; }
.dlb-obj.is-done .dlb-obj__th { background-size: 100% 1.5px; }
.dlb-obj.is-done .dlb-obj__mark { background: #d0402e; }
.dlb-obj__list { list-style: none; margin: 0.4em 0 0; padding: 0.35em 0 0; display: flex; flex-direction: column; gap: 0.15em; border-top: 1px solid rgba(235,229,216,0.16); }
.dlb-obj__step { display: flex; align-items: center; gap: 0.6em; font-weight: 500; font-size: clamp(15px, 0.6vw + 9px, 20px); opacity: 0.88; transition: opacity 0.4s; }
.dlb-obj__box { flex: none; width: 0.78em; height: 0.78em; border: 1.5px solid rgba(235,229,216,0.8); border-radius: 2px; position: relative; }
.dlb-obj__step.is-done { opacity: 0.5; }
.dlb-obj__step.is-done .dlb-obj__box { border-color: #d0402e; background: rgba(208,64,46,0.18); }
.dlb-obj__step.is-done .dlb-obj__box::after { content: ''; position: absolute; left: 24%; top: 4%; width: 28%; height: 58%; border: solid #f0c8bc; border-width: 0 2px 2px 0; transform: rotate(40deg); }
.dlb-obj__step.is-done .dlb-obj__st { text-decoration: line-through; text-decoration-thickness: 1.5px; }
.dlb-obj__step.is-next .dlb-obj__st { color: #f7f3eb; }
.dlb-obj__step.is-next .dlb-obj__box { border-color: #f7f3eb; }
.dlb-objm { position: absolute; z-index: 23; pointer-events: none; left: 0; top: 0; opacity: 0; transition: opacity 0.3s; font-family: ${FONTS.body}; font-weight: 600;
  color: #f7f3eb; text-shadow: 0 1px 0 #000, 0 0 3px rgba(0,0,0,0.9); font-size: clamp(13px, 0.4vw + 10px, 16px); display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dlb-objm.is-on { opacity: 0.95; }
.dlb-objm__pin { width: 12px; height: 12px; border: 1.5px solid #f7f3eb; outline: 1px solid rgba(0,0,0,0.5); transform: rotate(45deg); }
.dlb-objm.is-off .dlb-objm__pin { width: 0; height: 0; border: none; outline: none; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 14px solid #f7f3eb; transform: rotate(var(--a, 0rad)); }
@media (max-width: 560px) { .dlb-obj { max-width: calc(100vw - 120px); } }
`;

class Objective {
  constructor() {
    this.el = null;
    this.cur = null;
    this.both = false;
    this._t = 0;
  }
  _ensure() {
    if (this.el) return true;
    if (typeof document === 'undefined') return false;
    if (!document.getElementById('dlb-obj-css')) {
      const st = document.createElement('style');
      st.id = 'dlb-obj-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.getElementById('ui') || document.body;
    const el = document.createElement('div');
    el.className = 'dlb-obj';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="dlb-obj__mark"></span><span class="dlb-obj__text"><span class="dlb-obj__th" lang="th"></span><span class="dlb-obj__en" lang="en"></span><ul class="dlb-obj__list"></ul></span>';
    root.appendChild(el);
    this.el = el;
    const m = document.createElement('div');
    m.className = 'dlb-objm';
    m.innerHTML = '<span class="dlb-objm__pin"></span><span class="dlb-objm__d"></span>';
    root.appendChild(m);
    this.mk = m;
    return true;
  }
  setBoth(b) {
    this.both = !!b;
  }
  /** Show an objective (cross-fades from the previous one). */
  set(o) {
    if (!o) return this.clear();
    const th = typeof o === 'string' ? o : o.th;
    const en = typeof o === 'string' ? '' : o.en || '';
    const steps = typeof o === 'string' ? null : o.steps || null;
    if (!th || !this._ensure()) return;
    const key = th + '|' + (steps ? steps.map((x) => x.id).join(',') : '');
    if (key === this.key && !this.el.classList.contains('is-done')) {
      if (steps) for (const x of steps) if (x.done) this.tick(x.id);
      return;
    }
    this.key = key;
    this.cur = th;
    clearTimeout(this._t);
    const show = () => {
      this.el.classList.remove('is-done');
      this.el.querySelector('.dlb-obj__th').textContent = th;
      const e = this.el.querySelector('.dlb-obj__en');
      e.textContent = this.both ? en : '';
      e.hidden = !this.both || !en;
      const ul = this.el.querySelector('.dlb-obj__list');
      ul.textContent = '';
      ul.hidden = !steps;
      for (const x of steps || []) {
        const li = document.createElement('li');
        li.className = 'dlb-obj__step' + (x.done ? ' is-done' : '');
        li.dataset.id = x.id;
        li.innerHTML = '<span class="dlb-obj__box"></span><span class="dlb-obj__st" lang="th"></span>';
        li.querySelector('.dlb-obj__st').textContent = x.th + (this.both && x.en ? ` · ${x.en}` : '');
        ul.appendChild(li);
      }
      this._next();
      void this.el.offsetWidth;
      this.el.classList.add('is-on');
    };
    if (this.el.classList.contains('is-on')) {
      this.el.classList.remove('is-on');
      this._t = setTimeout(show, 420);
    } else show();
  }
  /** One checklist step done (any order). */
  tick(id) {
    const li = this.el?.querySelector(`.dlb-obj__step[data-id="${id}"]`);
    if (!li || li.classList.contains('is-done')) return;
    li.classList.add('is-done');
    this._next();
  }
  _next() {
    const lis = [...(this.el?.querySelectorAll('.dlb-obj__step') || [])];
    lis.forEach((l) => l.classList.remove('is-next'));
    lis.find((l) => !l.classList.contains('is-done'))?.classList.add('is-next');
  }
  /** The marker toward the current target (screen px), or null to hide it. */
  marker(m) {
    if (!this._ensure()) return;
    const el = this.mk;
    if (!m || !this.cur) {
      el.classList.remove('is-on');
      return;
    }
    el.classList.add('is-on');
    el.classList.toggle('is-off', !!m.off);
    el.style.transform = `translate(${Math.round(m.x)}px, ${Math.round(m.y)}px) translate(-50%, -50%)`;
    el.style.setProperty('--a', `${m.angle || 0}rad`);
    const d = el.querySelector('.dlb-objm__d');
    const txt = m.dist >= 1 ? `${Math.round(m.dist)} ม.` : '';
    if (d.textContent !== txt) d.textContent = txt;
  }
  /** The current one is done: struck through, then gone. */
  done() {
    if (!this.el || !this.cur) return;
    this.cur = null;
    this.key = null;
    this.mk?.classList.remove('is-on');
    this.el.classList.add('is-done');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.el.classList.remove('is-on'), 1300);
  }
  clear() {
    this.cur = null;
    this.key = null;
    this.mk?.classList.remove('is-on');
    clearTimeout(this._t);
    this.el?.classList.remove('is-on');
  }
}

export const objective = new Objective();
