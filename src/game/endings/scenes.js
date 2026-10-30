// Ending set pieces, one per ENDINGS[id].scenes[i].id (src/game/data/endings.js). Each is a
// short cinematic in the real world: staged actors, the taxi, the hour's light, fog, and the
// scene's own (already resolved) lines. Unknown ids fall back to a quiet establishing shot.
// A scene gets X = { stage, cam, S, say(lines), reveal(s), close(s), shot(fn, dur, opts) }.
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { clamp, easeInOut, smoothstep } from '../../core/math.js';
import { setLampOn } from '../../props/index.js';
import { paintedMaterial } from '../../render/index.js';
import { FONTS } from '../../ui/fonts.js';
import { roadPoint, roadYaw, roadLen, taxiPoint, localPoint, wpos, yawTo, ground, lm, holdSky, warmTaxi, parkTaxi, hidePlayer, showPlayerHead, sfx, speaker, chars, garageTaxiPose, resolve } from '../opening/common.js';
import { setupGarage, smokeRig } from '../opening/garageSet.js';
import { cigaretteMesh, teaMesh, LoopStaging } from '../systems/LoopStaging.js';
import { paperCanvas } from '../systems/PlayerActions.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DEG = 180 / Math.PI;

// ------------------------------------------------------------------------------- helpers
function aimSun(id, s, behind = false) {
  try {
    const t = g.world.road.sample(id, s).tangent;
    g.sky.sunAzimuth = Math.atan2(t.x, -t.z) * DEG + (behind ? 180 : 0);
  } catch (e) {
    /* ignore */
  }
}
/** Slowly let the sun rise during a scene. */
function sunriseDrift(X, from, to, secs) {
  let h = from;
  holdSky(h);
  X.stage.update((dt) => {
    h = Math.min(to, h + ((to - from) / secs) * dt);
    g.clock.hour = g.clock.target = h;
    g.sky.setHour(h);
  }, 79);
}
/** Ton (the player body) at the wheel of the taxi. */
function seatTon() {
  const p = g.player;
  if (p.vehicle !== g.taxi) {
    if (p.mode !== 'foot') p.exitVehicle();
    p.enterVehicle(g.taxi);
  }
  p.setWalkEnabled(false);
  hidePlayer(false);
}
/** Ton as a cutscene actor (the player body is hidden). */
function tonActor(X, extra = {}) {
  hidePlayer(true);
  const t = X.stage.actor('player', { id: 'endTon', ...extra });
  speaker('player', t, { voice: extra.voice || chars().player?.voice });
  return t;
}
function placeTaxi(id, s, lateral = -1.55, opts = {}) {
  const t = g.taxi;
  parkTaxi(roadPoint(id, s, lateral), roadYaw(id, s) + (opts.reverse ? Math.PI : 0), { headlights: opts.headlights || 'low' });
  if (opts.warm !== false) warmTaxi({ headlights: opts.headlights || 'low' });
  t.state.vacantLamp = opts.vacant ?? true;
  t.state.meterOn = false;
  t.setControlsEnabled(false);
  return t;
}
function drive(id, s, kmh, stopAt) {
  const t = g.taxi;
  t.state.handbrake = false;
  return t.autopilot({ splineId: id, s, speedKmh: kmh, ...(stopAt !== undefined ? { stopAt } : {}) });
}
function stand(h, pos, face) {
  const p = pos.clone();
  p.y = ground(p.x, p.z);
  h.root.position.copy(p);
  h.root.rotation.set(0, typeof face === 'number' ? face : yawTo(p, face), 0);
  h.setMode('stand');
}
/** A humanoid's head (live), or a guess above its feet before its first update. */
function head(h, out = new THREE.Vector3()) {
  if (h?.headPosition && h.headPosition.lengthSq() > 1e-6) return out.copy(h.headPosition);
  h?.root?.updateWorldMatrix?.(true, false);
  h?.root?.getWorldPosition?.(out);
  return out.add(new THREE.Vector3(0, 1.55, 0));
}
/** Static camera at pos looking at a (live) target. */
function fixed(X, pos, look, fov = 40, dur = 5, opts = {}) {
  return X.shot((t, k, dt, cam) => {
    cam.pos.copy(typeof pos === 'function' ? pos(t, k) : pos);
    const l = typeof look === 'function' ? look(t, k) : look;
    if (t < 0.02 || opts.snap) cam.look.copy(l);
    else cam.look.lerp(l, opts.ease ?? 0.08);
    cam.shot.fov = typeof fov === 'function' ? fov(t, k) : fov;
  }, dur, opts);
}
/** Play lines; onLine(line, i) may cut the camera. */
function talk(X, lines, onLine) {
  return X.say(lines, { onLine });
}
/** A small alms bowl (black lacquer with a lid) held in front of a monk with both hands. */
function almsBowl(X, monk) {
  const lac = paintedMaterial({ color: 0x14100e, roughness: 0.32, metalness: 0.1, brush: 0.3, wet: 0.2, puddles: 0 });
  lac.userData.ownedByStage = true;
  const bowl = new THREE.Group();
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.08, 0.005), new THREE.Vector2(0.135, 0.06), new THREE.Vector2(0.14, 0.13), new THREE.Vector2(0.12, 0.17), new THREE.Vector2(0, 0.18)];
  bowl.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), lac));
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 24, Math.PI), paintedMaterial({ color: 0x8a4a1e, roughness: 0.9 }));
  strap.material.userData.ownedByStage = true;
  strap.rotation.z = Math.PI;
  strap.position.y = 0.12;
  bowl.add(strap);
  const holder = new THREE.Object3D();
  holder.position.set(0, 0.98, -0.24);
  monk.root.add(holder);
  bowl.position.y = -0.06;
  holder.add(bowl);
  const L = new THREE.Object3D();
  L.position.set(-0.13, 0.02, 0);
  const R = new THREE.Object3D();
  R.position.set(0.13, 0.02, 0);
  holder.add(L, R);
  try {
    monk.setHandTarget('L', L, { grip: 0.6, blend: 0.4 });
    monk.setHandTarget('R', R, { grip: 0.6, blend: 0.4 });
  } catch (e) {
    /* IK optional */
  }
  X.stage.add(() => holder.removeFromParent());
  return holder;
}
/** A small brass water vessel (เต้าน้ำ) in Ton's hand, with a thin stream of water. */
function waterVessel(X, ton) {
  const brass = paintedMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8, brush: 0.4, wet: 0.3, puddles: 0 });
  brass.userData.ownedByStage = true;
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 0), new THREE.Vector2(0.045, 0.03), new THREE.Vector2(0.04, 0.07), new THREE.Vector2(0.018, 0.1), new THREE.Vector2(0.022, 0.13), new THREE.Vector2(0, 0.13)];
  const v = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), brass);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.09, 8), brass);
  spout.position.set(0.05, 0.06, 0);
  spout.rotation.z = -1.0;
  v.add(spout);
  const tip = new THREE.Object3D();
  tip.position.set(0.09, 0.085, 0);
  v.add(tip);
  try {
    const hand = ton.rig.bone('hand_r');
    hand.add(v);
    v.position.set(-0.08, -0.04, 0.02);
    v.rotation.set(0, 0, 0.5);
  } catch (e) {
    v.position.copy(ton.root.position).add(_a.set(0.3, 0.9, -0.3));
    g.engine.scene.add(v);
  }
  X.stage.add(() => v.removeFromParent());
  return { vessel: v, tip };
}
/** Gild a humanoid: a gold statue with his face. */
function gild(h) {
  for (const m of Object.values(h.materials || {})) {
    if (!m || !m.isMaterial) continue;
    m.color?.setHex?.(0xd8a446);
    if ('metalness' in m) m.metalness = 0.82;
    if ('roughness' in m) m.roughness = 0.34;
    m.emissive?.setHex?.(0x2a1804);
    m.needsUpdate = true;
  }
}

/** Ton rides the motorbike back down the spur toward the outside world (decreasing s). */
function rideSpur(X, s0, v = 10) {
  const bike = g.bike;
  let s = s0;
  X.stage.update((dt) => {
    s = Math.max(1, s - v * dt);
    bike.setPose(roadPoint('spur', s, 1.25), roadYaw('spur', s) + Math.PI);
    bike.wheelRot += (v / 0.285) * dt;
    bike.rpm = 2600;
  }, 9);
  const ride = { s: () => s, jump: (to) => (s = to) };
  X.shared.ride = ride;
  return ride;
}

// ------------------------------------------------------------------------------- scenes
export const SCENES = {
  // ---- dawn ------------------------------------------------------------------------------
  /** RIGHT at the last fork: golden rays through the trees, the radio plays "ทางกลับบ้าน". */
  async sunrise(sc, X) {
    const s0 = 4;
    aimSun('human', 60);
    sunriseDrift(X, 29.6, 29.82, 22);
    g.sky.setWeather({ rain: 0, fog: 0.75, wind: 0.15 }, 0);
    g.sky.setGroundMist?.(1.9, 0.1);
    g.sky.setFogBoost?.(1.25, 0.1);
    placeTaxi('human', s0, -1.55, { headlights: 'low' });
    seatTon();
    X.radioSong();
    X.stage.loop('birds_dawn', { volume: 0.9 });
    drive('human', s0, 24);
    X.stage.emit('mist', { intensity: 1.2 });
    X.stage.emit('pollen', { intensity: 1 });
    await X.reveal(2.4);
    const sm = new THREE.Vector3();
    let init = false;
    await X.shot((t, k, dt, cam) => {
      taxiPoint(-0.9, 2.3 + k * 0.4, 8.5 - k * 1.5, _a);
      if (!init) {
        sm.copy(_a);
        init = true;
      }
      cam.pos.copy(sm.lerp(_a, 0.1));
      taxiPoint(0.2, 1.0, -22, cam.look);
      cam.shot.fov = 46;
    }, 6.5, { shake: 0.002 });
    await X.shot((t, k, dt, cam) => {
      taxiPoint(-5.8, 1.35, 1.5 - k * 1.5, cam.pos);
      taxiPoint(0, 0.95, 0, cam.look);
      cam.shot.fov = 38;
    }, 5.5, { shake: 0.002 });
    // from the back seat, where nobody sits now
    await X.shot((t, k, dt, cam) => {
      taxiPoint(-0.32, 1.18, 1.08 - k * 0.1, cam.pos);
      taxiPoint(0.15, 1.05, -3.5, cam.look);
      cam.shot.fov = 52;
    }, 5.5, { shake: 0.0025 });
    await X.close(1.4);
  },

  /** Monks on their alms round at Huai Sai: rice offered, the water of merit poured. */
  async alms(sc, X) {
    const V = lm('humanVillageStop');
    const id = V?.roadRef?.id || 'human';
    const s = V?.roadRef?.s ?? 130;
    aimSun(id, s);
    sunriseDrift(X, 29.8, 29.95, 40);
    g.sky.setWeather({ rain: 0, fog: 0.6, wind: 0.1 }, 0);
    g.sky.setGroundMist?.(1.6, 0.1);
    X.stage.loop('birds_dawn', { volume: 0.8 });
    const t = placeTaxi(id, s - 1, -1.55, { headlights: 'off' });
    t.state.doors.fr = 1;
    const ton = tonActor(X);
    stand(ton, roadPoint(id, s + 2.5, -4.05), roadYaw(id, s));
    ton.holdItem?.('basket', 'R');
    // three monks, barefoot, single file along the shoulder toward him
    const M = chars().monk?.appearance || {};
    const monks = [];
    const specs = [
      { age: 46, face: { ...(M.face || {}), seed: 6606 } },
      { age: 29, face: { seed: 6611, smile: 0.2 } },
      { age: 63, face: { seed: 6617, wrinkles: 0.8 } },
    ];
    for (const [i, sp] of specs.entries()) {
      const m = X.stage.actor('monk', { id: 'almsMonk' + i, accessories: ['shoulder-bag'], ...sp });
      stand(m, roadPoint(id, s + 15 + i * 1.6, -4.0), roadYaw(id, s) + Math.PI);
      almsBowl(X, m);
      monks.push(m);
    }
    speaker('monk', monks[0]);
    const stops = monks.map((m, i) => roadPoint(id, s + 4.2 + i * 1.25, -4.05));
    const walking = Promise.all(monks.map((m, i) => wait(i * 0.7).then(() => m.walkTo(stops[i]))));
    sfx('bell_temple', { position: roadPoint(id, s + 120, -30).setY(20), volume: 0.6 });
    await X.reveal(2.2);
    // wide, across the road: saffron in the low gold mist
    const wide = roadPoint(id, s + 5, 5.6);
    wide.y += 1.15;
    await Promise.race([fixed(X, wide, () => head(monks[1], _a).setY(ground(_a.x, _a.z) + 1.1), 40, 8.5, { ease: 0.04 }), walking.then(() => wait(1.5))]);
    for (const m of monks) m.root.rotation.y = yawTo(m.root.position, ton.root.position);
    ton.root.rotation.y = yawTo(ton.root.position, monks[0].root.position);
    // he offers rice into the first bowl
    ton.play?.('giveItem');
    wait(1.2).then(() => sfx('alms_bowl', { object: monks[0].root, volume: 0.7 }));
    const over = monks[0].root.position.clone().add(_a.set(0, 0, 0)).add(new THREE.Vector3().subVectors(monks[0].root.position, ton.root.position).setY(0).normalize().multiplyScalar(1.3));
    over.y += 1.62;
    over.add(new THREE.Vector3(0, 0, 0).crossVectors(UP, new THREE.Vector3().subVectors(ton.root.position, monks[0].root.position).normalize()).multiplyScalar(0.45));
    await fixed(X, over, () => head(ton, _a).add(_b.set(0, -0.25, 0)), 34, 4.5, { ease: 0.06 });
    // the blessing: he kneels... they chant
    ton.play?.('wai');
    const chant = X.stage.loop('monk_chant', { object: monks[1].root, volume: 0.75 });
    const low = ton.root.position.clone().addScaledVector(new THREE.Vector3().subVectors(ton.root.position, monks[1].root.position).setY(0).normalize(), 1.4);
    low.y += 0.65;
    const blessing = talk(X, sc.lines.filter((l) => l.who !== 'player'));
    await Promise.all([fixed(X, low, () => head(monks[1], _a), 36, 6, { ease: 0.05 }), blessing]);
    chant?.stop?.(2);
    // the water of merit, poured at the foot of a tree
    const tree = roadPoint(id, s + 1.2, -6.4);
    await Promise.race([ton.walkTo(tree.clone().add(_a.set(0.1, 0, 0.6))), wait(5)]);
    ton.root.rotation.y = yawTo(ton.root.position, tree);
    ton.dropItem?.('basket');
    const wv = waterVessel(X, ton);
    ton.play?.('giveItem', { duration: 6 });
    const stream = X.stage.emit('drips', { object: wv.tip, intensity: 1.4 });
    void stream;
    sfx('splash', { position: tree, volume: 0.25 });
    const side = tree.clone().add(new THREE.Vector3().crossVectors(UP, new THREE.Vector3().subVectors(ton.root.position, tree).normalize()).multiplyScalar(1.6));
    side.y += 0.8;
    const words = talk(X, sc.lines.filter((l) => l.who === 'player'));
    await Promise.all([fixed(X, side, () => _a.copy(ton.root.position).lerp(tree, 0.5).add(_b.set(0, 0.6, 0)), 38, 7, { ease: 0.05 }), words]);
    await X.close(1.6);
  },

  /** KM 11 bus stop: Boy M's mother, a covered dish, "it doesn't hurt any more". */
  async busStop(sc, X) {
    const B = lm('busStop');
    const s = B?.roadRef?.s ?? 1600;
    aimSun('main', s);
    sunriseDrift(X, 29.9, 29.98, 30);
    g.sky.setWeather({ rain: 0, fog: 0.5, wind: 0.1 }, 0);
    X.stage.loop('birds_dawn', { volume: 0.7 });
    placeTaxi('main', s + 1.5, -1.55, { headlights: 'off' });
    const wait0 = B?.anchors?.waitSpot ? wpos(B.anchors.waitSpot, new THREE.Vector3()) : (B?.waitPos?.clone() || roadPoint('main', s, -4.2));
    const mom = X.stage.actor('mMother');
    stand(mom, wait0, roadPoint('main', s, 0));
    mom.holdItem?.('lunchbox', 'R');
    mom.setExpression?.({ sad: 0.5 });
    speaker('mMother', mom);
    const ton = tonActor(X);
    const tp = wait0.clone().add(new THREE.Vector3().subVectors(roadPoint('main', s + 1, 0), wait0).setY(0).normalize().multiplyScalar(1.5));
    stand(ton, tp, wait0);
    mom.lookAt(ton.headPosition || ton.root, { weight: 0.8 });
    await X.reveal(1.8);
    const wide = roadPoint('main', s - 6, 4.5);
    wide.y += 1.3;
    await fixed(X, wide, () => _a.copy(mom.root.position).lerp(ton.root.position, 0.5).add(_b.set(0, 1.2, 0)), 38, 5);
    const onHer = () => head(mom, _a).addScaledVector(new THREE.Vector3().subVectors(ton.root.position, mom.root.position).setY(0).normalize(), 1.5).add(_b.set(0.25, 0.02, 0));
    const onHim = () => head(ton, _a).addScaledVector(new THREE.Vector3().subVectors(mom.root.position, ton.root.position).setY(0).normalize(), 1.5).add(_b.set(-0.25, 0.02, 0));
    const camHer = onHer().clone();
    const camHim = onHim().clone();
    await talk(X, sc.lines, (l) => {
      const her = l.who === 'mMother';
      X.cam.play((t, k, dt, cam) => {
        cam.pos.copy(her ? camHim : camHer);
        head(her ? mom : ton, cam.look);
        cam.shot.fov = 30;
      }, 30, { shake: 0.0015 });
      if (her) mom.setExpression?.({ sad: 1 });
    });
    await X.S.wait(1.2);
    await X.close(1.5);
  },

  /** Ma Ruay Shrine: the deity statue has Ah Kong's face, the incense curls like his cigarette. */
  async statue(sc, X) {
    const SM = lm('shrineMaRuay');
    const P = SM?.prop || {};
    holdSky(29.98, { rain: 0, fog: 0.55, wind: 0.05 }, 0);
    g.sky.setGroundMist?.(1.4, 0.1);
    const face = P.statueFaceAnchor ? wpos(P.statueFaceAnchor, new THREE.Vector3()) : wpos(SM?.anchors?.statueFaceAnchor || g.world.fork.pos, new THREE.Vector3());
    const yaw = SM?.yaw ?? 0;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // the statue looks out along local +Z
    for (const a of (P.incenseAnchors || []).slice(0, 3)) X.stage.emit('incense', { object: a, count: 50, intensity: 1 });
    X.stage.light({ kind: 'candle', position: face.clone().addScaledVector(fwd, 0.9).add(_a.set(0, -0.4, 0)), intensity: 6, distance: 4, glow: false });
    // the gilt figure, hidden until the light flares
    let gilt = null;
    const swap = async () => {
      try {
        const anchor = P.statueAnchor;
        if (!anchor) return;
        const pivot = new THREE.Object3D();
        anchor.add(pivot);
        X.stage.add(() => pivot.removeFromParent());
        gilt = X.stage.actor('ahKong', { id: 'shrineStatue', accessories: [] });
        gilt.sitAt(pivot, { pose: 'sit', blend: 0.01 });
        gild(gilt);
        gilt.setExpression?.({ smile: 0.15 });
        await wait(0.12);
        // size and seat him so his face sits where the deity's was
        const aW = wpos(anchor, new THREE.Vector3());
        const h0 = head(gilt, new THREE.Vector3());
        const sc2 = clamp((face.y - aW.y) / Math.max(0.2, h0.y - aW.y), 0.4, 3);
        pivot.scale.setScalar(sc2);
        await wait(0.1);
        const h1 = head(gilt, new THREE.Vector3());
        const delta = face.clone().sub(h1).addScaledVector(fwd, -0.04);
        anchor.updateWorldMatrix(true, false);
        const inv = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
        const lp = pivot.position.clone().applyMatrix4(anchor.matrixWorld).add(delta).applyMatrix4(inv);
        pivot.position.copy(lp);
        gilt.root.visible = false;
      } catch (e) {
        console.warn('[ending] statue', e);
        if (gilt) gilt.root.visible = false;
        gilt = null;
      }
    };
    await swap();
    await X.reveal(2.4);
    const far = face.clone().addScaledVector(fwd, 4.2).add(_a.set(0, -0.35, 0));
    const near = face.clone().addScaledVector(fwd, 1.15).add(_a.set(0, -0.05, 0));
    const push = X.shot((t, k, dt, cam) => {
      cam.pos.lerpVectors(far, near, easeInOut(k));
      cam.look.copy(face);
      cam.shot.fov = 34 - k * 6;
    }, 16, { shake: 0.0015 });
    await X.S.wait(5.5);
    // the light flares gold: the face is his
    g.postfx.flash?.(0xffd9a0, 1.2);
    sfx('wind_chime', { position: face, volume: 0.6 });
    await X.S.wait(0.25);
    if (gilt && P.statueHead) {
      P.statueHead.visible = false;
      gilt.root.visible = true;
      X.stage.add(() => (P.statueHead.visible = true));
    }
    speaker('ahKong', null, { object: P.statueFaceAnchor || null });
    await talk(X, resolve(g.data?.ahkong?.SHRINE_REVEAL || []));
    gilt?.setExpression?.({ smile: 1 });
    await talk(X, sc.lines);
    await push;
    await X.S.wait(1.5);
    await X.close(2.2, 0xfff0d0);
  },

  /** Coda (forgive + takeOver): the next evening Ton switches on the red ว่าง lamp himself. */
  async nextShift(sc, X) {
    await SCENES.garage({ ...sc, lines: [] }, X, { short: true });
    await SCENES.vacant({ ...sc }, X, { short: true });
  },

  // ---- successor ------------------------------------------------------------------------------
  /** Evening at the garage: the empty stool, a cigarette still smoking, the paper on the seat. */
  async garage(sc, X, opts = {}) {
    holdSky(21.0, { rain: 0, fog: 0.6, wind: 0.2 }, 0);
    LoopStaging.clearGarage();
    const set = setupGarage(X.stage, { ahKong: 'none' });
    g.ahKong.root.visible = false;
    hidePlayer(true);
    const A = set.anchors;
    if (A.ashtrayAnchor) {
      const cig = cigaretteMesh('half');
      cig.position.set(0, 0.018, 0);
      A.ashtrayAnchor.add(cig);
      X.stage.add(() => cig.removeFromParent());
      X.stage.emit('incense', { object: cig.userData.tip, count: 40, intensity: 0.9 });
    }
    if (A.tableAnchor) {
      const t1 = teaMesh(true);
      const t2 = teaMesh(false);
      t1.position.set(0.2, 0, 0.1);
      t2.position.set(-0.12, 0, 0.16);
      A.tableAnchor.add(t1, t2);
      X.stage.add(() => {
        t1.removeFromParent();
        t2.removeFromParent();
      });
    }
    // the rules paper on the driver's seat; under Somchai's red ink, a new line in Ah Kong's hand
    let paper = null;
    try {
      const R = g.data?.rules || {};
      const c = paperCanvas('back', R.PAPER?.successorNote ? { 'p:kong': R.PAPER.successorNote } : null);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = paintedMaterial({ map: tex, alphaTest: 0.45, roughness: 0.95, brush: 0.15, wet: 0, puddles: 0, emissive: 0xfff0d8, emissiveMap: tex, emissiveIntensity: 0.08 });
      m.userData.ownedByStage = true;
      paper = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.282), m);
      paper.rotation.set(-Math.PI / 2 + 0.12, 0, 0.35);
      paper.position.copy(g.taxi.anchors.driverSeat.position).add(_a.set(0, 0.075, 0.02));
      (g.taxi.bodyInner || g.taxi.root).add(paper);
      X.stage.add(() => {
        paper.removeFromParent();
        tex.dispose();
      });
    } catch (e) {
      console.warn('[ending] paper', e);
    }
    await X.reveal(2);
    const G = lm('garage');
    const front = roadPoint('main', (G?.roadRef?.s ?? 270) - 7, 2.2);
    front.y += 1.5;
    const stool = A.oldManSeat ? wpos(A.oldManSeat, new THREE.Vector3()) : set.ahSpot;
    await fixed(X, front, stool.clone().add(_a.set(0, 0.4, 0)), 40, opts.short ? 4.5 : 6, { ease: 0.04 });
    if (!opts.short && A.tableAnchor) {
      const tb = wpos(A.tableAnchor, new THREE.Vector3());
      const cl = tb.clone().add(_a.set(0.9, 0.45, 0.9));
      await fixed(X, cl, tb.clone().add(_b.set(0, 0.06, 0)), 30, 4.5);
    }
    if (paper) {
      g.taxi.state.doors.fr = 1;
      const over = taxiPoint(0.95, 1.45, 0.25, new THREE.Vector3());
      const pp = paper.getWorldPosition(new THREE.Vector3());
      const words = talk(X, sc.lines);
      await Promise.all([fixed(X, (t, k) => _a.lerpVectors(over, pp.clone().add(_b.set(0.15, 0.55, 0.05)), k * 0.5), pp, 40, opts.short ? 4 : 6.5, { ease: 0.1 }), words]);
    } else await talk(X, sc.lines);
    if (!opts.short) await X.close(1.2);
  },

  /** 21:00: the red ว่าง lamp on, two honks at the spirit house, out onto the road; someone hails. */
  async vacant(sc, X, opts = {}) {
    holdSky(21.02, { rain: 0, fog: 0.7, wind: 0.25 }, 0);
    const tp = garageTaxiPose();
    placeTaxi('main', tp.s, -1.75, { headlights: 'low', vacant: false });
    g.taxi.state.doors.fr = 0;
    seatTon();
    const G = lm('garage');
    if (G && !opts.short) setupGarage(X.stage, { ahKong: 'none', parkTaxi: false });
    g.ahKong.root.visible = false;
    await X.reveal(1.2);
    // the lamp, from outside the windscreen
    const lampObj = g.taxi.parts?.vacantGroup;
    const lampP = lampObj ? wpos(lampObj, new THREE.Vector3()) : taxiPoint(0, 1.28, -0.7, new THREE.Vector3());
    const camL = taxiPoint(0.45, 1.35, -3.2, new THREE.Vector3());
    const lampShot = fixed(X, camL, lampP, 26, 4.5, { snap: true });
    await X.S.wait(1.4);
    g.taxi.setControl('vacantLamp', true);
    sfx('switch_click', { position: lampP, volume: 0.6 });
    await lampShot;
    if (!sc.lines?.length || opts.short) {
      await talk(X, sc.lines || []);
      await X.close(1.4);
      return;
    }
    // two honks for the spirits, and out
    for (let i = 0; i < 2; i++) {
      g.taxi.setControl('horn', true, { reach: false });
      await X.S.wait(0.22);
      g.taxi.setControl('horn', false, { reach: false });
      await X.S.wait(0.28);
    }
    const s0 = tp.s;
    drive('main', s0, 26);
    // someone waits far ahead in the headlights
    const sri = X.stage.actor('sri');
    const sp = roadPoint('main', s0 + 70, -4.1);
    stand(sri, sp, roadPoint('main', s0 + 60, -1));
    speaker('sri', sri);
    sri.play?.('hail', { loop: true });
    const wide = roadPoint('main', s0 + 14, 3.6);
    wide.y += 1.4;
    await fixed(X, wide, () => taxiPoint(0, 0.8, 0, _a), 42, 4.5, { ease: 0.07 });
    const sm = new THREE.Vector3();
    let init = false;
    const chase = X.shot((t, k, dt, cam) => {
      taxiPoint(0.6, 1.75, 6.5, _a);
      if (!init) {
        sm.copy(_a);
        init = true;
      }
      cam.pos.copy(sm.lerp(_a, 0.12));
      cam.look.lerp(sp.clone().add(_b.set(0, 1.2, 0)), t < 0.05 ? 1 : 0.05);
      cam.shot.fov = 34;
    }, 7, { shake: 0.003 });
    await X.S.wait(3.2);
    await talk(X, sc.lines);
    await chase;
    await X.close(1.6);
  },

  // ---- endless -----------------------------------------------------------------------------
  /** He turned. Somchai smiles sadly in the mist and fades like breath on glass. */
  async fade(sc, X) {
    const GG = lm('ghostGate');
    const gs = GG?.roadRef?.s ?? 120;
    holdSky(29.45, { rain: 0, fog: 0.9, wind: 0.05 }, 0);
    g.sky.setGroundMist?.(2.2, 0.1);
    g.sky.setFogBoost?.(1.6, 0.1);
    placeTaxi('ghost', gs - 12, -1.55, { headlights: 'low' });
    seatTon();
    // the camera is his eyes here: keep his own head out of the lens
    showPlayerHead(false);
    X.stage.add(() => showPlayerHead(true));
    const dad = X.stage.actor('somchai');
    const behind = taxiPoint(-0.35, 0, 6.2, new THREE.Vector3());
    stand(dad, behind, taxiPoint(0, 0, 0, _a));
    dad.setExpression?.({ smile: 0.55, sad: 0.8 });
    dad.lookAt(g.taxi.anchors.driverEye, { weight: 1 });
    await X.reveal(1.0);
    // the turn: from the windscreen round to the rear window
    const eye = () => g.taxi.anchors.driverEye.getWorldPosition(_a);
    await X.shot((t, k, dt, cam) => {
      cam.pos.copy(eye());
      const a = easeInOut(clamp(k * 1.25)) * Math.PI * 0.94;
      const fwd = taxiPoint(0.37 - Math.sin(a) * 4, 1.12, 0.24 - Math.cos(a) * 4, _b);
      cam.look.copy(fwd);
      cam.shot.fov = 50 - k * 10;
    }, 3.4, { shake: 0.004 });
    sfx('sting_low', { volume: 0.4 });
    // he fades, and the glass fogs where he was
    let op = 1;
    X.stage.update((dt) => {
      op = Math.max(0, op - dt / 4.5);
      dad.setOpacity?.(op);
    }, 21);
    g.taxi.setFog?.('rear', 0.9);
    g.sky.setFogBoost?.(3.2, 5);
    await X.shot((t, k, dt, cam) => {
      cam.pos.copy(eye());
      head(dad, cam.look);
      cam.shot.fov = 40 - k * 6;
    }, 6.5, { shake: 0.002 });
    // the taxi alone, swallowed
    const out = taxiPoint(-2.5, 2.4, 14, new THREE.Vector3());
    await fixed(X, out, () => taxiPoint(0, 0.8, 0, _a), 40, 4.5);
    g.taxi.setFog?.('rear', 0);
    await X.close(1.6);
  },

  /** Years later: an older Ton smokes at the garage as a young stranger rides up. */
  async years(sc, X) {
    holdSky(21.0, { rain: 0, fog: 0.75, wind: 0.2 }, 0);
    LoopStaging.clearGarage();
    const set = setupGarage(X.stage, { ahKong: 'none' });
    g.ahKong.root.visible = false;
    hidePlayer(true);
    const P = chars().player?.appearance || {};
    const old = tonActor(X, { id: 'olderTon', age: 56, build: 'average', hair: { style: 'gray-short', color: '#8f8a82' }, outfit: { type: 'tank-pants', top: '#d8d2c4', bottom: '#3a3a38', shoes: 'sandals' }, face: { ...(P.face || {}), wrinkles: 0.55 }, voice: { gender: 'm', age: 56, pitch: 0.85 } });
    stand(old, set.ahSpot, set.ahYaw);
    smokeRig(X.stage, old, { first: 1.2 });
    // the motorbike comes up the road with a young stranger on it
    const G = lm('garage');
    const gS = G?.roadRef?.s ?? 270;
    const bike = g.bike;
    bike.physics.frozen = false;
    bike.setEngine(true);
    bike.setHeadlight(true);
    const rider = X.stage.actor({ id: 'stranger', sex: 'm', age: 22, height: 1.7, build: 'thin', skinTone: 0.52, hair: { style: 'messy', color: '#141110' }, outfit: { type: 'hoodie-jeans', top: '#5a4a3a', bottom: '#2c3444' }, face: { seed: 1717 } });
    try {
      rider.sitAt(bike.anchors.seat, { pose: 'ride', blend: 0.01 });
      rider.setHandTarget('L', bike.anchors.handleL, { grip: 1 });
      rider.setHandTarget('R', bike.anchors.handleR, { grip: 1 });
      if (bike.anchors.footL) rider.setFootTarget('L', bike.anchors.footL, { orient: false });
      if (bike.anchors.footR) rider.setFootTarget('R', bike.anchors.footR, { orient: false });
    } catch (e) {
      /* pose optional */
    }
    X.stage.add(() => {
      bike.autopilot(null);
      bike.setEngine(false);
      bike.setHeadlight(false);
    });
    bike.autopilot({ splineId: 'main', s: gS - 75, speedKmh: 26, stopAt: gS - 3, place: true, lane: -1.6 });
    X.stage.emit('headlightBugs', { object: bike.root, count: 50 });
    await X.reveal(2);
    const wide = roadPoint('main', gS + 9, 3.2);
    wide.y += 1.6;
    await fixed(X, wide, () => head(old, _a).add(_b.set(0, -0.3, 0)), 36, 6, { ease: 0.04 });
    // his eyes on the light coming through the fog
    const behindOld = head(old, new THREE.Vector3()).add(new THREE.Vector3(Math.sin(set.ahYaw), 0.05, Math.cos(set.ahYaw)).multiplyScalar(0.9)).add(_a.set(0.25, 0, 0));
    await fixed(X, behindOld, () => wpos(bike.root, _a).add(_b.set(0, 1, 0)), 44, 5.5, { ease: 0.05 });
    old.lookAt(bike.root, { weight: 1, speed: 2 });
    const faceCam = () => head(old, _a).add(new THREE.Vector3(-Math.sin(set.ahYaw), -0.02, -Math.cos(set.ahYaw)).multiplyScalar(1.4));
    await talk(X, sc.lines, (l, i) => {
      if (i === 1) {
        const two = roadPoint('main', gS - 1, 3.4);
        two.y += 1.45;
        X.cam.play((t, k, dt, cam) => {
          cam.pos.copy(two);
          cam.look.copy(head(old, _a)).lerp(wpos(rider.root, _b).add(new THREE.Vector3(0, 1.2, 0)), 0.5);
          cam.shot.fov = 38;
        }, 30, { shake: 0.0015 });
        old.play?.('giveItem');
      } else if (i === 0 || i === 3) {
        const p = faceCam().clone();
        X.cam.play((t, k, dt, cam) => {
          cam.pos.copy(p);
          head(old, cam.look);
          cam.shot.fov = 30;
        }, 30, { shake: 0.0015 });
      }
    });
    await X.S.wait(1.6);
    await X.close(1.8);
  },

  // ---- wrong_home ---------------------------------------------------------------------------
  /** A village that should not be there: his childhood house, shutters closed. The taxi stops itself. */
  async house(sc, X) {
    const V = lm('humanVillageStop');
    const id = V?.roadRef?.id || 'human';
    const s = V?.roadRef?.s ?? 130;
    holdSky(29.5, { rain: 0, fog: 0.8, wind: 0.05 }, 0);
    g.sky.setGroundMist?.(1.9, 0.1);
    aimSun(id, s);
    placeTaxi(id, s - 32, -1.55, { headlights: 'low' });
    seatTon();
    const dad = X.stage.actor('somchai');
    dad.sitAt(g.taxi.seats.rearLeft, { pose: 'sitCar', blend: 0.01 });
    X.shared.dad = dad;
    speaker('somchai', dad);
    drive(id, s - 32, 18, s);
    await X.reveal(2);
    const housePos = V?.anchors?.windowAnchor ? wpos(V.anchors.windowAnchor, new THREE.Vector3()) : V?.anchors?.walkTarget ? wpos(V.anchors.walkTarget, new THREE.Vector3()).add(_a.set(0, 1.6, 0)) : roadPoint(id, s, -14).add(_a.set(0, 2, 0));
    X.shared.housePos = housePos;
    const cam0 = roadPoint(id, s + 9, 2.4);
    cam0.y += 1.3;
    await fixed(X, cam0, (t, k) => _a.copy(housePos).lerp(taxiPoint(0, 1, 0, _b), 0.45 - k * 0.3), 40, 8, { ease: 0.05 });
    await X.S.wait(0.2);
    X.keepStage = true; // the porch goes on with him
  },

  /** He walks to the porch, sits where he used to wash the car, and fades with the sunrise. */
  async porch(sc, X) {
    const V = lm('humanVillageStop');
    const id = V?.roadRef?.id || 'human';
    const s = V?.roadRef?.s ?? 130;
    let dad = X.shared.dad;
    if (!dad || dad.root?.parent == null) {
      await SCENES.house({ ...sc, lines: [] }, X);
      dad = X.shared.dad;
    }
    X.keepStage = false;
    await X.reveal(0.6);
    g.taxi.autopilot(null);
    const porch = V?.anchors?.walkTarget ? wpos(V.anchors.walkTarget, new THREE.Vector3()) : roadPoint(id, s, -9);
    const door = taxiPoint(-1.4, 0, 0.7, new THREE.Vector3());
    dad.detach(g.engine.scene);
    stand(dad, door, porch);
    g.taxi.openDoor('rl', 1, 0.6);
    const walk = dad.walkTo(porch.clone().add(_a.set(0, 0, 0)));
    const side = roadPoint(id, s - 3, -5.5);
    side.y += 1.25;
    await Promise.race([fixed(X, side, () => head(dad, _a), 38, 9, { ease: 0.06 }), walk.then(() => wait(0.6))]);
    // he sits on the step
    try {
      const step = new THREE.Object3D();
      step.position.copy(porch).add(_a.set(0, 0.35, 0));
      step.rotation.y = yawTo(porch, roadPoint(id, s, 0));
      g.engine.scene.add(step);
      X.stage.add(() => step.removeFromParent());
      dad.sitAt(step, { pose: 'sit', blend: 0.8 });
    } catch (e) {
      /* stays standing */
    }
    dad.setExpression?.({ sad: 0.9, smile: 0.3 });
    sunriseDrift(X, 29.55, 29.97, 12);
    const close = head(dad, new THREE.Vector3()).add(new THREE.Vector3().subVectors(roadPoint(id, s, 0), porch).setY(0).normalize().multiplyScalar(2.2)).add(_a.set(0, -0.1, 0));
    const words = talk(X, sc.lines);
    await Promise.all([fixed(X, close, () => head(dad, _a), 32, 7, { ease: 0.05 }), words]);
    let op = 1;
    X.stage.update((dt) => {
      op = Math.max(0, op - dt / 3.5);
      dad.setOpacity?.(op);
    }, 21);
    await X.S.wait(4);
    // and the light snaps back to nine o'clock
    holdSky(21.0, { rain: 0.2, fog: 0.8, wind: 0.4 }, 0);
    g.postfx.flash?.(0x0a1418, 0.3);
    sfx('sting_low', { volume: 0.6 });
    await X.S.wait(1.4);
    await X.close(0.5);
  },

  // ---- ride_away ----------------------------------------------------------------------------
  /** Down the spur road on the motorbike; behind him the garage tube flickers once and dies. */
  async spur(sc, X) {
    holdSky(21.15, { rain: 0, fog: 0.8, wind: 0.3 }, 0);
    g.sky.setGroundMist?.(1.6, 0.1);
    const bike = g.bike;
    const L = roadLen('spur');
    const p = g.player;
    if (p.vehicle !== bike) {
      if (p.mode !== 'foot') p.exitVehicle();
      p.enterVehicle(bike);
    }
    hidePlayer(false);
    bike.setControlsEnabled(false);
    bike.autopilot(null);
    bike.physics.frozen = false;
    bike.setEngine(true);
    bike.setHeadlight(true);
    X.stage.emit('headlightBugs', { object: bike.root, count: 70 });
    const G = lm('garage');
    if (G?.prop) setLampOn(G.prop, true);
    X.stage.add(() => G?.prop && setLampOn(G.prop, true));
    const ride = rideSpur(X, L - 10, 10);
    await X.reveal(1.6);
    // the garage behind him, the tube
    const gl = G?.anchors?.lampAnchor ? wpos(G.anchors.lampAnchor, new THREE.Vector3()) : G?.pos;
    const back = roadPoint('main', (G?.roadRef?.s ?? 270) - 4, 3.0);
    back.y += 1.7;
    const shotA = fixed(X, back, () => wpos(bike.root, _a).add(_b.set(0, 0.9, 0)), 44, 6, { ease: 0.06 });
    await X.S.wait(3.2);
    if (G?.prop) {
      setLampOn(G.prop, false);
      sfx('spark', { position: gl, volume: 0.5 });
      await X.S.wait(0.18);
      setLampOn(G.prop, true);
      await X.S.wait(0.12);
      setLampOn(G.prop, false);
    }
    await shotA;
    // chase, low behind the rear wheel; insects in the beam
    const sm = new THREE.Vector3();
    let init = false;
    await X.shot((t, k, dt, cam) => {
      localPoint(bike.root, 0.35, 0.9, 3.4, _a);
      if (!init) {
        sm.copy(_a);
        init = true;
      }
      cam.pos.copy(sm.lerp(_a, 0.15));
      localPoint(bike.root, 0, 1.0, -12, cam.look);
      cam.shot.fov = 50;
    }, 5.5, { shake: 0.003 });
    // the spirit house slides past; he does not slow
    const SH = lm('spurShrine');
    const shS = SH?.roadRef?.s ?? L * 0.45;
    ride.jump(shS + 38);
    const shp = SH?.pos ? SH.pos.clone() : roadPoint('spur', shS, -4);
    const camS = roadPoint('spur', shS - 2, -2.6);
    camS.y += 0.9;
    await fixed(X, camS, () => _a.copy(shp).add(_b.set(0, 1, 0)).lerp(wpos(bike.root, new THREE.Vector3()).add(_b.set(0, 1, 0)), 0.55), 44, 5, { ease: 0.08 });
    await X.S.wait(0.1);
    X.keepStage = true; // he rides on (mirror / city)
  },

  /** Far back, under the last streetlight, a man in a faded blue shirt lifts a hand. */
  async mirror(sc, X) {
    const bike = g.bike;
    if (!X.shared.ride) {
      await SCENES.spur({ ...sc, lines: [] }, X);
    }
    X.keepStage = false;
    await X.reveal(0.5);
    const sNow = X.shared.ride ? X.shared.ride.s() : roadLen('spur') * 0.4;
    const dadS = Math.min(roadLen('spur') - 2, sNow + 55);
    const dp = roadPoint('spur', dadS, -4.2);
    const lampP = dp.clone().add(_a.set(0, 5.5, 0));
    X.stage.light({ kind: 'sodium', position: lampP, intensity: 260, distance: 18, pool: true, glow: { size: 1.2, opacity: 0.5 } });
    const dad = X.stage.actor('somchai');
    stand(dad, dp, roadPoint('spur', dadS - 10, 1));
    dad.setExpression?.({ smile: 0.45, sad: 0.5 });
    await X.S.wait(0.2);
    // over Ton's shoulder, back along the road
    const over = () => localPoint(bike.root, -0.28, 1.72, 0.55, _a);
    const shotA = X.shot((t, k, dt, cam) => {
      cam.pos.copy(over());
      cam.look.lerp(head(dad, _b), t < 0.05 ? 1 : 0.2);
      cam.shot.fov = 26;
    }, 5.5, { shake: 0.002 });
    await X.S.wait(1.6);
    dad.play?.('wave', { duration: 3 });
    await shotA;
    // his face; he does not stop
    const words = talk(X, sc.lines);
    await Promise.all([
      X.shot((t, k, dt, cam) => {
        localPoint(bike.root, 0.12, 1.55, -1.25, cam.pos);
        localPoint(bike.root, 0, 1.52, 0.1, cam.look);
        cam.shot.fov = 36;
      }, 5, { shake: 0.003 }),
      words,
    ]);
    await X.close(1.6);
    X.keepStage = true;
  },

  /** Bangkok, before dawn: a rented room, traffic hiss, the phone lights up. Unknown number. */
  async city(sc, X) {
    await X.phone();
  },

  // ---- join_father --------------------------------------------------------------------------
  /** LEFT, alone, the sunrise behind: the ว่าง lamp goes dark, the meter starts by itself. */
  async left(sc, X) {
    const L = roadLen('main');
    holdSky(29.72, { rain: 0, fog: 0.8, wind: 0.1 }, 0);
    aimSun('main', L - 30, false);
    g.sky.setGroundMist?.(1.9, 0.1);
    placeTaxi('main', L - 28, -1.55, { headlights: 'low' });
    seatTon();
    const ap = g.taxi.autopilot({ splineId: 'main', s: L - 28, speedKmh: 18 });
    void ap;
    let switched = false;
    X.stage.update(() => {
      const r = g.taxi.physicsSim.roadRef;
      if (!switched && r?.id === 'main' && r.s > L - 3) {
        switched = true;
        g.taxi.autopilot({ splineId: 'ghost', s: 0, speedKmh: 16 });
      }
    }, 8);
    await X.reveal(1.6);
    const cam0 = roadPoint('main', L - 12, 0.4);
    cam0.y += 1.7;
    await fixed(X, cam0, () => taxiPoint(0, 0.9, 0, _a), 40, 6.5, { ease: 0.05 });
    // the lamp dies, the meter starts on its own
    g.taxi.setControl('vacantLamp', false);
    await X.shot((t, k, dt, cam) => {
      taxiPoint(0.16, 1.08, -0.4, cam.pos);
      taxiPoint(-0.06, 0.975, -0.72, cam.look);
      cam.shot.fov = 34;
    }, 4.5, { shake: 0.002 });
    g.taxi.setControl('meter', true);
    await X.S.wait(0.1);
    g.sky.setFogBoost?.(2.6, 4);
    const rear = taxiPoint(0.2, 1.6, 9, new THREE.Vector3());
    await fixed(X, () => rear, () => taxiPoint(0, 0.9, -3, _a), 44, 4.5);
    await X.close(1.4);
  },

  /** The mist gate, gold and still. Somchai with his back to the car. Ton walks to him. */
  async gate(sc, X) {
    const GG = lm('ghostGate');
    const gs = GG?.roadRef?.s ?? 120;
    holdSky(29.82, { rain: 0, fog: 0.85, wind: 0.02 }, 0);
    X.goldMist(true);
    const gc = GG?.anchors?.gateCenter ? wpos(GG.anchors.gateCenter, new THREE.Vector3()) : roadPoint('ghost', gs, 0);
    gc.y = ground(gc.x, gc.z);
    placeTaxi('ghost', gs - 13, -1.2, { headlights: 'low' });
    g.taxi.state.doors.fr = 1;
    const dad = X.stage.actor('somchai');
    stand(dad, gc.clone().add(_a.set(0, 0, 0)), roadYaw('ghost', gs));
    speaker('somchai', dad);
    const ton = tonActor(X);
    stand(ton, taxiPoint(1.35, 0, -0.1, new THREE.Vector3()), gc);
    X.shared.dad = dad;
    X.shared.ton = ton;
    await X.reveal(2);
    const behind = taxiPoint(-1.0, 1.7, 5, new THREE.Vector3());
    const walking = ton.walkTo(gc.clone().addScaledVector(new THREE.Vector3().subVectors(taxiPoint(0, 0, 0, _a), gc).setY(0).normalize(), 1.6));
    await Promise.race([fixed(X, behind, () => _a.copy(gc).add(_b.set(0, 1.4, 0)), 40, 8, { ease: 0.04 }), walking.then(() => wait(1.2))]);
    const side = () => _a.copy(dad.root.position).lerp(ton.root.position, 0.5).add(new THREE.Vector3().crossVectors(UP, new THREE.Vector3().subVectors(dad.root.position, ton.root.position).normalize()).multiplyScalar(2.4)).add(_b.set(0, 1.5, 0));
    const sideP = side().clone();
    await talk(X, sc.lines, (l) => {
      const him = l.who === 'somchai';
      if (him && l.emotion === 'smile') {
        dad.root.rotation.y += 0; // he does not turn
        dad.setExpression?.({ smile: 1, sad: 0.4 });
      }
      X.cam.play((t, k, dt, cam) => {
        cam.pos.copy(sideP);
        cam.look.copy(head(him ? dad : ton, _b));
        cam.shot.fov = 30;
      }, 30, { shake: 0.0015 });
    });
    await X.S.wait(1.2);
    await X.close(1.6, 0xf0d8a0);
  },

  /** The two of them on the back seat of the parked taxi, side by side; then only the empty cab. */
  async backSeat(sc, X) {
    const GG = lm('ghostGate');
    const gs = GG?.roadRef?.s ?? 120;
    holdSky(29.85, { rain: 0, fog: 0.85, wind: 0.02 }, 0);
    X.goldMist(true);
    placeTaxi('ghost', gs - 13, -1.2, { headlights: 'off' });
    hidePlayer(true);
    if (g.player.vehicle) g.player.exitVehicle();
    g.taxi.state.doors.rr = 1;
    const dad = X.stage.actor('somchai');
    const ton = tonActor(X);
    dad.sitAt(g.taxi.seats.rearLeft, { pose: 'sitCar', blend: 0.01 });
    ton.sitAt(g.taxi.seats.rearRight, { pose: 'sitCar', blend: 0.01 });
    dad.setExpression?.({ smile: 0.4 });
    await X.reveal(2);
    const out = taxiPoint(2.2, 1.25, 1.3, new THREE.Vector3());
    const out2 = taxiPoint(1.5, 1.2, 1.05, new THREE.Vector3());
    await X.shot((t, k, dt, cam) => {
      cam.pos.lerpVectors(out, out2, easeInOut(k));
      taxiPoint(-0.05, 1.05, 1.0, cam.look);
      cam.shot.fov = 36;
    }, 8, { shake: 0.0015 });
    await g.cine.fade(1, 1.6, new THREE.Color(0xf4dcae));
    dad.root.visible = false;
    ton.root.visible = false;
    await g.cine.fade(0, 1.6);
    await X.shot((t, k, dt, cam) => {
      cam.pos.copy(out2);
      taxiPoint(-0.05, 0.95, 1.0, cam.look);
      cam.shot.fov = 34;
    }, 4, { shake: 0.0015 });
    await X.close(1.6);
  },

  /** Morning: the taxi found in front of Ma Ruay Shrine, engine warm, nobody inside. */
  async found(sc, X) {
    X.goldMist(false);
    const SM = lm('shrineMaRuay');
    const L = roadLen('main');
    holdSky(30, { rain: 0, fog: 0.45, wind: 0.1 }, 0);
    aimSun('main', L - 14, true);
    X.stage.loop('birds_dawn', { volume: 0.8 });
    placeTaxi('main', L - 14, -1.55, { headlights: 'off' });
    hidePlayer(true);
    if (g.player.vehicle) g.player.exitVehicle();
    g.taxi.state.doors.fr = 1;
    const bua = X.stage.actor('bua');
    stand(bua, taxiPoint(1.3, 0, -0.15, new THREE.Vector3()), taxiPoint(0.3, 0, -0.2, _a));
    speaker('bua', bua);
    const man = X.stage.actor({ id: 'villager', sex: 'm', age: 50, build: 'average', skinTone: 0.6, hair: { style: 'short', color: '#1a1714' }, outfit: { type: 'tshirt-shorts', top: '#7a6a52' }, face: { seed: 5151 } });
    stand(man, taxiPoint(2.6, 0, -2.6, new THREE.Vector3()), taxiPoint(0, 0, 0, _a));
    void SM;
    await X.reveal(2);
    const wide = roadPoint('main', L - 30, 3.5);
    wide.y += 1.5;
    await fixed(X, wide, () => taxiPoint(0, 1.0, -2, _a), 40, 6, { ease: 0.04 });
    // a fresh garland on the mirror
    try {
      bua.setHandTarget('R', g.taxi.anchors.amuletHang, { grip: 0.5, blend: 0.8 });
    } catch (e) {
      /* ignore */
    }
    wait(1.6).then(() => {
      try {
        const gl = g.taxi.addDashGarland?.({ seed: 77 });
        if (gl) X.stage.add(() => gl.dispose?.());
      } catch (e) {
        /* ignore */
      }
      sfx('garland_jingle', { object: g.taxi.anchors.amuletHang, volume: 0.5 });
    });
    const inside = taxiPoint(-0.4, 1.15, 0.35, new THREE.Vector3());
    const words = talk(X, sc.lines);
    await Promise.all([fixed(X, inside, () => g.taxi.anchors.amuletHang.getWorldPosition(_a).lerp(head(bua, _b), 0.35), 44, 7, { ease: 0.05 }), words]);
    await X.close(1.8);
  },

  // ---- forgive ------------------------------------------------------------------------------
  /** The mist turns gold; in the rear-view mirror Somchai raises a hand, cabbie to cabbie. */
  async goldMist(sc, X) {
    const GG = lm('ghostGate');
    const gs = GG?.roadRef?.s ?? 120;
    holdSky(29.8, { rain: 0, fog: 0.85, wind: 0.02 }, 0);
    placeTaxi('ghost', gs - 10, -1.55, { headlights: 'low' });
    seatTon();
    const dad = X.stage.actor('somchai');
    stand(dad, taxiPoint(-0.4, 0, 7.5, new THREE.Vector3()), taxiPoint(0, 0, 0, _a));
    dad.setExpression?.({ smile: 0.8 });
    await X.reveal(1.6);
    X.goldMist(true);
    const mirror = g.taxi.anchors.rearviewMirror.getWorldPosition(new THREE.Vector3());
    const shot = X.shot((t, k, dt, cam) => {
      taxiPoint(0.3, 1.17, -0.08 - k * 0.04, cam.pos);
      g.taxi.anchors.rearviewMirror.getWorldPosition(cam.look);
      cam.shot.fov = 26 - k * 3;
    }, 9, { shake: 0.0012 });
    void mirror;
    await X.S.wait(2.2);
    dad.play?.('wave', { duration: 3.5 });
    await X.S.wait(3.4);
    let op = 1;
    X.stage.update((dt) => {
      op = Math.max(0, op - dt / 2.5);
      dad.setOpacity?.(op);
    }, 21);
    g.postfx.flash?.(0xffe2a8, 2.4);
    await shot;
    await X.close(1.8, 0xf6e2b8);
  },
};

/** Fallback for a scene id without staging: a slow drift over the taxi in the fog. */
export async function genericScene(sc, X) {
  holdSky(29.6, { rain: 0, fog: 0.8, wind: 0.1 }, 0);
  const L = roadLen('main');
  placeTaxi('main', L - 40, -1.55);
  seatTon();
  await X.reveal(1.5);
  const p = roadPoint('main', L - 30, 4);
  p.y += 2;
  const words = talk(X, sc.lines || []);
  await Promise.all([fixed(X, p, () => taxiPoint(0, 1, 0, _a), 42, 6), words]);
  await X.close(1.4);
}

/** The phone in the dark (ride_away "city"): drawn as a lit screen over black. */
export async function phoneInTheDark(X) {
  const lay = document.createElement('div');
  lay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:40;opacity:0;transition:opacity 1.6s ease;display:flex;align-items:center;justify-content:center;pointer-events:none';
  const phone = document.createElement('canvas');
  phone.width = 300;
  phone.height = 560;
  phone.style.cssText = 'width:150px;height:280px;border-radius:14px;opacity:0;transition:opacity 0.4s ease;filter:blur(0.3px);box-shadow:0 0 60px rgba(150,180,220,0.18)';
  lay.appendChild(phone);
  const glowLine = document.createElement('div');
  glowLine.style.cssText = 'position:absolute;left:0;right:0;top:0;height:42%;background:linear-gradient(180deg,rgba(40,60,90,0.18),rgba(0,0,0,0));';
  lay.appendChild(glowLine);
  document.body.appendChild(lay);
  X.stage.add(() => lay.remove());
  const draw = (lit, pulse) => {
    const c = phone.getContext('2d');
    c.fillStyle = '#05070a';
    c.fillRect(0, 0, 300, 560);
    if (!lit) return;
    const grd = c.createLinearGradient(0, 0, 0, 560);
    grd.addColorStop(0, '#16202c');
    grd.addColorStop(1, '#0a0e14');
    c.fillStyle = grd;
    c.fillRect(8, 8, 284, 544);
    c.fillStyle = 'rgba(200,215,230,0.9)';
    c.textAlign = 'center';
    c.font = `400 64px ${FONTS.title || FONTS.body}`;
    c.fillText('05:00', 150, 140);
    c.font = `400 26px ${FONTS.body}`;
    c.fillStyle = 'rgba(200,215,230,0.75)';
    c.fillText('ไม่ทราบหมายเลข', 150, 260);
    c.beginPath();
    c.strokeStyle = `rgba(120,200,140,${0.35 + pulse * 0.5})`;
    c.lineWidth = 3;
    c.arc(150, 430, 34 + pulse * 10, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.fillStyle = 'rgba(120,200,140,0.85)';
    c.arc(150, 430, 26, 0, Math.PI * 2);
    c.fill();
  };
  draw(false, 0);
  // the room: rain on the window, the city's hiss far away
  try {
    g.audio?.ambience?.set({ rain: 0.25, insideCar: true, hour: 29, dread: 0 });
  } catch (e) {
    /* ignore */
  }
  const hiss = makeHiss();
  X.stage.add(() => hiss?.stop?.(1));
  requestAnimationFrame(() => (lay.style.opacity = '1'));
  await X.S.wait(3.2);
  phone.style.opacity = '1';
  for (let i = 0; i < 5; i++) {
    for (let f = 0; f < 10; f++) {
      draw(true, Math.sin((f / 10) * Math.PI));
      if (f === 0) buzz();
      await X.S.wait(0.12);
    }
    await X.S.wait(0.9);
  }
  draw(true, 0);
  await X.S.wait(1.4);
  phone.style.opacity = '0';
  await X.S.wait(2.6);
}

/** A short phone vibration, synthesised. */
function buzz() {
  try {
    const ctx = g.audio?.ctx;
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * 0.42);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.min(1, t * 60) * Math.min(1, (0.42 - t) * 40);
      d[i] = (Math.sign(Math.sin(2 * Math.PI * 152 * t)) * 0.5 + Math.sin(2 * Math.PI * 304 * t) * 0.3) * env * (0.7 + 0.3 * Math.sin(2 * Math.PI * 11 * t)) * 0.35;
    }
    g.audio.playBuffer(buf, { bus: 'sfx', volume: 0.5, pan: 0.1 });
  } catch (e) {
    /* audio optional */
  }
}
/** Distant city hiss (filtered noise), looped by re-triggering. */
function makeHiss() {
  try {
    const ctx = g.audio?.ctx;
    if (!ctx) return null;
    const n = Math.floor(ctx.sampleRate * 6);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      b = b * 0.985 + (Math.random() * 2 - 1) * 0.015;
      const t = i / n;
      d[i] = b * 3.2 * Math.min(1, t * 8, (1 - t) * 8);
    }
    let stop = false;
    let h = null;
    const play = () => {
      if (stop) return;
      h = g.audio.playBuffer(buf, { bus: 'ambience', volume: 0.35 });
      setTimeout(play, 5200);
    };
    play();
    return {
      stop() {
        stop = true;
        h?.stop?.(1);
      },
    };
  } catch (e) {
    return null;
  }
}
void smoothstep;
