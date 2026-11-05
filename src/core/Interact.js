// Look-at-and-click interaction registry. Anything the player can physically use
// (door handles, ignition key, radio knob, window crank, shrine offering...) is
// registered here. Each frame we raycast from the view centre; the UI shows a
// minimal hint for the current target, and pressing `interact` calls onUse().
//
// The current target is also marked in the world with a faint rim light (a fresnel shell drawn
// over the target's own visible meshes, main camera only). Pick proxies on the INTERACT layer are
// never drawn: for a proxy the rim goes on the visible meshes it encloses (spec.highlight
// overrides that: an Object3D or an array of them, or false for no rim).
import * as THREE from 'three';
import { engine } from './Engine.js';
import { input } from './Input.js';
import { bus } from './Events.js';
import { cameraRig } from './CameraRig.js';
import { LAYERS } from './layers.js';

const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
const _center = new THREE.Vector2(0, 0);

// ------------------------------------------------------------------------ target rim --
const RIM_MAX_MESHES = 24;
const RIM_MAX_VERTS = 400000;
const _box = new THREE.Box3();
const _sph = new THREE.Sphere();
const _v = new THREE.Vector3();
const _inv = new THREE.Matrix4();

let rimMaterial = null;
function getRimMaterial() {
  if (rimMaterial) return rimMaterial;
  rimMaterial = new THREE.ShaderMaterial({
    name: 'interact-rim',
    uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.74) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <batching_pars_vertex>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        #include <batching_vertex>
        #include <beginnormal_vertex>
        #include <morphinstance_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        #include <logdepthbuf_vertex>
        vN = normalize(transformedNormal);
        vView = -mvPosition.xyz;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      uniform vec3 uColor;
      #include <logdepthbuf_pars_fragment>
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        #include <logdepthbuf_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vView)));
        float rim = pow(f, 2.6) * 0.42 + 0.035;
        gl_FragColor = vec4(uColor * rim * uK, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    toneMapped: false,
    fog: false,
  });
  return rimMaterial;
}

/** Visible to the main camera: every ancestor visible and the mesh on a layer the camera draws. */
function drawnByMainCamera(o, camMask) {
  if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.userData?.isInteractRim) return false;
  if (!(o.layers.mask & camMask)) return false;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (!mats.some((m) => m && m.visible !== false && m.colorWrite !== false && !(m.transparent && m.opacity < 0.05))) return false;
  const g = o.geometry;
  if (!g?.attributes?.position || !g.attributes.normal) return false;
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** The meshes that should glow for an interactable. */
function rimTargets(item) {
  if (item.highlight === false) return [];
  const camMask = engine.camera?.layers?.mask ?? 1;
  const out = [];
  let verts = 0;
  const push = (o) => {
    if (out.length >= RIM_MAX_MESHES) return;
    const n = o.geometry.attributes.position.count;
    if (verts + n > RIM_MAX_VERTS) return;
    verts += n;
    out.push(o);
  };
  const roots = item.highlight ? [].concat(item.highlight).filter(Boolean) : [item.object];
  for (const r of roots) r.traverse((o) => drawnByMainCamera(o, camMask) && push(o));
  if (out.length || item.highlight || !item.object) return out;
  // a pick proxy: light the visible meshes it encloses (centre inside the proxy, not much bigger)
  const proxy = item.object;
  const parent = proxy.parent;
  if (!parent) return out;
  proxy.updateWorldMatrix(true, false);
  const pg = proxy.geometry;
  if (!pg) return out;
  if (!pg.boundingBox) pg.computeBoundingBox();
  _box.copy(pg.boundingBox).expandByScalar(0.02);
  _inv.copy(proxy.matrixWorld).invert();
  const proxyR = pg.boundingBox.getSize(_v).length() * 0.5 * proxy.matrixWorld.getMaxScaleOnAxis();
  const scan = (o, depth) => {
    if (out.length >= RIM_MAX_MESHES || depth > 6 || !o.visible) return;
    if (o !== proxy && drawnByMainCamera(o, camMask)) {
      const g = o.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      _sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (_sph.radius <= proxyR * 1.6 + 0.05 && _box.containsPoint(_v.copy(_sph.center).applyMatrix4(_inv))) push(o);
    }
    for (const c of o.children) scan(c, depth + 1);
  };
  scan(parent, 0);
  return out;
}

function makeShell(src, mat) {
  let s;
  if (src.isSkinnedMesh && src.skeleton) {
    s = new THREE.SkinnedMesh(src.geometry, mat);
    s.bind(src.skeleton, src.bindMatrix);
    s.bindMode = src.bindMode;
  } else s = new THREE.Mesh(src.geometry, mat);
  if (src.morphTargetInfluences) {
    s.morphTargetInfluences = src.morphTargetInfluences;
    s.morphTargetDictionary = src.morphTargetDictionary;
  }
  s.userData.isInteractRim = true;
  s.name = 'interact-rim';
  s.layers.set(LAYERS.MAIN_ONLY); // never in mirrors or the glass pass
  s.frustumCulled = src.frustumCulled;
  s.castShadow = false;
  s.receiveShadow = false;
  s.renderOrder = (src.renderOrder || 0) + 1;
  s.raycast = () => {};
  s.matrixAutoUpdate = true;
  src.add(s);
  return s;
}

class Interact {
  constructor() {
    this.items = new Set();
    this.current = null;
    this.currentHit = null;
    this.enabled = true;
    this.holding = null; // item whose onHold is running
    this.highlight = true; // rim light on the current target
    this._rim = { item: null, shells: [], k: 0, t: 0 };
  }

  install() {
    engine.onUpdate((dt) => this.update(dt), 5);
    engine.onUpdate((dt) => this._updateRim(dt), 6, { always: true });
    return this;
  }

  /**
   * Register an interactable.
   * spec = {
   *   id: string, object: Object3D (meshes inside are raycast; invisible proxies are fine),
   *   labelEN: string, labelTH: string, icon?: 'hand'|'grab'|'talk'|'eye'|'key'|'pray',
   *   reach?: metres (default 1.5), enabled?: () => boolean,
   *   highlight?: Object3D | Object3D[] | false   // what gets the rim light (default: object's
   *                                               // visible meshes, or what a proxy encloses)
   *   onUse?: (ctx:{item, point, hit}) => void,          // on press
   *   onHold?: (dt, ctx) => void, onRelease?: (ctx) => void  // while held
   * }
   * Returns the item (call interact.unregister(item) to remove).
   */
  register(spec) {
    const item = { reach: 1.5, icon: 'hand', enabled: () => true, ...spec };
    this.items.add(item);
    return item;
  }

  unregister(item) {
    this.items.delete(item);
    if (this.current === item) this._setCurrent(null, null);
    if (this._rim.item === item) this._clearRim();
  }

  /** Remove every item whose id starts with prefix (scene teardown). */
  unregisterPrefix(prefix) {
    for (const it of [...this.items]) if (it.id.startsWith(prefix)) this.unregister(it);
  }

  _setCurrent(item, hit) {
    if (item !== this.current) {
      this.current = item;
      bus.emit('interact:target', item ? { id: item.id, labelEN: item.labelEN, labelTH: item.labelTH, icon: item.icon } : null);
    }
    this.currentHit = hit;
  }

  // the rim fades in on the new target and out on the old one
  _updateRim(dt) {
    const R = this._rim;
    const want = this.highlight && this.current && !engine.paused ? this.current : null;
    if (want !== R.item) {
      if (R.k > 0.02 && R.item) R.k = Math.max(0, R.k - dt * 9);
      else {
        this._clearRim();
        if (want) {
          R.item = want;
          try {
            const mat = getRimMaterial();
            R.shells = rimTargets(want).map((m) => makeShell(m, mat));
          } catch (e) {
            console.warn('[interact] rim failed', e);
            R.shells = [];
          }
          R.k = 0;
        }
      }
    } else if (R.item) R.k = Math.min(1, R.k + dt * 6);
    if (R.item && rimMaterial) {
      R.t += dt;
      rimMaterial.uniforms.uK.value = R.k * (0.86 + 0.14 * Math.sin(R.t * 2.6));
    }
  }

  _clearRim() {
    const R = this._rim;
    for (const s of R.shells) s.removeFromParent();
    R.shells = [];
    R.item = null;
    R.k = 0;
  }

  update(dt) {
    if (!this.enabled || engine.paused || cameraRig.cineBlend > 0.5) {
      this._setCurrent(null, null);
      return;
    }
    raycaster.setFromCamera(_center, engine.camera);
    raycaster.far = 4;
    let best = null;
    let bestHit = null;
    const objs = [];
    const owners = new Map();
    for (const it of this.items) {
      let ok = false;
      try {
        ok = it.enabled();
      } catch (e) {
        ok = false;
      }
      if (!ok || !it.object) continue;
      objs.push(it.object);
      owners.set(it.object, it);
    }
    if (objs.length) {
      const hits = raycaster.intersectObjects(objs, true);
      for (const h of hits) {
        let o = h.object;
        let owner = null;
        while (o && !owner) {
          owner = owners.get(o) || null;
          o = o.parent;
        }
        if (owner && h.distance <= owner.reach) {
          best = owner;
          bestHit = h;
          break;
        }
      }
    }
    this._setCurrent(best, bestHit);

    if (best && input.pressed('interact')) {
      const ctx = { item: best, point: bestHit.point.clone(), hit: bestHit };
      bus.emit('interact:use', { id: best.id });
      try {
        best.onUse?.(ctx);
      } catch (err) {
        console.error('[interact] onUse failed', best.id, err);
      }
      if (best.onHold) this.holding = { item: best, ctx };
      input.consume('interact');
    }
    if (this.holding) {
      if (input.down('interact') || input.down('confirm')) {
        try {
          this.holding.item.onHold(dt, this.holding.ctx);
        } catch (err) {
          console.error(err);
        }
      } else {
        try {
          this.holding.item.onRelease?.(this.holding.ctx);
        } catch (err) {
          console.error(err);
        }
        this.holding = null;
      }
    }
  }
}

export const interact = new Interact();
