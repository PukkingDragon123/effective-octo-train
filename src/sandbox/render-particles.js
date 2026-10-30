// Particle gallery: every particle type side by side under two lamps + a headlight beam.
// params: hour (default 23), t (seconds to pre-roll), type=<only this type>
import * as THREE from 'three';
import { paintedMaterial, sky, lightPool, particles, GLOBAL_UNIFORMS, createVolumetricBeam } from '../render/index.js';

export default async function ({ engine, cameraRig, params }) {
  const P = (k, d) => (params.get(k) !== null ? params.get(k) : d);
  const hour = parseFloat(P('hour', 23));
  const scene = engine.scene;
  sky.setHour(hour);
  sky.setWeather({ rain: parseFloat(P('rain', 0.8)), fog: 0, wind: 0.4 }, 0);
  sky.setWetness(0.8);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x3a3c36, roughness: 0.9, wet: 1, brush: 0.8 }));
  scene.add(ground);
  const only = P('type', null);
  const types = [
    ['fireflies', { radius: 1.6, height: 1.5, count: 40 }],
    ['moths', { offsetY: 2.2, count: 12 }],
    ['mosquitoes', { offsetY: 1.2 }],
    ['dust', {}],
    ['leaves', { radius: 1.5, height: 3 }],
    ['incense', {}],
    ['smoke', {}],
    ['sparks', {}],
    ['embers', {}],
    ['ash', { radius: 1, height: 2.5 }],
    ['drips', { offsetY: 2.6, radius: 0.8 }],
    ['mist', {}],
  ];
  const cols = 4;
  types.forEach(([type, o], i) => {
    if (only && only !== type) return;
    const x = ((i % cols) - (cols - 1) / 2) * 3.2;
    const z = -6 - Math.floor(i / cols) * 3.6;
    const pos = new THREE.Vector3(x, (o.offsetY ?? 0.3), z);
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 8), paintedMaterial({ color: 0x8a7a60 }));
    marker.position.set(x, 0.15, z);
    scene.add(marker);
    const opts = { position: pos, ...o };
    if (type === 'dust' || type === 'mist') {
      opts.position = new THREE.Vector3(x, 0, z);
      opts.radius = type === 'mist' ? 3 : 1.6;
      opts.groundY = 0;
    }
    particles.emit(type, opts);
    if (type === 'moths') lightPool.add({ position: pos.clone().add(new THREE.Vector3(0, 0.3, 0)), color: 0xffb060, intensity: 60, distance: 8, glow: { size: 0.2 }, flicker: 'sodium' });
    if (type === 'sparks') lightPool.add({ position: pos.clone().add(new THREE.Vector3(0, 0.5, 0)), color: 0xd8f0ff, intensity: 20, distance: 6, glow: { size: 0.15 }, flicker: 'dying' });
  });
  // general rain + splashes + headlight bugs
  particles.emit('rain', {});
  particles.emit('splash', { groundY: 0.01 });
  const car = new THREE.Object3D();
  car.position.set(0, 0, 2);
  scene.add(car);
  particles.emit('headlightBugs', { object: car });
  lightPool.add({ position: new THREE.Vector3(-6, 5, -10), color: 0xffa04a, intensity: 300, distance: 20, glow: { size: 0.4 }, pool: true, groundY: 0, beam: true });
  lightPool.add({ position: new THREE.Vector3(6, 5, -14), color: 0xd8f0ff, intensity: 200, distance: 20, glow: { size: 0.4 }, pool: true, groundY: 0, beam: true, flicker: 'fluorescent' });
  // headlight
  const hl = new THREE.Vector3(0, 0.8, 1.5);
  const tgt = new THREE.Vector3(0, -0.5, -20);
  const spot = new THREE.SpotLight(0xfff0d8, 500, 50, 0.5, 0.7, 2);
  spot.position.copy(hl);
  spot.target.position.copy(tgt);
  scene.add(spot, spot.target);
  GLOBAL_UNIFORMS.uHeadlightPos.value.copy(hl);
  GLOBAL_UNIFORMS.uHeadlightDir.value.copy(tgt).sub(hl).normalize();
  GLOBAL_UNIFORMS.uHeadlightOn.value = 1;
  if (P('beam', '1') === '1') {
    const beam = createVolumetricBeam({ length: 14, angle: 0.4, intensity: 0.6, groundY: 0 });
    beam.position.set(4, 0.8, -2);
    beam.lookAt(new THREE.Vector3(-4, 0, -14));
    beam.rotateY(Math.PI);
    scene.add(beam);
  }

  const eye = new THREE.Object3D();
  eye.position.set(0, 2.6, 1.5);
  eye.lookAt(0, 0.6, -9);
  if (only) {
    const i = types.findIndex(([t]) => t === only);
    if (i >= 0) {
      const x = ((i % cols) - (cols - 1) / 2) * 3.2;
      const z = -6 - Math.floor(i / cols) * 3.6;
      const y = (types[i][1].offsetY ?? 0.3) + 0.6;
      eye.position.set(x + 0.6, y + 0.5, z + 3.2);
      eye.lookAt(x, y, z);
    }
  }
  eye.rotateY(Math.PI);
  scene.add(eye);
  cameraRig.attach(eye, eye, { yaw: 0, pitch: 0 });
  // pre-roll simulated time so bursts / lifetimes are mid-flight
  engine.time = parseFloat(P('t', 3.3));
}
