// itch.io banner: every ghost of the night shift doing a deadpan, perfectly synchronized dance in the
// fog on the forecourt of ศาลเจ้ามารวย, lit by a taxi's low beams. Somchai (dad) is a beat late.
// Renders a seamless loop: window.__itch.prepare() warms the springs / entrails up over whole loops
// (without rendering), frame(i) renders loop frame i in order. tools/itch/render.mjs drives it.
//   ?sandbox=itch-banner&fps=15&loop=2&warm=2&title=1&cam=x,y,z&look=x,y,z&fov=24&fog=0.12&hour=23.3
//   &gap=0.92 (row spacing) &lag=0.18 (Somchai's delay, s) &scatter=0.2 (beam in the fog) &trees=0
import * as THREE from 'three';
import { sky, postfx, lightPool, paintedMaterial, GLOBAL_UNIFORMS, LIGHT_ACCENTS } from '../render/index.js';
import { loadCharacterAssets, createHumanoid } from '../characters/index.js';
import { CHARACTERS } from '../game/data/characters.js';
import { createYaiSpeed, createKrasue } from '../creatures/index.js';
import * as P from '../props/index.js';
import { Forest } from '../world/Forest.js';
import { tex } from '../textures/index.js';
import { FONTS } from '../ui/fonts.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const vec = (s, d) => (s ? V(...s.split(',').map(Number)) : d);
const smooth = (u) => u * u * (3 - 2 * u);

/** Workaround (characters module, MakeHuman people): the teeth / tongue proxies are bound outside the
 *  head (a crown on the scalp with long spikes). Mouths stay closed here, so collapse them to a point. */
export function hideMouthParts(h) {
  const g = h?.body?.geometry;
  const ap = g?.attributes?.apart, pos = g?.attributes?.position;
  if (!ap || !pos || g.userData.itchMouthHidden) return 0;
  let n = 0, first = -1;
  for (let i = 0; i < pos.count; i++) {
    const p = ap.getX(i);
    if (p > 4.5 && p < 6.5) {
      if (first < 0) first = i;
      pos.setXYZ(i, pos.getX(first), pos.getY(first), pos.getZ(first));
      n++;
    }
  }
  pos.needsUpdate = true;
  g.userData.itchMouthHidden = true;
  return n;
}

// ---------------------------------------------------------------- choreography (4 beats = 2 s)
// Hand targets relative to the shoulder centre in units of arm length: [x right, y up, z forward].
const POSES = [
  // wave left: both hands overhead, leaning left
  { L: [-0.62, 0.86, 0.18], R: [0.08, 0.98, 0.18], hip: -1, roll: 1 },
  // wave right
  { L: [-0.08, 0.98, 0.18], R: [0.62, 0.86, 0.18], hip: 1, roll: -1 },
  // disco point: right arm up-right, left hand on the hip
  { L: [-0.5, -0.78, 0.08], R: [1.0, 0.72, 0.3], hip: 1, roll: -0.6, hipHand: 'L' },
  // and mirrored
  { L: [-1.0, 0.72, 0.3], R: [0.5, -0.78, 0.08], hip: -1, roll: 0.6, hipHand: 'R' },
];
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** pose at beat position b (0..4, wraps): snap into each new pose over the first 28% of the beat, then hold */
function poseAt(b) {
  const n = POSES.length;
  b = ((b % n) + n) % n;
  const i = Math.floor(b), f = b - i;
  const A = POSES[(i + n - 1) % n], B = POSES[i];
  const k = smooth(Math.min(1, f / 0.28));
  return { L: lerp3(A.L, B.L, k), R: lerp3(A.R, B.R, k), hip: A.hip + (B.hip - A.hip) * k, roll: A.roll + (B.roll - A.roll) * k, f };
}

export default async function ({ engine, cameraRig, params }) {
  const num = (k, d) => (params.get(k) != null ? Number(params.get(k)) : d);
  const scene = engine.scene;
  await loadCharacterAssets();

  // ---------------------------------------------------------------- sky, fog, look
  sky.setHour(num('hour', 23.3));
  sky.setWeather({ rain: 0, fog: num('fog', 0.12), wind: 0 }, 0);
  sky.setWetness?.(num('wet', 0.45));
  if (params.get('fogd') != null) sky.overrides.fogDensity = num('fogd', 0.03);
  if (params.get('mist') != null) sky.overrides.groundMist = num('mist', 0.2);
  postfx.params.grain = 0; // no per-frame noise in a GIF
  postfx.params.exposure = num('exp', 1);
  postfx.params.painterly = num('paint', 1);

  // ---------------------------------------------------------------- set: shrine forecourt + forest
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x2c2a20, map: tex('soil', { repeat: [60, 60] }), roughness: 0.92 }));
  ground.position.y = -0.035;
  ground.receiveShadow = true;
  scene.add(ground);
  // the fork signposts are pushed behind the camera so the forecourt reads clean
  const shrine = P.createShrineMaRuay({ noseZ: num('noseZ', 6) });
  scene.add(shrine.object);
  const handles = P.addPropLights(shrine, lightPool);
  for (const hd of handles) hd.setFlicker?.('none'); // steady lamps: the loop must be seamless

  const forest = new Forest({ road: null, drawDistance: 150, terrain: null, landmarks: {}, plan: { clearings: [] } }, {});
  forest._materials();
  const trees = [
    ['rainTree', 0, -12, -17, 0.9], ['dipterocarp', 1, 13, -18, 0.4], ['banyan', 0, -16, -27, 1.2], ['rainTree', 2, 16, -29, 2.1],
    ['dipterocarp', 0, -6, -31, 2.6], ['reachTree', 1, 7, -32, 0.2], ['banana', 0, -8.5, -15.5, 0.3], ['banana', 2, 9, -16, 2.2],
    ['understory', 1, -10.5, -12.5, 1.0], ['understory', 2, 11, -13, 2.8], ['bamboo', 0, -14, -10, 0.6], ['bamboo', 1, 14.5, -11, 1.7],
  ];
  if (params.get('trees') !== '0') {
    trees.forEach(([name, v, x, z, yaw], i) => {
      try {
        const g = forest.makeSingle(name, v, 4100 + i * 37);
        g.position.set(x, 0, z);
        g.rotation.y = yaw;
        scene.add(g);
      } catch (e) {
        console.warn('[itch-banner] tree', name, e.message);
      }
    });
  }

  // ---------------------------------------------------------------- the dancers
  const camPos = vec(params.get('cam'), V(0, 0.62, -2.0));
  const lookAt = vec(params.get('look'), V(0, 1.3, -8.6));
  const camTarget = new THREE.Object3D();
  camTarget.position.copy(camPos);
  scene.add(camTarget);

  const spec = (id, extra = {}) => {
    const a = CHARACTERS[id].appearance;
    return { ...a, ...extra, ghost: { ...(a.ghost || {}), ...(extra.ghost || {}) }, noBlink: true };
  };
  const ROW_Z = num('rowZ', -8.6);
  const GAP = num('gap', 0.92);
  const dancers = [];
  const deadpan = { still: 1, breathStop: 1, stare: 1, noBlink: 1, jitter: 0, snapTilts: 0, stutter: 0, blinkDesync: 0 };
  const addDancer = (h, slot, o = {}) => {
    const x = (slot - 3.5) * GAP + (o.dx || 0);
    const z = ROW_Z + (o.dz || 0);
    h.root.position.set(x, 0, z);
    h.root.rotation.y = Math.atan2(x - camPos.x, z - camPos.z) + (o.yaw || 0); // face the camera
    if (!h.root.parent) scene.add(h.root);
    h.setGhost({ ...deadpan, ...(o.ghost || {}) }, 100);
    h.setExpression?.({ smile: 0, sad: 0, fear: 0, anger: 0, surprise: 0, creepy: 0, ...(o.expr || {}) });
    h.lookAt(camTarget, { weight: o.look ?? 0.8, speed: 30 });
    if (h.look) h.look.tremor = 0;
    hideMouthParts(h);
    h._animRate = 1e-6; // the mixer clock is set directly every frame (seamless loop)
    h.anim.baseClip = () => 'Dance_Loop';
    h.time = 0;
    const tL = new THREE.Object3D(), tR = new THREE.Object3D();
    h.root.add(tL, tR);
    h.setHandTarget('L', tL, { weight: 1, blend: 0.05, orient: false, grip: 0 });
    h.setHandTarget('R', tR, { weight: 1, blend: 0.05, orient: false, grip: 0 });
    const d = { h, x, z, yaw0: h.root.rotation.y, lag: o.lag || 0, amp: o.amp ?? 1, name: o.name, tL, tR, meas: null };
    dancers.push(d);
    return d;
  };

  const ww = createHumanoid(spec('womanWhite'));
  const boy = createHumanoid(spec('boyM', { ghost: { bloodStains: 0.55 } }));
  boy.setGore?.({ amount: 0.35, bleedMouth: 0.25, speed: 100 });
  const nuan = createHumanoid(spec('nuan'));
  const dad = createHumanoid(spec('somchai'));
  const saman = createHumanoid(spec('saman'));
  const girl = createHumanoid(spec('extraChild'));
  const yai = createYaiSpeed({});
  scene.add(yai.root);
  const kr = createKrasue({ light: false });

  // left -> right (slot 4 is the krasue)
  addDancer(boy, 0, { name: 'boyM' });
  addDancer(yai.humanoid, 1, { name: 'yaiSpeed', expr: { creepy: 0.8, smile: 0.6 }, amp: 1.1 });
  addDancer(dad, 2, { name: 'somchai', lag: num('lag', 0.18), expr: { smile: 0.3 }, amp: 1.1 });
  addDancer(ww, 3, { name: 'womanWhite' });
  addDancer(saman, 5, { name: 'saman', expr: { smile: 0.25 } });
  addDancer(nuan, 6, { name: 'nuan', ghost: { levitate: num('lev', 0.22) } });
  addDancer(girl, 7, { name: 'extraChild' });

  // krasue: the floating head in slot 4 at head height, bobbing to the beat
  const krX = (4 - 3.5) * GAP, krZ = ROW_Z + 0.05, krY = num('krY', 1.36);
  const kh = kr.humanoid;
  hideMouthParts(kh);
  kh.setGhost({ ...deadpan, unlimited: 1 }, 100);
  kh.lookAt(camTarget, { weight: 1, speed: 30, unlimited: true });
  kr.noticeTarget = camTarget;
  kr._yaw = Math.atan2(krX - camPos.x, krZ - camPos.z);
  kh.time = 0;
  kh._animRate = 1e-6;
  scene.add(kr.root);
  kr.placeHead(V(krX, krY, krZ));
  try {
    kr.drips?.dispose?.();
  } catch (e) {
    /* optional */
  }
  kr.drips = null;
  kr.setGlow(num('krGlow', 1.6));
  // steady entrail light (the creature's own one flickers like a candle)
  lightPool.add({ object: kr.lightAnchor, color: 0xb8ff70, intensity: num('krLight', 3), distance: 5, decay: 1.8, flicker: 'none', glow: false, priority: 5 });

  // ---------------------------------------------------------------- light: the taxi's low beams + moon rim
  const hlI = num('hl', 420);
  const mkBeam = (x, tx, k) => {
    const s = new THREE.SpotLight(LIGHT_ACCENTS.headlight.color, hlI * k, 45, 0.6, 0.6, 2);
    s.position.set(x, 0.72, 2.6);
    s.target.position.set(tx, 1.0, ROW_Z);
    scene.add(s, s.target);
    return s;
  };
  const hl = mkBeam(-0.45, -0.6, 1);
  hl.castShadow = true;
  hl.shadow.mapSize.set(1024, 1024);
  hl.shadow.bias = -0.0004;
  hl.shadow.camera.near = 0.5;
  mkBeam(1.05, 0.8, 0.9);
  GLOBAL_UNIFORMS.uHeadlightPos.value.set(0.3, 0.72, 2.6);
  GLOBAL_UNIFORMS.uHeadlightDir.value.set(0.0, 0.02, -1).normalize();
  GLOBAL_UNIFORMS.uHeadlightOn.value = num('scatter', 0.2);
  const rim = new THREE.DirectionalLight(0x7f9cc8, num('moon', 0.4));
  rim.position.set(-6, 9, -20);
  scene.add(rim);

  // ---------------------------------------------------------------- camera
  const fov = num('fov', 24);
  cameraRig.cinematic({ position: camPos, lookAt, cut: true, fov });
  cameraRig.lookEnabled = false;
  engine.camera.fov = fov;
  engine.camera.updateProjectionMatrix();

  // ---------------------------------------------------------------- title (plain Srisakdi, bone white)
  if (params.get('title') !== '0') {
    const el = document.createElement('div');
    el.textContent = 'หลอนยันปลายทาง';
    el.style.cssText = `position:fixed;left:${num('tx', 16)}px;bottom:${num('ty', 10)}px;font:400 ${num('ts', 28)}px ${FONTS.title};color:#e8e0cc;z-index:20;pointer-events:none;white-space:nowrap`;
    document.body.appendChild(el);
  }

  // ---------------------------------------------------------------- the loop clock
  const FPS = num('fps', 15);
  const LOOP = num('loop', 2); // seconds: 4 beats at 120 bpm (Dance_Loop = 1 s = 2 beats)
  const FRAMES = Math.round(FPS * LOOP);
  const dt = LOOP / FRAMES;
  const BEAT = LOOP / 4;
  let clock = 0;
  const _w = new THREE.Vector3();
  const measure = (d) => {
    const h = d.h, b = h.bones;
    const loc = (n) => h.root.worldToLocal(b[n].getWorldPosition(new THREE.Vector3()));
    h.root.updateMatrixWorld(true);
    const sl = loc('upperarm_l'), sr = loc('upperarm_r'), el = loc('lowerarm_l'), hl2 = loc('hand_l');
    const arm = sl.distanceTo(el) + el.distanceTo(hl2);
    const sc = sl.clone().add(sr).multiplyScalar(0.5);
    return { sc, arm, half: Math.abs(sl.x - sr.x) / 2 };
  };
  // order 19: before the characters (20) and creatures (22)
  engine.onUpdate(() => {
    const t = clock;
    for (const d of dancers) {
      const h = d.h;
      if (!d.meas) d.meas = measure(d);
      const m = d.meas, A = m.arm;
      const tt = t - d.lag;
      const a = h.anim.action('Dance_Loop');
      if (a) a.time = ((((tt / LOOP) * 2) % 1) + 1) % 1 * a.getClip().duration;
      const p = poseAt(tt / BEAT);
      // hands: shoulder centre + pose (x right = +X, forward = -Z in the root frame)
      for (const [side, tgt] of [['L', d.tL], ['R', d.tR]]) {
        const q = p[side];
        const sx = side === 'L' ? -m.half : m.half;
        tgt.position.set(m.sc.x + sx * 0.6 + q[0] * A * d.amp, m.sc.y + q[1] * A * d.amp, m.sc.z - q[2] * A);
      }
      // bounce down on every beat, hips sway with the pose, the whole body turns a little
      const bounce = -(Math.sin(Math.PI * p.f) ** 2) * 0.045 * d.amp;
      const side = Math.cos(d.yaw0), fwd = Math.sin(d.yaw0);
      h.root.position.set(d.x + p.hip * 0.045 * side * d.amp, bounce, d.z - p.hip * 0.045 * fwd * d.amp);
      h.root.rotation.y = d.yaw0 - p.hip * 0.13 * d.amp;
      h.setGhost({ headRoll: p.roll * 0.17 * d.amp, headPitch: Math.sin(Math.PI * p.f) ** 2 * 0.06 }, 100);
      h.time = 0;
    }
    // krasue head: sways with the hips, bobs on the beat, tilts with the pose
    const p = poseAt(t / BEAT);
    const P0 = V(krX + p.hip * 0.13, krY - (Math.sin(Math.PI * p.f) ** 2) * 0.08, krZ);
    const pn = poseAt((t + dt) / BEAT);
    const P1 = V(krX + pn.hip * 0.13, krY - (Math.sin(Math.PI * pn.f) ** 2) * 0.08, krZ);
    const Vel = P1.sub(P0).multiplyScalar(1 / dt);
    const e = Math.exp(-2 * dt);
    kr.goal = null;
    kr.vel.copy(Vel).multiplyScalar(1 / e);
    kr.root.position.copy(P0).sub(kr.headOffset).addScaledVector(Vel, -dt);
    kr.time = 3;
    kh.setGhost({ headRoll: p.roll * 0.3 }, 100);
    kh.time = 0;
    void _w;
  }, 19);
  // freeze world time (fog drift, foliage wind, glows) so every loop is identical
  engine.onUpdate(() => {
    GLOBAL_UNIFORMS.uTime.value = 10;
  }, 81);

  let cur = 0;
  const realRender = engine.render.bind(engine);
  const step = (render) => {
    engine.render = render ? realRender : () => {};
    engine.step(dt);
    clock = (clock + dt) % LOOP;
    engine.render = realRender;
  };
  window.__itch = {
    frames: FRAMES,
    async prepare() {
      const warm = Math.round(num('warm', 2) * FRAMES);
      for (let i = 0; i < warm; i++) {
        step(false);
        if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
      }
      clock = 0;
      cur = 0;
      // one discarded render so first-frame-only work (shader compiles, shadow maps) is done
      for (let i = 0; i < num('preroll', 1); i++) realRender(dt);
    },
    /** Render loop frame i (frames must be requested in increasing order; skipped ones are stepped unrendered). */
    async frame(i) {
      while (cur < i) {
        step(false);
        cur++;
      }
      step(true);
      cur++;
    },
  };
  window.__banner = { dancers, kr, shrine, hl };
}
