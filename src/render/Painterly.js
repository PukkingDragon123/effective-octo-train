// Painterly filter shaders (Kuwahara family):
//  * high:   anisotropic Kuwahara (Kyprianidis et al., polynomial sector weights) steered
//            by a smoothed structure tensor -> strokes follow edges and contours.
//  * medium: generalized (isotropic) 8-sector Kuwahara at half resolution.
//  * low:    classic 4-quadrant Kuwahara at half resolution.
// Filtering happens in a perceptual, range-compressed space so the dark night scene
// still gets edge-preserving brush strokes (linear HDR values would make it a plain blur).

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const ENCODE = /* glsl */ `
uniform float uEnc; // pre-exposure for the perceptual encoding
float pLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 enc(vec3 c) { c = max(c, vec3(0.0)) * uEnc; return sqrt(c / (1.0 + pLuma(c))); }
vec3 dec(vec3 e) { vec3 c = e * e; return c / max(1.0 - pLuma(c), 0.03) / uEnc; }
`;

/** Structure tensor from colour gradients (Sobel), output (E, G, F). */
export const TENSOR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel; // source texel size * step
varying vec2 vUv;
${ENCODE}
vec3 S(vec2 o) { return enc(texture2D(tSrc, vUv + o * uTexel).rgb); }
void main() {
  vec3 a = S(vec2(-1.0, -1.0)), b = S(vec2(0.0, -1.0)), c = S(vec2(1.0, -1.0));
  vec3 d = S(vec2(-1.0, 0.0)), f = S(vec2(1.0, 0.0));
  vec3 g = S(vec2(-1.0, 1.0)), h = S(vec2(0.0, 1.0)), i = S(vec2(1.0, 1.0));
  vec3 gx = (-a - 2.0 * d - g + c + 2.0 * f + i) * 0.25;
  vec3 gy = (-a - 2.0 * b - c + g + 2.0 * h + i) * 0.25;
  gl_FragColor = vec4(dot(gx, gx), dot(gy, gy), dot(gx, gy), 1.0);
}
`;

/** Separable gaussian (for the tensor and glass blur). */
export const GAUSS_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir; // texel step * direction
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tSrc, vUv) * 0.2270270270;
  s += texture2D(tSrc, vUv + uDir * 1.3846153846) * 0.3162162162;
  s += texture2D(tSrc, vUv - uDir * 1.3846153846) * 0.3162162162;
  s += texture2D(tSrc, vUv + uDir * 3.2307692308) * 0.0702702703;
  s += texture2D(tSrc, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = s;
}
`;

/** Generalized / anisotropic Kuwahara with 8 sectors and polynomial weights. */
export const KUWAHARA8_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tTensor;
uniform vec2 uTexel;      // uv step of one filter pixel
uniform float uRadius;    // filter radius in filter pixels
uniform float uHardness;
uniform float uSharpness;
uniform float uAlpha;     // anisotropy control
varying vec2 vUv;
${ENCODE}
void main() {
  float phi = 0.0;
  float A = 0.0;
#ifdef ANISO
  vec3 g = texture2D(tTensor, vUv).xyz;
  float disc = sqrt(max(g.y * g.y - 2.0 * g.x * g.y + g.x * g.x + 4.0 * g.z * g.z, 0.0));
  float l1 = 0.5 * (g.y + g.x + disc);
  float l2 = 0.5 * (g.y + g.x - disc);
  vec2 v = vec2(l1 - g.x, -g.z);
  vec2 t = length(v) > 1e-7 ? normalize(v) : vec2(0.0, 1.0);
  phi = -atan(t.y, t.x);
  A = (l1 + l2 > 1e-7) ? (l1 - l2) / (l1 + l2) : 0.0;
#endif
  float radius = uRadius;
  float a = radius * clamp((uAlpha + A) / uAlpha, 0.1, 2.0);
  float b = radius * clamp(uAlpha / (uAlpha + A), 0.1, 2.0);
  float cp = cos(phi), sp = sin(phi);
  int maxX = int(sqrt(a * a * cp * cp + b * b * sp * sp));
  int maxY = int(sqrt(a * a * sp * sp + b * b * cp * cp));
  float zeta = 2.0 / radius;
  float zeroCross = 0.3926991; // pi/8
  float sinZC = sin(zeroCross);
  float eta = (zeta + cos(zeroCross)) / (sinZC * sinZC);
  vec4 m[8];
  vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  for (int y = -9; y <= 9; y++) {
    if (y < -maxY || y > maxY) continue;
    for (int x = -9; x <= 9; x++) {
      if (x < -maxX || x > maxX) continue;
      vec2 p = vec2(float(x), float(y));
      vec2 vv = vec2(cp * p.x - sp * p.y, sp * p.x + cp * p.y);
      vv = vec2(vv.x * 0.5 / a, vv.y * 0.5 / b);
      if (dot(vv, vv) > 0.25) continue;
      vec3 c = enc(texture2D(tSrc, vUv + p * uTexel).rgb);
      float w[8];
      float sum = 0.0;
      float z, vxx, vyy;
      vxx = zeta - eta * vv.x * vv.x;
      vyy = zeta - eta * vv.y * vv.y;
      z = max(0.0, vv.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -vv.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -vv.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, vv.x + vyy); w[6] = z * z; sum += w[6];
      vec2 v2 = 0.70710678 * vec2(vv.x - vv.y, vv.x + vv.y);
      vxx = zeta - eta * v2.x * v2.x;
      vyy = zeta - eta * v2.y * v2.y;
      z = max(0.0, v2.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -v2.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -v2.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, v2.x + vyy); w[7] = z * z; sum += w[7];
      float gw = exp(-3.125 * dot(vv, vv)) / max(sum, 1e-6);
      for (int k = 0; k < 8; k++) {
        float wk = w[k] * gw;
        m[k] += vec4(c * wk, wk);
        s[k] += c * c * wk;
      }
    }
  }
  vec4 o = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    if (m[k].w <= 1e-6) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 var = abs(s[k] / m[k].w - mean * mean);
    float sig = var.r + var.g + var.b;
    float wk = 1.0 / (1.0 + pow(uHardness * 1000.0 * sig, 0.5 * uSharpness));
    o += vec4(mean * wk, wk);
  }
  vec3 res = o.w > 0.0 ? o.rgb / o.w : enc(texture2D(tSrc, vUv).rgb);
  // orientation for the brush-grain overlay (pi-periodic, normalised)
  gl_FragColor = vec4(dec(res), fract(phi / 3.14159265 + 1.0) + A * 0.0);
}
`;

/** Classic 4-quadrant Kuwahara (cheap). */
export const KUWAHARA4_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uHardness;
uniform float uSharpness;
varying vec2 vUv;
${ENCODE}
void main() {
  int r = int(uRadius + 0.5);
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;
  for (int y = -4; y <= 4; y++) {
    if (y < -r || y > r) continue;
    for (int x = -4; x <= 4; x++) {
      if (x < -r || x > r) continue;
      vec3 c = enc(texture2D(tSrc, vUv + vec2(float(x), float(y)) * uTexel).rgb);
      vec3 cc = c * c;
      if (x <= 0 && y <= 0) { m0 += c; s0 += cc; n0 += 1.0; }
      if (x >= 0 && y <= 0) { m1 += c; s1 += cc; n1 += 1.0; }
      if (x <= 0 && y >= 0) { m2 += c; s2 += cc; n2 += 1.0; }
      if (x >= 0 && y >= 0) { m3 += c; s3 += cc; n3 += 1.0; }
    }
  }
  m0 /= n0; m1 /= n1; m2 /= n2; m3 /= n3;
  vec3 v0 = abs(s0 / n0 - m0 * m0), v1 = abs(s1 / n1 - m1 * m1), v2 = abs(s2 / n2 - m2 * m2), v3 = abs(s3 / n3 - m3 * m3);
  float w0 = 1.0 / (1.0 + pow(uHardness * 1000.0 * (v0.r + v0.g + v0.b), 0.5 * uSharpness));
  float w1 = 1.0 / (1.0 + pow(uHardness * 1000.0 * (v1.r + v1.g + v1.b), 0.5 * uSharpness));
  float w2 = 1.0 / (1.0 + pow(uHardness * 1000.0 * (v2.r + v2.g + v2.b), 0.5 * uSharpness));
  float w3 = 1.0 / (1.0 + pow(uHardness * 1000.0 * (v3.r + v3.g + v3.b), 0.5 * uSharpness));
  vec3 res = (m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / max(w0 + w1 + w2 + w3, 1e-6);
  gl_FragColor = vec4(dec(res), 0.0);
}
`;
