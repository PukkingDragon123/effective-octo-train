// Persistent player settings (localStorage, wrapped so private windows never crash).
import { bus } from './Events.js';

const KEY = 'dlbih.settings.v1';

export const GRAPHICS_PRESETS = {
  low: {
    resolutionScale: 0.6, painterly: 0, painterlyQuality: 'low', bloom: 0.5, shadows: false,
    shadowMapSize: 512, mirrorResolution: 192, glassReflections: false, foliageDensity: 0.5,
    particles: 0.45, drawDistance: 90, volumetrics: false,
  },
  medium: {
    resolutionScale: 0.8, painterly: 0, painterlyQuality: 'medium', bloom: 0.7, shadows: true,
    shadowMapSize: 1024, mirrorResolution: 256, glassReflections: true, foliageDensity: 0.75,
    particles: 0.75, drawDistance: 120, volumetrics: true,
  },
  high: {
    resolutionScale: 1.0, painterly: 0, painterlyQuality: 'high', bloom: 0.8, shadows: true,
    shadowMapSize: 2048, mirrorResolution: 384, glassReflections: true, foliageDensity: 1.0,
    particles: 1.0, drawDistance: 150, volumetrics: true,
  },
  ultra: {
    resolutionScale: 1.0, painterly: 0, painterlyQuality: 'high', bloom: 0.85, shadows: true,
    shadowMapSize: 4096, mirrorResolution: 512, glassReflections: true, foliageDensity: 1.3,
    particles: 1.3, drawDistance: 190, volumetrics: true,
  },
};

export const DEFAULT_SETTINGS = {
  // graphics
  graphicsPreset: 'high',
  ...GRAPHICS_PRESETS.high,
  sharpen: 0.5, // contrast-adaptive sharpening after the painterly pass (0..1)
  filmGrain: 0,
  chromaticAberration: 0,
  vignette: 0.6,
  brightness: 1.0,
  fov: 72,
  headBob: 0.6,
  // controls
  mouseSensitivity: 1.0,
  invertY: false,
  gamepadLookSensitivity: 1.0,
  transmission: 'auto', // 'auto' | 'manual'
  touchControls: 'auto', // 'auto' (on touch devices) | 'on' | 'off'
  testPanel: false, // developer test panel: only with ?dev=1
  showPrompts: false, // minimal text: the crosshair dot blooms on targets but shows no label
  // text / language
  language: 'th', // 'th' = the whole game in Thai only (default) | 'both' = Thai with English helpers
  subtitles: 'th', // 'en' | 'th' | 'both' | 'off'
  subtitleSize: 1.0,
  voice: 'auto', // 'auto' (Thai TTS when the OS has a Thai voice, else murmur) | 'murmur' | 'off'
  // audio
  volMaster: 0.9,
  volMusic: 0.7,
  volSfx: 0.9,
  volAmbience: 0.85,
  volVoice: 1.0,
  // accessibility / content
  gore: 'full', // 'full' | 'reduced' (darker, sparser blood; no lingering gore close-ups)
  reduceFlashes: false,
  cameraShake: 1.0,
};

class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch (e) {
      /* storage unavailable: defaults only */
    }
  }
  get(key) {
    return this.values[key];
  }
  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    if (key === 'graphicsPreset' && GRAPHICS_PRESETS[value]) {
      Object.assign(this.values, GRAPHICS_PRESETS[value]);
    }
    this.save();
    bus.emit('settings:changed', { key, value, values: this.values });
  }
  setMany(obj) {
    Object.assign(this.values, obj);
    this.save();
    bus.emit('settings:changed', { key: '*', value: null, values: this.values });
  }
  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    this.save();
    bus.emit('settings:changed', { key: '*', value: null, values: this.values });
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch (e) {
      /* ignore */
    }
  }
  /** Subscribe to changes; fn({key, value, values}). Returns unsubscribe. */
  onChange(fn) {
    return bus.on('settings:changed', fn);
  }
}

export const settings = new Settings();
