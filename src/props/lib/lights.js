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
  sodium: { color: 0xffa04a, intensity: 30, distance: 22, decay: 2, flicker: 'sodium', glow: { size: 0.6, color: 0xffa050, opacity: 0.9 }, pool: true, priority: 2, beam: { length: 6.0, angle: 0.62, intensity: 0.5 } },
  fluorescent: { color: 0xd6f5e6, intensity: 22, distance: 16, decay: 2, flicker: 'fluorescent', glow: { size: 0.5, color: 0xe0fff0, opacity: 0.7 }, pool: true, priority: 2, beam: { length: 5.0, angle: 0.75, intensity: 0.4 } },
  dying: { color: 0xd0f0e0, intensity: 16, distance: 12, decay: 2, flicker: 'dying', glow: { size: 0.45, color: 0xd8fff0, opacity: 0.6 }, pool: true, priority: 1 },
  bulb: { color: 0xffb468, intensity: 6, distance: 9, decay: 2, flicker: 'none', glow: { size: 0.3, color: 0xffc080, opacity: 0.8 }, pool: true, priority: 1 },
  lantern: { color: 0xff3a1c, intensity: 2.2, distance: 6, decay: 2, flicker: 'candle', glow: { size: 0.45, color: 0xff3020, opacity: 0.6 }, pool: false, priority: 0 },
  lantern_white: { color: 0xffe8c8, intensity: 1.4, distance: 5, decay: 2, flicker: 'candle', glow: { size: 0.4, color: 0xfff0d0, opacity: 0.45 }, pool: false, priority: 0 },
  candle: { color: 0xffa040, intensity: 0.6, distance: 3, decay: 2, flicker: 'candle', glow: { size: 0.12, color: 0xffb060, opacity: 0.8 }, pool: false, priority: 0 },
  altar: { color: 0xff3018, intensity: 5, distance: 6, decay: 2, flicker: 'neon', glow: { size: 0.3, color: 0xff2a18, opacity: 0.6 }, pool: false, priority: 1 },
  delineator: { color: 0xffa83a, intensity: 0.6, distance: 2.5, decay: 2, flicker: 'none', glow: { size: 0.22, color: 0xffb040, opacity: 1.0 }, pool: false, priority: -1, scatter: 0.3 },
  window: { color: 0xffb060, intensity: 4, distance: 8, decay: 2, flicker: 'none', glow: { size: 0.6, color: 0xffb060, opacity: 0.4 }, pool: false, priority: 0 },
  shrine_gold: { color: 0xffc070, intensity: 10, distance: 10, decay: 2, flicker: 'candle', glow: { size: 0.8, color: 0xffc070, opacity: 0.4 }, pool: true, priority: 2 },
};

/** Light spec for lightPool.add(): preset + anchor (+ overrides). */
export function lightSpec(preset, anchor, overrides = {}) {
  const p = LIGHT_PRESETS[preset] || LIGHT_PRESETS.bulb;
  // height above the prop's ground (props stand on y=0) so the pool lands on the ground
  const height = anchor ? anchor.position.y + (overrides.offset ? overrides.offset.y : 0) : undefined;
  return { ...p, glow: p.glow ? { ...p.glow } : false, beam: p.beam ? { ...p.beam } : undefined, height, ...overrides, object: anchor, offset: overrides.offset || new THREE.Vector3(), preset };
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
export function attachFlicker(mesh, material, kind, seed = 0, lightIndex = 0) {
  // ctl.handle (set by addPropLights) = the lightPool handle of the matching light: when
  // present the emissive follows the pooled light's live flicker level exactly.
  const ctl = { on: true, kind, seed, scale: 1, lightIndex, handle: null };
  material.userData.perInstance = true;
  const base = material.userData.baseEmissive ?? material.emissiveIntensity;
  let lastFrame = -1;
  mesh.onBeforeRender = () => {
    const t = GLOBAL_UNIFORMS.uTime.value;
    if (t === lastFrame) return;
    lastFrame = t;
    let lv;
    if (!ctl.on) lv = 0;
    else if (ctl.handle && typeof ctl.handle.level === 'number') lv = ctl.handle.on === false ? 0 : ctl.handle.level;
    else lv = flickerValue(ctl.kind, t, ctl.seed);
    material.emissiveIntensity = base * ctl.scale * (0.05 + 0.95 * lv);
  };
  return ctl;
}
