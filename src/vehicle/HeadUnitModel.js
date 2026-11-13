// The dashboard monitor: a cheap aftermarket 7-inch TFT screen on a stub bracket in front of the
// centre vents, above the cassette radio, turned a little toward the driver. Modelled from real
// forms: a bevelled bezel frame (rounded-rect extrusion with the screen window cut out and chamfered
// lips), the housing shell and a tapered rear bulge, a flexed sun hood (U-channel extrusion
// tapering toward the bottom, the top drooping a touch), pill buttons, a ball-and-socket joint,
// a bent strap arm swept along a curve onto a screwed plate, and the power lead drooping behind
// the radio. Personal touches: a masking-tape label in marker ("press here for songs"), a cat
// sticker stuck over the screen corner, and the button symbols silkscreened on the bezel.
//
// buildMonitor(opts) -> { group (taxi-local), screen (Mesh, uv 0..1 = the canvas), led (material),
//                         lightPos (taxi-local Vector3), normal (taxi-local), center }
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintedMaterial } from '../render/index.js';
import { roundRectPts, lathe, xform, deform, MergeBuilder, sweep, tube } from './geom.js';
import { makeCanvas, toTexture } from './VehicleTextures.js';
import { FONTS } from '../ui/fonts.js';
import { makeRng } from '../core/math.js';

/** Active area of the panel (16:9, a 7-inch screen) in metres. */
export const SCREEN_SIZE = { w: 0.154, h: 0.0866 };
const BEZ = { side: 0.0155, top: 0.0105, bottom: 0.021, r: 0.0095 };
const HW = SCREEN_SIZE.w + BEZ.side * 2;
const H_TOP = SCREEN_SIZE.h / 2 + BEZ.top;
const H_BOT = -SCREEN_SIZE.h / 2 - BEZ.bottom;
const HH = H_TOP - H_BOT;
const YC = (H_TOP + H_BOT) / 2;

const shapeFrom = (pts, dx = 0, dy = 0) => new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0] + dx, p[1] + dy)));
const pathFrom = (pts, dx = 0, dy = 0) => new THREE.Path(pts.map((p) => new THREE.Vector2(p[0] + dx, p[1] + dy)));

/** Extrude a shape along +Z from z0 with a rounded bevel; normals creased so bevels read smooth. */
function extrudeShape(shape, z0, depth, bevel = 0.001, bevelSeg = 3) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: bevelSeg, curveSegments: 8 });
  g.translate(0, 0, z0);
  return toCreasedNormals(g, 0.7);
}

/** The U-shaped sun hood (top + sides) as an XY outline, sampled arcs. */
function hoodOutline(xi, topI, yS, ri, t) {
  const out = [];
  const arc = (cx, cy, r, a0, a1, n = 8) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  const xo = xi + t, topO = topI + t, ro = ri + t;
  out.push([-xo, yS]);
  arc(-xi + ri, topI - ri, ro, Math.PI, Math.PI / 2);
  arc(xi - ri, topI - ri, ro, Math.PI / 2, 0);
  out.push([xo, yS], [xi, yS]);
  arc(xi - ri, topI - ri, ri, 0, Math.PI / 2);
  arc(-xi + ri, topI - ri, ri, Math.PI / 2, Math.PI);
  out.push([-xi, yS]);
  void topO;
  return out;
}

// ---- decal atlas: masking tape label, cat sticker, button silkscreen ----------------------------
const ATLAS_W = 512, ATLAS_H = 256;
const REG = { tape: [0, 0, 512, 104], sticker: [0, 112, 136, 136], silk: [144, 120, 368, 40] };
let _decalTex = null;
function decalAtlas() {
  if (_decalTex) return _decalTex;
  const c = makeCanvas(ATLAS_W, ATLAS_H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, ATLAS_W, ATLAS_H);
  const rng = makeRng(731);
  // masking tape: cream paper, torn ends, a little translucency, marker writing with an arrow
  {
    const [x, y, w, h] = REG.tape;
    g.save();
    g.beginPath();
    const yy0 = y + 10, yy1 = y + h - 10;
    g.moveTo(x + 10, yy0);
    for (let i = 1; i <= 20; i++) g.lineTo(x + 10 + ((w - 26) * i) / 20, yy0 + rng.range(-1.2, 1.2));
    for (let i = 0; i <= 8; i++) g.lineTo(x + w - 16 + rng.range(-7, 7), yy0 + ((yy1 - yy0) * i) / 8);
    for (let i = 20; i >= 0; i--) g.lineTo(x + 10 + ((w - 26) * i) / 20, yy1 + rng.range(-1.2, 1.2));
    for (let i = 8; i >= 0; i--) g.lineTo(x + 10 + rng.range(-7, 7), yy0 + ((yy1 - yy0) * i) / 8);
    g.closePath();
    g.fillStyle = 'rgba(226,212,170,0.94)';
    g.fill();
    g.clip();
    // crepe paper fibres + grime toward the fingers' end
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(${rng.range(120, 170) | 0},${rng.range(105, 140) | 0},${rng.range(70, 100) | 0},${rng.range(0.03, 0.09).toFixed(3)})`;
      g.fillRect(x + rng.range(0, w), y + rng.range(0, h), rng.range(1, 3), rng.range(6, 30));
    }
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, 'rgba(80,60,30,0.22)');
    grd.addColorStop(0.25, 'rgba(80,60,30,0)');
    grd.addColorStop(0.85, 'rgba(80,60,30,0)');
    grd.addColorStop(1, 'rgba(80,60,30,0.18)');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    // marker: slightly slanted, pressed hard
    g.translate(x + 30, y + h * 0.62);
    g.rotate(-0.025);
    g.fillStyle = '#1b2033';
    g.strokeStyle = '#1b2033';
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.font = `700 50px ${FONTS.hand}`;
    g.textBaseline = 'middle';
    g.lineWidth = 2.2;
    const txt = 'เปิดเพลง กดตรงนี้';
    g.strokeText(txt, 0, 0);
    g.fillText(txt, 0, 0);
    const tw = Math.min(380, g.measureText(txt).width);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(tw + 14, 2);
    g.quadraticCurveTo(tw + 44, -6, tw + 76, 4);
    g.stroke();
    g.beginPath();
    g.moveTo(tw + 60, -10);
    g.lineTo(tw + 78, 4);
    g.lineTo(tw + 58, 16);
    g.stroke();
    g.restore();
  }
  // cat sticker (original drawing): white die-cut border, orange cat face, a scuffed edge
  {
    const [x, y, w] = REG.sticker;
    const cx = x + w / 2, cy = y + w / 2, R = w / 2 - 4;
    g.save();
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7c8d4';
    g.beginPath();
    g.arc(cx, cy, R - 7, 0, Math.PI * 2);
    g.fill();
    // ears
    g.fillStyle = '#e8892e';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * 34, cy - 4);
      g.quadraticCurveTo(cx + s * 40, cy - 40, cx + s * 30, cy - 46);
      g.quadraticCurveTo(cx + s * 14, cy - 30, cx + s * 6, cy - 22);
      g.closePath();
      g.fill();
    }
    // head
    g.beginPath();
    g.ellipse(cx, cy + 6, 40, 33, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c96a1c';
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.ellipse(cx + i * 9, cy - 19, 3, 9, i * 0.25, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fbf3e4';
    g.beginPath();
    g.ellipse(cx, cy + 20, 20, 13, 0, 0, Math.PI * 2);
    g.fill();
    // eyes (happy closed arcs), nose, mouth, whiskers, blush
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * 15, cy + 4, 7, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.fillStyle = '#d4566a';
    g.beginPath();
    g.moveTo(cx - 4, cy + 13);
    g.lineTo(cx + 4, cy + 13);
    g.lineTo(cx, cy + 18);
    g.fill();
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(cx, cy + 18);
    g.quadraticCurveTo(cx - 5, cy + 25, cx - 10, cy + 21);
    g.moveTo(cx, cy + 18);
    g.quadraticCurveTo(cx + 5, cy + 25, cx + 10, cy + 21);
    g.stroke();
    g.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(cx + s * 22, cy + 16 + k * 4);
        g.lineTo(cx + s * 46, cy + 12 + k * 7);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(240,110,130,0.5)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + s * 26, cy + 14, 6, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // scuffed: a fingernail peel at the edge, faded patches
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), rr = R - rng.range(0, 6);
      g.globalAlpha = rng.range(0.15, 0.5);
      g.beginPath();
      g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rng.range(1, 4), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  // button silkscreen: worn grey symbols (menu, -, +, mode, power)
  {
    const [x, y, w, h] = REG.silk;
    g.save();
    g.strokeStyle = 'rgba(176,176,170,0.85)';
    g.fillStyle = 'rgba(176,176,170,0.85)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    const cxs = [0.12, 0.31, 0.5, 0.69, 0.88].map((f) => x + w * f);
    const cy = y + h / 2;
    // menu: three bars
    for (let k = -1; k <= 1; k++) {
      g.beginPath();
      g.moveTo(cxs[0] - 9, cy + k * 7);
      g.lineTo(cxs[0] + 9, cy + k * 7);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cxs[1] - 9, cy);
    g.lineTo(cxs[1] + 9, cy);
    g.moveTo(cxs[2] - 9, cy);
    g.lineTo(cxs[2] + 9, cy);
    g.moveTo(cxs[2], cy - 9);
    g.lineTo(cxs[2], cy + 9);
    g.stroke();
    // mode: a square-in-square
    g.strokeRect(cxs[3] - 9, cy - 8, 18, 16);
    g.fillRect(cxs[3] - 4, cy - 3, 8, 6);
    // power
    g.beginPath();
    g.arc(cxs[4], cy + 1, 9, -Math.PI * 0.32, Math.PI * 1.32);
    g.moveTo(cxs[4], cy - 12);
    g.lineTo(cxs[4], cy - 1);
    g.stroke();
    // wear
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 60; i++) {
      g.globalAlpha = rng.range(0.2, 0.8);
      g.fillRect(x + rng.range(0, w), y + rng.range(0, h), rng.range(1, 5), rng.range(1, 3));
    }
    g.restore();
  }
  _decalTex = toTexture(c);
  return _decalTex;
}

/** Plane mapped to an atlas region. */
function decalPlane(region, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const [rx, ry, rw, rh] = region;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (rx + u * rw) / ATLAS_W, 1 - (ry + (1 - v) * rh) / ATLAS_H);
  }
  return g;
}

let _mats = null;
function monitorMaterials() {
  if (_mats) return _mats;
  _mats = {
    plastic: paintedMaterial({ color: 0x151515, roughness: 0.36, metalness: 0.0, brush: 0.12, wet: 0, name: 'hu_plastic' }),
    hood: paintedMaterial({ color: 0x1a1a19, roughness: 0.72, brush: 0.15, wet: 0, name: 'hu_hood' }),
    metal: paintedMaterial({ color: 0x8d8b85, roughness: 0.38, metalness: 0.85, brush: 0.15, wet: 0, name: 'hu_metal' }),
    cable: paintedMaterial({ color: 0x0e0e0e, roughness: 0.5, brush: 0.05, wet: 0, name: 'hu_cable' }),
    decal: paintedMaterial({ map: decalAtlas(), transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 0.75, brush: 0.05, wet: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, name: 'hu_decals' }),
  };
  return _mats;
}

/**
 * Build the monitor.
 * opts { radioTop (y of the radio's top edge), radioFront (z of its faceplate), stackZ (z of the
 *        dash-stack face behind it), x = 0, yaw = 0.15 (turned to the driver), tilt = 0.16 (face up) }
 */
export function buildMonitor(opts) {
  const mats = monitorMaterials();
  const { radioTop, radioFront } = opts;
  const stackZ = opts.stackZ ?? radioFront - 0.016;
  const yaw = opts.yaw ?? 0.15, tilt = opts.tilt ?? 0.16;
  const group = new THREE.Group();
  group.name = 'headUnit';
  const mon = new THREE.Group();
  mon.name = 'headUnitMonitor';
  mon.position.set(opts.x ?? 0, radioTop + 0.004 + 0.066, radioFront + 0.044);
  mon.rotation.set(-tilt, yaw, 0, 'YXZ');
  group.add(mon);

  const mb = new MergeBuilder();
  // ---- bezel frame: rounded rect with the screen window, chamfered both sides ----
  const SW = SCREEN_SIZE.w, SH = SCREEN_SIZE.h;
  const frame = shapeFrom(roundRectPts(HW, HH, BEZ.r, 5), 0, YC);
  frame.holes.push(pathFrom(roundRectPts(SW + 0.0034, SH + 0.0034, 0.0016, 3)));
  mb.add('plastic', extrudeShape(frame, -0.0012, 0.0034, 0.0016, 3));
  // ---- housing shell behind the bezel, and the tapered rear bulge ----
  mb.add('plastic', extrudeShape(shapeFrom(roundRectPts(HW - 0.002, HH - 0.002, BEZ.r * 0.9, 5), 0, YC), -0.0175, 0.0155, 0.0018, 3));
  {
    const bw = 0.128, bh = 0.074;
    const g = extrudeShape(shapeFrom(roundRectPts(bw, bh, 0.014, 5), 0, YC - 0.004), -0.0315, 0.014, 0.0024, 3);
    deform(g, (v) => {
      const k = THREE.MathUtils.clamp((-0.0175 - v.z) / 0.016, 0, 1); // 0 at the shell, 1 at the back face
      const s = 1 - 0.2 * k;
      v.x *= s;
      v.y = (YC - 0.004) + (v.y - (YC - 0.004)) * s;
    }, true);
    mb.add('plastic', toCreasedNormals(g, 0.7));
    // ball-and-socket joint on the back
    const cup = lathe([[0, 0], [0.0125, 0], [0.0128, 0.002], [0.0115, 0.0055], [0.0088, 0.0072], [0, 0.0075]], 24);
    mb.add('plastic', xform(cup, [0, YC - 0.012, -0.0335], [-Math.PI / 2, 0, 0]));
  }
  // ---- buttons on the bottom bezel + power LED ----
  const bandY = -SH / 2 - BEZ.bottom / 2 - 0.0008;
  const FRONT = -0.0012 + 0.0034 + 0.0016; // bezel face (extrude depth + bevel)
  const btnX = [0.0277, 0.0406, 0.0535, 0.0664];
  for (const x of btnX) {
    const g = extrudeShape(shapeFrom(roundRectPts(0.0088, 0.0044, 0.0021, 3)), FRONT - 0.0002, 0.0006, 0.0006, 2);
    mb.add('plastic', xform(g, [x, bandY + 0.0025, 0]));
  }
  {
    const g = extrudeShape(shapeFrom(roundRectPts(0.0088, 0.0044, 0.0021, 3)), FRONT - 0.0002, 0.0006, 0.0006, 2);
    mb.add('plastic', xform(g, [0.0793, bandY + 0.0025, 0]));
  }
  // ---- sun hood: U channel over the top and down the sides, shallower toward the bottom ----
  {
    const xi = HW / 2 + 0.0008, topI = H_TOP + 0.0008, yS = YC - HH * 0.2, ri = BEZ.r + 0.0012, t = 0.0022;
    const D = 0.034, z0 = -0.0075;
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(hoodOutline(xi, topI, yS, ri, t).map((p) => new THREE.Vector2(p[0], p[1]))), { depth: D, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, z0);
    deform(g, (v) => {
      const f = THREE.MathUtils.clamp((v.y - yS) / (topI + t - yS), 0, 1);
      const k = (v.z - z0) / D;
      const s = 0.22 + 0.78 * Math.pow(f, 0.65);
      v.z = z0 + (v.z - z0) * s;
      // the thin top flexes down a touch at the front centre; sides splay out slightly
      const xn = v.x / (xi + t);
      if (f > 0.9) v.y -= 0.0016 * Math.max(0, k) * (1 - xn * xn);
      v.x *= 1 + 0.035 * Math.max(0, k);
    }, true);
    mb.add('hood', toCreasedNormals(g, 0.6));
  }
  mon.add(mb.build({ plastic: mats.plastic, hood: mats.hood }));

  // ---- the screen (canvas) ----
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW + 0.0034, SH + 0.0034), null);
  screen.name = 'headUnitScreen';
  screen.position.set(0, 0, 0.0004);
  mon.add(screen);

  // ---- LED (blue = on, red = standby) ----
  const led = paintedMaterial({ color: 0x1a0604, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.2, brush: 0, wet: 0, name: 'hu_led' });
  const ledMesh = new THREE.Mesh(lathe([[0, 0], [0.0016, 0], [0.0015, 0.0006], [0.001, 0.0011], [0, 0.0012]], 12).rotateX(Math.PI / 2), led);
  ledMesh.position.set(-0.0815, bandY + 0.0025, FRONT - 0.0003);
  mon.add(ledMesh);

  // ---- decals: tape label (bottom bezel, crooked), cat sticker over the top-right corner, silkscreen ----
  {
    const db = new MergeBuilder();
    const tape = decalPlane(REG.tape, 0.088, 0.0179);
    db.add('d', xform(tape, [-0.031, bandY + 0.0004, FRONT + 0.0002], [0, 0, 0.035]));
    // (no cat sticker: the owner removed it)
    const silk = decalPlane(REG.silk, 0.068, 0.0074);
    db.add('d', xform(silk, [0.0535, bandY - 0.0045, FRONT + 0.0001]));
    mon.add(db.build({ d: mats.decal }));
  }

  // ---- bracket: ball, bent strap arm, plate screwed to the stack (built in taxi space) ----
  mon.updateMatrix();
  const M = mon.matrix;
  const ball = new THREE.Vector3(0, YC - 0.012, -0.041).applyMatrix4(M);
  const plateC = new THREE.Vector3(mon.position.x, radioTop + 0.021, stackZ + 0.0035);
  {
    const mb2 = new MergeBuilder();
    mb2.add('metal', xform(lathe([[0, -0.0076], [0.0046, -0.0062], [0.0072, -0.003], [0.0077, 0], [0.0072, 0.003], [0.0046, 0.0062], [0, 0.0076]], 20), [ball.x, ball.y, ball.z]));
    // strap arm: rounded-rect section swept back and down along a curve
    const P0 = ball.clone().add(new THREE.Vector3(0, -0.002, -0.004));
    const P3 = plateC.clone().add(new THREE.Vector3(0, 0.002, 0.003));
    const curve = new THREE.CubicBezierCurve3(P0, P0.clone().add(new THREE.Vector3(0, -0.004, -0.012)), P3.clone().add(new THREE.Vector3(0, 0.012, 0.006)), P3);
    const path = curve.getPoints(14);
    const prof = roundRectPts(0.0036, 0.0145, 0.0015, 2); // thin across the path, wide along X
    mb2.add('metal', sweep(path, prof, { up: new THREE.Vector3(1, 0, 0) }));
    // plate: bevelled rounded rect on the stack face + two pan-head screws
    const plate = extrudeShape(shapeFrom(roundRectPts(0.046, 0.019, 0.0035, 4)), -0.0012, 0.0024, 0.0008, 2);
    mb2.add('metal', xform(plate, [plateC.x, plateC.y, plateC.z]));
    for (const sx of [-0.016, 0.016]) {
      const head = lathe([[0, 0], [0.0033, 0], [0.0033, 0.0006], [0.0026, 0.0016], [0, 0.0019]], 16);
      mb2.add('metal', xform(head, [plateC.x + sx, plateC.y, plateC.z + 0.0018], [Math.PI / 2, 0, 0]));
    }
    // the power lead: out of the back, drooping down beside the radio and in behind it
    const back = new THREE.Vector3(-0.05, YC - 0.03, -0.03).applyMatrix4(M);
    const pts = [back, back.clone().add(new THREE.Vector3(-0.022, -0.008, -0.004)), new THREE.Vector3(-0.098, radioTop + 0.006, stackZ + 0.016), new THREE.Vector3(-0.106, radioTop - 0.022, stackZ + 0.008), new THREE.Vector3(-0.1, radioTop - 0.05, stackZ + 0.001)];
    mb2.add('cable', tube(pts, 0.0021, 40, 8));
    group.add(mb2.build({ metal: mats.metal, cable: mats.cable }));
  }
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  mon.updateMatrixWorld(true);
  const center = new THREE.Vector3(0, 0, 0).applyMatrix4(M);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(M);
  // the glow sits a hand's width toward the driver, so it lights hands and face, not the bezel stickers
  const lightPos = center.clone().addScaledVector(normal, 0.34).add(new THREE.Vector3(0, 0.04, 0));
  return { group, monitor: mon, screen, led, center, normal, lightPos };
}

/** Use a GLB's own head-unit screen node: returns { screen (Mesh), center, normal, lightPos } in its parent's space. */
export function bindGLBScreen(node, eyeLocal) {
  let mesh = null;
  node.traverse((o) => {
    if (!mesh && o.isMesh) mesh = o;
  });
  if (!mesh) return null;
  mesh.geometry.computeBoundingBox();
  const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const n = mesh.geometry.attributes.normal;
  const normal = n ? new THREE.Vector3().fromBufferAttribute(n, 0).transformDirection(mesh.matrixWorld) : new THREE.Vector3(0, 0, 1);
  if (eyeLocal && normal.dot(eyeLocal.clone().sub(center)) < 0) normal.negate();
  return { screen: mesh, center, normal, lightPos: center.clone().addScaledVector(normal, 0.34) };
}
