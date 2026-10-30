// World: road network + terrain + forest + placed props (contract: docs/ARCHITECTURE.md "world").
import * as THREE from 'three';
import { LAYOUT } from './layout.js';
import { RoadSpline, RoadNetwork } from './Road.js';
import { generateRoadLayout } from './RoadGen.js';
import { Terrain } from './Terrain.js';
import { buildRoadMeshes } from './RoadMesh.js';
import { createTerrainMaterial, createWaterMaterial } from './worldMaterials.js';
import { planLandmarks } from './Plan.js';
import { W } from './constants.js';
import { settings } from '../core/Settings.js';
import { tex } from '../textures/index.js';
import { sampleTextureRed } from './shaderUtil.js';
import { Ambience } from './Ambience.js';

export { RoadSpline, RoadNetwork };

const _v = new THREE.Vector3();
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.road = new RoadNetwork();
    this.landmarks = {};
    this.pickups = {};
    this.fork = null;
    this.terrain = null;
    this.forest = null;
    this.placement = null;
    this.layout = LAYOUT;
    this.roadPieces = [];
    /** Object3D of the cracked helmet at the Hundred Corpses Curve memorial (memory m_helmet). */
    this.memorialHelmet = null;
    /** Object3D on the counter of Auntie Lek's noodle stall (memory m_noodle). */
    this.noodleCounter = null;
    this.buildTimes = {};
    this.drawDistance = settings.get('drawDistance') ?? 150;
    this.density = settings.get('foliageDensity') ?? 1;
    this._pr = null;
    this._focus = new THREE.Vector3(1e9, 0, 1e9);
    this.built = false;
  }

  /** Build everything. opts: { onProgress(fraction, label{th,en}), quality, forest=true, props=true } */
  async build(opts = {}) {
    const prog = (f, th, en) => opts.onProgress?.(f, { th, en });
    const t0 = performance.now();
    let tl = t0;
    const lap = (k) => {
      const n = performance.now();
      this.buildTimes[k] = Math.round(n - tl);
      tl = n;
    };
    prog(0.01, 'กำลังวางเส้นทาง…', 'Laying out the roads…');
    // ---- roads ------------------------------------------------------------------------
    const gen = generateRoadLayout(LAYOUT);
    this.layoutMeta = gen.meta;
    for (const id of ['main', 'ghost', 'human', 'spur']) {
      const g = gen.splines[id];
      const sp = new RoadSpline(id, g.points);
      sp.curvature = g.curvature;
      sp.meta.tags = g.tags;
      this.road.add(sp);
    }
    const L = this.road.length('main');
    const sJ = LAYOUT.landmarks.spurJunction.u * L;
    this.road.connections.push(
      { kind: 'fork', a: { id: 'main', s: L }, b: { id: 'ghost', s: 0 } },
      { kind: 'fork', a: { id: 'main', s: L }, b: { id: 'human', s: 0 } },
      { kind: 'merge', a: { id: 'ghost', s: this.road.length('ghost') }, b: { id: 'main', s: 0 } },
      { kind: 'merge', a: { id: 'human', s: this.road.length('human') }, b: { id: 'main', s: 0 } },
      { kind: 'junction', a: { id: 'spur', s: this.road.length('spur') }, b: { id: 'main', s: sJ } },
    );
    this.features = gen.meta.features.map((f) => ({ ...f }));
    lap('roadgen');
    await yieldFrame();

    // ---- plan landmarks (pads / clearings needed by terrain & forest) --------------------
    const plan = planLandmarks(this.road, LAYOUT);
    this.plan = plan;
    this.fork = plan.fork;
    const { Placement } = await import('./Placement.js');
    if (opts.props !== false) {
      this.placement = new Placement(this);
      this.placement.plan(plan); // dressing positions -> terrain pads + forest clearings
    }
    lap('plan');

    // ---- terrain ------------------------------------------------------------------------
    prog(0.05, 'กำลังปั้นภูเขา…', 'Shaping the hills…');
    this.terrain = new Terrain(this.road, LAYOUT, { material: createTerrainMaterial() });
    for (const p of plan.pads) this.terrain.addPad(p);
    // ravine below the outside (left) of the Hundred Corpses Curve
    const acc = this.features.find((f) => f.tag === 'accident');
    if (acc) {
      const main = this.road.get('main');
      const sa = (acc.s0 + acc.s1) / 2;
      const c = main.pointAt(sa, -(W.halfWidth + 26));
      this.terrain.addMod(c.x, c.z, 42, -10 * (LAYOUT.elevationRange / 18));
    }
    this.terrain.prepare();
    // hidden pond: the prop's water sits on flat ground inside a low rim -> flatten (radius * 1.4)
    const pond = plan.landmarks.hiddenPond;
    if (pond) {
      const hp = this.terrain.heightRaw(pond.pos.x, pond.pos.z);
      this.terrain.addPad({ x: pond.pos.x, z: pond.pos.z, hx: 8.6, hz: 8.6, yaw: pond.yaw, h: hp, blend: 5, kind: 'dirt' });
      this.terrain.addPond(pond.pos.x, pond.pos.z, 6.5, 0); // wet mud + keeps trees out of the water
    }
    await yieldFrame();
    await this.terrain.build((f) => prog(0.06 + f * 0.3, 'กำลังปั้นภูเขา…', 'Shaping the hills…'));
    this.group.add(this.terrain.group);
    lap('terrain');

    // ---- road surfaces & water ---------------------------------------------------------------
    prog(0.37, 'กำลังราดยางมะตอย…', 'Paving the old road…');
    const roads = buildRoadMeshes(this.road, LAYOUT);
    this.roadPieces = roads.pieces;
    this.roadMaterials = roads.materials;
    this.group.add(roads.group);
    this.waterMaterial = createWaterMaterial();
    const creek = this.terrain.buildCreekWater(this.waterMaterial);
    if (creek) this.group.add(creek);
    lap('roads');
    await yieldFrame();

    // ---- landmark ground heights ---------------------------------------------------------------
    for (const lm of Object.values(plan.landmarks)) {
      lm.pos.y = lm.sideSign === 0 && lm.kind !== 'shrine_maruay' ? lm.roadHeight + 0.025 : this.getHeight(lm.pos.x, lm.pos.z);
      lm.waitPos.y = this.getHeight(lm.waitPos.x, lm.waitPos.z);
    }
    this.landmarks = plan.landmarks;
    for (const k of LAYOUT.pickups) this.pickups[k] = this.landmarks[k];

    // ---- forest --------------------------------------------------------------------------------
    if (opts.forest !== false) {
      const { Forest } = await import('./Forest.js');
      this.forest = new Forest(this, { density: this.density });
      await this.forest.build((f, th, en) => prog(0.4 + f * 0.4, th || 'กำลังปลูกป่า…', en || 'Growing the forest…'));
      this.group.add(this.forest.group);
      lap('forest');
    }

    // ---- props & landmarks ---------------------------------------------------------------------
    if (this.placement) {
      await this.placement.build((f) => prog(0.82 + f * 0.16, 'กำลังตั้งศาลและเสาไฟ…', 'Raising shrines and poles…'));
      this.group.add(this.placement.group);
      const sm = this.landmarks.shrineMaRuay;
      if (sm) this.fork.shrine = sm.prop;
      lap('props');
    }
    this.group.updateMatrixWorld(true);
    // foliage particles (falling leaves, gusts, spores, fireflies, moths); world.ambience.setEnabled(false) to mute
    if (opts.ambience !== false) this.ambience = new Ambience(this);

    this._settingsOff = settings.onChange(({ key }) => {
      if (key === 'foliageDensity' || key === 'graphicsPreset' || key === '*') this.setDensity(settings.get('foliageDensity') ?? 1);
      if (key === 'drawDistance' || key === 'graphicsPreset' || key === '*') this.drawDistance = settings.get('drawDistance') ?? 150;
    });
    this.built = true;
    this.buildMs = performance.now() - t0;
    prog(1, 'พร้อมแล้ว', 'Ready');
    return this;
  }

  /** Ground / road surface height at x,z. The asphalt surface wins on the road. */
  getHeight(x, z) {
    _v.set(x, 0, z);
    const pr = (this._pr = this.road.project(_v, null, this._pr));
    const hw = pr.width / 2;
    if (pr.distance <= hw) {
      const f = pr.lateral / hw;
      let crown = 0.04 * (1 - f * f);
      // crown fades out near junction ends (matches RoadMesh)
      const sp = this.road.get(pr.id);
      const d = Math.min(pr.s, sp.length - pr.s);
      if (pr.id === 'main') crown *= Math.min(1, d / 40);
      else if (pr.id === 'spur') crown *= Math.min(1, Math.max(0, (sp.length - pr.s - 12) / 25));
      else crown *= Math.min(1, Math.max(0, (d - 30) / 30));
      return pr.y + 0.025 + crown;
    }
    return this.terrain ? this.terrain.sample(x, z) : pr.y;
  }

  /** Footstep surface at x,z: 'asphalt'|'gravel'|'grass'|'wood'|'concrete'|'puddle'. */
  surfaceAt(x, z) {
    _v.set(x, 0, z);
    const pr = (this._pr = this.road.project(_v, null, this._pr));
    const hw = pr.width / 2;
    if (pr.distance <= hw - 0.1) {
      if (pr.id === 'main' && this.terrain?.creek && Math.abs(pr.s - this.terrain.creek.sB) < (this.terrain.bridgeLen || 26) / 2) return 'concrete';
      if (this._isPuddle(pr.lateral, pr.s)) return 'puddle';
      return 'asphalt';
    }
    // pads (set pieces)
    if (this.terrain) {
      for (const p of this.terrain.pads) {
        const dx = x - p.x, dz = z - p.z;
        if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
        const ux = dx * p.cos - dz * p.sin, uz = dx * p.sin + dz * p.cos;
        if (Math.abs(ux) <= p.hx && Math.abs(uz) <= p.hz) return p.kind === 'concrete' ? 'concrete' : 'gravel';
      }
    }
    if (pr.distance <= hw + W.shoulder + 0.3) return 'gravel';
    return 'grass';
  }

  _isPuddle(lat, s) {
    const wet = 0.6;
    if (!this._puddleTex) this._puddleTex = tex('puddle_mask');
    const a = sampleTextureRed(this._puddleTex, lat * 0.105 + 0.31, s * 0.043);
    const b = sampleTextureRed(this._puddleTex, lat * 0.071 + 0.62, s * 0.021 + 0.5);
    if (a == null) return false;
    const hw = W.halfWidth;
    const aLat = Math.abs(lat);
    const sm = (e0, e1, x) => Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    const rut = [-2.3, -0.8, 0.8, 2.3].reduce((acc, c) => acc + Math.exp(-(((lat - c) / 0.38) ** 2)), 0);
    const prof = 0.42 + 0.5 * sm(hw - 1.5, hw - 0.4, aLat) + 0.28 * rut;
    const pv = Math.max(a, b * 0.92) * prof;
    const thr = 0.86 + (0.5 - 0.86) * wet;
    return pv > thr + 0.025;
  }

  /** Streaming / culling / LOD / wind. focus = Vector3 (camera or taxi). */
  update(dt, focus) {
    if (!this.built || !focus) return;
    const dd = this.drawDistance;
    if (this.terrain) this.terrain.update(focus, dd);
    for (const p of this.roadPieces) {
      const d = Math.hypot(p.cx - focus.x, p.cz - focus.z) - p.r;
      p.mesh.visible = d < dd + 20;
    }
    if (this.waterMaterial?.userData.flow) this.waterMaterial.userData.flow.offset.y -= dt * 0.12;
    if (this.forest) this.forest.update(dt, focus);
    if (this.placement) this.placement.update(dt, focus);
    if (this.ambience) this.ambience.update(dt, focus);
  }

  /** Foliage density multiplier (settings.foliageDensity). */
  setDensity(f) {
    this.density = f;
    if (this.forest) this.forest.setDensity(f);
  }

  dispose() {
    this._settingsOff?.();
    this.ambience?.dispose();
    this.placement?.dispose?.();
    this.forest?.dispose?.();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.group.removeFromParent();
  }
}
