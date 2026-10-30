// Taxi geometry helpers for window scares: pane frames (centre / outward normal / up / right /
// size in world and body space), body-local conversions, a point on a pane from uv.
import * as THREE from 'three';

const _C = new THREE.Vector3(), _N = new THREE.Vector3(), _U = new THREE.Vector3(), _R = new THREE.Vector3();

/** Body group of the taxi (moves with the suspension). */
export function bodyOf(taxi) {
  return taxi?.bodyInner || taxi?.root || null;
}

/**
 * Pane frame in WORLD space: { center, normal (outward), up, right, w, h, id } or a fallback
 * built from the taxi anchors when the glass system is missing.
 */
export function paneFrame(taxi, id) {
  const p = taxi?.glass?.panes?.[id];
  const out = { id, center: new THREE.Vector3(), normal: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3(), w: 0.6, h: 0.4 };
  if (p?.rect) {
    const size = p.rect(_C, _N, _U, _R);
    out.center.copy(_C);
    out.normal.copy(_N).normalize();
    out.up.copy(_U).normalize();
    out.right.copy(_R).normalize();
    out.w = size?.[0] ?? 0.6;
    out.h = size?.[1] ?? 0.4;
  } else {
    const local = {
      windshield: [[0, 1.12, -0.72], [0, 0.45, -1]], rear: [[0, 1.1, 1.55], [0, 0.4, 1]],
      fl: [[-0.82, 1.1, -0.12], [-1, 0.1, 0]], fr: [[0.82, 1.1, -0.12], [1, 0.1, 0]],
      rl: [[-0.82, 1.1, 0.62], [-1, 0.1, 0]], rr: [[0.82, 1.1, 0.62], [1, 0.1, 0]],
    }[id] || [[0, 1.1, 0], [0, 0, -1]];
    const body = bodyOf(taxi);
    body.updateWorldMatrix(true, false);
    out.center.set(local[0][0], local[0][1], local[0][2]).applyMatrix4(body.matrixWorld);
    out.normal.set(...local[1]).normalize().transformDirection(body.matrixWorld);
    out.up.set(0, 1, 0).transformDirection(body.matrixWorld);
    out.right.crossVectors(out.up, out.normal).normalize();
  }
  // outward = away from the cabin centre
  const body = bodyOf(taxi);
  if (body) {
    body.updateWorldMatrix(true, false);
    const cabin = new THREE.Vector3(0, 0.95, 0.2).applyMatrix4(body.matrixWorld);
    if (out.normal.dot(_C.copy(out.center).sub(cabin)) < 0) out.normal.negate();
  }
  if (out.up.y < 0) out.up.negate();
  out.right.crossVectors(out.up, out.normal).normalize();
  return out;
}

/** World point on a pane at (u, v) in -0.5..0.5 of its size, pushed `off` metres along the outward normal. */
export function panePoint(frame, u, v, off = 0, out = new THREE.Vector3()) {
  return out.copy(frame.center).addScaledVector(frame.right, u * frame.w).addScaledVector(frame.up, v * frame.h).addScaledVector(frame.normal, off);
}

/** World -> taxi body local. */
export function toBody(taxi, world, out = new THREE.Vector3()) {
  const b = bodyOf(taxi);
  b.updateWorldMatrix(true, false);
  return b.worldToLocal(out.copy(world));
}
/** World direction -> taxi body local direction. */
export function dirToBody(taxi, dir, out = new THREE.Vector3()) {
  const b = bodyOf(taxi);
  b.updateWorldMatrix(true, false);
  const q = b.getWorldQuaternion(new THREE.Quaternion()).invert();
  return out.copy(dir).applyQuaternion(q);
}

/** Quaternion (parent space) from basis vectors X, Y, Z given in that space. */
export function quatFromBasis(x, y, z, out = new THREE.Quaternion()) {
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return out.setFromRotationMatrix(m);
}

/** Quaternion that makes a humanoid (up +Y, face -Z) face `faceDir` with its head toward `upDir` (parent space). */
export function humanoidFacing(faceDir, upDir, out = new THREE.Quaternion()) {
  const y = upDir.clone().normalize();
  const z = faceDir.clone().negate();
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return quatFromBasis(x, y, z, out);
}
