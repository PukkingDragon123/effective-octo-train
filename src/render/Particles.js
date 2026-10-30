// GPU particles: every emitter is ONE instanced draw of camera-facing (or velocity-
// streaked, or world-tumbling) quads. Motion is evaluated in the vertex shader as a
// closed-form function of (seed, time, emitter origin, wind) — the CPU only updates a
// handful of uniforms per emitter per frame. Lighting comes from GLOBAL uniforms
// (ambient, headlight cone, nearest lamps), so insects / rain / dust light up in beams.
import * as THREE from 'three';
import { GLOBAL_UNIFORMS, injectGlobals } from './uniforms.js';
import { settings } from '../core/Settings.js';
import { makeRng } from '../core/math.js';
import { GORE_UNIFORM } from './Blood.js';

const BILLBOARD = 0, STREAK = 1, WORLD = 2;
const ADD = THREE.AdditiveBlending, NORMAL = THREE.NormalBlending;

// Per-type shader bodies. Inputs: aSeed, aSeed2 (vec4 random), t (time), uOrigin, uFrame,
// uRadius, uHeight, uColor, uIntensity, uStart, uWindV (wind vector xz * strength).
// Outputs: wp, size, vel, rot, col (rgb, a), alive, shape (float id for frag).
const TYPES = {
  fireflies: {
    count: 70, radius: 14, height: 3, blending: ADD, mode: BILLBOARD, minPx: 2.2, color: 0xf0e27a, cameraCentred: false,
    body: /* glsl */ `
      vec3 base = vec3((aSeed.x * 2.0 - 1.0) * uRadius, 0.25 + aSeed.y * uHeight, (aSeed.z * 2.0 - 1.0) * uRadius);
      float f1 = 0.15 + aSeed2.x * 0.25, f2 = 0.2 + aSeed2.y * 0.3;
      vec3 wander = vec3(sin(t * f1 + aSeed2.z * 40.0) + 0.5 * sin(t * f1 * 2.3 + aSeed.w * 20.0),
                         0.45 * sin(t * f2 + aSeed2.w * 30.0),
                         cos(t * f1 * 0.9 + aSeed2.y * 50.0) + 0.5 * cos(t * f2 * 1.7 + aSeed.x * 20.0)) * 1.4;
      wp = uOrigin + base + wander;
      // blink: slow pulses with a lazy sync wave across the swarm
      float ph = t * (0.55 + aSeed2.x * 0.5) + aSeed.w * 60.0 + sin(t * 0.13 + base.x * 0.1) * 2.0;
      float b = pow(max(sin(ph), 0.0), 6.0);
      col = vec4(uColor * (0.15 + b * 3.4) * uIntensity, 1.0);
      size = 0.07 + aSeed2.z * 0.05;
      shape = 0.0;
    `,
  },
  moths: {
    count: 14, radius: 1.1, height: 0.8, blending: NORMAL, mode: BILLBOARD, minPx: 1.6, color: 0xe8dcc0,
    body: /* glsl */ `
      float r = uRadius * (0.35 + aSeed.x * 0.75);
      float sp = (0.9 + aSeed.y * 1.6) * (aSeed.z > 0.5 ? 1.0 : -1.0);
      float a = t * sp + aSeed.w * 6.283;
      vec3 jit = vec3(sin(t * 7.0 + aSeed2.x * 30.0), sin(t * 9.0 + aSeed2.y * 30.0), cos(t * 8.0 + aSeed2.z * 30.0)) * 0.12;
      wp = uOrigin + vec3(cos(a) * r, (aSeed2.w - 0.5) * uHeight + sin(t * 1.3 + aSeed.x * 9.0) * 0.25, sin(a) * r) + jit;
      float flap = abs(sin(t * 26.0 + aSeed.y * 50.0));
      vec3 lit = pAmbient(wp) + uColor * uIntensity * 0.25 / (1.0 + 4.0 * dot(wp - uOrigin, wp - uOrigin)) + pDirect(wp);
      col = vec4(vec3(0.85, 0.78, 0.62) * lit, 0.95);
      size = 0.05 + aSeed2.x * 0.03;
      rot = a;
      misc.x = flap;
      shape = 1.0;
    `,
  },
  mosquitoes: {
    count: 40, radius: 0.7, height: 0.6, blending: NORMAL, mode: BILLBOARD, minPx: 1.2, color: 0x101010,
    body: /* glsl */ `
      vec3 c = vec3(sin(t * 0.3 + aSeed.x * 6.0), sin(t * 0.21 + aSeed.y * 6.0) * 0.5, cos(t * 0.27 + aSeed.z * 6.0)) * uRadius;
      vec3 jit = vec3(sin(t * 13.0 + aSeed2.x * 40.0), sin(t * 11.0 + aSeed2.y * 40.0), sin(t * 17.0 + aSeed2.z * 40.0)) * 0.14;
      wp = uOrigin + c * (0.4 + aSeed.w * 0.6) + jit + vec3(0.0, uHeight, 0.0);
      vec3 lit = pAmbient(wp) * 0.3 + pDirect(wp) * 0.4;
      col = vec4(vec3(0.02, 0.018, 0.015) + lit * 0.4, 0.9);
      size = 0.012;
      shape = 0.0;
    `,
  },
  headlightBugs: {
    count: 90, radius: 3.5, height: 2.2, blending: ADD, mode: STREAK, minPx: 1.3, color: 0xfff0d0, frame: true, streak: 0.03,
    body: /* glsl */ `
      // local frame of the followed object: bugs in front (-Z), drifting into the beam
      float z = -(3.0 + aSeed.z * 16.0);
      vec3 loc = vec3((aSeed.x * 2.0 - 1.0) * uRadius * (0.4 + aSeed.z), 0.35 + aSeed.y * uHeight, z);
      vec3 sw = vec3(sin(t * (1.1 + aSeed2.x) + aSeed2.y * 40.0), sin(t * (1.7 + aSeed2.z) + aSeed2.w * 40.0) * 0.6, cos(t * (0.9 + aSeed2.y) + aSeed.w * 30.0)) * (0.6 + aSeed2.x);
      loc += sw;
      wp = (uFrame * vec4(loc, 1.0)).xyz;
      vel = mat3(uFrame) * vec3(cos(t * 1.1 + aSeed2.y * 40.0), cos(t * 1.7 + aSeed2.w * 40.0) * 0.6, -sin(t * 0.9 + aSeed.w * 30.0)) * 1.3;
      float hl = dlbHeadlightAt(wp);
      col = vec4(uColor * (hl * 18.0 + 0.02) * uIntensity, 1.0);
      size = 0.012 + aSeed2.z * 0.01;
      shape = 0.0;
    `,
  },
  rain: {
    count: 3200, radius: 10, height: 8, blending: NORMAL, mode: STREAK, minPx: 0.9, color: 0xc8d4dc, cameraCentred: true, streak: 0.042, lead: 0.55,
    intensityUniform: 'uRain',
    body: /* glsl */ `
      float speed = 8.5 + aSeed2.x * 3.0;
      vec2 wind = uWindV * 3.2;
      float H = uHeight;
      float ph = fract(aSeed.y + t * speed / H);
      // wrapped box around the camera
      vec3 box = vec3(uRadius * 2.0, H, uRadius * 2.0);
      vec3 p0 = vec3(aSeed.x * box.x, H * (1.0 - ph), aSeed.z * box.z);
      p0.xz += wind * (1.0 - ph) * H / speed;
      vec3 rel = p0 - vec3(uOrigin.x, 0.0, uOrigin.z);
      rel.xz = mod(rel.xz, box.xz) - box.xz * 0.5;
      wp = vec3(uOrigin.x + rel.x, uOrigin.y - H * 0.35 + p0.y, uOrigin.z + rel.z);
      vel = vec3(wind.x, -speed, wind.y);
      vec3 lit = pAmbient(wp) * 1.4 + pDirect(wp) * 2.2 + dlbFlash * vec3(0.15);
      float dc = length(wp - cameraPosition);
      float fade = smoothstep(0.4, 1.6, dc) * (1.0 - smoothstep(uRadius * 0.6, uRadius, length(rel.xz)));
      col = vec4(uColor * lit, (0.22 + aSeed2.y * 0.2) * fade);
      size = 0.006 + aSeed2.z * 0.004;
      shape = 2.0;
    `,
  },
  splash: {
    count: 500, radius: 9, height: 0, blending: NORMAL, mode: BILLBOARD, minPx: 1.0, color: 0xc8d4dc, cameraCentred: true, ground: true, lead: 0.6,
    intensityUniform: 'uRain',
    body: /* glsl */ `
      float life = 0.32 + aSeed2.x * 0.2;
      float cyc = t / life + aSeed.w * 13.0;
      float id = floor(cyc);
      float age = fract(cyc);
      vec2 rp = vec2(dlbHash12(vec2(id, aSeed.x * 91.0)), dlbHash12(vec2(aSeed.z * 77.0, id))) * 2.0 - 1.0;
      wp = vec3(uOrigin.x + rp.x * uRadius, uGround + 0.04 + age * 0.06, uOrigin.z + rp.y * uRadius);
      vec3 lit = pAmbient(wp) * 1.2 + pDirect(wp) * 1.5;
      col = vec4(uColor * lit, (1.0 - age) * (1.0 - age) * 0.22 * smoothstep(2.0, 5.0, length(wp - cameraPosition)));
      size = 0.015 + age * 0.035;
      misc.x = age;
      shape = 3.0;
    `,
  },
  dust: {
    count: 520, radius: 9, height: 4, blending: ADD, mode: BILLBOARD, minPx: 1.1, color: 0xfff2dc, cameraCentred: true, lead: 0.6,
    body: /* glsl */ `
      vec3 box = vec3(uRadius * 2.0, uHeight, uRadius * 2.0);
      vec3 drift = vec3(uWindV.x, 0.03, uWindV.y) * t * 0.35 + vec3(sin(t * 0.3 + aSeed2.x * 20.0), sin(t * 0.23 + aSeed2.y * 20.0), cos(t * 0.27 + aSeed2.z * 20.0)) * 0.35;
      vec3 p0 = aSeed.xyz * box + drift;
      vec3 rel = p0 - uOrigin;
      rel = mod(rel, box) - box * 0.5;
      wp = uOrigin + rel;
      wp.y = uOrigin.y + rel.y + 0.2;
      float hl = dlbHeadlightAt(wp);
      vec3 lit = dlbHeadlightColor * hl * 8.0 + dlbLampLightAt(wp) * 0.8;
      float tw = 0.6 + 0.4 * sin(t * (2.0 + aSeed2.w * 4.0) + aSeed.w * 30.0);
      col = vec4(uColor * lit * tw * uIntensity * 0.9, 1.0);
      size = 0.008 + aSeed2.z * 0.008;
      shape = 0.0;
    `,
  },
  pollen: {
    count: 260, radius: 9, height: 3.5, blending: ADD, mode: BILLBOARD, minPx: 1.3, color: 0xfff0a8, cameraCentred: true, lead: 0.5,
    body: /* glsl */ `
      vec3 box = vec3(uRadius * 2.0, uHeight, uRadius * 2.0);
      vec3 drift = vec3(uWindV.x, 0.05, uWindV.y) * t * 0.5 + vec3(sin(t * 0.4 + aSeed2.x * 20.0), sin(t * 0.33 + aSeed2.y * 20.0), cos(t * 0.37 + aSeed2.z * 20.0)) * 0.5;
      vec3 rel = aSeed.xyz * box + drift - uOrigin;
      rel = mod(rel, box) - box * 0.5;
      wp = uOrigin + rel;
      wp.y = uOrigin.y + rel.y + 0.4;
      // invisible in the dark: lights up only inside the headlight cone / near lamps / at dawn
      vec3 lit = pDirect(wp) * 1.6 + dlbAmbient * 0.06 + dlbSunScatter * 2.0;
      col = vec4(uColor * lit * uIntensity, 1.0);
      size = 0.012 + aSeed2.z * 0.012;
      shape = 0.0;
    `,
  },
  spores: {
    // fine pale spores / seed fluff hanging in the air, slow lazy drift; visible only in beams
    count: 340, radius: 8, height: 3.2, blending: ADD, mode: BILLBOARD, minPx: 1.1, color: 0xeceae0, cameraCentred: true, lead: 0.55,
    body: /* glsl */ `
      vec3 box = vec3(uRadius * 2.0, uHeight, uRadius * 2.0);
      vec3 drift = vec3(uWindV.x, 0.02, uWindV.y) * t * 0.3 + vec3(sin(t * 0.21 + aSeed2.x * 20.0), sin(t * 0.17 + aSeed2.y * 20.0) * 0.6, cos(t * 0.19 + aSeed2.z * 20.0)) * 0.45;
      vec3 rel = aSeed.xyz * box + drift - uOrigin;
      rel = mod(rel, box) - box * 0.5;
      wp = uOrigin + rel;
      wp.y = uOrigin.y + rel.y + 0.3;
      float hl = dlbHeadlightAt(wp);
      vec3 lit = dlbHeadlightColor * hl * 9.0 + dlbLampLightAt(wp) * 1.0 + dlbSunScatter * 1.5;
      float tw = 0.7 + 0.3 * sin(t * (1.3 + aSeed2.w * 2.0) + aSeed.w * 30.0);
      col = vec4(uColor * lit * tw * uIntensity, 1.0);
      size = 0.006 + aSeed2.z * 0.007;
      shape = 0.0;
    `,
  },
  leaves: {
    // painted tumbling leaves; setIntensity(<1) thins them out, setIntensity(>1) = a gust:
    // every leaf is pushed downwind and spins faster (integrated on the CPU, no popping)
    count: 90, radius: 12, height: 9, blending: NORMAL, mode: WORLD, minPx: 1.0, color: 0x6a5a30, cameraCentred: false, countByIntensity: true,
    body: /* glsl */ `
      float fall = 0.45 + aSeed2.x * 0.5;
      float ph = fract(aSeed.y + t * fall / uHeight);
      vec3 sway = vec3(sin(t * (1.2 + aSeed2.y) + aSeed.w * 20.0), 0.0, cos(t * (0.9 + aSeed2.z) + aSeed.x * 20.0)) * 0.6;
      vec2 xz = (aSeed.xz * 2.0 - 1.0) * uRadius + uWindV * 0.6 * ph * uHeight / fall + uGust * (0.6 + aSeed2.x * 0.8);
      xz = mod(xz + uRadius, 2.0 * uRadius) - uRadius;
      float edgeF = 1.0 - smoothstep(uRadius * 0.8, uRadius, max(abs(xz.x), abs(xz.y)));
      wp = uOrigin + vec3(xz.x, uHeight * (1.0 - ph), xz.y) + sway;
      rot = uSpin * (1.5 + aSeed2.w * 3.0) + aSeed.w * 6.28;
      misc.y = uSpin * (0.8 + aSeed2.x * 2.0) + aSeed2.y * 6.28;
      misc.w = aSeed2.y;
      size = 0.07 + aSeed2.z * 0.05;
      vec3 tint = mix(vec3(0.42, 0.33, 0.14), vec3(0.25, 0.33, 0.12), aSeed2.y);
      tint = mix(tint, vec3(0.5, 0.22, 0.1), step(0.82, aSeed2.w));
      vec3 lit = pAmbient(wp) * 1.2 + pDirect(wp) * 1.3 + dlbSunScatter * 3.0;
      col = vec4(tint * uColor * 2.2 * lit, smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.95, 1.0, ph)) * edgeF);
      shape = 4.0;
    `,
  },
  incense: {
    count: 60, radius: 0.06, height: 1.3, blending: NORMAL, mode: BILLBOARD, minPx: 1.0, color: 0xc8ccd4,
    body: /* glsl */ `
      float life = 5.5 + aSeed2.x * 2.0;
      float age = fract(t / life + aSeed.w);
      float hgt = age * uHeight * (0.8 + aSeed2.y * 0.4);
      vec3 curl = vec3(sin(hgt * 3.1 + t * 0.9 + aSeed.x * 6.0), 0.0, cos(hgt * 2.7 + t * 0.7 + aSeed.z * 6.0)) * (0.02 + hgt * 0.09);
      wp = uOrigin + vec3((aSeed.x - 0.5) * uRadius, hgt, (aSeed.z - 0.5) * uRadius) + curl + vec3(uWindV.x, 0.0, uWindV.y) * hgt * 0.6;
      size = 0.025 + age * 0.32;
      rot = aSeed2.z * 6.28 + t * 0.2 * (aSeed2.w - 0.5);
      vec3 lit = pAmbient(wp) * 1.5 + pDirect(wp) * 0.8;
      col = vec4(uColor * lit, smoothstep(0.0, 0.08, age) * (1.0 - age) * (1.0 - age) * 0.55 * uIntensity);
      misc.x = aSeed2.y;
      shape = 5.0;
    `,
  },
  smoke: {
    count: 36, radius: 0.08, height: 1.0, blending: NORMAL, mode: BILLBOARD, minPx: 1.0, color: 0xb8bcc4,
    body: /* glsl */ `
      float life = 3.2 + aSeed2.x * 1.5;
      float age = fract(t / life + aSeed.w);
      float hgt = age * uHeight * (0.7 + aSeed2.y * 0.6);
      vec3 curl = vec3(sin(hgt * 4.0 + t * 1.3 + aSeed.x * 6.0), 0.0, cos(hgt * 3.3 + t + aSeed.z * 6.0)) * (0.02 + hgt * 0.16);
      wp = uOrigin + vec3((aSeed.x - 0.5) * uRadius, hgt, (aSeed.z - 0.5) * uRadius) + curl + vec3(uWindV.x, 0.0, uWindV.y) * hgt;
      size = 0.04 + age * 0.45;
      rot = aSeed2.z * 6.28 + t * 0.3 * (aSeed2.w - 0.5);
      vec3 lit = pAmbient(wp) * 1.4 + pDirect(wp) * 0.8;
      col = vec4(uColor * lit, smoothstep(0.0, 0.05, age) * (1.0 - age) * 0.45 * uIntensity);
      misc.x = aSeed2.y;
      shape = 5.0;
    `,
  },
  sparks: {
    count: 48, radius: 0.1, height: 0, blending: ADD, mode: STREAK, minPx: 1.2, color: 0xffb060, streak: 0.045, burstLife: 1.6,
    body: /* glsl */ `
      float life = 0.45 + aSeed2.x * 0.9;
      float age = uBurst > 0.5 ? (t - uStart) - aSeed.w * 0.08 : fract(t / life + aSeed.w) * life;
      if (age < 0.0 || age > life) alive = 0.0;
      vec3 dir = normalize(vec3(aSeed.x * 2.0 - 1.0, aSeed.y * 1.2 - 0.25, aSeed.z * 2.0 - 1.0) + 1e-4);
      vec3 v0 = dir * (1.5 + aSeed2.y * 4.5);
      vec3 g = vec3(0.0, -9.8, 0.0);
      wp = uOrigin + v0 * age + 0.5 * g * age * age;
      vel = v0 + g * age;
      float k = 1.0 - age / life;
      vec3 hot = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.85, 0.55), k * k);
      col = vec4(uColor * hot * (6.0 * k + 0.5) * uIntensity, 1.0);
      size = 0.01 + aSeed2.z * 0.008;
      shape = 0.0;
    `,
  },
  embers: {
    count: 40, radius: 0.25, height: 2.2, blending: ADD, mode: BILLBOARD, minPx: 1.3, color: 0xff7a2a,
    body: /* glsl */ `
      float life = 2.0 + aSeed2.x * 2.0;
      float age = fract(t / life + aSeed.w);
      float hgt = age * uHeight;
      vec3 wob = vec3(sin(t * 2.0 + aSeed.x * 20.0), 0.0, cos(t * 1.7 + aSeed.z * 20.0)) * 0.15 * age;
      wp = uOrigin + vec3((aSeed.x - 0.5) * uRadius, hgt, (aSeed.z - 0.5) * uRadius) + wob + vec3(uWindV.x, 0.0, uWindV.y) * hgt * 0.8;
      float fl = 0.6 + 0.4 * sin(t * 13.0 + aSeed2.y * 30.0);
      col = vec4(uColor * (7.0 * (1.0 - age) * fl) * uIntensity, 1.0);
      size = 0.016 + aSeed2.z * 0.012;
      shape = 0.0;
    `,
  },
  ash: {
    count: 60, radius: 2.5, height: 3, blending: NORMAL, mode: WORLD, minPx: 1.0, color: 0x9a968e,
    body: /* glsl */ `
      float fall = 0.18 + aSeed2.x * 0.2;
      float ph = fract(aSeed.y + t * fall / uHeight);
      vec3 sway = vec3(sin(t * (0.8 + aSeed2.y) + aSeed.w * 20.0), 0.0, cos(t * (0.7 + aSeed2.z) + aSeed.x * 20.0)) * 0.3;
      wp = uOrigin + vec3((aSeed.x * 2.0 - 1.0) * uRadius, uHeight * (1.0 - ph), (aSeed.z * 2.0 - 1.0) * uRadius) + sway + vec3(uWindV.x, 0.0, uWindV.y) * ph * 2.0;
      rot = t * (1.0 + aSeed2.w * 2.0) + aSeed.w * 6.28;
      misc.y = t * (0.6 + aSeed2.x) + aSeed2.y * 6.28;
      size = 0.012 + aSeed2.z * 0.012;
      vec3 lit = pAmbient(wp) * 1.3 + pDirect(wp);
      col = vec4(uColor * lit, smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.9, 1.0, ph)) * 0.9);
      shape = 6.0;
    `,
  },
  drips: {
    count: 30, radius: 1.5, height: 2.5, blending: NORMAL, mode: STREAK, minPx: 0.9, color: 0xc8d4dc, streak: 0.03,
    body: /* glsl */ `
      float period = 1.2 + aSeed2.x * 2.5;
      float tt = mod(t + aSeed.w * period, period);
      float hang = 0.5 + aSeed2.y * 0.6;
      float ft = max(tt - hang, 0.0);
      float y = -0.5 * 9.8 * ft * ft;
      if (-y > uHeight) alive = 0.0;
      wp = uOrigin + vec3((aSeed.x * 2.0 - 1.0) * uRadius, y, (aSeed.z * 2.0 - 1.0) * uRadius * 0.15);
      vel = vec3(0.0, -9.8 * ft - 0.3, 0.0);
      vec3 lit = pAmbient(wp) * 1.4 + pDirect(wp) * 2.0;
      col = vec4(uColor * lit, 0.6);
      size = 0.01 + (tt < hang ? tt / hang * 0.008 : 0.006);
      shape = 2.0;
    `,
  },
  blood: {
    // burst (opts.burst / handle.burst()): droplets + spray thrown along opts.direction with gravity,
    // splatting on groundY. Continuous: thick drips falling from the point (radius = spread).
    count: 70, radius: 0.06, height: 2.0, blending: NORMAL, mode: STREAK, minPx: 1.1, color: 0x8a0a12, streak: 0.03, burstLife: 2.2, gore: true,
    body: /* glsl */ `
      if (uBurst > 0.5) {
        float life = 0.45 + aSeed2.x * 1.0;
        float age = (t - uStart) - aSeed.w * 0.06;
        if (age < 0.0 || age > life + 0.6) alive = 0.0;
        vec3 rnd = normalize(vec3(aSeed.x * 2.0 - 1.0, aSeed.y * 2.0 - 1.0, aSeed.z * 2.0 - 1.0) + 1e-4);
        vec3 dir = normalize(uDir * 1.4 + rnd * 0.85);
        vec3 v0 = dir * (1.0 + aSeed2.y * aSeed2.y * 5.0);
        vec3 g = vec3(0.0, -9.8, 0.0);
        wp = uOrigin + rnd * uRadius + v0 * age + 0.5 * g * age * age;
        vel = v0 + g * age;
        size = 0.004 + aSeed2.z * aSeed2.z * 0.014;
        if (wp.y < uGround) {
          // landed: a flat drop on the ground that fades
          wp.y = uGround + 0.004;
          vel = vec3(0.001, 0.0, 0.0);
          size *= 1.6;
        }
        misc.x = clamp((life + 0.6 - age) / 0.6, 0.0, 1.0);
      } else {
        float period = 0.9 + aSeed2.x * 1.8;
        float tt = mod(t + aSeed.w * period, period);
        float hang = 0.4 + aSeed2.y * 0.5;
        float ft = max(tt - hang, 0.0);
        float y = -0.5 * 9.8 * ft * ft;
        if (-y > uHeight) alive = 0.0;
        wp = uOrigin + vec3((aSeed.x * 2.0 - 1.0) * uRadius, y, (aSeed.z * 2.0 - 1.0) * uRadius);
        vel = vec3(0.0, -9.8 * ft - 0.25, 0.0);
        size = 0.006 + (tt < hang ? tt / hang * 0.006 : 0.004);
        misc.x = 1.0;
      }
      vec3 lit = pAmbient(wp) * 1.3 + pDirect(wp) * 1.8;
      vec3 bc = uColor * (1.0 - uGore * 0.4);
      bc = mix(bc, vec3(dot(bc, vec3(0.3, 0.59, 0.11))) * vec3(1.3, 0.8, 0.8), uGore * 0.5);
      // wet glint in the beam
      col = vec4(bc * lit + vec3(0.9, 0.5, 0.45) * dlbHeadlightColor * dlbHeadlightAt(wp) * 0.8, 0.95 * misc.x);
      shape = 2.0;
    `,
  },
  mist: {
    // rolling ground mist puffs around the camera: drift + slow roll, catch every light
    count: 64, radius: 22, height: 1.2, blending: NORMAL, mode: BILLBOARD, minPx: 1.0, color: 0xffffff, cameraCentred: true, ground: true,
    body: /* glsl */ `
      vec2 box = vec2(uRadius * 2.0);
      vec2 drift = uWindV * t * 0.9 + vec2(t * 0.06, t * 0.035);
      vec2 rel = aSeed.xz * box + drift - uOrigin.xz;
      rel = mod(rel, box) - box * 0.5;
      size = 3.5 + aSeed2.x * 5.0;
      float roll = sin(t * (0.15 + aSeed2.w * 0.2) + aSeed.w * 30.0);
      wp = vec3(uOrigin.x + rel.x, uGround + size * 0.1 + aSeed.y * uHeight + roll * 0.25, uOrigin.z + rel.y);
      rot = aSeed2.z * 6.28 + t * 0.05 * (aSeed2.w - 0.5);
      float dc = length(wp - cameraPosition);
      float fade = smoothstep(1.5, 6.0, dc) * (1.0 - smoothstep(uRadius * 0.55, uRadius, length(rel)));
      vec3 lit = dlbFogTint(normalize(wp - cameraPosition)) * 1.35 + dlbAmbient * 0.25 + pDirect(wp) * 1.4 + dlbFlash * vec3(0.08);
      col = vec4(lit * uColor, (0.07 + aSeed2.y * 0.09) * fade * uIntensity * (0.75 + 0.25 * roll));
      misc.x = aSeed2.y;
      shape = 7.0;
    `,
  },
};

const VERT = (type, def) => /* glsl */ `
#define MODE ${def.mode}
#include <dlb_common>
#include <dlb_globals>
#include <dlb_fog_common>
#include <dlb_headlight>
attribute vec4 aSeed;
attribute vec4 aSeed2;
uniform vec3 uOrigin;
uniform mat4 uFrame;
uniform float uRadius;
uniform float uHeight;
uniform float uGround;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uStart;
uniform float uBurst;
uniform float uActive;
uniform float uCountFrac;
uniform float uMinPx;
uniform float uStreak;
uniform float uViewportH;
uniform vec2 uWindV;
uniform vec2 uGust;   // accumulated gust push (m, xz)
uniform vec3 uDir;    // emitter direction (blood spray)
uniform float uGore;  // 0 full, 1 reduced
uniform float uSpin;  // accumulated spin phase (time that runs faster in gusts)
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vMisc;
varying float vShape;
vec3 pAmbient(vec3 p) { return dlbAmbient * 1.6 + dlbFogTint(normalize(p - cameraPosition)) * 0.9; }
vec3 pDirect(vec3 p) { return dlbHeadlightColor * dlbHeadlightAt(p) * 6.0 + dlbLampLightAt(p) * 1.2; }
void main() {
  float t = dlbTime;
  vec3 wp = uOrigin;
  float size = 0.05;
  vec3 vel = vec3(0.0, -1.0, 0.0);
  float rot = 0.0;
  vec4 col = vec4(1.0);
  vec4 misc = vec4(0.0);
  float alive = 1.0;
  float shape = 0.0;
  {
  ${def.body}
  }
  if (aSeed2.w * 0.0 + fract(aSeed.w * 7.31 + aSeed.x * 3.17) > uCountFrac || alive <= 0.0 || uActive <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float T = dlbFogTransmittance(wp);
#if MODE == 2
  // world-space tumbling quad
  float ca = cos(rot), sa = sin(rot), cb = cos(misc.y), sb = sin(misc.y);
  vec3 ax = vec3(ca, sa * sb, sa * cb);
  vec3 ay = vec3(0.0, cb, -sb);
  vec3 corner = (ax * position.x + ay * position.y * 0.65) * size;
  vec4 mv = viewMatrix * vec4(wp + corner, 1.0);
  float pxPerM = projectionMatrix[1][1] * 0.5 * uViewportH / max(-mv.z, 0.01);
  vec3 nrm = normalize(cross(ax, ay));
  misc.z = abs(dot(nrm, normalize(cameraPosition - wp)));
#else
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float pxPerM = projectionMatrix[1][1] * 0.5 * uViewportH / max(-mv.z, 0.01);
  float sizePx = size * pxPerM;
  if (sizePx < uMinPx) {
    float k = sizePx / uMinPx;
    col.a *= k * k;
    size = uMinPx / pxPerM;
  }
  #if MODE == 1
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    vec2 dir = vv.xy;
    float dl = length(dir);
    dir = dl > 1e-5 ? dir / dl : vec2(0.0, 1.0);
    vec2 side = vec2(-dir.y, dir.x);
    float len = max(length(vel) * uStreak, size * 2.0);
    // perspective: shorten when moving toward / away from camera
    len *= mix(1.0, 0.35, abs(normalize(vv).z));
    mv.xy += dir * position.y * len + side * position.x * size;
  #else
    float c = cos(rot), s = sin(rot);
    mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
  #endif
#endif
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  col.rgb *= T;
  col.a *= uActive * (0.35 + 0.65 * T);
  vCol = col;
  vMisc = misc;
  vShape = shape;
}
`;

const FRAG = /* glsl */ `
#include <dlb_common>
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vMisc;
varying float vShape;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = 0.0;
  int sh = int(vShape + 0.5);
  if (sh == 0) {
    // soft glowing dot
    float r2 = dot(p, p);
    a = exp(-r2 * 5.0) + exp(-r2 * 30.0);
    a *= 1.0 - smoothstep(0.7, 1.0, r2);
  } else if (sh == 1) {
    // moth: two flapping wings
    float flap = 0.35 + 0.65 * vMisc.x;
    vec2 q = vec2(abs(p.x) / flap, p.y);
    float wing = 1.0 - smoothstep(0.55, 0.8, length((q - vec2(0.45, 0.05)) * vec2(1.0, 1.5)));
    float body = 1.0 - smoothstep(0.08, 0.16, length(p * vec2(3.0, 0.9)));
    a = max(wing * 0.85, body);
  } else if (sh == 2) {
    // streak (rain / drips): thin bright core along the length
    float x = abs(p.x);
    a = (1.0 - smoothstep(0.0, 1.0, x)) * smoothstep(1.0, 0.2, abs(p.y));
  } else if (sh == 3) {
    // splash crown ring
    float r = length(p);
    a = smoothstep(0.45, 0.75, r) * (1.0 - smoothstep(0.8, 1.0, r)) * (0.6 + 0.4 * step(0.5, fract(atan(p.y, p.x) * 1.6)));
  } else if (sh == 4) {
    // painted leaf: pointed blade with a slightly ragged edge, midrib, veins, stem, dark rim
    vec2 q = p;
    float rnd = vMisc.w;
    float w = (1.0 - q.y * q.y) * 0.55 * (1.0 - 0.12 * rnd * (0.5 + 0.5 * sin(q.y * 11.0 + rnd * 40.0)));
    float ax = abs(q.x);
    bool stem = ax < 0.035 && q.y < -0.6;
    if (!stem && ax > w) discard;
    float rimD = smoothstep(w * 0.6, w, ax);
    float rib = 1.0 - smoothstep(0.0, 0.045, ax);
    float veins = smoothstep(0.8, 1.0, sin((q.y - ax * 1.1) * 20.0 + rnd * 6.0)) * (1.0 - rimD);
    float spots = step(0.7, rnd) * smoothstep(0.55, 0.75, dlbNoise2(q * 4.0 + rnd * 17.0));
    vec3 c = vCol.rgb * (0.55 + 0.45 * vMisc.z);
    c *= (1.0 - rimD * 0.3) * (1.0 + rib * 0.3 + veins * 0.18) * (1.0 - spots * 0.45);
    if (stem) c = vCol.rgb * 0.6;
    gl_FragColor = vec4(c, vCol.a);
    return;
  } else if (sh == 5 || sh == 7) {
    // smoke / mist puff: noisy soft blob
    vec2 q = sh == 7 ? p * vec2(1.0, 2.2) : p;
    float r = length(q);
    float n = dlbNoise2(p * 2.2 + vMisc.x * 37.0) * 0.6 + dlbNoise2(p * 5.1 + vMisc.x * 11.0) * 0.4;
    a = (1.0 - smoothstep(0.1, 1.0, r)) * (0.35 + 1.0 * n);
    a *= a;
    if (sh == 7) a *= smoothstep(-0.9, -0.1, p.y) * 1.6;
  } else {
    // ash flake
    a = 1.0 - smoothstep(0.5, 1.0, max(abs(p.x), abs(p.y) * 1.3));
  }
  gl_FragColor = vec4(vCol.rgb, vCol.a * clamp(a, 0.0, 4.0));
}
`;

class Emitter {
  constructor(sys, type, opts) {
    const def = TYPES[type];
    this.sys = sys;
    this.type = type;
    this.def = def;
    this.opts = opts;
    this.active = opts.active !== false;
    this.intensity = opts.intensity ?? 1;
    this.position = new THREE.Vector3();
    if (opts.position) this.position.copy(opts.position);
    this.follow = opts.follow || opts.object || null;
    this.offset = opts.offset ? opts.offset.clone() : new THREE.Vector3();
    this.cameraCentred = !!def.cameraCentred && !opts.position && !this.follow;
    this.baseCount = Math.max(1, Math.round(opts.count ?? def.count));
    this.capacity = Math.ceil(this.baseCount * 1.35);
    const rng = makeRng((opts.seed ?? 1000 + (sys._seedCounter = (sys._seedCounter || 0) + 1) * 7919) >>> 0);
    const s1 = new Float32Array(this.capacity * 4), s2 = new Float32Array(this.capacity * 4);
    for (let i = 0; i < s1.length; i++) {
      s1[i] = rng();
      s2[i] = rng();
    }
    // own quad buffers per emitter: disposing one emitter must not free GL buffers that
    // other emitters still use
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s1, 4));
    g.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4));
    g.instanceCount = this.capacity;
    this.uniforms = injectGlobals({
      uOrigin: { value: new THREE.Vector3() },
      uFrame: { value: new THREE.Matrix4() },
      uRadius: { value: opts.radius ?? def.radius },
      uHeight: { value: opts.height ?? def.height },
      uGround: { value: opts.groundY ?? 0 },
      uColor: { value: new THREE.Color(opts.color ?? def.color) },
      uIntensity: { value: this.intensity },
      uStart: { value: GLOBAL_UNIFORMS.uTime.value },
      uBurst: { value: opts.burst ? 1 : 0 },
      uActive: { value: this.active ? 1 : 0 },
      uCountFrac: { value: 1 },
      uMinPx: { value: def.minPx ?? 1 },
      uStreak: { value: def.streak ?? 0.03 },
      uViewportH: { value: 1080 },
      uWindV: { value: new THREE.Vector2() },
      uGust: { value: new THREE.Vector2() },
      uDir: { value: (opts.direction ? opts.direction.clone() : new THREE.Vector3(0, 1, 0)).normalize() },
      uGore: GORE_UNIFORM,
      uSpin: { value: GLOBAL_UNIFORMS.uTime.value },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT(type, def), fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: def.blending, fog: false, side: THREE.DoubleSide,
    });
    this.object = new THREE.Mesh(g, mat);
    this.object.name = 'particles:' + type;
    this.object.frustumCulled = false;
    this.object.renderOrder = def.blending === ADD ? 30 : 25;
    this._activeTarget = this.active ? 1 : 0;
    this.burstAge = 0;
    this.groundFromCamera = def.ground && opts.groundY === undefined;
    this.applyQuality();
  }
  applyQuality() {
    const q = Math.max(0.05, Math.min(1.35, settings.get('particles') ?? 1));
    this.object.geometry.instanceCount = Math.min(this.capacity, Math.max(1, Math.round(this.baseCount * q)));
  }
  update(dt, camera) {
    const u = this.uniforms;
    if (this.follow) {
      this.follow.updateWorldMatrix?.(true, false);
      this.position.copy(this.offset).applyMatrix4(this.follow.matrixWorld);
      u.uFrame.value.copy(this.follow.matrixWorld);
      if (this.offset.lengthSq() > 0) u.uFrame.value.multiply(_m.makeTranslation(this.offset.x, this.offset.y, this.offset.z));
    } else if (this.cameraCentred) {
      // centre the volume a little ahead of the camera so more of it is in view
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      const lead = this.def.lead ?? 0;
      if (lead > 0 && _fwd.lengthSq() > 1e-6) _fwd.normalize().multiplyScalar(lead * this.uniforms.uRadius.value);
      else _fwd.set(0, 0, 0);
      this.position.copy(camera.position).add(_fwd);
    }
    u.uOrigin.value.copy(this.position);
    if (!this.follow) u.uFrame.value.makeTranslation(this.position.x, this.position.y, this.position.z);
    if (this.groundFromCamera) u.uGround.value = camera.position.y - 1.6;
    else if (this.type === 'blood' && this.opts.groundY === undefined) u.uGround.value = this.position.y - 1.1;
    const W = GLOBAL_UNIFORMS;
    u.uWindV.value.copy(W.uWindDir.value).multiplyScalar(W.uWindStrength.value);
    // gusts (intensity > 1): integrate a downwind push + faster spin so nothing pops
    const gust = Math.max(0, this.intensity - 1);
    u.uSpin.value = (u.uSpin.value + dt * (1 + gust * 2.5)) % 10000;
    if (gust > 0) {
      const push = dt * gust * (1.5 + W.uWindStrength.value * 4);
      u.uGust.value.x = (u.uGust.value.x + W.uWindDir.value.x * push) % 1000;
      u.uGust.value.y = (u.uGust.value.y + W.uWindDir.value.y * push) % 1000;
    }
    // active fade
    const a = u.uActive.value;
    u.uActive.value = a + (this._activeTarget - a) * Math.min(1, dt * 3);
    let frac = 1;
    if (this.def.intensityUniform) frac = Math.min(1, W[this.def.intensityUniform].value * this.intensity);
    else if (this.def.countByIntensity) frac = Math.min(1, Math.max(0, this.intensity));
    if (this.def.gore && GORE_UNIFORM.value > 0.5) frac *= 0.45;
    u.uCountFrac.value = frac;
    u.uIntensity.value = this.intensity;
    // distance cull
    const far = (u.uRadius.value + 70);
    const vis = u.uActive.value > 0.001 && frac > 0.001 && (this.cameraCentred || this.position.distanceToSquared(camera.position) < far * far);
    this.object.visible = vis;
    if (this.opts.burst) {
      this.burstAge += dt;
      if (this.burstAge > (this.def.burstLife ?? 2)) this.object.visible = false;
    }
  }
}
const _m = new THREE.Matrix4();
const _fwd = new THREE.Vector3();

class Particles {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'particles';
    this.emitters = new Set();
    this.types = Object.keys(TYPES);
    settings.onChange(({ key }) => {
      if (key === 'particles' || key === 'graphicsPreset' || key === '*') for (const e of this.emitters) e.applyQuality();
    });
    this._vh = 1080;
  }
  /**
   * Spawn an emitter. type: 'fireflies'|'moths'|'mosquitoes'|'rain'|'dust'|'pollen'|'leaves'|'incense'|'smoke'|
   *   'sparks'|'mist'|'headlightBugs'|'ash'|'drips'|'splash'|'embers'|'spores'|'blood'
   * opts: { position?: Vector3, object?: Object3D, offset?: Vector3, radius?, count?, color?, follow?: Object3D, burst?: bool, intensity? }
   * Extra opts: height, groundY (splash / mist / blood plane), seed, active, autoDispose (burst emitters),
   *   direction (Vector3, blood spray direction; default up).
   *   blood: burst:true = spray + droplets with gravity (re-trigger with handle.burst(pos)); otherwise drips
   *   from the point. settings.gore = 'reduced' -> darker, greyer, sparser.
   *   Camera-centred types (rain, splash, dust, pollen, spores, mist) follow the camera when no position/object is given.
   *   dust / pollen / spores are only visible where light hits them (headlight cone, lamps, dawn sun).
   *   leaves: setIntensity(v) — v < 1 thins the fall, v > 1 is a gust (push downwind + faster tumble).
   *   moths: position = a lamp (orbit it) or a canopy point with a bigger radius / height.
   *   headlightBugs: pass `object` = the vehicle (bugs swarm in front of its -Z).
   * Returns handle { object, setActive(bool), setIntensity(v), setPosition(v), dispose() } (+ burst(), type).
   */
  emit(type, opts = {}) {
    if (!TYPES[type]) {
      console.warn('[particles] unknown type', type);
      type = 'dust';
    }
    const e = new Emitter(this, type, opts);
    this.emitters.add(e);
    this.group.add(e.object);
    const sys = this;
    const h = {
      object: e.object,
      type,
      emitter: e,
      setActive(b) {
        e.active = !!b;
        e._activeTarget = b ? 1 : 0;
      },
      setIntensity(v) {
        e.intensity = v;
      },
      setPosition(v) {
        if (e.follow) e.offset.copy(v);
        else {
          e.position.copy(v);
          e.cameraCentred = false;
        }
      },
      /** Spray direction (blood). */
      setDirection(v) {
        e.uniforms.uDir.value.copy(v).normalize();
      },
      /** Re-trigger a burst (sparks, blood) now. */
      burst(pos) {
        if (pos) e.position.copy(pos);
        e.uniforms.uStart.value = GLOBAL_UNIFORMS.uTime.value;
        e.burstAge = 0;
        e.opts.burst = true;
        e.uniforms.uBurst.value = 1;
      },
      dispose() {
        sys.emitters.delete(e);
        sys.group.remove(e.object);
        e.object.geometry.dispose();
        e.object.material.dispose();
      },
    };
    e.handle = h;
    return h;
  }
  update(dt, camera) {
    for (const e of this.emitters) {
      e.uniforms.uViewportH.value = this._vh;
      e.update(dt, camera);
      if (e.opts.burst && e.opts.autoDispose && e.burstAge > (e.def.burstLife ?? 2)) e.handle.dispose();
    }
  }
  setViewportHeight(h) {
    this._vh = h;
  }
}

export const particles = new Particles();
