// Shadow budget (render module):
//  * the sun is the render module's only shadow-casting light; its map is 1024 (medium) –
//    2048 (high / ultra) and it re-renders only while the sun is actually up (Sky.js);
//  * at night the per-pixel shadow lookups are skipped too (lights_fragment_begin patch in
//    ShaderPatches.js: a light with zero colour costs nothing);
//  * small casters are excluded: meshes whose world bounding radius is under
//    MIN_CASTER_RADIUS would only add a few blurred texels to the map but cost a draw call
//    in every shadow pass. Each object is checked once (new objects as they stream in).
import * as THREE from 'three';

/** Meshes smaller than this (world bounding-sphere radius, metres) never cast shadows. */
export const MIN_CASTER_RADIUS = 0.15;

const _checked = new WeakSet();
const _s = new THREE.Vector3();

/** Turn castShadow off on small meshes under `root`. Returns how many were excluded. */
export function excludeSmallCasters(root, minRadius = MIN_CASTER_RADIUS) {
  let n = 0;
  root.traverse((o) => {
    if (!o.castShadow || _checked.has(o)) return;
    _checked.add(o);
    if (!o.isMesh || o.isSkinnedMesh) return; // characters stay whole
    const g = o.geometry;
    if (!g || !g.attributes?.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere;
    if (!bs || !(bs.radius > 0)) return;
    _s.setFromMatrixScale(o.matrixWorld);
    const r = bs.radius * Math.max(Math.abs(_s.x), Math.abs(_s.y), Math.abs(_s.z));
    if (r < minRadius) {
      o.castShadow = false;
      n++;
    }
  });
  return n;
}

let _installed = false;
/** Scans the scene for small shadow casters every ~2 s while shadows are enabled. */
export function installShadowBudget(engine) {
  if (_installed) return;
  _installed = true;
  let frame = 0;
  engine.onUpdate(
    () => {
      if (++frame % 120 !== 30) return;
      if (!engine.renderer?.shadowMap?.enabled) return;
      excludeSmallCasters(engine.scene);
    },
    85,
    { always: true },
  );
}
