// The off-road death (type 'offRoad'): the bike or the taxi leaves the road edge, past the
// shoulder into the ditch. A short first-person crash (the jolt, the view tipping over, the
// crash through g.audio, black), then the wreck is staged where it came to rest and photographed
// from the roadside at night (camera flash, a rescue beacon) for the TV news. DeathState then
// shows ui.newsReport and ends the run: GAME OVER, back to the main menu (no loop).
//
//   crashReport { image (HTMLCanvasElement | null), kind ('bike'|'taxi'), news (NEWS_REPORTS entry) }
//   stageWreck(kind?) -> info   (also used when DeathState is entered without a live crash)
//   captureCrashShot(info) -> Promise<canvas>
//   clearCrashScene()           undo the wreck (bike/taxi upright, lights gone, player visible)
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { LAYOUT } from '../../world/layout.js';
import { clamp, easeInOut, smoothstep, makeRng } from '../../core/math.js';
import { paintedMaterial } from '../../render/index.js';
import { registerDefaultDeath } from './index.js';
import { NEWS_REPORTS } from '../data/worldtext.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0);

export const crashReport = { image: null, kind: 'bike', news: NEWS_REPORTS.bike };

const scene = { offs: [], lights: [], meshes: [] };
const play = (id, o = {}) => {
  try {
    return g.audio?.play?.(id, o);
  } catch (e) {
    return null;
  }
};
const ground = (x, z) => {
  const y = g.world?.getHeight?.(x, z);
  return Number.isFinite(y) ? y : 0;
};
function onFrames(fn, order = 39) {
  const off = g.engine.onUpdate(fn, order, { always: true });
  scene.offs.push(off);
  return off;
}
function frames(n) {
  return new Promise((res) => {
    let k = 0;
    const off = g.engine.onUpdate(() => {
      if (++k >= n) {
        off();
        res();
      }
    }, 99, { always: true });
  });
}

/** Where and how the vehicle left the road. */
function crashInfo(kind) {
  const veh = kind === 'taxi' ? g.taxi : g.bike;
  const road = g.world.road;
  const pos = veh.root.position.clone();
  const pr = road.project(pos, veh.physics?.roadRef?.id ?? null);
  const side = Math.sign(pr.lateral) || -1;
  const outward = pr.right.clone().multiplyScalar(side).setY(0).normalize();
  const fwd = (veh.forward ? veh.forward.clone() : new THREE.Vector3(0, 0, -1)).setY(0).normalize();
  const along = pr.tangent.clone().setY(0).normalize();
  if (along.dot(fwd) < 0) along.negate();
  return { kind, veh, pos, outward, fwd, along, speed: Math.abs(veh.speedKmh || 0) / 3.6, roadEdge: pr.width / 2 + LAYOUT.shoulder, pr: { id: pr.id, s: pr.s, lateral: pr.lateral } };
}

/** +1 when `dir` points to the vehicle's right. */
function rightSign(veh, dir) {
  const yaw = kind(veh) === 'taxi' ? taxiYaw() : veh.yaw;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return Math.sign(dir.x * rx + dir.z * rz) || 1;
}
const kind = (veh) => (veh === g.taxi ? 'taxi' : 'bike');
function taxiYaw() {
  g.taxi.root.getWorldQuaternion(_q);
  return _e.setFromQuaternion(_q, 'YXZ').y;
}

// ------------------------------------------------------------------------------ the crash
function startTumble(info) {
  const veh = info.veh;
  const rs = rightSign(veh, info.outward);
  const p0 = info.pos.clone();
  const v0 = Math.max(4, info.speed);
  const D = 1.5;
  let t = 0;
  if (info.kind === 'bike') {
    const yaw0 = veh.yaw;
    veh.setCrash({});
    onFrames((dt) => {
      if (!veh.crashed) return;
      t = Math.min(D, t + dt);
      const k = t / D;
      const travel = v0 * D * 0.5 * (1 - (1 - k) * (1 - k)); // decelerating slide
      _v.copy(p0).addScaledVector(info.fwd, travel * 0.75).addScaledVector(info.outward, travel * 0.35 + 0.9 * smoothstep(0, 1, k));
      _v.y = ground(_v.x, _v.z);
      veh.pos.copy(_v);
      veh.yaw = yaw0;
      // it goes over the edge: one tumble about its length, then on its side in the brush
      const roll = -rs * (Math.PI * 2 * easeInOut(clamp(k * 1.25)) + 1.42 * smoothstep(0.55, 1, k));
      veh.tumble.roll = roll;
      veh.tumble.pitch = -Math.sin(Math.PI * clamp(k * 1.6)) * 0.5;
      veh.tumble.yaw = rs * 0.75 * smoothstep(0, 1, k);
      veh.tumble.lift = Math.abs(Math.sin(Math.PI * clamp(k * 1.25))) * 0.55 * (1 - k) + 0.22 * smoothstep(0.6, 1, k);
    });
  } else {
    const t0 = g.taxi;
    t0.physicsSim.frozen = true;
    if (t0.state.engineOn) {
      t0.state.engineOn = false;
      t0.state.ignition = 'off';
      bus.emit('taxi:engine', { on: false });
    }
    const yaw0 = taxiYaw();
    onFrames((dt) => {
      t = Math.min(D, t + dt);
      const k = t / D;
      const travel = v0 * D * 0.5 * (1 - (1 - k) * (1 - k));
      _v.copy(p0).addScaledVector(info.fwd, travel * 0.7).addScaledVector(info.outward, travel * 0.3 + 1.3 * smoothstep(0, 1, k));
      _v.y = ground(_v.x, _v.z) + 0.88 * smoothstep(0.2, 0.8, k);
      t0.root.position.copy(_v);
      t0.root.rotation.set(0.18 * smoothstep(0, 0.6, k), yaw0 + rs * 0.45 * smoothstep(0, 1, k), -rs * 1.52 * easeInOut(clamp(k * 1.3)), 'YXZ');
      t0.root.updateMatrixWorld(true);
    }, 12);
  }
}

/** First person: the jolt, the world tipping over, the ground, black. */
async function crashCamera(info) {
  const cam = g.engine.camera;
  const p0 = cam.position.clone();
  const d0 = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const rs = rightSign(info.veh, info.outward);
  const pos = p0.clone();
  const look = p0.clone().add(d0);
  const shot = { position: () => pos, lookAt: () => look, fov: g.cameraRig.fovBase, roll: 0, cut: true, blend: 0.01 };
  g.cameraRig.cinematic(shot);
  g.cameraRig.shake(1);
  g.camfx?.flinch?.(1);
  const D = 1.0;
  let t = 0;
  const dir = new THREE.Vector3();
  await new Promise((res) => {
    const off = onFrames((dt) => {
      t += dt;
      const k = clamp(t / D);
      const e = 1 - (1 - k) * (1 - k);
      pos.copy(p0).addScaledVector(info.fwd, info.speed * 0.45 * e).addScaledVector(info.outward, 0.9 * e);
      pos.y -= 1.05 * smoothstep(0.1, 1, k);
      // the view pitches down at the ditch and swings out over the edge
      dir.copy(d0).lerp(info.outward, 0.55 * e).normalize();
      dir.y = THREE.MathUtils.lerp(d0.y, -0.95, smoothstep(0.05, 0.8, k));
      look.copy(pos).add(dir);
      shot.roll = rs * (1.25 * easeInOut(k) + Math.sin(t * 41) * 0.05 * (1 - k));
      if (t >= D) {
        off();
        res();
      }
    }, 45);
  });
}

function crashSounds(info) {
  const at = info.veh.root;
  const v = clamp(info.speed / 12, 0.5, 1);
  play('tyres_gravel', { object: at, volume: 0.9 * v });
  if (info.kind === 'bike') play('engine_rev', { object: at, volume: 0.5, rate: 1.3 });
  play('collision_thud', { object: at, volume: 1, delay: 0.12 });
  play('bush_scrape', { object: at, volume: 0.9, delay: 0.18 });
  play('branch_crack', { object: at, volume: 0.9, delay: 0.25, count: 3, interval: 0.16 });
  play('collision_thud', { object: at, volume: 0.8, rate: 0.8, delay: 0.55 });
  play('bone_crack', { volume: 0.55, delay: 0.62 });
  play('scare_hit', { volume: 0.35, delay: 0.62 });
  if (info.kind === 'taxi') play('scratch_glass', { object: at, volume: 0.7, delay: 0.4 });
}

registerDefaultDeath('offRoad', async (ctx) => {
  const k = ctx.opts?.vehicle || (g.player?.vehicle === g.taxi ? 'taxi' : g.player?.vehicle === g.bike ? 'bike' : null);
  crashReport.image = null;
  crashReport.kind = k || 'bike';
  crashReport.news = NEWS_REPORTS[crashReport.kind];
  if (!k) {
    // a test hook on foot: no crash to see, straight to the photograph
    await g.cine.fade(1, 0.3);
    crashReport.image = await captureCrashShot(stageWreck('bike'));
    return;
  }
  const info = crashInfo(k);
  info.veh.setControlsEnabled?.(false);
  crashSounds(info);
  startTumble(info);
  const fade = ctx.wait(0.3).then(() => g.cine.fade(1, 0.45));
  await crashCamera(info);
  await fade;
  g.audio?.bikeSound?.setOn?.(false);
  await ctx.wait(0.6);
  crashReport.image = await captureCrashShot(stageWreck(k, info));
});

// ------------------------------------------------------------------------------ the wreck photo
/** Put the wreck where it came to rest (or, without a crash, in the ditch of the spur road). */
export function stageWreck(k = 'bike', info = null) {
  for (const off of scene.offs.splice(0)) off();
  if (!info) {
    const road = g.world.road;
    const L = road.length('spur');
    const s = L * 0.6;
    const smp = road.sample('spur', s);
    const veh = k === 'taxi' ? g.taxi : g.bike;
    const pos = smp.pos.clone().addScaledVector(smp.right, -(smp.width ?? LAYOUT.roadWidth) / 2 - LAYOUT.shoulder - 0.6);
    pos.y = ground(pos.x, pos.z);
    const yaw = Math.atan2(-smp.tangent.x, -smp.tangent.z);
    if (k === 'bike') {
      g.player?.vehicle && g.player.exitVehicle();
      veh.setPose(pos, yaw);
    } else g.taxi.setPose(pos, yaw);
    info = { kind: k, veh, pos, outward: smp.right.clone().negate().setY(0).normalize(), fwd: smp.tangent.clone().setY(0).normalize(), along: smp.tangent.clone().setY(0).normalize(), speed: 10 };
  }
  const veh = info.veh;
  const rs = rightSign(veh, info.outward);
  const rest = info.pos.clone().addScaledVector(info.fwd, k === 'bike' ? 3.2 : 4.2).addScaledVector(info.outward, k === 'bike' ? 1.4 : 1.9);
  rest.y = ground(rest.x, rest.z);
  if (g.player?.root) g.player.root.visible = false;
  if (k === 'bike') {
    const yaw = Math.atan2(-info.fwd.x, -info.fwd.z);
    veh.setHeadlight(true);
    veh.state.engineOn = true;
    veh.setCrash({ roll: -rs * 1.42, pitch: 0.06, yaw: rs * 0.8, lift: 0.2 });
    veh.pos.copy(rest);
    veh.yaw = yaw;
    veh._apply();
    sandal(rest.clone().addScaledVector(info.outward, -1.3).addScaledVector(info.fwd, -1.6), info.fwd);
  } else {
    const t = g.taxi;
    t.physicsSim.frozen = true;
    t.state.headlights = 'low';
    const yaw = Math.atan2(-info.fwd.x, -info.fwd.z) + rs * 0.5;
    onFrames(() => {
      t.root.position.set(rest.x, rest.y + 0.88, rest.z);
      t.root.rotation.set(0.12, yaw, -rs * 1.5, 'YXZ');
      t.root.updateMatrixWorld(true);
    }, 12);
  }
  return { ...info, rest };
}

/** A lost rubber flip-flop on the shoulder (a traced sole, a swept thong strap). */
function sandal(at, fwd) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.125);
  sh.bezierCurveTo(0.045, -0.128, 0.05, -0.07, 0.042, -0.02);
  sh.bezierCurveTo(0.036, 0.03, 0.05, 0.08, 0.044, 0.11);
  sh.bezierCurveTo(0.036, 0.14, -0.03, 0.142, -0.042, 0.112);
  sh.bezierCurveTo(-0.05, 0.08, -0.032, 0.03, -0.036, -0.02);
  sh.bezierCurveTo(-0.042, -0.08, -0.04, -0.124, 0, -0.125);
  const sole = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 });
  sole.rotateX(-Math.PI / 2);
  const strap = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.04, 0.016, -0.005), new THREE.Vector3(-0.022, 0.034, 0.05), new THREE.Vector3(0, 0.03, 0.082), new THREE.Vector3(0.022, 0.034, 0.05), new THREE.Vector3(0.04, 0.016, -0.005)]), 24, 0.0045, 6, false);
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(sole, paintedMaterial({ color: 0x2b3a5a, roughness: 0.85, brush: 0.4, dirt: 0.6, name: 'flipflop' })));
  grp.add(new THREE.Mesh(strap, paintedMaterial({ color: 0x8a2a22, roughness: 0.7, brush: 0.3, name: 'flipflop_strap' })));
  grp.position.copy(at);
  grp.position.y = ground(at.x, at.z) + 0.004;
  grp.rotation.set(0, Math.atan2(fwd.x, fwd.z) + 2.2, 0.08);
  grp.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  g.engine.scene.add(grp);
  scene.meshes.push(grp);
}

/**
 * The news photograph: a third-person camera on the road edge looking down at the wreck,
 * the photographer's flash and an amber rescue beacon. Rendered under the black (a DOM curtain
 * hides the canvas), copied into a 2D canvas, then the screen goes black again.
 */
export async function captureCrashShot(info) {
  const rest = info.rest || info.pos;
  const toRoad = info.outward.clone().negate();
  const camPos = rest.clone().addScaledVector(toRoad, info.kind === 'taxi' ? 6.2 : 4.4).addScaledVector(info.along || info.fwd, -2.2);
  camPos.y = ground(camPos.x, camPos.z) + 1.7;
  const look = rest.clone().add(_v.set(0, info.kind === 'taxi' ? 0.6 : 0.3, 0));
  const p = g.postfx?.params;
  try {
    g.ui?.fade?.(true, 0.01);
    await frames(2);
    g.cameraRig.cinematic({ position: camPos, lookAt: look, fov: 48, roll: 0, cut: true, blend: 0.01 });
    g.cameraRig.trauma = 0;
    if (p) Object.assign(p, { fade: 0, horror: 0, blood: 0, distortion: 0, blur: 0, letterbox: 0 });
    g.postfx?.bloodSplash?.(0);
    const flash = camPos.clone().addScaledVector(UP, 0.25);
    const beacon = rest.clone().addScaledVector(toRoad, 3.2).addScaledVector(info.along || info.fwd, 4.5).addScaledVector(UP, 1.2);
    for (const spec of [
      { position: flash, color: 0xfff1de, intensity: 34, distance: 14, glow: false, priority: 50, name: 'newsFlash' },
      { position: beacon, color: 0xff9418, intensity: 8, distance: 11, glow: { size: 0.22, opacity: 0.95 }, priority: 49, name: 'rescueBeacon' },
    ]) {
      try {
        scene.lights.push(g.lightPool.add(spec));
      } catch (e) {
        /* light pool optional */
      }
    }
    await frames(8);
    g.engine.render(1 / 60);
    const src = g.engine.renderer.domElement;
    const w = Math.min(1280, src.width), h = Math.round((w * src.height) / Math.max(1, src.width));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d');
    cx.drawImage(src, 0, 0, w, h);
    // a cheap night photo: crushed blacks and a little grain
    const rng = makeRng(77);
    cx.globalAlpha = 0.06;
    for (let i = 0; i < 900; i++) {
      cx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
      cx.fillRect(rng() * w, rng() * h, 1, 1);
    }
    cx.globalAlpha = 1;
    return c;
  } catch (e) {
    console.warn('[death] crash photo failed', e);
    return null;
  } finally {
    if (p) p.fade = 1;
    for (const l of scene.lights.splice(0)) l?.remove?.();
  }
}

/** Undo the wreck: vehicles upright and free, the player visible, props gone. */
export function clearCrashScene() {
  for (const off of scene.offs.splice(0)) off();
  for (const l of scene.lights.splice(0)) l?.remove?.();
  for (const m of scene.meshes.splice(0)) {
    m.removeFromParent();
    m.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  const b = g.bike;
  if (b) {
    b.clearCrash();
    b.physics.frozen = false;
    b.setEngine(false);
    b.setHeadlight(false);
    b._apply();
  }
  if (g.taxi) g.taxi.physicsSim.frozen = false;
  if (g.player?.root) g.player.root.visible = true;
  crashReport.image = null;
}
