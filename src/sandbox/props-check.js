// Props contract check (no real rendering): builds every factory with several option sets,
// verifies every documented anchor/field, counts meshes/materials/triangles and reports errors.
//   node tools/shot.mjs --sandbox=props-check --size=320x180 --frames=1 --eval="return window.__propsCheck"
import * as THREE from 'three';
import * as P from '../props/index.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const isObj = (v) => v && v.isObject3D;
const isArr = (v) => Array.isArray(v);

// name -> [build fn, required fields (Object3D unless suffixed: [] array, :v Vector3[], :any)]
const CASES = {
  pole: [() => P.createElectricPole({ seed: 3, transformer: true, lamp: 'fluorescent' }), ['wireAnchors:v', 'wireKinds:any', 'lampAnchor', 'lightSpec:any', 'lights[]', 'colliders[]', 'transformerAnchor', 'humAnchor', 'topAnchor', 'lampControllers[]']],
  pole_plain: [() => P.createElectricPole({ seed: 8 }), ['wireAnchors:v', 'colliders[]', 'humAnchor', 'topAnchor']],
  pole_dying: [() => P.createElectricPole({ seed: 9, lamp: 'dying', lean: 0.06 }), ['wireAnchors:v', 'lampAnchor']],
  streetlight_sodium: [() => P.createStreetlight({ kind: 'sodium' }), ['lampAnchor', 'lightSpec:any', 'lights[]', 'colliders[]', 'lampControllers[]']],
  streetlight_fluoro: [() => P.createStreetlight({ kind: 'fluorescent', broken: true }), ['lampAnchor']],
  spirit_thai: [() => P.createSpiritHouse({ style: 'thai', seed: 3 }), ['incenseAnchor', 'candleAnchor', 'candleAnchors[]', 'offeringAnchor', 'smokeAnchor', 'groundOfferingAnchor', 'lights[]', 'colliders[]']],
  spirit_chinese: [() => P.createSpiritHouse({ style: 'chinese', seed: 4 }), ['incenseAnchor', 'candleAnchor', 'offeringAnchor', 'smokeAnchor']],
  spirit_twin: [() => P.createSpiritHouse({ style: 'twin', seed: 5, offerings: false }), ['incenseAnchor', 'candleAnchor', 'offeringAnchor']],
  sala1: [() => P.createSala({ variant: 1 }), ['seats[]', 'waitSpot', 'lampAnchor', 'lightSpec:any', 'lights[]', 'colliders[]', 'shadowSpots[]', 'clockAnchor', 'floorHeight:any', 'walkSurfaces[]']],
  sala2: [() => P.createSala({ variant: 2, seed: 2 }), ['seats[]', 'waitSpot', 'lampAnchor']],
  shrine: [() => P.createShrineMaRuay({}), ['statueAnchor', 'statueFaceAnchor', 'statueHead', 'altarAnchor', 'lanternAnchors[]', 'incenseAnchors[]', 'smokeAnchors[]', 'leftSignAnchor', 'rightSignAnchor', 'handSpawnAnchor', 'burnerAnchor', 'furnaceAnchor', 'forecourtAnchor', 'colliders[]', 'lights[]', 'footprint:any', 'walkSurfaces[]']],
  lanternString: [() => P.createLanternString(V(0, 3, 0), V(6, 3, 0), { count: 6 }), ['lanternAnchors[]', 'lights[]']],
  garage: [() => P.createGarage({}), ['oldManSeat', 'guestSeat', 'taxiSpot', 'bikeSpot', 'playerArrive', 'tableAnchor', 'keysAnchor', 'ashtrayAnchor', 'lampAnchor', 'lightSpec:any', 'lights[]', 'colliders[]', 'altarAnchor', 'smokeAnchor', 'radioAnchor', 'fanAnchor', 'fanBlades', 'fanOn:any', 'calendarAnchor', 'dogBowlAnchor', 'mosquitoCoilAnchor', 'lampControllers[]', 'walkSurfaces[]']],
  busstop: [() => P.createBusStop({ seed: 2 }), ['waitSpot', 'seats[]', 'lampAnchor', 'lightSpec:any', 'lights[]', 'colliders[]']],
  noodle: [() => P.createNoodleStall({ seed: 3 }), ['vendorSpot', 'customerSpots[]', 'counterAnchor', 'lampAnchor', 'lampAnchors[]', 'steamAnchor', 'tables[]', 'lights[]', 'colliders[]']],
  bridge: [() => P.createBridge({}), ['colliders[]', 'deckY:any', 'railAnchors[]', 'nameAnchor']],
  guardrail: [() => { const pts = []; for (let i = 0; i <= 24; i++) pts.push(V(Math.sin(i * 0.05) * 6, 0, -i * 2)); return P.createGuardrail(pts, { seed: 2, damaged: true }); }, ['lampAnchors[]', 'lights[]', 'colliders[]']],
  buddha: [() => P.createBuddhaStatue({ broken: true }), ['headAnchor', 'offeringAnchor', 'candleAnchors[]', 'lights[]', 'colliders[]']],
  buddha_standing: [() => P.createBuddhaStatue({ pose: 'standing' }), ['headAnchor']],
  temple: [() => P.createForestTemple({}), ['gateAnchor', 'waitSpot', 'bellAnchor', 'buddhaAnchor', 'candleAnchors[]', 'lights[]', 'colliders[]', 'walkSurfaces[]']],
  memorial: [() => P.createAccidentMemorial({}), ['waitSpot', 'helmetAnchor', 'helmet', 'candleAnchors[]', 'smokeAnchor', 'lights[]', 'colliders[]']],
  ghostgate: [() => P.createGhostGate({}), ['walkTarget', 'gateCenter', 'lanternAnchors[]', 'lights[]', 'colliders[]']],
  village: [() => P.createVillageStop({}), ['walkTarget', 'waitSpot', 'windowAnchor', 'lampAnchor', 'seats[]', 'lights[]', 'colliders[]']],
  mirror: [() => P.createConvexMirror({}), ['mirrorAnchor', 'mirror', 'colliders[]']],
  incense: [() => P.createIncensePot({}), ['smokeAnchor', 'colliders[]']],
  pond: [() => P.createPond({}), ['waterMesh', 'waterLevel:any', 'colliders[]']],
};
const SIGN_KINDS = ['km_marker', 'curve_warning', 'elephant_crossing', 'speed_sign', 'warning_sign', 'bus_stop_sign', 'village_sign', 'temple_sign', 'fork_sign', 'shop_sign', 'garage_sign', 'shrine_board', 'noodle_menu', 'poster', 'calendar'];

function stats(obj) {
  let meshes = 0, tris = 0;
  const mats = new Set();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    for (const a of ['position', 'normal']) {
      const arr = g.attributes[a]?.array;
      if (arr) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`NaN in ${o.name} ${a}`);
    }
  });
  return { meshes, mats: mats.size, tris: Math.round(tris) };
}

function check(name, r, req) {
  const missing = [];
  if (!r || !isObj(r.object)) missing.push('object');
  for (const f of req) {
    const [key, kind] = f.endsWith('[]') ? [f.slice(0, -2), 'arr'] : f.includes(':') ? f.split(':') : [f, 'obj'];
    const v = r?.[key];
    if (kind === 'arr' && !isArr(v)) missing.push(f);
    else if (kind === 'v' && !(isArr(v) && v.length && v[0].isVector3)) missing.push(f);
    else if (kind === 'any' && v === undefined) missing.push(f);
    else if (kind === 'obj' && !isObj(v)) missing.push(f);
    // anchors must be inside the prop
    if (kind === 'obj' && isObj(v) && r.object) {
      let p = v, ok = false;
      while (p) { if (p === r.object) { ok = true; break; } p = p.parent; }
      if (!ok) missing.push(f + '(detached)');
    }
  }
  return missing;
}

export default async function ({ engine }) {
  const report = { ok: [], fail: {}, stats: {}, errors: [] };
  const run = (name, fn, req) => {
    try {
      const t0 = performance.now();
      const r = fn();
      const ms = Math.round(performance.now() - t0);
      const miss = check(name, r, req);
      if (miss.length) report.fail[name] = miss;
      else report.ok.push(name);
      report.stats[name] = { ...stats(r.object || r), ms, lights: (r.lights || []).length, colliders: (r.colliders || []).length };
      engine.scene.add(r.object || r);
    } catch (e) {
      report.errors.push(name + ': ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
    }
  };
  for (const [name, [fn, req]] of Object.entries(CASES)) run(name, fn, req);
  for (const k of SIGN_KINDS) run('sign_' + k, () => P.createSignPost(k, { seed: 1 }), ['signAnchor', 'colliders[]']);
  for (const k of P.DRESSING_KINDS) run('dress_' + k, () => P.createDressing(k, { seed: 1 }), ['colliders[]']);
  run('wirespan', () => P.createWireSpan([V(0, 8, 0), V(0.6, 8, 0)], [V(0, 8, -30), V(0.6, 8, -30)], { seed: 2 }), []);
  run('cloth', () => { const o = P.createClothWrap(0.8, 0.8, 1.6, { seed: 2 }); return { object: o }; }, []);
  report.assets = typeof P.loadPropAssets === 'function' ? (P.propAssetsStatus?.() ?? 'present') : 'none';
  window.__propsCheck = report;
  engine.camera.position.set(0, 50, 80);
  engine.camera.lookAt(0, 0, 0);
}
