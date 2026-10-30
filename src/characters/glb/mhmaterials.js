// Materials for the MakeHuman characters (one draw call for skin + clothes + hair + brows + lashes +
// teeth + tongue + wet-hair veil, one for the eyes). Built on render's skinMaterial / paintedMaterial
// (fog, wetness, painterly grading, wrap lighting) and patched with:
//   * compact expression morphs: 20 channels (ARKit face units + the ghost "uncanny") fetched from a
//     per-person float texture (only face / proxy vertices have rows), applied in bind space
//   * per-part shading (vertex attribute apart): 0 skin (MakeHuman photo skin tinted to the Thai skin
//     tone; stubble / moustache, moles and scars, forehead lines, oily T-zone, sweat sheen), 1 clothes
//     (procedural atlas + mask: cut-outs, sequins, roughness), 2 hair cards (grey + alpha, tinted,
//     thinning / balding / wet), 3 brows, 4 lashes, 5 teeth, 6 tongue, 8 wet-hair veil over the face
//   * ghost skin: grey-white pallor, veins, bloodless lips, dark sockets, wet sheen, decay, blood
//     stains; animated gore (bleeding eyes / mouth, wounds) and the crushed face, as in materials.js
//   * the post-skin neck twist shared with the eyes and accessories
import * as THREE from 'three';
import { skinMaterial, paintedMaterial } from '../../render/index.js';

export const MORPH_CHANNELS = [
  'blinkL', 'blinkR', 'wideL', 'wideR', 'squintL', 'squintR', 'lidsDown', 'lidsUp', 'browInnerUp', 'browDown',
  'browOuterUp', 'jawOpen', 'smileL', 'smileR', 'frown', 'stretch', 'pucker', 'sneer', 'lowerDown', 'uncanny',
];
export const NCH = MORPH_CHANNELS.length;
export const MORPH_TEX_W = 4096;

/** Uniform block of one MakeHuman character (shared by its body, eyes and accessories). */
export function makeMHUniforms(t, P) {
  const e = t.eyes;
  const f = t.face;
  return {
    uFat: { value: 0 },
    uFaceA: { value: new THREE.Vector4() }, // jaw, smile, frown, mouthStretch
    uFaceB: { value: new THREE.Vector4() }, // browRaise, browFurrow, browSad, creepy
    uEye: { value: new THREE.Vector4(1, 1, 0, 0) },
    uEyeShape: { value: new THREE.Vector4(0.0128, 0.0052, 0.0036, 0.06) },
    uGhost: { value: new THREE.Vector4() }, // pale, sockets, wet, black eyes
    uGhost2: { value: new THREE.Vector4() }, // veins, pupils (-1 pinprick .. 1 dilated), decay, eye style (0 normal 1 black 2 glow 3 milky)
    uLmEyeL: { value: e[0].clone() },
    uLmEyeR: { value: e[1].clone() },
    uLmEyeC: { value: [t.eyeCenters[0].clone(), t.eyeCenters[1].clone()] },
    uLmMouth: { value: new THREE.Vector3(f.mouthHalfW, f.mouth.y, f.mouth.z) },
    uLmJaw: { value: new THREE.Vector4(e[0].y - 0.035, t.Gp[t.index.Head].z + 0.005, f.chinY, 0) },
    uLmNose: { value: new THREE.Vector4(f.noseTip.x, f.noseTip.y, f.noseTip.z, f.browY) },
    uLmTop: { value: f.top.clone() },
    uLmNeck: { value: new THREE.Vector4(0, t.Gp[t.index.neck_01].y + 0.04, t.Gp[t.index.neck_01].z + 0.012, 0.058) },
    uTwistO: { value: new THREE.Vector4() },
    uTwistD: { value: new THREE.Vector4(0, 1, 0, 0.12) },
    uGore: { value: new THREE.Vector4() },
    uGoreW: { value: new THREE.Vector4() },
    uCrush: { value: 0 },
    uFaceMap: { value: null },
    uMaskMap: { value: null },
    uTime: { value: 0 },
    uMorphTex: { value: P ? P.morphTex : null },
    uMorphW: { value: new Float32Array(NCH) },
    uSkinMap: { value: null },
    uHairMap: { value: null },
    uPartsMap: { value: null },
    uSkinTint: { value: new THREE.Vector3(1, 1, 1) },
    uSkinCol: { value: new THREE.Color(0.5, 0.3, 0.2) }, // target skin colour (linear)
    uHairCol: { value: new THREE.Color(0.02, 0.018, 0.016) },
    uLook: { value: new THREE.Vector4() }, // stubble, hair thinning, balding, sweat
    uLook2: { value: new THREE.Vector4() }, // old (0..1), moustache, male (0/1), forehead lines
    uVeil: { value: new THREE.Vector4(0, 0, 0, 0) }, // amount, gap centre x, gap half width, -
    uStain: { value: new THREE.Vector4() }, // blood stains, decay, dirt, -
    uMarks: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, // xyz, radius (>0 mole, <0 scar)
  };
}

// --------------------------------------------------------------------------------------- shared GLSL
const VERT = /* glsl */ `
attribute float apart;
attribute float amask;
attribute float amorph;
uniform sampler2D uMorphTex;
uniform float uMorphW[${NCH}];
uniform vec4 uTwistO, uTwistD;
uniform float uCrush;
uniform vec3 uLmEyeL, uLmEyeR, uLmMouth;
varying vec3 vBind;
varying float vPart;
varying vec4 vMaskV;
varying vec2 vMhUv;
vec3 mhMorph() {
  if (amorph < -0.5) return vec3(0.0);
  vec3 d = vec3(0.0);
  int base = int(amorph + 0.5) * ${NCH};
  for (int i = 0; i < ${NCH}; i++) {
    float w = uMorphW[i];
    if (abs(w) > 0.001) {
      int k = base + i;
      d += w * texelFetch(uMorphTex, ivec2(k % ${MORPH_TEX_W}, k / ${MORPH_TEX_W}), 0).xyz;
    }
  }
  return d;
}
vec3 glbCrushD(vec3 p) {
  vec3 c = vec3(-0.055, uLmEyeL.y + 0.02, uLmEyeL.z - 0.045);
  float w = exp(-dot(p - c, p - c) / (2.0 * 0.03 * 0.03));
  vec3 n = normalize(p - vec3(0.0, uLmEyeL.y, uLmEyeL.z - 0.07));
  vec3 d = -n * 0.016 * w;
  d.z -= 0.006 * exp(-pow(p.x / 0.012, 2.0) - pow((p.y - uLmMouth.y - 0.035) / 0.012, 2.0));
  d.x += 0.003 * exp(-pow(p.x / 0.012, 2.0) - pow((p.y - uLmMouth.y - 0.035) / 0.014, 2.0));
  return d * uCrush;
}
vec3 glbTwist(vec3 p) {
  if (abs(uTwistO.w) < 1e-4) return p;
  vec3 a = uTwistD.xyz;
  vec3 r = p - uTwistO.xyz;
  float h = dot(r, a) / uTwistD.w;
  float w = smoothstep(0.15, 1.0, h) * (1.0 - smoothstep(0.16, 0.24, length(r - a * dot(r, a))) * (1.0 - smoothstep(0.9, 1.3, h)));
  float an = uTwistO.w * w;
  float c = cos(an), s = sin(an);
  vec3 rr = r * c + cross(a, r) * s + a * dot(a, r) * (1.0 - c);
  return uTwistO.xyz + rr;
}
vec3 glbTwistN(vec3 n, vec3 p) {
  if (abs(uTwistO.w) < 1e-4) return n;
  vec3 a = uTwistD.xyz;
  vec3 r = p - uTwistO.xyz;
  float h = dot(r, a) / uTwistD.w;
  float an = uTwistO.w * smoothstep(0.15, 1.0, h);
  float c = cos(an), s = sin(an);
  return n * c + cross(a, n) * s + a * dot(a, n) * (1.0 - c);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMaskMap;
uniform sampler2D uSkinMap;
uniform sampler2D uHairMap;
uniform sampler2D uPartsMap;
uniform vec3 uSkinTint;
uniform vec3 uSkinCol;
uniform vec3 uHairCol;
uniform vec4 uLook, uLook2, uVeil, uStain;
uniform vec4 uMarks[4];
uniform vec4 uFaceA, uFaceB, uEye, uGhost, uGhost2;
uniform vec3 uLmEyeL, uLmEyeR, uLmMouth, uLmTop;
uniform vec4 uLmJaw, uLmNose;
uniform vec4 uGore, uGoreW, uLmNeck;
uniform float uTime;
varying vec3 vBind;
varying float vPart;
varying vec4 vMaskV;
varying vec2 vMhUv;
float glbSkin = 0.0;
float glbSeq = 0.0;
float glbBloodWet = 0.0;
float mhRough = 0.6;
float mhBumpH = 0.0;
float mhHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float mhHash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float mhNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(mhHash3(i), mhHash3(i + vec3(1, 0, 0)), f.x), mix(mhHash3(i + vec3(0, 1, 0)), mhHash3(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(mhHash3(i + vec3(0, 0, 1)), mhHash3(i + vec3(1, 0, 1)), f.x), mix(mhHash3(i + vec3(0, 1, 1)), mhHash3(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
float glbHash(vec2 p) { return mhHash(p); }
float glbRun(vec3 p, float x0, float y0, float halfW, float len, float seed) {
  float dy = y0 - p.y;
  if (dy < -0.003 || dy > len + 0.012 || len <= 0.0005) return 0.0;
  float wob = sin(p.y * 83.0 + seed * 7.0) * 0.0012 + sin(p.y * 29.0 + seed * 3.0) * 0.0022;
  float dx = p.x - x0 - wob;
  float k = clamp(dy / len, 0.0, 1.0);
  float w = halfW * (1.0 - 0.55 * k) * (0.8 + 0.4 * sin(p.y * 160.0 + seed));
  float core = (1.0 - smoothstep(w * 0.55, w, abs(dx))) * (1.0 - smoothstep(len - 0.003, len + 0.002, dy));
  float drop = 1.0 - smoothstep(w * 1.0, w * 1.5, length(vec2(dx, dy - len)));
  return max(core, drop) * smoothstep(-0.003, 0.001, dy);
}
float glbGoreAmt(vec3 p) {
  float b = 0.0;
  float red = uGore.w > 0.5 ? 0.55 : 1.0;
  float eyes = uGore.x * red, mouth = uGore.y * red, wound = uGore.z * red;
  if (eyes > 0.001 && p.z > uLmEyeL.z - 0.03) {
    for (int s = 0; s < 2; s++) {
      float sx = s == 0 ? 1.0 : -1.0;
      vec3 e = s == 0 ? uLmEyeL : uLmEyeR;
      b = max(b, glbRun(p, e.x - sx * 0.002, e.y - 0.006, 0.0021, 0.075 * eyes, 1.0 + sx));
      b = max(b, glbRun(p, e.x + sx * 0.004, e.y - 0.007, 0.0014, 0.05 * eyes * eyes, 3.0 + sx));
    }
  }
  if (mouth > 0.001 && p.z > uLmMouth.z - 0.06) {
    b = max(b, glbRun(p, 0.005, uLmMouth.y + 0.002, 0.0016, 0.03 * mouth, 5.0));
    b = max(b, glbRun(p, -0.006, uLmMouth.y + 0.002, 0.0013, 0.022 * mouth, 6.0));
    b = max(b, glbRun(p, 0.011, uLmMouth.y - 0.004, 0.0028, 0.11 * mouth, 7.0));
    b = max(b, glbRun(p, -0.004, uLmMouth.y - 0.004, 0.0022, 0.08 * mouth, 8.0));
    b = max(b, glbRun(p, -0.015, uLmMouth.y - 0.004, 0.0018, 0.13 * mouth * mouth, 9.0));
  }
  if (wound > 0.001) {
    int type = int(uGoreW.w + 0.5);
    if (type == 1) {
      vec2 q = vec2(p.x, p.z - uLmNeck.z);
      float ang = atan(q.x, q.y);
      float front = 1.0 - smoothstep(1.7, 2.3, abs(ang));
      float gy = uLmNeck.y + 0.006 * sin(ang * 2.0);
      float gash = (1.0 - smoothstep(0.0012, 0.0012 + 0.004 * wound, abs(p.y - gy))) * front * step(length(q), uLmNeck.w + 0.05);
      b = max(b, gash);
      float col = floor(ang * 9.0);
      float h1 = glbHash(vec2(col, 3.1)), h2 = glbHash(vec2(col, 7.7));
      float cx = (col + 0.3 + h2 * 0.4) / 9.0;
      float da = (ang - cx) * max(0.05, length(q));
      float len = wound * (0.06 + h1 * h1 * 0.55) * front;
      vec3 pp = vec3(da, p.y, 0.0);
      b = max(b, glbRun(pp, 0.0, gy - 0.002, 0.0035 + h2 * 0.004, len, col));
      b = max(b, (1.0 - smoothstep(0.0, 0.03 + 0.05 * wound, gy - p.y)) * step(p.y, gy) * front * wound * 0.85 * smoothstep(0.02, 0.0, abs(da) - 0.02 - 0.05 * wound));
    } else {
      vec3 c = uGoreW.xyz;
      float r0 = (type == 2 ? 0.012 : 0.03) * (0.4 + wound);
      b = max(b, 1.0 - smoothstep(r0 * 0.6, r0, length((p - c).xy)));
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        b = max(b, glbRun(p, c.x + (fi - 2.0) * r0 * 0.45, c.y - r0 * 0.5, 0.0025, wound * (0.05 + glbHash(vec2(fi, 2.0)) * 0.18), fi + 11.0));
      }
    }
  }
  return clamp(b, 0.0, 1.0);
}
// face region masks (bind space, relative to the measured landmarks)
float mhFront(vec3 p) { return smoothstep(uLmJaw.y - 0.035, uLmJaw.y + 0.01, p.z); }
float mhBeard(vec3 p) {
  float below = 1.0 - smoothstep(uLmNose.y - 0.016, uLmNose.y - 0.006, p.y);
  float above = smoothstep(uLmJaw.z - 0.045, uLmJaw.z - 0.012, p.y);
  float side = 1.0 - smoothstep(0.052, 0.07, abs(p.x));
  // cheeks: up to the cheekbones at the sides
  float cheek = (1.0 - smoothstep(uLmMouth.y + 0.01, uLmMouth.y + 0.035, p.y)) * smoothstep(0.03, 0.05, abs(p.x));
  float m = max(below, cheek * 0.8) * above * side * mhFront(p);
  return m * (1.0 - vMaskV.x);
}
float mhMoustache(vec3 p) {
  float band = smoothstep(uLmMouth.y + 0.003, uLmMouth.y + 0.007, p.y) * (1.0 - smoothstep(uLmNose.y - 0.016, uLmNose.y - 0.01, p.y));
  float w = 1.0 - smoothstep(uLmMouth.x * 0.75, uLmMouth.x * 1.05, abs(p.x));
  return band * w * mhFront(p) * (1.0 - vMaskV.x * 0.8);
}
`;

const FRAG_MAP = /* glsl */ `
{
  vec2 uv = vMhUv;
  int part = int(vPart + 0.5);
  vec3 c = vec3(1.0);
  float alpha = 1.0;
  vec3 p = vBind;
  if (part == 0) {
    // ---------------- skin: MakeHuman photo skin, tinted to the character's tone
    c = texture2D(uSkinMap, uv).rgb * uSkinTint;
    glbSkin = 1.0;
    float headF = vMaskV.w;
    // scalp of shaved / balding heads: skin with a blue-grey stubble shadow instead of the painted hair
    float scalp = vMaskV.y * max(uLook.z, step(0.5, uLook.y) * 0.5);
    c = mix(c, uSkinCol * (0.92 + 0.16 * mhNoise(p * 120.0)), scalp * 0.8);
    // stubble / moustache (sharp dots, never blur)
    float beard = mhBeard(p) * uLook.x + mhMoustache(p) * uLook2.y + vMaskV.y * uLook.z * 0.6;
    if (beard > 0.001) {
      vec3 cell = floor(p * 1500.0);
      float dot1 = step(0.52, mhHash3(cell)) * (1.0 - smoothstep(0.25, 0.45, length(fract(p * 1500.0) - 0.5)));
      vec3 hc = mix(uHairCol, vec3(0.45, 0.42, 0.4), 0.15);
      c = mix(c, c * vec3(0.78, 0.8, 0.84), clamp(beard, 0.0, 1.0) * 0.35);
      c = mix(c, hc, clamp(dot1 * beard * 0.85, 0.0, 1.0));
    }
    // moles and scars
    for (int i = 0; i < 4; i++) {
      vec4 m = uMarks[i];
      if (m.w > 0.0) {
        float d = length(p - m.xyz);
        c = mix(c, c * vec3(0.32, 0.24, 0.2), 1.0 - smoothstep(m.w * 0.6, m.w, d));
      } else if (m.w < 0.0) {
        vec3 q = p - m.xyz;
        float d = length(vec2(q.x * 2.4 - q.y * 0.6, q.y * 0.18));
        float sc = (1.0 - smoothstep(-m.w * 0.05, -m.w * 0.12, d)) * step(abs(q.y), -m.w) * step(abs(q.z), 0.02);
        c = mix(c, c * vec3(1.18, 0.98, 0.95), sc * 0.7);
        mhBumpH -= sc * 0.0004;
      }
    }
    // forehead lines and crow's feet with age (bump only)
    float old = uLook2.x;
    if (old > 0.0 && headF > 0.5) {
      float fh = smoothstep(uLmNose.w + 0.012, uLmNose.w + 0.02, p.y) * (1.0 - smoothstep(uLmNose.w + 0.05, uLmNose.w + 0.065, p.y)) * (1.0 - smoothstep(0.035, 0.055, abs(p.x)));
      mhBumpH += fh * old * 0.00025 * sin((p.y - uLmNose.w) * 700.0 + sin(p.x * 90.0) * 1.5) * mhFront(p);
      for (int s = 0; s < 2; s++) {
        vec3 e = s == 0 ? uLmEyeL : uLmEyeR;
        vec2 q = p.xy - e.xy;
        float outer = smoothstep(0.012, 0.02, q.x * (s == 0 ? 1.0 : -1.0)) * (1.0 - smoothstep(0.022, 0.034, length(q)));
        mhBumpH += outer * old * 0.0002 * sin(atan(q.y, abs(q.x)) * 38.0);
      }
    }
    // roughness: oily T-zone, lips, sweat
    float tz = (1.0 - smoothstep(0.012, 0.03, abs(p.x))) * smoothstep(uLmMouth.y + 0.01, uLmNose.y, p.y) * headF;
    mhRough = mix(0.58, 0.4, tz);
    mhRough = mix(mhRough, 0.34, vMaskV.x);
    mhRough *= 1.0 - 0.45 * uLook.w;
    // subtle skin micro relief (orange peel / pores, about 1 mm)
    mhBumpH += (mhNoise(p * 900.0) - 0.5) * 0.00006 + (mhNoise(p * 260.0) - 0.5) * 0.00008;
  } else if (part == 1) {
    // ---------------- clothes: procedural atlas (layout.js), mask: g roughness, b cut-outs / sequins
    vec4 tex = texture2D(map, uv);
    vec4 mk = texture2D(uMaskMap, uv);
    if (mk.b > 0.75) discard;
    glbSeq = step(0.3, mk.b) * step(mk.b, 0.7);
    c = tex.rgb;
    mhRough = max(0.06, mk.g);
    mhRough = mix(mhRough, 0.28, glbSeq);
    mhBumpH += (mhNoise(p * 700.0) - 0.5) * 0.00005;
  } else if (part == 2 || part == 3 || part == 4) {
    // ---------------- hair cards / brows / lashes: grey + alpha, tinted
    vec4 t = part == 2 ? texture2D(uHairMap, uv) : texture2D(uPartsMap, uv);
    alpha = t.a;
    if (part == 2) {
      // thinning (old age) and balding crown / receding temples
      float th = uLook.y;
      if (th > 0.0 && mhHash(floor(uv * vec2(900.0, 60.0))) < th * 0.85) discard;
      float bald = uLook.z;
      if (bald > 0.0) {
        float dc = length((p - uLmTop).xz);
        if (p.y > uLmTop.y - 0.075 && dc < 0.07 * bald + 0.02 * (bald - 0.5)) discard;
        if (p.z > uLmTop.z + 0.035 + 0.05 * (1.0 - bald) && p.y > uLmTop.y - 0.06) discard;
      }
      float lum = t.r / 0.31;
      c = uHairCol * clamp(lum, 0.0, 2.2);
      mhRough = 0.42;
    } else if (part == 3) {
      c = mix(uHairCol, vec3(0.012, 0.01, 0.009), 0.35 * (1.0 - uLook2.x)) * clamp(t.r / 0.31, 0.0, 2.0);
      mhRough = 0.6;
    } else {
      c = vec3(0.012, 0.01, 0.009) * clamp(t.r / 0.31, 0.0, 2.0);
      mhRough = 0.5;
    }
    float wet = uGhost.z;
    c *= 1.0 - 0.45 * wet;
    mhRough = mix(mhRough, 0.18, wet);
  } else if (part == 5 || part == 6) {
    c = texture2D(uPartsMap, uv).rgb;
    if (part == 5) {
      c *= mix(vec3(1.0), vec3(0.95, 0.85, 0.62), uLook2.x * 0.8);
      c = mix(c, vec3(dot(c, vec3(0.33))) * vec3(0.8, 0.82, 0.86), uGhost.x * 0.6);
    }
    mhRough = part == 5 ? 0.3 : 0.35;
  } else if (part == 9) {
    // ---------------- our combed-back hair and bun: wide ribbons of procedural strands
    float K = 64.0;
    float k = floor(uv.x * K);
    float a = fract(uv.x * K);
    float col = floor(a * 40.0);
    float h = mhHash(vec2(col, k));
    float edge = 1.0 - smoothstep(0.38, 0.5, abs(a - 0.5));
    alpha = max(edge, step(0.35, h) * step(abs(a - 0.5), 0.5));
    float streak = 0.72 + 0.28 * h + 0.12 * sin(uv.y * 40.0 + h * 6.0);
    c = uHairCol * streak * (0.85 + 0.3 * smoothstep(0.0, 0.6, uv.y));
    mhRough = 0.34;
    c *= 1.0 - 0.45 * uGhost.z;
    mhRough = mix(mhRough, 0.18, uGhost.z);
  } else if (part == 8) {
    // ---------------- wet hair hanging over the face: procedural clumped strands
    float K = 26.0;
    float k = floor(uv.x * K);
    float a = fract(uv.x * K);
    float vv = uv.y;
    float amt = uVeil.x;
    if (amt < 0.01 || mhHash(vec2(k, 4.1)) > amt * 1.2 || vv > amt * 1.25) discard;
    if (uVeil.z > 0.0 && abs(p.x - uVeil.y) < uVeil.z && vv > 0.08) discard;
    float w = 1.0 - vv * 0.55;
    float strands = step(0.42, mhHash(vec2(floor(a * 22.0), k))) * step(abs(a - 0.5), 0.5 * w);
    float core = 1.0 - smoothstep(0.18 * w, 0.32 * w, abs(a - 0.5));
    alpha = max(strands, core);
    c = uHairCol * (0.55 + 0.4 * mhHash(vec2(floor(a * 30.0), k)));
    mhRough = 0.16;
  }
  if (part == 0) {
    // ---------------- ghost skin: pallor, veins, bloodless lips, dark sockets, decay, blood stains
    float pale = uGhost.x;
    if (pale > 0.0) {
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 pc = vec3(l) * vec3(0.84, 0.92, 0.98) * 1.45 + vec3(0.02, 0.024, 0.03);
      c = mix(c, pc, pale);
      // lips lose their blood: grey-violet
      c = mix(c, vec3(l) * vec3(0.78, 0.74, 0.86) * 1.2, vMaskV.x * pale * 0.85);
    }
    float veins = uGhost2.x;
    if (veins > 0.0) {
      float n1 = mhNoise(p * 38.0) + 0.5 * mhNoise(p * 81.0);
      float ridge = 1.0 - abs(n1 / 1.5 * 2.0 - 1.0);
      float n2 = mhNoise(p * 140.0 + 3.7);
      float ridge2 = 1.0 - abs(n2 * 2.0 - 1.0);
      float v = pow(ridge, 26.0) * 0.9 + pow(ridge2, 34.0) * 0.5;
      // stronger at the temples, neck, chest and inner arms
      float where = 0.55 + 0.45 * smoothstep(0.03, 0.06, abs(p.x)) * vMaskV.w + 0.4 * (1.0 - vMaskV.w);
      c = mix(c, c * vec3(0.42, 0.5, 0.62), clamp(v * veins * where, 0.0, 0.8));
    }
    if (uGhost.y > 0.0) {
      float dl = length((p.xy - uLmEyeL.xy) * vec2(0.8, 1.15));
      float dr = length((p.xy - uLmEyeR.xy) * vec2(0.8, 1.15));
      float sock = 1.0 - smoothstep(0.009, 0.026, min(dl, dr));
      c = mix(c, c * vec3(0.3, 0.27, 0.34), sock * uGhost.y * step(uLmEyeL.z - 0.03, p.z));
    }
    float decay = uGhost2.z + uStain.y;
    if (decay > 0.0) {
      float n = mhNoise(p * 18.0) * 0.6 + mhNoise(p * 55.0) * 0.4;
      float m = smoothstep(0.45, 0.75, n) * decay;
      c = mix(c, c * vec3(0.62, 0.66, 0.5), clamp(m, 0.0, 0.85));
      c = mix(c, vec3(0.08, 0.06, 0.05), smoothstep(0.78, 0.9, n) * decay * 0.7);
    }
    if (uStain.x > 0.0) {
      float n = mhNoise(p * 24.0 + 1.3) * 0.65 + mhNoise(p * 90.0) * 0.35;
      float low = 1.0 - smoothstep(uLmNose.y - 0.02, uLmNose.y + 0.03, p.y) * 0.6;
      float m = smoothstep(0.7 - uStain.x * 0.25, 0.78 - uStain.x * 0.2, n) * low;
      c = mix(c, vec3(0.16, 0.02, 0.015), clamp(m * uStain.x * 1.4, 0.0, 0.92));
    }
    mhRough = mix(mhRough, 0.16, uGhost.z * 0.9);
    c *= 1.0 - 0.18 * uGhost.z;
  }
  // animated gore (skin and clothes)
  if (uGore.x + uGore.y + uGore.z > 0.0 && part <= 1) {
    float bl = glbGoreAmt(vBind);
    if (bl > 0.0) {
      float rim = smoothstep(0.15, 0.6, bl) * (1.0 - smoothstep(0.6, 0.95, bl));
      vec3 fresh = uGore.w > 0.5 ? vec3(0.07, 0.008, 0.008) : vec3(0.2, 0.012, 0.01);
      vec3 dried = vec3(0.1, 0.035, 0.02);
      c = mix(c, mix(fresh, dried, rim * 0.7), smoothstep(0.05, 0.5, bl));
      glbBloodWet = smoothstep(0.5, 0.95, bl);
    }
  }
  // cut-out cards (hair, brows, lashes, veil, bun): dithered threshold for soft, strand-like edges
  if (part >= 2 && part != 5 && part != 6) {
    float th = 0.3 + 0.2 * mhHash(gl_FragCoord.xy * 0.37 + vec2(uTime * 0.0, 1.7));
    if (alpha < th) discard;
  }
  diffuseColor.rgb *= c;
}
`;

const FRAG_ROUGH = /* glsl */ `
  roughnessFactor = mhRough;
  roughnessFactor = mix(roughnessFactor, 0.14, glbBloodWet);
`;

// bump from a bind-space height (Mikkelsen's surface gradient, no tangents needed)
const FRAG_NORMAL = /* glsl */ `
  {
    // (no branch: derivatives need uniform control flow)
    vec3 sp = -vViewPosition;
    vec3 dpx = dFdx(sp), dpy = dFdy(sp);
    float dhx = dFdx(mhBumpH), dhy = dFdy(mhBumpH);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
    vec3 nb = abs(det) * normal - grad;
    if (dot(nb, nb) > 1e-24) normal = normalize(nb);
  }
`;

const FRAG_EMISSIVE = /* glsl */ `
  if (glbSeq > 0.5) {
    vec3 vd = normalize(vViewPosition);
    float tw = mhHash(floor(vBind.xy * 900.0) + floor(vd.xy * 6.0));
    totalEmissiveRadiance += vec3(0.9, 0.75, 0.5) * step(0.993, tw) * 0.6;
  }
`;

function patch(mat, extraKey, fn) {
  const base = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.onBeforeCompile = (sh, r) => {
    base?.call(mat, sh, r);
    fn(sh);
  };
  mat.customProgramCacheKey = () => baseKey() + '|' + extraKey;
  return mat;
}

const VERT_SKIN_NORMAL = '#include <skinnormal_vertex>\n#ifdef USE_SKINNING\n  objectNormal = glbTwistN(objectNormal, (skinMatrix * vec4(position, 1.0)).xyz);\n#endif';

/** Body material: skin + clothes + hair + brows + lashes + teeth + tongue + veil, one draw call. */
export function mhBodyMaterial(U, opts = {}) {
  // double sided; hair / brow / lash cards are cut out in the shader (a dithered threshold, so opacity
  // fades of the whole character keep working: no material alphaTest / alpha-to-coverage)
  const m = skinMaterial({ map: opts.map, roughness: 0.6, wet: opts.wet ?? 0.1, sss: 0.85, brush: 0.08, name: 'mh-character', side: THREE.DoubleSide });
  m.side = THREE.DoubleSide;
  m.userData.charUniforms = U;
  return patch(m, 'mhBody3', (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT)
      .replace('#include <skinnormal_vertex>', VERT_SKIN_NORMAL)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vBind = position; vPart = apart; vMhUv = uv;
  {
    float mk = amask;
    vMaskV = vec4(mod(mk, 2.0), mod(floor(mk / 2.0), 2.0), mod(floor(mk / 4.0), 2.0), mod(floor(mk / 16.0), 2.0));
  }
  transformed += mhMorph();
  if (uCrush > 0.0 && apart < 0.5) transformed += glbCrushD(position);`,
      )
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed = glbTwist(transformed);');
    let f = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
    // subsurface-like wrap lighting only on skin texels
    f = f.replace('* dlbPaint3.x );', '* dlbPaint3.x * glbSkin );');
    sh.fragmentShader = f;
  });
}

// --------------------------------------------------------------------------------------- eyes
const EYE_FRAG_PARS = /* glsl */ `
uniform vec4 uGhost, uGhost2;
uniform vec3 uLmEyeC[2];
uniform vec4 uEye;
varying vec3 vBind;
varying vec2 vEyeUv;
`;
// MakeHuman eye texture: two eyeballs, irises centred at (0.703, 0.711) and (0.293, 0.289), iris
// radius ~0.117, pupil ~0.04 (uv, v up). Pupils dilate / shrink by remapping the radius.
const EYE_MAP = /* glsl */ `
{
  vec2 uv = vEyeUv;
  vec2 cc = uv.x > 0.5 ? vec2(0.703, 0.711) : vec2(0.293, 0.289);
  vec2 d = uv - cc;
  float r = length(d);
  float R = 0.117, p0 = 0.04;
  float k = clamp(uGhost2.y, -0.85, 1.0);
  float p1 = p0 * (1.0 + (k > 0.0 ? k * 1.55 : k * 0.85));
  if (r < R && r > 1e-5) {
    float rs = r < p1 ? r * p0 / p1 : p0 + (r - p1) * (R - p0) / (R - p1);
    uv = cc + d / r * rs;
  }
  vec4 tex = texture2D(map, uv);
  vec3 c = tex.rgb;
  int style = int(uGhost2.w + 0.5);
  if (style == 1) c = mix(c, vec3(0.006), 0.96);                                   // black
  else if (style == 3) c = mix(c, vec3(0.78, 0.8, 0.8), 0.72 * smoothstep(0.0, R * 1.1, R * 1.4 - r * 0.4)); // milky
  // lids and lashes shade the top of the eyeball; corners darker
  vec3 e = vBind.x > 0.0 ? uLmEyeC[0] : uLmEyeC[1];
  vec3 n = normalize(vBind - e);
  float open = vBind.x > 0.0 ? uEye.x : uEye.y;
  c *= 0.55 + 0.45 * smoothstep(-0.2, 0.75, n.z);
  c *= 1.0 - 0.45 * smoothstep(0.15, 0.55, n.y) * open;
  diffuseColor.rgb = c;
}
`;
const EYE_EMISSIVE = /* glsl */ `
{
  vec3 n = normalize(normal);
  float cl = pow(max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 900.0);
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * cl * 0.9 * (1.0 - uGhost.w);
}
`;

export function mhEyeMaterial(U, map, opts = {}) {
  const glow = !!opts.glow;
  const m = paintedMaterial({ map, roughness: 0.07, brush: 0.0, wet: 0, puddles: 0, envReflect: 1.6, emissive: glow ? 0xff4a2a : 0x000000, emissiveIntensity: glow ? 1.4 : 1, emissiveMap: glow ? map : null, name: 'mh-eye' });
  return patch(m, 'mhEye2', (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uTwistO, uTwistD;\nvarying vec3 vBind;\nvarying vec2 vEyeUv;\n' + VERT.slice(VERT.indexOf('vec3 glbTwist(')))
      .replace('#include <skinnormal_vertex>', VERT_SKIN_NORMAL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBind = position; vEyeUv = uv;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed = glbTwist(transformed);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + EYE_FRAG_PARS)
      .replace('#include <map_fragment>', EYE_MAP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + EYE_EMISSIVE);
  });
}

// --------------------------------------------------------------------------------------- face driver
const _hash = (x) => { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); };

/** Map the humanoid's expression state onto the morph channels (called every frame after _face).
 *  f: { blinkL, blinkR, lidDown, squint, wide, jaw, smile, frown, stretch, browRaise, browFurrow, browSad, creepy,
 *       fear, anger, talk, syl, uncanny } */
export function driveMHFace(U, f) {
  const W = U.uMorphW.value;
  const c = (v) => (v < 0 ? 0 : v > 1.4 ? 1.4 : v);
  W[0] = c(f.blinkL);
  W[1] = c(f.blinkR);
  const wide = c(f.wide) * (1 - Math.max(f.blinkL, f.blinkR));
  W[2] = wide;
  W[3] = wide;
  W[4] = c(f.squint + f.smile * 0.25 + f.creepy * 0.1);
  W[5] = c(f.squint + f.smile * 0.25 + f.creepy * 0.25);
  W[6] = c(f.lidDown);
  W[7] = c(f.lidUp || 0);
  W[8] = c(f.browRaise * 0.7 + f.browSad * 0.9 + f.fear * 0.4);
  W[9] = c(f.browFurrow);
  W[10] = c(f.browRaise * 0.8 + f.creepy * 0.2);
  W[11] = c(f.jaw * 0.72 + f.stretch * 0.55);
  W[12] = c(f.smile + f.creepy * 0.95);
  W[13] = c(f.smile + f.creepy * 0.6);
  W[14] = c(f.frown);
  W[15] = c(f.stretch * 0.9 + f.creepy * 0.45 + f.fear * 0.25);
  // talking: vary the mouth shape per syllable (rounded / spread / open)
  const h = f.talk ? _hash(f.syl) : 0;
  W[16] = f.talk ? (h < 0.3 ? f.jaw * 0.7 : 0) : 0;
  W[17] = c(f.anger * 0.45);
  W[18] = f.talk ? (h > 0.6 ? f.jaw * 0.5 : f.jaw * 0.15) : 0;
  W[19] = c(f.uncanny);
}
