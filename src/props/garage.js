// อู่ กม.9 — Ah Kong's garage (intro + every loop restart). Open-front shophouse
// workshop: corrugated roof, cluttered shelves, workbench, tyres, calendar, painting,
// transistor radio, standing fan, ONE hanging fluorescent tube, a plastic table where the
// old man sits, a small Chinese wall altar glowing red, the 'อู่ กม.9' sign, a dog bowl.
// Front (open side) faces +Z toward the road.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, extrude, smoothPath, blob, makeRng, noise } from './lib/kit.js';
import { mat, glowMat, signMat, texMat, stainTex, crackTex, paintingTex, photoTex, clockTex, noticeTex, graffitiTex } from './lib/materials.js';
import { lightSpec, attachFlicker, LIGHT_PRESETS } from './lib/lights.js';
import { G, PAL, bottle, can, oilCan, cup, teacup, bowl, plate, plasticChair, plasticStool, foldTable, shelfUnit, tire, oilDrum, crate, coil, incensePot, fruitPlate, candle, garland, waterJar } from './lib/small.js';
import { dancerGeo } from './lib/figures.js';
import { hangingFluorescent } from './sala.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sagCurveG = (a, b) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= 4 * t * (1 - t) * 0.12; pts.push(p); } return pts; };
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}

/** Fill a shelf (kit space: x0..x0+w at height y, depth z0±d/2) with random garage stuff. */
function fillShelf(k, x0, y, z0, w, d, rng, theme = 'mixed') {
  let x = x0 + 0.04;
  while (x < x0 + w - 0.08) {
    const r = rng();
    const zj = z0 + (rng() - 0.5) * d * 0.4;
    if (theme !== 'parts' && r < 0.32) {
      const kind = rng() < 0.5 ? 'whisky' : rng() < 0.5 ? 'beer' : 'water';
      bottle(k, { p: [x + 0.04, y, zj], kind, label: rng() < 0.8, color: kind === 'whisky' ? (rng() < 0.5 ? 0x7a4a1a : 0x3a5a2a) : undefined, labelColor: rng() < 0.5 ? 0xd8c8a0 : 0xc84a2a });
      x += 0.09;
    } else if (r < 0.5) {
      oilCan(k, { p: [x + 0.06, y, zj], color: [0x2a5a8a, 0xc8a020, 0x8a2a1a, 0x2a6a3a][Math.floor(rng() * 4)], r: (rng() - 0.5) * 0.3 });
      x += 0.14;
    } else if (r < 0.64) {
      can(k, { p: [x + 0.05, y, zj], h: 0.1 + rng() * 0.12, rad: 0.04 + rng() * 0.03, color: [0xb0a080, 0x6a6a6a, 0xa03020, 0x2a4a6a][Math.floor(rng() * 4)], rust: rng() < 0.4, spout: rng() < 0.3 });
      x += 0.11;
    } else if (r < 0.82) {
      // cardboard parts box
      const bw = 0.12 + rng() * 0.2, bh = 0.08 + rng() * 0.15;
      k.add(mat('paper'), G(`pbox:${bw.toFixed(2)}:${bh.toFixed(2)}`, () => bbox(bw, bh, d * 0.7, 0.006, 0.2)), { p: [x + bw / 2, y, z0], r: (rng() - 0.5) * 0.15, color: rng() < 0.5 ? 0xa8845a : 0x9a7a50, w: { dust: 0.5, grime: 0.2, grimeH: 0.05, ground: y } });
      x += bw + 0.02;
    } else {
      // spare parts: brake disc / gear / spark plug box
      if (rng() < 0.5) {
        k.add(mat('rust'), G('disc', () => cyl(0.11, 0.11, 0.025, 16, 0.004)), { p: [x + 0.11, y + 0.11, zj], r: [Math.PI / 2 - 0.2, 0, 0], color: 0x7a5a40 });
        x += 0.24;
      } else {
        k.add(mat('metal'), G('gear', () => torus(0.06, 0.025, 6, 16)), { p: [x + 0.06, y + 0.025, zj], r: [Math.PI / 2, 0, 0], color: 0x6a6a64, jitter: 0.004, jitterFreq: 60 });
        x += 0.14;
      }
    }
  }
}

/** Wrench / screwdriver / hammer silhouettes hung on a pegboard (kit space, board facing +Z). */
function pegTools(k, x0, y0, z, rng) {
  for (let i = 0; i < 9; i++) {
    const x = x0 + i * 0.13 + (rng() - 0.5) * 0.02, y = y0 + (rng() - 0.5) * 0.15;
    const t = i % 3;
    if (t === 0) {
      k.add(mat('galv'), G('wrench', () => bevelBox(0.025, 0.24, 0.008, 0.004, 0.1)), { p: [x, y - 0.12, z], color: 0xa8a8a0, w: false });
      k.add(mat('galv'), G('wrenchhead', () => torus(0.022, 0.008, 4, 10)), { p: [x, y + 0.01, z], color: 0xa8a8a0, w: false });
    } else if (t === 1) {
      k.add(mat('plastic'), G('sdhandle', () => cyl(0.014, 0.014, 0.1, 6, 0.003)), { p: [x, y - 0.02, z + 0.01], color: rng() < 0.5 ? 0xc0302a : 0xd8b030, w: false });
      k.add(mat('galv'), G('sdshaft', () => cyl(0.004, 0.004, 0.14, 4, 0)), { p: [x, y - 0.16, z + 0.01], color: 0x9a9a94, w: false });
    } else {
      k.add(mat('wood'), G('hammerh', () => bbox(0.025, 0.25, 0.025, 0.004, 0.1)), { p: [x, y - 0.22, z + 0.01], color: 0x8a6a40, w: false });
      k.add(mat('metal'), G('hammerhead', () => bevelBox(0.11, 0.035, 0.035, 0.006, 0.1)), { p: [x, y + 0.04, z + 0.01], color: 0x3a3a3a, w: false });
    }
  }
}

/**
 * อู่ กม.9 (intro garage).
 * -> { object, oldManSeat (sit facing the anchor's −Z), taxiSpot (taxi origin; yaw so the
 *      taxi faces the road), bikeSpot, playerArrive, tableAnchor, lampAnchor, lightSpec,
 *      lights, colliders, altarAnchor, radioAnchor, fanAnchor, fanBlades (Object3D, spins),
 *      calendarAnchor, dogBowlAnchor, keysAnchor, ashtrayAnchor, smokeAnchor (mosquito coil),
 *      lampControllers, walkSurfaces }
 */
export function createGarage(opts = {}) {
  const seed = opts.seed ?? 9;
  const rng = makeRng(seed * 37 + 11);
  const group = new THREE.Group();
  group.name = 'garageKM9';
  const k = new Kit(seed, { grime: 0.6, grimeH: 0.8, mossLow: 0.35, mossH: 0.4, streak: 0.55, vary: 0.2, dust: 0.2 });
  const W = 8.4, D = 7.2;
  const HF = 3.7, HB = 3.15; // roof height front/back
  const zF = D / 2, zB = -D / 2;
  const xL = -W / 2, xR = W / 2;
  const out = { object: group, colliders: [], lights: [], lampControllers: [] };
  const roofY = (z) => HB + ((z - zB) / D) * (HF - HB);

  // ---- floor: oil-stained concrete with a sloped apron to the road ----------------------
  k.add(mat('concrete'), bbox(W + 0.4, 0.12, D + 0.2, 0.02, 0.6), { p: [0, -0.1, 0], color: 0x8e8a80, jitter: 0.004, w: { grime: 0, dust: 0.3, moss: 0.15 } });
  k.add(mat('concrete'), bbox(W + 0.4, 0.1, 1.6, 0.02, 0.6), { p: [0, -0.12, zF + 0.85], r: [0.05, 0, 0], color: 0x88847a, w: { grime: 0.3, moss: 0.5, mossLow: 0.5, mossH: 0.05 } });
  const oil = texMat('oilstain', () => stainTex(seed + 1, '12,10,8'), { transparent: true, decal: true });
  for (let i = 0; i < 6; i++) k.add(oil, G('oilq', () => quad(1.6, 1.6)), { p: [0.4 + (rng() - 0.5) * 3.5, 0.022, (rng() - 0.5) * 4.5], r: [-Math.PI / 2, 0, rng() * 6], s: 0.6 + rng() * 0.8, color: 0xffffff, uv: 'keep', w: false });
  const cr = texMat('crack_g', () => crackTex(seed + 2), { transparent: true, decal: true });
  for (let i = 0; i < 3; i++) k.add(cr, G('crq', () => quad(1.5, 1.5)), { p: [(rng() - 0.5) * 6, 0.023, (rng() - 0.5) * 5], r: [-Math.PI / 2, 0, rng() * 6], color: 0xffffff, uv: 'keep', w: false });

  // ---- walls ---------------------------------------------------------------------------------
  const wallMat = mat('concrete');
  const wallW = { grime: 0.75, grimeH: 1.1, streak: 0.8, streakColor: 0x3a3020, mossLow: 0.4, mossH: 0.5 };
  const paintFn = (axis) => (p, n, c) => {
    if ((axis === 'z' ? n.z : n.x) > 0.5) {
      c.lerp(p.y < 1.05 ? _teal : _cream, 0.75);
      if (Math.abs(p.y - 1.05) < 0.025) c.multiplyScalar(0.6);
      const pn = noise.noise3D(p.x * 2.5, p.y * 2.5, p.z * 2.5);
      if (pn > 0.45) c.lerp(_bare, (pn - 0.45) * 2.5);
    }
  };
  k.add(wallMat, bbox(W, HB + 0.1, 0.2, 0.02, 0.3), { p: [0, 0, zB], color: 0xb8b4a0, w: wallW, colorFn: paintFn('z') });
  k.add(wallMat, bbox(D, HB + 0.1, 0.2, 0.02, 0.3), { p: [xL, 0, 0], r: Math.PI / 2, color: 0xb8b4a0, w: wallW, deform: (p) => { p.y *= 1 + ((p.x + D / 2) / D) * ((HF - HB) / HB) * 1.0; }, colorFn: paintFn('x') });
  // right side: half block wall + rusty corrugated sheet above
  k.add(wallMat, bbox(D, 1.3, 0.2, 0.02, 0.4), { p: [xR, 0, 0], r: Math.PI / 2, color: 0xa8a490, w: wallW });
  k.add(mat('corrugated'), bevelBox(D - 0.3, HB - 1.3, 0.02, 0.005, 0.15), {
    p: [xR + 0.02, 1.3 + (HB - 1.3) / 2, -0.15], r: Math.PI / 2, color: 0x7a6250, w: { grime: 0, streak: 0.4, vary: 0.3 },
    deform: (p) => { p.z += Math.sin(p.x * 2 * Math.PI / 0.076) * 0.012; },
    colorFn: (p, n, c, lp) => { const r = noise.noise2D(lp.x * 3, lp.y * 0.5); c.lerp(_rust, Math.max(0, r) * 0.9); },
  });
  out.colliders.push({ x: 0, z: zB, hx: W / 2, hz: 0.12, yaw: 0 }, { x: xL, z: 0, hx: 0.12, hz: D / 2, yaw: 0 }, { x: xR, z: 0, hx: 0.12, hz: D / 2, yaw: 0 });

  // ---- front frame: steel columns, beam, sign, folded accordion gate --------------------------
  for (const x of [xL + 0.1, xR - 0.1]) {
    k.add(mat('metal'), bbox(0.16, HF, 0.16, 0.01, 0.4), { p: [x, 0, zF - 0.1], color: 0x3a4a52, w: { grime: 0.7, grimeH: 0.9, streak: 0.8, streakColor: 0x6a3a1a } });
    out.colliders.push({ x, z: zF - 0.1, r: 0.12 });
  }
  k.add(mat('metal'), bbox(W + 0.3, 0.26, 0.18, 0.01, 0.4), { p: [0, HF - 0.1, zF - 0.1], color: 0x3a4a52, w: { grime: 0, streak: 0.7, streakColor: 0x6a3a1a } });
  // painted sign board on the fascia
  k.add(mat('metal'), bbox(3.2, 0.8, 0.06, 0.01, 0.3), { p: [-0.6, HF + 0.12, zF + 0.0], color: 0xd8d0b8, w: { grime: 0, streak: 0.9, streakColor: 0x5a3a20 } });
  k.add(signMat('garage_sign', { th: 'อู่ กม.9', en: 'KM 9 GARAGE' }), G('gsign', () => quad(3.0, 0.68)), { p: [-0.6, HF + 0.52, zF + 0.035], color: 0xe0d8c4, uv: 'keep', w: { vary: 0.25, grime: 0, streak: 0.4 } });
  // accordion folding gate bunched on the left
  for (let i = 0; i < 9; i++) {
    k.add(mat('metal'), G('gatebar', () => bbox(0.03, HF - 0.3, 0.03, 0.004, 0.4)), { p: [xL + 0.32 + i * 0.045, 0.02, zF - 0.05 + (i % 2) * 0.05], color: 0x4a5a5a, w: { grime: 0.6, streak: 0.6 } });
  }
  k.add(mat('metal'), bbox(0.5, 0.06, 0.12, 0.005, 0.2), { p: [xL + 0.5, HF - 0.32, zF - 0.03], color: 0x3a4a4a });

  // ---- roof: corrugated sheets on steel purlins, mono-pitch to the back -----------------------
  const slope = Math.atan2(HF - HB, D);
  const rlen = Math.hypot(D + 0.9, HF - HB);
  k.add(mat('corrugated'), bevelBox(W + 0.6, 0.02, rlen, 0.005, [0.2, 1, 0.3]), {
    p: [0, (HF + HB) / 2 + 0.05, 0.2], r: [slope, 0, 0], color: 0x7a5e4a, w: { grime: 0, moss: 0.35, vary: 0.25 },
    deform: (p) => { p.y += Math.sin(p.x * 2 * Math.PI / 0.076) * 0.012 + noise.noise2D(p.x * 0.6, p.z * 0.6) * 0.03; },
    colorFn: (p, n, c, lp) => {
      const r = noise.noise2D(lp.x * 2.6, 0.5) * 0.6 + noise.noise2D(lp.x * 9, lp.z * 0.5) * 0.4;
      c.lerp(_rust, Math.max(0, r) * 0.95);
      // translucent fibreglass skylight sheets (pale)
      if (Math.floor((lp.x + 10) / 0.9) % 4 === 1 && n.y < 0) c.lerp(_fibre, 0.55);
    },
  });
  for (let i = 0; i < 5; i++) {
    const z = zB + 0.3 + i * ((D - 0.4) / 4);
    k.add(mat('metal'), G('purlin', () => bbox(W + 0.5, 0.1, 0.05, 0.005, 0.5)), { p: [0, roofY(z) - 0.12, z], color: 0x4a4a46, w: { grime: 0, streak: 0.6, dust: 0.6 } });
  }
  for (const x of [-W / 4, W / 4]) {
    k.add(mat('metal'), bbox(0.08, 0.12, D, 0.005, 0.5), { p: [x, (HF + HB) / 2 - 0.2, 0], r: [slope, 0, 0], color: 0x4a4a46, w: { grime: 0, dust: 0.5 } });
  }

  // ---- the single fluorescent tube, hanging from the middle purlin ------------------------------
  const lampZ = -0.2;
  k.push([0.3, roofY(lampZ) - 0.2, lampZ]);
  const fl = hangingFluorescent(k, group, { broken: false, dying: false, chain: 0.55, seed: seed + 4 });
  k.pop();
  out.lampControllers.push(...fl.controllers);
  out.lampAnchor = anchor(group, 'lamp', fl.anchorPos.x, fl.anchorPos.y, fl.anchorPos.z);
  out.lightSpec = lightSpec('fluorescent', out.lampAnchor, { intensity: 16, distance: 13, beam: false });
  out.lights.push(out.lightSpec);

  // ---- left wall: tall shelving units crammed with stuff -----------------------------------------
  for (let u = 0; u < 2; u++) {
    const sz = -2.6 + u * 1.35;
    k.at([xL + 0.35, 0, sz], Math.PI / 2, null, () => {
      const ys = shelfUnit(k, { w: 1.25, d: 0.45, h: 2.1, n: 5, color: 0x5a6a68 });
      k.details(() => ys.forEach((y, i) => { if (i > 0) fillShelf(k, -0.6, y, 0, 1.2, 0.4, rng, i < 2 ? 'parts' : 'mixed'); }));
    });
    out.colliders.push({ x: xL + 0.35, z: sz, hx: 0.25, hz: 0.65, yaw: 0 });
  }
  // ---- back wall: workbench, pegboard, calendar, painting, wall altar ------------------------------
  const bx = -1.6, bz = zB + 0.42;
  k.add(mat('wood'), bbox(2.6, 0.07, 0.7, 0.01, 0.3), { p: [bx, 0.86, bz], color: 0x5a4430, w: { dust: 0.2, grime: 0.0 }, colorFn: (p, n, c) => { if (n.y > 0.5 && noise.noise2D(p.x * 4, p.z * 4) > 0.3) c.multiplyScalar(0.55); } });
  for (const sx of [-1.2, 1.2]) for (const sz of [-0.28, 0.28]) k.add(mat('metal'), G('wbleg', () => bbox(0.06, 0.86, 0.06, 0.006, 0.3)), { p: [bx + sx, 0, bz + sz], color: 0x3a3a38, w: { grime: 0.7 } });
  k.add(mat('metal'), bbox(0.8, 0.5, 0.6, 0.01, 0.2), { p: [bx + 0.75, 0.12, bz], color: 0x6a2a20, w: { grime: 0.5, streak: 0.5 }, colorFn: (p, n, c, lp) => { if (n.z > 0.5 && Math.abs(Math.sin(lp.y * 18)) < 0.12) c.multiplyScalar(0.3); } }); // drawers
  // vise
  k.add(mat('metal'), G('vise', () => bbox(0.12, 0.12, 0.28, 0.01, 0.1)), { p: [bx - 1.1, 0.93, bz + 0.2], color: 0x2a4a6a, w: { grime: 0.2 } });
  k.add(mat('metal'), G('vise2', () => bbox(0.16, 0.06, 0.06, 0.008, 0.1)), { p: [bx - 1.1, 1.05, bz + 0.33], color: 0x2a4a6a });
  // pegboard + tools
  k.add(mat('wood'), bbox(1.8, 0.9, 0.02, 0.004, 0.3), { p: [bx, 1.25, zB + 0.11], color: 0x8a7458, w: { grime: 0, streak: 0.5, dust: 0.3 }, colorFn: (p, n, c, lp) => { if (Math.sin(lp.x * 160) * Math.sin(lp.y * 160) > 0.92) c.multiplyScalar(0.3); } });
  k.details(() => pegTools(k, bx - 0.75, 1.85, zB + 0.13, rng));
  // stuff on the bench: radio, tools, a jar of screws, thermos, rags
  k.details(() => {
    // transistor radio (pink-red like reference 5) — on the right end of the bench
    k.at([bx + 0.9, 0.895, bz + 0.05], -0.25, null, () => {
      k.add(mat('plastic'), G('radio', () => bevelBox(0.34, 0.2, 0.11, 0.025, 0.06, 2)), { p: [0, 0.1, 0], color: 0xc85a6a, w: { dust: 0.4, grime: 0 } });
      k.add(mat('galv'), G('grill', () => bbox(0.16, 0.14, 0.01, 0.003, 0.05)), { p: [-0.07, 0.03, 0.055], color: 0xb8b8b0, colorFn: (p, n, c, lp) => { if (Math.sin(lp.x * 300) * Math.sin(lp.y * 300) > 0.3) c.multiplyScalar(0.3); }, w: false });
      k.add(mat('ceramic'), G('dial', () => bbox(0.1, 0.05, 0.008, 0.002, 0.05)), { p: [0.09, 0.12, 0.056], color: 0xe8dcb0, w: false });
      k.add(mat('plastic'), G('knob', () => cyl(0.018, 0.018, 0.02, 10, 0.003).rotateX(Math.PI / 2)), { p: [0.09, 0.06, 0.06], color: 0xe8e0d0, w: false });
      k.add(mat('galv'), G('antenna', () => cyl(0.003, 0.004, 0.42, 4, 0)), { p: [0.13, 0.2, -0.03], r: [0, 0, -0.5], color: 0xc8c8c0, w: false });
      k.add(mat('plastic'), G('handle', () => torus(0.09, 0.008, 4, 12, Math.PI)), { p: [0, 0.2, 0], color: 0x3a3a3a, w: false });
    });
    can(k, { p: [bx - 0.5, 0.895, bz - 0.1], h: 0.14, rad: 0.05, color: 0x9a9080 });
    k.add(mat('plastic'), G('thermos', () => cyl(0.06, 0.06, 0.32, 12, 0.02, 2)), { p: [bx + 0.3, 0.895, bz - 0.15], color: 0x2a6a5a, w: { grime: 0 } });
    k.add(mat('cloth_static'), G('rag', () => bevelBox(0.3, 0.03, 0.2, 0.012, 0.05)), { p: [bx - 0.2, 0.9, bz + 0.15], r: 0.6, color: 0x5a4a3a, jitter: 0.01, jitterFreq: 20, w: { vary: 0.3 } });
    for (let i = 0; i < 3; i++) k.add(mat('galv'), G('wrenchB', () => bevelBox(0.025, 0.008, 0.2, 0.004, 0.1)), { p: [bx - 0.7 + i * 0.07, 0.9, bz + 0.1], r: rng() * 1.5, color: 0xa0a098, w: false });
  });
  // calendar (signTex) + framed painting + family photo on the back wall
  k.add(signMat('calendar', { year: 2537 }), G('calendarq', () => quad(0.5, 0.75, 2, 3)), { p: [0.9, 1.75, zB + 0.11], r: [0, 0, 0.02], color: 0xe0d8c8, uv: 'keep', w: { vary: 0.3, grime: 0 }, deform: (p) => { p.z += Math.max(0, -p.y - 0.2) * 0.12; } });
  out.calendarAnchor = anchor(group, 'calendar', 0.9, 1.75, zB + 0.13);
  // ornate gold frame + abstract flame painting (reference 5)
  k.at([xL + 0.11, 1.75, 0.6], Math.PI / 2, null, () => {
    const fr = new THREE.Shape();
    fr.moveTo(-0.42, -0.52); fr.lineTo(0.42, -0.52); fr.lineTo(0.42, 0.52); fr.lineTo(-0.42, 0.52); fr.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.33, -0.43); hole.lineTo(0.33, -0.43); hole.lineTo(0.33, 0.43); hole.lineTo(-0.33, 0.43); hole.closePath();
    fr.holes.push(hole);
    k.add(mat('gold'), G('frame', () => extrude(fr, 0.06, 0.015)), { color: 0xb88a3a, w: { grime: 0, dust: 0.5, vary: 0.3 }, colorFn: (p, n, c, lp) => { if (Math.sin(lp.x * 60 + lp.y * 60) > 0.6) c.multiplyScalar(0.6); } });
    k.add(texMat('painting', () => paintingTex(seed), {}), G('paintq', () => quad(0.67, 0.87)), { p: [0, 0, 0.012], color: 0xffffff, uv: 'keep', w: false });
  });
  // old photo of a young man with a taxi, tucked into the frame corner
  k.add(texMat('photoG', () => photoTex(2), {}), G('photoq', () => quad(0.09, 0.12)), { p: [xL + 0.15, 1.35, 0.95], r: [0, Math.PI / 2, 0.15], color: 0xffffff, uv: 'keep', w: false });
  // wall clock (stopped)
  k.at([2.3, 2.35, zB + 0.12], null, null, () => {
    k.add(mat('plastic'), G('clockRim', () => cyl(0.16, 0.16, 0.045, 20, 0.01).rotateX(Math.PI / 2)), { color: 0x2a2a2a, w: { dust: 0.5, grime: 0 } });
    k.add(texMat('clock', () => clockTex(), {}), G('clockFace', () => new THREE.CircleGeometry(0.14, 20)), { p: [0, 0, 0.024], color: 0xd8d0b8, uv: 'keep', w: false });
  });
  // notices + a little graffiti/tally marks
  k.add(texMat('notice3', () => noticeTex(3), { decal: true }), G('noticeq', () => quad(0.21, 0.29)), { p: [1.5, 1.6, zB + 0.11], r: [0, 0, -0.05], color: 0xffffff, uv: 'keep', w: false });
  k.add(signMat('poster', { variant: 1 }), G('gposter', () => quad(0.45, 0.62)), { p: [xR - 0.11, 2.05, -1.6], r: [0, -Math.PI / 2, 0.03], color: 0xc8c0b0, uv: 'keep', w: { vary: 0.35, grime: 0 } });

  // ---- Chinese wall altar high on the back wall, glowing red -----------------------------
  const ax = -0.15, ay = 2.15, az = zB + 0.3;
  k.at([ax, ay, az], null, null, () => {
    k.add(mat('lacquer'), bbox(0.7, 0.04, 0.38, 0.01, 0.2), { color: 0x8a1a12, w: false }); // shelf
    for (const s of [-1, 1]) k.add(mat('metal'), G('abracket', () => bbox(0.03, 0.25, 0.3, 0.004, 0.1)), { p: [s * 0.3, -0.25, -0.02], color: 0x5a1a12, w: false });
    k.add(mat('lacquer'), bbox(0.5, 0.48, 0.24, 0.01, 0.15), { p: [0, 0.04, -0.06], color: 0x9a1a12, w: { grime: 0, streak: 0.4 } });
    k.add(mat('dark'), bbox(0.36, 0.34, 0.02, 0.004, 0.1), { p: [0, 0.08, 0.06], color: 0x2a0604, w: false });
    k.add(mat('gold'), G('altarTopG', () => bevelBox(0.58, 0.06, 0.3, 0.01, 0.1)), { p: [0, 0.55, -0.06], color: 0xd8a848, w: false, deform: (p) => { p.y += Math.pow(Math.abs(p.x) / 0.29, 4) * 0.04; } });
    k.add(mat('gold'), dancerGeo(), { p: [0, 0.09, 0.0], s: 0.95, color: 0xe0b860, w: false });
    k.add(signMat('couplet', { text: 'ฟ้าดินคุ้มครอง', side: 0 }), G('acouplet', () => quad(0.3, 0.06)), { p: [0, 0.46, 0.065], color: 0xffffff, uv: 'keep', w: false });
    incensePot(k, { p: [0, 0.04, 0.12], rad: 0.045, metal: true, color: 0xb08a40, sticks: 9, seed: 3, lit: 0.6 });
    fruitPlate(k, { p: [0.22, 0.04, 0.1], kind: 'orange', s: 0.55, seed: 4 });
    teacup(k, { p: [-0.15, 0.04, 0.12] });
    for (const s of [-1, 1]) {
      k.add(mat('gold'), G('lotusS', () => lathe([[0, 0], [0.02, 0], [0.026, 0.015], [0.036, 0.03], [0.022, 0.034], [0, 0.03]], 10)), { p: [s * 0.27, 0.04, 0.1], color: 0xd8a848, w: false });
      k.add(glowMat('red'), G('redbulbS', () => sphere(0.022, 10, 8).scale(1, 1.35, 1)), { p: [s * 0.27, 0.095, 0.1], color: 0xffffff, w: false });
    }
  });
  out.altarAnchor = anchor(group, 'altar', ax, ay + 0.2, az + 0.15);
  out.lights.push(lightSpec('altar', anchor(group, 'altarLight', ax, ay + 0.2, az + 0.3), { intensity: 3.5, distance: 4.5 }));
  out.smokeAnchor = anchor(group, 'altarSmoke', ax, ay + 0.25, az + 0.12);

  // ---- old man's corner: plastic table + chairs, ashtray, tea, newspaper, fan, dog bowl -------
  const tx = -2.35, tz = 1.35;
  k.at([tx, 0, tz], 0.12, null, () => {
    foldTable(k, { w: 0.9, d: 0.62, h: 0.72, color: 0xd8b8a0 });
    k.details(() => {
      // tea set + glass ashtray with butts + newspaper + a pack of cigarettes
      k.add(mat('ceramic'), G('teapot', () => lathe([[0, 0], [0.05, 0], [0.07, 0.04], [0.065, 0.08], [0.03, 0.1], [0.02, 0.12], [0, 0.12]], 12)), { p: [0.25, 0.72, -0.1], color: 0xc8b890, w: false });
      k.add(mat('ceramic'), tube([V(0.07, 0.04, 0), V(0.12, 0.08, 0), V(0.14, 0.1, 0)], 0.009, 5), { p: [0.25, 0.72, -0.1], color: 0xc8b890, w: false });
      teacup(k, { p: [0.08, 0.72, -0.05] });
      teacup(k, { p: [0.12, 0.72, 0.12] });
      k.add(mat('glass_bottle'), G('ashtray', () => lathe([[0, 0], [0.06, 0], [0.065, 0.025], [0.05, 0.025], [0.045, 0.008], [0, 0.008]], 14)), { p: [-0.2, 0.72, 0.05], color: 0x8a9a90, w: false });
      for (let i = 0; i < 6; i++) k.add(mat('ceramic'), G('butt', () => cyl(0.004, 0.004, 0.025, 5, 0).rotateZ(Math.PI / 2)), { p: [-0.2 + (rng() - 0.5) * 0.06, 0.733, 0.05 + (rng() - 0.5) * 0.06], r: rng() * 6, color: rng() < 0.5 ? 0xd8c890 : 0xe8e4dc, w: false });
      k.add(mat('paper'), G('newspaper', () => bevelBox(0.38, 0.012, 0.28, 0.003, 0.1)), { p: [-0.18, 0.725, -0.15], r: -0.3, color: 0xc8c0a8, w: { vary: 0.3 }, colorFn: (p, n, c, lp) => { if (n.y > 0.5 && Math.abs(Math.sin(lp.z * 120)) > 0.7 && Math.abs(lp.x) < 0.16) c.multiplyScalar(0.55); } });
      k.add(mat('paper'), G('cigpack', () => bbox(0.055, 0.02, 0.085, 0.003, 0.05)), { p: [0.0, 0.725, 0.18], r: 0.5, color: 0xc83a2a, w: false });
    });
  });
  out.tableAnchor = anchor(group, 'table', tx, 0.73, tz);
  out.ashtrayAnchor = anchor(group, 'ashtray', tx - 0.18, 0.745, tz + 0.07);
  out.keysAnchor = anchor(group, 'keys', tx + 0.02, 0.73, tz + 0.05);
  out.colliders.push({ x: tx, z: tz, hx: 0.5, hz: 0.36, yaw: 0.12 });
  // the old man's chair (front-left of the table, facing the road/entrance) + a spare chair
  plasticChair(k, { p: [tx - 0.12, 0, tz + 0.62], r: Math.PI + 0.12, color: PAL.chairRed, dust: 0.3 });
  out.oldManSeat = anchor(group, 'oldManSeat', tx - 0.12, 0.44, tz + 0.66, 0.12);
  plasticChair(k, { p: [tx + 0.75, 0, tz - 0.25], r: -Math.PI / 2 + 0.4, color: PAL.chairBlue, dust: 0.5 });
  out.guestSeat = anchor(group, 'guestSeat', tx + 0.75, 0.44, tz - 0.25, -Math.PI / 2 + 0.4 + Math.PI);
  plasticStool(k, { p: [tx - 0.75, 0, tz - 0.55], color: PAL.chairGreen });
  // standing fan (blades spin in their own little group)
  const fx = tx - 1.0, fz = tz - 0.9;
  k.at([fx, 0, fz], 0.9, null, () => {
    k.add(mat('plastic'), G('fanbase', () => cyl(0.18, 0.2, 0.05, 16, 0.01)), { color: 0xd8d0c0, w: { dust: 0.5, grime: 0.4 } });
    k.add(mat('galv'), G('fanpole', () => cyl(0.018, 0.018, 1.05, 8, 0.002)), { p: [0, 0.05, 0], color: 0xb8b8b0, w: false });
    k.add(mat('plastic'), G('fanmotor', () => cyl(0.07, 0.08, 0.16, 12, 0.02).rotateX(Math.PI / 2)), { p: [0, 1.15, -0.08], color: 0xd8d0c0, w: { dust: 0.5 } });
    // cage: rings + spokes
    for (const [z, r] of [[0.06, 0.2], [0.0, 0.21]]) k.add(mat('galv'), G('fanring:' + r, () => torus(r, 0.004, 3, 28)), { p: [0, 1.15, z], color: 0xc8c8c0, w: false });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.add(mat('galv'), tube([V(0, 0, 0.09), V(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.085), V(Math.cos(a) * 0.205, Math.sin(a) * 0.205, 0.04)], 0.0025, 3), { p: [0, 1.15, 0], color: 0xc8c8c0, w: false });
    }
  });
  const fanKit = new Kit(seed + 1, { grime: 0, dust: 0.3 });
  for (let i = 0; i < 3; i++) fanKit.add(mat('plastic'), G('fanblade', () => sphere(0.5, 10, 4).scale(0.1, 0.17, 0.012).translate(0, 0.1, 0)), { r: [0, 0, (i / 3) * Math.PI * 2], color: 0x6a9ab0, w: false });
  const blades = fanKit.build({ name: 'fanBlades', shadows: false });
  const fanPivot = new THREE.Group();
  fanPivot.name = 'fanPivot';
  fanPivot.position.set(fx, 1.15, fz);
  fanPivot.rotation.y = 0.9;
  const spin = new THREE.Group();
  spin.position.z = 0.035;
  spin.add(blades);
  fanPivot.add(spin);
  group.add(fanPivot);
  out.fanAnchor = fanPivot;
  out.fanBlades = spin;
  out.fanOn = true;
  let lastT = -1;
  blades.children[0].onBeforeRender = () => {
    const t = performance.now() * 0.001;
    if (lastT >= 0 && out.fanOn) spin.rotation.z -= Math.min(0.1, t - lastT) * 14;
    lastT = t;
  };
  // dog bowl + water jar + mosquito coil near the table
  k.details(() => {
    bowl(k, { p: [tx + 0.6, 0.0, tz + 0.75], rad: 0.1, metal: true, color: 0xb8b8b0 });
    k.add(mat('ceramic'), G('bowlwater', () => cyl(0.075, 0.075, 0.005, 14, 0)), { p: [tx + 0.6, 0.04, tz + 0.75], color: 0x3a4a48, w: false });
    k.add(mat('ash'), G('mcoil', () => torus(0.045, 0.004, 4, 20).rotateX(Math.PI / 2)), { p: [tx - 0.4, 0.01, tz + 0.95], color: 0x3a5a2a, w: false });
    k.add(glowMat('ember'), G('mcoilember', () => sphere(0.005, 5, 4)), { p: [tx - 0.4 + 0.045, 0.012, tz + 0.95], color: 0xffffff, w: false });
  });
  out.dogBowlAnchor = anchor(group, 'dogBowl', tx + 0.6, 0.0, tz + 0.75);
  out.mosquitoCoilAnchor = anchor(group, 'mosquitoCoil', tx - 0.4 + 0.045, 0.03, tz + 0.95);
  waterJar(k, { p: [xL + 0.55, 0, zF - 0.7], size: 1.05, lid: true, moss: 0.4 });
  out.colliders.push({ x: xL + 0.55, z: zF - 0.7, r: 0.4 });

  // ---- right side / back-right: tyres, drums, jack, hose, battery, engine parts --------------
  k.details(() => {
    for (let i = 0; i < 5; i++) tire(k, { p: [xR - 0.55 + (rng() - 0.5) * 0.05, i * 0.19, zB + 0.7], r: rng() * 6 });
    for (let i = 0; i < 3; i++) tire(k, { p: [xR - 1.35, i * 0.19, zB + 0.6], r: rng() * 6, rad: 0.3 });
    tire(k, { p: [xR - 0.4, 0, zB + 1.55], upright: true, r: Math.PI / 2 - 0.25, rad: 0.31 });
    oilDrum(k, { p: [xR - 0.5, 0, 0.6], color: 0x2a4a7a });
    oilDrum(k, { p: [xR - 0.5, 0, 1.25], rusty: true, color: 0x7a3a1a });
    crate(k, { p: [xR - 0.5, 0.88, 0.9], kind: 'plastic', color: 0x2a6a3a });
    coil(k, { p: [xR - 0.13, 1.7, -0.6], r: [0, Math.PI / 2, 0], rad: 0.3, thick: 0.014, loops: 5, color: 0x2a6a3a, mat: 'plastic', seed: 8 });
    // car battery + jerry can
    k.add(mat('plastic'), G('battery', () => bbox(0.3, 0.22, 0.18, 0.01, 0.1)), { p: [xR - 1.4, 0, 0.2], r: 0.3, color: 0x1a1a1a, w: { dust: 0.5 } });
    k.add(mat('plastic'), G('jerry', () => bbox(0.34, 0.42, 0.16, 0.03, 0.1)), { p: [xR - 1.0, 0, -0.9], r: -0.2, color: 0xa82a1a, w: { grime: 0.5 } });
    // trolley jack
    k.at([1.6, 0, 2.2], -0.6, null, () => {
      k.add(mat('metal'), G('jackbody', () => bbox(0.28, 0.14, 0.7, 0.02, 0.1)), { color: 0xc0281a, w: { grime: 0.5 } });
      k.add(mat('galv'), tube([V(0, 0.1, 0.3), V(0, 0.6, 1.0)], 0.015, 5), { color: 0x8a8a84, w: false });
      for (const sx of [-1, 1]) k.add(mat('rubber'), G('jackwheel', () => cyl(0.04, 0.04, 0.03, 10, 0.005).rotateZ(Math.PI / 2)), { p: [sx * 0.15, 0.04, -0.28], color: 0x1a1a1a, w: false });
    });
    // engine block on pallet
    k.add(mat('wood'), bbox(0.9, 0.12, 0.8, 0.01, 0.2), { p: [-0.2, 0, zB + 1.5], color: 0x8a6a48, w: { grime: 0.5 } });
    k.add(mat('rust'), G('engine', () => bevelBox(0.55, 0.42, 0.45, 0.04, 0.12)), { p: [-0.2, 0.33, zB + 1.5], color: 0x5a5250, jitter: 0.01, jitterFreq: 18, w: { grime: 0.3, streak: 0.6, streakColor: 0x1a1410 } });
    for (let i = 0; i < 4; i++) k.add(mat('metal'), G('plug', () => cyl(0.03, 0.03, 0.06, 6, 0.005)), { p: [-0.38 + i * 0.12, 0.6, zB + 1.5], color: 0x3a3a3a, w: false });
    // scattered small parts on the floor + rags
    for (let i = 0; i < 6; i++) k.add(mat('galv'), G('bolt', () => cyl(0.008, 0.008, 0.05, 6, 0.002).rotateZ(Math.PI / 2)), { p: [0.8 + rng() * 1.5, 0.01, -1 + rng() * 2], r: rng() * 6, color: 0x8a8a84, w: false });
  });
  out.colliders.push({ x: xR - 0.6, z: zB + 0.9, hx: 0.6, hz: 0.6, yaw: 0 }, { x: xR - 0.5, z: 0.95, hx: 0.35, hz: 0.7, yaw: 0 }, { x: -0.2, z: zB + 1.5, hx: 0.45, hz: 0.4, yaw: 0 }, { x: bx, z: bz, hx: 1.3, hz: 0.38, yaw: 0 });

  // ---- extra clutter: wall shelf of bottles over the bench, steel cabinet, boxes, hubcaps,
  //      fan belts, buckets, a creeper board, cardboard on the floor -----------------------------
  k.add(mat('wood'), bbox(2.2, 0.04, 0.28, 0.006, 0.3), { p: [bx, 2.25 - 0.55, zB + 0.24], color: 0x6a5038, w: { dust: 0.7 } });
  for (const sx of [-1, 1]) k.add(mat('metal'), G('wsbr', () => bbox(0.03, 0.2, 0.22, 0.004, 0.1)), { p: [bx + sx * 1.0, 1.5, zB + 0.21], color: 0x3a3a38, w: false });
  k.details(() => {
    fillShelf(k, bx - 1.05, 1.74, zB + 0.24, 1.0, 0.24, rng, 'mixed');
    k.add(mat('plastic'), G('basket', () => bbox(0.36, 0.14, 0.24, 0.02, 0.08)), { p: [bx + 0.25, 1.74, zB + 0.24], color: 0xc02a1a, w: { dust: 0.6 }, colorFn: (p, n, c, lp) => { if (Math.abs(n.y) < 0.5 && Math.sin(lp.x * 120) * Math.sin(lp.y * 120) > 0.5) c.multiplyScalar(0.3); } });
    for (let i = 0; i < 4; i++) bottle(k, { p: [bx + 0.55 + i * 0.1, 1.74, zB + 0.24], kind: i % 2 ? 'whisky' : 'small', color: [0x7a4a1a, 0x2a5a2a, 0xa83a1a, 0xc8c0a0][i] });
    // steel cabinet back-right + boxes on top
    k.add(mat('metal'), bbox(0.9, 1.85, 0.45, 0.01, 0.3), { p: [1.6, 0, zB + 0.33], color: 0x6a7a7a, w: { grime: 0.6, streak: 0.7, dust: 0.6 }, colorFn: (p, n, c, lp) => { if (n.z > 0.5 && Math.abs(lp.x) < 0.012) c.multiplyScalar(0.25); } });
    for (let i = 0; i < 3; i++) k.add(mat('paper'), G('cbox' + i, () => bbox(0.5 - i * 0.08, 0.28, 0.38, 0.01, 0.15)), { p: [1.6 + (rng() - 0.5) * 0.1, 1.85 + i * 0.28, zB + 0.33], r: (rng() - 0.5) * 0.3, color: 0xa8845a, w: { dust: 0.8 } });
    // hubcaps + fan belts on the back wall
    for (let i = 0; i < 3; i++) k.add(mat('galv'), G('hubcap', () => lathe([[0, 0.03], [0.1, 0.025], [0.17, 0.01], [0.18, 0]], 18).rotateX(Math.PI / 2)), { p: [2.5 + i * 0.4, 1.4 + (i % 2) * 0.35, zB + 0.11], color: 0xb0b0a8, w: { grime: 0, dust: 0.4, streak: 0.4 } });
    for (let i = 0; i < 4; i++) k.add(mat('rubber'), G('belt' + i, () => torus(0.12 + i * 0.03, 0.008, 3, 20).scale(0.6, 1.3, 1)), { p: [3.55, 1.95 - i * 0.03, zB + 0.13], color: 0x1a1a1a, w: false });
    // buckets + broom + creeper board + cardboard on the floor
    k.add(mat('plastic'), G('bucket', () => lathe([[0, 0], [0.13, 0], [0.15, 0.28], [0.145, 0.28], [0.125, 0.01], [0, 0.01]], 14)), { p: [0.6, 0, zB + 0.45], color: 0x2a5a9a, w: { grime: 0.5 } });
    k.add(mat('plastic'), G('bucket', () => lathe([[0, 0], [0.13, 0], [0.15, 0.28], [0.145, 0.28], [0.125, 0.01], [0, 0.01]], 14)), { p: [0.9, 0, zB + 0.5], color: 0xd8b030, w: { grime: 0.5 } });
    k.add(mat('wood'), tube([V(0, 0.02, 0), V(0.02, 1.25, -0.25)], 0.012, 5), { p: [xL + 0.3, 0, zB + 1.2], color: 0x8a6a40, w: false });
    k.add(mat('flower'), G('broomhead', () => cyl(0.02, 0.12, 0.35, 8, 0, 1, true)), { p: [xL + 0.3, 0, zB + 1.2], color: 0x8a7a50, w: false });
    k.add(mat('paper'), G('cardboardfloor', () => bbox(0.9, 0.01, 1.6, 0.002, 0.3)), { p: [1.3, 0.0, 2.3], r: 0.35, color: 0x9a7a52, w: { grime: 0.8, grimeH: 0.05 } });
    k.add(mat('wood'), G('creeper', () => bbox(0.4, 0.04, 0.95, 0.01, 0.2)), { p: [2.5, 0.07, 2.1], r: -0.5, color: 0x6a4a30, w: { grime: 0.5 } });
    // clothesline with rags across the back-left corner
    k.add(mat('dark'), tube(sagCurveG(V(xL + 0.15, 2.5, zB + 0.8), V(xL + 2.2, 2.5, zB + 0.15)), 0.004, 3), { color: 0x2a2a2a, w: false });
    for (let i = 0; i < 3; i++) k.add(mat('cloth_static'), G('ragh' + i, () => quad(0.3, 0.42, 2, 3).translate(0, -0.21, 0)), { p: [xL + 0.55 + i * 0.6, 2.44 - i * 0.02, zB + 0.68 - i * 0.2], r: [0, 0.32, 0], color: [0x6a7a8a, 0xb8a888, 0x8a3a2a][i], uv: 'keep', w: { vary: 0.3 }, deform: (p) => { p.z += Math.sin(p.x * 12) * 0.02; } });
  });

  group.add(k.build({ name: 'garage', detailDistance: 45 }));
  // ---- gameplay anchors -------------------------------------------------------------------------
  out.taxiSpot = anchor(group, 'taxiSpot', 1.25, 0, 0.3, Math.PI); // taxi faces the road (+Z)
  out.bikeSpot = anchor(group, 'bikeSpot', -2.6, 0, zF + 1.7, Math.PI * 0.8);
  out.playerArrive = anchor(group, 'arrive', -1.4, 0, zF + 1.2, 0);
  out.radioAnchor = anchor(group, 'radio', bx + 0.9, 1.0, bz + 0.05);
  out.walkSurfaces = [{ x: 0, z: 0, hx: W / 2, hz: D / 2, yaw: 0, y: 0.02 }];
  return out;
}
const _teal = new THREE.Color(0x4a7a74);
const _cream = new THREE.Color(0xd8d0b0);
const _bare = new THREE.Color(0x8a8478);
const _rust = new THREE.Color(0x6a3418);
const _fibre = new THREE.Color(0xc8c8a0);
