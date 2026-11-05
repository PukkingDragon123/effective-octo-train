// GAME OVER as a Thai late-night TV news break: the crash footage (a canvas the game hands us)
// fills the screen with a slow push-in, compressed and scan-lined like a broadcast, under an
// original news package: a red "ข่าวด่วน" tag, the channel bug of a fictional station (ราตรี),
// a live clock, the lower-third headline and a ticker. After `hold` seconds it cuts to black.
//
//   ui.newsReport({ th, sub?, image?, hold?, kicker?, place?, ticker?: [th], keepBlack? }) -> Promise
//   (resolves once the screen is black; unless keepBlack it then fades out by itself, so the game
//    can reset underneath; ui.fade(false) releases a kept black)
import { h, sleep, nextFrame } from './dom.js';
import { screen } from './common.js';

/** Fictional ticker headlines (none of them real). */
export const NEWS_TICKER = [
  'กรมอุตุนิยมวิทยาเตือนหมอกหนาบนทางหลวงสายป่าช่วงกลางดึก ขอให้ขับขี่ด้วยความระมัดระวัง',
  'ตำรวจทางหลวงขอความร่วมมือผู้ขับขี่ งดจอดรับคนโบกรถริมทางหลังเที่ยงคืน',
  'ชาวบ้านร้องเรียนเสียงแตรดังต่อเนื่องหน้าศาลเจ้าริมทางทุกคืน',
  'โรงพยาบาลประจำจังหวัดแจ้งปิดอาคารผู้ป่วยหลังเก่าเพื่อปรับปรุง',
  'แขวงทางหลวงเร่งซ่อมราวกันตกช่วงโค้งอันตราย หลังเกิดเหตุซ้ำหลายครั้ง',
];

const SIGNAL_ID = 'dlb-news-moon';

/** Original channel mark: a waning moon over a road vanishing to a point. */
function channelBug() {
  const svg = `<svg viewBox="0 0 48 48" aria-hidden="true">
    <defs><mask id="${SIGNAL_ID}"><rect width="48" height="48" fill="#fff"/><circle cx="30.5" cy="17" r="14.5" fill="#000"/></mask></defs>
    <circle cx="24" cy="24" r="20" fill="currentColor" mask="url(#${SIGNAL_ID})"/>
    <path d="M21.6 44 23.4 25h1.2l1.8 19z" fill="#c8161d"/>
  </svg>`;
  return h('div', { class: 'dlb-news__bug' },
    h('span', { class: 'dlb-news__mark', html: svg }),
    h('span', { class: 'dlb-news__name' }, h('b', { attrs: { lang: 'th' } }, 'ราตรี'), h('small', { attrs: { lang: 'th' } }, 'สถานีข่าว')));
}

function drawCover(g, src, W, H, sw, sh) {
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s;
  const dh = sh * s;
  g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/** The footage as a broadcast frame: cover-fitted, slightly crushed, then really JPEG-compressed. */
async function footage(image, W, H) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  let src = image;
  if (typeof image === 'string') {
    src = new Image();
    src.src = image;
    try {
      await src.decode();
    } catch (e) {
      src = null;
    }
  }
  const sw = src?.videoWidth || src?.naturalWidth || src?.width || 0;
  const sh = src?.videoHeight || src?.naturalHeight || src?.height || 0;
  if (src && sw > 0 && sh > 0) {
    try {
      g.filter = 'saturate(0.82) contrast(1.06) brightness(1.04)';
      drawCover(g, src, W, H, sw, sh);
      g.filter = 'none';
    } catch (e) {
      /* tainted or detached source: keep the dark frame */
    }
  } else {
    // no footage: a dark roadside at night, lit by the patrol car
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#04060a');
    sky.addColorStop(0.55, '#0b1015');
    sky.addColorStop(1, '#030405');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const road = g.createLinearGradient(0, H * 0.6, 0, H);
    road.addColorStop(0, 'rgba(40,46,50,0.0)');
    road.addColorStop(1, 'rgba(40,46,50,0.55)');
    g.fillStyle = road;
    g.beginPath();
    g.moveTo(W * 0.46, H * 0.58);
    g.lineTo(W * 0.52, H * 0.58);
    g.lineTo(W * 1.1, H);
    g.lineTo(W * -0.1, H);
    g.fill();
  }
  // broadcast blacks are never black; a whisper of the camera's own noise
  g.fillStyle = 'rgba(18,22,26,0.16)';
  g.fillRect(0, 0, W, H);
  const n = g.getImageData(0, 0, W, H);
  const d = n.data;
  let seed = 9071;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = ((seed >>> 24) - 128) * 0.07;
    d[i] += v;
    d[i + 1] += v;
    d[i + 2] += v;
  }
  g.putImageData(n, 0, 0);
  // real compression: re-encode at a low JPEG quality and paint it back
  try {
    const url = c.toDataURL('image/jpeg', 0.42);
    const img = new Image();
    img.src = url;
    await img.decode();
    g.drawImage(img, 0, 0);
  } catch (e) {
    /* keep the clean frame */
  }
  return c;
}

const pad2 = (n) => String(n).padStart(2, '0');

export class NewsReport {
  constructor(ui) {
    this.ui = ui;
    this.el = null;
    this._raf = 0;
  }

  /** opts {th, sub?, image?, hold? (s, default 7), kicker?, place?, ticker?: [string], keepBlack?} */
  async show(o = {}) {
    const ui = this.ui;
    if (this.el) this._remove(this.el);
    const hold = Math.max(1.5, Number(o.hold) || 7);
    const W = Math.round(Math.min(1280, Math.max(640, window.innerWidth * 0.62)));
    const H = Math.round(W * (window.innerHeight / Math.max(1, window.innerWidth)));
    const frame = await footage(o.image, W, H);
    frame.className = 'dlb-news__img';

    // the clock follows the night's hour when the game told us, else the wall clock
    const hr = Number.isFinite(ui._hour) ? ui._hour : null;
    const t0 = performance.now();
    const base = hr != null ? Math.floor(((hr % 24) + 24) % 24 * 3600) + 37 : null;
    const clockNow = () => {
      if (base == null) {
        const d = new Date();
        return [d.getHours(), d.getMinutes(), d.getSeconds()];
      }
      const s = Math.floor(base + (performance.now() - t0) / 1000);
      return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    };
    const hhmm = h('span', { class: 'hm' });
    const ss = h('span', { class: 'ss' });
    const clock = h('div', { class: 'dlb-news__clock' }, hhmm, ss);
    const tick = () => {
      const [a, b, c] = clockNow();
      hhmm.textContent = `${pad2(a)}:${pad2(b)}`;
      ss.textContent = `:${pad2(c)}`;
    };
    tick();

    const items = [o.sub, ...(Array.isArray(o.ticker) && o.ticker.length ? o.ticker : NEWS_TICKER)].filter(Boolean);
    const runItems = () => items.map((t) => h('span', { class: 'dlb-news__item', attrs: { lang: 'th' } }, h('i', { attrs: { 'aria-hidden': 'true' } }), t));
    const run = h('div', { class: 'dlb-news__run' }, runItems(), runItems());
    const [ch, cm] = clockNow();

    const el = screen('dlb-news',
      h('div', { class: 'dlb-news__feed' }, frame, o.lights === false ? null : h('div', { class: 'dlb-news__lights' })),
      h('div', { class: 'dlb-news__scan' }),
      h('div', { class: 'dlb-news__gfx' },
        channelBug(),
        h('div', { class: 'dlb-news__live' },
          h('span', { class: 'dlb-news__onair', attrs: { lang: 'th' } }, h('i'), 'สด'),
          h('span', { class: 'dlb-news__place', attrs: { lang: 'th' } }, o.place || 'ภาพจากที่เกิดเหตุ')),
        h('div', { class: 'dlb-news__lower' },
          h('div', { class: 'dlb-news__kicker' },
            h('span', { class: 'dlb-news__tag', attrs: { lang: 'th' } }, 'ข่าวด่วน'),
            h('span', { class: 'dlb-news__kick', attrs: { lang: 'th' } }, o.kicker || `เมื่อเวลา ${pad2(ch)}.${pad2(cm)} น.`)),
          h('div', { class: 'dlb-news__head' }, h('h2', { attrs: { lang: 'th' } }, o.th || ''))),
        h('div', { class: 'dlb-news__ticker' }, clock, h('div', { class: 'dlb-news__track' }, run))),
      h('div', { class: 'dlb-news__static' }),
      h('div', { class: 'dlb-news__black' }));
    el.style.setProperty('--push', `${hold + 2.4}s`);
    this.el = el;
    ui.layer.appendChild(el);
    ui._refreshXhair?.();
    ui.bus?.emit?.('ui:news', { phase: 'in' });

    // ticker + clock
    let x = 0;
    let last = performance.now();
    let lastSec = -1;
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const sec = Math.floor(now / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        tick();
      }
      if (el.closest('.dlb-still')) return; // frozen for headless screenshots
      const half = run.scrollWidth / 2;
      if (!el.classList.contains('is-rolling') || half <= 0) return;
      x += dt * Math.max(70, window.innerWidth * 0.075);
      if (x > half) x -= half;
      run.style.transform = `translate3d(${-x.toFixed(1)}px,0,0)`;
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(loop);

    el.hidden = false;
    void el.offsetWidth;
    await nextFrame();
    el.classList.add('is-in'); // cut in, the footage starts pushing in
    await sleep(380);
    el.classList.add('is-gfx'); // the graphics package wipes on
    await sleep(900);
    el.classList.add('is-rolling');
    await sleep(Math.max(0, hold * 1000 - 1280));
    el.classList.add('is-black');
    await sleep(1700);
    ui.bus?.emit?.('ui:news', { phase: 'black' });
    cancelAnimationFrame(this._raf);
    if (!o.keepBlack) {
      setTimeout(() => this.release(1.6, el), 450);
    }
  }

  /** Fade out a news screen held black (keepBlack), or the given one. */
  release(secs = 1.6, el = this.el) {
    if (!el || el._released) return;
    el._released = true;
    el.style.transition = `opacity ${secs}s cubic-bezier(.65,0,.35,1)`;
    el.classList.remove('is-in');
    setTimeout(() => this._remove(el), secs * 1000 + 100);
  }

  _remove(el) {
    el.remove();
    if (this.el === el) {
      this.el = null;
      cancelAnimationFrame(this._raf);
    }
    this.ui._refreshXhair?.();
  }
}
