// Tiny DOM helpers for the overlay UI (no framework).

/**
 * h('div', {class:'a b', on:{click:fn}, attrs:{role:'x'}, style:{...}, dataset:{...}, html:'<b/>'}, ...children)
 * Children may be strings, nodes, arrays, null/false (skipped).
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k === 'attrs') for (const a in v) { if (v[a] != null && v[a] !== false) el.setAttribute(a, v[a] === true ? '' : v[a]); }
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }
      } else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else el[k] = v;
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
/** Two frames: guarantees styles were applied before a transition class is added. */
export const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Bilingual pair. Thai first (primary), English second. */
export function bi(th, en, cls = '') {
  return h('span', { class: `dlb-bi ${cls}` },
    th ? h('span', { class: 'th', attrs: { lang: 'th' } }, th) : null,
    en ? h('span', { class: 'en', attrs: { lang: 'en' } }, en) : null);
}

/** Make an element visible and run its enter transition (adds `is-in`). */
export async function enter(el, cls = 'is-in') {
  el.hidden = false;
  el.classList.remove('is-leaving');
  // force style flush so the transition runs from the initial state
  void el.offsetWidth;
  await nextFrame();
  el.classList.add(cls);
}

/** Run the leave transition then hide (or remove) the element. */
export async function leave(el, ms = 900, { remove = false, cls = 'is-in' } = {}) {
  if (!el) return;
  el.classList.add('is-leaving');
  el.classList.remove(cls);
  await sleep(ms);
  if (el.classList.contains(cls)) return; // re-entered meanwhile
  if (remove) el.remove();
  else el.hidden = true;
  el.classList.remove('is-leaving');
}

/** Clock helpers. hour may be 21..30 (30 = 06:00 next morning) or fractional. */
export function clockString(hour) {
  let hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour - Math.floor(hour)) * 60 + 1e-6);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Colloquial Thai time-of-day for an hour (6-hour clock: ทุ่ม / ตี / โมง). */
export function thaiHour(hour) {
  const hh = ((Math.floor(hour) % 24) + 24) % 24;
  if (hh === 0) return 'เที่ยงคืน';
  if (hh >= 1 && hh <= 5) return `ตี ${hh}`;
  if (hh === 6) return '6 โมงเช้า';
  if (hh >= 7 && hh <= 11) return `${hh} โมงเช้า`;
  if (hh === 12) return 'เที่ยงวัน';
  if (hh >= 13 && hh <= 15) return `บ่าย ${hh - 12} โมง`;
  if (hh >= 16 && hh <= 18) return `${hh - 12} โมงเย็น`;
  return `${hh - 18} ทุ่ม`; // 19..23
}

/** Parse 'HH:MM' -> hour number (keeps 21..30 range for the night). */
export function parseClock(str) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(str || ''));
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 12) hh += 24;
  return hh + mm / 60;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
