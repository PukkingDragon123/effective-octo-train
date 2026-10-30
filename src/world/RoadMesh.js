// Road surface ribbons: one material per spline (polygon-offset priority so overlapping
// junction areas resolve cleanly), split into ~48 m pieces for culling.
import * as THREE from 'three';
import { createRoadMaterial } from './worldMaterials.js';
import { W } from './constants.js';

const PRIORITY = { main: 0, ghost: 1, human: 2, spur: 3 };
const COLS = [-1, -0.86, -0.74, -0.5, -0.26, -0.08, 0, 0.08, 0.26, 0.5, 0.74, 0.86, 1];

/** Smooth a Float32Array with a box window (radius r samples). */
function smooth(arr, r) {
  const n = arr.length;
  const out = new Float32Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r), b = Math.min(n - 1, i + r);
    out[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
  }
  return out;
}

/**
 * Build road meshes for every spline of the network.
 * junctionInfo: { mainLen, junctionS } for marking fades.
 * Returns { group, pieces: [{mesh, cx, cz, r}], materials }
 */
export function buildRoadMeshes(road, layout) {
  const group = new THREE.Group();
  group.name = 'roads';
  const pieces = [];
  const materials = {};
  const hw = layout.roadWidth / 2;
  const sJ = layout.landmarks.spurJunction.u * road.length('main');
  for (const sp of road.splines.values()) {
    const mat = (materials[sp.id] = createRoadMaterial(PRIORITY[sp.id] ?? 3));
    const n = sp.points.length;
    const L = sp.length;
    const curv = smooth(sp.curvature || new Float32Array(n), 18);
    // marking fade, crown fade, edge line switches
    const fade = new Float32Array(n), crownF = new Float32Array(n), eOff = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = sp.cum[i];
      let f = 1, c = 1, off = 0;
      if (sp.id === 'main') {
        f = Math.min(1, Math.max(0, (s - 6) / 14), Math.max(0, (L - s - 4) / 10));
        c = Math.min(1, s / 40, (L - s) / 40);
        if (Math.abs(s - sJ) < 10) off += 2; // spur mouth on the right
      } else if (sp.id === 'ghost' || sp.id === 'human') {
        const d = Math.min(s, L - s);
        f = Math.min(1, Math.max(0, (d - 18) / 14));
        c = Math.min(1, Math.max(0, (d - 30) / 30));
        if (d < 32) off += sp.id === 'ghost' ? 2 : 1; // inner edges merge with the other branch
      } else if (sp.id === 'spur') {
        f = Math.min(1, Math.max(0, (L - s - 8) / 10));
        c = Math.min(1, Math.max(0, (L - s - 12) / 25));
        if (L - s < 6) off = 3;
      }
      fade[i] = f;
      crownF[i] = c;
      eOff[i] = off;
    }
    // pieces
    const step = W.roadPiece;
    for (let i0 = 0; i0 < n - 1; i0 += step) {
      const i1 = Math.min(n - 1, i0 + step);
      const rows = i1 - i0 + 1;
      const nc = COLS.length;
      const pos = new Float32Array(rows * nc * 3);
      const uv = new Float32Array(rows * nc * 2);
      const aR = new Float32Array(rows * nc * 4);
      const idx = [];
      let cx = 0, cz = 0;
      for (let r = 0; r < rows; r++) {
        const i = i0 + r;
        const p = sp.points[i], t = sp.tangents[i];
        const tl = Math.hypot(t.x, t.z) || 1;
        const rx = -t.z / tl, rz = t.x / tl;
        cx += p.x;
        cz += p.z;
        for (let c = 0; c < nc; c++) {
          const lat = COLS[c] * hw;
          const crown = 0.04 * (1 - COLS[c] * COLS[c]) * crownF[i];
          const k = (r * nc + c);
          pos[k * 3] = p.x + rx * lat;
          pos[k * 3 + 1] = p.y + 0.025 + crown;
          pos[k * 3 + 2] = p.z + rz * lat;
          uv[k * 2] = lat;
          uv[k * 2 + 1] = sp.cum[i];
          aR[k * 4] = curv[i] * 100;
          aR[k * 4 + 1] = fade[i];
          aR[k * 4 + 2] = 0;
          aR[k * 4 + 3] = eOff[i];
        }
        if (r < rows - 1) {
          for (let c = 0; c < nc - 1; c++) {
            const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
            idx.push(a, d, b, b, d, e);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('aRoad', new THREE.BufferAttribute(aR, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = `road_${sp.id}_${i0}`;
      mesh.renderOrder = -1;
      group.add(mesh);
      pieces.push({ mesh, cx: cx / rows, cz: cz / rows, r: geo.boundingSphere.radius });
    }
  }
  return { group, pieces, materials };
}
