// Unified input: keyboard + mouse + gamepad mapped to named actions.
//
// Usage:
//   input.down('throttle')      -> held this frame
//   input.pressed('interact')   -> went down this frame
//   input.released('amulet')    -> went up this frame
//   input.axis.steer / throttle / brake / moveX / moveY / lean  (analog, -1..1 or 0..1)
//   input.look.dx / dy          -> radians of look rotation requested this frame
//
// The full binding table is in docs/ARCHITECTURE.md ("Controls").
import { settings } from './Settings.js';
import { clamp, damp } from './math.js';
import { bus } from './Events.js';

export const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyF', 'Mouse0'],
  amulet: ['KeyG', 'Mouse2'],
  paper: ['Tab', 'KeyJ'],
  handbrake: ['Space'],
  gearUp: ['KeyX', 'WheelUp'],
  gearDown: ['KeyZ', 'WheelDown'],
  indicatorLeft: ['Digit1'],
  indicatorRight: ['Digit2'],
  wipers: ['Digit3'],
  radio: ['Digit4'],
  radioTune: ['Digit5'],
  headlights: ['KeyL'],
  cabinLight: ['KeyC'],
  meter: ['KeyM'],
  window: ['KeyT'],
  horn: ['KeyH'],
  vehicle: ['KeyV'], // enter / exit vehicle
  pause: ['Escape', 'KeyP'],
  skip: ['Enter', 'Space'],
  confirm: ['Enter', 'KeyF', 'Mouse0'],
  back_ui: ['Escape', 'Backspace'],
  debug: ['Backquote'],
};

// Standard gamepad mapping (https://w3c.github.io/gamepad/#remapping)
const PAD_BUTTONS = {
  interact: [0], // A
  handbrake: [1], // B
  amulet: [2], // X
  paper: [3], // Y
  leanLeft: [4], // LB
  leanRight: [5], // RB
  pause: [9], // Start
  vehicle: [8], // Back/Select
  gearUp: [12], // dpad up
  gearDown: [13], // dpad down
  indicatorLeft: [14], // dpad left
  indicatorRight: [15], // dpad right
  headlights: [10], // L3
  horn: [11], // R3
  skip: [0, 9],
  confirm: [0],
  back_ui: [1],
};

class Input {
  constructor() {
    this.keys = new Set(); // codes currently held
    this.prevActions = new Set();
    this.actions = new Set();
    this.axis = { steer: 0, throttle: 0, brake: 0, moveX: 0, moveY: 0, lean: 0 };
    this.look = { dx: 0, dy: 0 };
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, locked: false };
    this._mdx = 0;
    this._mdy = 0;
    // virtual input from on-screen touch controls (src/ui/MobileControls.js)
    this.virtualActions = new Set();
    this.virtualAxis = { steer: 0, throttle: 0, brake: 0, moveX: 0, moveY: 0, lean: 0 };
    this._wheel = 0;
    this._wheelCodes = new Set();
    this.enabled = true;
    this.lookEnabled = true;
    this.lastDevice = 'keyboard'; // 'keyboard' | 'gamepad'
    this.gamepad = null;
    this.element = null;
    this.pointerLockSupported = 'pointerLockElement' in document;
  }

  attach(element) {
    this.element = element;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space' && e.target === document.body) e.preventDefault();
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    element.addEventListener('mousedown', (e) => {
      this.keys.add('Mouse' + e.button);
      this.lastDevice = 'keyboard';
      if (this.wantPointerLock && !this.mouse.locked) this.requestPointerLock();
    });
    window.addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      // Without pointer lock (e.g. inside an iframe that forbids it) movementX still
      // works while the cursor moves, so free-look degrades gracefully.
      this._mdx += e.movementX || 0;
      this._mdy += e.movementY || 0;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    element.addEventListener(
      'wheel',
      (e) => {
        this._wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = document.pointerLockElement === this.element;
      bus.emit('input:pointerlock', this.mouse.locked);
    });
    window.addEventListener('gamepadconnected', () => (this.lastDevice = 'gamepad'));
  }

  /** Games call this when gameplay wants the mouse captured (clicking the canvas then locks). */
  setWantPointerLock(v) {
    this.wantPointerLock = v;
    if (!v && this.mouse.locked) document.exitPointerLock?.();
  }

  requestPointerLock() {
    if (!this.element || !this.pointerLockSupported) return;
    try {
      const p = this.element.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* iframe without allow-pointer-lock: fall back to free mouse */
    }
  }

  _padButton(pad, i) {
    const b = pad.buttons[i];
    return b ? b.pressed || b.value > 0.5 : false;
  }

  update(dt) {
    this.prevActions = this.actions;
    this.actions = new Set();
    // wheel -> pseudo key presses for one frame
    this._wheelCodes.clear();
    if (this._wheel < 0) this._wheelCodes.add('WheelUp');
    if (this._wheel > 0) this._wheelCodes.add('WheelDown');
    this._wheel = 0;

    if (this.enabled) {
      for (const [action, codes] of Object.entries(KEY_BINDINGS)) {
        for (const c of codes) {
          if (this.keys.has(c) || this._wheelCodes.has(c)) {
            this.actions.add(action);
            break;
          }
        }
      }
    }

    if (this.enabled) for (const a of this.virtualActions) this.actions.add(a);

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gamepad = null;
    for (const p of pads) if (p && p.connected) { this.gamepad = p; break; }
    let padSteer = 0, padThrottle = 0, padBrake = 0, padMoveX = 0, padMoveY = 0, padLookX = 0, padLookY = 0;
    if (this.gamepad && this.enabled) {
      const p = this.gamepad;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      padSteer = dz(p.axes[0] || 0);
      padMoveX = padSteer;
      padMoveY = -dz(p.axes[1] || 0);
      padLookX = dz(p.axes[2] || 0);
      padLookY = dz(p.axes[3] || 0);
      padThrottle = p.buttons[7] ? p.buttons[7].value : 0;
      padBrake = p.buttons[6] ? p.buttons[6].value : 0;
      for (const [action, idx] of Object.entries(PAD_BUTTONS)) {
        if (idx.some((i) => this._padButton(p, i))) this.actions.add(action);
      }
      if (Math.abs(padSteer) + Math.abs(padLookX) + padThrottle + padBrake > 0.1 || this.actions.size) {
        if (this.actions.size || padThrottle > 0.1) this.lastDevice = 'gamepad';
      }
    }

    // analog axes
    const va = this.virtualAxis;
    padSteer = clamp(padSteer + va.steer, -1, 1);
    padMoveX = clamp(padMoveX + va.moveX, -1, 1);
    padMoveY = clamp(padMoveY + va.moveY, -1, 1);
    padThrottle = Math.max(padThrottle, va.throttle);
    padBrake = Math.max(padBrake, va.brake);
    const kSteer = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    const kThrottle = this.down('forward') ? 1 : 0;
    const kBrake = this.down('back') ? 1 : 0;
    const steerTarget = clamp(kSteer + padSteer, -1, 1);
    // keyboard steering is smoothed so the wheel turns believably
    this.axis.steer = padSteer !== 0 ? steerTarget : damp(this.axis.steer, steerTarget, kSteer === 0 ? 8 : 4.5, dt);
    this.axis.throttle = Math.max(kThrottle, padThrottle);
    this.axis.brake = Math.max(kBrake, padBrake);
    this.axis.moveX = clamp(kSteer + padMoveX, -1, 1);
    this.axis.moveY = clamp(kThrottle - kBrake + padMoveY, -1, 1);
    const leanTarget = clamp((this.down('leanRight') ? 1 : 0) - (this.down('leanLeft') ? 1 : 0) + va.lean, -1, 1);
    this.axis.lean = damp(this.axis.lean, leanTarget, 6, dt);

    // look
    const sens = settings.get('mouseSensitivity') ?? 1;
    const inv = settings.get('invertY') ? -1 : 1;
    if (this.lookEnabled && this.enabled) {
      const padSens = (settings.get('gamepadLookSensitivity') ?? 1) * 2.6;
      this.look.dx = -this._mdx * 0.0022 * sens - padLookX * padSens * dt;
      this.look.dy = -this._mdy * 0.0022 * sens * inv - padLookY * padSens * dt * inv;
    } else {
      this.look.dx = 0;
      this.look.dy = 0;
    }
    this._mdx = 0;
    this._mdy = 0;
  }

  /** Touch controls: hold/release a named action (same names as KEY_BINDINGS). */
  setVirtual(action, isDown) {
    if (isDown) this.virtualActions.add(action);
    else this.virtualActions.delete(action);
    if (isDown) this.lastDevice = 'touch';
  }
  /** Touch look: add a drag delta in CSS pixels (same scale as mouse movement). */
  addLook(dx, dy) {
    this._mdx += dx;
    this._mdy += dy;
  }

  down(action) {
    return this.actions.has(action);
  }
  pressed(action) {
    return this.actions.has(action) && !this.prevActions.has(action);
  }
  released(action) {
    return !this.actions.has(action) && this.prevActions.has(action);
  }
  /** Swallow an action for the rest of this frame (e.g. a UI click shouldn't also interact). */
  consume(action) {
    this.actions.delete(action);
    this.prevActions.add(action);
  }
}

export const input = new Input();
