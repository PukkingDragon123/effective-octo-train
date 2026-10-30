// Game orchestrator (implemented in the gameplay phase). See docs/GAME_DESIGN.md.
import * as THREE from 'three';
import { World } from '../world/World.js';

export async function startGame(ctx) {
  const { engine, cameraRig } = ctx;
  const world = new World();
  await world.build();
  engine.scene.add(world.group);
  const eye = new THREE.Object3D();
  const lm = world.landmarks.garage;
  eye.position.copy(lm.pos).add(new THREE.Vector3(0, 1.7, 0));
  engine.scene.add(eye);
  cameraRig.attach(eye, null, { yaw: lm.yaw });
}
