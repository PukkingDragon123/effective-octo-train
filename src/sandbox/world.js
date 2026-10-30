// World sandbox: builds the full world and frames a spot on the road network.
// Params: u (0..1 along spline), spline (main|ghost|human|spur), hour (21..30), cam (drive|side|aerial|walk),
//   headlights=1, look (deg, + = left), pitch (deg), fov, lat (camera lateral override), h (height override),
//   forest=0 / props=0 to skip, density, rain (0..1), fog, wet
import * as THREE from 'three';
import { World } from '../world/World.js';
import { sky, GLOBAL_UNIFORMS } from '../render/index.js';
import { LAYOUT } from '../world/layout.js';

export default async function (ctx) {
  const { engine, cameraRig, params, settings } = ctx;
  const num = (k, d) => (params.get(k) != null ? Number(params.get(k)) : d);
  const hour = num('hour', 22);
  const camMode = params.get('cam') || 'drive';
  const splineId = params.get('spline') || 'main';
  const u = num('u', 0.2);
  const lmKey = params.get('lm');
  if (params.get('density')) settings.set('foliageDensity', num('density', 1));

  const world = new World();
  const t0 = performance.now();
  await world.build({ forest: params.get('forest') !== '0', props: params.get('props') !== '0', onProgress: () => {} });
  console.log(`[world] build ${(performance.now() - t0).toFixed(0)} ms`);
  engine.scene.add(world.group);
  window.__world = world;

  if (params.get('fogd') != null) sky.overrides.fogDensity = num('fogd', 0.02);
  sky.setHour(hour);
  if (params.get('raw') === '1') engine.renderPipeline = null;
  const weather = {};
  if (params.get('rain') != null) weather.rain = num('rain', 0);
  if (params.get('fog') != null) weather.fog = num('fog', 0.5);
  if (Object.keys(weather).length) sky.setWeather(weather, 0);
  if (params.get('wet') != null) GLOBAL_UNIFORMS.uWetness.value = num('wet', 0.6);

  // ---- camera placement ---------------------------------------------------------------
  const sp = world.road.get(splineId);
  let s = u * sp.length;
  if (lmKey && world.landmarks[lmKey]) s = world.landmarks[lmKey].roadRef.s + num('ds', -25);
  const smp = sp.sample(s);
  const eye = new THREE.Object3D();
  engine.scene.add(eye);
  const look = new THREE.Vector3();
  const lane = LAYOUT.laneOffset + 0.36; // RHD driver sits right of the car centre
  if (camMode === 'drive' || camMode === 'walk') {
    const lat = num('lat', camMode === 'walk' ? -(LAYOUT.roadWidth / 2 + 0.8) : lane);
    sp.pointAt(s, lat, eye.position);
    eye.position.y = world.getHeight(eye.position.x, eye.position.z) + num('h', camMode === 'walk' ? 1.62 : 1.15);
    const ahead = sp.pointAt(Math.min(sp.length, s + num('ahead', 22)), lat);
    look.copy(ahead);
    look.y = world.getHeight(ahead.x, ahead.z) + num('h', 1.15) * 0.8;
  } else if (camMode === 'side') {
    sp.pointAt(s, num('lat', 9), eye.position);
    eye.position.y = world.getHeight(eye.position.x, eye.position.z) + num('h', 1.7);
    look.copy(sp.pointAt(s + 4, num('tlat', -4)));
    look.y += 1.5;
  } else {
    // aerial
    const back = sp.pointAt(Math.max(0, s - num('back', 45)), num('lat', 18));
    eye.position.copy(back);
    eye.position.y += num('h', 38);
    look.copy(sp.pointAt(s, 0));
  }
  const dir = look.clone().sub(eye.position);
  const yaw = Math.atan2(-dir.x, -dir.z) + THREE.MathUtils.degToRad(num('look', 0));
  const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + THREE.MathUtils.degToRad(num('pitch', 0));
  eye.rotation.set(0, 0, 0);
  cameraRig.attach(eye, null, { yaw, pitch });
  if (params.get('fov')) {
    engine.camera.fov = num('fov', 72);
    cameraRig.fovBase = engine.camera.fov;
  }

  // ---- headlights (a car's low beams just ahead of / below the driver's eye) ----------------
  if (params.get('headlights') !== '0' && (hour < 29.5 || params.get('headlights') === '1')) {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const base = eye.position.clone().addScaledVector(fwd, 2.1).addScaledVector(right, -0.36);
    base.y -= 0.55;
    const spot = new THREE.SpotLight(0xfff1d6, num('hl', 260), 85, 0.62, 0.55, 1.35);
    spot.position.copy(base);
    spot.target.position.copy(base).addScaledVector(fwd, 30);
    spot.target.position.y -= 1.6;
    spot.castShadow = !!settings.get('shadows');
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 70;
    spot.shadow.bias = -0.0004;
    engine.scene.add(spot, spot.target);
    GLOBAL_UNIFORMS.uHeadlightPos.value.copy(base);
    GLOBAL_UNIFORMS.uHeadlightDir.value.copy(spot.target.position).sub(base).normalize();
    GLOBAL_UNIFORMS.uHeadlightOn.value = 1;
  }

  engine.onUpdate((dt) => world.update(dt, engine.camera.position), 40);
  // warm-up so streaming/LOD reflect the camera position
  world.update(0.016, eye.position);
  window.__worldInfo = () => ({
    buildMs: Math.round(world.buildMs),
    mainLength: Math.round(world.road.length('main')),
    landmarks: Object.keys(world.landmarks).length,
    forest: world.forest?.stats?.(),
  });
}
