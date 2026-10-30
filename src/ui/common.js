// Shared building blocks: title lockup, menu items, grain texture, screen shells.
import { h } from './dom.js';
import { navItem } from './nav.js';
import * as NARRATIVE from '../game/data/index.js';

/** Title lockup text. The Thai title follows the narrative data (GAME_TITLE.th) when present. */
export const TITLE = { l1: 'HAUNTED', l2: 'to the last stop', th: NARRATIVE.GAME_TITLE?.th || 'หลอนยันปลายทาง' };

/** The game title lockup. opts { presents=false, align:'left'|'center' } */
export function titleLockup({ presents = false, align = 'left' } = {}) {
  return h('div', { class: `dlb-title is-${align}` },
    presents ? h('div', { class: 'dlb-title__presents' }, h('b', null, 'Pukking Dragon'), 'presents') : null,
    h('h1', { attrs: { 'aria-label': TITLE.th } },
      h('span', { class: 'dlb-title__l1' }, TITLE.l1, h('span', { class: 'dlb-title__l1 dlb-title__echo', attrs: { 'aria-hidden': 'true' } }, TITLE.l1)),
      h('span', { class: 'dlb-title__l2' }, TITLE.l2)),
    h('div', { class: 'dlb-title__th', attrs: { lang: 'th' } }, TITLE.th));
}

export const ember = () => h('span', { class: 'dlb-ember', attrs: { 'aria-hidden': 'true' } });

/** Menu entry: EN small caps + TH. spec { en, th, onSelect, disabled, danger } */
export function menuItem(nav, { en, th, onSelect, disabled = false, danger = false, cls = '' }) {
  const el = h('button', { class: `dlb-item ${danger ? 'is-danger' : ''} ${cls}`, attrs: { 'aria-disabled': disabled ? 'true' : null } },
    ember(),
    h('span', { class: 'en', attrs: { lang: 'en' } }, en),
    th ? h('span', { class: 'th', attrs: { lang: 'th' } }, th) : null);
  navItem(nav, el, { kind: 'button', activate: () => onSelect?.() });
  return el;
}

let _grainUrl = null;
/** Film grain tile as a data URL (generated once). */
export function grainUrl() {
  if (_grainUrl) return _grainUrl;
  const s = 192;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const d = img.data;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < d.length; i += 4) {
    const v = rnd();
    const lum = v > 0.5 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = lum;
    // sparse, soft grain: most pixels nearly transparent
    const a = Math.pow(Math.abs(v - 0.5) * 2, 2.2);
    d[i + 3] = Math.round(a * 200);
  }
  g.putImageData(img, 0, 0);
  try {
    _grainUrl = c.toDataURL('image/png');
  } catch (e) {
    _grainUrl = '';
  }
  return _grainUrl;
}

/** A full-screen section (initially hidden). */
export function screen(cls, ...children) {
  const el = h('section', { class: `dlb-screen ${cls}` }, ...children);
  el.hidden = true;
  return el;
}
