// Appearance specs for the humanoid creatures (built through the characters system: painted
// faces, eyes, hair, cloth, the ghost deformation layer and gore) + small shared helpers.
import * as THREE from 'three';
import { createHumanoid } from '../characters/index.js';

export const SPECS = {
  yaiSpeed: {
    id: 'yaiSpeed', sex: 'f', age: 86, height: 1.42, build: 'thin', skinTone: 0.62,
    hair: { style: 'bun', color: 0xd9d4ca }, outfit: { type: 'old-woman-sarong', top: '#cfc5ae', bottom: '#2c2836', accent: '#6b4a2a', shoes: 'barefoot' },
    face: { seed: 8686, wrinkles: 1, smile: 0.35, eyeSize: 0.9, cheek: 0.9 },
    ghost: { pale: 0.5, eyes: 'white', decay: 0.25, bloodStains: 0.05 }, noBlink: true,
  },
  krasue: {
    id: 'krasue', sex: 'f', age: 28, height: 1.6, build: 'thin', skinTone: 0.34,
    hair: { style: 'long', color: 0x060505, wet: 0.8 }, outfit: { type: 'dress', top: '#cfc8b8' },
    face: { seed: 3131, eyeSize: 1.06, smile: 0.1 }, ghost: { pale: 0.45, eyes: 'glow', wet: 0.7, bloodStains: 0.15 }, noBlink: true,
  },
  krahang: {
    id: 'krahang', sex: 'm', age: 58, height: 1.66, build: 'thin', skinTone: 0.72,
    hair: { style: 'gray-short', color: 0x3a3632 }, outfit: { type: 'farmer', top: '#26283a', bottom: '#1f2230', accent: '#7a2a24', shoes: 'barefoot', sleeve: 'none' },
    face: { seed: 5858, wrinkles: 0.85, smile: 0.2, noseWidth: 1.12 }, ghost: { pale: 0.3, eyes: 'glow', decay: 0.2 }, noBlink: true,
  },
  nangTani: {
    id: 'nangTani', sex: 'f', age: 24, height: 1.6, build: 'average', skinTone: 0.36,
    hair: { style: 'long', color: 0x0a0807 }, outfit: { type: 'sabai', top: '#3f6b47', bottom: '#2f4a2c', accent: '#c9a347' },
    face: { seed: 2424, smile: 0.25, eyeSize: 1.04 }, ghost: { pale: 0.35, wet: 0.1 }, noBlink: true,
  },
  wireCrawler: {
    id: 'wireCrawler', sex: 'm', age: 40, height: 1.95, build: 'thin', skinTone: 0.18,
    hair: { style: 'long', color: 0x0b0a09, wet: 0.6 }, outfit: { type: 'shroud', top: '#8f8a7c' },
    face: { seed: 7171, eyeSize: 1.12, jaw: 1.1, cheek: 0.75 }, ghost: { pale: 0.95, eyes: 'black', decay: 0.55, wet: 0.5, bloodStains: 0.2 }, noBlink: true,
  },
  forestGiant: {
    id: 'forestGiant', sex: 'm', age: 70, height: 13, build: 'thin', skinTone: 0.85,
    hair: { style: 'long', color: 0x15130f, wet: 0.4 }, outfit: { type: 'shroud', top: '#2a2a22' },
    face: { seed: 1313, eyeSize: 0.9, jaw: 1.2, cheek: 0.7, wrinkles: 1 }, ghost: { pale: 0.15, eyes: 'glow', decay: 0.6, wet: 0.3 }, noBlink: true, quality: 0.6,
  },
  phiTaiHongM: {
    id: 'phiTaiHong', sex: 'm', age: 27, height: 1.7, build: 'average', skinTone: 0.55,
    hair: { style: 'messy', color: 0x0d0b0a, wet: 0.7 }, outfit: { type: 'hoodie-jeans', top: '#3b3f3a', bottom: '#2a3444', shoes: 'sandals' },
    face: { seed: 6262, jaw: 1.05 }, ghost: { pale: 0.8, decay: 0.45, bloodStains: 0.75, wet: 0.7 }, noBlink: true,
  },
  phiTaiHongF: {
    id: 'phiTaiHongF', sex: 'f', age: 22, height: 1.58, build: 'thin', skinTone: 0.4,
    hair: { style: 'long', color: 0x070605, wet: 0.9 }, outfit: { type: 'tshirt-pants', top: '#8a7f78', bottom: '#2a2e38', shoes: 'barefoot' },
    face: { seed: 6363 }, ghost: { pale: 0.85, decay: 0.45, bloodStains: 0.75, wet: 0.8 }, noBlink: true,
  },
  windowWoman: {
    id: 'windowGhost', sex: 'f', age: 24, height: 1.6, build: 'thin', skinTone: 0.3,
    hair: { style: 'long', color: 0x050404, wet: 1 }, outfit: { type: 'dress', top: '#e2ded2', shoes: 'barefoot' },
    face: { seed: 2202, eyeSize: 1.06 }, ghost: { pale: 0.9, eyes: 'black', wet: 0.8, decay: 0.2, bloodStains: 0.25 }, noBlink: true,
  },
  tallMan: {
    id: 'tallMan', sex: 'm', age: 45, height: 2.05, build: 'thin', skinTone: 0.25,
    hair: { style: 'messy', color: 0x0a0909, wet: 0.5 }, outfit: { type: 'shirt-slacks', top: '#3a3a36', bottom: '#1e1e1e', shoes: 'shoes' },
    face: { seed: 4141, cheek: 0.7, jaw: 1.15 }, ghost: { pale: 0.85, eyes: 'black', decay: 0.3 }, noBlink: true,
  },
  roadFigure: {
    id: 'roadFigure', sex: 'f', age: 30, height: 1.72, build: 'thin', skinTone: 0.2,
    hair: { style: 'long', color: 0x040303, wet: 0.9 }, outfit: { type: 'shroud', top: '#d4d0c4' },
    face: { seed: 9191, eyeSize: 1.08 }, ghost: { pale: 1, eyes: 'black', wet: 0.6, decay: 0.3, bloodStains: 0.3 }, noBlink: true,
  },
  roofCrawler: {
    id: 'roofCrawler', sex: 'f', age: 35, height: 1.75, build: 'thin', skinTone: 0.2,
    hair: { style: 'long', color: 0x040303, wet: 1 }, outfit: { type: 'shroud', top: '#b9b4a6' },
    face: { seed: 9393, eyeSize: 1.1 }, ghost: { pale: 1, eyes: 'black', wet: 0.7, decay: 0.45, bloodStains: 0.45 }, noBlink: true,
  },
  shadowFigure: {
    id: 'shadowFigure', sex: 'm', age: 40, height: 1.8, build: 'thin', skinTone: 1,
    hair: { style: 'messy', color: 0x030303 }, outfit: { type: 'farmer', top: '#0d0d0f', bottom: '#0b0b0c' },
    face: { seed: 1111 }, ghost: { pale: 0, eyes: 'black', decay: 0.2 }, noBlink: true, quality: 0.5,
  },
  alms: (i) => ({
    id: 'almsMonk' + i, sex: 'm', age: [62, 38, 24, 12, 45][i % 5], height: [1.66, 1.72, 1.7, 1.42, 1.68][i % 5], build: 'thin', skinTone: 0.5 + (i % 3) * 0.08,
    hair: { style: 'shaved' }, outfit: { type: 'monk-robe', top: ['#c9671e', '#b85c1c', '#d07a2a', '#c46a24', '#b9601f'][i % 5] },
    accessories: ['shoulder-bag'], face: { seed: 7000 + i * 31, smile: 0.25 },
  }),
  villager: (i) => ({
    id: 'villager' + i, sex: i % 2 ? 'f' : 'm', age: [66, 54, 71, 40][i % 4], build: 'average', skinTone: 0.5 + (i % 3) * 0.07,
    hair: { style: i % 2 ? 'bun' : 'gray-short' }, outfit: { type: i % 2 ? 'old-woman-sarong' : 'farmer' }, face: { seed: 8100 + i * 17, smile: 0.4 },
  }),
};

/** createHumanoid(spec) + layer + optional ghost targets. */
export function human(spec, opts = {}) {
  const h = createHumanoid({ ...spec, ...(opts.override || {}) });
  if (opts.layer !== undefined) h.setLayer(opts.layer);
  if (opts.ghost) h.setGhost(opts.ghost, 100);
  return h;
}

/** Template bone (Quaternius name) on a humanoid. */
export function bone(h, name) {
  return h.bones?.[name] || h.rig?.bone?.(name) || null;
}

const _v = new THREE.Vector3();
/** Ground height under a world point (world.getHeight if available). */
export function groundAt(world, x, z, fallback = 0) {
  try {
    const y = world?.getHeight?.(x, z);
    return Number.isFinite(y) ? y : fallback;
  } catch (e) {
    return fallback;
  }
}
export { _v };
