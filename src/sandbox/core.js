// Smoke-test scene for the core engine + render stack.
import * as THREE from 'three';
import { paintedMaterial, sky } from '../render/index.js';

export default async function ({ engine, cameraRig }) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x2a3322 }));
  engine.scene.add(ground);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1 + i * 0.2, 1), paintedMaterial({ color: new THREE.Color().setHSL(i / 12, 0.4, 0.5) }));
    m.position.set(Math.cos(i) * 6, 0.5, Math.sin(i) * 6 - 4);
    engine.scene.add(m);
  }
  sky.setHour(22);
  const eye = new THREE.Object3D();
  eye.position.set(0, 1.6, 6);
  engine.scene.add(eye);
  cameraRig.attach(eye);
}
