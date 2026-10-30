// Taxi exterior: body shell, hinged doors, trunk lid, bumpers, grille, lights, plates,
// mirror housings, wipers, roof sign, wheels. Produces separate groups for every
// animated part and hands glass pane geometry + mirror mounts to Glass/Mirrors.
import * as THREE from 'three';
import { DIM, buildLowerGrid, buildGreenhouse, greenhouseClassifier, buildSidePane, belt, deck, LB, GH, zA, xSide, yRow } from './TaxiBody.js';
import { MergeBuilder, xform, roundedBox, lathe, rod, sweep, extrude, roundRectPts, tube, GridSurface } from './geom.js';
import { paintBodyAtlas, ATLAS, lowerU, lowerVmap } from './VehicleTextures.js';
import { sharedMaterials, lensMaterials, bodyMaterial } from './Materials.js';
import { lerp, clamp, makeRng } from '../core/math.js';

let cachedShell = null;

/** Build (once) the static shell geometry + atlas shared by all taxi instances. */
function buildShell() {
  if (cachedShell) return cachedShell;
  const lower = buildLowerGrid();
  const gh = buildGreenhouse();
  const cls = greenhouseClassifier(gh);
  const { zs, vArc } = lower;
  const nGc = gh.cols.length;

  // ---- lower-body cell classes ----------------------------------------------------
  const zMid = (r) => 0.5 * (zs[r] + zs[r + 1]);
  const inZ = (z, [a, b]) => z > a && z < b;
  const lowerClass = (r, c) => {
    const z = zMid(r);
    const right = c >= LB.doorC0 && c < LB.doorC1;
    const left = c >= 39 - (LB.doorC1 - 1) && c <= 39 - LB.doorC0;
    if (right || left) {
      const s = right ? 'R' : 'L';
      if (inZ(z, DIM.frontDoor)) return 'doorF' + s;
      if (inZ(z, DIM.rearDoor)) return 'doorR' + s;
    }
    if (c >= LB.deckC0 && c < LB.deckC1) {
      if (z > DIM.zCowl && z < DIM.zParcel) return 'open';
      if (z > DIM.trunk[0]) return 'trunk';
    }
    return 'body';
  };
  const lowerUV = (r, c) => [lowerU(zs[r]), lowerVmap(vArc[r][c])];
  const ghUV = (r, c) => [c / (nGc - 1), ATLAS.ghV[0] + (r / (gh.nRows - 1)) * (ATLAS.ghV[1] - ATLAS.ghV[0])];

  // ---- atlas ----------------------------------------------------------------------------
  const idx = (tag) => gh.idxR[tag];
  const blackCols = [];
  const addBlack = (a, b) => {
    blackCols.push([idx(a), idx(b)]);
    blackCols.push([gh.mirror(idx(b)), gh.mirror(idx(a))]);
  };
  addBlack('b0', 'b1');
  addBlack('div0', 'div1');
  addBlack('rw1', 'dp');
  const atlas = paintBodyAtlas(lower, { nCols: nGc, nRows: gh.nRows, classify: cls.classify, railRow: cls.rRail, blackCols });

  cachedShell = { lower, gh, cls, lowerClass, lowerUV, ghUV, atlas };
  return cachedShell;
}

/** Fan-cap the front or rear end ring (planar UV into the atlas cap band). */
function capGeometry(lower, end) {
  const r = end === 'front' ? 0 : lower.zs.length - 1;
  const ring = lower.rings[r];
  const z = lower.zs[r];
  const pts = ring.slice(0, ring.length - 1).map((p) => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos = [], uv = [], nor = [], ix = [];
  const nz = end === 'front' ? -1 : 1;
  const u0 = end === 'front' ? 0 : 0.5;
  for (const p of pts) {
    pos.push(p.x, p.y, z);
    nor.push(0, 0, nz);
    uv.push(u0 + (p.x + 0.85) / 1.7 * 0.5, ATLAS.capV[0] + ((p.y - 0.2) / 0.8) * (ATLAS.capV[1] - ATLAS.capV[0]));
  }
  for (const t of tris) {
    // ensure facing
    const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const ccw = cross > 0; // ccw in xy = facing +z
    if ((nz > 0) === ccw) ix.push(t[0], t[1], t[2]);
    else ix.push(t[0], t[2], t[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  return g;
}

/** Sample the lower body outer surface x at a given (z, y) on the right side. */
function sideX(lower, z, y) {
  const { zs, rings } = lower;
  let i = 0;
  while (i < zs.length - 2 && zs[i + 1] < z) i++;
  const t = clamp((z - zs[i]) / (zs[i + 1] - zs[i] || 1));
  const at = (r) => {
    const ring = rings[r];
    for (let k = 3; k < 15; k++) {
      const ya = ring[k][1], yb = ring[k + 1][1];
      if ((y >= ya && y <= yb) || (y <= ya && y >= yb)) return lerp(ring[k][0], ring[k + 1][0], (y - ya) / (yb - ya || 1));
    }
    return ring[7][0];
  };
  return lerp(at(i), at(i + 1), t);
}

/**
 * Build one taxi exterior. Returns {
 *   root parts: shell (static Group), doors {fl,fr,rl,rr: {group, outer: Group, sign}}, trunk {group},
 *   wheels [{pivot, spin, front, side}], panes {...}, lenses, mirrorMounts {left,right}, wipers [], ...
 * }
 */
export function buildTaxiExterior(opts = {}) {
  const S = buildShell();
  const { lower, gh, cls, lowerClass, lowerUV, ghUV, atlas } = S;
  const M = sharedMaterials();
  const lens = lensMaterials();
  const bodyMat = bodyMaterial(atlas);
  const out = { lenses: lens, materials: { body: bodyMat, ...M }, doors: {}, panes: {}, wheels: [], wipers: [] };
  const shell = new THREE.Group();
  shell.name = 'taxiShell';
  out.shell = shell;

  const LG = lower.grid, GG = gh.grid;
  const mbBody = new MergeBuilder();
  // static body: lower body + caps + greenhouse body
  mbBody.add('body', LG.build((r, c) => lowerClass(r, c) === 'body', { uv: lowerUV }));
  mbBody.add('body', capGeometry(lower, 'front'));
  mbBody.add('body', capGeometry(lower, 'rear'));
  mbBody.add('body', GG.build((r, c) => cls.classify(r, c) === 'body', { uv: ghUV }));
  // window reveals (rubber seals) on the body side
  const isGlass = (r, c) => {
    const k = cls.classify(r, c);
    return k === 'ws' || k === 'rear' || k.startsWith('win_') || k.startsWith('quarter');
  };
  mbBody.add('trim', GG.edgeStrips((r, c) => cls.classify(r, c) === 'body', isGlass, 0.028));
  // inner trim: headliner (roof rows) + pillars
  const roofRow = cls.rRail;
  mbBody.add('headliner', GG.build((r, c) => cls.classify(r, c) === 'body' && r >= roofRow - 1, { offset: -0.03, flip: true, uv: (r, c) => { const p = GG.get(r, c); return [p.x * 1.5, p.z * 1.5]; } }));
  mbBody.add('pillar', GG.build((r, c) => cls.classify(r, c) === 'body' && r < roofRow - 1, { offset: -0.028, flip: true, uv: (r, c) => { const p = GG.get(r, c); return [p.z * 2, p.y * 2]; } }));
  // door jambs (body side of door openings)
  const isDoorL = (r, c) => lowerClass(r, c).startsWith('door');
  mbBody.add('jamb', LG.edgeStrips((r, c) => lowerClass(r, c) === 'body', isDoorL, 0.07));
  // rear quarter inner panels behind rear doors (cabin side) and kick panels
  mbBody.add('pillar', LG.build((r, c) => {
    const z = 0.5 * (lower.zs[r] + lower.zs[r + 1]);
    const k = lowerClass(r, c);
    const sideCell = (c >= 5 && c < 15) || (c >= 25 && c < 35);
    return k === 'body' && sideCell && z > DIM.zCowl && z < DIM.zParcel;
  }, { offset: -0.06, flip: true, uv: (r, c) => { const p = LG.get(r, c); return [p.z * 2, p.y * 2]; } }));
  // cowl panel (black plastic under the windshield)
  {
    const g = new THREE.BoxGeometry(1.52, 0.012, 0.11);
    xform(g, [0, 0.928, DIM.zCowl - 0.05], [0.18, 0, 0]);
    mbBody.add('cowl', g);
    for (let i = 0; i < 26; i++) {
      const s = new THREE.BoxGeometry(0.035, 0.006, 0.06);
      xform(s, [-0.65 + i * 0.052, 0.936, DIM.zCowl - 0.06], [0.18, 0, 0]);
      mbBody.add('trim', s);
    }
  }
  // drip rails (chrome) along the roof rail
  for (const sx of [1, -1]) {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const z = lerp(zA(1) + 0.08, DIM.zRwTop - 0.1, t);
      pts.push(new THREE.Vector3(sx * (xSide(1) + 0.004), DIM.rail + 0.012, z));
    }
    mbBody.add('chrome', tube(pts, 0.0065, 32, 6));
  }

  // ---- wheel wells / liners -------------------------------------------------------------
  for (const az of [DIM.axleF, DIM.axleR]) {
    for (const sx of [1, -1]) {
      const g = new THREE.CylinderGeometry(DIM.archR + 0.005, DIM.archR + 0.005, 0.32, 20, 1, true, -Math.PI / 2, Math.PI);
      g.rotateZ(Math.PI / 2);
      xform(g, [sx * 0.68, DIM.archY, az]);
      mbBody.add('well', g);
      // inner wall
      const w = new THREE.CircleGeometry(DIM.archR + 0.005, 20, 0, Math.PI);
      w.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      xform(w, [sx * 0.52, DIM.archY, az]);
      mbBody.add('well', w);
      // mud flap
      const mf = roundedBox(0.16, 0.2, 0.012, 0.004, 2);
      xform(mf, [sx * 0.74, 0.27, az + 0.4], [0.12, 0, 0]);
      mbBody.add('rubber', mf);
    }
  }
  // underbody pan
  {
    const g = new THREE.BoxGeometry(1.5, 0.04, 3.9);
    xform(g, [0, 0.2, 0]);
    mbBody.add('under', g);
    // exhaust
    mbBody.add('dark', rod([-0.4, 0.2, 0.5], [-0.42, 0.2, 2.15], 0.025, 8));
    mbBody.add('rust', rod([-0.42, 0.2, 2.15], [-0.42, 0.205, 2.24], 0.028, 8));
    // fuel tank, axle
    mbBody.add('dark', xform(roundedBox(0.7, 0.18, 0.5, 0.04, 2), [0.1, 0.3, 1.45]));
    mbBody.add('dark', rod([-0.62, DIM.wheelR, DIM.axleR], [0.62, DIM.wheelR, DIM.axleR], 0.04, 8));
    mbBody.add('dark', xform(roundedBox(0.25, 0.22, 0.3, 0.05, 2), [0, 0.28, DIM.axleR]));
  }

  // ---- front fascia -----------------------------------------------------------------------
  const zF = DIM.zFront;
  // headlight bezels + lenses
  const headMeshGeo = [];
  for (const sx of [1, -1]) {
    const cx = sx * 0.515, cy = 0.595;
    const bez = extrude(roundRectPts(0.4, 0.17, 0.02, 3), 0.03, 0.004);
    // hole: approximate with a dark recess box behind the lens + chrome ring frame
    xform(bez, [cx, cy, zF - 0.005]);
    mbBody.add('chromeDull', bez);
    const lensG = roundedBox(0.36, 0.135, 0.02, 0.008, 2);
    xform(lensG, [cx, cy, zF - 0.024]);
    headMeshGeo.push(lensG);
    // corner indicator (amber) wrapping the corner
    const ind = roundedBox(0.075, 0.12, 0.05, 0.012, 2);
    xform(ind, [sx * 0.765, cy, zF + 0.01], [0, sx * 0.35, 0]);
    out._frontInd = out._frontInd || {};
    out._frontInd[sx > 0 ? 'R' : 'L'] = ind;
  }
  // grille: frame + slats + small badge
  {
    const fr = extrude(roundRectPts(0.6, 0.13, 0.01, 2), 0.035, 0.003);
    xform(fr, [0, 0.6, zF - 0.008]);
    mbBody.add('trim', fr);
    for (let i = 0; i < 4; i++) {
      const sl = roundedBox(0.58, 0.012, 0.012, 0.004, 1);
      xform(sl, [0, 0.553 + i * 0.03, zF - 0.03]);
      mbBody.add('chrome', sl);
    }
    const badge = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20);
    badge.rotateX(Math.PI / 2);
    badge.scale(1.5, 1, 1);
    xform(badge, [0, 0.6, zF - 0.04]);
    mbBody.add('chrome', badge);
  }
  // front apron / air dam
  mbBody.add('trim', xform(roundedBox(1.46, 0.07, 0.08, 0.02, 2), [0, 0.27, zF + 0.04]));

  // ---- bumpers (chrome bar with rubber insert, wraps corners) ---------------------------
  const bumperPath = (zEdge, dir) => {
    const pts = [];
    const W = 0.83, R = 0.16;
    // side return
    pts.push(new THREE.Vector3(-W, 0, zEdge - dir * 0.26));
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector3(-W + R - Math.cos(a) * R, 0, zEdge - dir * (R - Math.sin(a) * R)));
    }
    for (let k = 1; k < 8; k++) pts.push(new THREE.Vector3(lerp(-W + R, W - R, k / 8), 0, zEdge + dir * 0.012 * Math.sin((k / 8) * Math.PI)));
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector3(W - R + Math.sin(a) * R, 0, zEdge - dir * (R - Math.cos(a) * R)));
    }
    pts.push(new THREE.Vector3(W, 0, zEdge - dir * 0.26));
    return pts;
  };
  const bumperProfile = [
    [-0.03, -0.055], [0.0, -0.06], [0.03, -0.05], [0.04, -0.02], [0.042, 0.02], [0.035, 0.05], [0.01, 0.06], [-0.03, 0.055],
  ]; // CCW in (side, up); side = outward normal of the path
  for (const [zE, dir, y] of [[DIM.zFront - 0.06, -1, 0.405], [DIM.zRear + 0.06, 1, 0.43]]) {
    const path = bumperPath(zE, dir).map((p) => p.setY(y));
    const g = sweep(dir < 0 ? path.slice().reverse() : path, bumperProfile);
    mbBody.add('chrome', g);
    // rubber insert strip
    const prof2 = [[0.03, -0.012], [0.05, -0.01], [0.052, 0.012], [0.03, 0.014]];
    mbBody.add('rubber', sweep(dir < 0 ? path.slice().reverse() : path, prof2));
    // brackets
    for (const sx of [-0.55, 0.55]) mbBody.add('dark', rod([sx, y, zE - dir * 0.0], [sx, y, zE - dir * 0.12], 0.02, 6));
  }
  // plates
  {
    const pf = roundedBox(0.34, 0.15, 0.008, 0.008, 2);
    xform(pf, [0, 0.4, DIM.zFront - 0.112]);
    mbBody.add('plate', pf);
    const pr = roundedBox(0.34, 0.15, 0.008, 0.008, 2);
    xform(pr, [0, 0.62, DIM.zRear + 0.012], [0, Math.PI, 0]);
    mbBody.add('plate', pr);
    // plate light hood
    mbBody.add('chromeDull', xform(roundedBox(0.2, 0.025, 0.04, 0.008, 2), [0, 0.71, DIM.zRear + 0.02]));
  }
  // planar UV fix for plates (roundedBox has proper 0..1 uv per face) - fine.

  // ---- rear lights --------------------------------------------------------------------------
  const rearLens = { tail: [], reverse: [], indL: [], indR: [] };
  for (const sx of [1, -1]) {
    // sections from outer (x=0.79) to inner (x=0.30): amber | red | white
    const secs = [[0.79, 0.665, sx > 0 ? 'indR' : 'indL', [0, 0.27]], [0.665, 0.4, 'tail', [0.27, 0.83]], [0.4, 0.3, 'reverse', [0.83, 1]]];
    for (const [xa, xb, key, [u0, u1]] of secs) {
      const w = xa - xb;
      const g = new THREE.BoxGeometry(w, 0.12, 0.03, 1, 1, 1);
      // uv remap to the section of the cluster texture
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, lerp(u0, u1, sx > 0 ? uv.getX(i) : 1 - uv.getX(i)));
      xform(g, [sx * (xa + xb) / 2, 0.8, DIM.zRear + 0.004]);
      rearLens[key].push(g);
    }
    // wrap-around side marker of the cluster
    const side = new THREE.BoxGeometry(0.03, 0.11, 0.12);
    xform(side, [sx * 0.8, 0.8, DIM.zRear - 0.06]);
    rearLens[sx > 0 ? 'indR' : 'indL'].push(side);
    // trim around cluster
    mbBody.add('trim', xform(roundedBox(0.52, 0.14, 0.02, 0.006, 2), [sx * 0.545, 0.8, DIM.zRear - 0.004]));
  }

  // ---- side details: moldings, antenna, fuel flap --------------------------------------------
  const moldingY = 0.555;
  const moldingSeg = (z0, z1, sx) => {
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const z = lerp(z0, z1, k / 10);
      pts.push(new THREE.Vector3(sx * (sideX(lower, z, moldingY) + 0.006), moldingY, z));
    }
    const prof = [[0.0, -0.016], [0.008, -0.014], [0.011, 0], [0.008, 0.014], [0.0, 0.016], [-0.004, 0]];
    const p2 = sx < 0 ? prof : prof.map(([a, b]) => [-a, b]).reverse();
    return sweep(pts, p2.map(([a, b]) => [a, b]));
  };
  const doorMolding = {};
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'R' : 'L';
    mbBody.add('trim', moldingSeg(-1.9, -1.76, sx));
    mbBody.add('trim', moldingSeg(-0.97, -1.03, sx));
    mbBody.add('trim', moldingSeg(0.07, 0.09, sx));
    mbBody.add('trim', moldingSeg(1.5, 1.95, sx));
    doorMolding['F' + s] = moldingSeg(-1.015, 0.057, sx);
    doorMolding['R' + s] = moldingSeg(0.103, 0.71, sx);
  }
  // antenna on the front left fender
  mbBody.add('chrome', rod([-0.74, 0.86, -1.75], [-0.86, 1.62, -1.25], 0.0028, 4, 0.0015));
  mbBody.add('chromeDull', xform(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 8), [-0.74, 0.86, -1.75]));
  // fuel flap (rear left quarter)
  mbBody.add('body', (() => {
    const g = new THREE.CircleGeometry(0.06, 16);
    g.rotateY(-Math.PI / 2);
    const z = 1.35, y = 0.78;
    xform(g, [-(sideX(lower, z, y) + 0.003), y, z]);
    // uv: point at the body atlas side area of that spot (green/yellow) - sample yellow area
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lowerU(z) + (uv.getX(i) - 0.5) * 0.02, 0.75 * 0.62 + (uv.getY(i) - 0.5) * 0.01);
    return g;
  })());

  // ---- roof sign --------------------------------------------------------------------------
  const roofSign = new THREE.Group();
  {
    const mb = new MergeBuilder();
    const body = roundedBox(0.66, 0.15, 0.17, 0.025, 3);
    mb.add('base', xform(body, [0, 0.1, 0]));
    mb.add('base', xform(roundedBox(0.7, 0.025, 0.2, 0.01, 2), [0, 0.012, 0]));
    for (const sx of [-0.25, 0.25]) mb.add('base', xform(roundedBox(0.05, 0.03, 0.14, 0.008, 1), [sx, -0.005, 0]));
    const g = mb.build({ base: M.blackTrim });
    roofSign.add(g);
    for (const sz of [1, -1]) {
      const face = new THREE.PlaneGeometry(0.62, 0.125);
      if (sz > 0) face.rotateY(0);
      else face.rotateY(Math.PI);
      xform(face, [0, 0.1, sz * 0.0865]);
      const m = new THREE.Mesh(face, lens.roofSign);
      roofSign.add(m);
    }
    roofSign.position.set(0, DIM.rail + 0.075, 0.28);
    shell.add(roofSign);
  }
  out.roofSign = roofSign;

  // ---- side mirror housings (on the front doors' sail) ---------------------------------------
  const mirrorMounts = {};
  const mirrorParts = {};
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'R' : 'L';
    const mb = new MergeBuilder();
    const base = new THREE.Group();
    const z = -0.84, y = 0.985;
    const x0 = sx * (xSide(0.15) + 0.004);
    // stalk from the sail
    mb.add('trim', xform(roundedBox(0.05, 0.05, 0.1, 0.012, 2), [x0 + sx * 0.03, y - 0.01, z]));
    mb.add('trim', rod([x0 + sx * 0.03, y, z], [x0 + sx * 0.12, y + 0.02, z + 0.02], 0.016, 8));
    // housing: rounded shell behind the glass
    const hz = 0.07;
    const housing = roundedBox(0.19, 0.125, hz, 0.03, 3);
    const hc = new THREE.Vector3(x0 + sx * 0.165, y + 0.03, z + 0.03);
    // orient: face (local +z) toward rear/driver
    const n = new THREE.Vector3(sx > 0 ? -0.2 : 0.32, 0.03, 1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    housing.translate(0, 0, -hz / 2 + 0.005);
    housing.applyQuaternion(q);
    housing.translate(hc.x, hc.y, hc.z);
    mb.add('trim', housing);
    mirrorParts[s] = mb;
    const mount = new THREE.Object3D();
    mount.position.copy(hc).addScaledVector(n, 0.012);
    mount.quaternion.copy(q);
    mount.userData.size = [0.165, 0.1];
    mirrorMounts[s] = mount;
  }

  // ---- wipers -----------------------------------------------------------------------------
  const wsBase = new THREE.Vector3(0, DIM.belt0, DIM.zCowl);
  const wsTop = new THREE.Vector3(0, DIM.rail, DIM.zWsTop);
  const slope = wsTop.clone().sub(wsBase).normalize();
  const wsNormal = new THREE.Vector3(1, 0, 0).cross(slope).normalize(); // up-forward
  out.windshieldFrame = { base: wsBase, slope, normal: wsNormal };
  for (const px of [-0.2, 0.42]) {
    const pivot = new THREE.Group();
    const p = new THREE.Vector3(px, DIM.belt0 - 0.005, DIM.zCowl - 0.035).addScaledVector(wsNormal, 0.012);
    pivot.position.copy(p);
    // local frame: X = -x (rest direction), Y = slope, Z = normal
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), slope, wsNormal.clone().negate().negate());
    // ensure right-handed: X x Y should = Z
    const z = new THREE.Vector3(-1, 0, 0).cross(slope);
    m.makeBasis(new THREE.Vector3(-1, 0, 0), slope, z);
    pivot.quaternion.setFromRotationMatrix(m);
    const blade = new THREE.Group();
    pivot.add(blade);
    const mb = new MergeBuilder();
    const len = px > 0 ? 0.5 : 0.46;
    mb.add('arm', xform(new THREE.CylinderGeometry(0.014, 0.016, 0.03, 10), [0, 0, 0.0], [Math.PI / 2, 0, 0]));
    mb.add('arm', xform(new THREE.BoxGeometry(len * 0.62, 0.012, 0.008), [len * 0.31, 0, 0.022]));
    mb.add('arm', xform(new THREE.BoxGeometry(len * 0.92, 0.008, 0.012), [len * 0.55, 0, 0.012]));
    mb.add('rubber', xform(new THREE.BoxGeometry(len * 0.92, 0.004, 0.01), [len * 0.55, 0, 0.002]));
    blade.add(mb.build({ arm: M.blackTrim, rubber: M.rubber }));
    shell.add(pivot);
    out.wipers.push({ pivot: blade, px, len, origin: p.clone() });
  }

  // ---- build static meshes ------------------------------------------------------------------
  const lensMeshes = new MergeBuilder();
  for (const g of headMeshGeo) lensMeshes.add('head', g);
  for (const [k, list] of Object.entries(rearLens)) for (const g of list) lensMeshes.add(k, g);
  lensMeshes.add('indR', out._frontInd.R);
  lensMeshes.add('indL', out._frontInd.L);
  const lensGroup = lensMeshes.build({ head: lens.head, tail: lens.tail, reverse: lens.reverse, indL: lens.indL, indR: lens.indR });
  shell.add(lensGroup);
  delete out._frontInd;

  const staticGroup = mbBody.build({
    body: bodyMat, trim: M.blackTrim, headliner: M.headliner, pillar: M.pillarTrim, jamb: bodyMat, cowl: M.cowl, chrome: M.chrome,
    chromeDull: M.chromeDull, well: M.wheelWell, rubber: M.rubber, under: M.underbody, dark: M.darkMetal, rust: M.rust, plate: M.plate,
  });
  // the jamb strips have no uv of meaning; give them the body material anyway
  shell.add(staticGroup);
  for (const m of staticGroup.children) {
    m.castShadow = true;
    m.receiveShadow = true;
  }

  // ---- doors -----------------------------------------------------------------------------------
  const doorDefs = {
    fr: { lower: 'doorFR', gh: ['doorFR', 'sailR'], hingeZ: DIM.frontDoor[0] + 0.012, sx: 1, mold: 'FR', pane: ['f', 'R'] },
    fl: { lower: 'doorFL', gh: ['doorFL', 'sailL'], hingeZ: DIM.frontDoor[0] + 0.012, sx: -1, mold: 'FL', pane: ['f', 'L'] },
    rr: { lower: 'doorRR', gh: ['doorRR'], hingeZ: DIM.rearDoor[0] + 0.012, sx: 1, mold: 'RR', pane: ['r', 'R'] },
    rl: { lower: 'doorRL', gh: ['doorRL'], hingeZ: DIM.rearDoor[0] + 0.012, sx: -1, mold: 'RL', pane: ['r', 'L'] },
  };
  for (const [id, d] of Object.entries(doorDefs)) {
    const hinge = new THREE.Vector3(d.sx * 0.83, 0.6, d.hingeZ);
    const group = new THREE.Group();
    group.name = 'door_' + id;
    group.position.copy(hinge);
    const inner = new THREE.Group(); // contents in taxi-local coords
    inner.position.copy(hinge).negate();
    group.add(inner);
    const mb = new MergeBuilder();
    const inLower = (r, c) => lowerClass(r, c) === d.lower;
    const inGh = (r, c) => d.gh.includes(cls.classify(r, c));
    mb.add('body', LG.build(inLower, { uv: lowerUV }));
    mb.add('body', GG.build(inGh, { uv: ghUV }));
    // door edges (thickness) on all borders
    mb.add('jamb', LG.edgeStrips(inLower, (r, c) => !inLower(r, c) && lowerClass(r, c) !== 'open', 0.07));
    mb.add('trim', GG.edgeStrips(inGh, isGlass, 0.028));
    mb.add('trim', GG.edgeStrips(inGh, (r, c) => !inGh(r, c) && !isGlass(r, c), 0.028));
    // inner frame trim of the window surround
    mb.add('pillar', GG.build(inGh, { offset: -0.028, flip: true, uv: (r, c) => { const p = GG.get(r, c); return [p.z * 2, p.y * 2]; } }));
    mb.add('trim', doorMolding[d.mold]);
    if (mirrorParts[d.sx > 0 ? 'R' : 'L'] && id[0] === 'f') {
      for (const [k, list] of mirrorParts[d.sx > 0 ? 'R' : 'L'].lists) for (const g of list) mb.add(k, g);
    }
    // exterior pull handle
    const hz = id[0] === 'f' ? -0.12 : 0.62;
    const hx = d.sx * (sideX(lower, hz, 0.8) + 0.008);
    const handle = roundedBox(0.012, 0.03, 0.13, 0.006, 2);
    xform(handle, [hx + d.sx * 0.006, 0.8, hz]);
    mb.add('chrome', handle);
    mb.add('trim', xform(roundedBox(0.01, 0.045, 0.15, 0.008, 2), [hx, 0.8, hz]));
    if (id === 'fr' || id === 'fl') mb.add('chrome', xform(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 10).rotateZ(Math.PI / 2), [hx + d.sx * 0.004, 0.8, hz + 0.1]));
    const meshes = mb.build({ body: bodyMat, jamb: bodyMat, trim: M.blackTrim, pillar: M.pillarTrim, chrome: M.chrome });
    for (const m of meshes.children) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    inner.add(meshes);
    // side pane
    const pane = buildSidePane(gh, d.pane[0], d.pane[1]);
    const slot = new THREE.Group(); // window glass slides in this group
    inner.add(slot);
    out.doors[id] = { group, inner, hinge, sx: d.sx, slot, pane, outerHandle: new THREE.Vector3(hx + d.sx * 0.02, 0.8, hz) };
    out.panes[id] = { geometry: pane.geometry, parent: slot, slide: pane.slide, travel: pane.travel * (id[0] === 'r' ? 0.72 : 1) };
    if (id[0] === 'f') {
      const mount = mirrorMounts[d.sx > 0 ? 'R' : 'L'];
      inner.add(mount);
    }
    shell.add(group);
  }
  out.mirrorMounts = { right: mirrorMounts.R, left: mirrorMounts.L };

  // ---- trunk lid ---------------------------------------------------------------------------------
  {
    const hinge = new THREE.Vector3(0, deck(DIM.trunk[0]) + 0.01, DIM.trunk[0]);
    const group = new THREE.Group();
    group.position.copy(hinge);
    const inner = new THREE.Group();
    inner.position.copy(hinge).negate();
    group.add(inner);
    const mb = new MergeBuilder();
    const inT = (r, c) => lowerClass(r, c) === 'trunk';
    mb.add('body', LG.build(inT, { uv: lowerUV }));
    mb.add('under', LG.build(inT, { offset: -0.04, flip: true, uv: lowerUV }));
    mb.add('jamb', LG.edgeStrips(inT, (r, c) => !inT(r, c), 0.04));
    // lock + emblem
    mb.add('chrome', xform(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12).rotateX(Math.PI / 2), [0, deck(2.1) - 0.04, 2.165]));
    const meshes = mb.build({ body: bodyMat, under: M.darkMetal, jamb: bodyMat, chrome: M.chrome });
    for (const m of meshes.children) m.castShadow = true;
    inner.add(meshes);
    shell.add(group);
    // trunk cavity
    const cav = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.52), M.trunkInside);
    cav.position.set(0, 0.7, 1.86);
    shell.add(cav);
    out.trunk = { group, hinge };
  }

  // ---- fixed panes (windshield, rear, quarters) ---------------------------------------------------
  const wsPred = (r, c) => cls.classify(r, c) === 'ws';
  const rearPred = (r, c) => cls.classify(r, c) === 'rear';
  const paneUV = (axis) => (r, c) => {
    const p = GG.get(r, c);
    if (axis === 'ws') return [p.x, p.clone().sub(wsBase).dot(slope)];
    if (axis === 'rear') return [-p.x, p.y * 1.4];
    return [p.z, p.y];
  };
  const mkPane = (pred, axis, flipLeft = false) => {
    const g = GG.build(pred, { offset: -0.012, uv: paneUV(axis) });
    // mask uv1 normalised over the bounding box of uv
    const uv = g.attributes.uv;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      u0 = Math.min(u0, uv.getX(i));
      u1 = Math.max(u1, uv.getX(i));
      v0 = Math.min(v0, uv.getY(i));
      v1 = Math.max(v1, uv.getY(i));
    }
    const uv1 = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      uv1[i * 2] = (uv.getX(i) - u0) / (u1 - u0);
      uv1[i * 2 + 1] = (uv.getY(i) - v0) / (v1 - v0);
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    g.userData.uvRange = [u0, u1, v0, v1];
    return g;
  };
  out.panes.windshield = { geometry: mkPane(wsPred, 'ws'), parent: shell };
  out.panes.rear = { geometry: mkPane(rearPred, 'rear'), parent: shell };
  out.panes.qr = { geometry: mkPane((r, c) => cls.classify(r, c) === 'quarterR', 'side'), parent: shell };
  out.panes.ql = { geometry: mkPane((r, c) => cls.classify(r, c) === 'quarterL', 'side'), parent: shell };

  // ---- wheels -------------------------------------------------------------------------------------
  out.wheels = buildWheels(M);
  return out;
}

/** Wheels: tire (lathe), steel rim + old hubcap, brake drum. */
let wheelGeo = null;
function buildWheels(M) {
  if (!wheelGeo) {
    const R = DIM.wheelR, W = DIM.wheelW, rr = 0.165;
    // tire profile (r, y) around Y, then rotate to X axis
    const prof = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      const r = rr + (R - rr) * (0.55 + 0.45 * Math.cos(a) ** 0.6) + (Math.abs(a) < 1.2 ? 0 : 0);
      const y = (W / 2) * Math.sin(a) * 1.02;
      prof.push([Math.min(R, r + (Math.cos(a) > 0.5 ? (R - r) * 0.85 : 0)), y]);
    }
    const tread = lathe(prof, 40);
    tread.rotateZ(Math.PI / 2);
    const side = lathe([[rr, 0], [R * 0.86, 0]], 40);
    const sideA = side.clone().rotateZ(Math.PI / 2).translate(W / 2 + 0.002, 0, 0);
    const sideB = side.clone().rotateZ(-Math.PI / 2).translate(-W / 2 - 0.002, 0, 0);
    // planar uv on sidewalls for lettering
    for (const g of [sideA, sideB]) {
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getZ(i) / (2 * R) * 0.98, 0.5 + p.getY(i) / (2 * R) * 0.98);
    }
    // hubcap: domed disc with vents
    const mb = new MergeBuilder();
    const cap = lathe([[0.0, 0.03], [0.05, 0.028], [0.11, 0.02], [0.15, 0.008], [0.163, 0.0], [0.168, -0.006]], 32);
    cap.rotateZ(-Math.PI / 2);
    mb.add('hub', cap);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const v = new THREE.BoxGeometry(0.004, 0.022, 0.05);
      xform(v, [0.016, Math.cos(a) * 0.125, Math.sin(a) * 0.125], [a, 0, 0]);
      mb.add('dark', v);
    }
    const nut = new THREE.CylinderGeometry(0.028, 0.03, 0.02, 12).rotateZ(Math.PI / 2).translate(0.03, 0, 0);
    mb.add('hub', nut);
    const rim = lathe([[0.16, -0.07], [0.165, -0.02], [0.172, 0.0]], 28).rotateZ(-Math.PI / 2);
    mb.add('dark', rim);
    const drum = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 20).rotateZ(Math.PI / 2).translate(-0.06, 0, 0);
    mb.add('drum', drum);
    wheelGeo = { tread, sideA, sideB, hubBuilder: mb };
    const hubGroup = mb.build({ hub: M.chromeDull, dark: M.darkMetal, drum: M.drum });
    wheelGeo.hubMeshes = hubGroup.children.map((m) => ({ geometry: m.geometry, material: m.material }));
  }
  const wheels = [];
  for (const [front, z] of [[true, DIM.axleF], [false, DIM.axleR]]) {
    for (const sx of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * DIM.track, DIM.wheelR, z);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = new THREE.Mesh(wheelGeo.tread, M.tire);
      const sw = new THREE.Mesh(sx > 0 ? wheelGeo.sideA : wheelGeo.sideB, M.sidewall);
      const swi = new THREE.Mesh(sx > 0 ? wheelGeo.sideB : wheelGeo.sideA, M.sidewall);
      spin.add(tire, sw, swi);
      const hub = new THREE.Group();
      for (const h of wheelGeo.hubMeshes) hub.add(new THREE.Mesh(h.geometry, h.material));
      hub.scale.x = sx; // face outward
      hub.position.x = sx * (DIM.wheelW / 2 - 0.01);
      spin.add(hub);
      for (const o of [tire, sw]) o.castShadow = true;
      wheels.push({ pivot, spin, front, side: sx, z });
    }
  }
  return wheels;
}
