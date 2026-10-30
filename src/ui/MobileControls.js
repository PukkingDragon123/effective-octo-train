// On-screen touch controls for phones and tablets. They feed core/Input's virtual
// actions and axes, so every system (taxi, motorbike, walking, interactions) works
// unchanged. Shown on touch devices (settings.touchControls 'auto'), forced with 'on'.
//
//   left thumb   : joystick (steer + throttle/brake in a vehicle, walk on foot)
//   right side   : drag to look; a quick tap uses whatever you're looking at
//   buttons      : use (hold to wipe glass), amulet (hold), handbrake, paper, get in/out,
//                  lean ◀ ▶, plus a small row of car controls and pause
import { input } from '../core/Input.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';

const CSS = `
.dlb-touch { position: absolute; inset: 0; pointer-events: none; z-index: 30; user-select: none; -webkit-user-select: none;
  font-family: var(--f-body); color: rgba(236,228,210,.92); touch-action: none; }
.dlb-touch[hidden] { display: none !important; }
.dlb-touch .t-look { position: absolute; top: 0; bottom: 0; right: 0; width: 58%; pointer-events: auto; touch-action: none; }
.dlb-touch .t-stick { position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: max(18px, env(safe-area-inset-bottom));
  width: 148px; height: 148px; border-radius: 50%; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle, rgba(20,24,22,.28) 0 55%, rgba(20,24,22,.42) 56% 100%); border: 1px solid rgba(236,228,210,.22); }
.dlb-touch .t-knob { position: absolute; left: 50%; top: 50%; width: 62px; height: 62px; margin: -31px 0 0 -31px; border-radius: 50%;
  background: rgba(236,228,210,.18); border: 1px solid rgba(236,228,210,.45); }
.dlb-touch .t-btn { position: absolute; pointer-events: auto; touch-action: none; display: grid; place-items: center; text-align: center;
  border-radius: 50%; background: rgba(14,17,16,.46); border: 1px solid rgba(236,228,210,.28); font-weight: 700; line-height: 1.05;
  -webkit-tap-highlight-color: transparent; }
.dlb-touch .t-btn.is-down { background: rgba(184,69,47,.55); border-color: rgba(255,200,170,.6); }
.dlb-touch .t-big { width: 86px; height: 86px; font-size: 19px; }
.dlb-touch .t-mid { width: 62px; height: 62px; font-size: 14px; }
.dlb-touch .t-small { width: 50px; height: 50px; font-size: 12px; border-radius: 14px; }
.dlb-touch .t-row { position: absolute; top: max(10px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right));
  display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; max-width: 72vw; pointer-events: none; }
.dlb-touch .t-row .t-btn { position: static; }
`;

function isTouchDevice() {
  try {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  } catch (e) {
    return false;
  }
}

export function installMobileControls(root) {
  if (document.getElementById('dlb-touch-css')) return;
  const style = document.createElement('style');
  style.id = 'dlb-touch-css';
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'dlb-touch';
  root.appendChild(el);

  // ---- look area (drag = look, quick tap = use) ---------------------------------------
  const look = document.createElement('div');
  look.className = 't-look';
  el.appendChild(look);
  const lookTouch = new Map();
  look.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) lookTouch.set(t.identifier, { x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 });
  }, { passive: false });
  look.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = lookTouch.get(t.identifier);
      if (!s) continue;
      const dx = t.clientX - s.x, dy = t.clientY - s.y;
      s.moved += Math.abs(dx) + Math.abs(dy);
      input.addLook(dx * 1.7, dy * 1.7);
      s.x = t.clientX;
      s.y = t.clientY;
    }
  }, { passive: false });
  const lookEnd = (e) => {
    for (const t of e.changedTouches) {
      const s = lookTouch.get(t.identifier);
      lookTouch.delete(t.identifier);
      if (s && s.moved < 10 && performance.now() - s.t0 < 260) press('interact');
    }
  };
  look.addEventListener('touchend', lookEnd);
  look.addEventListener('touchcancel', lookEnd);

  // ---- joystick -------------------------------------------------------------------------
  const stick = document.createElement('div');
  stick.className = 't-stick';
  const knob = document.createElement('div');
  knob.className = 't-knob';
  stick.appendChild(knob);
  el.appendChild(stick);
  let stickId = null;
  const setStick = (x, y) => {
    knob.style.transform = `translate(${x * 46}px, ${y * 46}px)`;
    const va = input.virtualAxis;
    va.steer = x;
    va.moveX = x;
    va.moveY = -y;
    va.throttle = Math.max(0, -y);
    va.brake = Math.max(0, y);
  };
  const stickMove = (t) => {
    const r = stick.getBoundingClientRect();
    let x = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    setStick(dz(x), dz(y));
  };
  stick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    stickMove(t);
  }, { passive: false });
  stick.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t);
  }, { passive: false });
  const stickEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; setStick(0, 0); }
  };
  stick.addEventListener('touchend', stickEnd);
  stick.addEventListener('touchcancel', stickEnd);

  // ---- buttons ---------------------------------------------------------------------------
  // press(): a short virtual press that lasts long enough for input.pressed() to see it.
  function press(action) {
    input.setVirtual(action, true);
    setTimeout(() => input.setVirtual(action, false), 90);
  }
  function button(label, action, cls, pos, { hold = false, parent = el } = {}) {
    const b = document.createElement('div');
    b.className = `t-btn ${cls}`;
    b.textContent = label;
    if (pos) Object.assign(b.style, pos);
    let downAt = 0;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      b.classList.add('is-down');
      downAt = performance.now();
      input.setVirtual(action, true);
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('is-down');
      // keep a tap down for at least ~2 frames so pressed() fires
      const held = performance.now() - downAt;
      setTimeout(() => input.setVirtual(action, false), held < 80 ? 80 - held : 0);
    };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
    void hold;
    parent.appendChild(b);
    return b;
  }
  const R = 'max(16px, env(safe-area-inset-right))';
  const B = 'max(16px, env(safe-area-inset-bottom))';
  button('ใช้', 'interact', 't-big', { right: R, bottom: `calc(${B} + 70px)` }, { hold: true });
  button('พระ', 'amulet', 't-mid', { right: `calc(${R} + 98px)`, bottom: `calc(${B} + 120px)` }, { hold: true });
  button('เบรก\nมือ', 'handbrake', 't-mid', { right: `calc(${R} + 98px)`, bottom: B });
  button('กระดาษ', 'paper', 't-mid', { right: `calc(${R} + 172px)`, bottom: `calc(${B} + 50px)` });
  button('ขึ้น/ลง', 'vehicle', 't-mid', { right: R, bottom: B });
  button('◀', 'leanLeft', 't-small', { left: 'max(18px, env(safe-area-inset-left))', bottom: `calc(${B} + 160px)` }, { hold: true });
  button('▶', 'leanRight', 't-small', { left: 'calc(max(18px, env(safe-area-inset-left)) + 98px)', bottom: `calc(${B} + 160px)` }, { hold: true });

  const row = document.createElement('div');
  row.className = 't-row';
  el.appendChild(row);
  const small = (label, action) => button(label, action, 't-small', null, { parent: row });
  small('ไฟ', 'headlights');
  small('ไฟใน', 'cabinLight');
  small('ปัด', 'wipers');
  small('วิทยุ', 'radio');
  small('คลื่น', 'radioTune');
  small('มิเตอร์', 'meter');
  small('แตร', 'horn');
  small('กระจก', 'window');
  small('เลี้ยว◀', 'indicatorLeft');
  small('เลี้ยว▶', 'indicatorRight');
  small('พัก', 'pause');

  // ---- visibility --------------------------------------------------------------------------
  const apply = () => {
    const mode = settings.get('touchControls') ?? 'auto';
    const want = mode === 'on' || (mode === 'auto' && isTouchDevice());
    const modal = !!document.querySelector('.dlb-ui')?.querySelector('[data-modal-open="true"]') || !!window.__dlbModalOpen;
    el.hidden = !want || modal;
  };
  bus.on('ui:modal', ({ open }) => {
    window.__dlbModalOpen = open;
    apply();
  });
  settings.onChange(apply);
  apply();
  return el;
}
