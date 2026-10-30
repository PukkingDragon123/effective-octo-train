// World sandbox: builds the full world and frames a spot on the road network.
// Params: u (0..1 along spline), spline (main|ghost|human|spur), hour (21..30), cam (drive|side|aerial|walk),
//   headlights=1, look (deg, + = left), pitch (deg), fov, lat (camera lateral override), h (height override),
//   forest=0 / props=0 to skip, density, rain (0..1), fog, wet
import * as THREE from 'three';
import { World } from '../world/World.js';
import { sky, postfx, GLOBAL_UNIFORMS } from '../render/index.js';
import { LAYOUT } from '../world/layout.js';
import { preloadTextures } from '../textures/index.js';

export default async function (ctx) {
  const { engine, cameraRig, params, settings } = ctx;
  const num = (k, d) => (params.get(k) != null ? Number(params.get(k)) : d);
  const hour = num('hour', 22);
  const camMode = params.get('cam') || 'drive';
  const splineId = params.get('spline') || 'main';
  const u = num('u', 0.2);
  const lmKey = params.get('lm');
  if (params.get('density')) settings.set('foliageDensity', num('density', 1));

  const tp = performance.now();
  if (params.get('preload') !== '0') await preloadTextures();
  const preloadMs = performance.now() - tp;
  const world = new World();
  const t0 = performance.now();
  await world.build({ forest: params.get('forest') !== '0', props: params.get('props') !== '0', onProgress: () => {} });
  console.log(`[world] preload ${preloadMs.toFixed(0)} ms, build ${(performance.now() - t0).toFixed(0)} ms ${JSON.stringify(world.buildTimes)} props ${JSON.stringify(world.placement?.stats || {})}`);
  engine.scene.add(world.group);
  window.__world = world;

  if (params.get('fogd') != null) sky.overrides.fogDensity = num('fogd', 0.02);
  sky.setHour(hour < 12 ? hour + 24 : hour);
  if (params.get('paint') != null) postfx.params.painterly = num('paint', 1);
  const weather = {};
  if (params.get('rain') != null) weather.rain = num('rain', 0);
  if (params.get('fog') != null) weather.fog = num('fog', 0.5);
  if (Object.keys(weather).length) sky.setWeather(weather, 0);
  if (params.get('wet') != null) GLOBAL_UNIFORMS.uWetness.value = num('wet', 0.6);

  // ---- camera placement (re-callable: window.__worldCam({lm, ds, u, spline, cam, look, pitch, lat, h, hour, headlights})) ----
  const eye = new THREE.Object3D();
  engine.scene.add(eye);
  const spots = [];
  const place = (o) => {
    const get = (k, d) => (o[k] != null ? Number(o[k]) : d);
    const hr = ((h) => (h < 12 ? h + 24 : h))(get('hour', hour));
    if (o.hour != null) sky.setHour(hr);
    const mode = o.cam || 'drive';
    const sp = world.road.get(o.spline || 'main');
    let s = get('u', 0.2) * sp.length;
    if (o.lm && world.landmarks[o.lm]) s = world.landmarks[o.lm].roadRef.s + get('ds', -25);
    const look = new THREE.Vector3();
    const lane = LAYOUT.laneOffset + 0.36; // RHD driver sits right of the car centre
    if (mode === 'drive' || mode === 'walk') {
      const lat = get('lat', mode === 'walk' ? -(LAYOUT.roadWidth / 2 + 0.8) : lane);
      sp.pointAt(s, lat, eye.position);
      eye.position.y = world.getHeight(eye.position.x, eye.position.z) + get('h', mode === 'walk' ? 1.62 : 1.15);
      const ahead = sp.pointAt(Math.min(sp.length, s + get('ahead', 22)), lat);
      look.copy(ahead);
      look.y = world.getHeight(ahead.x, ahead.z) + get('h', 1.15) * 0.8;
    } else if (mode === 'side') {
      sp.pointAt(s, get('lat', 9), eye.position);
      eye.position.y = world.getHeight(eye.position.x, eye.position.z) + get('h', 1.7);
      look.copy(sp.pointAt(s + 4, get('tlat', -4)));
      look.y += 1.5;
    } else {
      const back = sp.pointAt(Math.max(0, s - get('back', 45)), get('lat', 18));
      eye.position.copy(back);
      eye.position.y += get('h', 38);
      look.copy(sp.pointAt(s, 0));
    }
    const dir = look.clone().sub(eye.position);
    const yaw = Math.atan2(-dir.x, -dir.z) + THREE.MathUtils.degToRad(get('look', 0));
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + THREE.MathUtils.degToRad(get('pitch', 0));
    eye.rotation.set(0, 0, 0);
    cameraRig.attach(eye, null, { yaw, pitch });
    for (const l of spots.splice(0)) engine.scene.remove(l, l.target);
    GLOBAL_UNIFORMS.uHeadlightOn.value = 0;
    // headlights (a car's low beams just ahead of / below the driver's eye)
    if (o.headlights !== '0' && o.headlights !== 0 && (hr < 29.5 || o.headlights === '1' || o.headlights === 1)) {
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const centre = eye.position.clone().addScaledVector(fwd, 2.1).addScaledVector(right, -0.36);
      centre.y -= 0.5;
      for (const sx of [-0.62, 0.62]) {
        const base = centre.clone().addScaledVector(right, sx);
        const spot = new THREE.SpotLight(0xfff0d2, get('hl', 160), 95, 0.72, 0.5, 1.25);
        spot.position.copy(base);
        spot.target.position.copy(base).addScaledVector(fwd, 30).addScaledVector(right, sx * 0.4);
        spot.target.position.y -= 1.9;
        spot.castShadow = sx > 0 && !!settings.get('shadows');
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.camera.near = 0.5;
        spot.shadow.camera.far = 70;
        spot.shadow.bias = -0.0004;
        engine.scene.add(spot, spot.target);
        spots.push(spot);
      }
      GLOBAL_UNIFORMS.uHeadlightPos.value.copy(centre);
      GLOBAL_UNIFORMS.uHeadlightDir.value.copy(fwd).multiplyScalar(30).add(new THREE.Vector3(0, -1.9, 0)).normalize();
      GLOBAL_UNIFORMS.uHeadlightOn.value = 1;
    }
    world.update(0.016, eye.position);
  };
  const initial = Object.fromEntries(params.entries());
  initial.hour = hour;
  void camMode;
  void splineId;
  void u;
  void lmKey;
  place(initial);
  if (params.get('fov')) {
    engine.camera.fov = num('fov', 72);
    cameraRig.fovBase = engine.camera.fov;
  }
  window.__worldCam = (o) => place({ hour, ...o });

  // stream around the eye (the rig moves the camera only at order 50, after the world update)
  engine.onUpdate((dt) => world.update(dt, eye.position), 40);
  window.__worldInfo = () => ({
    buildMs: Math.round(world.buildMs),
    preloadMs: Math.round(preloadMs),
    times: world.buildTimes,
    props: world.placement?.stats,
    mainLength: Math.round(world.road.length('main')),
    landmarks: Object.keys(world.landmarks).length,
    forest: world.forest?.stats?.(),
    probe: probe(),
  });
  function probe() {
    const cam = engine.camera;
    cam.updateMatrixWorld();
    const rc = new THREE.Raycaster();
    const out = { cam: cam.position.toArray().map((v) => +v.toFixed(2)), ground: +world.getHeight(cam.position.x, cam.position.z).toFixed(2), hits: [] };
    for (const [nx, ny] of [[0, 0], [0, -0.5], [-0.5, 0], [0.5, 0]]) {
      rc.setFromCamera(new THREE.Vector2(nx, ny), cam);
      const h = rc.intersectObject(engine.scene, true).find((i) => i.object.visible && !i.object.isSprite);
      out.hits.push(h ? `${h.object.name || h.object.type}@${h.distance.toFixed(1)}` : 'none');
    }
    out.fog = GLOBAL_UNIFORMS.uFogDensity?.value;
    return out;
  }
}
