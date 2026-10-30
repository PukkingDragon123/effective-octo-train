// Character materials: render's skinMaterial / paintedMaterial (painterly, fogged, wet) patched
// on top of their own onBeforeCompile with:
//  * `_FAT` build inflation along the bind normal (Hia Phat's afat · uFat)
//  * face deformation in bind space (jaw rotation about the TMJ axis, smile / frown / creepy
//    stretched smile corners, cheek raise, brow raise / furrow / sad), head-front masks only
//  * eye openings: almond-shaped lid apertures cut per fragment in bind space (smooth at any
//    resolution) through the filled eye sockets, revealing the real eyeballs; lash line and lid
//    shading follow the blink; mouth interior painted into the stretched lip band
//  * per-texel material data from the atlas mask (skin SSS mask, roughness, shell cutouts, sequins)
//  * ghost pallor (skin only), dark sockets
//  * post-skin neck twist about the current neck axis (far past human limits, no candy-wrap
//    collapse because it is applied after skinning) - shared by body, eyes and accessories.
import * as THREE from 'three';
import { skinMaterial, paintedMaterial } from '../../render/index.js';

/** Per-character uniform block shared by all its materials (body, eyes, accessories). */
export function makeCharUniforms(t) {
  const f = t.face;
  const e = t.eyes;
  return {
    uFat: { value: 0 },
    uFaceA: { value: new THREE.Vector4() }, // jaw, smile, frown, mouthStretch
    uFaceB: { value: new THREE.Vector4() }, // browRaise, browFurrow, browSad, creepy
    uEye: { value: new THREE.Vector4(1, 1, 0, 0) }, // openL, openR, squint (lower lid up), wide
    uEyeShape: { value: new THREE.Vector4(0.0128, 0.0052, 0.0036, 0.06) }, // halfW, upH, loH, tilt
    uGhost: { value: new THREE.Vector4() }, // pale, sockets dark, wet, black eyes
    uLmEyeL: { value: e[0].clone() },
    uLmEyeR: { value: e[1].clone() },
    uLmMouth: { value: new THREE.Vector3(0.024, f.mouth.y, f.mouth.z) }, // half width, y, z (front)
    uLmJaw: { value: new THREE.Vector4(e[0].y - 0.035, t.Gp[t.index.Head].z + 0.005, f.chinY, 0) }, // pivot y, pivot z, chin y
    uTwistO: { value: new THREE.Vector4(0, 0, 0, 0) }, // neck base (mesh space) xyz, angle
    uTwistD: { value: new THREE.Vector4(0, 1, 0, 0.12) }, // axis dir xyz, neck length
    uFaceMap: { value: null },
    uMaskMap: { value: null },
    uTime: { value: 0 },
  };
}

const VERT_PARS = /* glsl */ `
attribute float afat;
attribute float apart;
uniform float uFat;
uniform vec4 uFaceA, uFaceB, uTwistO, uTwistD;
uniform vec3 uLmEyeL, uLmEyeR, uLmMouth;
uniform vec4 uLmJaw;
varying vec3 vBind;
varying float vPart;
float glbGauss(vec3 d, float s) { return exp(-dot(d, d) / (2.0 * s * s)); }
vec3 glbFace(vec3 p) {
  vec3 d = vec3(0.0);
  float mY = uLmMouth.y, mW = uLmMouth.x, mZ = uLmMouth.z;
  float headFront = smoothstep(uLmJaw.y - 0.01, uLmJaw.y + 0.03, p.z) * smoothstep(uLmJaw.z - 0.06, uLmJaw.z - 0.02, p.y);
  if (headFront <= 0.0) return d;
  float jaw = uFaceA.x, smile = uFaceA.y, frown = uFaceA.z, stretch = uFaceA.w;
  float creepy = uFaceB.w;
  // ---- jaw: rotate the lower face about the TMJ axis (+X)
  float below = smoothstep(mY + 0.002, mY - 0.005, p.y);
  float lat = 1.0 - smoothstep(0.042 + stretch * 0.01, 0.072, abs(p.x));
  float throat = smoothstep(uLmJaw.z - 0.05, uLmJaw.z - 0.012, p.y);
  float ang = (jaw * 0.26 + stretch * 0.62) * below * lat * throat;
  vec2 q = vec2(p.y - uLmJaw.x, p.z - uLmJaw.y);
  float ca = cos(ang), sa = sin(ang);
  d.yz += vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca) - q;
  // upper lip lifts a little when speaking
  d.y += jaw * 0.0012 * glbGauss(vec3(p.x * 0.6, p.y - mY - 0.004, 0.0), 0.006);
  // ---- mouth corners
  float sx = sign(p.x);
  vec3 cL = vec3(sx * mW, mY, mZ - 0.012);
  float wc = glbGauss(p - cL, 0.011 + stretch * 0.008 + creepy * 0.006);
  d += wc * (smile * vec3(sx * 0.0035, 0.0045, -0.0025) + frown * vec3(sx * 0.001, -0.0045, 0.0)
           + stretch * vec3(sx * 0.013, 0.003, -0.004) + creepy * vec3(sx * 0.0085, 0.0085, -0.004));
  // lips thin / pull when stretched
  d.y += (stretch + creepy) * 0.002 * glbGauss(vec3(p.x * 0.4, p.y - mY, 0.0), 0.004) * sign(p.y - mY);
  // cheeks raise with a smile
  vec3 ck = vec3(sx * 0.034, mY + 0.03, mZ - 0.01);
  d += glbGauss(p - ck, 0.016) * (smile + creepy * 0.7) * vec3(sx * 0.0012, 0.0028, 0.0022);
  // ---- brows
  float ey = uLmEyeL.y;
  float above = smoothstep(ey + 0.004, ey + 0.016, p.y) * (1.0 - smoothstep(ey + 0.045, ey + 0.075, p.y));
  float browX = 1.0 - smoothstep(0.045, 0.065, abs(p.x));
  d.y += uFaceB.x * 0.0045 * above * browX;
  float inner = glbGauss(vec3(abs(p.x) - 0.012, p.y - ey - 0.02, 0.0), 0.011);
  d.y += uFaceB.z * 0.0042 * inner - uFaceB.y * 0.0028 * inner;
  d.x -= sx * uFaceB.y * 0.0016 * inner;
  d.z += uFaceB.y * 0.0012 * inner;
  return d * headFront;
}
vec3 glbTwist(vec3 p) {
  if (abs(uTwistO.w) < 1e-4) return p;
  vec3 a = uTwistD.xyz;
  vec3 r = p - uTwistO.xyz;
  float h = dot(r, a) / uTwistD.w;
  float w = smoothstep(0.15, 1.0, h) * (1.0 - smoothstep(0.16, 0.24, length(r - a * dot(r, a))) * (1.0 - smoothstep(0.9, 1.3, h)));
  float an = uTwistO.w * w;
  float c = cos(an), s = sin(an);
  // Rodrigues rotation about axis a through the neck base
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

const FRAG_PARS = /* glsl */ `
uniform sampler2D uFaceMap;
uniform sampler2D uMaskMap;
uniform vec4 uFaceA, uFaceB, uEye, uEyeShape, uGhost;
uniform vec3 uLmEyeL, uLmEyeR, uLmMouth;
uniform vec4 uLmJaw;
varying vec3 vBind;
varying float vPart;
float glbSkin = 1.0;
float glbSeq = 0.0;
float glbHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// eye aperture: returns (inside 0..1, signed distance to the upper lid edge (m), lower edge, lid shading)
vec4 glbEye(vec3 p, vec3 e, float side, float open) {
  vec2 q = p.xy - e.xy;
  q.x *= side; // +x toward the outer corner
  // canthal tilt (outer corner slightly up)
  q.y -= q.x * uEyeShape.w;
  float hw = uEyeShape.x;
  float u = q.x / hw;
  if (abs(u) >= 1.0 || p.z < e.z - 0.006) return vec4(0.0, 1.0, 1.0, 0.0);
  float k = 1.0 - u * u;
  // upper lid arc peaks slightly toward the inner side, lower lid flatter
  float up = uEyeShape.y * pow(k, 0.65) * (1.0 - 0.18 * u) * (1.0 + uEye.w * 0.35);
  float lo = -uEyeShape.z * pow(k, 0.9) * (1.0 - uEye.z * 0.45);
  float closedY = lo + (up - lo) * 0.18;
  float upC = mix(closedY, up, open);
  float loC = mix(closedY - 0.0003, lo, clamp(open * 1.6, 0.0, 1.0));
  float inside = step(loC, q.y) * step(q.y, upC) * step(0.04, open);
  return vec4(inside, q.y - upC, loC - q.y, k);
}
`;

const FRAG_MAP = /* glsl */ `
#ifdef USE_MAP
{
  vec2 ap = vMapUv * 1024.0;
  vec4 texA = texture2D(map, vMapUv);
  vec4 texF = texture2D(uFaceMap, (ap - vec2(5.0, 405.0)) / 310.0);
  float inFace = step(ap.x, 318.0) * step(401.0, ap.y) * step(ap.y, 719.0) * step(vPart, 0.5);
  vec4 tex = mix(texA, texF, inFace);
  vec4 mk = texture2D(uMaskMap, vMapUv);
  // clothing shell cutouts (bare shoulders, armholes, necklines)
  if (vPart > 0.5 && vPart < 1.5 && mk.b > 0.75) discard;
  glbSkin = vPart < 0.5 ? mk.r : 0.0;
  glbSeq = step(0.3, mk.b) * step(mk.b, 0.7);
  // hair: alpha-cut strand ends at the hairline rim and the curtain tips (no helmet edge)
  if (vPart > 1.5 && vPart < 2.5) {
    vec2 h = (ap - vec2(709.0, 405.0)) / vec2(310.0, 262.0);
    float col = floor(h.x * 260.0);
    float n1 = glbHash(vec2(col, 1.7)), n2 = glbHash(vec2(col, 9.1));
    float rim = (h.y - 0.56) / 0.06, tip = (h.y - 0.88) / 0.12;
    if ((rim > 0.0 && rim < 1.0 && rim > 0.2 + n1 * 0.8) || (tip > 0.0 && tip > 0.1 + n2 * 0.9)) discard;
  }
  vec3 c = tex.rgb;
  // ---- eyes: apertures, lash line, lid shading
  if (vPart < 0.5 && vBind.z > uLmEyeL.z - 0.012 && abs(vBind.y - uLmEyeL.y) < 0.02) {
    for (int s = 0; s < 2; s++) {
      vec3 e = s == 0 ? uLmEyeL : uLmEyeR;
      float side = s == 0 ? 1.0 : -1.0;
      vec4 ey = glbEye(vBind, e, side, s == 0 ? uEye.x : uEye.y);
      if (ey.x > 0.5) discard;
      if (ey.w > 0.0) {
        // upper lash line: dark, thicker toward the outer corner
        float du = ey.y;
        float lash = (1.0 - smoothstep(0.0, 0.0011 + 0.0006 * max(0.0, (vBind.x - e.x) * side / uEyeShape.x), du)) * step(-0.0004, du);
        float lowl = (1.0 - smoothstep(0.0, 0.0007, ey.z)) * step(-0.0003, ey.z) * 0.55;
        float lid = (1.0 - smoothstep(0.0, 0.0045, du)) * step(0.0, du);
        c *= 1.0 - lid * 0.22;
        c = mix(c, vec3(0.035, 0.025, 0.02), clamp(lash * smoothstep(0.0, 0.25, ey.w) + lowl * smoothstep(0.0, 0.4, ey.w), 0.0, 0.95));
        // pink waterline just below the lower lash line
        c = mix(c, c * vec3(1.15, 0.8, 0.78), (1.0 - smoothstep(0.0, 0.0012, ey.z + 0.0006)) * step(-0.0012, ey.z) * 0.4);
      }
    }
  }
  // ---- mouth interior in the stretched lip band
  if (vPart < 0.5) {
    float st = uFaceA.w;
    float D = (uFaceA.x * 0.26 + st * 0.62) * 0.085; // lower lip drop (m)
    float mw = uLmMouth.x * (1.0 + st * 0.55 + uFaceB.w * 0.35 + uFaceA.y * 0.12);
    float mx = abs(vBind.x) / mw;
    if (D > 0.0004 && mx < 1.0 && vBind.z > uLmMouth.z - 0.025) {
      float h = 0.4 * D / (1.0 + 210.0 * D) * pow(1.0 - mx * mx, 0.6);
      float y = vBind.y - (uLmMouth.y - 0.0015);
      float m = 1.0 - smoothstep(h * 0.7, h * 1.05, abs(y));
      vec3 mouth = mix(vec3(0.05, 0.012, 0.012), vec3(0.16, 0.05, 0.05), smoothstep(-h, h * 0.2, -y));
      // teeth just under the upper lip, tongue low
      float teeth = smoothstep(h * 0.25, h * 0.7, y) * smoothstep(0.003, 0.01, D) * (1.0 - smoothstep(0.55, 0.9, mx));
      mouth = mix(mouth, vec3(0.62, 0.58, 0.5) * (1.0 - uGhost.w * 0.6), teeth * 0.85);
      c = mix(c, mouth, m);
    }
  }
  // ---- ghost: pallor on skin, dark sunken sockets
  if (uGhost.x > 0.0 || uGhost.y > 0.0) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 pale = vec3(l) * vec3(0.86, 0.95, 1.0) * 1.3 + vec3(0.015, 0.02, 0.025);
    c = mix(c, pale, uGhost.x * glbSkin);
    if (vPart < 0.5) {
      float dl = length((vBind.xy - uLmEyeL.xy) * vec2(0.8, 1.15));
      float dr = length((vBind.xy - uLmEyeR.xy) * vec2(0.8, 1.15));
      float sock = 1.0 - smoothstep(0.008, 0.022, min(dl, dr));
      c = mix(c, c * vec3(0.32, 0.28, 0.34), sock * uGhost.y * step(uLmEyeL.z - 0.02, vBind.z));
    }
  }
  diffuseColor.rgb *= c;
  diffuseColor.a *= tex.a;
}
#endif
`;

const FRAG_ROUGH = /* glsl */ `
#ifdef USE_MAP
  roughnessFactor = max(0.06, texture2D(uMaskMap, vMapUv).g);
  roughnessFactor = mix(roughnessFactor, 0.28, glbSeq);
#endif
`;
const FRAG_EMISSIVE = /* glsl */ `
  if (glbSeq > 0.5) {
    vec3 vd = normalize(vViewPosition);
    float tw = glbHash(floor(vBind.xy * 900.0) + floor(vd.xy * 6.0));
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

/** Body material (skin + clothing + hair, one draw call). */
export function bodyMaterial(U, opts = {}) {
  const m = skinMaterial({ map: opts.map, roughness: 0.8, wet: opts.wet ?? 0.12, sss: 0.7, brush: 0.32, name: 'glb-character' });
  m.userData.charUniforms = U;
  return patch(m, 'glbBody2', (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n#ifdef USE_SKINNING\n  objectNormal = glbTwistN(objectNormal, (skinMatrix * vec4(position, 1.0)).xyz);\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBind = position; vPart = apart;\n  transformed += normal * (afat * uFat - (apart > 0.5 && apart < 1.5 ? 0.0045 : 0.0));\n  if (apart < 0.5) transformed += glbFace(position);')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed = glbTwist(transformed);');
    let f = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
    // SSS / wrap lighting only on skin texels
    f = f.replace('* dlbPaint3.x );', '* dlbPaint3.x * glbSkin );');
    sh.fragmentShader = f;
  });
}

// ---------------------------------------------------------------- eyes
const EYE_FRAG_PARS = /* glsl */ `
uniform vec4 uEye, uEyeShape, uGhost;
uniform vec3 uLmEyeL, uLmEyeR;
varying vec3 vBind;
`;
const EYE_FRAG = /* glsl */ `
{
  // lid shadow / lash occlusion on the eyeball near the upper lid, AO toward the corners
  vec3 e = vBind.x > 0.0 ? uLmEyeL : uLmEyeR;
  float side = vBind.x > 0.0 ? 1.0 : -1.0;
  vec2 q = vBind.xy - e.xy; q.x *= side; q.y -= q.x * uEyeShape.w;
  float u = clamp(q.x / uEyeShape.x, -1.0, 1.0);
  float k = 1.0 - u * u;
  float open = vBind.x > 0.0 ? uEye.x : uEye.y;
  float up = mix(-uEyeShape.z * 0.7, uEyeShape.y * pow(k, 0.65) * (1.0 - 0.18 * u), open);
  float sh = 1.0 - smoothstep(0.0, 0.0028, up - q.y);
  diffuseColor.rgb *= 1.0 - sh * 0.55;
  diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.5, k);
}
`;
const EYE_EMISSIVE = /* glsl */ `
{
  // wet catchlight (a soft key from the viewer's upper left, always alive) + ghost glow
  vec3 n = normalize(normal);
  float cl = pow(max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 900.0);
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * cl * 0.9 * (1.0 - uGhost.w);
}
`;

export function eyeMaterial(U, map, opts = {}) {
  const m = paintedMaterial({ map, roughness: 0.12, brush: 0.04, wet: 0, puddles: 0, envReflect: 1.4, emissive: opts.glow ? 0xff4a2a : 0x000000, emissiveIntensity: opts.glow ? 1.6 : 1, emissiveMap: opts.glow ? map : null, name: 'glb-eye' });
  return patch(m, 'glbEye1', (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS.replace('attribute float afat;\nattribute float apart;', ''))
      .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n#ifdef USE_SKINNING\n  objectNormal = glbTwistN(objectNormal, (skinMatrix * vec4(position, 1.0)).xyz);\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBind = position;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed = glbTwist(transformed);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + EYE_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + EYE_FRAG)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + EYE_EMISSIVE);
  });
}

/** Accessories (vertex-coloured, skinned rigidly): same twist as the head. */
export function accessoryMaterial(U, opts = {}) {
  const m = paintedMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.75, brush: 0.5, wet: 0.35, puddles: 0, name: 'glb-accessory', side: opts.side });
  return patch(m, 'glbAcc1', (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS.replace('attribute float afat;\nattribute float apart;', ''))
      .replace('#include <skinnormal_vertex>', '#include <skinnormal_vertex>\n#ifdef USE_SKINNING\n  objectNormal = glbTwistN(objectNormal, (skinMatrix * vec4(position, 1.0)).xyz);\n#endif')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed = glbTwist(transformed);');
  });
}
