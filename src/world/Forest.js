import * as THREE from 'three';
export class Forest {
  constructor(world, opts = {}) { this.world = world; this.group = new THREE.Group(); }
  async build() {}
  update() {}
  setDensity() {}
  stats() { return {}; }
}
