// Key / button glyphs (keyboard + gamepad, switched by the root's data-device attr)
// and the tiny line icons used by the interaction prompt.
import { KEY_BINDINGS } from '../core/Input.js';
import { h } from './dom.js';

// ---------------------------------------------------------------- keyboard ----
const KEY_LABEL = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt',
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Backspace: '⌫', Tab: 'Tab',
  Backquote: '`', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn',
  WheelUp: 'wheel', WheelDown: 'wheel',
};

const MOUSE_SVG = (btn) => {
  // tiny mouse outline with the pressed button filled (0 left, 2 right, 'wheel')
  const l = btn === 0 ? '<path d="M8 3.2v5.3H3.6V7A3.9 3.9 0 0 1 8 3.2z" fill="currentColor" stroke="none" opacity=".85"/>' : '';
  const r = btn === 2 ? '<path d="M8 3.2v5.3h4.4V7A3.9 3.9 0 0 0 8 3.2z" fill="currentColor" stroke="none" opacity=".85"/>' : '';
  const w = btn === 'wheel' ? '<rect x="7.1" y="4.6" width="1.8" height="3" rx=".9" fill="currentColor" stroke="none"/>' : '';
  return `<svg viewBox="0 0 16 16" class="dlb-mouse" aria-hidden="true"><rect x="3.6" y="3.2" width="8.8" height="11.2" rx="4.4" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3.6 8.5h8.8M8 3.2v5.3" stroke="currentColor" stroke-width=".8" fill="none" opacity=".6"/>${l}${r}${w}</svg>`;
};

function normalizeCode(token) {
  if (!token) return null;
  const t = String(token);
  if (KEY_LABEL[t] || /^(Key|Digit|Mouse|Numpad|F\d)/.test(t)) return t;
  if (/^[A-Za-z]$/.test(t)) return 'Key' + t.toUpperCase();
  if (/^[0-9]$/.test(t)) return 'Digit' + t;
  const alias = {
    esc: 'Escape', escape: 'Escape', enter: 'Enter', return: 'Enter', space: 'Space', spacebar: 'Space',
    shift: 'ShiftLeft', tab: 'Tab', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    lmb: 'Mouse0', rmb: 'Mouse2', click: 'Mouse0', mouse: 'Mouse0', wheel: 'WheelUp', backspace: 'Backspace',
    '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight', '`': 'Backquote',
  };
  return alias[t.toLowerCase()] || null;
}

function kbCap(code) {
  if (code === 'Mouse0') return h('span', { class: 'dlb-cap is-icon', html: MOUSE_SVG(0) });
  if (code === 'Mouse2') return h('span', { class: 'dlb-cap is-icon', html: MOUSE_SVG(2) });
  if (code === 'WheelUp' || code === 'WheelDown') return h('span', { class: 'dlb-cap is-icon', html: MOUSE_SVG('wheel') });
  let label = KEY_LABEL[code];
  if (!label) label = code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  return h('span', { class: `dlb-cap${label.length > 2 ? ' is-wide' : ''}` }, label);
}

// ----------------------------------------------------------------- gamepad ----
// Mirrors core/Input.js PAD_BUTTONS (not exported there) plus the analog axes.
export const PAD_FOR_ACTION = {
  forward: ['RT'], back: ['LT'], left: ['LS'], right: ['LS'], steer: ['LS'], move: ['LS'], look: ['RS'],
  leanLeft: ['LB'], leanRight: ['RB'], run: [],
  interact: ['A'], handbrake: ['B'], amulet: ['X'], paper: ['Y'], pause: ['Start'], vehicle: ['Back'],
  gearUp: ['DU'], gearDown: ['DD'], indicatorLeft: ['DL'], indicatorRight: ['DR'],
  headlights: ['L3'], horn: ['R3'], skip: ['A'], confirm: ['A'], back_ui: ['B'],
  // UI-only pseudo actions
  navigate: ['DPAD'], select: ['A'], cancel: ['B'], tabs: ['LB', 'RB'], delete: ['X'],
};

function padCap(name) {
  const face = { A: 'is-a', B: 'is-b', X: 'is-x', Y: 'is-y' };
  if (face[name]) return h('span', { class: `dlb-pad is-face ${face[name]}` }, name);
  if (name === 'DPAD' || /^D[UDLR]$/.test(name)) {
    const hi = { DU: 'u', DD: 'd', DL: 'l', DR: 'r' }[name] || '';
    const arm = (d, path) => `<path d="${path}" class="${hi === d ? 'on' : ''}"/>`;
    return h('span', {
      class: 'dlb-pad is-icon',
      html: `<svg viewBox="0 0 16 16" class="dlb-dpad" aria-hidden="true">${arm('u', 'M6 1.5h4v4.2L8 7.6 6 5.7z')}${arm('d', 'M6 14.5h4v-4.2L8 8.4 6 10.3z')}${arm('l', 'M1.5 6v4h4.2L7.6 8 5.7 6z')}${arm('r', 'M14.5 6v4h-4.2L8.4 8l1.9-2z')}</svg>`,
    });
  }
  if (name === 'LS' || name === 'RS' || name === 'L3' || name === 'R3') {
    return h('span', { class: `dlb-pad is-stick${name.endsWith('3') ? ' is-press' : ''}` }, name);
  }
  if (name === 'Start') return h('span', { class: 'dlb-pad is-pill', html: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5h8M4 8h8M4 11h8" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>' });
  if (name === 'Back') return h('span', { class: 'dlb-pad is-pill', html: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="4" width="6" height="5" rx="1" fill="none" stroke="currentColor"/><rect x="7" y="7" width="6" height="5" rx="1" fill="none" stroke="currentColor"/></svg>' });
  return h('span', { class: 'dlb-pad is-pill' }, name);
}

/** Find the first action whose keyboard binding contains code. */
function actionForCode(code) {
  for (const [action, codes] of Object.entries(KEY_BINDINGS)) if (codes.includes(code)) return action;
  return null;
}

/**
 * A glyph that renders both a keyboard and a gamepad version; CSS shows the one
 * matching `[data-device]` on the UI root. token:
 *   - an action name ('interact', 'forward', 'paper', ...) -> its first binding
 *   - a key ('W', 'KeyW', 'Space', 'Esc', 'LMB', '1') -> that key, gamepad = the action it maps to
 *   - { kb:'F', pad:'A' } explicit
 *   - 'pad:A' gamepad-only / 'kb:W' keyboard-only
 */
export function glyph(token, { allKeys = false } = {}) {
  let kbCodes = [];
  let pads = [];
  if (token && typeof token === 'object') {
    kbCodes = [].concat(token.kb || []).map(normalizeCode).filter(Boolean);
    pads = [].concat(token.pad || []);
  } else if (typeof token === 'string' && token.startsWith('pad:')) {
    pads = [token.slice(4)];
  } else if (typeof token === 'string' && token.startsWith('kb:')) {
    kbCodes = [normalizeCode(token.slice(3))].filter(Boolean);
  } else if (KEY_BINDINGS[token] || PAD_FOR_ACTION[token]) {
    const codes = KEY_BINDINGS[token] || [];
    kbCodes = allKeys ? codes.slice() : codes.slice(0, 1);
    pads = PAD_FOR_ACTION[token] || [];
  } else {
    const code = normalizeCode(token);
    if (code) {
      kbCodes = [code];
      const a = actionForCode(code);
      if (a && PAD_FOR_ACTION[a]) pads = PAD_FOR_ACTION[a];
    } else {
      // free text label (e.g. 'Hold')
      return h('span', { class: 'dlb-g' }, h('span', { class: 'dlb-cap is-text' }, String(token)));
    }
  }
  // collapse duplicate shift etc.
  const seen = new Set();
  kbCodes = kbCodes.filter((c) => {
    const l = KEY_LABEL[c] || c;
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
  const kb = h('span', { class: 'g-kb' }, kbCodes.map(kbCap));
  const pad = h('span', { class: 'g-pad' }, pads.length ? pads.map(padCap) : kbCodes.map(kbCap));
  if (!kbCodes.length) kb.append(...pads.map(padCap));
  return h('span', { class: 'dlb-g' }, kb, pad);
}

/** Row of glyphs + label for footers: [{keys:['up','down'] | token, th, en}] */
export function keyHints(list) {
  return h('div', { class: 'dlb-keyhints' }, list.map((k) => h('span', { class: 'dlb-kh' },
    [].concat(k.keys).map((t) => glyph(t)),
    h('span', { class: 'dlb-kh__l' }, h('span', { class: 'th', attrs: { lang: 'th' } }, k.th), h('span', { class: 'en' }, k.en)))));
}

// UI navigation hints used by every menu footer
export const NAV_HINTS = {
  move: { keys: [{ kb: ['ArrowUp', 'ArrowDown'], pad: ['DPAD'] }], th: 'เลือก', en: 'Select' },
  moveH: { keys: [{ kb: ['ArrowLeft', 'ArrowRight'], pad: ['DPAD'] }], th: 'เลือก', en: 'Select' },
  ok: { keys: [{ kb: 'Enter', pad: 'A' }], th: 'ตกลง', en: 'Confirm' },
  back: { keys: [{ kb: 'Escape', pad: 'B' }], th: 'กลับ', en: 'Back' },
  adjust: { keys: [{ kb: ['ArrowLeft', 'ArrowRight'], pad: ['DPAD'] }], th: 'ปรับ', en: 'Adjust' },
  tabs: { keys: [{ kb: ['KeyQ', 'KeyE'], pad: ['LB', 'RB'] }], th: 'หมวด', en: 'Section' },
  del: { keys: [{ kb: 'Delete', pad: 'X' }], th: 'ลบ', en: 'Delete' },
  skip: { keys: [{ kb: 'Escape', pad: 'B' }], th: 'ข้าม', en: 'Skip' },
  scroll: { keys: [{ kb: ['ArrowUp', 'ArrowDown'], pad: ['DPAD'] }], th: 'เลื่อน', en: 'Scroll' },
};

// ------------------------------------------------------------------- icons ----
// 24x24 line icons, stroke = currentColor. Drawn by hand to stay tiny & consistent.
const ICON_PATHS = {
  hand: '<path d="M9 11.5V5.2a1.4 1.4 0 0 1 2.8 0v5.6M11.8 10.2V4.1a1.4 1.4 0 0 1 2.8 0v6.3M14.6 10.6V5.6a1.4 1.4 0 0 1 2.8 0v7.6c0 4.1-2.5 7.1-6.2 7.1-2.4 0-3.9-1.1-5.2-3l-2.6-4.1a1.35 1.35 0 0 1 2.2-1.6L9 14"/>',
  grab: '<path d="M7.2 11V9.4a1.5 1.5 0 0 1 3 0V11M10.2 10.2V8.6a1.5 1.5 0 0 1 3 0v1.8M13.2 10.4V9.2a1.5 1.5 0 0 1 3 0v2.2M16.2 11.2a1.5 1.5 0 0 1 3 0v2.3c0 3.9-2.6 6.8-6.4 6.8h-.6c-3.3 0-5.9-2.5-6.2-5.8L5.6 12a1.4 1.4 0 0 1 1.6-1.6"/>',
  talk: '<path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7.2a1.5 1.5 0 0 1-1.5 1.5h-7.2L8 19.6v-2.9H5a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 5 6.5z"/><path d="M8.5 11.6h.01M12 11.6h.01M15.5 11.6h.01" stroke-width="2.1"/>',
  eye: '<path d="M2.6 12c2.3-3.9 5.5-5.9 9.4-5.9s7.1 2 9.4 5.9c-2.3 3.9-5.5 5.9-9.4 5.9S4.9 15.9 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
  key: '<circle cx="7.8" cy="12" r="3.6"/><path d="M11.4 12h9.1M17.6 12v3.1M20.4 12v2.2"/>',
  pray: '<path d="M12 3.6c-1.4 1.8-2.4 4.4-2.6 7.4l-.2 3.4c-.1 1.4-.8 2.6-2 3.4l-1 .7M12 3.6c1.4 1.8 2.4 4.4 2.6 7.4l.2 3.4c.1 1.4.8 2.6 2 3.4l1 .7M12 3.6v13.6"/><path d="M8.6 20.6c1.1-.8 2.2-1.2 3.4-1.2s2.3.4 3.4 1.2"/>',
  door: '<path d="M6 20.5V4.2a.8.8 0 0 1 .8-.8h10.4a.8.8 0 0 1 .8.8v16.3M4 20.5h16M14.6 12.2h.01" stroke-width="1.6"/>',
  look: '<path d="M2.6 12c2.3-3.9 5.5-5.9 9.4-5.9s7.1 2 9.4 5.9c-2.3 3.9-5.5 5.9-9.4 5.9S4.9 15.9 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
};

export function iconSVG(name, cls = 'dlb-icon') {
  const p = ICON_PATHS[name] || ICON_PATHS.hand;
  return `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// ------------------------------------------------------- controls reference ----
/** Readable action list for the settings panel. Keyboard glyphs come from KEY_BINDINGS. */
export const CONTROL_GROUPS = [
  {
    th: 'การขับรถ', en: 'Driving',
    rows: [
      { a: 'forward', th: 'คันเร่ง / เดินหน้า', en: 'Throttle / walk forward', kb: ['KeyW', 'ArrowUp'], pad: ['RT', 'LS'] },
      { a: 'back', th: 'เบรก / ถอยหลัง', en: 'Brake / reverse / walk back', kb: ['KeyS', 'ArrowDown'], pad: ['LT'] },
      { a: 'steer', th: 'เลี้ยว / เดินซ้าย-ขวา', en: 'Steer / strafe', kb: ['KeyA', 'KeyD'], pad: ['LS'] },
      { a: 'look', th: 'มองรอบ ๆ', en: 'Look around', kb: [], kbText: 'Mouse', pad: ['RS'] },
      { a: 'handbrake', th: 'เบรกมือ', en: 'Handbrake' },
      { a: 'gearUp', th: 'เข้าเกียร์สูงขึ้น', en: 'Gear up', all: true },
      { a: 'gearDown', th: 'ลดเกียร์', en: 'Gear down', all: true },
      { a: 'indicatorLeft', th: 'ไฟเลี้ยวซ้าย', en: 'Left indicator' },
      { a: 'indicatorRight', th: 'ไฟเลี้ยวขวา', en: 'Right indicator' },
      { a: 'horn', th: 'บีบแตร', en: 'Horn' },
      { a: 'headlights', th: 'ไฟหน้า', en: 'Headlights' },
    ],
  },
  {
    th: 'ในห้องโดยสาร', en: 'In the cabin',
    rows: [
      { a: 'interact', th: 'ใช้ / หยิบ / กด', en: 'Use / take / press' },
      { a: 'leanLeft', th: 'เอนตัวซ้าย', en: 'Lean left' },
      { a: 'leanRight', th: 'เอนตัวขวา', en: 'Lean right' },
      { a: 'amulet', th: 'กำพระเครื่อง', en: 'Hold the amulet' },
      { a: 'paper', th: 'หยิบกระดาษกฎ', en: 'Raise the rules paper', all: true },
      { a: 'wipers', th: 'ที่ปัดน้ำฝน', en: 'Wipers' },
      { a: 'radio', th: 'วิทยุ เปิด/ปิด', en: 'Radio on / off' },
      { a: 'radioTune', th: 'เปลี่ยนสถานี', en: 'Tune the radio' },
      { a: 'cabinLight', th: 'ไฟในห้องโดยสาร', en: 'Cabin light' },
      { a: 'meter', th: 'มิเตอร์ / ไฟว่าง', en: 'Meter / vacancy lamp' },
      { a: 'window', th: 'หมุนกระจก', en: 'Wind the window' },
      { a: 'vehicle', th: 'ขึ้น / ลงจากรถ', en: 'Get in / out' },
    ],
  },
  {
    th: 'เดินเท้า', en: 'On foot',
    rows: [
      { a: 'run', th: 'วิ่ง', en: 'Run', padText: '—' },
      { a: 'pause', th: 'หยุดเกม', en: 'Pause', all: true },
    ],
  },
];

/** Keyboard + gamepad glyph cells for a controls-reference row. */
export function controlRowGlyphs(row) {
  const codes = row.kb ?? (row.all ? KEY_BINDINGS[row.a] : (KEY_BINDINGS[row.a] || []).slice(0, 2)) ?? [];
  const kb = h('span', { class: 'dlb-ctl__kb' }, codes.length ? codes.map((c) => kbCap(c)) : null,
    row.kbText ? h('span', { class: 'dlb-cap is-text', html: MOUSE_SVG(-1) + '<span>' + row.kbText + '</span>' }) : null);
  const pads = row.pad ?? PAD_FOR_ACTION[row.a] ?? [];
  const pad = h('span', { class: 'dlb-ctl__pad' }, pads.length ? pads.map(padCap) : row.padText ? h('span', { class: 'dlb-ctl__via' }, row.padText) : h('span', { class: 'dlb-ctl__none', title: 'Look at it and press A' }, h('span', { class: 'dlb-pad is-face is-a' }, 'A'), h('span', { class: 'dlb-ctl__via' }, '+ มอง · look')));
  return { kb, pad };
}
