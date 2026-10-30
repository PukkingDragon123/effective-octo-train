// Texture atlas layout shared by the GLB geometry UVs (baked by Hia Phat's build_chars.py)
// and our painters. Virtual 1024×1024 canvas (y down); textures use flipY=false so
// uv.y == canvas y / 1024. Each region keeps an INSET margin that the painter overfills.
export const ATLAS = 1024;
export const INSET = 5;

export const R = {
  torso: { x: 0, y: 0, w: 512, h: 400 },
  leg: { x: 512, y: 0, w: 288, h: 512 },
  arm: { x: 800, y: 0, w: 224, h: 400 },
  face: { x: 0, y: 400, w: 320, h: 320 },
  scalp: { x: 320, y: 400, w: 192, h: 160 },
  neck: { x: 320, y: 560, w: 192, h: 64 },
  hand: { x: 320, y: 624, w: 192, h: 96 },
  foot: { x: 512, y: 512, w: 192, h: 160 },
  hair: { x: 704, y: 400, w: 320, h: 272 },
  skirt: { x: 0, y: 720, w: 400, h: 200 },
  apron: { x: 400, y: 720, w: 128, h: 200 },
  hat: { x: 528, y: 672, w: 256, h: 128 },
  collar: { x: 784, y: 672, w: 240, h: 48 },
  band: { x: 784, y: 720, w: 240, h: 32 },
  towel: { x: 784, y: 752, w: 240, h: 64 },
  mask: { x: 528, y: 800, w: 128, h: 96 },
  pack: { x: 656, y: 800, w: 128, h: 128 },
  sole: { x: 784, y: 816, w: 120, h: 64 },
  ear: { x: 904, y: 816, w: 120, h: 64 },
  // our additions (unused by the GLB meshes): accessories painted into the atlas
  acc: { x: 0, y: 920, w: 512, h: 104 },
  sash: { x: 512, y: 928, w: 512, h: 96 },
};

/** region-local (s,t ∈ 0..1) -> atlas uv (0..1) */
export function ruv(reg, s, t) {
  const cs = s < 0 ? 0 : s > 1 ? 1 : s, ct = t < 0 ? 0 : t > 1 ? 1 : t;
  return [(reg.x + INSET + cs * (reg.w - 2 * INSET)) / ATLAS, (reg.y + INSET + ct * (reg.h - 2 * INSET)) / ATLAS];
}

// ---- landmark mappings (reference body: 1.70 m, metres; see build_chars.py)
export const TORSO_TOP = 1.5, TORSO_BOT = 0.78;
export const torsoT = (y) => (TORSO_TOP - y) / (TORSO_TOP - TORSO_BOT);
export const LEG_TOP = 1.0, LEG_BOT = 0.0;
export const legT = (y) => (LEG_TOP - y) / (LEG_TOP - LEG_BOT);
export const ARM_D0 = -0.06, ARM_D1 = 0.56;
export const armT = (d) => (d - ARM_D0) / (ARM_D1 - ARM_D0);
export const NECK_TOP = 1.62, NECK_BOT = 1.4;
export const neckT = (y) => (NECK_TOP - y) / (NECK_TOP - NECK_BOT);
export const HAND_D0 = -0.015, HAND_D1 = 0.2;
export const handT = (d) => (d - HAND_D0) / (HAND_D1 - HAND_D0);
export const FOOT_Z0 = -0.085, FOOT_Z1 = 0.245;
export const footT = (z) => (z - FOOT_Z0) / (FOOT_Z1 - FOOT_Z0);
export const SCALP_TOP = 0.235, SCALP_BOT = -0.035;

/** Face region projection: s = 0.5 + x / FW, t = 0.44 + (eyeY - y) / FW with FW = iod / 0.28 (model metres). */
export function faceST(t, x, y) {
  const FW = t.iod / 0.28;
  return [0.5 + x / FW, 0.44 + (t.eyeMid.y - y) / FW];
}
