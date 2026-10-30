// In-game clock for the 21:00 → 06:00 shift (hours 21..30) driving sky, weather,
// phase-based music defaults and the dashboard clock.
import { g } from './context.js';
import { bus } from '../core/Events.js';
import { clamp, damp, smoothstep } from '../core/math.js';

export const PHASES = [
  { id: 'dread', from: 21, to: 23 },
  { id: 'surreal', from: 23, to: 26 },
  { id: 'calm', from: 26, to: 28 },
  { id: 'dawn', from: 28, to: 30.01 },
];

export function phaseOf(hour) {
  return (PHASES.find((p) => hour >= p.from && hour < p.to) || PHASES[PHASES.length - 1]).id;
}

/** "21:00" style text. hour 21..30 */
export function clockText(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Default weather schedule (states may override with sky.setWeather). */
export function weatherFor(hour) {
  return {
    rain: hour < 24.5 ? smoothstep(21, 21.4, hour) * (1 - smoothstep(24.0, 24.6, hour)) * 0.75 : 0,
    fog: 0.45 + 0.35 * smoothstep(28.5, 29.5, hour) - 0.2 * smoothstep(25.5, 26.5, hour),
    wind: 0.35 + 0.25 * (1 - smoothstep(22, 25, hour)),
  };
}

export class Clock {
  constructor() {
    this.hour = 21;
    this.target = 21;
    this.lastWhole = 21;
    this.autoWeather = true;
    this.frozen = false;
    this._weatherTimer = 0;
  }
  /** Jump to hour immediately. */
  set(hour) {
    this.hour = this.target = hour;
    this.lastWhole = Math.floor(hour);
    this._apply(true);
  }
  /** Ease toward an hour (e.g. ride progress pushes the clock forward). */
  advanceTo(hour) {
    this.target = Math.max(this.target, clamp(hour, 21, 30));
  }
  get phase() {
    return phaseOf(this.hour);
  }
  get text() {
    return clockText(this.hour);
  }
  update(dt) {
    if (this.frozen) return;
    this.hour = damp(this.hour, this.target, 0.6, dt);
    if (Math.abs(this.hour - this.target) < 1e-4) this.hour = this.target;
    this._weatherTimer -= dt;
    this._apply(false);
    const whole = Math.floor(this.hour + 1e-6);
    if (whole !== this.lastWhole) {
      this.lastWhole = whole;
      bus.emit('game:hour', { hour: whole, phase: this.phase });
    }
  }
  _apply(force) {
    g.sky?.setHour(this.hour);
    if (this.autoWeather && (force || this._weatherTimer <= 0)) {
      this._weatherTimer = 2;
      g.sky?.setWeather(weatherFor(this.hour), force ? 0 : 3);
    }
  }
}
