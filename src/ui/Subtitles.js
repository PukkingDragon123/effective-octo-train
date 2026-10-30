// Subtitles: bottom-centre, no box, soft shadow. Speaker (small caps) + Thai + English
// according to settings.subtitles; tones whisper / ghost / shout / thought.
import { settings } from '../core/Settings.js';
import { h } from './dom.js';

/** Reading time for a line (s). */
export function autoDuration(line) {
  const th = (line.th || '').replace(/\s+/g, '').length;
  const en = (line.en || '').split(/\s+/).filter(Boolean).length;
  return Math.min(9, Math.max(2.2, 1.0 + Math.max(th * 0.085, en * 0.36)));
}

export class Subtitles {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div', { class: 'dlb-subs', attrs: { 'aria-live': 'polite', role: 'log' } });
    ui.layer.appendChild(this.el);
    this.current = null;
    this.queue = [];
    this._timer = 0;
  }

  /** Build the DOM for a line according to the current settings (null when subtitles are off). */
  render(line) {
    const mode = settings.get('subtitles') || 'both';
    if (mode === 'off') return null;
    const showTh = (mode === 'th' || mode === 'both') && line.th;
    const showEn = (mode === 'en' || mode === 'both') && line.en;
    // fall back to the other language rather than showing nothing
    const th = showTh ? line.th : !showEn && line.th ? line.th : null;
    const en = showEn ? line.en : !showTh && !th && line.en ? line.en : null;
    if (!th && !en) return null;
    const tone = line.tone || 'normal';
    let who = null;
    const sTh = line.speakerTH || line.speakerTh;
    const sEn = line.speakerEN || line.speakerEn;
    if ((sTh || sEn) && tone !== 'thought') {
      who = h('span', { class: 'dlb-sub__who' },
        sTh && mode !== 'en' ? h('span', { class: 'th', attrs: { lang: 'th' } }, sTh) : null,
        sEn && mode !== 'th' ? h('span', { class: 'en' }, sEn) : null);
      if (mode === 'en' && !sEn && sTh) who.appendChild(h('span', { class: 'th' }, sTh));
      if (mode === 'th' && !sTh && sEn) who.appendChild(h('span', { class: 'en' }, sEn));
    }
    return h('div', { class: `dlb-sub tone-${tone}${!th ? ' only-en' : ''}` },
      who,
      th ? h('span', { class: 'dlb-sub__th', attrs: { lang: 'th' } }, th) : null,
      en ? h('span', { class: 'dlb-sub__en', attrs: { lang: 'en' } }, en) : null);
  }

  /** line {speakerTH, speakerEN, th, en, duration, tone, queue?:bool} */
  show(line) {
    if (!line) return this.clear();
    if (line.queue && this.current) {
      this.queue.push(line);
      return;
    }
    this.queue.length = 0;
    this._present(line);
  }

  _present(line) {
    clearTimeout(this._timer);
    this._fadeOut(this.current);
    this.current = null;
    const el = this.render(line);
    const dur = line.duration != null ? Number(line.duration) : autoDuration(line);
    if (el) {
      this.el.appendChild(el);
      void el.offsetWidth;
      requestAnimationFrame(() => el.classList.add('is-in'));
      this.current = el;
    }
    if (dur > 0 && Number.isFinite(dur)) {
      this._timer = setTimeout(() => this._next(), dur * 1000);
    }
    this.ui.bus?.emit?.('ui:subtitle', { line, shown: !!el });
  }

  _next() {
    const n = this.queue.shift();
    if (n) this._present(n);
    else {
      this._fadeOut(this.current);
      this.current = null;
    }
  }

  _fadeOut(el) {
    if (!el) return;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 600);
  }

  clear() {
    clearTimeout(this._timer);
    this.queue.length = 0;
    this._fadeOut(this.current);
    this.current = null;
  }

  applySettings() {
    const s = Number(settings.get('subtitleSize')) || 1;
    this.ui.root?.style.setProperty('--sub-scale', String(Math.max(0.6, Math.min(2, s))));
    if ((settings.get('subtitles') || 'both') === 'off') {
      this._fadeOut(this.current);
      this.current = null;
    }
  }
}
