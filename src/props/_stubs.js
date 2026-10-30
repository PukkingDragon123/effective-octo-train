// Roadside props & set pieces (contract: docs/ARCHITECTURE.md "props").
// TEMPORARY: original stubs, replaced family by family (deleted when done).
// Every factory returns plain data: { object: THREE.Object3D, ...named local anchors }.
// Anchors are THREE.Object3D children of `object` (so they follow when the prop is placed),
// unless documented as Vector3 arrays.
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';

function box(w, h, d, color, y = h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), paintedMaterial({ color }));
  m.position.y = y;
  return m;
}
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}

/** Concrete electric pole. opts {seed, height=9, lean=0, transformer=false, lamp=null|'sodium'|'fluorescent', crossArms=2}
 *  -> { object, wireAnchors: Vector3[] (local, top attachment points), lampAnchor?: Object3D } */
export function createElectricPole(opts = {}) {
  const g = new THREE.Group();
  const h = opts.height ?? 9;
  g.add(box(0.25, h, 0.25, 0x8a8478));
  const wireAnchors = [new THREE.Vector3(-0.6, h - 0.3, 0), new THREE.Vector3(0, h - 0.3, 0), new THREE.Vector3(0.6, h - 0.3, 0)];
  const out = { object: g, wireAnchors };
  if (opts.lamp) out.lampAnchor = anchor(g, 'lamp', 1.2, h - 1.2, 0);
  return out;
}

/** Sagging cable bundle between two world-space anchor lists. opts {sag=0.8, seed, messy=1} -> Object3D */
export function createWireSpan(anchorsA, anchorsB, opts = {}) {
  const g = new THREE.Group();
  const n = Math.min(anchorsA.length, anchorsB.length);
  for (let i = 0; i < n; i++) {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const p = new THREE.Vector3().lerpVectors(anchorsA[i], anchorsB[i], t);
      p.y -= Math.sin(t * Math.PI) * (opts.sag ?? 0.8);
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x111111 })));
  }
  return g;
}

/** Stand-alone streetlight. opts {kind:'sodium'|'fluorescent', height=6} -> { object, lampAnchor } */
export function createStreetlight(opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.18, opts.height ?? 6, 0.18, 0x777777));
  return { object: g, lampAnchor: anchor(g, 'lamp', 1, (opts.height ?? 6) - 0.2, 0) };
}

/** ศาลพระภูมิ / ศาลตายาย. opts {style:'thai'|'chinese'|'twin', size=1, seed, offerings=true, age=0.7}
 *  -> { object, incenseAnchor, candleAnchor, offeringAnchor } */
export function createSpiritHouse(opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.15, 1.4, 0.15, 0xbbbbaa));
  g.add(box(0.7, 0.6, 0.6, 0xc8a050, 1.7));
  return { object: g, incenseAnchor: anchor(g, 'incense', 0, 1.42, 0.35), candleAnchor: anchor(g, 'candle', 0.2, 1.42, 0.35), offeringAnchor: anchor(g, 'offering', -0.2, 1.42, 0.35) };
}

/** ศาลาพักทาง. opts {variant:1|2, seed} -> { object, seats: Object3D[], waitSpot: Object3D, lampAnchor: Object3D, colliders:[{x,z,hx,hz,yaw}] (local) } */
export function createSala(opts = {}) {
  const g = new THREE.Group();
  g.add(box(4, 0.2, 3, 0x777770, 0.1));
  g.add(box(4.6, 0.2, 3.6, 0x6a3a2a, 2.9));
  return { object: g, seats: [anchor(g, 'seat0', -0.8, 0.45, -0.6), anchor(g, 'seat1', 0.8, 0.45, -0.6)], waitSpot: anchor(g, 'wait', 0, 0, 1.2), lampAnchor: anchor(g, 'lamp', 0, 2.7, 0), colliders: [] };
}

/** ศาลเจ้ามารวย set piece at the fork. opts {} -> { object, statueAnchor, altarAnchor, lanternAnchors: Object3D[],
 *  incenseAnchors: Object3D[], leftSignAnchor, rightSignAnchor, handSpawnAnchor (where the giant hand rises, on the ghost road), colliders:[] } */
export function createShrineMaRuay(opts = {}) {
  const g = new THREE.Group();
  g.add(box(5, 3, 4, 0x8a1a12));
  return {
    object: g, statueAnchor: anchor(g, 'statue', 0, 1, 0), altarAnchor: anchor(g, 'altar', 0, 0.9, 2.2), lanternAnchors: [], incenseAnchors: [],
    leftSignAnchor: anchor(g, 'signL', -4, 0, 4), rightSignAnchor: anchor(g, 'signR', 4, 0, 4), handSpawnAnchor: anchor(g, 'hand', -30, 0, -20), colliders: [],
  };
}

/** อู่ กม.9 (intro garage). -> { object, oldManSeat, taxiSpot, bikeSpot, playerArrive, tableAnchor, lampAnchor, colliders:[] } (Object3D anchors, local) */
export function createGarage(opts = {}) {
  const g = new THREE.Group();
  g.add(box(8, 0.1, 7, 0x555550, 0.05));
  g.add(box(8, 0.2, 7, 0x6a6a6a, 3.6));
  return {
    object: g, oldManSeat: anchor(g, 'oldManSeat', -2.5, 0.45, 1.5, Math.PI / 2), taxiSpot: anchor(g, 'taxiSpot', 1.2, 0, 0.5),
    bikeSpot: anchor(g, 'bikeSpot', -3, 0, 5), playerArrive: anchor(g, 'arrive', -1, 0, 4), tableAnchor: anchor(g, 'table', -2.5, 0.75, 0.6),
    lampAnchor: anchor(g, 'lamp', 0, 3.4, 0), colliders: [],
  };
}

/** Other set pieces — each returns { object, ...anchors }. */
export function createBusStop(opts = {}) {
  const g = new THREE.Group();
  g.add(box(3, 2.5, 1.2, 0x5a6a6a));
  return { object: g, waitSpot: anchor(g, 'wait', 0, 0, 1), seats: [anchor(g, 'seat', 0, 0.45, -0.2)], lampAnchor: anchor(g, 'lamp', 0, 2.4, 0) };
}
export function createNoodleStall(opts = {}) {
  const g = new THREE.Group();
  g.add(box(3, 1, 1.2, 0x7a5a3a));
  return { object: g, vendorSpot: anchor(g, 'vendor', 0, 0, -1), customerSpots: [anchor(g, 'c0', -1, 0, 1)], counterAnchor: anchor(g, 'counter', 0, 1, 0.6), lampAnchor: anchor(g, 'lamp', 0, 2.3, 0), tables: [] };
}
export function createBridge(opts = {}) {
  const g = new THREE.Group();
  g.add(box(opts.width ?? 7, 0.4, opts.length ?? 26, 0x6a6a66, -0.2));
  return { object: g };
}
/** Guardrail along world points (Vector3[]), opts {delineators=true, damaged=false} -> { object, lampAnchors: Object3D[] } */
export function createGuardrail(points, opts = {}) {
  const g = new THREE.Group();
  return { object: g, lampAnchors: [] };
}
export function createBuddhaStatue(opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.8, 1.6, 0.8, 0x8a8470));
  return { object: g };
}
export function createForestTemple(opts = {}) {
  const g = new THREE.Group();
  g.add(box(6, 4, 6, 0x6a6458));
  return { object: g, gateAnchor: anchor(g, 'gate', 0, 0, 4), waitSpot: anchor(g, 'wait', 0, 0, 5) };
}
export function createAccidentMemorial(opts = {}) {
  const g = new THREE.Group();
  return { object: g, waitSpot: anchor(g, 'wait', 0, 0, 0) };
}
export function createGhostGate(opts = {}) {
  const g = new THREE.Group();
  g.add(box(6, 4, 0.3, 0x3a3a3a));
  return { object: g, walkTarget: anchor(g, 'walk', 0, 0, -6) };
}
export function createVillageStop(opts = {}) {
  const g = new THREE.Group();
  g.add(box(2, 2, 1, 0x7a7a6a));
  return { object: g, walkTarget: anchor(g, 'walk', 0, 0, -6) };
}
export function createSignPost(kind, opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.08, 2, 0.08, 0x888888));
  return { object: g };
}
export function createConvexMirror(opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.08, 2.5, 0.08, 0xaa5522));
  return { object: g, mirrorAnchor: anchor(g, 'mirror', 0, 2.5, 0) };
}
export function createIncensePot(opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.3, 0.25, 0.3, 0x8a6a2a));
  return { object: g, smokeAnchor: anchor(g, 'smoke', 0, 0.4, 0) };
}
export function createPond(opts = {}) {
  const g = new THREE.Group();
  return { object: g };
}
/** Colourful cloth (ผ้าแพรสามสี) wrapped around a trunk of radius r between heights y0..y1. -> Object3D */
export function createClothWrap(radius = 0.8, y0 = 0.8, y1 = 1.6, opts = {}) {
  return new THREE.Group();
}
/** Small roadside dressing: plastic chairs, crates, garlands, offerings, broken scooter, trash, etc.
 *  kind: 'plastic_chair'|'crate'|'garland'|'offering_tray'|'red_soda_bottles'|'zebra_statues'|'thai_dancer_figurine'|'broken_scooter'|'water_jar'|'tire'|'sandbags'|'cone'|'trash_bag'|'shrine_table'
 *  -> { object } */
export function createDressing(kind, opts = {}) {
  const g = new THREE.Group();
  g.add(box(0.3, 0.3, 0.3, 0x775544));
  return { object: g };
}
