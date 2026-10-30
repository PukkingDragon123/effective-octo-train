// itch.io banner: every ghost of the night shift doing a deadpan synchronized dance in the fog on
// the forecourt of ศาลเจ้ามารวย, lit by a taxi's headlights. Somchai (dad) is a beat behind.
// Renders a seamless loop: window.__itch.prepare() warms the springs / entrails up over whole loops
// (without rendering), frame(i) renders loop frame i. tools/itch/render.mjs drives it.
//   ?sandbox=itch-banner&fps=15&loop=2&warm=3&title=1&cam=x,y,z&look=x,y,z&fov=26&fog=0.55&hour=23.3
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

export default async function ({ engine, cameraRig, params }) {
  const num = (k, d) => (params.get(k) != null ? Number(params.get(k)) : d);
  const scene = engine.scene;
  await loadCharacterAssets();

  // ---------------------------------------------------------------- sky, fog, look
  sky.setHour(num('hour', 23.3));
  sky.setWeather({ rain: 0, fog: num('fog', 0.55), wind: 0 }, 0);
  sky.setWetness?.(num('wet', 0.45));
  if (params.get('fogd') != null) sky.overrides.fogDensity = num('fogd', 0.03);
  postfx.params.grain = 0; // no per-frame noise in a GIF
  postfx.params.exposure = num('exp', 1);

  // ---------------------------------------------------------------- set: shrine forecourt + forest
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x2c2a20, map: tex('soil', { repeat: [60, 60] }), roughness: 0.92 }));
  ground.position.y = -0.035;
  ground.receiveShadow = true;
  scene.add(ground);
  // signposts of the fork pushed behind the camera so the forecourt reads clean
  const shrine = P.createShrineMaRuay({ noseZ: num('noseZ', 6) });
  scene.add(shrine.object);
  const handles = P.addPropLights(shrine, lightPool);
  for (const hd of handles) hd.setFlicker?.('none'); // steady lamps: the loop must be seamless

  const forest = new Forest({ road: null, drawDistance: 150, terrain: null, landmarks: {}, plan: { clearings: [] } }, {});
  forest._materials();
  const trees = [
    ['rainTree', 0, -11.5, -15, 0.9], ['dipterocarp', 1, 12.5, -17, 0.4], ['banyan', 0, -15, -26, 1.2], ['rainTree', 2, 15, -28, 2.1],
    ['dipterocarp', 0, -6, -30, 2.6], ['reachTree', 1, 6, -31, 0.2], ['banana', 0, -7.6, -12, 0.3], ['banana', 2, 8, -12.6, 2.2],
    ['understory', 1, -9.5, -9, 1.0], ['understory', 2, 10, -9.5, 2.8], ['bamboo', 0, -13, -7, 0.6], ['bamboo', 1, 13.5, -6.5, 1.7],
    ['shrub', 0, -8.2, -5.5, 0.4], ['shrub', 1, 8.5, -6, 1.3], ['fern', 0, -6.8, -7.5, 0.1], ['fern', 1, 7, -8, 0.9],
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
  const camPos = vec(params.get('cam'), V(0, 0.95, -0.6));
  const lookAt = vec(params.get('look'), V(0, 1.45, -9));
  const camTarget = new THREE.Object3D();
  camTarget.position.copy(camPos);
  scene.add(camTarget);

  const spec = (id, extra = {}) => {
    const a = CHARACTERS[id].appearance;
    return { ...a, ...extra, ghost: { ...(a.ghost || {}), ...(extra.ghost || {}) }, noBlink: true };
  };
  const ROW_Z = num('rowZ', -8.6);
  const GAP = num('gap', 1.04);
  const dancers = [];
  const deadpan = { still: 1, breathStop: 1, stare: 1, noBlink: 1, jitter: 0, snapTilts: 0, stutter: 0, blinkDesync: 0 };
  const addDancer = (h, slot, o = {}) => {
    const x = (slot - 3.5) * GAP + (o.dx || 0);
    const z = ROW_Z + (o.dz || 0);
    h.root.position.set(x, 0, z);
    h.root.rotation.y = Math.PI + Math.atan2(x - camPos.x, z - camPos.z) - Math.PI + (o.yaw || 0);
    if (!h.root.parent) scene.add(h.root);
    h.setGhost({ ...deadpan, ...(o.ghost || {}) }, 100);
    h.setExpression?.({ smile: 0, sad: 0, fear: 0, anger: 0, surprise: 0, creepy: 0, ...(o.expr || {}) });
    h.lookAt(camTarget, { weight: o.look ?? 0.75, speed: 30 });
    if (h.look) h.look.tremor = 0;
    h._animRate = 1e-6; // the mixer clock is set directly every frame (seamless loop)
    h.anim.baseClip = () => 'Dance_Loop';
    h.time = 0;
    const d = { h, x, z, yaw0: h.root.rotation.y, phase: o.phase || 0, rate: o.rate || 1, amp: o.amp ?? 1, lift: o.lift || 0, name: o.name };
    dancers.push(d);
    return d;
  };

  const ww = createHumanoid(spec('womanWhite'));
  const boy = createHumanoid(spec('boyM', { ghost: { bloodStains: 0.5 } }));
  boy.setGore?.({ amount: 0.35, bleedMouth: 0.25, speed: 100 });
  const nuan = createHumanoid(spec('nuan'));
  const dad = createHumanoid(spec('somchai'));
  const saman = createHumanoid(spec('saman'));
  const girl = createHumanoid(spec('extraChild'));
  const yai = createYaiSpeed({});
  scene.add(yai.root);
  const kr = createKrasue({ light: false });

  // left -> right
  addDancer(boy, 0, { name: 'boyM', expr: { sad: 0.2 } });
  addDancer(yai.humanoid, 1, { name: 'yaiSpeed', expr: { creepy: 0.8, smile: 0.6 }, amp: 1.15 });
  addDancer(dad, 2, { name: 'somchai', phase: -num('lag', 0.17), expr: { smile: 0.35 }, amp: 1.1 });
  addDancer(ww, 3, { name: 'womanWhite', dx: 0.0 });
  addDancer(saman, 5, { name: 'saman', expr: { smile: 0.25 } });
  addDancer(nuan, 6, { name: 'nuan', lift: num('lev', 0.24), ghost: { levitate: num('lev', 0.24) } });
  addDancer(girl, 7, { name: 'extraChild' });
  // krasue: the floating head in slot 4, at head height, bobbing to the beat
  const krX = (4 - 3.5) * GAP, krZ = ROW_Z + 0.05, krY = num('krY', 1.38);
  const kh = kr.humanoid;
  kh.setGhost({ ...deadpan, unlimited: 1 }, 100);
  kh.lookAt(camTarget, { weight: 1, speed: 30, unlimited: true });
  kr.noticeTarget = camTarget;
  kr._yaw = Math.atan2(krX - camPos.x, krZ - camPos.z) - Math.PI + Math.PI;
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
  // steady entrail glow (the creature's own light flickers like a candle)
  const krLight = lightPool.add({ object: kr.lightAnchor, color: 0xb8ff70, intensity: num('krLight', 3.2), distance: 6, decay: 1.8, flicker: 'none', glow: { size: 0.7, color: 0xc8ff80, opacity: 0.45 }, priority: 5 });

  // ---------------------------------------------------------------- light: the taxi's low beams + moon
  const hl = new THREE.SpotLight(LIGHT_ACCENTS.headlight.color, num('hl', 450), 45, 0.62, 0.55, 2);
  hl.position.set(-0.55, 0.75, 2.2);
  hl.target.position.set(0.2, 0.9, ROW_Z);
  hl.castShadow = true;
  hl.shadow.mapSize.set(1024, 1024);
  hl.shadow.bias = -0.0004;
  hl.shadow.camera.near = 0.5;
  const hl2 = new THREE.SpotLight(LIGHT_ACCENTS.headlight.color, num('hl', 450) * 0.85, 45, 0.62, 0.55, 2);
  hl2.position.set(0.95, 0.75, 2.2);
  hl2.target.position.set(0.6, 0.9, ROW_Z);
  scene.add(hl, hl.target, hl2, hl2.target);
  GLOBAL_UNIFORMS.uHeadlightPos.value.set(0.2, 0.75, 2.2);
  GLOBAL_UNIFORMS.uHeadlightDir.value.set(0.0, 0.03, -1).normalize();
  GLOBAL_UNIFORMS.uHeadlightOn.value = num('scatter', 1);
  const rim = new THREE.DirectionalLight(0x7f9cc8, num('moon', 0.35));
  rim.position.set(-6, 9, -20);
  scene.add(rim);

  // ---------------------------------------------------------------- camera
  cameraRig.cinematic({ position: camPos, lookAt, cut: true, fov: num('fov', 27) });
  cameraRig.lookEnabled = false;
  engine.camera.fov = num('fov', 27);
  engine.camera.updateProjectionMatrix();

  // ---------------------------------------------------------------- title
  if (params.get('title') !== '0') {
    const el = document.createElement('div');
    el.textContent = 'หลอนยันปลายทาง';
    el.style.cssText = `position:fixed;left:${num('tx', 18)}px;bottom:${num('ty', 12)}px;font:400 ${num('ts', 30)}px ${FONTS.title};color:#e9e2d0;opacity:0.92;z-index:20;pointer-events:none;letter-spacing:0.5px;white-space:nowrap`;
    document.body.appendChild(el);
  }

  // ---------------------------------------------------------------- the loop clock
  const FPS = num('fps', 15);
  const LOOP = num('loop', 2); // seconds (Dance_Loop = 1 s per cycle)
  const FRAMES = Math.round(FPS * LOOP);
  const dt = LOOP / FRAMES;
  let clock = 0;
  const ease = (u) => 0.5 - 0.5 * Math.cos(u * TAU);
  // order 19: before the characters (20) and creatures (22)
  engine.onUpdate(() => {
    const t = clock;
    for (const d of dancers) {
      const h = d.h;
      const a = h.anim.action('Dance_Loop');
      if (a) {
        const dur = a.getClip().duration;
        const u = (((t * d.rate) / 1 + d.phase) % 1 + 1) % 1;
        a.time = u * dur;
        // extra goofy bounce on top of the clip, on the beat (2 per cycle)
        const beat = ((t * d.rate + d.phase) * 2) % 1;
        const bounce = Math.pow(Math.sin(beat * Math.PI), 2) * 0.035 * d.amp;
        h.root.position.y = d.lift + bounce;
        // head tilt alternating per bar (deadpan, perfectly in sync)
        const bar = ((t * d.rate + d.phase) / LOOP) % 1;
        h.setGhost({ headRoll: Math.sin(bar * TAU) * 0.16 * d.amp, headPitch: -Math.sin(beat * TAU) * 0.04 }, 100);
        h.root.rotation.y = d.yaw0 + Math.sin(bar * TAU) * 0.12 * d.amp;
      }
      h.time = 0;
    }
    // krasue head: bob on the beat, sway side to side over the bar
    const beat = (t * 2) % 1;
    const bar = (t / LOOP) % 1;
    const P0 = V(krX + Math.sin(bar * TAU) * 0.12, krY + Math.pow(Math.sin(beat * Math.PI), 2) * 0.09 - 0.03, krZ);
    const Vel = V(Math.cos(bar * TAU) * TAU / LOOP * 0.12, Math.sin(beat * TAU) * Math.PI * 2 * 0.09, 0);
    const e = Math.exp(-2 * dt);
    kr.goal = null;
    kr.vel.copy(Vel).multiplyScalar(1 / e);
    kr.root.position.copy(P0).sub(kr.headOffset).addScaledVector(Vel, -dt);
    kr.time = 3;
    kh.setGhost({ headRoll: Math.sin(bar * TAU) * 0.22 }, 100);
    kh.time = 0;
    void ease;
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
      const warm = Math.round(num('warm', 3) * FRAMES);
      for (let i = 0; i < warm; i++) {
        step(false);
        if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
      }
      clock = 0;
      cur = 0;
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
