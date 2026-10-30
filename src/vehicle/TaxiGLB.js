// Binds a professional taxi model (public/assets/vehicle/taxi.glb) to the taxi systems.
// Produces the same { ext, int:{group, parts} } shape as the procedural builders
// (TaxiModel.js / TaxiInterior.js), so glass, mirrors, lights, controls and physics work
// unchanged. Every node is optional: anything missing gets an invisible stand-in.
//
// Node contract (Blender +Y forward exports to three -Z; driver at +X; ground at y = 0):
//   body (paint_green, paint_yellow, chrome, rubber, plastic_black ... material slots)
//   glass_windshield glass_rear glass_fl glass_fr glass_rl glass_rr (+ optional glass_ql glass_qr);
//     side glass parented to its door
//   mirror_rear_surface mirror_left_surface mirror_right_surface (flat reflector quads)
//   hinged, origin on the pivot: door_fl door_fr door_rl door_rr hood trunk wheel_fl wheel_fr
//     wheel_rl wheel_rr steering_wheel needle_speedo needle_tacho needle_fuel needle_temp
//     gear_lever handbrake_lever pedal_throttle pedal_brake pedal_clutch glovebox_lid
//     sun_visor_driver window_crank_fl/fr/rl/rr rearview_mirror key_slot (+ optional wiper_l wiper_r,
//     radio_knob_vol radio_knob_tune stalk_lights stalk_wipers door_handle_in_xx dash_sticker dome_light)
//   lights: light_head_l/r light_tail_l/r light_ind_fl/fr/rl/rr light_brake light_reverse roof_sign vacant_lamp
//   display quads (UVs 0..1): meter_display radio_display gauge_speedo gauge_tacho gauge_fuel gauge_temp
//     plate_front plate_rear
//   anchors: empties named like the TAXI_ANCHORS keys override the built-in positions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintedMaterial } from '../render/index.js';
import { instantiate } from './VehicleAssets.js';
import { lensMaterials, sharedMaterials } from './Materials.js';
import { instanceMaterials, buildKey } from './TaxiInterior.js';
import * as VT from './VehicleTextures.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _box = new THREE.Box3();
const Z = new THREE.Vector3(0, 0, 1);

/** name -> node, also matching Blender duplicates ('door_fl.001' -> 'door_fl001'). */
function indexNodes(root) {
  const idx = new Map();
  root.traverse((o) => {
    if (!o.name) return;
    if (!idx.has(o.name)) idx.set(o.name, o);
    const base = o.name.replace(/(\.\d+|_?\d{3})$/, '');
    if (base !== o.name && !idx.has(base)) idx.set(base, o);
  });
  return (name) => idx.get(name) || null;
}

const worldPos = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);
const boxOf = (o) => new THREE.Box3().setFromObject(o);

/** Wrap a node in an identity-oriented pivot group at the node's origin (same world transform). */
function insertPivot(node) {
  const parent = node.parent;
  const pivot = new THREE.Group();
  pivot.name = node.name + '_pivot';
  pivot.position.copy(node.position);
  parent.add(pivot);
  node.position.set(0, 0, 0);
  pivot.add(node);
  pivot.updateMatrixWorld(true);
  return pivot;
}

/** Body-space direction -> unit direction in obj's local frame. */
function dirToLocal(obj, dir) {
  const q = obj.getWorldQuaternion(new THREE.Quaternion()).invert();
  return dir.clone().applyQuaternion(q).normalize();
}

/**
 * Make a pivot turn about `axisBody` (body space). sign is chosen so that turning by
 * +1 moves the part's centroid along `want` (body-space vector), matching the procedural
 * control conventions. Sets pivot.userData.{axis, sign}.
 */
function setTurn(pivot, axisBody, want = null, node = pivot) {
  const parent = pivot.parent;
  pivot.userData.axis = dirToLocal(parent, axisBody);
  let sign = 1;
  if (want) {
    const c = boxOf(node).getCenter(new THREE.Vector3()).sub(worldPos(pivot));
    const d = new THREE.Vector3().crossVectors(axisBody, c);
    sign = d.dot(want) >= 0 ? 1 : -1;
  }
  pivot.userData.sign = sign;
  return pivot;
}

/** Merge every mesh under node into one geometry in `space` (position + normal only). */
function bakeGeometry(node, space) {
  space.updateMatrixWorld(true);
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const list = [];
  node.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    if (o.geometry.attributes.normal) g.setAttribute('normal', o.geometry.attributes.normal.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push(g.index ? g : g);
  });
  if (!list.length) return null;
  const allIndexed = list.every((g) => g.index);
  const parts = allIndexed ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

/** Smallest-variance direction of a point set (plane normal) via two power iterations. */
function pcaNormal(points) {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  c.multiplyScalar(1 / Math.max(1, points.length));
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j];
  }
  const mul = (M, v) => new THREE.Vector3(M[0] * v.x + M[1] * v.y + M[2] * v.z, M[3] * v.x + M[4] * v.y + M[5] * v.z, M[6] * v.x + M[7] * v.y + M[8] * v.z);
  const power = (M, seed) => {
    let v = seed.clone().normalize();
    for (let i = 0; i < 40; i++) {
      const n = mul(M, v);
      if (n.lengthSq() < 1e-20) break;
      v = n.normalize();
    }
    return v;
  };
  const v1 = power(C, new THREE.Vector3(1, 0.3, 0.2));
  const l1 = v1.dot(mul(C, v1));
  const C2 = C.slice();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C2[i * 3 + j] -= l1 * v1.getComponent(i) * v1.getComponent(j);
  let seed = new THREE.Vector3(0.2, 1, 0.3);
  seed.addScaledVector(v1, -seed.dot(v1));
  const v2 = power(C2, seed);
  return { center: c, normal: new THREE.Vector3().crossVectors(v1, v2).normalize(), major: v1 };
}

function geometryPoints(geo, matrix, step = 1) {
  const p = geo.attributes.position, out = [];
  for (let i = 0; i < p.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix));
  return out;
}

/**
 * Build the taxi from a loaded glTF. anchorDefaults = TAXI_ANCHORS (body-space arrays).
 * Returns { ext, int:{group, parts}, anchors:{key: Vector3}, maskWipers }.
 */
export function buildTaxiFromGLB(gltf, anchorDefaults) {
  const root = instantiate(gltf.scene || gltf);
  root.name = 'taxiGLB';
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const N = indexNodes(root);
  const ext = { glb: true, shell: root, wheels: [], panes: {}, lenses: null, mirrorMounts: {}, wipers: [], doors: {}, trunk: null, hood: null, maskWipers: null };
  const parts = { swings: [], rattles: [], im: instanceMaterials(), needles: {}, pedals: {}, cranks: {}, lockPins: {}, innerHandles: {}, visors: {}, doorCards: {}, vacantGroup: null };
  const anchors = {};
  const derived = {};
  const def = (k) => new THREE.Vector3(...anchorDefaults[k]);
  const at = (k) => anchors[k] || derived[k] || def(k);
  const stand = (name, pos, parent = root) => {
    const g = new THREE.Group();
    g.name = name + '_standin';
    parent.add(g);
    g.position.copy(parent === root ? pos : parent.worldToLocal(pos.clone()));
    g.updateMatrixWorld(true);
    return g;
  };

  // ---- anchors from empties (exact names) --------------------------------------------------
  for (const k of Object.keys(anchorDefaults)) {
    const n = N(k);
    if (n) anchors[k] = worldPos(n);
  }
  const eye = at('driverEye').clone();

  // ---- decorations the vehicle module builds itself (garland, amulets) are hidden in the GLB -------
  root.traverse((o) => {
    if (/^(amulet|garland|malai|phuang)/i.test(o.name)) o.visible = false;
  });

  // ---- wheels: moved to the chassis by the Taxi (they don't follow body roll) ---------------------
  for (const id of ['fl', 'fr', 'rl', 'rr']) {
    const n = N('wheel_' + id);
    if (!n) continue;
    const c = worldPos(n);
    const pivot = new THREE.Group();
    pivot.name = 'wheel_' + id + '_pivot';
    pivot.position.copy(c);
    const spin = new THREE.Group();
    pivot.add(spin);
    pivot.updateMatrixWorld(true);
    spin.attach(n);
    ext.wheels.push({ pivot, spin, front: id[0] === 'f', side: id[1] === 'r' ? 1 : -1, radius: c.y });
  }

  // ---- doors, hood, trunk -----------------------------------------------------------------------
  for (const id of ['fl', 'fr', 'rl', 'rr']) {
    const n = N('door_' + id);
    if (!n) continue;
    const pivot = insertPivot(n);
    const hinge = worldPos(pivot);
    const b = boxOf(n);
    const c = b.getCenter(new THREE.Vector3());
    const side = Math.sign(c.x) || (id[1] === 'r' ? 1 : -1);
    // + rotation.y swings the far edge outward when the hinge is at the front edge
    const sx = side * (Math.sign(c.z - hinge.z) || 1);
    const hOut = N('door_handle_out_' + id);
    const outer = hOut ? worldPos(hOut) : new THREE.Vector3(side > 0 ? b.max.x : b.min.x, THREE.MathUtils.clamp(0.8, b.min.y, b.max.y), c.z > hinge.z ? b.max.z - 0.17 : b.min.z + 0.17);
    ext.doors[id] = { group: pivot, inner: pivot, sx, outerHandle: pivot.worldToLocal(outer.clone()), node: n };
    derived['door' + id.toUpperCase()] = new THREE.Vector3(side > 0 ? b.max.x : b.min.x, c.y, c.z);
  }
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  const trunk = N('trunk');
  if (trunk) {
    const p = setTurn(insertPivot(trunk), X, new THREE.Vector3(0, -1, 0), trunk); // procedural opens with negative angles
    ext.trunk = { group: p };
    derived.trunk = boxOf(trunk).getCenter(new THREE.Vector3());
  }
  const hood = N('hood');
  if (hood) {
    const p = setTurn(insertPivot(hood), X, new THREE.Vector3(0, 1, 0), hood);
    ext.hood = { group: p };
    derived.hood = boxOf(hood).getCenter(new THREE.Vector3());
  }

  // ---- glass panes (geometry baked into the parent; mask uv1 + metric uv generated) -----------------
  const paneNodes = { windshield: 'glass_windshield', rear: 'glass_rear', fl: 'glass_fl', fr: 'glass_fr', rl: 'glass_rl', rr: 'glass_rr', ql: 'glass_ql', qr: 'glass_qr' };
  let wsBasis = null;
  for (const [id, name] of Object.entries(paneNodes)) {
    const n = N(name);
    if (!n) continue;
    const parent = n.parent;
    const geo = bakeGeometry(n, parent);
    n.removeFromParent();
    if (!geo) continue;
    const pts = geometryPoints(geo, parent.matrixWorld, Math.max(1, Math.floor(geo.attributes.position.count / 400)));
    const { center, normal } = pcaNormal(pts);
    const up = Y.clone().addScaledVector(normal, -Y.dot(normal)).normalize();
    const sideV = new THREE.Vector3().crossVectors(up, normal).normalize();
    const isSide = id !== 'windshield' && id !== 'rear';
    if (isSide ? sideV.z < 0 : sideV.x < 0) sideV.negate(); // u rearward on side glass, toward +X front/back
    const pa = geo.attributes.position, nV = pa.count;
    const us = new Float32Array(nV), vs = new Float32Array(nV);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < nV; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(parent.matrixWorld);
      _w.copy(_v).sub(center);
      us[i] = _w.dot(sideV);
      vs[i] = _w.dot(up);
      u0 = Math.min(u0, us[i]);
      u1 = Math.max(u1, us[i]);
      v0 = Math.min(v0, vs[i]);
      v1 = Math.max(v1, vs[i]);
      yMin = Math.min(yMin, _v.y);
      yMax = Math.max(yMax, _v.y);
    }
    const uv = new Float32Array(nV * 2), uv1 = new Float32Array(nV * 2);
    for (let i = 0; i < nV; i++) {
      uv[i * 2] = us[i] - u0;
      uv[i * 2 + 1] = vs[i] - v0;
      uv1[i * 2] = (us[i] - u0) / Math.max(1e-4, u1 - u0);
      uv1[i * 2 + 1] = (vs[i] - v0) / Math.max(1e-4, v1 - v0);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    const spec = { geometry: geo, parent };
    if (id === 'fl' || id === 'fr' || id === 'rl' || id === 'rr') {
      // slide straight down (body -Y), 1 world metre per unit of travel
      const a = parent.worldToLocal(center.clone()), b2 = parent.worldToLocal(center.clone().add(new THREE.Vector3(0, -1, 0)));
      spec.slide = b2.sub(a);
      spec.travel = (yMax - yMin) * (id[0] === 'r' ? 0.72 : 0.95);
      spec.clipY = yMin - 0.003;
    }
    if (id === 'windshield') wsBasis = { center, side: sideV, up, u0, u1, v0, v1 };
    ext.panes[id] = spec;
  }

  // ---- wipers (optional nodes) + wiper sectors in windshield mask space ----------------------------
  const wsN = wsBasis ? new THREE.Vector3().crossVectors(wsBasis.side, wsBasis.up).normalize() : new THREE.Vector3(0, 0.5, -1).normalize();
  const toMask = (p) => (wsBasis ? [(p.clone().sub(wsBasis.center).dot(wsBasis.side) - wsBasis.u0) / (wsBasis.u1 - wsBasis.u0), (p.clone().sub(wsBasis.center).dot(wsBasis.up) - wsBasis.v0) / (wsBasis.v1 - wsBasis.v0)] : [0.5, 0]);
  const wsW = wsBasis ? wsBasis.u1 - wsBasis.u0 : 1.4;
  const masks = [];
  for (const name of ['wiper_r', 'wiper_l']) {
    const n = N(name);
    if (!n) continue;
    const p = insertPivot(n);
    setTurn(p, wsN, Y, n); // + sweeps the blade up the glass
    const len = boxOf(n).getSize(new THREE.Vector3()).length() * 0.85;
    const origin = worldPos(p);
    ext.wipers.push({ pivot: p, len, origin });
    const [pu, pv] = toMask(origin);
    masks.push([pu, pv, (len * 0.12) / wsW, (len * 1.0) / wsW]);
  }
  if (!masks.length && wsBasis) {
    // no wiper nodes: two virtual blades parked along the bottom edge
    masks.push([0.24, -0.04, 0.04, 0.48], [0.69, -0.04, 0.04, 0.46]);
  }
  ext.maskWipers = masks;

  // ---- mirrors: mount frames fitted to the reflector quads -----------------------------------------
  const mirrorFor = (name) => {
    const n = N(name);
    if (!n) return null;
    const parent = n.parent;
    const geoP = bakeGeometry(n, parent);
    n.removeFromParent();
    if (!geoP) return null;
    const pts = geometryPoints(geoP, parent.matrixWorld);
    const { center, normal } = pcaNormal(pts);
    if (normal.dot(eye.clone().sub(center)) < 0) normal.negate();
    const up = Y.clone().addScaledVector(normal, -Y.dot(normal)).normalize();
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    let w = 0, h = 0;
    for (const p of pts) {
      _w.copy(p).sub(center);
      w = Math.max(w, Math.abs(_w.dot(right)) * 2);
      h = Math.max(h, Math.abs(_w.dot(up)) * 2);
    }
    const mount = new THREE.Object3D();
    mount.name = name + '_mount';
    const mw = new THREE.Matrix4().makeBasis(right, up, normal).setPosition(center);
    parent.add(mount);
    const local = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(mw);
    local.decompose(mount.position, mount.quaternion, mount.scale);
    mount.updateMatrixWorld(true);
    // the surface geometry in mount space, with 0..1 uv for the dirt / edge falloff
    const geo = bakeGeometry({ traverse: (f) => f({ isMesh: true, geometry: geoP, matrixWorld: parent.matrixWorld }), updateMatrixWorld() {} }, mount);
    const pa = geo.attributes.position;
    const uv = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) {
      uv[i * 2] = pa.getX(i) / Math.max(1e-4, w) + 0.5;
      uv[i * 2 + 1] = pa.getY(i) / Math.max(1e-4, h) + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.translate(0, 0, 0.0004);
    mount.userData.size = [w, h];
    mount.userData.geometry = geo;
    return mount;
  };
  parts.rearviewMount = mirrorFor('mirror_rear_surface');
  ext.mirrorMounts.left = mirrorFor('mirror_left_surface');
  ext.mirrorMounts.right = mirrorFor('mirror_right_surface');
  if (parts.rearviewMount) derived.rearviewMirror = worldPos(parts.rearviewMount);
  if (ext.mirrorMounts.left) derived.mirrorLeft = worldPos(ext.mirrorMounts.left);
  if (ext.mirrorMounts.right) derived.mirrorRight = worldPos(ext.mirrorMounts.right);
  const rv = N('rearview_mirror');
  parts.rearview = rv;
  if (rv) {
    const b = boxOf(rv);
    derived.amuletHang = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y - 0.004, (b.min.z + b.max.z) / 2);
  }

  // ---- lights -----------------------------------------------------------------------------------
  const base = lensMaterials();
  const lens = (names, fallback, emissive, tex = null) => {
    const nodes = names.map(N).filter(Boolean);
    if (!nodes.length) return fallback;
    let mat = null;
    for (const n of nodes) {
      const meshes = [];
      n.traverse((o) => o.isMesh && meshes.push(o));
      const lensish = meshes.filter((o) => /lens|light|glow|emiss|lamp|face|sign|bulb/i.test(o.material?.userData?.sourceName || o.material?.name || ''));
      for (const o of lensish.length ? lensish : meshes) {
        if (!mat) {
          const src = o.material;
          const map = src.map || tex;
          mat = paintedMaterial({ color: src.color ? src.color.clone() : 0xffffff, map, emissive, emissiveMap: src.emissiveMap || map, emissiveIntensity: 0, roughness: src.roughness ?? 0.25, metalness: src.metalness ?? 0, transparent: !!src.transparent, opacity: src.opacity ?? 1, brush: 0.12, name: 'glb_lens_' + names[0] });
        }
        o.material = mat;
      }
    }
    return mat || fallback;
  };
  ext.lenses = {
    head: lens(['light_head_l', 'light_head_r'], base.head, 0xfff1d6),
    tail: lens(['light_tail_l', 'light_tail_r', 'light_brake'], base.tail, 0xff2a1a),
    reverse: lens(['light_reverse'], base.reverse, 0xfff4e6),
    indL: lens(['light_ind_fl', 'light_ind_rl'], base.indL, 0xffa21e),
    indR: lens(['light_ind_fr', 'light_ind_rr'], base.indR, 0xffa21e),
    roofSign: lens(['roof_sign'], base.roofSign, 0xfff2d8, VT.roofSignTex()),
    vacant: lens(['vacant_lamp'], base.vacant, 0xffffff, VT.vacantTex()),
  };
  for (const [k, n] of [['headlightL', 'light_head_l'], ['headlightR', 'light_head_r'], ['taillightL', 'light_tail_l'], ['taillightR', 'light_tail_r']]) {
    const o = N(n);
    if (o) derived[k] = boxOf(o).getCenter(new THREE.Vector3());
  }

  // ---- display quads -------------------------------------------------------------------------------
  const skin = (name, mat) => {
    const n = N(name);
    if (!n) return null;
    n.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
    return n;
  };
  const meterQuad = skin('meter_display', parts.im.meter);
  const radioQuad = skin('radio_display', parts.im.radio);
  skin('warning_display', parts.im.warn) || skin('warn_display', parts.im.warn);
  for (const [kind, names] of Object.entries({ speed: ['gauge_speedo', 'gauge_speed', 'gauge_face_speedo'], tacho: ['gauge_tacho', 'gauge_face_tacho'], fuel: ['gauge_fuel', 'gauge_face_fuel'], temp: ['gauge_temp', 'gauge_face_temp'] })) {
    for (const nm of names) if (skin(nm, parts.im.gauges[kind])) break;
  }
  const plate = sharedMaterials().plate;
  skin('plate_front', plate);
  skin('plate_rear', plate);
  if (meterQuad) derived.meter = boxOf(meterQuad).getCenter(new THREE.Vector3());
  if (radioQuad) derived.radioKnob = boxOf(radioQuad).getCenter(new THREE.Vector3());
  const dome = skin('dome_light', parts.im.dome) || skin('light_dome', parts.im.dome);
  if (dome) derived.cabinLight = boxOf(dome).getCenter(new THREE.Vector3());
  parts.domeLens = dome || stand('domeLens', at('cabinLight'));
  parts.meter = meterQuad || stand('meter', at('meter'));

  // ---- needles: turn about the gauge-face normal (toward the driver), clockwise ----------------------
  for (const [kind, name, big] of [['speed', 'needle_speedo', true], ['tacho', 'needle_tacho', true], ['fuel', 'needle_fuel', false], ['temp', 'needle_temp', false]]) {
    const n = N(name);
    if (!n) continue;
    n.traverse((o) => {
      if (o.isMesh) o.material = parts.im.needle;
    });
    const p = insertPivot(n);
    const toEye = eye.clone().sub(worldPos(p)).normalize();
    parts.needles[kind] = { pivot: p, big, axis: dirToLocal(p.parent, toEye), sweep: big ? Math.PI * 1.5 : Math.PI * 0.4 };
  }

  // ---- steering wheel: spin about the column (PCA normal of the rim) --------------------------------
  const sw = N('steering_wheel');
  if (sw) {
    const c = worldPos(sw);
    const pts = [];
    sw.updateMatrixWorld(true);
    sw.traverse((o) => {
      if (o.isMesh) pts.push(...geometryPoints(o.geometry, o.matrixWorld, Math.max(1, Math.floor(o.geometry.attributes.position.count / 600))));
    });
    let axis = pts.length > 8 ? pcaNormal(pts).normal : c.clone().sub(eye).normalize();
    if (axis.dot(c.clone().sub(eye)) < 0) axis.negate(); // into the dash: + rotation.z reads clockwise to the driver
    const pivot = new THREE.Group();
    pivot.name = 'steering_pivot';
    sw.parent.add(pivot);
    pivot.position.copy(sw.parent.worldToLocal(c.clone()));
    pivot.quaternion.copy(sw.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromUnitVectors(Z, axis)));
    const spin = new THREE.Group();
    pivot.add(spin);
    pivot.updateMatrixWorld(true);
    spin.attach(sw);
    parts.steering = { pivot, spin };
    derived.steeringWheel = c.clone();
    derived.hornPad = c.clone();
  } else {
    const pivot = stand('steering', at('steeringWheel'));
    const spin = new THREE.Group();
    pivot.add(spin);
    parts.steering = { pivot, spin };
  }
  parts.hornAnchor = new THREE.Object3D();
  parts.steering.spin.add(parts.hornAnchor);

  // ---- key slot + a modelled key --------------------------------------------------------------------
  const ks = N('key_slot');
  {
    const c = ks ? worldPos(ks) : at('keySlot');
    if (ks) derived.keySlot = c.clone();
    const out = eye.clone().sub(c).normalize();
    const slot = new THREE.Group();
    slot.name = 'keySlot';
    const parent = ks ? ks.parent : root;
    parent.add(slot);
    slot.position.copy(parent.worldToLocal(c.clone()));
    slot.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromUnitVectors(Z, out)));
    const key = buildKey();
    slot.add(key);
    parts.keySlot = slot;
    parts.key = key;
  }

  // ---- levers, pedals, lids, cranks --------------------------------------------------------------------
  const lever = (name, standName, anchorKey, axis, want) => {
    const n = N(name);
    if (!n) return stand(standName, at(anchorKey));
    const p = insertPivot(n);
    if (axis) setTurn(p, axis, want, n);
    return p;
  };
  parts.gear = lever('gear_lever', 'gear', 'gearKnob', null);
  if (N('gear_lever')) {
    const b = boxOf(N('gear_lever'));
    derived.gearKnob = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
  }
  parts.gearGate = N('gear_gate') || stand('gearGate', at('gearKnob'));
  parts.handbrake = lever('handbrake_lever', 'handbrake', 'handbrake', X, Y); // + pulls the grip up
  parts.pedals.throttle = lever('pedal_throttle', 'pedalThrottle', 'pedalThrottle', X, Z); // - pushes the pad forward
  parts.pedals.brake = lever('pedal_brake', 'pedalBrake', 'pedalBrake', X, Z);
  parts.pedals.clutch = lever('pedal_clutch', 'pedalClutch', 'pedalClutch', X, Z);
  parts.glovebox = lever('glovebox_lid', 'glovebox', 'gloveBox', X, Z); // + swings the lid toward the cabin
  const gl = N('glovebox_lid');
  if (gl) derived.gloveBox = boxOf(gl).getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0, -0.12));
  parts.gloveAnchor = stand('gloveAnchor', at('gloveBox'));
  const visor = N('sun_visor_driver');
  if (visor) {
    const p = insertPivot(visor);
    setTurn(p, X, new THREE.Vector3(0, -1, 0), visor); // + flips it down
    p.userData.relative = true;
    parts.visors.driver = p;
    derived.sunVisorDriver = boxOf(visor).getCenter(new THREE.Vector3());
  } else parts.visors.driver = stand('visor', at('sunVisorDriver'));
  parts.photoAnchor = stand('photoAnchor', at('sunVisorDriver'), parts.visors.driver);
  for (const id of ['fl', 'fr', 'rl', 'rr']) {
    const doorP = ext.doors[id]?.group || root;
    const n = N('window_crank_' + id);
    const dflt = id === 'fl' ? at('windowCrankFL') : id === 'fr' ? at('windowCrankFR') : at('door' + id.toUpperCase()).clone().add(new THREE.Vector3(id[1] === 'r' ? -0.15 : 0.15, -0.2, 0.1));
    if (n) {
      const p = insertPivot(n);
      setTurn(p, X, null, n);
      parts.cranks[id] = p;
      if (id === 'fl') derived.windowCrankFL = worldPos(p);
      if (id === 'fr') derived.windowCrankFR = worldPos(p);
    } else parts.cranks[id] = stand('crank_' + id, dflt, doorP);
    const hIn = N('door_handle_in_' + id);
    parts.innerHandles[id] = hIn ? insertPivot(hIn) : stand('handle_' + id, at('door' + id.toUpperCase()).clone().add(new THREE.Vector3(id[1] === 'r' ? -0.12 : 0.12, 0.1, -0.25)), doorP);
    parts.lockPins[id] = stand('lock_' + id, at('door' + id.toUpperCase()).clone().add(new THREE.Vector3(id[1] === 'r' ? -0.1 : 0.1, 0.2, 0.3)), doorP);
  }

  // ---- stalks, radio knobs, sticker -------------------------------------------------------------------
  const knob = (name, standName, pos) => {
    const n = N(name);
    if (!n) return stand(standName, pos);
    const p = insertPivot(n);
    setTurn(p, eye.clone().sub(worldPos(p)).normalize(), null, n);
    return p;
  };
  parts.stalkLights = N('stalk_lights') ? insertPivot(N('stalk_lights')) : stand('stalkLights', at('headlightStalk'));
  parts.stalkWipers = N('stalk_wipers') ? insertPivot(N('stalk_wipers')) : stand('stalkWipers', at('wiperStalk'));
  const rpos = at('radioKnob');
  parts.radioKnobVol = knob('radio_knob_vol', 'radioVol', rpos.clone().add(new THREE.Vector3(-0.075, 0, 0.01)));
  parts.radioKnobTune = knob('radio_knob_tune', 'radioTune', rpos.clone().add(new THREE.Vector3(0.075, 0, 0.01)));
  const st = N('dash_sticker') || N('sticker_dash');
  if (st) derived.dashSticker = worldPos(st);
  parts.stickerAnchor = st || stand('sticker', at('dashSticker'));

  // gaze / shadows
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const interior = new THREE.Group();
  interior.name = 'taxiInterior';
  for (const k of Object.keys(derived)) if (!anchors[k]) anchors[k] = derived[k];
  return { ext, int: { group: interior, parts, materials: {} }, anchors };
}
