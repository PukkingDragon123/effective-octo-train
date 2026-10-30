// Planar mirrors with off-axis ("portal") virtual cameras. The virtual eye is the
// player's eye reflected through the mirror plane; the projection is fitted exactly to
// the mirror rectangle (generalised perspective projection), so the near plane IS the
// mirror plane (free oblique clipping) and every texel of the render target lands on the
// mirror. Convex side mirrors pull the virtual eye toward the glass (wider view).
// Rendered in engine.onPreRender, gaze-prioritised and round-robined.
import * as THREE from 'three';
import { LAYERS } from '../core/layers.js';
import { settings } from '../core/Settings.js';
import { mirrorDirtTex } from './VehicleTextures.js';
import { roundRectPlane } from './geom.js';

const _C = new THREE.Vector3(), _N = new THREE.Vector3(), _U = new THREE.Vector3(), _R = new THREE.Vector3();
const _E = new THREE.Vector3(), _pe = new THREE.Vector3(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3();
const _vr = new THREE.Vector3(), _vu = new THREE.Vector3(), _vn = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/**
 * Configure `cam` as the reflected portal camera for a rectangle (centre C, unit normal N
 * toward the viewer, unit up U, size w x h) seen from eye E. convex: 1 = flat, <1 = wider.
 * Writes the sampling matrix (world -> uv) into texMatrix. Returns false if the eye is behind.
 */
export function setupPortalCamera(cam, C, N, U, w, h, E, far, texMatrix, convex = 1) {
  const side = _tmp.subVectors(E, C).dot(N);
  if (side <= 0.001) return false;
  _pe.copy(E).addScaledVector(N, -2 * side); // reflected eye
  if (convex !== 1) _pe.sub(C).multiplyScalar(convex).add(C);
  _vn.copy(N).negate();
  _vu.copy(U).addScaledVector(N, -U.dot(N)).normalize();
  _vr.crossVectors(_vu, _vn).normalize();
  _pa.copy(C).addScaledVector(_vr, -w / 2).addScaledVector(_vu, -h / 2);
  _pb.copy(C).addScaledVector(_vr, w / 2).addScaledVector(_vu, -h / 2);
  _pc.copy(C).addScaledVector(_vr, -w / 2).addScaledVector(_vu, h / 2);
  const va = _pa.clone().sub(_pe), vb = _pb.clone().sub(_pe), vc = _pc.clone().sub(_pe);
  const d = -va.dot(_vn);
  if (d <= 1e-4) return false;
  const n = Math.max(0.005, d * 0.999);
  const l = (_vr.dot(va) * n) / d, r = (_vr.dot(vb) * n) / d, b = (_vu.dot(va) * n) / d, t = (_vu.dot(vc) * n) / d;
  cam.position.copy(_pe);
  _m.makeBasis(_vr, _vu, _vn);
  cam.quaternion.setFromRotationMatrix(_m);
  cam.updateMatrixWorld(true);
  cam.projectionMatrix.makePerspective(l, r, t, b, n, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.near = n;
  cam.far = far;
  if (texMatrix) texMatrix.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  return true;
}

const MIRROR_VERT = /* glsl */ `
varying vec3 vWP;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const MIRROR_FRAG = /* glsl */ `
uniform sampler2D tMirror;
uniform sampler2D tDirt;
uniform mat4 uMirrorMatrix;
uniform float uValid;
uniform float uDirtAmt;
uniform vec3 uTint;
varying vec3 vWP;
varying vec2 vUv;
void main() {
  vec4 p = uMirrorMatrix * vec4(vWP, 1.0);
  vec2 uv = p.xy / p.w;
  vec3 c = texture2D(tMirror, uv).rgb * uTint;
  c = mix(vec3(0.004), c, uValid);
  float d = texture2D(tDirt, vUv).r * uDirtAmt;
  c = c * (1.0 - d * 0.45) + vec3(0.012, 0.012, 0.011) * d;
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.86, 1.0, max(e.x, e.y));
  c *= 1.0 - edge * 0.55;
  gl_FragColor = vec4(c, 1.0);
}
`;

class Mirror {
  constructor(id, mount, opts) {
    this.id = id;
    this.mount = mount;
    const [w, h] = mount.userData.size || [0.2, 0.06];
    this.w = w;
    this.h = h;
    this.convex = opts.convex ?? 1;
    this.far = opts.far ?? 160;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = true;
    this.camera.layers.set(LAYERS.DEFAULT);
    this.camera.layers.enable(LAYERS.REFLECTION_ONLY);
    this.camera.layers.enable(LAYERS.PLAYER_HEAD);
    this.texMatrix = new THREE.Matrix4();
    this.rt = null;
    this.uniforms = {
      tMirror: { value: null },
      tDirt: { value: mirrorDirtTex() },
      uMirrorMatrix: { value: this.texMatrix },
      uValid: { value: 0 },
      uDirtAmt: { value: opts.dirt ?? 0.5 },
      uTint: { value: new THREE.Color(opts.tint ?? 0xd8dcd8) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: MIRROR_VERT, fragmentShader: MIRROR_FRAG, name: 'mirror_' + id });
    const geo = roundRectPlane(w, h, Math.min(w, h) * (opts.round ?? 0.3), 6);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'mirror_' + id;
    mount.add(this.mesh);
    this.lastRender = -1;
    this.resize();
  }
  resize() {
    const res = settings.get('mirrorResolution') || 256;
    const W = Math.max(32, Math.round(res));
    const H = Math.max(16, Math.round(res * (this.h / this.w)));
    if (this.rt && this.rt.width === W && this.rt.height === H) return;
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.uniforms.tMirror.value = this.rt.texture;
  }
  frame(eye) {
    this.mount.updateWorldMatrix(true, false);
    const e = this.mount.matrixWorld.elements;
    _C.set(e[12], e[13], e[14]);
    _R.set(e[0], e[1], e[2]).normalize();
    _U.set(e[4], e[5], e[6]).normalize();
    _N.set(e[8], e[9], e[10]).normalize();
    return setupPortalCamera(this.camera, _C, _N, _U, this.w * 0.98, this.h * 0.98, eye, this.far, this.texMatrix, this.convex);
  }
  render(renderer, scene, eye, hide) {
    if (!this.frame(eye)) {
      this.uniforms.uValid.value = 0;
      return false;
    }
    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this.mesh.visible = false;
    for (const o of hide) o.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, this.camera);
    for (const o of hide) o.visible = true;
    this.mesh.visible = true;
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevAuto;
    this.uniforms.uValid.value = 1;
    return true;
  }
  dispose() {
    this.rt?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.mesh.removeFromParent();
  }
}

/**
 * The taxi's three mirrors. mounts: { rear, left, right } Object3Ds with userData.size.
 * update(renderer, scene, camera, cameraRig, opts) is called from engine.onPreRender.
 */
export class MirrorSystem {
  constructor(mounts) {
    this.list = [];
    this.byId = {};
    const add = (id, mount, opts) => {
      if (!mount) return;
      const m = new Mirror(id, mount, opts);
      this.list.push(m);
      this.byId[id] = m;
    };
    add('mirror_rear', mounts.rear, { convex: 1, dirt: 0.35, round: 0.4 });
    add('mirror_left', mounts.left, { convex: 0.55, dirt: 0.75, round: 0.35 });
    add('mirror_right', mounts.right, { convex: 0.6, dirt: 0.7, round: 0.35 });
    this.rr = 0;
    this.enabled = true;
    this.hide = []; // objects hidden during mirror renders (e.g. glass in fallback mode)
  }
  /** Back-compat lookup by short id. */
  get rear() { return this.byId.mirror_rear; }
  get left() { return this.byId.mirror_left; }
  get right() { return this.byId.mirror_right; }
  setResolution() {
    for (const m of this.list) m.resize();
  }
  update(renderer, scene, camera, rig, frame) {
    if (!this.enabled) return;
    const eye = camera.position;
    // decide which mirrors are worth rendering
    const focus = [];
    const others = [];
    for (const m of this.list) {
      m.mount.getWorldPosition(_tmp);
      const dist = _tmp.distanceTo(eye);
      if (dist > 12) {
        m.uniforms.uValid.value = Math.min(m.uniforms.uValid.value, 1);
        continue;
      }
      const onScreen = rig ? rig.isOnScreen(_tmp, -0.25) : true;
      if (!onScreen) continue;
      const ang = rig ? rig.angleTo(_tmp) : 0;
      if (ang < 0.5 || dist < 1.2) focus.push(m);
      else others.push(m);
    }
    for (const m of focus) {
      m.render(renderer, scene, eye, this.hide);
      m.lastRender = frame;
    }
    if (others.length) {
      const m = others[this.rr++ % others.length];
      m.render(renderer, scene, eye, this.hide);
      m.lastRender = frame;
    }
  }
  dispose() {
    for (const m of this.list) m.dispose();
  }
}
