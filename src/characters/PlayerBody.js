// (temporary; replaced by the full first-person body)
import * as THREE from 'three';
import { Humanoid } from './Humanoid.js';
export class PlayerBody {
  constructor(spec = {}) {
    this.humanoid = new Humanoid({ id: 'player', sex: 'm', age: 27, ...spec });
    this.root = this.humanoid.root;
    this.eye = new THREE.Object3D();
    this.root.add(this.eye);
    this.base = this.root;
    this.mode = 'foot';
    this.held = null;
  }
  enterVehicle() {}
  exitVehicle() {}
  reach() { return Promise.resolve(); }
  hold(item) { this.held = item; }
  wipe() {}
  setWalkEnabled() {}
  setPosition(pos, yaw = 0) { this.root.position.copy(pos); this.root.rotation.y = yaw; }
  update() {}
}
