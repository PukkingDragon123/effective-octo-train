// Printed matter & small objects: stickers, vintage posters, drink labels, snack wrappers,
// meter receipts, a lottery ticket, a wall calendar, an amulet face (with relief normal map)
// and a laminated Buddha card. Every brand, person and product is fictional.
import * as THREE from 'three';
import { FONTS } from '../ui/fonts.js';
import { newCanvas, rr, text, cjk, buddha, bust, sunburst, wash, halftone, weather, thaiDigits, makeRng } from './signkit.js';
import { normalMap, rgb } from './painter.js';
import { blur } from './noise.js';

const PI = Math.PI;
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

// ---------------------------------------------------------------------------
// STICKERS (die-cut, alpha)
// ---------------------------------------------------------------------------
function dieCut(g, draw, W, H, r = 28, border = 14) {
  g.fillStyle = '#f4f1e8';
  rr(g, 4, 4, W - 8, H - 8, r + border);
  g.fill();
  g.save();
  rr(g, 4 + border, 4 + border, W - 8 - border * 2, H - 8 - border * 2, r);
  g.clip();
  draw();
  g.restore();
}

function khomLine(g, x, y, w, size, color, rng) {
  // pseudo Khom script line for yantra (loops, hooks and tails)
  g.save();
  g.strokeStyle = color;
  g.lineWidth = size * 0.12;
  g.lineCap = 'round';
  let cx = x;
  while (cx < x + w - size * 0.6) {
    const s = size * (0.42 + rng() * 0.18);
    g.beginPath();
    const kind = (rng() * 4) | 0;
    if (kind === 0) {
      g.arc(cx + s * 0.5, y, s * 0.35, PI * 0.2, PI * 2.1);
      g.lineTo(cx + s * 0.85, y - s * 0.7);
    } else if (kind === 1) {
      g.moveTo(cx, y - s * 0.4);
      g.quadraticCurveTo(cx + s * 0.5, y + s * 0.6, cx + s, y - s * 0.4);
      g.arc(cx + s * 0.85, y - s * 0.5, s * 0.15, 0, PI * 2);
    } else if (kind === 2) {
      g.arc(cx + s * 0.3, y + s * 0.1, s * 0.25, 0, PI * 2);
      g.moveTo(cx + s * 0.55, y + s * 0.1);
      g.lineTo(cx + s * 0.55, y - s * 0.55);
      g.quadraticCurveTo(cx + s * 0.9, y - s * 0.7, cx + s * 0.9, y - s * 0.2);
    } else {
      g.moveTo(cx, y);
      g.bezierCurveTo(cx + s * 0.3, y - s * 0.7, cx + s * 0.7, y + s * 0.6, cx + s, y - s * 0.1);
    }
    g.stroke();
    if (rng() < 0.3) {
      g.beginPath();
      g.arc(cx + s * 0.5, y - s * 0.85, s * 0.08, 0, PI * 2);
      g.stroke();
    }
    cx += s * 1.2;
  }
  g.restore();
}

function sticker(o) {
  const v = o.variant ?? 'drive_slow';
  const rng = makeRng(301 + v.length);
  if (v === 'yantra') {
    // Gao Yord-style sak yant: nine stacked spires over lines of script, ink on cream
    const W = 512, H = 512;
    const cv = newCanvas(W, H);
    const { g } = cv;
    dieCut(g, () => {
      g.fillStyle = '#e9dfc4';
      g.fillRect(0, 0, W, H);
      const ink = '#1d2a4a';
      g.strokeStyle = ink;
      g.lineWidth = 6;
      g.strokeRect(46, 46, W - 92, H - 92);
      const spire = (x, y, s) => {
        g.beginPath();
        g.moveTo(x - s * 0.5, y);
        g.quadraticCurveTo(x - s * 0.45, y - s * 0.9, x, y - s * 1.6);
        g.quadraticCurveTo(x + s * 0.45, y - s * 0.9, x + s * 0.5, y);
        g.stroke();
        g.beginPath();
        g.arc(x, y - s * 0.45, s * 0.12, 0, PI * 2);
        g.stroke();
      };
      g.lineWidth = 5;
      const rows = [[256], [216, 296], [176, 256, 336], [136, 216, 296, 376]];
      rows.slice(0, 3).forEach((row, ri) => row.forEach((x) => spire(x, 150 + ri * 62, 44)));
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(96, 290);
      g.lineTo(416, 290);
      g.stroke();
      for (let l = 0; l < 4; l++) khomLine(g, 92, 330 + l * 34, 330, 34, ink, rng);
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(96 + i * 40, 80, 5, 0, PI * 2);
        g.fillStyle = ink;
        g.fill();
      }
    }, W, H, 30);
    weather(cv, { seed: 311, fade: 0.45, fadeTint: '#d8d0b8', grime: 0.35, edge: 0.5, scratches: 0.4, paint: 0.15, dust: 0.3 });
    return { cv, size: [0.09, 0.09], alpha: true };
  }
  if (v === 'cartoon') {
    // faded cartoon kid: round head, big grin, yellow cap, thumbs up, "สู้ๆ!" — ORIGINAL design
    const W = 512, H = 512;
    const cv = newCanvas(W, H);
    const { g } = cv;
    g.fillStyle = '#f4f1e8';
    g.beginPath();
    g.arc(W / 2, H / 2, 244, 0, PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(W / 2, H / 2, 228, 0, PI * 2);
    g.clip();
    sunburst(g, W / 2, H / 2, 300, 24, '#5fb7d8', '#8fd0e6');
    // body
    g.fillStyle = '#e8512e';
    rr(g, 166, 330, 180, 160, 60);
    g.fill();
    // thumbs-up hand
    g.fillStyle = '#f2c79a';
    g.strokeStyle = '#3a2418';
    g.lineWidth = 7;
    rr(g, 318, 300, 64, 58, 18);
    g.fill();
    g.stroke();
    rr(g, 338, 250, 26, 62, 12);
    g.fill();
    g.stroke();
    // head
    g.fillStyle = '#f2c79a';
    g.beginPath();
    g.arc(250, 226, 112, 0, PI * 2);
    g.fill();
    g.stroke();
    // cap
    g.fillStyle = '#f2c832';
    g.beginPath();
    g.arc(250, 196, 114, PI * 1.02, PI * 1.98);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(176, 190, 64, 18, -0.1, 0, PI * 2);
    g.fill();
    g.stroke();
    // eyes, cheeks, grin
    g.fillStyle = '#2a1a12';
    for (const x of [212, 290]) {
      g.beginPath();
      g.ellipse(x, 230, 13, 18, 0, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    for (const x of [216, 294]) {
      g.beginPath();
      g.arc(x, 224, 5, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(232,96,90,0.55)';
    for (const x of [186, 318]) {
      g.beginPath();
      g.ellipse(x, 262, 18, 11, 0, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = '#7a1e18';
    g.beginPath();
    g.moveTo(208, 270);
    g.quadraticCurveTo(250, 320, 294, 270);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    text(g, 'สู้ๆ!', 136, 410, { size: 92, weight: 800, color: '#ffffff', stroke: '#c8261e', strokeW: 16, rotate: -0.18 });
    weather(cv, { seed: 321, fade: 0.75, fadeTint: '#d8e8ea', grime: 0.3, edge: 0.55, scratches: 0.6, paint: 0.18, dust: 0.4, chips: 0.25, substrate: '#e8e4d8' });
    return { cv, size: [0.08, 0.08], alpha: true };
  }
  const W = 768, H = 256;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const designs = {
    drive_slow: { bg: '#f2c832', fg: '#1a1a1a', th: 'ขับช้าๆ ปลอดภัย', sub: 'ถึงช้าดีกว่าไม่ถึง' },
    lucky: { bg: '#c8261e', fg: '#f6d46a', th: 'รวยๆ เฮงๆ', sub: 'ค้าขายร่ำรวย' },
    no_smoking: { bg: '#f4f1e8', fg: '#c8261e', th: 'ห้ามสูบบุหรี่', sub: 'ในรถ  ขอบคุณครับ' },
    merit: { bg: '#2a4a8a', fg: '#f6e6a8', th: 'สาธุ ๙๙', sub: 'ขอให้แคล้วคลาดปลอดภัย' },
  };
  const ds = designs[v] || designs.drive_slow;
  dieCut(g, () => {
    g.fillStyle = ds.bg;
    g.fillRect(0, 0, W, H);
    if (v === 'no_smoking') {
      g.strokeStyle = '#c8261e';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(120, H / 2, 74, 0, PI * 2);
      g.moveTo(68, H / 2 - 52);
      g.lineTo(172, H / 2 + 52);
      g.stroke();
      g.fillStyle = '#3a3a3a';
      g.fillRect(70, H / 2 - 10, 92, 20);
    }
    const cx = v === 'no_smoking' ? 470 : W / 2;
    text(g, ds.th, cx, 110, { size: 92, weight: 800, color: ds.fg, maxW: v === 'no_smoking' ? 520 : W - 90 });
    text(g, ds.sub, cx, 190, { size: 42, weight: 600, color: ds.fg, maxW: W - 120, alpha: 0.9 });
  }, W, H, 30);
  weather(cv, { seed: 331 + v.length, fade: 0.5, grime: 0.3, edge: 0.5, scratches: 0.45, paint: 0.15, dust: 0.3, chips: 0.2, substrate: '#e8e4d8' });
  return { cv, size: [0.2, 0.067], alpha: true };
}

// ---------------------------------------------------------------------------
// POSTERS (vintage, hand-painted print look)
// ---------------------------------------------------------------------------
function poster(o) {
  const v = o.variant ?? 'movie';
  const W = 512, H = 724;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const rng = makeRng(401 + v.length * 7);
  const paper = '#ece2c6';
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  if (v === 'movie') {
    // ผีกะดึก — fictional 1970s-style horror film
    wash(g, W, H, ['#1a2a2a', '#0e1616', '#3a4a3a', '#2a1414'], 403, 14);
    g.fillStyle = 'rgba(10,14,14,0.55)';
    g.fillRect(0, 0, W, H);
    // pale face in long hair
    g.fillStyle = '#0a0a0a';
    g.beginPath();
    g.ellipse(256, 300, 150, 230, 0, 0, PI * 2);
    g.fill();
    const fg = g.createRadialGradient(256, 290, 10, 256, 300, 110);
    fg.addColorStop(0, '#e8e4d0');
    fg.addColorStop(1, '#8a948a');
    g.fillStyle = fg;
    g.beginPath();
    g.ellipse(256, 300, 78, 108, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = '#0a0a0a';
    for (const x of [224, 288]) {
      g.beginPath();
      g.ellipse(x, 290, 16, 9, 0, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = '#5a0a0a';
    g.beginPath();
    g.ellipse(256, 360, 12, 18, 0, 0, PI * 2);
    g.fill();
    // hair strands over the face
    g.strokeStyle = '#050505';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 2 + rng() * 4;
      const x = 180 + rng() * 150;
      g.beginPath();
      g.moveTo(x, 170);
      g.bezierCurveTo(x + (rng() - 0.5) * 60, 280, x + (rng() - 0.5) * 60, 380, x + (rng() - 0.5) * 50, 520);
      g.stroke();
    }
    text(g, 'ผีกะดึก', W / 2, 590, { size: 120, weight: 800, color: '#c8261e', stroke: '#1a0a08', strokeW: 10, maxW: W - 50 });
    text(g, 'อย่าหันหลังกลับไปมอง...', W / 2, 668, { size: 34, weight: 600, color: '#e8d8b0' });
    text(g, 'ฉายแล้ววันนี้ ณ โรงภาพยนตร์เฉลิมมารวย', W / 2, 60, { size: 26, weight: 600, color: '#e8d8b0', maxW: W - 60 });
  } else if (v === 'concert') {
    // luk thung concert of (the late) Saman Siang Thong at the temple fair
    sunburst(g, W / 2, 330, 600, 32, '#e8b02a', '#f2cf5a');
    g.fillStyle = '#7a1418';
    g.fillRect(0, 0, W, 140);
    text(g, 'คอนเสิร์ตลูกทุ่ง', W / 2, 52, { size: 56, weight: 800, color: '#f6e6a8' });
    text(g, 'มันส์ทั้งคืน ไม่มีพัก', W / 2, 108, { size: 34, weight: 600, color: '#ffffff' });
    bust(g, W / 2, 330, 300, '#2a1a3a', '#0a0a10');
    // sequin sparkle on the jacket
    for (let i = 0; i < 180; i++) {
      const a = rng() * PI, r = 60 + rng() * 80;
      g.fillStyle = rng() < 0.5 ? '#f6e6a8' : '#d8c0f0';
      g.fillRect(256 + Math.cos(a) * r * 1.3 - 60 + rng() * 120 - 60, 400 + rng() * 80, 3, 3);
    }
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(300, 420);
    g.lineTo(330, 300);
    g.stroke();
    g.fillStyle = '#3a3a3a';
    g.beginPath();
    g.ellipse(332, 292, 12, 16, 0.2, 0, PI * 2);
    g.fill();
    g.fillStyle = '#7a1418';
    g.fillRect(0, 500, W, 224);
    text(g, 'สมาน เสียงทอง', W / 2, 560, { size: 82, weight: 800, color: '#f6d46a', stroke: '#2a0606', strokeW: 8, maxW: W - 40 });
    text(g, 'งานประจำปีวัดป่ามารวย', W / 2, 628, { size: 40, weight: 700, color: '#ffffff' });
    text(g, 'คืนวันเสาร์ที่ ๑๕ มีนาคม ๒๕๓๘', W / 2, 680, { size: 32, weight: 600, color: '#f2e2b8' });
    halftone(g, 0, 140, W, 360, 9, '#7a1418', 0.12);
  } else if (v === 'election') {
    g.fillStyle = '#f4f1e8';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#1e5aa8';
    g.fillRect(0, 0, W, 120);
    text(g, 'เลือกตั้ง ส.อบต.', W / 2, 60, { size: 62, weight: 800, color: '#ffffff' });
    g.fillStyle = '#c8261e';
    g.beginPath();
    g.arc(110, 230, 80, 0, PI * 2);
    g.fill();
    text(g, 'เบอร์', 110, 196, { size: 34, weight: 700, color: '#ffffff' });
    text(g, '๙', 110, 262, { size: 110, weight: 800, color: '#ffffff' });
    // painted portrait (generic, fictional)
    g.fillStyle = '#d8d0bc';
    g.fillRect(220, 150, 250, 300);
    bust(g, 345, 310, 250, '#3a3028');
    g.fillStyle = '#c49a78';
    g.beginPath();
    g.ellipse(345, 250, 34, 44, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = '#1a1410';
    g.beginPath();
    g.ellipse(345, 220, 36, 20, 0, PI, PI * 2);
    g.fill();
    g.fillStyle = '#f4f1e8';
    g.fillRect(300, 360, 90, 90);
    g.fillStyle = '#1e5aa8';
    g.beginPath();
    g.moveTo(345, 360);
    g.lineTo(330, 450);
    g.lineTo(360, 450);
    g.closePath();
    g.fill();
    text(g, 'นายบุญมี ใจดี', W / 2, 510, { size: 70, weight: 800, color: '#1e5aa8', maxW: W - 50 });
    text(g, 'ถนนดี ไฟสว่าง ทั่วหมู่บ้าน', W / 2, 580, { size: 40, weight: 700, color: '#c8261e', maxW: W - 50 });
    text(g, 'ทำจริง ไม่ทิ้งชาวบ้าน', W / 2, 640, { size: 34, weight: 600, color: '#333333' });
  } else if (v === 'drink') {
    sunburst(g, W / 2, 300, 600, 28, '#c8261e', '#e0442a');
    // bottle
    const bx = W / 2;
    g.fillStyle = '#5a2a10';
    rr(g, bx - 60, 210, 120, 260, 30);
    g.fill();
    g.fillRect(bx - 22, 150, 44, 70);
    g.fillStyle = '#f2c832';
    g.fillRect(bx - 26, 140, 52, 18);
    g.fillStyle = '#f6e6a8';
    rr(g, bx - 56, 290, 112, 110, 8);
    g.fill();
    text(g, 'ม้าเหล็ก', bx, 330, { size: 34, weight: 800, color: '#c8261e' });
    text(g, 'M-LEK', bx, 370, { size: 22, weight: 700, color: '#1a1a1a' });
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(bx - 44, 220, 12, 230);
    text(g, 'ม้าเหล็ก', W / 2, 70, { size: 110, weight: 800, color: '#f6d46a', stroke: '#3a0606', strokeW: 10 });
    text(g, 'เครื่องดื่มบำรุงกำลัง', W / 2, 520, { size: 48, weight: 800, color: '#ffffff', stroke: '#3a0606', strokeW: 7 });
    text(g, 'สู้งานหนัก ไม่มีถอย!', W / 2, 590, { size: 44, weight: 700, color: '#f6d46a' });
    text(g, 'ขวดละ ๑๐ บาท', W / 2, 660, { size: 36, weight: 600, color: '#ffffff' });
  } else if (v === 'balm') {
    wash(g, W, H, ['#1e5a3a', '#2a7a4a', '#14402a', '#3a8a5a'], 405, 10);
    // jar + peacock feather eyes
    for (let i = 0; i < 7; i++) {
      const a = -PI / 2 + (i - 3) * 0.32;
      const x = W / 2 + Math.cos(a) * 190, y = 360 + Math.sin(a) * 190;
      g.strokeStyle = '#c9a046';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(W / 2, 360);
      g.lineTo(x, y);
      g.stroke();
      for (const [r, c] of [[34, '#1e8a6a'], [24, '#2a5ab0'], [14, '#f2c832'], [7, '#1a1a3a']]) {
        g.fillStyle = c;
        g.beginPath();
        g.ellipse(x, y, r * 0.8, r, a + PI / 2, 0, PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#d4a541';
    rr(g, W / 2 - 80, 330, 160, 40, 10);
    g.fill();
    g.fillStyle = '#c8261e';
    rr(g, W / 2 - 74, 368, 148, 110, 14);
    g.fill();
    text(g, 'นกยูงทอง', W / 2, 420, { size: 34, weight: 800, color: '#f6d46a' });
    text(g, 'ยาหม่องตรานกยูงทอง', W / 2, 74, { size: 56, weight: 800, color: '#f6d46a', stroke: '#0a2a1a', strokeW: 8, maxW: W - 40 });
    text(g, 'แก้ปวดเมื่อย วิงเวียน แมลงกัดต่อย', W / 2, 540, { size: 34, weight: 700, color: '#ffffff', maxW: W - 50 });
    text(g, 'ติดบ้าน ติดรถ อุ่นใจทุกเส้นทาง', W / 2, 600, { size: 34, weight: 600, color: '#f2e2b8', maxW: W - 50 });
    text(g, 'ขวดเล็ก ๕ บาท  ขวดใหญ่ ๑๒ บาท', W / 2, 668, { size: 30, weight: 600, color: '#ffffff' });
  } else {
    // temple fair
    wash(g, W, H, ['#e8b02a', '#c8261e', '#f2cf5a', '#d86a2a'], 406, 12);
    text(g, 'งานประจำปี', W / 2, 70, { size: 66, weight: 800, color: '#ffffff', stroke: '#6a0a0a', strokeW: 9 });
    text(g, 'วัดป่ามารวย', W / 2, 150, { size: 84, weight: 800, color: '#f6e6a8', stroke: '#6a0a0a', strokeW: 10 });
    // lanterns string
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 78, y = 230 + Math.sin(i) * 10;
      g.fillStyle = '#c8261e';
      g.beginPath();
      g.ellipse(x, y, 24, 30, 0, 0, PI * 2);
      g.fill();
      g.fillStyle = '#f2c832';
      g.fillRect(x - 10, y - 34, 20, 6);
      g.fillRect(x - 10, y + 28, 20, 6);
    }
    g.fillStyle = 'rgba(40,10,10,0.75)';
    rr(g, 40, 300, W - 80, 290, 18);
    g.fill();
    const lines = ['ลิเกคณะ ศรีมารวย', 'หนังกลางแปลง ๒ เรื่อง', 'รำวงย้อนยุค', 'ชิงช้าสวรรค์ · ปาเป้า · ยิงปืน'];
    lines.forEach((l, i) => text(g, l, W / 2, 350 + i * 64, { size: 42, weight: 700, color: i === 0 ? '#f6d46a' : '#ffffff', maxW: W - 110 }));
    text(g, '๑๓ - ๑๗ มีนาคม  ไม่เสียค่าเข้างาน', W / 2, 650, { size: 32, weight: 700, color: '#2a0606' });
  }
  weather(cv, { seed: 411 + v.length, fade: 0.55, grime: 0.4, streaks: 0.7, edge: 0.6, paper: 0.8, creases: [[0.5, 0, 0.5, 1], [0, 0.5, 1, 0.5]], tear: 0.8, paint: 0.25, scratches: 0.2 });
  return { cv, size: [0.42, 0.6], alpha: true };
}

// ---------------------------------------------------------------------------
// LABELS & WRAPPERS
// ---------------------------------------------------------------------------
function drinkLabel(o) {
  const v = o.variant ?? 'red_soda';
  const W = 512, H = 256;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const L = {
    red_soda: ['#c8261e', '#f6e6a8', 'น้ำแดง', 'ตรานกเงือก', 'น้ำหวานกลิ่นสละ 250 มล.'],
    energy: ['#f2c832', '#c8261e', 'ม้าเหล็ก', 'เครื่องดื่มบำรุงกำลัง', 'สู้งานหนัก 150 มล.'],
    water: ['#e8f2f4', '#1e5aa8', 'น้ำดื่ม', 'ใสเย็น', 'ผ่านการกรอง 600 มล.'],
    coffee: ['#3a2418', '#e8c890', 'กาแฟเย็น', 'ตราดาวเหนือ', 'สูตรเข้มข้น 180 มล.'],
    beer: ['#1e4a2a', '#f2d46a', 'เบียร์', 'ตรานกฮูก', 'ลาเกอร์ 5% 640 มล.'],
    whisky: ['#e8dcc0', '#7a1418', 'สุรารวงข้าว', '40 ดีกรี', 'ห้ามจำหน่ายแก่ผู้มีอายุต่ำกว่า 20 ปี'],
  }[v] || ['#c8261e', '#f6e6a8', 'น้ำแดง', '', ''];
  g.fillStyle = L[0];
  g.fillRect(0, 0, W, H);
  // repeating band pattern (wraps around the bottle)
  g.fillStyle = L[1];
  g.globalAlpha = 0.85;
  g.fillRect(0, 20, W, 8);
  g.fillRect(0, H - 28, W, 8);
  g.globalAlpha = 1;
  for (const cx of [W * 0.25, W * 0.75]) {
    g.fillStyle = L[1];
    g.beginPath();
    g.ellipse(cx, H * 0.52, 100, 82, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = L[0];
    g.beginPath();
    g.ellipse(cx, H * 0.52, 92, 74, 0, 0, PI * 2);
    g.fill();
    text(g, L[2], cx, H * 0.45, { size: 52, weight: 800, color: L[1], maxW: 170 });
    text(g, L[3], cx, H * 0.66, { size: 26, weight: 700, color: L[1], maxW: 160 });
  }
  text(g, L[4], W / 2, H - 46, { size: 18, weight: 600, color: L[1], maxW: W - 40 });
  weather(cv, { seed: 501 + v.length, fade: 0.45, grime: 0.35, edge: 0.3, paper: 0.6, scratches: 0.4, paint: 0.18, dust: 0.3 });
  return { cv, size: [0.2, 0.1] };
}

function snackWrapper(o) {
  const v = o.variant ?? 'chips';
  const W = 512, H = 384;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const S = {
    chips: ['#f2c832', '#c8261e', 'ข้าวเกรียบกุ้ง', 'ตราปูทอง', 'กรอบ อร่อย ๕ บาท'],
    candy: ['#7a3a8a', '#f6e6a8', 'ลูกอมมะขาม', 'เปรี้ยว หวาน ชื่นใจ', 'เม็ดละ ๑ บาท'],
    noodles: ['#c8261e', '#f6d46a', 'บะหมี่กึ่งสำเร็จรูป', 'ตราชามทอง รสต้มยำกุ้ง', 'ซองละ ๖ บาท'],
    biscuit: ['#1e5aa8', '#ffffff', 'ขนมปังกรอบ', 'ตราเรือใบ', 'อบใหม่ทุกวัน'],
  }[v] || ['#f2c832', '#c8261e', 'ขนม', '', ''];
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, S[0]);
  grd.addColorStop(1, '#2a1a12');
  g.fillStyle = S[0];
  g.fillRect(0, 0, W, H);
  // crimped ends
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < W; x += 10) {
    g.fillRect(x, 0, 5, 26);
    g.fillRect(x, H - 26, 5, 26);
  }
  sunburst(g, W * 0.72, H * 0.55, 220, 18, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)');
  text(g, S[2], W * 0.5, 110, { size: 64, weight: 800, color: S[1], stroke: '#1a1a1a', strokeW: 6, maxW: W - 50 });
  text(g, S[3], W * 0.5, 190, { size: 40, weight: 700, color: '#ffffff', maxW: W - 60 });
  text(g, S[4], W * 0.5, 300, { size: 34, weight: 700, color: S[1], maxW: W - 70 });
  weather(cv, { seed: 551 + v.length, fade: 0.4, grime: 0.35, edge: 0.4, creases: [[0.1, 0, 0.3, 1], [0.6, 0, 0.75, 1], [0, 0.4, 1, 0.55]], scratches: 0.5, paint: 0.15, dust: 0.3 });
  return { cv, size: [0.16, 0.12] };
}

// ---------------------------------------------------------------------------
// RECEIPT / LOTTERY / CALENDAR
// ---------------------------------------------------------------------------
function receipt(o) {
  const W = 256, H = 512;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#f2efe6';
  g.fillRect(0, 0, W, H);
  const ghost = !!o.ghost;
  const lines = o.lines ?? [
    '*** แท็กซี่มิเตอร์ ***',
    `ทะเบียน  ${o.plate ?? 'ทข 9449'}`,
    '------------------------',
    `วันที่  ${o.date ?? (ghost ? '13/09/2547' : '13/09/2567')}`,
    `เวลา   ${o.time ?? (ghost ? '03:33' : '21:47')}`,
    `ระยะทาง   ${o.km ?? (ghost ? '0.0' : '7.4')} กม.`,
    `เวลารอ    ${ghost ? '99:99' : '00:04'}`,
    '------------------------',
    `ค่าโดยสาร  ${o.fare ?? (ghost ? '-35.00' : '89.00')}`,
    '------------------------',
    ghost ? 'ขอบคุณที่ใช้บริการ ...' : 'ขอบคุณที่ใช้บริการ',
    ghost ? 'แล้วพบกันใหม่ ... ทุกคืน' : 'เดินทางปลอดภัย',
  ];
  lines.forEach((l, i) => text(g, l, 18, 34 + i * 34, { size: 21, weight: 500, font: FONTS.lcd, color: '#2a2a32', align: 'left', maxW: W - 30 }));
  // thermal fade: grey streaks
  const rng = makeRng(601 + (ghost ? 1 : 0));
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(242,239,230,${0.3 + rng() * 0.5})`;
    g.fillRect(0, rng() * H, W, 2 + rng() * 10);
  }
  // torn top & bottom zigzag
  g.globalCompositeOperation = 'destination-out';
  for (const y0 of [0, H]) {
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 + (y0 ? -1 : 1) * (2 + rng() * 6));
    g.lineTo(W, y0);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  weather(cv, { seed: 611 + (ghost ? 3 : 0), fade: 0.35, grime: 0.25, edge: 0.3, paper: 0.7, creases: [[0, 0.33, 1, 0.36], [0, 0.66, 1, 0.64]], paint: 0.1, dust: 0.2 });
  return { cv, size: [0.06, 0.12], alpha: true };
}

function lottery(o) {
  const W = 512, H = 256;
  const cv = newCanvas(W, H);
  const { g } = cv;
  g.fillStyle = '#efe4c8';
  g.fillRect(0, 0, W, H);
  // guilloche
  g.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    g.strokeStyle = k % 2 ? 'rgba(160,60,110,0.35)' : 'rgba(40,110,140,0.35)';
    g.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = H / 2 + Math.sin(x * 0.03 + k * 0.6) * (40 + k * 4) * Math.cos(x * 0.007 + k);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // fictional emblem: lotus in a circle
  g.strokeStyle = '#8a2a5a';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(70, 80, 44, 0, PI * 2);
  g.stroke();
  g.fillStyle = '#8a2a5a';
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.ellipse(70 + i * 9, 86 - Math.abs(i) * -2, 8, 22, i * 0.35, 0, PI * 2);
    g.fill();
  }
  text(g, 'สลากมารวยพัฒนา', 300, 44, { size: 38, weight: 800, color: '#6a1a4a' });
  text(g, o.date ?? 'งวดวันที่ ๑๖ กันยายน ๒๕๖๗', 300, 92, { size: 24, weight: 600, color: '#2a2a2a' });
  g.fillStyle = 'rgba(255,255,255,0.7)';
  rr(g, 150, 118, 330, 82, 10);
  g.fill();
  text(g, o.number ?? '419307', 315, 160, { size: 72, weight: 700, font: FONTS.lcd, color: '#1a1a1a', spacing: 6 });
  text(g, 'ราคา ๘๐ บาท', 80, 160, { size: 26, weight: 700, color: '#6a1a4a' });
  text(g, 'ชุดที่ ๒๙  งวดที่ ๑๘', 120, 222, { size: 22, weight: 600, color: '#2a2a2a' });
  g.fillStyle = '#1a1a1a';
  const rng = makeRng(701);
  for (let x = 300; x < 490; x += 3) if (rng() < 0.6) g.fillRect(x, 212, 2, 28);
  weather(cv, { seed: 711, fade: 0.3, grime: 0.3, edge: 0.4, paper: 0.6, creases: [[0.33, 0, 0.35, 1]], paint: 0.12, dust: 0.25 });
  return { cv, size: [0.18, 0.09] };
}

function calendar(o) {
  const W = 512, H = 724;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const month = o.month ?? 8;
  const year = o.year ?? 2567;
  g.fillStyle = '#f2ede0';
  g.fillRect(0, 0, W, H);
  // painted picture: temple at sunset over paddy fields
  const sky = g.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, '#e8a84a');
  sky.addColorStop(0.6, '#f2d48a');
  sky.addColorStop(1, '#a8b46a');
  g.fillStyle = sky;
  g.fillRect(20, 20, W - 40, 290);
  g.fillStyle = '#f6e6b0';
  g.beginPath();
  g.arc(360, 170, 40, 0, PI * 2);
  g.fill();
  g.fillStyle = '#3a2a2a';
  g.beginPath();
  g.moveTo(120, 230);
  g.lineTo(150, 120);
  g.lineTo(160, 70);
  g.lineTo(170, 120);
  g.lineTo(200, 230);
  g.closePath();
  g.fill();
  g.fillRect(90, 220, 140, 20);
  g.fillStyle = '#4a6a2a';
  g.fillRect(20, 240, W - 40, 70);
  wash(g, W, 320, ['#c8862a', '#6a8a3a'], 801, 5);
  g.fillStyle = '#f2ede0';
  g.fillRect(0, 310, W, H - 310);
  text(g, TH_MONTHS[month], W / 2 - 40, 350, { size: 52, weight: 800, color: '#a8201a' });
  text(g, thaiDigits(`พ.ศ. ${year}`), W / 2 + 150, 352, { size: 30, weight: 700, color: '#2a2a2a' });
  const days = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const cw = (W - 40) / 7;
  days.forEach((d, i) => text(g, d, 20 + cw * (i + 0.5), 400, { size: 26, weight: 700, color: i === 0 ? '#a8201a' : '#2a2a2a' }));
  const first = new Date(year - 543, month, 1).getDay();
  const dim = new Date(year - 543, month + 1, 0).getDate();
  for (let dI = 1; dI <= dim; dI++) {
    const idx = first + dI - 1;
    const col = idx % 7, row = Math.floor(idx / 7);
    const x = 20 + cw * (col + 0.5), y = 446 + row * 52;
    text(g, String(dI), x, y, { size: 32, weight: 600, color: col === 0 ? '#a8201a' : '#1a1a1a' });
    text(g, thaiDigits(((dI + 13) % 30) + 1), x + 20, y + 18, { size: 13, weight: 500, color: '#7a6a5a' });
    if (dI % 7 === 3) {
      g.fillStyle = '#d4a541';
      g.beginPath();
      g.arc(x - 22, y - 16, 4, 0, PI * 2);
      g.fill();
    }
  }
  text(g, 'ร้านทองมารวย  ขอสวัสดีปีใหม่', W / 2, H - 22, { size: 22, weight: 600, color: '#a8201a' });
  weather(cv, { seed: 811 + month, fade: 0.5, grime: 0.4, streaks: 0.4, edge: 0.6, paper: 0.9, creases: [[0, 0.44, 1, 0.42]], tear: 0.4, paint: 0.25, dust: 0.4 });
  return { cv, size: [0.36, 0.51], alpha: true };
}

// ---------------------------------------------------------------------------
// AMULET FACE (Somdej-style seated figure in an arch, with relief normal map)
// ---------------------------------------------------------------------------
function amuletFace() {
  const W = 256, H = 384;
  // 1) height map
  const hv = newCanvas(W, H);
  const hg = hv.g;
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, W, H);
  hg.fillStyle = '#5a5a5a';
  rr(hg, 34, 34, W - 68, H - 68, 18);
  hg.fill();
  hg.strokeStyle = '#9a9a9a';
  hg.lineWidth = 6;
  hg.beginPath();
  hg.moveTo(64, H - 60);
  hg.lineTo(64, 150);
  hg.quadraticCurveTo(W / 2, 30, W - 64, 150);
  hg.lineTo(W - 64, H - 60);
  hg.stroke();
  buddha(hg, W / 2, 196, 170, '#d8d8d8');
  hg.fillStyle = '#b0b0b0';
  for (let i = 0; i < 3; i++) hg.fillRect(70 + i * 8, 290 + i * 16, W - 140 - i * 16, 12);
  const hid = hg.getImageData(0, 0, W, H).data;
  let Hf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) Hf[i] = hid[i * 4] / 255;
  Hf = blur(Hf, W, H, 2, 2);
  // 2) colour: brass casing + cream clay face
  const cv = newCanvas(W, H);
  const { g } = cv;
  const brass = g.createLinearGradient(0, 0, W, H);
  brass.addColorStop(0, '#e8c46a');
  brass.addColorStop(0.5, '#a07a2a');
  brass.addColorStop(1, '#d4ac54');
  g.fillStyle = brass;
  rr(g, 2, 2, W - 4, H - 4, 34);
  g.fill();
  g.fillStyle = '#d8ccb0';
  rr(g, 30, 30, W - 60, H - 60, 20);
  g.fill();
  const id = g.getImageData(0, 0, W, H);
  const d = id.data;
  const L = [-0.5, -0.7, 0.55];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (d[i * 4 + 3] === 0) continue;
      const dx = (Hf[i + 1] - Hf[i - 1]) * 6, dy = (Hf[i + W] - Hf[i - W]) * 6;
      const nl = 1 / Math.hypot(dx, dy, 1);
      const ndl = (-dx * L[0] - dy * L[1] + L[2]) * nl;
      const m = 0.55 + ndl * 0.65 - (1 - Hf[i]) * 0.1;
      const aged = Hf[i] < 0.42 && x > 30 && x < W - 30 && y > 30 && y < H - 30 ? 0.78 : 1; // grime in recesses
      d[i * 4] = Math.min(255, d[i * 4] * m * aged);
      d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * m * aged);
      d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * m * aged * 0.95);
    }
  }
  g.putImageData(id, 0, 0);
  weather(cv, { seed: 901, fade: 0.1, grime: 0.35, edge: 0.4, scratches: 0.4, paint: 0.15, dust: 0.3 });
  const nb = normalMap(Hf, W, H, 3);
  // flip rows for DataTexture (v up) to match the CanvasTexture orientation
  const flipped = new Uint8Array(nb.length);
  for (let y = 0; y < H; y++) flipped.set(nb.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  const nt = new THREE.DataTexture(flipped, W, H, THREE.RGBAFormat);
  nt.colorSpace = THREE.NoColorSpace;
  nt.magFilter = THREE.LinearFilter;
  nt.minFilter = THREE.LinearMipmapLinearFilter;
  nt.generateMipmaps = true;
  nt.needsUpdate = true;
  return { cv, size: [0.028, 0.042], alpha: true, extra: { normalMap: nt } };
}

function buddhaCard(o) {
  const W = 384, H = 576;
  const cv = newCanvas(W, H);
  const { g } = cv;
  const bg = g.createRadialGradient(W / 2, 220, 20, W / 2, 260, 340);
  bg.addColorStop(0, '#f8e6a0');
  bg.addColorStop(0.5, '#d89a3a');
  bg.addColorStop(1, '#7a2a14');
  g.fillStyle = bg;
  rr(g, 0, 0, W, H, 24);
  g.fill();
  sunburst(g, W / 2, 220, 420, 40, 'rgba(255,240,180,0.18)', 'rgba(255,240,180,0)');
  buddha(g, W / 2, 250, 300, '#c8901e', 'rgba(255,248,210,0.95)');
  // gilded highlights on the figure
  g.globalCompositeOperation = 'source-atop';
  const hl = g.createLinearGradient(W / 2 - 80, 120, W / 2 + 80, 380);
  hl.addColorStop(0, 'rgba(255,240,170,0.5)');
  hl.addColorStop(1, 'rgba(120,60,10,0.3)');
  g.fillStyle = hl;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(60,14,6,0.8)';
  rr(g, 22, 418, W - 44, 136, 14);
  g.fill();
  text(g, o.name ?? 'พระพุทธมารวย', W / 2, 452, { size: 42, weight: 800, color: '#f6d46a', maxW: W - 70 });
  text(g, 'อิติปิ โส ภะคะวา อะระหัง', W / 2, 500, { size: 22, weight: 600, color: '#f2e2b8', maxW: W - 70 });
  text(g, 'สัมมาสัมพุทโธ วิชชาจะระณะสัมปันโน', W / 2, 530, { size: 18, weight: 500, color: '#f2e2b8', maxW: W - 70 });
  weather(cv, { seed: 951, fade: 0.35, grime: 0.3, edge: 0.6, scratches: 0.5, gloss: 0.6, paint: 0.2, dust: 0.25 });
  return { cv, size: [0.055, 0.083], alpha: true };
}

export const PRINTED = {
  sticker,
  poster,
  drink_label: drinkLabel,
  snack_wrapper: snackWrapper,
  receipt,
  lottery,
  calendar,
  amulet_face: amuletFace,
  buddha_card: buddhaCard,
};

void rgb;
void cjk;
