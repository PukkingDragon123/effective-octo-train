// Real eyeballs: painted sclera / iris / pupil texture (front planar UVs), spheres skinned to
// the eye bones (which the look-at layer rotates), plus a dark socket cup behind each eye
// (skinned to the head) so the lid apertures never show through the head.
import * as THREE from 'three';
import { makeRng } from '../../core/math.js';
import { css } from './painter.js';

const texCache = new Map();

/** style: 'normal' | 'black' | 'white' | 'glow'; iris colour hex */
export function eyeTexture(style = 'normal', iris = '#3a2416') {
  const key = style + iris;
  if (texCache.has(key)) return texCache.get(key);
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const r = makeRng(77);
  const c = S / 2;
  // socket cup colour in the corners (outside the projected disc)
  g.fillStyle = '#2a0f0d';
  g.fillRect(0, 0, S, S);
  const irisR = S * 0.235, pupR = S * (style === 'black' ? 0.2 : 0.085);
  // sclera
  const scl = style === 'black' ? '#060505' : style === 'white' ? '#d8d6cc' : style === 'glow' ? '#3a2a24' : '#e6ded2';
  const gr = g.createRadialGradient(c, c, irisR, c, c, S * 0.5);
  gr.addColorStop(0, scl);
  gr.addColorStop(0.7, style === 'normal' ? '#d6c4b6' : scl);
  gr.addColorStop(1, style === 'normal' ? '#b08a80' : scl);
  g.fillStyle = gr;
  g.beginPath(); g.arc(c, c, S * 0.5, 0, Math.PI * 2); g.fill();
  if (style === 'normal') {
    // faint veins toward the corners
    g.strokeStyle = 'rgba(160,60,55,0.22)';
    g.lineWidth = 0.8;
    for (let i = 0; i < 18; i++) {
      const a = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.2;
      let x = c + Math.cos(a) * S * 0.48, y = c + Math.sin(a) * S * 0.48;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x -= Math.cos(a) * S * 0.035 + (r() - 0.5) * 4; y -= Math.sin(a) * S * 0.035 + (r() - 0.5) * 4; g.lineTo(x, y); }
      g.stroke();
    }
  }
  if (style !== 'white') {
    // iris: radial fibres, darker limbal ring, collarette
    const base = style === 'glow' ? '#ff6a2a' : style === 'black' ? '#030303' : iris;
    const ig = g.createRadialGradient(c, c, pupR, c, c, irisR);
    ig.addColorStop(0, style === 'glow' ? '#ffd080' : '#1a0f08');
    ig.addColorStop(0.25, base);
    ig.addColorStop(0.85, base);
    ig.addColorStop(1, '#0c0705');
    g.fillStyle = ig;
    g.beginPath(); g.arc(c, c, irisR, 0, Math.PI * 2); g.fill();
    if (style === 'normal') {
      for (let i = 0; i < 140; i++) {
        const a = r() * Math.PI * 2, r0 = pupR * (1 + r() * 0.3), r1 = irisR * (0.6 + r() * 0.38);
        g.strokeStyle = r() < 0.5 ? 'rgba(120,80,45,0.35)' : 'rgba(15,8,4,0.35)';
        g.lineWidth = 0.6 + r();
        g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a + (r() - 0.5) * 0.1) * r1, c + Math.sin(a) * r1); g.stroke();
      }
      g.strokeStyle = 'rgba(140,95,55,0.3)'; g.lineWidth = 2;
      g.beginPath(); g.arc(c, c, pupR * 1.7, 0, Math.PI * 2); g.stroke();
    }
    // pupil
    g.fillStyle = style === 'glow' ? '#2a0500' : '#050303';
    g.beginPath(); g.arc(c, c, pupR, 0, Math.PI * 2); g.fill();
  } else {
    // milky: faint grey iris ghost
    g.fillStyle = 'rgba(150,150,150,0.25)';
    g.beginPath(); g.arc(c, c, irisR, 0, Math.PI * 2); g.fill();
  }
  void css;
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

/** Eyeball + socket cup geometry for both eyes (bind space), skinned to eye_l / eye_r / Head. */
export function buildEyeGeometry(t, scale = 1) {
  const re = t.eyeRadius * scale;
  const parts = [];
  const iEye = [t.index.eye_l, t.index.eye_r];
  const iHead = t.index.Head;
  for (let s = 0; s < 2; s++) {
    const center = t.eyeCenters[s];
    const sph = new THREE.SphereGeometry(re, 24, 16);
    sph.rotateX(Math.PI / 2); // poles to ±Z: dense rings around the cornea
    const p = sph.attributes.position, uv = sph.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // cornea bulge
      const k = Math.max(0, z / re);
      const bul = k > 0.86 ? (k - 0.86) * 0.08 * re / 0.14 : 0;
      p.setZ(i, z + bul);
      uv.setXY(i, 0.5 + x / (2 * re), 0.5 - y / (2 * re));
    }
    sph.computeVertexNormals();
    sph.translate(center.x, center.y, center.z);
    parts.push({ g: sph, bone: iEye[s] });
    // socket cup: hemisphere behind the eye, inner side facing forward
    const cup = new THREE.SphereGeometry(re * 1.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    cup.rotateX(-Math.PI / 2); // open side toward +Z
    cup.scale(1.15, 0.85, 1);
    const cuv = cup.attributes.uv;
    for (let i = 0; i < cuv.count; i++) cuv.setXY(i, 0.02, 0.02);
    // flip winding (inside visible)
    const idx = cup.index.array;
    for (let i = 0; i < idx.length; i += 3) { const a = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = a; }
    const cn = cup.attributes.normal;
    for (let i = 0; i < cn.count; i++) cn.setXYZ(i, -cn.getX(i), -cn.getY(i), -cn.getZ(i));
    cup.translate(center.x, center.y, center.z + re * 0.15);
    parts.push({ g: cup, bone: iHead });
  }
  // merge with skin attributes
  let nV = 0, nI = 0;
  for (const p of parts) { nV += p.g.attributes.position.count; nI += p.g.index.count; }
  const P = new Float32Array(nV * 3), N = new Float32Array(nV * 3), U = new Float32Array(nV * 2);
  const SI = new Uint16Array(nV * 4), SW = new Float32Array(nV * 4), I = new Uint32Array(nI);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.g, n = g.attributes.position.count;
    P.set(g.attributes.position.array, vo * 3);
    N.set(g.attributes.normal.array, vo * 3);
    U.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < n; i++) { SI[(vo + i) * 4] = p.bone; SW[(vo + i) * 4] = 1; }
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) I[io + i] = idx[i] + vo;
    vo += n; io += idx.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  return geo;
}
