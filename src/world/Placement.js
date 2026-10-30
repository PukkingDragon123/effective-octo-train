// Placement: every LAYOUT landmark built with the props factories (src/props), plus the
// roadside dressing (concrete poles + tangled wires, lamp poles near landmarks, spirit houses,
// KM stones, curve warnings, convex mirrors, guardrails with delineator lamps, lantern strings
// on the shrine approach, sacred trees wrapped in ผ้าสามสี, clutter).
//
// Two phases:
//   plan(plan)   before the terrain/forest exist: positions on the splines, terrain pads and
//                forest clearings (so trees never grow through a pole or a spirit house).
//   build()      after terrain + forest: calls the factories, converts anchors / colliders to
//                world space (core/colliders), registers lights (lightPool), and batches the
//                small dressing per 96 m chunk (ChunkBatcher) so draw calls stay low.
import * as THREE from 'three';
import * as P from '../props/index.js';
import { colliders } from '../core/Colliders.js';
import { makeRng } from '../core/math.js';
import { W, faceRoadYaw } from './constants.js';
import { LANDMARK_NAMES } from './layout.js';
import { ChunkBatcher } from './Batch.js';

const TAG = 'world';
const POLE_E = 1.0; // pole distance beyond the asphalt edge (m)
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// random dressing signs (natural Thai)
const RANDOM_SIGNS = [
  ['speed_sign', { kmh: 40 }],
  ['warning_sign', { th: 'ระวังสัตว์ป่า', en: 'WILDLIFE' }],
  ['speed_sign', { kmh: 60 }],
  ['warning_sign', { th: 'ระวังหินร่วง', en: 'FALLING ROCKS' }],
  ['warning_sign', { th: 'ห้ามล่าสัตว์', en: 'NO HUNTING' }],
  ['warning_sign', { th: 'ขับช้าๆ', en: 'DRIVE SLOWLY' }],
  ['warning_sign', { th: 'ทางแคบ', en: 'NARROW ROAD' }],
];
const CLUTTER = ['trash_bag', 'tire', 'tire', 'oil_drum', 'water_jar', 'crate', 'sandbags', 'broken_scooter', 'cans', 'plastic_chair', 'trash_bag', 'cable_coil'];

export class Placement {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.items = []; // planned dressing
    this.blocks = []; // {id, s0, s1, side (0 = both)}
    this.points = []; // planned positions {x, z, r} (spacing checks)
    this.pieces = []; // set pieces {object, x, z, r}
    this.results = []; // every prop result (dispose)
    this.lightHandles = [];
    this.colliderCount = 0;
    this.batcher = new ChunkBatcher(this.group, 96);
    this.stats = {};
  }

  // =====================================================================================
  // PLAN (pure geometry)
  // =====================================================================================
  plan(plan) {
    const world = this.world, road = world.road;
    const layout = world.layout;
    const lms = plan.landmarks;
    const hw = W.halfWidth;
    const rng = makeRng(layout.seed * 17 + 3);
    this.plan_ = plan;
    const main = road.get('main');
    const L = main.length;

    // ---- blocked stretches ------------------------------------------------------------------
    for (const lm of Object.values(lms)) {
      const ext = Math.max(lm.footprint.hx, 1) + 5;
      this.blocks.push({ id: lm.roadRef.id, s0: lm.roadRef.s - ext, s1: lm.roadRef.s + ext, side: lm.sideSign });
    }
    const block = (id, s0, s1, side = 0) => this.blocks.push({ id, s0, s1, side });
    const bridge = lms.bridge;
    if (bridge) block('main', bridge.roadRef.s - (bridge.spec.length || 26) / 2 - 7, bridge.roadRef.s + (bridge.spec.length || 26) / 2 + 7);
    const ele = lms.elephantCrossing;
    if (ele) block('main', ele.roadRef.s - 34, ele.roadRef.s + 34);
    const sJ = lms.spurJunction ? lms.spurJunction.roadRef.s : 0;
    block('main', sJ - 16, sJ + 16);
    block('main', -1, 24);
    block('main', L - 26, L + 1);
    for (const id of ['ghost', 'human']) {
      const Lb = road.length(id);
      block(id, -1, 30);
      block(id, Lb - 26, Lb + 1);
    }
    block('spur', road.length('spur') - 18, road.length('spur') + 1);
    // ghost gate posts
    if (lms.ghostGate) {
      const g = lms.ghostGate;
      const sp = road.get('ghost');
      for (const s of [-1, 1]) {
        const p = sp.pointAt(g.roadRef.s, s * 4.75);
        plan.clearings.push({ x: p.x, z: p.z, r: 2.2, key: 'ghostGatePost' });
      }
    }

    // ---- features: guardrails, convex mirrors, curve warnings --------------------------------
    const feats = (world.features || []).filter((f) => ['accident', 'hairpin', 'sharp'].includes(f.tag));
    for (const f of feats) {
      const outside = f.sign > 0 ? 1 : -1; // left turn -> outside is the right edge
      const mid = (f.s0 + f.s1) / 2;
      if (f.tag === 'accident') {
        // guardrail broken open where the bike went through (the memorial stands in the gap)
        const sm = lms.accidentCurve ? lms.accidentCurve.roadRef.s : mid;
        this.items.push({ type: 'guardrail', id: 'main', s0: f.s0 - 14, s1: sm - 3.2, side: outside, damaged: true, seed: 11 });
        this.items.push({ type: 'guardrail', id: 'main', s0: sm + 3.2, s1: f.s1 + 12, side: outside, damaged: false, seed: 12 });
      } else {
        this.items.push({ type: 'guardrail', id: 'main', s0: f.s0 - 4, s1: f.s1 + 4, side: outside, damaged: rng() < 0.4, seed: 20 + this.items.length });
      }
      // convex mirror on the outside of the apex, facing into the bend
      const ms = f.tag === 'accident' ? f.s0 + (f.s1 - f.s0) * 0.25 : mid;
      this._planPoint({ type: 'mirror', id: 'main', s: ms, lat: outside * (hw + 1.25), side: outside, seed: 31 + this.items.length }, 1.2, true);
      // curve warnings for both directions
      const dir = f.sign > 0 ? 'left' : 'right';
      this._planPoint({ type: 'sign', kind: 'curve_warning', opts: { dir }, id: 'main', s: f.s0 - 42, lat: -(hw + 0.75), side: -1, face: 'oncoming', seed: 41 + this.items.length }, 1);
      this._planPoint({ type: 'sign', kind: 'curve_warning', opts: { dir: dir === 'left' ? 'right' : 'left' }, id: 'main', s: f.s1 + 42, lat: hw + 0.75, side: 1, face: 'back', seed: 43 + this.items.length }, 1);
    }
    // bridge approaches: short guardrails on both sides
    if (bridge) {
      const sB = bridge.roadRef.s, half = (bridge.spec.length || 26) / 2;
      for (const side of [-1, 1]) {
        this.items.push({ type: 'guardrail', id: 'main', s0: sB - half - 18, s1: sB - half + 0.3, side, damaged: false, seed: 60 + side, lampEvery: 3 });
        this.items.push({ type: 'guardrail', id: 'main', s0: sB + half - 0.3, s1: sB + half + 18, side, damaged: side < 0, seed: 62 + side, lampEvery: 3 });
      }
    }
    // elephant crossing: yellow diamonds for both directions (never on the asphalt)
    if (ele) {
      const s = ele.roadRef.s;
      this._planPoint({ type: 'sign', kind: 'elephant_crossing', opts: {}, id: 'main', s: s - 72, lat: -(hw + 0.8), side: -1, face: 'oncoming', seed: 71 }, 1, true);
      this._planPoint({ type: 'sign', kind: 'elephant_crossing', opts: {}, id: 'main', s: s + 72, lat: hw + 0.8, side: 1, face: 'back', seed: 72 }, 1, true);
    }
    // spur junction: warning on main before it, convex mirror opposite the spur mouth
    if (lms.spurJunction) {
      this._planPoint({ type: 'sign', kind: 'warning_sign', opts: { th: 'ทางแยก', en: 'JUNCTION' }, id: 'main', s: sJ - 48, lat: -(hw + 0.75), side: -1, face: 'oncoming', seed: 81 }, 1, true);
      this._planPoint({ type: 'mirror', id: 'main', s: sJ + 1.5, lat: -(hw + 1.3), side: -1, seed: 82 }, 1.2, true);
      const sp = road.get('spur');
      this._planPoint({ type: 'sign', kind: 'speed_sign', opts: { kmh: 40 }, id: 'spur', s: sp.length - 40, lat: -(hw + 0.75), side: -1, face: 'oncoming', seed: 83 }, 1, true);
    }
    // spur start: a narrow-road warning where the intro begins
    {
      const sp = road.get('spur');
      this._planPoint({ type: 'sign', kind: 'warning_sign', opts: { th: 'ทางแคบ คดเคี้ยว', en: 'NARROW WINDING ROAD' }, id: 'spur', s: 22, lat: -(hw + 0.8), side: -1, face: 'oncoming', seed: 84 }, 1, true);
      this._planPoint({ type: 'sign', kind: 'temple_sign', opts: { th: 'ศาลเจ้ามารวย', sub: '12 กม.' }, id: 'spur', s: 9, lat: hw + 1.6, side: 1, face: 'oncoming', seed: 85 }, 1.5, true);
      void sp;
    }
    // temple sign in front of the forest temple
    if (lms.forestTemple) {
      const t = lms.forestTemple;
      this._planPoint({ type: 'sign', kind: 'temple_sign', opts: { th: 'วัดป่าห้วยเงียบ', sub: 'ทางขึ้นวัด' }, id: 'main', s: t.roadRef.s - 13, lat: hw + 1.2, side: 1, face: 'oncoming', seed: 86 }, 1.5, true);
    }

    // ---- poles (+ lamps near landmarks, lantern posts on the shrine approach) -----------------
    const lampLm = Object.values(lms).filter((l) => ['garage', 'sala', 'bus_stop', 'noodle_shop', 'market_crossroad', 'village_stop', 'junction', 'forest_temple'].includes(l.kind));
    const father = lms.fatherLamp ? lms.fatherLamp.roadRef.s : L * 0.865;
    const approachS = lms.shrineApproach ? lms.shrineApproach.roadRef.s : L * 0.93;
    for (const id of ['main', 'spur', 'human']) {
      const sp = road.get(id);
      const spacing = 100 / layout.dressing.polesPer100m;
      let side = -1;
      let chain = 0;
      let lastS = -1e9;
      for (let s = 14 + rng() * 8; s < sp.length - 10; s += spacing * (0.86 + rng() * 0.28)) {
        if (rng() < 0.12 && Math.abs(sp.curvatureAt(s)) < 1 / 200) side = -side;
        let useSide = side;
        if (this._isBlocked(id, s, useSide, 2)) useSide = -useSide;
        if (this._isBlocked(id, s, useSide, 2)) {
          continue;
        }
        if (s - lastS > 95) chain++;
        lastS = s;
        const lat = useSide * (hw + POLE_E);
        const p = sp.pointAt(s, lat);
        if (!this._free(p.x, p.z, 2.4)) continue;
        // lamp?
        let lamp = null;
        const near = lampLm.find((l) => l.roadRef.id === id && Math.abs(l.roadRef.s - s) < 34);
        const lonely = id === 'main' && s > father - 160;
        if (near && !lonely) lamp = near.kind === 'sala' || near.kind === 'bus_stop' ? 'fluorescent' : 'sodium';
        else if (!lonely && rng() < 0.05) lamp = 'dying';
        const lantern = id === 'main' && s > approachS - 10 && s < L - 30;
        this.items.push({ type: 'pole', id, s, lat, side: useSide, lamp, chain: id + chain, transformer: rng() < 0.14, seed: 200 + this.items.length, lantern });
        this.points.push({ x: p.x, z: p.z, r: 1 });
        plan.clearings.push({ x: p.x, z: p.z, r: 1.4, key: 'pole' });
        if (lantern) {
          const q = sp.pointAt(s, -lat);
          this.points.push({ x: q.x, z: q.z, r: 1 });
          plan.clearings.push({ x: q.x, z: q.z, r: 1.4, key: 'post' });
        }
      }
    }

    // ---- random spirit houses, signs, clutter ------------------------------------------------
    for (const id of ['main', 'spur', 'human']) {
      const sp = road.get(id);
      const len = sp.length;
      const nSpirit = Math.round((len / 100) * layout.dressing.spiritHousesPer100m);
      for (let i = 0, tries = 0; i < nSpirit && tries < nSpirit * 12; tries++) {
        const s = 30 + rng() * (len - 60);
        const side = rng() < 0.65 ? -1 : 1;
        if (this._isBlocked(id, s, side, 4)) continue;
        const lat = side * (hw + W.shoulder + 1.4);
        const p = sp.pointAt(s, lat);
        if (!this._free(p.x, p.z, 5)) continue;
        const style = ['thai', 'thai', 'chinese', 'twin'][Math.floor(rng() * 4)];
        this.items.push({ type: 'spirit', id, s, lat, side, style, seed: 300 + i * 7 + (id === 'main' ? 0 : 50) });
        this.points.push({ x: p.x, z: p.z, r: 2 });
        plan.pads.push({ x: p.x, z: p.z, hx: 1.1, hz: 1.0, yaw: faceRoadYaw(sp.yawAt(s), side < 0 ? 'L' : 'R'), h: sp.heightAt(s) - 0.05, blend: 2.2, kind: 'gravel' });
        plan.clearings.push({ x: p.x, z: p.z, r: 2.4, key: 'spirit' });
        i++;
      }
      const nSign = Math.max(1, Math.round((len / 100) * layout.dressing.signsPer100m));
      for (let i = 0, tries = 0; i < nSign && tries < 40; tries++) {
        const s = 40 + rng() * (len - 80);
        const side = rng() < 0.75 ? -1 : 1;
        if (this._isBlocked(id, s, side, 2)) continue;
        const lat = side * (hw + 0.8);
        const p = sp.pointAt(s, lat);
        if (!this._free(p.x, p.z, 4)) continue;
        const [kind, opts] = RANDOM_SIGNS[Math.floor(rng() * RANDOM_SIGNS.length)];
        this.items.push({ type: 'sign', kind, opts, id, s, lat, side, face: side < 0 ? 'oncoming' : 'back', seed: 400 + i + (id === 'main' ? 0 : 30) });
        this.points.push({ x: p.x, z: p.z, r: 1 });
        i++;
      }
      const nClutter = Math.round(len / 240);
      for (let i = 0, tries = 0; i < nClutter && tries < 40; tries++) {
        const s = 30 + rng() * (len - 60);
        const side = rng() < 0.5 ? -1 : 1;
        if (this._isBlocked(id, s, side, 2)) continue;
        const lat = side * (hw + 1.1 + rng() * 1.4);
        const p = sp.pointAt(s, lat);
        if (!this._free(p.x, p.z, 3)) continue;
        this.items.push({ type: 'clutter', kind: CLUTTER[Math.floor(rng() * CLUTTER.length)], id, s, lat, side, seed: 500 + i + (id === 'main' ? 0 : 40) });
        this.points.push({ x: p.x, z: p.z, r: 1 });
        i++;
      }
    }

    // ---- landmark extras: banana Nang Tani tree, pond pad, elephant trail ---------------------
    if (lms.hiddenPond) plan.clearings.push({ x: lms.hiddenPond.pos.x, z: lms.hiddenPond.pos.z, r: 9.5, key: 'pond' });
    if (lms.bananaGrove) plan.clearings.push({ x: lms.bananaGrove.pos.x, z: lms.bananaGrove.pos.z, r: 1.6, key: 'nangTani' });
  }

  _isBlocked(id, s, side, pad = 0) {
    for (const b of this.blocks) {
      if (b.id !== id) continue;
      if (b.side !== 0 && side !== 0 && b.side !== side) continue;
      if (s > b.s0 - pad && s < b.s1 + pad) return true;
    }
    return false;
  }

  _free(x, z, r) {
    for (const p of this.points) if (Math.hypot(p.x - x, p.z - z) < r + p.r) return false;
    return true;
  }

  _planPoint(item, r = 1, force = false) {
    const sp = this.world.road.get(item.id);
    if (item.s < 2 || item.s > sp.length - 2) return false;
    if (!force && this._isBlocked(item.id, item.s, item.side, 1)) return false;
    const p = sp.pointAt(item.s, item.lat);
    if (!this._free(p.x, p.z, r)) return false;
    this.items.push(item);
    this.points.push({ x: p.x, z: p.z, r });
    return true;
  }

  // =====================================================================================
  // BUILD
  // =====================================================================================
  async build(onProgress) {
    const world = this.world;
    const t0 = performance.now();
    const T = {};
    let tt = performance.now();
    const lap = (k) => {
      const n = performance.now();
      T[k] = Math.round(n - tt);
      tt = n;
    };
    // ---- set pieces ---------------------------------------------------------------------------
    const keys = Object.keys(world.landmarks);
    for (let i = 0; i < keys.length; i++) {
      const lm = world.landmarks[keys[i]];
      try {
        this._buildLandmark(lm);
      } catch (e) {
        console.error('[world] landmark', lm.key, 'failed', e);
      }
      onProgress?.((i / keys.length) * 0.5);
      if (i % 4 === 3) await yieldFrame();
    }
    lap('landmarks');
    // ---- dressing -----------------------------------------------------------------------------
    await this._buildDressing((f) => onProgress?.(0.5 + f * 0.45));
    lap('dressing');
    const merge = this.batcher.finalize();
    lap('merge');
    // ---- forest trunks near the road block walking too ---------------------------------------
    for (const c of world.forest?.colliders || []) {
      colliders.addCircle(c.x, c.z, c.r, { tag: TAG });
      this.colliderCount++;
    }
    this.group.updateMatrixWorld(true);
    // ---- lights (after placement: anchors are in their final place) --------------------------
    for (const r of this.results) {
      if (r.lights && r.lights.length) this.lightHandles.push(...P.addPropLights(r));
    }
    lap('lights');
    this.stats = { ms: Math.round(performance.now() - t0), phases: T, ...merge, chunks: this.batcher.list.length, lights: this.lightHandles.length, colliders: this.colliderCount };
    onProgress?.(1);
  }

  // ---------------------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------------------
  /** Position a prop result's object, register its colliders, remember it. */
  _put(result, pos, yaw, opts = {}) {
    const o = result.object;
    o.position.copy(pos);
    o.rotation.set(0, yaw, 0);
    o.updateMatrix();
    if (opts.batch) this.batcher.add(o, pos.x, pos.z);
    else {
      this.group.add(o);
      this.pieces.push({ object: o, x: pos.x, z: pos.z, r: opts.r ?? 30 });
    }
    o.updateMatrixWorld(true);
    if (result.colliders) this._colliders(result.colliders, pos, yaw, opts.colliderSpace === 'world');
    this.results.push(result);
    return result;
  }

  _colliders(list, pos, yaw, worldSpace = false) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const out = [];
    for (const k of list) {
      let x = k.x ?? 0, z = k.z ?? 0, ky = k.yaw ?? 0;
      if (!worldSpace) {
        // local -> world (three.js rotation.y)
        const wx = x * c + z * s, wz = -x * s + z * c;
        x = pos.x + wx;
        z = pos.z + wz;
        ky += yaw;
      }
      if (k.r != null) out.push(colliders.addCircle(x, z, k.r, { tag: TAG }));
      else out.push(colliders.addBox(x, z, k.hx ?? 0.2, k.hz ?? 0.2, ky, { tag: TAG }));
    }
    this.colliderCount += out.length;
    return out;
  }

  /** Collect Object3D anchors (and arrays of them) from a factory result. */
  _anchors(result, into = {}) {
    for (const [k, v] of Object.entries(result)) {
      if (k === 'object') continue;
      if (v && v.isObject3D) into[k] = v;
      else if (Array.isArray(v) && v.length && v[0] && v[0].isObject3D) into[k] = v;
    }
    return into;
  }

  _ground(x, z) {
    return this.world.getHeight(x, z);
  }

  _roadPoint(id, s, lat, out = new THREE.Vector3()) {
    const sp = this.world.road.get(id);
    sp.pointAt(s, lat, out);
    out.y = this.world.terrain ? this.world.terrain.sample(out.x, out.z) : out.y;
    // shoulders sit a hair under the asphalt: keep props on the visible ground
    if (Math.abs(lat) <= W.halfWidth) out.y = this._ground(out.x, out.z);
    return out;
  }

  // ---------------------------------------------------------------------------------------
  // landmarks
  // ---------------------------------------------------------------------------------------
  _buildLandmark(lm) {
    const world = this.world;
    const road = world.road;
    const sp = road.get(lm.roadRef.id);
    const pos = lm.pos.clone();
    const yaw = lm.yaw;
    const seedOf = (k) => 7 + [...k].reduce((a, c) => a + c.charCodeAt(0), 0);
    const seed = seedOf(lm.key);
    const add = (result, p = pos, y = yaw, opts = {}) => this._put(result, p, y, opts);
    let main = null;
    const extra = [];
    switch (lm.kind) {
      case 'garage':
        main = add(P.createGarage({ seed }));
        break;
      case 'km_marker':
        main = add(P.createSignPost('km_marker', { km: lm.spec.km, seed }), pos, lm.travelYaw, { batch: true });
        break;
      case 'sala':
        main = add(P.createSala({ variant: lm.spec.variant || 1, seed }));
        break;
      case 'spirit_cluster': {
        // a row of old spirit houses retired under a tree ("spirit house graveyard")
        const styles = ['thai', 'chinese', 'twin', 'thai', 'thai'];
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * 1.25;
          const p = pos.clone().addScaledVector(right, off);
          p.y = this._ground(p.x, p.z);
          const r = add(P.createSpiritHouse({ style: styles[i], size: 0.75 + (i % 2) * 0.2, seed: seed + i, age: 0.9 }), p, yaw + (i - 1.5) * 0.08);
          if (!main) main = r;
          else extra.push(r);
        }
        const z1 = pos.clone().addScaledVector(right, -2.6);
        z1.y = this._ground(z1.x, z1.z);
        extra.push(add(P.createDressing('zebra_statues', { seed: seed + 9 }), z1, yaw + 0.3));
        const z2 = pos.clone().addScaledVector(right, 2.6);
        z2.y = this._ground(z2.x, z2.z);
        extra.push(add(P.createDressing('red_soda_bottles', { seed: seed + 10 }), z2, yaw));
        break;
      }
      case 'sacred_tree':
        main = this._sacredTree(lm, seed);
        break;
      case 'accident_curve': {
        main = add(P.createAccidentMemorial({ seed }));
        world.memorialHelmet = main.helmetAnchor || main.helmet || null;
        break;
      }
      case 'buddha_statue':
        main = add(P.createBuddhaStatue({ pose: 'seated', broken: true, moss: 1, seed, size: 1.15 }));
        break;
      case 'bridge': {
        const T = world.terrain;
        const depth = T?.creek ? Math.max(2.5, lm.roadHeight - (T.creek.W0 - T.creek.depth) + 0.2) : 3.6;
        const p = sp.pointAt(lm.roadRef.s, 0);
        main = add(P.createBridge({ length: lm.spec.length || 26, width: 7.4, depth, seed }), p, lm.travelYaw, { r: 40 });
        break;
      }
      case 'pond':
        main = add(P.createPond({ seed, radius: 6 }));
        break;
      case 'noodle_shop':
        main = add(P.createNoodleStall({ seed }));
        world.noodleCounter = main.counterAnchor || null;
        break;
      case 'bus_stop':
        main = add(P.createBusStop({ seed }));
        break;
      case 'banana_grove':
        main = this._nangTani(lm, seed);
        break;
      case 'forest_temple':
        main = add(P.createForestTemple({ seed }), pos, yaw, { r: 40 });
        break;
      case 'elephant_crossing': {
        // the sign is planned as dressing; the landmark records the trail across the road
        const s = lm.roadRef.s;
        const a = sp.pointAt(s - 1.5, -(W.halfWidth + 26)), b = sp.pointAt(s + 1.5, W.halfWidth + 26);
        a.y = this._ground(a.x, a.z);
        b.y = this._ground(b.x, b.z);
        lm.anchors.trailL = a;
        lm.anchors.trailR = b;
        lm.anchors.crossing = sp.pointAt(s, 0);
        lm.trail = { from: b.clone(), to: a.clone(), roadS: s };
        break;
      }
      case 'market_crossroad': {
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // along the road (prop local +X)
        const toRoad = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // local +Z
        // the lamp stands at the road edge, arm over the road (travel yaw: +X = right = road)
        const lp = sp.pointAt(lm.roadRef.s - 2, -(W.halfWidth + 0.9));
        lp.y = this._ground(lp.x, lp.z);
        main = add(P.createStreetlight({ kind: 'sodium', seed, height: 6.6 }), lp, lm.travelYaw, { r: 30 });
        const stuff = [
          ['crate', -2.6, -1.2, 0.2], ['crate', -2.0, -1.6, -0.4], ['plastic_stool', -0.6, -0.6, 0], ['plastic_stool', 0.3, -1.1, 1],
          ['plastic_chair', 1.6, -0.8, 2.6], ['water_jar', 2.8, -1.8, 0], ['trash_bag', 3.4, -0.9, 0], ['oil_drum', -3.4, -2.2, 0], ['cable_coil', 1.0, -2.4, 0],
        ];
        stuff.forEach(([k, x, z, r], i) => {
          const p = pos.clone().addScaledVector(right, x).addScaledVector(toRoad, z);
          p.y = this._ground(p.x, p.z);
          extra.push(add(P.createDressing(k, { seed: seed + i }), p, yaw + r, { batch: true }));
        });
        const sgp = pos.clone().addScaledVector(right, -4.6).addScaledVector(toRoad, 0.8);
        sgp.y = this._ground(sgp.x, sgp.z);
        extra.push(add(P.createSignPost('shop_sign', { th: 'ตลาดเช้า', en: 'MORNING MARKET', seed: seed + 20 }), sgp, yaw, { batch: true }));
        break;
      }
      case 'lone_streetlight': {
        const lp = sp.pointAt(lm.roadRef.s, -(W.halfWidth + 1.0));
        lp.y = this._ground(lp.x, lp.z);
        main = add(P.createStreetlight({ kind: 'sodium', seed, height: 7.2 }), lp, lm.travelYaw, { r: 30 });
        lm.anchors.lamp = main.lampAnchor;
        break;
      }
      case 'shrine_approach':
        // lantern strings across the road are built with the poles (see _buildDressing)
        break;
      case 'shrine_maruay': {
        const so = lm.shrineOpts || {};
        main = add(P.createShrineMaRuay({ seed: 9, setback: so.setback, noseZ: so.noseZ, handSpawn: so.handSpawn }), pos, yaw, { r: 60 });
        break;
      }
      case 'ghost_gate': {
        const p = sp.pointAt(lm.roadRef.s, 0);
        p.y = lm.roadHeight;
        main = add(P.createGhostGate({ seed, width: 9.5 }), p, lm.travelYaw, { r: 30 });
        break;
      }
      case 'village_stop':
        main = add(P.createVillageStop({ seed }), pos, yaw, { r: 50 });
        break;
      case 'spirit_house':
        main = add(P.createSpiritHouse({ style: 'thai', seed, age: 0.8 }), pos, yaw, { r: 25 });
        break;
      case 'junction':
      case 'spur_start':
      default:
        break;
    }
    if (main) {
      lm.prop = main;
      this._anchors(main, lm.anchors);
      if (extra.length) lm.props = [main, ...extra];
    }
  }

  /** Giant sacred tree (ต้นตะเคียน / ต้นไทร) wrapped in tri-colour cloth, offerings at its feet. */
  _sacredTree(lm, seed) {
    const world = this.world;
    const forest = world.forest || this._miniForest();
    const species = { sacredTree1: 'dipterocarp', sacredTree2: 'banyan', sacredTree3: 'rainTree' }[lm.key] || 'banyan';
    const tree = forest.makeSingle(species, seed % 3, 9000 + seed, { scale: species === 'dipterocarp' ? 1.15 : 1.05 });
    const built = tree.userData.built;
    // the trunk stands a little back; offerings face the road (prop +Z)
    const pos = lm.pos.clone();
    pos.y = this._ground(pos.x, pos.z) - 0.05;
    tree.position.copy(pos);
    tree.rotation.y = seed;
    tree.updateMatrix();
    tree.name = 'sacredTree_' + lm.key;
    this.group.add(tree);
    this.pieces.push({ object: tree, x: pos.x, z: pos.z, r: 40 });
    // trunk radius at chest height from the actual bark geometry
    const y0 = 1.0, y1 = 1.9;
    const r = trunkRadius(built.lods[0], y0, y1) || built.trunkR || 0.9;
    const wrap = P.createClothWrap(r, y0, y1, { seed: seed + 3 });
    wrap.position.copy(pos);
    wrap.rotation.y = lm.yaw;
    tree.parent.add(wrap);
    this.pieces.push({ object: wrap, x: pos.x, z: pos.z, r: 30 });
    colliders.addCircle(pos.x, pos.z, Math.max(0.6, r * 0.95), { tag: TAG });
    this.colliderCount++;
    // offerings in front of the trunk, toward the road
    const fwd = new THREE.Vector3(Math.sin(lm.yaw), 0, Math.cos(lm.yaw));
    const side = new THREE.Vector3(Math.cos(lm.yaw), 0, -Math.sin(lm.yaw));
    const at = (f, s2) => {
      const p = pos.clone().addScaledVector(fwd, r + f).addScaledVector(side, s2);
      p.y = this._ground(p.x, p.z);
      return p;
    };
    const sh = this._put(P.createSpiritHouse({ style: 'thai', size: 0.85, seed: seed + 5, age: 0.85 }), at(1.1, -1.1), lm.yaw, { r: 30 });
    const list = [['zebra_statues', 0.5, 0.6], ['red_soda_bottles', 0.4, 1.3], ['thai_dancer_figurine', 0.35, -0.2], ['offering_tray', 0.6, 0.1], ['candles', 0.45, 0.9], ['garland', 0, 0]];
    list.forEach(([k, f, s2], i) => {
      if (k === 'garland') return;
      this._put(P.createDressing(k, { seed: seed + 11 + i }), at(f, s2), lm.yaw + (i - 2) * 0.2, { r: 30 });
    });
    const result = { object: tree, tree, clothWrap: wrap, spiritHouse: sh, trunkRadius: r, colliders: [] };
    lm.anchors.offering = sh.offeringAnchor || null;
    lm.anchors.incense = sh.incenseAnchor || null;
    return result;
  }

  /** Banana grove: one old banana plant wrapped in cloth for นางตานี, offerings at its foot. */
  _nangTani(lm, seed) {
    const forest = this.world.forest || this._miniForest();
    const tree = forest.makeSingle('banana', 1, 7000 + seed, { scale: 1.2 });
    const pos = lm.pos.clone();
    pos.y = this._ground(pos.x, pos.z) - 0.03;
    tree.position.copy(pos);
    tree.rotation.y = seed * 0.37;
    tree.updateMatrix();
    tree.name = 'nangTaniBanana';
    this.group.add(tree);
    this.pieces.push({ object: tree, x: pos.x, z: pos.z, r: 30 });
    const r = trunkRadius(tree.userData.built.lods[0], 0.5, 1.1, 0.6) || 0.17;
    const wrap = P.createClothWrap(r, 0.55, 1.05, { seed: seed + 1, colors: [0xd84a7a, 0xe0b830, 0x2a9a5a] });
    wrap.position.copy(pos);
    wrap.rotation.y = lm.yaw;
    this.group.add(wrap);
    this.pieces.push({ object: wrap, x: pos.x, z: pos.z, r: 25 });
    const fwd = new THREE.Vector3(Math.sin(lm.yaw), 0, Math.cos(lm.yaw));
    const p = pos.clone().addScaledVector(fwd, r + 0.45);
    p.y = this._ground(p.x, p.z);
    const tray = this._put(P.createDressing('offering_tray', { seed: seed + 2 }), p, lm.yaw, { r: 25 });
    const p2 = pos.clone().addScaledVector(fwd, r + 0.4).add(new THREE.Vector3(Math.cos(lm.yaw) * 0.5, 0, -Math.sin(lm.yaw) * 0.5));
    p2.y = this._ground(p2.x, p2.z);
    this._put(P.createDressing('candles', { seed: seed + 3 }), p2, lm.yaw, { r: 25 });
    colliders.addCircle(pos.x, pos.z, 0.3, { tag: TAG });
    this.colliderCount++;
    return { object: tree, tree, clothWrap: wrap, offering: tray.object, colliders: [] };
  }

  _miniForest() {
    if (this._mf) return this._mf;
    // the world was built without a forest: a material-only forest for single hero plants
    // (Forest is imported lazily by World; reuse its class through the module cache)
    throw new Error('sacred trees need world.forest');
  }

  // ---------------------------------------------------------------------------------------
  // dressing
  // ---------------------------------------------------------------------------------------
  async _buildDressing(onProgress) {
    const world = this.world, road = world.road;
    const items = this.items;
    const poleTemplates = new Map();
    const tplFor = (it) => {
      const k = (it.transformer ? 't' : 'p') + (it.seed % 4);
      let t = poleTemplates.get(k);
      if (!t) {
        t = P.createElectricPole({ seed: 1000 + poleTemplates.size * 13, transformer: it.transformer, height: 8.6 + (it.seed % 4) * 0.35, crossArms: it.seed % 4 === 3 ? 1 : 2 });
        poleTemplates.set(k, t);
      }
      return t;
    };
    const chains = new Map();
    const tmpP = new THREE.Vector3();
    let n = 0;
    for (const it of items) {
      n++;
      if (n % 12 === 0) {
        onProgress?.(n / items.length);
        await yieldFrame();
      }
      const sp = road.get(it.id);
      try {
        switch (it.type) {
          case 'pole': {
            const p = this._roadPoint(it.id, it.s, it.lat, new THREE.Vector3());
            const yaw = sp.yawAt(it.s);
            let res;
            if (it.lamp) {
              res = P.createElectricPole({ seed: it.seed, transformer: it.transformer, lamp: it.lamp, lampSide: it.side < 0 ? 1 : -1, height: 9 });
            } else {
              const t = tplFor(it);
              res = { object: t.object.clone(true), wireAnchors: t.wireAnchors, wireKinds: t.wireKinds, colliders: t.colliders, lights: null };
            }
            // flip plain poles randomly (arms/insulators face either way)
            const flip = !it.lamp && it.seed % 2 === 1 ? Math.PI : 0;
            this._put(res, p, yaw + flip, { batch: true });
            const prev = chains.get(it.chain);
            if (prev && prev.object.position.distanceTo(p) < 75) {
              const span = P.connectPoles(prev, res, { seed: it.seed, messy: 0.8 + ((it.seed * 7) % 10) / 12 });
              span.name = 'wires';
              const mx = (prev.object.position.x + p.x) / 2, mz = (prev.object.position.z + p.z) / 2;
              this.batcher.add(span, mx, mz);
            }
            chains.set(it.chain, res);
            if (it.lantern) {
              // bare post opposite + a string of red lanterns across the road (shrine approach)
              const q = this._roadPoint(it.id, it.s, -it.lat, new THREE.Vector3());
              const post = P.createElectricPole({ seed: it.seed + 1, crossArms: 0, telecom: false, height: 6.5, meters: false, coils: false });
              this._put(post, q, yaw, { batch: true });
              const a = p.clone(), b = q.clone();
              a.y += 5.7;
              b.y += 5.7;
              const ls = P.createLanternString(a, b, { count: 9, sag: 1.0, seed: it.seed, size: 1.05, lightEvery: 3 });
              this.batcher.add(ls.object, (p.x + q.x) / 2, (p.z + q.z) / 2);
              this.results.push(ls);
            }
            break;
          }
          case 'spirit': {
            const p = this._roadPoint(it.id, it.s, it.lat, new THREE.Vector3());
            const yaw = faceRoadYaw(sp.yawAt(it.s), it.side < 0 ? 'L' : 'R');
            this._put(P.createSpiritHouse({ style: it.style, seed: it.seed, size: 0.8 + (it.seed % 5) * 0.06, age: 0.75 }), p, yaw, { batch: true });
            break;
          }
          case 'sign': {
            const p = this._roadPoint(it.id, it.s, it.lat, new THREE.Vector3());
            const ty = sp.yawAt(it.s);
            const yaw = it.face === 'back' ? ty + Math.PI : ty;
            this._put(P.createSignPost(it.kind, { ...it.opts, seed: it.seed }), p, yaw + (((it.seed * 13) % 7) - 3) * 0.03, { batch: true });
            break;
          }
          case 'mirror': {
            const p = this._roadPoint(it.id, it.s, it.lat, new THREE.Vector3());
            const yaw = faceRoadYaw(sp.yawAt(it.s), it.side < 0 ? 'L' : 'R');
            this._put(P.createConvexMirror({ seed: it.seed }), p, yaw, { batch: true });
            break;
          }
          case 'clutter': {
            const p = this._roadPoint(it.id, it.s, it.lat, new THREE.Vector3());
            const yaw = faceRoadYaw(sp.yawAt(it.s), it.side < 0 ? 'L' : 'R') + ((it.seed * 1.7) % 6.28);
            this._put(P.createDressing(it.kind, { seed: it.seed, fallen: it.seed % 3 === 0 }), p, yaw, { batch: true });
            break;
          }
          case 'guardrail': {
            const pts = [];
            const lat = it.side * (W.halfWidth + 0.45);
            const s0 = Math.max(1, it.s0), s1 = Math.min(sp.length - 1, it.s1);
            for (let s = s0; s <= s1 + 1e-3; s += 2) {
              sp.pointAt(Math.min(s, s1), lat, tmpP);
              tmpP.y = Math.min(sp.heightAt(s) - 0.04, this._ground(tmpP.x, tmpP.z) + 0.02);
              pts.push(tmpP.clone());
            }
            if (pts.length < 2) break;
            const res = P.createGuardrail(pts, { seed: it.seed, damaged: it.damaged, faceSide: it.side < 0 ? 1 : -1, lampEvery: it.lampEvery ?? 2 });
            const mid = pts[Math.floor(pts.length / 2)];
            this.batcher.add(res.object, mid.x, mid.z);
            this._colliders(res.colliders, mid, 0, true);
            this.results.push(res);
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error('[world] dressing', it.type, it.kind || '', 'failed', e);
      }
    }
  }

  // =====================================================================================
  update(dt, focus) {
    const dd = this.world.drawDistance ?? 150;
    this.batcher.update(focus, dd + 10);
    for (const p of this.pieces) {
      const d = Math.hypot(p.x - focus.x, p.z - focus.z) - p.r;
      p.object.visible = d < dd;
    }
  }

  dispose() {
    for (const h of this.lightHandles) h.remove?.();
    this.lightHandles = [];
    colliders.removeTag(TAG);
    this.group.traverse((o) => o.geometry?.dispose?.());
    this.group.removeFromParent();
  }
}

/** Typical horizontal radius of a trunk between y0..y1 measured from the bark geometry. */
function trunkRadius(parts, y0, y1, maxR = 3) {
  const geos = [parts.bark, parts.banyanBark, parts.stem].filter(Boolean);
  const rs = [];
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < y0 || y > y1) continue;
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r < maxR) rs.push(r);
    }
  }
  if (!rs.length) return 0;
  rs.sort((a, b) => a - b);
  return rs[Math.floor(rs.length * 0.9)];
}

export { LANDMARK_NAMES };
