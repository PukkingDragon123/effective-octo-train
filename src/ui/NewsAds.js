// Late-night TV commercials for the news break: three original parody ads, each ~4–5 s of kinetic
// typography over a painted product shot (canvas). All brands are invented.
//   แรดเหล็ก        an energy drink in a small brown bottle (the Thai 150 ml kind)
//   ยาหม่องตรางูเห่าทอง  a herbal balm in a round tin
//   ป้าเฮงล็อตเตอรี่     a lottery stall at KM 9 with tonight's "lucky" number
// buildAd(kind) -> { el, vo: { th, voice } } ; the element animates when it gets the class is-on.
import { h } from './dom.js';
import { FONTS } from './fonts.js';

function canvas(w, hgt, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  draw(c.getContext('2d'), w, hgt);
  return c;
}

/** The energy drink: a small amber bottle, crown cap, a yellow label with a red rhino horn. */
function drinkArt() {
  return canvas(420, 900, (x, W, H) => {
    const cx = W / 2;
    const path = () => {
      x.beginPath();
      x.moveTo(cx - 34, 70);
      x.bezierCurveTo(cx - 34, 150, cx - 42, 210, cx - 92, 300);
      x.bezierCurveTo(cx - 112, 340, cx - 112, 380, cx - 112, 420);
      x.lineTo(cx - 112, 820);
      x.quadraticCurveTo(cx - 112, 860, cx - 70, 862);
      x.lineTo(cx + 70, 862);
      x.quadraticCurveTo(cx + 112, 860, cx + 112, 820);
      x.lineTo(cx + 112, 420);
      x.bezierCurveTo(cx + 112, 380, cx + 112, 340, cx + 92, 300);
      x.bezierCurveTo(cx + 42, 210, cx + 34, 150, cx + 34, 70);
      x.closePath();
    };
    const glass = x.createLinearGradient(cx - 112, 0, cx + 112, 0);
    glass.addColorStop(0, '#2a1204');
    glass.addColorStop(0.22, '#7a3a0e');
    glass.addColorStop(0.5, '#4a1f06');
    glass.addColorStop(0.8, '#2e1304');
    glass.addColorStop(1, '#170902');
    path();
    x.fillStyle = glass;
    x.fill();
    // crown cap
    x.fillStyle = '#c9a43c';
    x.fillRect(cx - 40, 40, 80, 34);
    x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 9; i++) x.fillRect(cx - 38 + i * 9, 42, 3, 30);
    // label
    x.save();
    path();
    x.clip();
    x.fillStyle = '#f5c518';
    x.fillRect(0, 470, W, 300);
    x.fillStyle = '#c8161d';
    x.fillRect(0, 470, W, 26);
    x.fillRect(0, 744, W, 26);
    // the horn emblem
    x.fillStyle = '#c8161d';
    x.beginPath();
    x.moveTo(cx - 40, 690);
    x.quadraticCurveTo(cx - 20, 600, cx + 34, 548);
    x.quadraticCurveTo(cx + 6, 620, cx + 30, 690);
    x.closePath();
    x.fill();
    x.fillStyle = '#111';
    x.font = `800 54px ${FONTS.body}`;
    x.textAlign = 'center';
    x.fillText('แรดเหล็ก', cx, 735);
    x.restore();
    // glass highlights
    x.save();
    path();
    x.clip();
    const hl = x.createLinearGradient(cx - 90, 0, cx - 50, 0);
    hl.addColorStop(0, 'rgba(255,220,170,0)');
    hl.addColorStop(0.5, 'rgba(255,220,170,0.45)');
    hl.addColorStop(1, 'rgba(255,220,170,0)');
    x.fillStyle = hl;
    x.fillRect(cx - 90, 300, 40, 520);
    x.fillStyle = 'rgba(255,240,210,0.25)';
    x.fillRect(cx + 70, 330, 8, 470);
    x.restore();
  });
}

/** The balm: a squat round tin seen from above at an angle, gold lid with an embossed cobra. */
function balmArt() {
  return canvas(640, 480, (x, W, H) => {
    const cx = W / 2, cy = 210, rx = 230, ry = 110, side = 90;
    const body = x.createLinearGradient(cx - rx, 0, cx + rx, 0);
    body.addColorStop(0, '#5a3d0c');
    body.addColorStop(0.3, '#d8b04a');
    body.addColorStop(0.55, '#8a6418');
    body.addColorStop(1, '#3a2606');
    x.fillStyle = body;
    x.beginPath();
    x.ellipse(cx, cy + side, rx, ry, 0, 0, Math.PI);
    x.lineTo(cx - rx, cy);
    x.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
    x.closePath();
    x.fill();
    x.fillStyle = '#9a1414';
    x.fillRect(cx - rx, cy + 30, rx * 2, 26);
    const lid = x.createRadialGradient(cx - 60, cy - 40, 10, cx, cy, rx);
    lid.addColorStop(0, '#fff1b8');
    lid.addColorStop(0.35, '#e2bb52');
    lid.addColorStop(1, '#8a6418');
    x.fillStyle = lid;
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(90,60,10,0.8)';
    x.lineWidth = 4;
    x.beginPath();
    x.ellipse(cx, cy, rx - 18, ry - 9, 0, 0, Math.PI * 2);
    x.stroke();
    // embossed cobra: a raised hood and an S body
    x.strokeStyle = 'rgba(110,70,10,0.9)';
    x.lineWidth = 10;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx - 70, cy + 50);
    x.bezierCurveTo(cx - 10, cy + 70, cx + 40, cy + 10, cx - 10, cy - 10);
    x.bezierCurveTo(cx - 50, cy - 30, cx - 10, cy - 70, cx + 20, cy - 60);
    x.stroke();
    x.fillStyle = 'rgba(110,70,10,0.9)';
    x.beginPath();
    x.ellipse(cx + 26, cy - 68, 24, 14, -0.3, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#5a3a06';
    x.font = `800 30px ${FONTS.title}`;
    x.textAlign = 'center';
    x.fillText('งูเห่าทอง', cx, cy + 86);
  });
}

/** The lottery: a fan of tickets with tonight's number. */
function lottoArt(num) {
  return canvas(760, 460, (x, W, H) => {
    const ticket = (ang, dx, tint) => {
      x.save();
      x.translate(W / 2 + dx, H / 2 + 60);
      x.rotate(ang);
      x.fillStyle = tint;
      x.fillRect(-170, -230, 340, 190);
      x.strokeStyle = 'rgba(60,40,80,0.5)';
      x.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        x.beginPath();
        x.moveTo(-170, -230 + i * 12);
        x.bezierCurveTo(-60, -236 + i * 12, 60, -224 + i * 12, 170, -230 + i * 12);
        x.stroke();
      }
      x.fillStyle = '#3a1a5a';
      x.font = `800 58px ${FONTS.body}`;
      x.textAlign = 'center';
      x.fillText(num, 0, -150);
      x.font = `600 22px ${FONTS.body}`;
      x.fillText('สลากราตรี  ราคา ๘๐ บาท', 0, -100);
      x.font = `500 18px ${FONTS.body}`;
      x.fillText('งวดคืนนี้  ชุดที่ ๐๙', 0, -70);
      x.restore();
    };
    ticket(-0.22, -150, '#d9ecd2');
    ticket(0.0, 0, '#ecd8e6');
    ticket(0.22, 150, '#e8e3c8');
  });
}

const TH_D = '๐๑๒๓๔๕๖๗๘๙';
const thd = (s) => String(s).replace(/[0-9]/g, (d) => TH_D[d]);

export function buildAd(kind) {
  if (kind === 'drink') {
    const art = drinkArt();
    art.className = 'ad-prod';
    const el = h('div', { class: 'dlb-ad ad-drink' },
      h('div', { class: 'ad-bg' }), h('div', { class: 'ad-slash' }), h('div', { class: 'ad-slash s2' }),
      art,
      h('div', { class: 'ad-copy' },
        h('div', { class: 'ad-badge', attrs: { lang: 'th' } }, 'ใหม่! สูตรเข้มข้น'),
        h('div', { class: 'ad-name', attrs: { lang: 'th' } }, 'แรดเหล็ก'),
        h('div', { class: 'ad-tag', attrs: { lang: 'th' } }, 'สู้ทั้งคืน ไม่มีหลับ!')),
      h('div', { class: 'ad-fine', attrs: { lang: 'th' } }, 'ดื่มแล้วตาค้าง · ไม่ควรดื่มเกินวันละ ๒ ขวด · ผู้ขับขี่โปรดพักทุก ๒ ชั่วโมง'));
    return { el, vo: { th: 'แรดเหล็ก! สู้ทั้งคืน ไม่มีหลับ!', voice: { gender: 'm', age: 30, pitch: 1.12, rate: 1.25 } } };
  }
  if (kind === 'balm') {
    const art = balmArt();
    art.className = 'ad-prod';
    const el = h('div', { class: 'dlb-ad ad-balm' },
      h('div', { class: 'ad-bg' }), h('div', { class: 'ad-leaves' }),
      art,
      h('div', { class: 'ad-copy' },
        h('div', { class: 'ad-name', attrs: { lang: 'th' } }, 'ยาหม่องตรางูเห่าทอง'),
        h('div', { class: 'ad-tag', attrs: { lang: 'th' } }, 'ทาปุ๊บ เย็นปั๊บ'),
        h('div', { class: 'ad-sub', attrs: { lang: 'th' } }, 'แก้ปวด แก้เมื่อย แก้ขนลุก')),
      h('div', { class: 'ad-fine', attrs: { lang: 'th' } }, 'ใช้ภายนอกเท่านั้น · ห้ามทาบริเวณตา · ผีไม่ชอบกลิ่นนี้'));
    return { el, vo: { th: 'ยาหม่องตรางูเห่าทอง ทาปุ๊บ เย็นปั๊บ', voice: { gender: 'f', age: 45, pitch: 1.02, rate: 1.05 } } };
  }
  const num = '210009';
  const art = lottoArt(thd(num));
  art.className = 'ad-prod';
  const digits = h('div', { class: 'ad-digits', attrs: { lang: 'th', 'aria-label': num } }, [...thd(num)].map((d, i) => h('span', { style: { '--i': i } }, d)));
  const el = h('div', { class: 'dlb-ad ad-lotto' },
    h('div', { class: 'ad-bg' }), h('div', { class: 'ad-rays' }),
    art,
    h('div', { class: 'ad-copy' },
      h('div', { class: 'ad-name', attrs: { lang: 'th' } }, 'ป้าเฮงล็อตเตอรี่'),
      h('div', { class: 'ad-tag', attrs: { lang: 'th' } }, 'เลขเด็ดงวดนี้'),
      digits,
      h('div', { class: 'ad-badge', attrs: { lang: 'th' } }, 'ถูกรางวัลที่ ๑ ติดกัน ๓ งวด!')),
    h('div', { class: 'ad-fine', attrs: { lang: 'th' } }, 'ร้านอยู่ปากทาง กม. ๙ · เปิดถึงตีสาม · ซื้อแล้วห้ามคืน'));
  return { el, vo: { th: 'ป้าเฮงล็อตเตอรี่ เลขเด็ดงวดนี้ สองหนึ่งศูนย์ศูนย์ศูนย์เก้า!', voice: { gender: 'm', age: 50, pitch: 0.95, rate: 1.2 } } };
}
