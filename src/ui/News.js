// The crash on the late-night news (the player then wakes at the last checkpoint; nothing on screen
// says "game over"). A full 3D studio (NewsStudio.js): an anchor at the desk reads two or three
// Thai sentences (gibberish voice through the radio band, subtitled), the crash photo on the studio
// screen behind her. Then a hard cut to the footage itself, full screen with a lower third, and
// a fade to black. No station logo. About 12-16 s; Esc / B skips after 3 s.
//
//   ui.newsReport({ th (headline), sub? (a line the anchor reads), image? (crash photo: canvas /
//                   image / URL), hold? (footage seconds, default 2.6), lines?: [th] (the anchor's
//                   script, replaces the default), place?, keepBlack? }) -> Promise
//   (resolves once the screen is black; unless keepBlack it then fades out by itself; ui.fade(false)
//    releases a kept black)
import { h, sleep, nextFrame } from './dom.js';
import { screen } from './common.js';
import { audio } from '../audio/index.js';
import { NewsStudio } from './NewsStudio.js';

/** Fictional headlines other modules may use (none of them real). */
export const NEWS_TICKER = [
  'กรมอุตุนิยมวิทยาเตือนหมอกหนาบนทางหลวงสายป่าช่วงกลางดึก ขอให้ขับขี่ด้วยความระมัดระวัง',
  'ตำรวจทางหลวงขอความร่วมมือผู้ขับขี่ งดจอดรับคนโบกรถริมทางหลังเที่ยงคืน',
  'ชาวบ้านร้องเรียนเสียงแตรดังต่อเนื่องหน้าศาลเจ้าริมทางทุกคืน',
];

/** The anchor's default script (she is a woman: ค่ะ). sub, when given, replaces the second line. */
const SCRIPT = [
  'ข่าวด่วนค่ะ เมื่อช่วงดึกที่ผ่านมา รถแท็กซี่คันหนึ่งเสียหลักพุ่งตกข้างทาง บนทางหลวงสายป่า',
  'เจ้าหน้าที่กู้ภัยเข้าตรวจสอบที่เกิดเหตุ พบคนขับติดอยู่ภายในรถ',
  'ส่วนผู้โดยสารที่พยานเห็นนั่งมาด้วย เจ้าหน้าที่ยังค้นหาไม่พบค่ะ',
];
const ANCHOR_VOICE = { gender: 'f', age: 34, pitch: 1.04, rate: 1.06 };

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
    this.studio = null;
  }

  async show(o = {}) {
    const ui = this.ui;
    if (this.el) this._remove(this.el);
    const W = Math.round(Math.min(1280, Math.max(640, window.innerWidth * 0.62)));
    const H = Math.round(W * (window.innerHeight / Math.max(1, window.innerWidth)));
    const frame = await footage(o.image, W, H);
    frame.className = 'dlb-news__img';
    const hr = Number.isFinite(ui._hour) ? ui._hour : null;
    const d = new Date();
    const hh = hr != null ? Math.floor(((hr % 24) + 24) % 24) : d.getHours();
    const mm = hr != null ? Math.floor((hr % 1) * 60) : d.getMinutes();

    const stage = h('div', { class: 'dlb-news__stage' });
    const el = screen('dlb-news',
      stage,
      h('div', { class: 'dlb-news__studio' },
        h('span', { class: 'dlb-news__tag', attrs: { lang: 'th' } }, 'ข่าวด่วน'),
        h('span', { class: 'dlb-news__live', attrs: { lang: 'th' } }, h('i'), `สด  ${pad2(hh)}:${pad2(mm)}`)),
      h('div', { class: 'dlb-news__cut' },
        frame,
        h('div', { class: 'dlb-news__vig' }),
        h('div', { class: 'dlb-news__lower' },
          h('div', { class: 'dlb-news__kicker' },
            h('span', { class: 'dlb-news__tag', attrs: { lang: 'th' } }, 'ข่าวด่วน'),
            h('span', { class: 'dlb-news__kick', attrs: { lang: 'th' } }, `${o.place || 'ภาพจากที่เกิดเหตุ'}  ·  ${pad2(hh)}.${pad2(mm)} น.`)),
          h('div', { class: 'dlb-news__head' }, h('h2', { attrs: { lang: 'th' } }, o.th || '')))),
      h('div', { class: 'dlb-news__black' }));
    this.el = el;
    ui.layer.appendChild(el);
    ui.root.classList.add('has-news');
    ui._refreshXhair?.();
    ui.bus?.emit?.('ui:news', { phase: 'in' });

    // Esc / B skips, but only after 3 s (modal: the keys never reach the game meanwhile)
    let skipped = false;
    let wake = null;
    const skipP = new Promise((r) => (wake = r));
    const t0 = performance.now();
    const ctx = ui.nav.push({
      root: el, modal: true, name: 'news', items: () => [],
      onBack: () => this._skip(),
      onStart: () => this._skip(),
      onAction: () => true,
    });
    this._skip = () => {
      if (skipped || performance.now() - t0 < 3000) return;
      skipped = true;
      wake();
    };
    const wait = (ms) => Promise.race([sleep(ms), skipP]);

    // the 3D studio; if WebGL, the characters or the anchor fail, the 2D version runs instead:
    // the footage full screen with the breaking tag, the anchor's voice and subtitles over it
    try {
      this.studio = new NewsStudio(stage, { image: frame, headline: o.th });
      await Promise.race([this.studio.ready, sleep(4500)]);
      if (!this.studio.person) throw new Error('no anchor');
      this.studio.start();
    } catch (e) {
      console.warn('[news] 3D studio unavailable, using the 2D news', e);
      this.studio?.dispose();
      this.studio = null;
    }
    el.hidden = false;
    void el.offsetWidth;
    await nextFrame();
    el.classList.add('is-in', this.studio ? 'is-studio' : 'is-cutnow');

    // the anchor reads the story, subtitled; the whole studio part is capped at ~11 s
    const lines = Array.isArray(o.lines) && o.lines.length ? o.lines.slice(0, 3) : [SCRIPT[0], o.sub || SCRIPT[1], SCRIPT[2]];
    const studioEnd = performance.now() + 11000;
    this._cut = false;
    this._cutWake = null;
    const cutP = new Promise((r) => (this._cutWake = r));
    {
      await wait(700);
      for (const th of lines) {
        if (skipped || performance.now() > studioEnd - 1500) break;
        const est = audio.voice?.estimate?.({ th, voice: ANCHOR_VOICE }) ?? 3.5;
        ui.subtitle({ speakerTH: 'ผู้ประกาศข่าว', speakerEN: 'News anchor', th, duration: est + 0.6 });
        this.studio?.setTalking(true);
        let spoken;
        try {
          spoken = audio.voice.speak({ th, voice: ANCHOR_VOICE, fx: 'radio', volume: 0.95 });
        } catch (e) {
          spoken = null;
        }
        await Promise.race([spoken || sleep(est * 1000), sleep((est + 2) * 1000), skipP, cutP]);
        this.studio?.setTalking(false);
        if (skipped || this._cut) break;
        await Promise.race([wait(380), cutP]);
      }
    }
    ui.clearSubtitle();
    // hard cut to the footage, the lower third wipes on, then black
    if (!skipped) {
      el.classList.add('is-cut');
      el.classList.remove('is-studio');
      this.studio?.dispose();
      this.studio = null;
      await wait(260);
      el.classList.add('is-gfx');
      await wait(Math.max(1.6, Number(o.hold) || 2.6) * 1000);
    }
    try {
      audio.voice?.stop?.();
    } catch (e) {
      /* ignore */
    }
    ui.nav.remove(ctx);
    el.classList.add('is-black');
    await sleep(skipped ? 700 : 1300);
    this.studio?.dispose();
    this.studio = null;
    ui.root.classList.remove('has-news');
    ui.bus?.emit?.('ui:news', { phase: 'black' });
    if (!o.keepBlack) setTimeout(() => this.release(1.4, el), 400);
  }

  /** Debug / harness: end the studio part now and cut to the footage. */
  cut() {
    this._cut = true;
    this._cutWake?.();
  }

  /** Fade out a news screen held black (keepBlack), or the given one. */
  release(secs = 1.4, el = this.el) {
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
      this.studio?.dispose();
      this.studio = null;
    }
    this.ui.root?.classList.remove('has-news');
    this.ui._refreshXhair?.();
  }
}
