// Thai signage as weathered CanvasTextures. All designs are ORIGINAL and fictional (no real
// brands, logos or official emblems). Text uses the bundled Thai fonts (FONTS.sign / lcd /
// hand), which are loaded at boot before anything calls signTex().
import * as THREE from 'three';
import { FONTS } from '../ui/fonts.js';
import { newCanvas, rr, text, cjk, elephant, bolts, weather, thaiDigits, makeRng, hashString } from './signkit.js';
import { PRINTED } from './printed.js';

const PI = Math.PI;

// ---------------------------------------------------------------------------
// Road & roadside signs
// ---------------------------------------------------------------------------
function kmMarker(o) {
  // Thai kilometre stone face: green cap with route number, white body, กม. + big number
  const W = 512, H = 768;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const km = o.km ?? 9;
  g.fillStyle = '#9b988e'; // concrete around the painted face
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#e9e6dc';
  rr(g, 18, 18, W - 36, H - 60, 30);
  g.fill();
  // arched green cap
  g.save();
  rr(g, 18, 18, W - 36, H - 60, 30);
  g.clip();
  g.fillStyle = '#1f6a3e';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  g.lineTo(W, 210);
  g.quadraticCurveTo(W / 2, 270, 0, 210);
  g.closePath();
  g.fill();
  g.restore();
  text(g, 'ทางหลวงชนบท', W / 2, 78, { size: 40, weight: 600, color: '#eef0e4', maxW: W - 90 });
  text(g, thaiDigits(o.route ?? 'มร.4099'), W / 2, 148, { size: 66, weight: 800, color: '#ffffff', maxW: W - 90 });
  text(g, 'กม.', W / 2, 330, { size: 92, weight: 700, color: '#141414' });
  text(g, String(km), W / 2, 500, { size: 230, weight: 800, color: '#111111', maxW: W - 70 });
  g.fillStyle = '#1f6a3e';
  g.fillRect(70, 618, W - 140, 6);
  text(g, o.dest ?? `มารวย ${Math.max(1, 12 - km)}`, W / 2, 668, { size: 46, weight: 600, color: '#1a1a1a', maxW: W - 100 });
  weather(cv, { seed: 11 + km, fade: 0.25, grime: 0.35, streaks: 0.6, chips: 0.35, substrate: '#8d8a80', edge: 0.4, moss: 0.55, paint: 0.25 });
  return { cv, size: [0.42, 0.63] };
}

function diamondPath(g, cx, cy, r, round) {
  g.beginPath();
  const pts = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4], pr = pts[(i + 3) % 4];
    const ax = p[0] + (pr[0] - p[0]) * round, ay = p[1] + (pr[1] - p[1]) * round;
    const bx = p[0] + (q[0] - p[0]) * round, by = p[1] + (q[1] - p[1]) * round;
    if (i === 0) g.moveTo(ax, ay);
    else g.lineTo(ax, ay);
    g.quadraticCurveTo(p[0], p[1], bx, by);
  }
  g.closePath();
}

function yellowDiamond(g, cx, cy, r) {
  g.fillStyle = '#16140f';
  diamondPath(g, cx, cy, r, 0.08);
  g.fill();
  g.fillStyle = '#e8b32a';
  diamondPath(g, cx, cy, r * 0.9, 0.08);
  g.fill();
  g.strokeStyle = '#16140f';
  g.lineWidth = r * 0.035;
  diamondPath(g, cx, cy, r * 0.84, 0.08);
  g.stroke();
}

function curveWarning(o) {
  const S = 512;
  const cv = newCanvas(S, S);
  const { g } = cv;
  yellowDiamond(g, S / 2, S / 2, S * 0.49);
  const dir = o.dir === 'left' ? -1 : 1;
  g.save();
  g.translate(S / 2, S / 2);
  g.scale(dir, 1);
  g.strokeStyle = '#15130f';
  g.lineWidth = 34;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(-40, 150);
  g.lineTo(-40, 20);
  g.quadraticCurveTo(-40, -70, 40, -80);
  g.stroke();
  g.fillStyle = '#15130f';
  g.beginPath();
  g.moveTo(30, -140);
  g.lineTo(115, -82);
  g.lineTo(30, -24);
  g.closePath();
  g.fill();
  g.restore();
  weather(cv, { seed: 21, fade: 0.35, grime: 0.3, streaks: 0.5, chips: 0.25, substrate: '#9a9a96', edge: 0.35, scratches: 0.3, rust: [[0.5, 0.5]], paint: 0.2 });
  return { cv, size: [0.75, 0.75], alpha: true };
}

function elephantCrossing(o) {
  const W = 512, H = 720;
  const cv = newCanvas(W, H);
  const { g } = cv;
  yellowDiamond(g, W / 2, W / 2, W * 0.49);
  elephant(g, W * 0.24, W * 0.22, W * 0.52, '#15130f');
  elephant(g, W * 0.56, W * 0.42, W * 0.22, '#15130f', true);
  // sub plate
  g.fillStyle = '#16140f';
  rr(g, 40, 540, W - 80, 160, 14);
  g.fill();
  g.fillStyle = '#e8b32a';
  rr(g, 50, 550, W - 100, 140, 10);
  g.fill();
  text(g, o.th ?? 'ระวังช้างป่า', W / 2, 612, { size: 78, weight: 800, color: '#15130f', maxW: W - 130 });
  weather(cv, { seed: 31, fade: 0.4, grime: 0.35, streaks: 0.6, chips: 0.25, substrate: '#9a9a96', edge: 0.35, scratches: 0.25, rust: [[0.5, 0.08], [0.5, 0.97]], paint: 0.2 });
  return { cv, size: [0.75, 1.05], alpha: true };
}

function villageSign(o) {
  const W = 1024, H = 400;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#e9e9e0';
  rr(g, 0, 0, W, H, 26);
  g.fill();
  g.fillStyle = '#16603a';
  rr(g, 12, 12, W - 24, H - 24, 20);
  g.fill();
  g.strokeStyle = '#e9e9e0';
  g.lineWidth = 7;
  rr(g, 30, 30, W - 60, H - 60, 14);
  g.stroke();
  text(g, o.th ?? 'บ้านมารวย', W / 2, 150, { size: 150, weight: 700, color: '#f2f2ea', maxW: W - 120 });
  text(g, o.en ?? 'Ban Ma Ruai', W / 2, 288, { size: 82, weight: 600, color: '#f2f2ea', maxW: W - 160 });
  text(g, o.sub ?? 'หมู่ที่ ๙', W - 130, 345, { size: 34, weight: 600, color: '#d8e6da' });
  weather(cv, { seed: 41, fade: 0.4, grime: 0.3, streaks: 0.7, chips: 0.25, substrate: '#a9a9a2', edge: 0.4, scratches: 0.3, rust: [[0.06, 0.5], [0.94, 0.5]], paint: 0.22 });
  return { cv, size: [1.8, 0.7], alpha: true };
}

function speedSign(o) {
  const S = 512;
  const cv = newCanvas(S, S);
  const { g } = cv;
  g.fillStyle = '#c7262a';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.49, 0, PI * 2);
  g.fill();
  g.fillStyle = '#f1efe6';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.37, 0, PI * 2);
  g.fill();
  text(g, String(o.kmh ?? 60), S / 2, S * 0.47, { size: 200, weight: 800, color: '#121212', maxW: S * 0.6 });
  text(g, 'กม./ชม.', S / 2, S * 0.7, { size: 40, weight: 600, color: '#121212' });
  weather(cv, { seed: 51, fade: 0.45, grime: 0.3, streaks: 0.5, chips: 0.2, substrate: '#9a9a96', edge: 0.3, scratches: 0.3, rust: [[0.5, 0.5]], paint: 0.2 });
  return { cv, size: [0.6, 0.6], alpha: true };
}

function warningSign(o) {
  const W = 768, H = 512;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#16140f';
  rr(g, 0, 0, W, H, 30);
  g.fill();
  g.fillStyle = '#e8b32a';
  rr(g, 14, 14, W - 28, H - 28, 22);
  g.fill();
  text(g, 'ระวัง', W / 2, 120, { size: 120, weight: 800, color: '#15130f' });
  text(g, o.th ?? 'ทางโค้งอันตราย', W / 2, 270, { size: 96, weight: 700, color: '#15130f', maxW: W - 90 });
  text(g, o.en ?? 'DANGEROUS CURVE', W / 2, 400, { size: 64, weight: 700, color: '#15130f', maxW: W - 110 });
  weather(cv, { seed: 61, fade: 0.4, grime: 0.35, streaks: 0.6, chips: 0.25, substrate: '#9a9a96', edge: 0.35, scratches: 0.3, rust: [[0.05, 0.08], [0.95, 0.08], [0.05, 0.92], [0.95, 0.92]], paint: 0.22 });
  return { cv, size: [1.2, 0.8], alpha: true };
}

function busStopSign(o) {
  const W = 512, H = 640;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#e6e6de';
  rr(g, 0, 0, W, H, 20);
  g.fill();
  g.fillStyle = '#1f4f9a';
  rr(g, 10, 10, W - 20, H - 20, 14);
  g.fill();
  // bus pictogram
  g.fillStyle = '#f0f0ea';
  rr(g, 116, 70, 280, 230, 36);
  g.fill();
  g.fillStyle = '#1f4f9a';
  rr(g, 140, 98, 232, 96, 12);
  g.fill();
  g.fillStyle = '#f0f0ea';
  g.fillRect(250, 98, 12, 96);
  g.fillStyle = '#1f4f9a';
  for (const x of [168, 344]) {
    g.beginPath();
    g.arc(x, 252, 20, 0, PI * 2);
    g.fill();
  }
  g.fillStyle = '#f0f0ea';
  g.fillRect(146, 300, 40, 34);
  g.fillRect(326, 300, 40, 34);
  text(g, 'ป้ายหยุดรถประจำทาง', W / 2, 420, { size: 52, weight: 700, color: '#f4f4ee', maxW: W - 60 });
  text(g, 'BUS STOP', W / 2, 494, { size: 58, weight: 700, color: '#f4f4ee', spacing: 4 });
  text(g, o.route ?? 'สาย ๙  มารวย - ตลาดเช้า', W / 2, 572, { size: 34, weight: 600, color: '#d8e2f2', maxW: W - 70 });
  weather(cv, { seed: 71, fade: 0.5, grime: 0.35, streaks: 0.7, chips: 0.3, substrate: '#a2a29c', edge: 0.4, scratches: 0.4, rust: [[0.5, 0.04], [0.5, 0.96]], paint: 0.22 });
  return { cv, size: [0.5, 0.62], alpha: true };
}

function forkSign(o) {
  // weathered wooden arrow plank with hand-painted letters
  const W = 768, H = 256;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const left = (o.side ?? 'left') === 'left';
  g.save();
  if (left) {
    g.translate(W, 0);
    g.scale(-1, 1);
  }
  g.beginPath();
  g.moveTo(10, 40);
  g.lineTo(W - 150, 30);
  g.lineTo(W - 150, 6);
  g.lineTo(W - 8, H / 2 + 4);
  g.lineTo(W - 150, H - 8);
  g.lineTo(W - 152, H - 34);
  g.lineTo(14, H - 44);
  g.closePath();
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#7c6a52');
  grd.addColorStop(0.5, '#6a5844');
  grd.addColorStop(1, '#4e4032');
  g.fillStyle = grd;
  g.fill();
  // grain
  const rng = makeRng(81 + (left ? 0 : 5));
  g.save();
  g.clip();
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${30 + rng() * 40},${22 + rng() * 30},${14 + rng() * 20},${0.25 + rng() * 0.35})`;
    g.lineWidth = 1 + rng() * 2.5;
    const y = rng() * H;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (rng() - 0.5) * 16, W * 0.6, y + (rng() - 0.5) * 16, W, y + (rng() - 0.5) * 10);
    g.stroke();
  }
  g.restore();
  g.restore();
  const tx = left ? W * 0.56 : W * 0.44;
  text(g, o.th ?? (left ? 'ซ้าย' : 'ขวา'), tx, 108, { size: 104, weight: 600, font: FONTS.hand, color: '#efe8d6', maxW: W * 0.6 });
  text(g, o.sub ?? (left ? 'ทางเก่า' : 'ไปหมู่บ้านมารวย'), tx, 190, { size: 42, weight: 600, font: FONTS.hand, color: '#e6dcc4', maxW: W * 0.62 });
  bolts(g, [[left ? W - 70 : 70, H / 2]], 12, '#4a4440');
  weather(cv, { seed: 82 + (left ? 0 : 3), fade: 0.35, grime: 0.45, streaks: 0.6, chips: 0.35, substrate: '#5a4a3a', edge: 0.5, scratches: 0.5, wobble: 2.2, moss: 0.2, paint: 0.3, rust: [[left ? 0.91 : 0.09, 0.5]] });
  return { cv, size: [1.1, 0.37], alpha: true };
}

function warningOrShop(o, kind) {
  return kind === 'warning_sign' ? warningSign(o) : shopSign(o);
}

// ---------------------------------------------------------------------------
// Shrine / temple
// ---------------------------------------------------------------------------
function cloudBorder(g, x, y, w, h, color, unit) {
  // Chinese meander (回纹) border, drawn as a continuous key pattern
  g.save();
  g.strokeStyle = color;
  g.lineWidth = unit * 0.32;
  g.lineCap = 'square';
  const keyRow = (x0, y0, len, horiz, flip) => {
    const n = Math.floor(len / (unit * 2));
    for (let i = 0; i < n; i++) {
      const a = (horiz ? x0 : y0) + i * unit * 2;
      g.beginPath();
      const P = (u, v) => (horiz ? [a + u * unit, y0 + (flip ? -v : v) * unit] : [x0 + (flip ? -v : v) * unit, a + u * unit]);
      const pts = [P(0, 0), P(1.6, 0), P(1.6, 1.2), P(0.5, 1.2), P(0.5, 0.5), P(1.1, 0.5)];
      g.moveTo(...pts[0]);
      for (let p = 1; p < pts.length; p++) g.lineTo(...pts[p]);
      g.stroke();
    }
  };
  keyRow(x, y, w, true, false);
  keyRow(x, y + h, w, true, true);
  keyRow(x, y, h, false, false);
  keyRow(x + w, y, h, false, true);
  g.restore();
}

function goldText(g, s, x, y, o) {
  // engraved gold: dark offset + gradient fill + highlight
  text(g, s, x + 3, y + 4, { ...o, color: 'rgba(40,8,4,0.85)' });
  const size = o.size ?? 80;
  const grd = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  grd.addColorStop(0, '#f6dd8a');
  grd.addColorStop(0.45, '#d4a541');
  grd.addColorStop(0.55, '#a87a24');
  grd.addColorStop(1, '#e9c766');
  text(g, s, x, y, { ...o, color: grd });
}

function shrineBoard(o) {
  const W = 1024, H = 400;
  const cv = newCanvas(W, H);
  const { g } = cv;
  // lacquered red board with darker bevel
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#5a0d0c');
  grd.addColorStop(0.5, '#8a1714');
  grd.addColorStop(1, '#4a0a09');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a0605';
  g.fillRect(0, 0, W, 10);
  g.fillRect(0, H - 10, W, 10);
  // gold frame + meander
  g.strokeStyle = '#c99a3c';
  g.lineWidth = 8;
  g.strokeRect(22, 22, W - 44, H - 44);
  cloudBorder(g, 44, 44, W - 88, H - 88, '#b8862e', 12);
  g.strokeStyle = '#c99a3c';
  g.lineWidth = 3;
  g.strokeRect(78, 78, W - 156, H - 156);
  // Chinese name (decorative) across the top, Thai below
  const chars = o.cn ?? '馬瑞神廟';
  const step = 118;
  const x0 = W / 2 - ((chars.length - 1) * step) / 2;
  for (let i = 0; i < chars.length; i++) cjk(g, chars[i], x0 + i * step, 160, 104, '#e2b856', { stroke: '#3a0a06', strokeW: 6 });
  goldText(g, o.th ?? 'ศาลเจ้ามารวย', W / 2, 286, { size: 100, weight: 700, maxW: W - 220 });
  // corner rosettes
  for (const [x, y] of [[48, 48], [W - 48, 48], [48, H - 48], [W - 48, H - 48]]) {
    g.fillStyle = '#d4a541';
    g.beginPath();
    g.arc(x, y, 13, 0, PI * 2);
    g.fill();
    g.fillStyle = '#6a120e';
    g.beginPath();
    g.arc(x, y, 5, 0, PI * 2);
    g.fill();
  }
  weather(cv, { seed: 91, fade: 0.3, fadeTint: '#c89a7a', grime: 0.45, streaks: 0.5, chips: 0.3, substrate: '#2a1a12', edge: 0.4, scratches: 0.25, paint: 0.25, dust: 0.35 });
  return { cv, size: [1.6, 0.62] };
}

function couplet(o) {
  const W = 192, H = 1024;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#7a0f0d');
  grd.addColorStop(0.5, '#a51c17');
  grd.addColorStop(1, '#740e0c');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d0a246';
  g.lineWidth = 5;
  g.strokeRect(12, 12, W - 24, H - 24);
  const chars = o.text ?? (o.side === 'right' ? '國泰民安福滿門' : '風調雨順財源廣');
  const n = chars.length;
  const step = (H - 110) / n;
  for (let i = 0; i < n; i++) cjk(g, chars[i], W / 2, 62 + step * (i + 0.5), Math.min(132, step * 0.86), '#1a0c08', { weight: 800 });
  // gold flecks
  const rng = makeRng(hashString(chars));
  g.fillStyle = 'rgba(230,190,90,0.7)';
  for (let i = 0; i < 160; i++) g.fillRect(rng() * W, rng() * H, 1 + rng() * 2.5, 1 + rng() * 2.5);
  weather(cv, { seed: 92 + n, fade: 0.45, fadeTint: '#d8a088', grime: 0.4, streaks: 0.8, paper: 0.5, edge: 0.4, paint: 0.2, tear: 0.4 });
  return { cv, size: [0.3, 1.6], alpha: true };
}

function templeSign(o) {
  const W = 1024, H = 400;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#c8bfa8';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#5a1a14';
  rr(g, 16, 16, W - 32, H - 32, 10);
  g.fill();
  // gold kanok-like flame scroll frame
  g.strokeStyle = '#c9a046';
  g.lineWidth = 5;
  rr(g, 36, 36, W - 72, H - 72, 8);
  g.stroke();
  const flame = (x, y, s, flip) => {
    g.save();
    g.translate(x, y);
    g.scale(flip ? -s : s, s);
    g.fillStyle = '#c9a046';
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(10, -20, 30, -18, 34, -40);
    g.bezierCurveTo(40, -14, 22, 4, 0, 6);
    g.closePath();
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 6; i++) {
    flame(70 + i * 26, 344 - i * 2, 0.9, false);
    flame(W - 70 - i * 26, 344 - i * 2, 0.9, true);
  }
  // dharma wheel
  const wx = 150, wy = 170;
  g.strokeStyle = '#d4ac4e';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(wx, wy, 70, 0, PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(wx, wy, 16, 0, PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    g.beginPath();
    g.moveTo(wx + Math.cos(a) * 16, wy + Math.sin(a) * 16);
    g.lineTo(wx + Math.cos(a) * 70, wy + Math.sin(a) * 70);
    g.stroke();
  }
  goldText(g, o.th ?? 'วัดป่ามารวย', 600, 150, { size: 118, weight: 700, maxW: 700 });
  text(g, o.sub ?? 'สำนักสงฆ์ · ทางเข้า ๕๐๐ ม. →', 600, 268, { size: 48, weight: 600, color: '#e8d8b0', maxW: 700 });
  weather(cv, { seed: 101, fade: 0.35, grime: 0.4, streaks: 0.7, chips: 0.3, substrate: '#a49c88', edge: 0.4, moss: 0.25, paint: 0.25 });
  return { cv, size: [1.8, 0.7] };
}

// ---------------------------------------------------------------------------
// Taxi parts
// ---------------------------------------------------------------------------
function taxiRoof() {
  const W = 512, H = 192;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#f4efd8');
  grd.addColorStop(1, '#ddd3b0');
  g.fillStyle = grd;
  rr(g, 0, 0, W, H, 30);
  g.fill();
  g.strokeStyle = '#1d3f86';
  g.lineWidth = 8;
  rr(g, 12, 12, W - 24, H - 24, 22);
  g.stroke();
  text(g, 'TAXI-METER', W / 2, 92, { size: 104, weight: 800, color: '#1d3f86', maxW: W - 60 });
  text(g, 'แท็กซี่มิเตอร์', W / 2, 160, { size: 30, weight: 600, color: '#a2241e' });
  weather(cv, { seed: 111, fade: 0.25, grime: 0.3, streaks: 0.3, edge: 0.35, scratches: 0.3, dust: 0.3, paint: 0.15 });
  return { cv, size: [0.62, 0.23], alpha: true };
}

function vacantLamp(o) {
  const W = 256, H = 128;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const lit = o.lit !== false;
  const grd = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
  grd.addColorStop(0, lit ? '#a8201c' : '#4a0c0c');
  grd.addColorStop(1, lit ? '#5a0a0a' : '#260606');
  g.fillStyle = grd;
  rr(g, 0, 0, W, H, 18);
  g.fill();
  text(g, 'ว่าง', W / 2, H / 2 + 4, { size: 92, weight: 800, color: lit ? '#ffe2c8' : '#8a2a22', shadow: lit ? { color: 'rgba(255,60,40,0.9)', x: 0, y: 0, blur: 14 } : null });
  weather(cv, { seed: 121, fade: 0.1, grime: 0.25, edge: 0.4, scratches: 0.35, dust: 0.35, paint: 0.12 });
  return { cv, size: [0.16, 0.08] };
}

function plate(o) {
  const W = 544, H = 240;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#e7c23a';
  rr(g, 0, 0, W, H, 18);
  g.fill();
  g.strokeStyle = '#141414';
  g.lineWidth = 6;
  rr(g, 9, 9, W - 18, H - 18, 12);
  g.stroke();
  text(g, o.text ?? 'ทข 9449', W / 2, 98, { size: 128, weight: 600, color: '#141414', maxW: W - 60 });
  text(g, o.province ?? 'กรุงเทพมหานคร', W / 2, 192, { size: 52, weight: 600, color: '#141414', maxW: W - 80 });
  bolts(g, [[40, 40], [W - 40, 40]], 10, '#8a8478');
  weather(cv, { seed: 131, fade: 0.25, grime: 0.45, streaks: 0.4, chips: 0.2, substrate: '#b5b2a8', edge: 0.5, scratches: 0.4, rust: [[0.07, 0.17], [0.93, 0.17]], dust: 0.3, paint: 0.15 });
  return { cv, size: [0.34, 0.15], alpha: true };
}

// ---------------------------------------------------------------------------
// Garage / shops / menus (hand-painted)
// ---------------------------------------------------------------------------
function tinSheet(g, W, H, col = '#e8e2d2') {
  g.fillStyle = col;
  g.fillRect(0, 0, W, H);
  // corrugation hint
  for (let x = 0; x < W; x += 32) {
    const grd = g.createLinearGradient(x, 0, x + 32, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.06)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 32, H);
  }
}

function garageSign(o) {
  const W = 1024, H = 400;
  const cv = newCanvas(W, H);
  const { g } = cv;
  tinSheet(g, W, H);
  g.strokeStyle = '#1e3f7a';
  g.lineWidth = 12;
  g.strokeRect(20, 20, W - 40, H - 40);
  text(g, o.th ?? 'อู่ กม.9', W / 2, 120, { size: 150, weight: 800, color: '#b3201a', font: FONTS.sign, maxW: W - 100 });
  text(g, o.sub ?? 'ซ่อมรถทุกชนิด', W / 2, 238, { size: 86, weight: 700, color: '#1e3f7a', maxW: W - 120 });
  text(g, 'ปะยาง · เปลี่ยนถ่ายน้ำมันเครื่อง · ช่วงล่าง', W / 2, 310, { size: 36, weight: 600, color: '#2a2a2a', maxW: W - 140 });
  text(g, 'โทร. ๐๘๙-๙๙๙-๐๙๐๙', W / 2, 358, { size: 38, weight: 600, color: '#b3201a' });
  weather(cv, { seed: 141, fade: 0.4, grime: 0.5, streaks: 0.9, chips: 0.4, substrate: '#8a8780', edge: 0.5, scratches: 0.35, rust: [[0.03, 0.06], [0.97, 0.06], [0.03, 0.94], [0.97, 0.94], [0.5, 0.05]], rustEdge: 0.7, wobble: 2.5, paint: 0.3 });
  return { cv, size: [2.0, 0.78] };
}

function shopSign(o) {
  const W = 1024, H = 320;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#2a5f8f';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#e9c14a';
  g.fillRect(0, H - 56, W, 56);
  g.strokeStyle = '#f2ecd8';
  g.lineWidth = 6;
  g.strokeRect(14, 14, W - 28, H - 84);
  text(g, o.th ?? 'ร้านค้าป้าเล็ก', W / 2, 118, { size: 120, weight: 800, color: '#f6f0dc', stroke: '#173a5a', strokeW: 10, maxW: W - 90 });
  text(g, o.en ?? 'COFFEE · NOODLES · SNACKS', W / 2, 212, { size: 44, weight: 600, color: '#f6e6a8', maxW: W - 120 });
  text(g, o.foot ?? 'เปิดทุกวัน ตลอดคืน', W / 2, H - 28, { size: 36, weight: 700, color: '#6a1a12' });
  weather(cv, { seed: 151, fade: 0.5, grime: 0.4, streaks: 0.8, chips: 0.35, substrate: '#9a948a', edge: 0.4, scratches: 0.3, rustEdge: 0.5, wobble: 2, paint: 0.3 });
  return { cv, size: [2.2, 0.69] };
}

function noodleMenu(o) {
  const W = 768, H = 1024;
  const cv = newCanvas(W, H);
  const { g } = cv;
  tinSheet(g, W, H, '#ece6d4');
  g.fillStyle = '#b3201a';
  g.fillRect(0, 0, W, 190);
  text(g, o.title ?? 'ก๋วยเตี๋ยวเรือ', W / 2, 92, { size: 116, weight: 800, color: '#fff3d8', maxW: W - 60 });
  text(g, o.shop ?? 'ร้านป้าเล็ก  เปิดทั้งคืน', W / 2, 160, { size: 40, weight: 600, color: '#ffe2a0' });
  const items = o.items ?? [
    ['เส้นเล็ก / เส้นใหญ่ / หมี่', ''],
    ['บะหมี่ / วุ้นเส้น / มาม่า', ''],
    ['น้ำตก หมู / เนื้อ', ''],
    ['ธรรมดา', '40'],
    ['พิเศษ', '50'],
    ['เกาเหลา', '50'],
    ['ข้าวเปล่า', '10'],
    ['กาแฟ ร้อน / เย็น', '25'],
    ['โอเลี้ยง', '20'],
    ['ชาดำเย็น', '20'],
  ];
  let y = 250;
  items.forEach(([name, price], i) => {
    const col = i < 3 ? '#1e3f7a' : '#1a1a1a';
    text(g, name, 60, y, { size: i < 3 ? 52 : 50, weight: i < 3 ? 700 : 600, color: col, align: 'left', font: FONTS.sign, maxW: 520 });
    if (price) {
      text(g, thaiDigits(price) + ' .-', W - 60, y, { size: 54, weight: 700, color: '#b3201a', align: 'right' });
      g.strokeStyle = 'rgba(40,40,40,0.35)';
      g.setLineDash([4, 10]);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(300, y + 12);
      g.lineTo(W - 190, y + 12);
      g.stroke();
      g.setLineDash([]);
    }
    y += i === 2 ? 92 : 74;
  });
  weather(cv, { seed: 161, fade: 0.35, grime: 0.55, streaks: 0.8, chips: 0.35, substrate: '#8a8780', edge: 0.5, scratches: 0.3, rust: [[0.04, 0.03], [0.96, 0.03]], rustEdge: 0.6, wobble: 2.2, paint: 0.3 });
  return { cv, size: [0.75, 1.0] };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
const DESIGNS = {
  km_marker: kmMarker,
  curve_warning: curveWarning,
  elephant_crossing: elephantCrossing,
  village_sign: villageSign,
  shrine_board: shrineBoard,
  couplet,
  taxi_roof: taxiRoof,
  vacant_lamp: vacantLamp,
  plate,
  garage_sign: garageSign,
  bus_stop_sign: busStopSign,
  temple_sign: templeSign,
  fork_sign: forkSign,
  speed_sign: speedSign,
  warning_sign: (o) => warningOrShop(o, 'warning_sign'),
  shop_sign: shopSign,
  noodle_menu: noodleMenu,
  ...PRINTED,
};

/**
 * Sign kinds with their options and gallery variants (for the sandbox / docs).
 * size = suggested physical size in metres [w, h] (also on texture.userData.size).
 */
export const SIGN_KINDS = {
  km_marker: { opts: '{km, route, dest}', gallery: [{ km: 9 }, { km: 12 }] },
  curve_warning: { opts: "{dir:'left'|'right'}", gallery: [{ dir: 'left' }, { dir: 'right' }] },
  elephant_crossing: { opts: '{th}' },
  village_sign: { opts: '{th, en, sub}' },
  shrine_board: { opts: '{th, cn}' },
  couplet: { opts: "{text (CJK chars), side:'left'|'right'}", gallery: [{ side: 'left' }, { side: 'right' }] },
  taxi_roof: { opts: '{}' },
  vacant_lamp: { opts: '{lit=true}', gallery: [{}, { lit: false }] },
  plate: { opts: '{text, province}' },
  sticker: { opts: "{variant:'drive_slow'|'yantra'|'cartoon'|'lucky'|'no_smoking'|'merit'}", gallery: [{ variant: 'drive_slow' }, { variant: 'yantra' }, { variant: 'cartoon' }, { variant: 'lucky' }, { variant: 'no_smoking' }, { variant: 'merit' }] },
  poster: { opts: "{variant:'drink'|'balm'|'movie'|'concert'|'election'|'temple_fair'}", gallery: [{ variant: 'drink' }, { variant: 'balm' }, { variant: 'movie' }, { variant: 'concert' }, { variant: 'election' }, { variant: 'temple_fair' }] },
  drink_label: { opts: "{variant:'red_soda'|'energy'|'water'|'coffee'|'beer'|'whisky'}", gallery: [{ variant: 'red_soda' }, { variant: 'energy' }, { variant: 'water' }, { variant: 'coffee' }, { variant: 'beer' }, { variant: 'whisky' }] },
  snack_wrapper: { opts: "{variant:'chips'|'candy'|'noodles'|'biscuit'}", gallery: [{ variant: 'chips' }, { variant: 'candy' }, { variant: 'noodles' }, { variant: 'biscuit' }] },
  receipt: { opts: '{lines:[...], date, time, fare, km, ghost}', gallery: [{}, { ghost: true }] },
  lottery: { opts: '{number, date}' },
  calendar: { opts: '{month:0..11, year (B.E.)}' },
  noodle_menu: { opts: '{title, shop, items:[[name, price]]}' },
  garage_sign: { opts: '{th, sub}' },
  bus_stop_sign: { opts: '{route}' },
  temple_sign: { opts: '{th, sub}' },
  fork_sign: { opts: "{side:'left'|'right', th, sub}", gallery: [{ side: 'left' }, { side: 'right' }] },
  amulet_face: { opts: '{} (userData.normalMap = relief)' },
  buddha_card: { opts: '{name}' },
  speed_sign: { opts: '{kmh}', gallery: [{ kmh: 60 }, { kmh: 40 }] },
  warning_sign: { opts: '{th, en}' },
  shop_sign: { opts: '{th, en, foot}' },
};

/** Build the CanvasTexture for a sign kind. */
export function drawSign(kind, opts = {}) {
  const fn = DESIGNS[kind];
  let r;
  if (!fn) {
    console.warn(`[textures] unknown sign kind "${kind}"`);
    const cv = newCanvas(256, 128);
    cv.g.fillStyle = '#d8c79a';
    cv.g.fillRect(0, 0, 256, 128);
    text(cv.g, opts.th || opts.text || kind, 128, 64, { size: 28, maxW: 240 });
    r = { cv, size: [1, 0.5] };
  } else r = fn(opts);
  const t = new THREE.CanvasTexture(r.cv.c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.userData = { kind, aspect: r.cv.w / r.cv.h, alpha: !!r.alpha, size: r.size, ...(r.extra || {}) };
  return t;
}
