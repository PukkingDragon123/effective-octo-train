// The current objective: one short Thai line at the top-left ("ไหว้ศาลพระภูมิ", "ขับไปรับลูกค้า").
// It cross-fades when the task changes, is struck through and fades out when done. Self-contained
// (its own small stylesheet), mounted in the UI root.
//
//   objective.set({ th, en? } | 'ข้อความ' | null) · objective.done() · objective.clear() · objective.setBoth(bool)
import { FONTS } from './fonts.js';

const CSS = `
.dlb-obj { position: absolute; top: max(16px, env(safe-area-inset-top)); left: max(16px, env(safe-area-inset-left));
  max-width: min(46vw, 520px); z-index: 24; pointer-events: none; display: flex; align-items: flex-start; gap: 0.55em;
  font-family: ${FONTS.body}; color: #efe5cf; opacity: 0; transform: translateY(-6px);
  transition: opacity 0.5s cubic-bezier(.65,0,.35,1), transform 0.5s cubic-bezier(.65,0,.35,1);
  text-shadow: 0 1px 2px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.7); }
.dlb-obj.is-on { opacity: 0.94; transform: none; }
.dlb-obj__mark { flex: none; width: 3px; height: 1.25em; margin-top: 0.18em; border-radius: 2px;
  background: linear-gradient(#e2b25a, #9a6a2a); box-shadow: 0 0 8px rgba(226,178,90,0.55); }
.dlb-obj__text { display: flex; flex-direction: column; line-height: 1.25; }
.dlb-obj__th { font-size: clamp(18px, 1.15vw + 11px, 27px); letter-spacing: 0.01em;
  background: linear-gradient(currentColor, currentColor) no-repeat 0 58% / 0% 2px; transition: background-size 0.6s ease; }
.dlb-obj__en { font-size: clamp(12px, 0.5vw + 9px, 15px); opacity: 0.7; margin-top: 0.1em; }
.dlb-obj.is-done .dlb-obj__th { background-size: 100% 2px; }
.dlb-obj.is-done .dlb-obj__mark { background: #7fa86a; box-shadow: 0 0 8px rgba(127,168,106,0.6); }
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
    el.innerHTML = '<span class="dlb-obj__mark"></span><span class="dlb-obj__text"><span class="dlb-obj__th" lang="th"></span><span class="dlb-obj__en" lang="en"></span></span>';
    root.appendChild(el);
    this.el = el;
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
    if (!th || !this._ensure()) return;
    if (th === this.cur && !this.el.classList.contains('is-done')) return;
    this.cur = th;
    clearTimeout(this._t);
    const show = () => {
      this.el.classList.remove('is-done');
      this.el.querySelector('.dlb-obj__th').textContent = th;
      const e = this.el.querySelector('.dlb-obj__en');
      e.textContent = this.both ? en : '';
      e.hidden = !this.both || !en;
      void this.el.offsetWidth;
      this.el.classList.add('is-on');
    };
    if (this.el.classList.contains('is-on')) {
      this.el.classList.remove('is-on');
      this._t = setTimeout(show, 420);
    } else show();
  }
  /** The current one is done: struck through, then gone. */
  done() {
    if (!this.el || !this.cur) return;
    this.cur = null;
    this.el.classList.add('is-done');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.el.classList.remove('is-on'), 1300);
  }
  clear() {
    this.cur = null;
    clearTimeout(this._t);
    this.el?.classList.remove('is-on');
  }
}

export const objective = new Objective();
