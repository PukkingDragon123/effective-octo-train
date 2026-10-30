// Organic sculpts (SDF + surface nets, cached): the Ma Ruay deity (old man of the
// earth, smiling, long white beard — his face must read from the shrine steps), seated
// and standing Buddhas, guardian lions, zebra / Thai dancer / ta-yai figurines and a
// five-headed naga crest. Each returns a geometry with painted vertex colours.
import * as THREE from 'three';
import { sculpt, smin, ssub, sphere, ellipsoid, capsule, rbox, torusY, C } from './sdf.js';
import { noise } from '../../core/math.js';

const { sin, cos, abs, max, min, hypot, exp } = Math;
const lerpC = (out, a, b, t) => out.copy(a).lerp(b, t < 0 ? 0 : t > 1 ? 1 : t);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const band = (v, w) => sat(1 - abs(v) / w);

// ---------------------------------------------------------------------------
// Deity head (Ah Kong / earth god). Head-local metres; face looks +Z; chin ~ -0.1.
// ---------------------------------------------------------------------------
function deityHeadSDF(x, y, z) {
  const ax = abs(x);
  let d = ellipsoid(x, y, z, 0, 0.026, -0.008, 0.079, 0.093, 0.088);
  d = smin(d, ellipsoid(x, y, z, 0, -0.034, 0.012, 0.066, 0.064, 0.072), 0.035);
  // full smiling cheeks
  d = smin(d, sphere(ax, y, z, 0.039, -0.014, 0.05, 0.034), 0.024);
  // brow ridge
  d = smin(d, capsule(x, y, z, -0.046, 0.03, 0.06, 0.046, 0.03, 0.06, 0.013), 0.02);
  // nose
  d = smin(d, capsule(x, y, z, 0, 0.024, 0.077, 0, -0.012, 0.098, 0.0105, 0.012), 0.012);
  d = smin(d, sphere(x, y, z, 0, -0.016, 0.098, 0.0158), 0.01);
  d = smin(d, sphere(ax, y, z, 0.0145, -0.021, 0.087, 0.011), 0.008);
  // eye sockets + closed smiling lids
  d = ssub(d, ellipsoid(ax, y, z, 0.03, 0.011, 0.083, 0.02, 0.011, 0.016), 0.01);
  d = smin(d, ellipsoid(ax, y, z, 0.03, 0.009, 0.071, 0.0175, 0.0095, 0.0135), 0.004);
  // upper lip / mouth / chin
  d = smin(d, ellipsoid(x, y, z, 0, -0.046, 0.078, 0.029, 0.012, 0.02), 0.012);
  d = ssub(d, capsule(ax, y, z, 0, -0.052, 0.092, 0.024, -0.045, 0.084, 0.0032), 0.003);
  d = smin(d, sphere(x, y, z, 0, -0.086, 0.046, 0.026), 0.02);
  // big lucky earlobes
  d = smin(d, ellipsoid(ax, y, z, 0.079, 0.0, 0.004, 0.012, 0.036, 0.022), 0.008);
  d = smin(d, sphere(ax, y, z, 0.081, -0.04, 0.012, 0.0125), 0.01);
  // neck
  d = smin(d, capsule(x, y, z, 0, -0.07, -0.012, 0, -0.17, -0.016, 0.046), 0.02);
  return d;
}

const SKIN = C(0xe4b58f), CHEEK = C(0xe0866c), LIP = C(0xa8402e), EYE = C(0x24140c), BROWS = C(0xf2efe6), LINE = C(0x9a6448);
function deityHeadColor(x, y, z, nx, ny, nz, out) {
  const ax = abs(x);
  out.copy(SKIN);
  // rosy cheeks
  const ch = exp(-(((ax - 0.04) ** 2 + (y + 0.016) ** 2) / 0.0006));
  lerpC(out, out, CHEEK, ch * 0.55);
  // forehead wrinkles + crow's feet + smile folds (painted)
  if (z > 0.04) {
    const fh = y - 0.055;
    if (fh > -0.012 && fh < 0.03 && ax < 0.045) {
      const w = band(Math.sin(fh * 520 + ax * ax * 900), 0.25) * 0.35;
      lerpC(out, out, LINE, w);
    }
    const cf = hypot(ax - 0.054, y - 0.012);
    if (cf < 0.016 && ax > 0.046) lerpC(out, out, LINE, band(Math.sin(Math.atan2(y - 0.012, ax - 0.054) * 9), 0.3) * 0.35);
    // nasolabial fold
    const nl = ax - (0.022 + (0.0 - y) * 0.35);
    if (y < -0.008 && y > -0.06) lerpC(out, out, LINE, band(nl, 0.0035) * 0.55);
  }
  // closed smiling eyes ("^" crescents)
  if (z > 0.06) {
    const ex = (ax - 0.03) / 0.017;
    if (abs(ex) < 1.05) {
      const yl = 0.0085 + 0.006 * (1 - ex * ex);
      lerpC(out, out, EYE, band(y - yl, 0.0026) * 0.95);
      // lashes / lower lid crease
      lerpC(out, out, LINE, band(y - (yl - 0.0065), 0.002) * 0.4);
    }
    // white brows painted under the sculpted tufts
    const bx = (ax - 0.032) / 0.03;
    if (abs(bx) < 1) lerpC(out, out, BROWS, band(y - (0.031 - bx * 0.006), 0.006) * 0.9);
    // lips
    const lm = hypot(x / 0.026, (y + 0.05) / 0.009);
    if (lm < 1) lerpC(out, out, LIP, (1 - lm) * 1.4);
  }
  return out;
}

/** Deity head geometry (with hat). Returns geometry in head-local metres. */
export function deityHeadGeo() {
  return sculpt('deityHead', deityHeadSDF, [-0.1, -0.18, -0.11, 0.1, 0.13, 0.13], 0.0034, { color: deityHeadColor, smooth: 1 });
}

// ---------------------------------------------------------------------------
// Deity body: seated in a long robe, hands resting forward. Origin = seat surface
// centre, front = +Z. Height to shoulders ~0.62.
// ---------------------------------------------------------------------------
function deityBodySDF(x, y, z) {
  const ax = abs(x);
  let d = ellipsoid(x, y, z, 0, 0.42, -0.02, 0.2, 0.26, 0.15);
  d = smin(d, sphere(x, y, z, 0, 0.33, 0.06, 0.17), 0.08); // belly
  d = smin(d, capsule(x, y, z, -0.19, 0.6, -0.03, 0.19, 0.6, -0.03, 0.075), 0.08); // shoulders
  // wide sleeves
  d = smin(d, capsule(ax, y, z, 0.2, 0.58, -0.02, 0.255, 0.38, 0.07, 0.07, 0.095), 0.05);
  d = smin(d, capsule(ax, y, z, 0.255, 0.38, 0.07, 0.15, 0.31, 0.25, 0.1, 0.115), 0.04);
  // hands
  d = smin(d, ellipsoid(ax, y, z, 0.12, 0.31, 0.3, 0.038, 0.032, 0.045), 0.02);
  // lap / thighs
  d = smin(d, capsule(ax, y, z, 0.1, 0.1, -0.02, 0.12, 0.11, 0.3, 0.105), 0.07);
  // shins + robe skirt to the floor (seat height 0.46)
  d = smin(d, capsule(ax, y, z, 0.12, 0.1, 0.31, 0.125, -0.36, 0.34, 0.085, 0.1), 0.05);
  d = smin(d, rbox(x, y, z, 0, -0.14, 0.27, 0.2, 0.25, 0.09, 0.06), 0.06);
  // shoes
  d = smin(d, ellipsoid(ax, y, z, 0.12, -0.42, 0.42, 0.055, 0.04, 0.095), 0.02);
  // collar
  d = smin(d, torusY(x, y * 1.0, z, 0, 0.64, -0.01, 0.07, 0.022), 0.03);
  return d;
}
const ROBE = C(0x8e1d14), ROBE_D = C(0x5a0e0a), GOLDP = C(0xd2a040), INNER = C(0x2c4a3a), SHOE = C(0x1a1410), HAND = C(0xe4b58f);
function deityBodyColor(x, y, z, nx, ny, nz, out) {
  const ax = abs(x);
  out.copy(ROBE);
  // fold shading
  const f = noise.noise3D(x * 18, y * 6, z * 18);
  lerpC(out, out, ROBE_D, sat(0.3 + f * 0.6) * 0.5);
  // inner green garment front panel
  if (z > 0.05 && ax < 0.06 + max(0, 0.45 - y) * 0.12 && y > -0.1 && y < 0.6) lerpC(out, out, INNER, 0.85);
  // gold trims: collar, cuffs, hem, belt, embroidered roundel on chest
  const collar = band(hypot(x, z + 0.01) - 0.075, 0.03) * band(y - 0.63, 0.04);
  const hem = band(y + 0.33, 0.035);
  const belt = band(y - 0.25, 0.018) * (z > 0 ? 1 : 0.4);
  const cuff = band(hypot(ax - 0.15, y - 0.31, z - 0.25) - 0.1, 0.02);
  const roundel = z > 0.08 ? band(hypot(x, y - 0.44) - 0.06, 0.012) : 0;
  const g = max(collar, hem, belt, cuff, roundel);
  lerpC(out, out, GOLDP, g);
  // pattern dots (embroidery)
  if (z > 0 && (sin(x * 120) * sin(y * 120) > 0.85)) lerpC(out, out, GOLDP, 0.45);
  if (y < -0.37 && z > 0.36) out.copy(SHOE);
  if (z > 0.27 && y > 0.27 && y < 0.36 && ax > 0.08 && ax < 0.16) out.copy(HAND);
  return out;
}
export function deityBodyGeo() {
  return sculpt('deityBody', deityBodySDF, [-0.34, -0.5, -0.22, 0.34, 0.72, 0.56], 0.012, { color: deityBodyColor, smooth: 1 });
}

// ---------------------------------------------------------------------------
// Buddha, seated (Maravijaya: right hand touches the earth). Unit height 1.0
// (base of lap at y=0, top of flame at ~1.0). Front +Z. broken: right hand snapped off.
// ---------------------------------------------------------------------------
function buddhaSeatedSDF(broken) {
  return (x, y, z) => {
    const ax = abs(x);
    // lap and crossed legs
    let d = ellipsoid(x, y, z, 0, 0.075, 0.03, 0.37, 0.085, 0.22);
    d = smin(d, capsule(x, y, z, -0.33, 0.1, 0.1, 0.3, 0.1, 0.16, 0.06), 0.06);
    d = smin(d, ellipsoid(x, y, z, -0.15, 0.15, 0.14, 0.085, 0.028, 0.048), 0.02); // upturned sole
    // torso
    d = smin(d, ellipsoid(x, y, z, 0, 0.33, -0.03, 0.18, 0.22, 0.12), 0.06);
    d = smin(d, capsule(x, y, z, -0.16, 0.49, -0.04, 0.16, 0.49, -0.04, 0.065), 0.06);
    // left arm, hand in lap (palm up)
    d = smin(d, capsule(x, y, z, -0.19, 0.48, -0.03, -0.235, 0.28, 0.02, 0.05, 0.045), 0.04);
    d = smin(d, capsule(x, y, z, -0.235, 0.28, 0.02, -0.05, 0.17, 0.13, 0.042, 0.036), 0.03);
    d = smin(d, ellipsoid(x, y, z, 0.0, 0.165, 0.135, 0.065, 0.02, 0.042), 0.02);
    // right arm reaching over the knee
    d = smin(d, capsule(x, y, z, 0.19, 0.48, -0.03, 0.245, 0.28, 0.04, 0.05, 0.045), 0.04);
    if (!broken) {
      d = smin(d, capsule(x, y, z, 0.245, 0.28, 0.04, 0.24, 0.13, 0.2, 0.042, 0.035), 0.03);
      d = smin(d, ellipsoid(x, y, z, 0.24, 0.085, 0.235, 0.033, 0.06, 0.024), 0.02);
    } else {
      // jagged stump of the forearm
      const stump = capsule(x, y, z, 0.245, 0.28, 0.04, 0.243, 0.2, 0.12, 0.042, 0.038);
      d = smin(d, stump + noise.noise3D(x * 60, y * 60, z * 60) * 0.006, 0.03);
    }
    // neck + head
    d = smin(d, capsule(x, y, z, 0, 0.53, -0.03, 0, 0.62, -0.015, 0.05), 0.03);
    let h = ellipsoid(x, y, z, 0, 0.715, 0.0, 0.08, 0.097, 0.088);
    h = smin(h, ellipsoid(x, y, z, 0, 0.665, 0.02, 0.064, 0.058, 0.07), 0.03);
    h = smin(h, capsule(x, y, z, 0, 0.73, 0.077, 0, 0.69, 0.098, 0.009, 0.011), 0.01); // nose
    h = smin(h, sphere(x, y, z, 0, 0.687, 0.097, 0.013), 0.008);
    h = ssub(h, ellipsoid(ax, y, z, 0.029, 0.718, 0.082, 0.019, 0.008, 0.014), 0.008); // lowered eyes
    h = smin(h, ellipsoid(x, y, z, 0, 0.655, 0.078, 0.022, 0.01, 0.016), 0.01); // lips
    h = smin(h, ellipsoid(ax, y, z, 0.083, 0.68, 0.0, 0.014, 0.075, 0.024), 0.01); // long ears
    // curls on the scalp + ushnisha + flame
    if (y > 0.73 || (y > 0.68 && z < -0.02)) {
      const cr = 0.5 + 0.5 * sin(x * 210) * sin(y * 210) * sin(z * 210);
      h -= 0.006 * cr * sat((y - 0.7) * 30);
    }
    h = smin(h, sphere(x, y, z, 0, 0.805, -0.005, 0.052), 0.02);
    h = smin(h, capsule(x, y, z, 0, 0.83, -0.005, 0, 0.98, 0.0, 0.032, 0.004), 0.015);
    d = smin(d, h, 0.02);
    return d;
  };
}
const STONE = C(0xbdb6a6), STONE_D = C(0x6e685c), GOLD_FLAKE = C(0xc89a40);
function buddhaColor(gilt) {
  return (x, y, z, nx, ny, nz, out) => {
    out.copy(STONE);
    const n = noise.noise3D(x * 9, y * 9, z * 9);
    lerpC(out, out, STONE_D, sat(0.25 + n * 0.5) * 0.5);
    // robe sash over left shoulder (slightly darker band)
    const sash = band(x * 0.8 + (y - 0.4) * 0.9, 0.05) * (y > 0.2 && y < 0.55 && x < 0.1 ? 1 : 0);
    lerpC(out, out, STONE_D, sash * 0.3);
    // remnants of gilding in protected areas
    if (gilt && ny < 0.3 && noise.noise3D(x * 14 + 3, y * 14, z * 14) > 0.25) lerpC(out, out, GOLD_FLAKE, gilt);
    return out;
  };
}
/** Seated Buddha unit geometry (height ~1). */
export function buddhaSeatedGeo(broken = false, detail = 1) {
  const cell = 0.0085 / detail;
  return sculpt('buddhaSeated:' + broken + ':' + detail, buddhaSeatedSDF(broken), [-0.42, -0.02, -0.2, 0.42, 1.0, 0.3], cell, { color: buddhaColor(0.35), smooth: 1 });
}

/** Standing Buddha (abhaya, one hand raised). Unit height 1.0 incl. flame. */
function buddhaStandingSDF(broken) {
  return (x, y, z) => {
    const ax = abs(x);
    // robe column flaring at the hem
    let d = capsule(x, y, z, 0, 0.04, 0.0, 0, 0.55, -0.01, 0.1, 0.095);
    d = smin(d, ellipsoid(x, y, z, 0, 0.1, 0.0, 0.12, 0.1, 0.085), 0.05);
    d = smin(d, ellipsoid(x, y, z, 0, 0.6, -0.01, 0.105, 0.11, 0.07), 0.05); // chest
    d = smin(d, capsule(x, y, z, -0.1, 0.68, -0.015, 0.1, 0.68, -0.015, 0.04), 0.04);
    // left arm hanging, robe falling from it
    d = smin(d, capsule(x, y, z, -0.12, 0.67, -0.01, -0.14, 0.42, 0.0, 0.034, 0.03), 0.03);
    d = smin(d, rbox(x, y, z, -0.135, 0.3, 0.0, 0.025, 0.14, 0.04, 0.02), 0.03);
    // right arm raised (abhaya mudra)
    d = smin(d, capsule(x, y, z, 0.12, 0.67, -0.01, 0.15, 0.5, 0.03, 0.034, 0.03), 0.03);
    if (!broken) {
      d = smin(d, capsule(x, y, z, 0.15, 0.5, 0.03, 0.15, 0.6, 0.1, 0.03, 0.027), 0.02);
      d = smin(d, ellipsoid(x, y, z, 0.15, 0.645, 0.11, 0.028, 0.045, 0.01), 0.01);
    }
    d = smin(d, ellipsoid(ax, y, z, 0.05, 0.008, 0.06, 0.03, 0.02, 0.05), 0.02); // feet
    d = smin(d, capsule(x, y, z, 0, 0.7, -0.015, 0, 0.75, -0.01, 0.03), 0.02);
    let h = ellipsoid(x, y, z, 0, 0.815, 0.0, 0.052, 0.063, 0.057);
    h = smin(h, ellipsoid(x, y, z, 0, 0.785, 0.013, 0.042, 0.038, 0.046), 0.02);
    h = smin(h, capsule(x, y, z, 0, 0.825, 0.05, 0, 0.8, 0.064, 0.006, 0.007), 0.007);
    h = ssub(h, ellipsoid(ax, y, z, 0.019, 0.82, 0.054, 0.012, 0.005, 0.009), 0.005);
    h = smin(h, ellipsoid(ax, y, z, 0.054, 0.795, 0.0, 0.009, 0.05, 0.016), 0.007);
    if (y > 0.83) h -= 0.004 * (0.5 + 0.5 * sin(x * 320) * sin(y * 320) * sin(z * 320));
    h = smin(h, sphere(x, y, z, 0, 0.875, -0.004, 0.034), 0.012);
    h = smin(h, capsule(x, y, z, 0, 0.89, 0, 0, 0.99, 0.0, 0.02, 0.003), 0.01);
    return smin(d, h, 0.015);
  };
}
export function buddhaStandingGeo(broken = false) {
  return sculpt('buddhaStanding:' + broken, buddhaStandingSDF(broken), [-0.2, -0.02, -0.14, 0.2, 1.0, 0.16], 0.0062, { color: buddhaColor(0.25), smooth: 1 });
}

// ---------------------------------------------------------------------------
// Guardian lion (Chinese style), seated on its haunches. Unit height ~1. Front +Z.
// mirror=true -> female (cub under left paw) else male (ball under right paw).
// ---------------------------------------------------------------------------
function lionSDF(female) {
  return (x, y, z) => {
    const ax = abs(x);
    let d = ellipsoid(x, y, z, 0, 0.24, -0.1, 0.19, 0.22, 0.22); // haunches
    d = smin(d, ellipsoid(x, y, z, 0, 0.46, 0.04, 0.16, 0.24, 0.15), 0.08); // chest
    d = smin(d, capsule(ax, y, z, 0.1, 0.4, 0.1, 0.11, 0.06, 0.17, 0.052, 0.045), 0.04); // front legs
    d = smin(d, ellipsoid(ax, y, z, 0.11, 0.035, 0.2, 0.055, 0.035, 0.065), 0.02); // paws
    d = smin(d, ellipsoid(ax, y, z, 0.16, 0.06, -0.02, 0.06, 0.05, 0.13), 0.04); // hind feet
    // head + mane
    let h = sphere(x, y, z, 0, 0.73, 0.08, 0.155);
    const mane = 0.5 + 0.5 * sin(x * 70 + y * 20) * sin(y * 70) * sin(z * 70 + x * 10);
    h -= 0.018 * mane * sat((0.2 - z) * 8);
    h = smin(h, ellipsoid(x, y, z, 0, 0.68, 0.21, 0.1, 0.065, 0.08), 0.04); // snout
    h = smin(h, ellipsoid(ax, y, z, 0.06, 0.77, 0.19, 0.035, 0.03, 0.03), 0.02); // bulging eyes
    h = smin(h, ellipsoid(x, y, z, 0, 0.72, 0.27, 0.035, 0.025, 0.025), 0.02); // nose
    h = ssub(h, ellipsoid(x, y, z, 0, 0.635, 0.27, 0.07, 0.024, 0.06), 0.012); // open mouth
    h = smin(h, sphere(x, y, z, 0, 0.64, 0.24, 0.022), 0.005); // pearl in the mouth
    h = smin(h, ellipsoid(ax, y, z, 0.12, 0.85, 0.05, 0.035, 0.04, 0.02), 0.02); // ears
    d = smin(d, h, 0.05);
    // curled tail on the back
    d = smin(d, sphere(x, y, z, 0, 0.35, -0.3, 0.07) - 0.01 * sin(y * 90), 0.04);
    // ball or cub
    if (!female) d = smin(d, sphere(x, y, z, 0.13, 0.075, 0.27, 0.075) - 0.004 * sin(x * 120) * sin(z * 120), 0.01);
    else d = smin(d, ellipsoid(x, y, z, -0.15, 0.08, 0.26, 0.07, 0.06, 0.08), 0.02);
    return d;
  };
}
export function lionGeo(female = false) {
  return sculpt('lion:' + female, lionSDF(female), [-0.28, -0.02, -0.42, 0.28, 0.92, 0.36], 0.011, { color: buddhaColor(0), smooth: 1 });
}

// ---------------------------------------------------------------------------
// Zebra figurine (offerings at dangerous curves). Unit: ~0.36 tall, front +Z.
// ---------------------------------------------------------------------------
function zebraSDF(x, y, z) {
  const ax = abs(x);
  let d = ellipsoid(x, y, z, 0, 0.2, 0, 0.058, 0.055, 0.13);
  d = smin(d, capsule(ax, y, z, 0.035, 0.18, 0.09, 0.035, 0.0, 0.1, 0.02, 0.013), 0.015);
  d = smin(d, capsule(ax, y, z, 0.035, 0.18, -0.09, 0.035, 0.0, -0.1, 0.022, 0.013), 0.015);
  d = smin(d, capsule(x, y, z, 0, 0.23, 0.1, 0, 0.33, 0.15, 0.03, 0.024), 0.02);
  d = smin(d, capsule(x, y, z, 0, 0.335, 0.15, 0, 0.3, 0.225, 0.024, 0.016), 0.012);
  d = smin(d, capsule(ax, y, z, 0.012, 0.35, 0.145, 0.018, 0.385, 0.135, 0.008, 0.004), 0.006);
  d = smin(d, capsule(x, y, z, 0, 0.36, 0.14, 0, 0.26, 0.085, 0.009), 0.006); // mane
  d = smin(d, capsule(x, y, z, 0, 0.22, -0.13, 0, 0.12, -0.16, 0.008, 0.006), 0.01); // tail
  return d;
}
const ZW = C(0xe8e4da), ZB = C(0x16140f);
function zebraColor(x, y, z, nx, ny, nz, out) {
  const s = sin(z * 95 + y * 48 + abs(x) * 20) + 0.25 * sin(y * 130);
  out.copy(s > 0.25 ? ZB : ZW);
  if (y < 0.012 || (z > 0.2 && y < 0.32)) out.copy(ZB); // hooves / muzzle
  return out;
}
export function zebraGeo() {
  return sculpt('zebra', zebraSDF, [-0.08, -0.01, -0.19, 0.08, 0.4, 0.25], 0.0058, { color: zebraColor, smooth: 1 });
}

// ---------------------------------------------------------------------------
// Thai dancer figurine (kneeling, hands in a wai, pointed chada crown). ~0.26 tall.
// ---------------------------------------------------------------------------
function dancerSDF(x, y, z) {
  const ax = abs(x);
  let d = ellipsoid(x, y, z, 0, 0.045, -0.01, 0.06, 0.048, 0.07); // kneeling skirt
  d = smin(d, capsule(x, y, z, 0, 0.06, -0.01, 0, 0.15, 0.0, 0.034, 0.03), 0.02); // torso
  d = smin(d, capsule(x, y, z, -0.032, 0.145, 0, 0.032, 0.145, 0, 0.016), 0.015); // shoulders
  d = smin(d, capsule(ax, y, z, 0.035, 0.14, 0.0, 0.02, 0.11, 0.035, 0.009), 0.01); // upper arms
  d = smin(d, capsule(ax, y, z, 0.02, 0.11, 0.035, 0.004, 0.15, 0.045, 0.008), 0.008); // forearms to wai
  d = smin(d, ellipsoid(x, y, z, 0, 0.165, 0.045, 0.009, 0.022, 0.007), 0.006); // joined hands
  d = smin(d, capsule(x, y, z, 0, 0.16, 0, 0, 0.18, 0, 0.012), 0.008);
  d = smin(d, sphere(x, y, z, 0, 0.197, 0.004, 0.022), 0.008); // head
  d = smin(d, capsule(x, y, z, 0, 0.21, 0, 0, 0.27, -0.002, 0.021, 0.002), 0.006); // chada
  d = smin(d, ellipsoid(ax, y, z, 0.026, 0.21, -0.003, 0.004, 0.016, 0.008), 0.004); // ear flares
  return d;
}
const DGOLD = C(0xd8a840), DSKIN = C(0xf0dcc8), DRED = C(0xa81e2a), DGREEN = C(0x1e6a4a);
function dancerColor(x, y, z, nx, ny, nz, out) {
  if (y > 0.21) return out.copy(DGOLD);
  if (y > 0.175 && hypot(x, z - 0.004) < 0.024 && z > 0.0) return out.copy(DSKIN);
  if (y > 0.1 && z > 0.03) return out.copy(DSKIN);
  if (y < 0.075) return out.copy(abs(sin(x * 120)) > 0.85 ? DGOLD : DRED);
  out.copy(DGREEN);
  if (abs(y - 0.14) < 0.012 || abs(y - 0.075) < 0.008) out.copy(DGOLD);
  return out;
}
export function dancerGeo() {
  return sculpt('dancer', dancerSDF, [-0.075, -0.005, -0.085, 0.075, 0.28, 0.08], 0.0038, { color: dancerColor, smooth: 1 });
}

// ---------------------------------------------------------------------------
// Ta-Yai (grandpa / grandma) little seated figures for the twin spirit house.
// ---------------------------------------------------------------------------
function elderSDF(female) {
  return (x, y, z) => {
    const ax = abs(x);
    let d = ellipsoid(x, y, z, 0, 0.035, 0.01, 0.05, 0.035, 0.05);
    d = smin(d, capsule(x, y, z, 0, 0.04, -0.005, 0, 0.11, -0.005, 0.034, 0.028), 0.02);
    d = smin(d, capsule(ax, y, z, 0.032, 0.105, 0, 0.03, 0.06, 0.035, 0.01), 0.01);
    d = smin(d, sphere(x, y, z, 0, 0.14, 0.003, 0.024), 0.01);
    if (female) d = smin(d, sphere(x, y, z, 0, 0.158, -0.022, 0.012), 0.006);
    return d;
  };
}
const ESKIN = C(0xd8b090), EWHITE = C(0xe8e2d4), EDARK = C(0x3a2a3a), EHAIR = C(0xd8d8d8);
export function elderGeo(female = false) {
  return sculpt('elder:' + female, elderSDF(female), [-0.06, -0.005, -0.05, 0.06, 0.175, 0.07], 0.0035, {
    smooth: 1,
    color: (x, y, z, nx, ny, nz, out) => {
      if (y > 0.122) return out.copy(y > 0.145 && (z < 0.005 || ny > 0.6) ? EHAIR : ESKIN);
      return out.copy(y > 0.075 ? EWHITE : female ? EDARK : C(0x4a4a3a));
    },
  });
}

// ---------------------------------------------------------------------------
// Five-headed naga crest (staircase balustrade end). Unit ~1 tall, front +Z.
// ---------------------------------------------------------------------------
function nagaSDF(x, y, z) {
  let d = capsule(x, y, z, 0, 0.0, -0.25, 0, 0.45, 0.0, 0.11, 0.1); // rising neck
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.42;
    const hx = sin(a) * 0.3, hy = 0.62 + cos(a) * 0.22 - abs(i) * 0.04, hz = 0.05 - abs(i) * 0.03;
    d = smin(d, capsule(x, y, z, 0, 0.42, 0, hx * 0.9, hy - 0.06, hz, 0.075, 0.05), 0.05);
    // head: crest + snout + open jaws
    let h = ellipsoid(x, y, z, hx, hy, hz + 0.03, 0.05, 0.045, 0.075);
    h = smin(h, capsule(x, y, z, hx, hy + 0.03, hz - 0.02, hx * 1.05, hy + 0.11, hz - 0.06, 0.02, 0.006), 0.02); // crest spike
    h = ssub(h, ellipsoid(x, y, z, hx, hy - 0.022, hz + 0.09, 0.035, 0.012, 0.05), 0.01);
    h = smin(h, sphere(abs(x - hx), y, z, 0.026, hy + 0.02, hz + 0.075, 0.012), 0.006);
    d = smin(d, h, 0.03);
  }
  // hood fan behind heads
  d = smin(d, ellipsoid(x, y, z, 0, 0.62, -0.06, 0.36, 0.26, 0.04), 0.06);
  return d;
}
export function nagaGeo() {
  return sculpt('naga5', nagaSDF, [-0.42, -0.12, -0.38, 0.42, 0.98, 0.2], 0.012, { color: buddhaColor(0.15), smooth: 1 });
}
