// The current objective: one short Thai line at the top-left ("ไหว้ศาลพระภูมิ", "ขับไปรับลูกค้า").
// It cross-fades when the task changes, is struck through and fades out when done. Self-contained
// (its own small stylesheet), mounted in the UI root.
//
//   objective.set({ th, en?, steps?: [{ id, th, en?, done? }] } | 'ข้อความ' | null)   steps = a checklist
//   objective.tick(id) (a step done, any order) · objective.done() · objective.clear() · objective.setBoth(bool)
//   objective.marker({ x, y (px), dist (m), off (bool), angle (rad, for the edge arrow) } | null)
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
.dlb-obj__list { list-style: none; margin: 0.35em 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.18em; }
.dlb-obj__step { display: flex; align-items: center; gap: 0.5em; font-size: clamp(15px, 0.8vw + 9px, 21px); opacity: 0.92; transition: opacity 0.5s; }
.dlb-obj__box { flex: none; width: 0.82em; height: 0.82em; border: 2px solid rgba(239,229,207,0.85); border-radius: 3px; position: relative; box-shadow: 0 0 6px rgba(0,0,0,0.8); }
.dlb-obj__step.is-done { opacity: 0.55; }
.dlb-obj__step.is-done .dlb-obj__box { border-color: #8fbf76; background: rgba(127,168,106,0.25); }
.dlb-obj__step.is-done .dlb-obj__box::after { content: ''; position: absolute; left: 22%; top: 2%; width: 30%; height: 62%; border: solid #b8e09c; border-width: 0 3px 3px 0; transform: rotate(40deg); }
.dlb-obj__step.is-done .dlb-obj__st { text-decoration: line-through; text-decoration-thickness: 2px; }
.dlb-obj__step.is-next .dlb-obj__st { color: #ffe3a6; }
.dlb-objm { position: absolute; z-index: 23; pointer-events: none; left: 0; top: 0; opacity: 0; transition: opacity 0.35s; font-family: ${FONTS.body};
  color: #ffe3a6; text-shadow: 0 1px 2px #000, 0 0 10px rgba(0,0,0,0.8); font-size: clamp(13px, 0.5vw + 10px, 17px); display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dlb-objm.is-on { opacity: 0.95; }
.dlb-objm__pin { width: 12px; height: 12px; border: 2px solid #ffe3a6; transform: rotate(45deg); box-shadow: 0 0 8px rgba(255,200,120,0.6); }
.dlb-objm.is-off .dlb-objm__pin { width: 0; height: 0; border: none; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 16px solid #ffe3a6; transform: rotate(var(--a, 0rad)); box-shadow: none; filter: drop-shadow(0 0 4px rgba(0,0,0,0.9)); }
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
