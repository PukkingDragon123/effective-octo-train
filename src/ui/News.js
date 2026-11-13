// The crash on the late-night news, a full (parody) Thai TV station; the player then wakes at the
// last checkpoint and nothing on screen says "game over". About 33 s, Esc / B skips after 3 s:
//   1. the programme sting      เรื่องเล่าตีสาม on ราตรีทีวี (both invented, parodying the genre)
//   2. the studio               the anchor (อรอุมา แสงเดือน) opens the story          3D, NewsStudio.js
//   3. B-roll                   the crash photo full screen under the headline
//   4. live from the scene      the reporter (ชนินทร์ กล้าลุย) at the taped-off verge,
//                               police lights flashing                              3D, NewsStudio.js
//   5. back to the studio       the anchor wraps up: "พักโฆษณาสักครู่ค่ะ"
//   6. the break                three original parody ads (NewsAds.js)
// Voices: the gibberish voice system through the radio band, subtitled. If WebGL or the characters
// fail, the same programme runs in 2D over the crash photo.
//
//   ui.newsReport({ th (headline), sub? (a line the reporter reads), image? (crash photo: canvas /
//                   image / URL), hold?, lines?: {anchor?, reporter?, wrap?}, place?, ads? (default
//                   true), keepBlack? }) -> Promise (resolves once the screen is black; unless
//                   keepBlack it then fades out by itself; ui.fade(false) releases a kept black)
import { h, sleep, nextFrame } from './dom.js';
import { screen } from './common.js';
import { audio } from '../audio/index.js';
import { NewsStudio } from './NewsStudio.js';
import { buildAd } from './NewsAds.js';

/** Fictional headlines other modules may use (none of them real). */
export const NEWS_TICKER = [
  'กรมอุตุนิยมวิทยาเตือนหมอกหนาบนทางหลวงสายป่าช่วงกลางดึก ขอให้ขับขี่ด้วยความระมัดระวัง',
  'ตำรวจทางหลวงขอความร่วมมือผู้ขับขี่ งดจอดรับคนโบกรถริมทางหลังเที่ยงคืน',
  'ชาวบ้านร้องเรียนเสียงแตรดังต่อเนื่องหน้าศาลเจ้าริมทางทุกคืน',
];

const ANCHOR = { name: 'อรอุมา แสงเดือน', role: 'ผู้ประกาศข่าว', voice: { gender: 'f', age: 34, pitch: 1.04, rate: 1.06 } };
const REPORTER = { name: 'ชนินทร์ กล้าลุย', role: 'ผู้สื่อข่าว', voice: { gender: 'm', age: 31, pitch: 0.98, rate: 1.1 } };
const SHOW = { th: 'เรื่องเล่าตีสาม', station: 'ราตรีทีวี' };
const SCRIPT = {
  anchor: 'เอาล่ะค่ะ ข่าวด่วนคืนนี้ รถเสียหลักตกข้างทางบนถนนสายป่าค่ะ',
  reporter: ['ครับ ผมอยู่ที่จุดเกิดเหตุ รถพุ่งตกข้างทาง สภาพยับเยินครับ', 'พยานยืนยันว่ามีผู้โดยสาร แต่ในรถไม่พบใครเลยครับ'],
  wrap: 'ขับรถกลางคืนระวังกันด้วยนะคะ พักโฆษณาสักครู่ค่ะ',
};

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

const TH_D = '๐๑๒๓๔๕๖๗๘๙';
const thd = (s) => String(s).replace(/[0-9]/g, (d) => TH_D[d]);

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
    const clock = `${pad2(hh)}:${pad2(mm)}`;
    const place = o.place || 'ทางหลวงสายป่า';
    const [subTh, subEn] = String(o.sub || '').split(' · ');

    // ---- the overlay package -------------------------------------------------------------------
    const stage = h('div', { class: 'dlb-news__stage' });
    const strapName = h('b', { attrs: { lang: 'th' } });
    const strapRole = h('span', { attrs: { lang: 'th' } });
    const strap = h('div', { class: 'dlb-news__strap' }, h('i'), h('div', null, strapName, strapRole));
    const live = h('div', { class: 'dlb-news__live2', attrs: { lang: 'th' } }, h('span', { class: 'chip' }, h('i'), 'สด'), h('span', null, `${place}`));
    const bug = h('div', { class: 'dlb-news__bug2' },
      h('span', { class: 'mark', html: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="currentColor"/><circle cx="31" cy="17" r="14.5" fill="#0b0d12"/><path d="M21.6 44 23.4 25h1.2l1.8 19z" fill="#c8161d"/></svg>' }),
      h('span', { class: 'name', attrs: { lang: 'th' } }, SHOW.th),
      h('span', { class: 'time' }, thd(clock)));
    const sting = h('div', { class: 'dlb-news__sting' },
      h('div', { class: 'st-bars' }, h('i'), h('i'), h('i')),
      h('div', { class: 'st-title' },
        h('div', { class: 'st-station', attrs: { lang: 'th' } }, SHOW.station, h('span', null, 'เสนอ')),
        h('div', { class: 'st-show', attrs: { lang: 'th' } }, SHOW.th),
        h('div', { class: 'st-breaking', attrs: { lang: 'th' } }, 'ข่าวด่วนกลางดึก')));
    const ads = h('div', { class: 'dlb-news__ads' });
    const el = screen('dlb-news',
      stage,
      h('div', { class: 'dlb-news__cut' },
        frame,
        h('div', { class: 'dlb-news__vig' }),
        h('div', { class: 'dlb-news__lower' },
          h('div', { class: 'dlb-news__kicker' },
            h('span', { class: 'dlb-news__tag', attrs: { lang: 'th' } }, 'ข่าวด่วน'),
            h('span', { class: 'dlb-news__kick', attrs: { lang: 'th' } }, `${o.place || 'ภาพจากที่เกิดเหตุ'}  ·  ${thd(pad2(hh))}.${thd(pad2(mm))} น.`)),
          h('div', { class: 'dlb-news__head' }, h('h2', { attrs: { lang: 'th' } }, o.th || '')))),
      bug, live, strap, sting, ads,
      h('div', { class: 'dlb-news__black' }));
    this.el = el;
    ui.layer.appendChild(el);
    ui.root.classList.add('has-news');
    ui._refreshXhair?.();
    ui.bus?.emit?.('ui:news', { phase: 'in' });

    // ---- skipping: Esc / B after 3 s (modal, so the keys never reach the game) ------------------
    let skipped = false;
    let wake = null;
    const skipP = new Promise((r) => (wake = r));
    const t0 = performance.now();
    const ctx = ui.nav.push({ root: el, modal: true, name: 'news', items: () => [], onBack: () => this._skip(), onStart: () => this._skip(), onAction: () => true });
    this._skip = () => {
      if (skipped || performance.now() - t0 < 3000) return;
      skipped = true;
      wake();
    };
    // debug / harness: jump to the next segment
    this._nextWake = null;
    const segP = () => new Promise((r) => (this._nextWake = r));
    let seg = segP();
    const nextSeg = () => {
      const p = seg;
      seg = segP();
      return p;
    };
    const wait = (ms) => Promise.race([sleep(ms), skipP]);
    const segWait = (ms) => Promise.race([sleep(ms), skipP, seg]);
    const setShot = (cls) => {
      el.classList.remove('is-sting', 'is-studio', 'is-broll', 'is-field', 'is-wrap', 'is-ads');
      if (cls) el.classList.add(cls);
    };
    const showStrap = (who) => {
      strapName.textContent = who ? who.name : '';
      strapRole.textContent = who ? `${who.role} · ${SHOW.th}` : '';
      strap.classList.toggle('is-on', !!who);
    };
    /** One voiced, subtitled line; resolves when spoken, capped, or skipped / jumped. */
    const say = async (who, th, en, capS, speaker = 'anchor') => {
      if (!th || skipped) return;
      const est = audio.voice?.estimate?.({ th, voice: who.voice }) ?? 3.5;
      ui.subtitle({ speakerTH: who.name, speakerEN: who.role, th, en: en || '', duration: est + 0.5 });
      this.studio?.setTalking(true, speaker);
      let spoken = null;
      try {
        spoken = audio.voice.speak({ th, voice: who.voice, fx: 'radio', volume: 0.95 });
      } catch (e) {
        spoken = null;
      }
      await Promise.race([spoken || sleep(est * 1000), sleep(Math.min(capS, est + 1.5) * 1000), skipP, seg]);
      this.studio?.setTalking(false);
    };

    // ---- the 3D station (falls back to 2D over the photo) -----------------------------------------
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
    el.classList.add('is-in', this.studio ? 'is-3d' : 'is-2d');
    const L = { anchor: o.lines?.anchor || SCRIPT.anchor, reporter: o.lines?.reporter || [SCRIPT.reporter[0], subTh || SCRIPT.reporter[1]], wrap: o.lines?.wrap || SCRIPT.wrap };

    // 1. sting
    setShot('is-sting');
    try {
      audio.play?.('sting_low', { volume: 0.55 });
    } catch (e) {
      /* optional */
    }
    await segWait(2600);
    nextSeg();
    // 2. studio: the anchor opens
    if (!skipped) {
      setShot('is-studio');
      this.studio?.setShot('studio');
      await wait(250);
      showStrap(ANCHOR);
      el.classList.add('has-bug');
      await say(ANCHOR, L.anchor, '', 6, 'anchor');
      nextSeg();
      showStrap(null);
    }
    // 3. B-roll: the photograph under the headline
    if (!skipped) {
      setShot('is-broll');
      el.classList.add('is-gfx');
      await segWait(Math.max(1.8, Math.min(3, Number(o.hold) || 2.4)) * 1000);
      nextSeg();
      el.classList.remove('is-gfx');
    }
    // 4. live from the scene
    if (!skipped) {
      setShot('is-field');
      this.studio?.setShot('field');
      await wait(200);
      showStrap(REPORTER);
      live.classList.add('is-on');
      for (let i = 0; i < L.reporter.length && !skipped; i++) {
        await say(REPORTER, L.reporter[i], i === 1 ? subEn : '', 5, 'reporter');
        if (!skipped) await segWait(250);
      }
      nextSeg();
      live.classList.remove('is-on');
      showStrap(null);
    }
    // 5. back to the studio
    if (!skipped) {
      setShot('is-wrap');
      this.studio?.setShot('studio');
      await wait(200);
      showStrap(ANCHOR);
      await say(ANCHOR, L.wrap, '', 5, 'anchor');
      nextSeg();
      showStrap(null);
    }
    ui.clearSubtitle();
    el.classList.remove('has-bug');
    // 6. the break: three ads
    if (!skipped && o.ads !== false) {
      setShot('is-ads');
      this.studio?.dispose();
      this.studio = null;
      for (const kind of ['drink', 'balm', 'lotto']) {
        if (skipped) break;
        const ad = buildAd(kind);
        ads.replaceChildren(ad.el);
        void ad.el.offsetWidth;
        await nextFrame();
        ad.el.classList.add('is-on');
        let vo = null;
        try {
          vo = audio.voice.speak({ th: ad.vo.th, voice: ad.vo.voice, fx: 'radio', volume: 0.9 });
          vo?.catch?.(() => {});
        } catch (e) {
          vo = null;
        }
        await segWait(4400);
        nextSeg();
      }
    }
    // ---- out ---------------------------------------------------------------------------------------
    try {
      audio.voice?.stop?.();
    } catch (e) {
      /* ignore */
    }
    ui.clearSubtitle();
    ui.nav.remove(ctx);
    el.classList.add('is-black');
    await sleep(skipped ? 700 : 1100);
    this.studio?.dispose();
    this.studio = null;
    ui.root.classList.remove('has-news');
    ui.bus?.emit?.('ui:news', { phase: 'black' });
    if (!o.keepBlack) setTimeout(() => this.release(1.4, el), 400);
  }

  /** Debug / harness: jump to the next segment now. */
  next() {
    this._nextWake?.();
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
