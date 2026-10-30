// Suggested light specs for prop lamps + emissive flicker that runs inside the lamp
// mesh's onBeforeRender (no world integration needed, no allocations).
//
// The WORLD (or a sandbox) registers lights via lightPool: every prop result carries
// `lights: [spec]` where each spec is ready for `lightPool.add(spec)` (spec.object is the
// lamp anchor, so the light follows the prop). Use addPropLights(result) from index.js.
import * as THREE from 'three';
import { GLOBAL_UNIFORMS } from '../../render/index.js';
import { noise } from '../../core/math.js';

export const LIGHT_PRESETS = {
  sodium: { color: 0xff9a45, intensity: 60, distance: 24, decay: 2, flicker: 'sodium', glow: { size: 2.4, color: 0xffa050, opacity: 0.85 }, pool: true, priority: 2 },
  fluorescent: { color: 0xd6f5e6, intensity: 30, distance: 15, decay: 2, flicker: 'fluorescent', glow: { size: 1.6, color: 0xe0fff0, opacity: 0.6 }, pool: true, priority: 2 },
  dying: { color: 0xd0f0e0, intensity: 22, distance: 12, decay: 2, flicker: 'dying', glow: { size: 1.3, color: 0xd8fff0, opacity: 0.5 }, pool: true, priority: 1 },
  bulb: { color: 0xffb468, intensity: 10, distance: 9, decay: 2, flicker: 'none', glow: { size: 0.9, color: 0xffc080, opacity: 0.7 }, pool: true, priority: 1 },
  lantern: { color: 0xff3a1c, intensity: 4, distance: 7, decay: 2, flicker: 'candle', glow: { size: 1.1, color: 0xff3020, opacity: 0.55 }, pool: false, priority: 0 },
  lantern_white: { color: 0xffe8c8, intensity: 2.5, distance: 6, decay: 2, flicker: 'candle', glow: { size: 1.0, color: 0xfff0d0, opacity: 0.4 }, pool: false, priority: 0 },
  candle: { color: 0xffa040, intensity: 1.6, distance: 3.5, decay: 2, flicker: 'candle', glow: { size: 0.45, color: 0xffb060, opacity: 0.7 }, pool: false, priority: 0 },
  altar: { color: 0xff3018, intensity: 8, distance: 7, decay: 2, flicker: 'neon', glow: { size: 0.9, color: 0xff2a18, opacity: 0.6 }, pool: false, priority: 1 },
  delineator: { color: 0xffa83a, intensity: 1.2, distance: 3, decay: 2, flicker: 'none', glow: { size: 0.55, color: 0xffb040, opacity: 0.9 }, pool: false, priority: -1 },
  window: { color: 0xffb060, intensity: 6, distance: 8, decay: 2, flicker: 'none', glow: { size: 1.6, color: 0xffb060, opacity: 0.35 }, pool: false, priority: 0 },
  shrine_gold: { color: 0xffc070, intensity: 14, distance: 10, decay: 2, flicker: 'candle', glow: { size: 1.8, color: 0xffc070, opacity: 0.4 }, pool: true, priority: 2 },
};

/** Light spec for lightPool.add(): preset + anchor (+ overrides). */
export function lightSpec(preset, anchor, overrides = {}) {
  const p = LIGHT_PRESETS[preset] || LIGHT_PRESETS.bulb;
  return { ...p, glow: p.glow ? { ...p.glow } : false, ...overrides, object: anchor, offset: overrides.offset || new THREE.Vector3(), preset };
}

/**
 * Deterministic flicker multiplier (0..~1.1) for kind at time t; seed decorrelates lamps.
 * Kinds: none, sodium, fluorescent, dying, candle, neon.
 */
export function flickerValue(kind, t, seed = 0) {
  switch (kind) {
    case 'sodium':
      return 0.94 + 0.06 * noise.noise2D(t * 0.7, seed);
    case 'fluorescent': {
      const n = noise.noise2D(t * 2.3, seed * 1.7);
      if (n > 0.72) return 0.15 + 0.7 * (Math.sin(t * 90 + seed) > 0 ? 1 : 0);
      return 0.92 + 0.08 * Math.sin(t * 100 * Math.PI) * 0.5;
    }
    case 'dying': {
      const slow = noise.noise2D(t * 0.35, seed + 3.1);
      if (slow < -0.35) return 0.02; // long blackout
      const fast = noise.noise2D(t * 9, seed * 2.1);
      if (fast > 0.45) return 0.1 + (Math.sin(t * 70) > 0.2 ? 0.8 : 0);
      return 0.7 + 0.25 * noise.noise2D(t * 3, seed);
    }
    case 'candle':
      return 0.8 + 0.12 * noise.noise2D(t * 6, seed) + 0.08 * noise.noise2D(t * 17, seed + 5);
    case 'neon':
      return noise.noise2D(t * 1.3, seed) > 0.82 ? 0.3 : 0.96 + 0.04 * Math.sin(t * 120);
    default:
      return 1;
  }
}

/**
 * Make an emissive material flicker. Hooks onBeforeRender of `mesh` (the material should
 * be a per-instance glowMat(..., {shared:false})). Returns a controller {on, kind, seed}.
 */
export function attachFlicker(mesh, material, kind, seed = 0) {
  const ctl = { on: true, kind, seed, scale: 1 };
  const base = material.userData.baseEmissive ?? material.emissiveIntensity;
  let lastFrame = -1;
  mesh.onBeforeRender = () => {
    const t = GLOBAL_UNIFORMS.uTime.value;
    if (t === lastFrame) return;
    lastFrame = t;
    material.emissiveIntensity = ctl.on ? base * ctl.scale * flickerValue(ctl.kind, t, ctl.seed) : 0;
  };
  return ctl;
}
