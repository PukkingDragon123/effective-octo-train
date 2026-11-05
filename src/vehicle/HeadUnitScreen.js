// The head unit's picture: a 512x288 canvas drawn at ~13 fps by HeadUnit.js.
//   * karaoke VCD while a song plays: slow Ken Burns over real photos of Thai scenery, the cheesy
//     title card at the start of each song, two lyric lines at the bottom with the colour fill
//     sweeping across the words note by note (timed from the radio's programme plan), countdown dots
//   * Somchai's cat album: real cat photos composed like an old man's phone slideshow (crooked
//     sticker frames, tape, orange date stamps, a heart drawn with a finger, one-finger captions)
//   * static / tuning snow, the blue AV1 boot screen, interference while ghosts are near
//   * scares: for 2-3 frames a cat becomes a pale face, or the lyric reads "อย่าหันไปมอง"
// Everything that is text or composition is pre-rendered when it changes; a frame is a handful of
// drawImage calls. No allocations per frame.
import { makeCanvas, toTexture, drawSegments } from './VehicleTextures.js';
import { FONTS } from '../ui/fonts.js';
import { makeRng } from '../core/math.js';
import { KARAOKE, KARAOKE_FALLBACK, SCARE_LINE, VCD, ALBUM_TITLE, ALBUM_NOTE, CAT_PHOTOS, SCENERY_PHOTOS, SCREEN_PATH } from './HeadUnitData.js';

export const SCREEN_W = 512, SCREEN_H = 288;
const W = SCREEN_W, H = SCREEN_H;
const LYRIC_PX = 31;
const MAXW = 470;
const KB_SEG = 12, KB_FADE = 1.6;
const SLIDE_DUR = 3.8, SLIDE_TRANS = 0.55;

// Every canvas of the screen is CPU-rastered: the picture is small, and the GPU-canvas -> WebGL
// texture path stalls on some drivers (and in SwiftShader) when it is redrawn many times a second.
const CPU = { willReadFrequently: true };
const hash = (n) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- shared photo library
let _lib = null;
function loadImage(url) {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}
function averageColour(img) {
  try {
    const c = makeCanvas(6, 6);
    const g = c.getContext('2d', CPU);
    g.drawImage(img, 0, 0, 6, 6);
    const d = g.getImageData(0, 0, 6, 6).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
    }
    const n = (d.length / 4) * 255;
    return [r / n, gg / n, b / n];
  } catch (e) {
    return [0.5, 0.5, 0.5];
  }
}
/** Load (once, shared by every screen) the cat + scenery photos. Missing files are skipped. */
export function screenLibrary() {
  if (_lib) return _lib;
  const lib = { cats: [], scenery: [], ready: false };
  const load = (list, out) =>
    Promise.all(list.map((m) => loadImage(SCREEN_PATH + m.file).then((img) => img && { img, w: img.naturalWidth, h: img.naturalHeight, avg: averageColour(img), meta: m }))).then((arr) => {
      for (const e of arr) if (e) out.push(e);
    });
  lib.promise = typeof Image === 'undefined' ? Promise.resolve() : Promise.all([load(CAT_PHOTOS, lib.cats), load(SCENERY_PHOTOS, lib.scenery)]).then(() => (lib.ready = true));
  _lib = lib;
  return lib;
}

// ---------------------------------------------------------------- programme helpers (no allocation)
const SEC = { name: '', local: 0, bars: 0, occ: 0, idx: 0, start: 0 };
/** Section at bar -> SEC (name, local bar, bars, occurrence of that name, index, start bar). */
function sectionAt(plan, bar) {
  let b = 0;
  const S = plan.sections;
  for (let i = 0; i < S.length; i++) {
    const n = S[i][1];
    if (bar < b + n || i === S.length - 1) {
      let occ = 0;
      for (let j = 0; j < i; j++) if (S[j][0] === S[i][0]) occ++;
      SEC.name = S[i][0];
      SEC.local = bar - b;
      SEC.bars = n;
      SEC.occ = occ;
      SEC.idx = i;
      SEC.start = b;
      return SEC;
    }
    b += n;
  }
  return SEC;
}
const vocal = (name) => name === 'A' || name === 'B';

/** Sweep progress 0..1 across a phrase: note by note through the plan's melody, else linear. */
function phraseProgress(notes, b0, b1, beat) {
  if (!notes || !notes.length) return clamp01((beat - b0 - 0.25) / (b1 - b0 - 0.75));
  let n = 0, k = 0, frac = 0;
  for (let i = 0; i < notes.length; i++) {
    const nt = notes[i];
    if (nt.t < b0 || nt.t >= b1) continue;
    if (beat >= nt.t) {
      k = n;
      frac = clamp01((beat - nt.t) / Math.max(0.25, nt.dur * 0.92));
    }
    n++;
  }
  if (!n) return 0;
  if (beat < b0) return 0;
  return clamp01((k + frac) / n);
}

// ---------------------------------------------------------------- the player
export class ScreenPlayer {
  constructor() {
    this.canvas = makeCanvas(W, H);
    this.g = this.canvas.getContext('2d', CPU);
    this.texture = toTexture(this.canvas, { anisotropy: 4 });
    this.lib = screenLibrary();
    this.t = 0;
    this.avg = [0, 0, 0];
    this.level = 0; // emitted brightness 0..1
    // song state
    this.songKey = '';
    this.song = null; // KARAOKE entry
    this.songSeed = 0;
    this._slotText = [null, null]; // the two karaoke slots: text + sprite (string identity, no per-frame keys)
    this._slotSpr = [null, null];
    this._osdSec = -1;
    this.fillCol = '#ff3d9a';
    this._sprites = new Map();
    this._scare = null;
    // slideshow
    this.show = { active: false, t: 0, slide: -1, next: 0, intro: false, count: 0, lastEnd: -99, songKey: '' };
    this.slideCan = [makeCanvas(W, H), makeCanvas(W, H)];
    this.slideRect = [new Float32Array(5), new Float32Array(5)]; // cx, cy, w, h, angle of the photo
    this.slideAvg = [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5]];
    this.slideCur = 0;
    this.slideTrans = [0, 0];
    this.catCursor = 0;
    // glitch
    this.glitchFrames = 0;
    this.glitchKind = 'text';
    // misc
    this.bootT = 0;
    this.volT = 0;
    this.clockKey = -1;
    this._build();
  }

  // ---- one-off pre-renders -------------------------------------------------------------------
  _build() {
    const rng = makeRng(4242);
    // scanlines + soft vignette, one overlay
    {
      const c = (this.overlay = makeCanvas(W, H));
      const g = c.getContext('2d', CPU);
      g.fillStyle = 'rgba(0,0,0,0.13)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.32)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }
    // snow
    this.noise = [];
    for (let k = 0; k < 3; k++) {
      const c = makeCanvas(128, 72);
      const g = c.getContext('2d', CPU);
      const im = g.createImageData(128, 72);
      for (let y = 0; y < 72; y++) {
        const row = rng.range(0.6, 1.25);
        for (let x = 0; x < 128; x++) {
          const v = Math.min(255, Math.max(0, (rng() * 255 * row) | 0));
          const i = (y * 128 + x) * 4;
          im.data[i] = v;
          im.data[i + 1] = v;
          im.data[i + 2] = Math.min(255, v + 6);
          im.data[i + 3] = 255;
        }
      }
      g.putImageData(im, 0, 0);
      this.noise.push(c);
    }
    // the cat album's tacky pastel backdrop: hearts and sparkles
    {
      const c = (this.albumBg = makeCanvas(W, H));
      const g = c.getContext('2d', CPU);
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#b8506f');
      grd.addColorStop(0.55, '#7e5a9e');
      grd.addColorStop(1, '#45689e');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const x = rng.range(0, W), y = rng.range(0, H), s = rng.range(4, 10);
        g.globalAlpha = rng.range(0.18, 0.4);
        if (rng() < 0.6) {
          g.fillStyle = rng() < 0.5 ? '#ffffff' : '#ff7fae';
          heartPath(g, x, y, s);
          g.fill();
        } else {
          g.fillStyle = '#fffbe0';
          sparklePath(g, x, y, s);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      this.albumAvg = [0.5, 0.36, 0.55];
    }
    // the pale face for the scare (painted, not a photo): long black hair, hollow eyes
    {
      const c = (this.face = makeCanvas(256, 256));
      const g = c.getContext('2d', CPU);
      g.fillStyle = '#121414';
      g.fillRect(0, 0, 256, 256);
      const skin = g.createRadialGradient(128, 118, 10, 128, 130, 98);
      skin.addColorStop(0, '#e9ecea');
      skin.addColorStop(0.6, '#c9cfcc');
      skin.addColorStop(1, '#6f7673');
      g.fillStyle = skin;
      g.beginPath();
      g.ellipse(128, 132, 62, 84, 0, 0, Math.PI * 2);
      g.fill();
      // hair falling over both sides of the face
      g.strokeStyle = '#050505';
      for (let i = 0; i < 70; i++) {
        const side = i % 2 ? 1 : -1;
        const x0 = 128 + side * rng.range(46, 78);
        g.lineWidth = rng.range(1, 4);
        g.beginPath();
        g.moveTo(128 + side * rng.range(10, 40), 40);
        g.bezierCurveTo(x0, 90, x0 + side * rng.range(-10, 20), 170, x0 + side * rng.range(0, 30), 256);
        g.stroke();
      }
      g.fillStyle = '#050505';
      g.beginPath();
      g.ellipse(128, 52, 70, 30, 0, Math.PI, Math.PI * 2);
      g.fill();
      // eyes: deep sockets, tiny pale pupils
      for (const s of [-1, 1]) {
        const eg = g.createRadialGradient(128 + s * 24, 122, 2, 128 + s * 24, 122, 20);
        eg.addColorStop(0, '#000000');
        eg.addColorStop(0.55, '#0b0b0b');
        eg.addColorStop(1, 'rgba(40,44,42,0)');
        g.fillStyle = eg;
        g.beginPath();
        g.ellipse(128 + s * 24, 122, 20, 14, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#d8dcd6';
        g.beginPath();
        g.arc(128 + s * 24 + s * 2, 123, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(20,10,10,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(108, 182);
      g.quadraticCurveTo(128, 190, 148, 181);
      g.stroke();
    }
    // countdown dot + tmp context for measuring
    this._measure = makeCanvas(8, 8).getContext('2d', CPU);
    this.titleCan = makeCanvas(W, H);
    this.titleAvg = [0.8, 0.5, 0.3];
    this.clockCan = makeCanvas(96, 26);
    this.osdCan = makeCanvas(200, 40);
    this._osdKey = '';
    this.textCan = makeCanvas(W, 96); // dhamma / DJ text block
    this._textKey = '';
    // the bootleg disc's watermark, top right (under the cat sticker's corner)
    {
      const m = this._measure;
      m.font = `700 15px ${FONTS.sign}`;
      const c = (this.wmCan = makeCanvas(Math.ceil(m.measureText(VCD.series).width + 8), 24));
      const g = c.getContext('2d', CPU);
      g.font = m.font;
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(40,10,0,0.7)';
      g.lineWidth = 3;
      g.strokeText(VCD.series, 4, 12);
      g.fillStyle = '#fff3b0';
      g.fillText(VCD.series, 4, 12);
    }
  }

  // ---- sprites --------------------------------------------------------------------------------
  /** Pre-rendered lyric line: base (white, navy outline) + filled (colour, white outline). */
  _line(text, fill, quiet = false) {
    const key = text + '|' + fill + (quiet ? '|q' : '');
    let s = this._sprites.get(key);
    if (s) return s;
    if (this._sprites.size > 48) this._sprites.clear();
    const font = `700 ${LYRIC_PX}px ${FONTS.sign}`;
    const m = this._measure;
    m.font = font;
    const pad = 12;
    const w = Math.ceil(m.measureText(text).width + pad * 2), h = 62;
    const mk = (fillCol, outCol) => {
      const c = makeCanvas(w, h);
      const g = c.getContext('2d', CPU);
      g.font = font;
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 8;
      g.strokeText(text, pad + 2, h / 2 + 2.5);
      g.strokeStyle = outCol;
      g.lineWidth = 7;
      g.strokeText(text, pad, h / 2);
      g.fillStyle = fillCol;
      g.fillText(text, pad, h / 2);
      return c;
    };
    s = quiet ? { base: mk('#f2efe6', '#1a1c22'), fill: mk('#ffe7a8', '#2a2016'), w, h, pad } : { base: mk('#fffaf0', '#0e1a4a'), fill: mk(fill, '#ffffff'), w, h, pad };
    this._sprites.set(key, s);
    return s;
  }

  _title(plan, entry) {
    const c = this.titleCan;
    const g = c.getContext('2d', CPU);
    g.clearRect(0, 0, W, H);
    const th = plan.title?.th || '';
    const quiet = !!entry.quiet;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (quiet) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 96, W, 96);
      g.font = `700 44px ${FONTS.title}`;
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 6;
      g.strokeText(th, W / 2, 136);
      g.fillStyle = '#f4ecd8';
      g.fillText(th, W / 2, 136);
      g.font = `400 20px ${FONTS.title}`;
      g.fillStyle = 'rgba(244,236,216,0.8)';
      g.fillText(plan.title?.en || '', W / 2, 172);
      this.titleAvg = [0.3, 0.27, 0.22];
      return;
    }
    // series band
    g.fillStyle = '#ffd21a';
    g.beginPath();
    g.moveTo(0, 18);
    g.lineTo(W * 0.62, 18);
    g.lineTo(W * 0.58, 50);
    g.lineTo(0, 50);
    g.fill();
    g.font = `700 22px ${FONTS.sign}`;
    g.textAlign = 'left';
    g.fillStyle = '#b4120e';
    g.fillText(VCD.series, 14, 35);
    // song title: rainbow fill, dark red + white outlines
    g.textAlign = 'center';
    let size = 60;
    g.font = `700 ${size}px ${FONTS.display}`;
    while (size > 34 && g.measureText(th).width > W - 40) {
      size -= 4;
      g.font = `700 ${size}px ${FONTS.display}`;
    }
    const gy = 128;
    const grd = g.createLinearGradient(0, gy - size * 0.5, 0, gy + size * 0.5);
    grd.addColorStop(0, '#fff6a0');
    grd.addColorStop(0.45, '#ffb21c');
    grd.addColorStop(1, '#ff3b2f');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 15;
    g.strokeText(th, W / 2, gy);
    g.strokeStyle = '#7a0a14';
    g.lineWidth = 8;
    g.strokeText(th, W / 2, gy);
    g.fillStyle = grd;
    g.fillText(th, W / 2, gy);
    // singer
    g.font = `700 26px ${FONTS.sign}`;
    const singer = entry.artist ? `${VCD.singer} ${entry.artist}` : '';
    g.strokeStyle = '#0e1a6a';
    g.lineWidth = 6;
    g.strokeText(singer, W / 2, 186);
    g.fillStyle = '#ffffff';
    g.fillText(singer, W / 2, 186);
    // karaoke label
    g.font = `700 30px ${FONTS.sign}`;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.strokeText(VCD.karaoke, W / 2, 238);
    g.fillStyle = '#1d5cff';
    g.fillText(VCD.karaoke, W / 2, 238);
    // "genuine disc" starburst
    g.save();
    g.translate(W - 70, 62);
    g.rotate(0.24);
    g.fillStyle = '#e8141e';
    starburst(g, 0, 0, 44, 34, 14);
    g.fill();
    g.strokeStyle = '#ffe14a';
    g.lineWidth = 3;
    g.stroke();
    g.font = `700 19px ${FONTS.sign}`;
    g.fillStyle = '#ffffff';
    g.fillText(VCD.genuine, 0, 1);
    g.restore();
    this.titleAvg = [0.85, 0.55, 0.32];
  }

  /** Compose cat slide `idx` into slide canvas `slot` (runs once per slide). */
  _composeSlide(slot, idx, intro) {
    const c = this.slideCan[slot];
    const g = c.getContext('2d', CPU);
    const rect = this.slideRect[slot];
    g.clearRect(0, 0, W, H);
    const cats = this.lib.cats;
    const rng = makeRng(9001 + idx * 31);
    if (intro || !cats.length) {
      // album title card
      g.save();
      g.translate(W / 2, H / 2 - 10);
      g.rotate(-0.04);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.font = `700 54px ${FONTS.display}`;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 12;
      g.strokeText(ALBUM_TITLE, -16, 0);
      g.fillStyle = '#e8336e';
      g.fillText(ALBUM_TITLE, -16, 0);
      const tw = g.measureText(ALBUM_TITLE).width;
      g.fillStyle = '#ff2d55';
      fingerHeart(g, rng, tw / 2 + 18, -4, 22);
      g.font = `700 26px ${FONTS.hand}`;
      g.lineWidth = 6;
      g.strokeStyle = '#ffffff';
      g.strokeText(ALBUM_NOTE, 40, 52);
      g.fillStyle = '#c4161c';
      g.fillText(ALBUM_NOTE, 40, 52);
      g.restore();
      rect[0] = W / 2;
      rect[1] = H / 2;
      rect[2] = 0;
      rect[3] = 0;
      rect[4] = 0;
      this.slideAvg[slot] = this.albumAvg;
      return;
    }
    const e = cats[idx % cats.length];
    const m = e.meta;
    const portrait = e.h > e.w * 1.05;
    const boxW = portrait ? 168 : 292, boxH = portrait ? 214 : 196;
    const sc = Math.min(boxW / e.w, boxH / e.h);
    const pw = e.w * sc, ph = e.h * sc;
    const cx = W / 2 + rng.range(-36, 36) + (portrait ? rng.range(-60, 60) : 0), cy = 128 + rng.range(-8, 6);
    const ang = rng.range(-0.075, 0.07);
    rect[0] = cx;
    rect[1] = cy;
    rect[2] = pw;
    rect[3] = ph;
    rect[4] = ang;
    const style = m.frame || ['polaroid', 'sticker', 'tape'][idx % 3];
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    // drop shadow (offset, no blur)
    g.fillStyle = 'rgba(60,30,60,0.28)';
    const bw = style === 'polaroid' ? 10 : 6, bb = style === 'polaroid' ? 34 : 6;
    g.fillRect(-pw / 2 - bw + 5, -ph / 2 - bw + 6, pw + bw * 2, ph + bw + bb);
    // paper border
    g.fillStyle = style === 'sticker' ? '#e4e0d8' : '#ddd8cc';
    g.fillRect(-pw / 2 - bw, -ph / 2 - bw, pw + bw * 2, ph + bw + bb);
    g.drawImage(e.img, -pw / 2, -ph / 2, pw, ph);
    // date stamp, old camera style: orange LED digits in the photo's corner
    if (m.date) {
      const dh = 15;
      g.save();
      g.globalAlpha = 0.95;
      const x1 = pw / 2 - 8, y0 = ph / 2 - dh - 8;
      drawSegments(g, m.date, x1 + 1, y0 + 1, dh, { color: 'rgba(90,20,0,0.6)', align: 'right', skew: 0.1 });
      drawSegments(g, m.date, x1, y0, dh, { color: '#ff8a1e', align: 'right', skew: 0.1 });
      g.restore();
    }
    if (style === 'tape') {
      g.fillStyle = 'rgba(236,226,190,0.72)';
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * (pw / 2 - 6), -ph / 2 - 4);
        g.rotate(s * 0.7 + rng.range(-0.15, 0.15));
        g.fillRect(-26, -9, 52, 18);
        g.restore();
      }
    }
    if (style === 'polaroid' && m.caption) {
      g.font = `700 22px ${FONTS.hand}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#1d2a6e';
      g.fillText(m.caption, rng.range(-6, 6), ph / 2 + 15, pw);
    }
    g.restore();
    if (style === 'sticker') {
      // the sticker frame went on crooked: rotated and shifted against the photo
      g.save();
      g.translate(cx + rng.range(5, 9), cy - rng.range(3, 7));
      g.rotate(ang + rng.range(0.05, 0.09) * (rng() < 0.5 ? -1 : 1));
      const fw = pw + 26, fh = ph + 26;
      g.lineWidth = 13;
      g.strokeStyle = '#ff8fb8';
      g.setLineDash([2, 13]);
      g.lineCap = 'round';
      g.strokeRect(-fw / 2, -fh / 2, fw, fh);
      g.setLineDash([]);
      g.lineWidth = 6;
      g.strokeStyle = '#ffd1e1';
      g.strokeRect(-fw / 2 + 4, -fh / 2 + 4, fw - 8, fh - 8);
      // little hearts on the corners
      g.fillStyle = '#ff4f8d';
      for (const [sx, sy] of CORNERS) {
        heartPath(g, (sx * fw) / 2, (sy * fh) / 2, 11);
        g.fill();
      }
      g.restore();
    }
    // a heart drawn on with a finger (wobbly, not quite closed), near a corner of the photo
    g.save();
    g.translate(cx + (rng() < 0.5 ? -1 : 1) * (pw * 0.36), cy - ph * 0.28 + rng.range(-8, 8));
    g.rotate(rng.range(-0.4, 0.4));
    g.fillStyle = '#ff2d55';
    fingerHeart(g, rng, 0, 0, rng.range(15, 21));
    g.restore();
    // caption typed on the head unit (outlined), except polaroids which carry it in marker
    if (m.caption && style !== 'polaroid') {
      g.save();
      g.translate(W / 2 + rng.range(-20, 20), Math.min(H - 22, cy + ph / 2 + 28));
      g.rotate(rng.range(-0.035, 0.035));
      g.font = `700 27px ${FONTS.sign}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 7;
      g.strokeText(m.caption, 0, 0);
      g.fillStyle = '#8a1fd1';
      g.fillText(m.caption, 0, 0);
      g.restore();
    }
    const a = e.avg, b = this.albumAvg;
    this.slideAvg[slot] = [a[0] * 0.55 + b[0] * 0.45, a[1] * 0.55 + b[1] * 0.45, a[2] * 0.55 + b[2] * 0.45];
  }

  _textBlock(text, header) {
    const key = header + '|' + text;
    if (key === this._textKey) return;
    this._textKey = key;
    const c = this.textCan;
    const g = c.getContext('2d', CPU);
    g.clearRect(0, 0, W, 96);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.font = `700 24px ${FONTS.sign}`;
    // split at the space nearest the middle when too wide
    let a = text, b = '';
    if (g.measureText(text).width > MAXW) {
      let best = -1;
      for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
      if (best > 0) {
        a = text.slice(0, best);
        b = text.slice(best + 1);
      }
    }
    for (const [s, y] of [[a, b ? 34 : 52], [b, 70]]) {
      if (!s) continue;
      g.strokeStyle = '#2a1606';
      g.lineWidth = 6;
      g.strokeText(s, W / 2, y, MAXW);
      g.fillStyle = '#ffe9a6';
      g.fillText(s, W / 2, y, MAXW);
    }
    if (header) {
      g.font = `700 18px ${FONTS.sign}`;
      g.strokeStyle = '#2a1606';
      g.lineWidth = 5;
      g.strokeText(header, W / 2, 10);
      g.fillStyle = '#ffd06a';
      g.fillText(header, W / 2, 10);
    }
  }

  _osd(text) {
    if (text === this._osdKey) return;
    this._osdKey = text;
    const g = this.osdCan.getContext('2d', CPU);
    g.clearRect(0, 0, 200, 40);
    g.fillStyle = 'rgba(16,40,170,0.82)';
    g.fillRect(0, 4, 200, 30);
    g.font = `700 22px ${FONTS.lcd}`;
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(text, 10, 20);
  }

  _clock(hour) {
    const mins = Math.floor((((hour % 24) + 24) % 24) * 60);
    if (mins === this.clockKey) return;
    this.clockKey = mins;
    const g = this.clockCan.getContext('2d', CPU);
    g.clearRect(0, 0, 96, 26);
    const s = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    drawSegments(g, s, 5, 5, 17, { color: 'rgba(0,0,0,0.6)', skew: 0.08 });
    drawSegments(g, s, 4, 4, 17, { color: '#f4f6ff', skew: 0.08 });
  }

  // ---- controls ------------------------------------------------------------------------------------
  /** Scare: the next 2-3 drawn frames glitch. */
  glitch(frames = 2 + (Math.random() < 0.5 ? 1 : 0)) {
    this.glitchFrames = Math.max(this.glitchFrames, frames);
    this.glitchKind = this.show.active ? 'face' : 'text';
  }
  /** Radio just switched on: blue AV1 screen for a moment, volume bar. */
  boot() {
    this.bootT = 0.75;
    this.volT = 1.6;
  }
  startSlideshow(intro = true) {
    const S = this.show;
    if (S.active) return;
    S.active = true;
    S.t = 0;
    S.slide = -1;
    S.intro = intro;
  }

  // ---- per frame ---------------------------------------------------------------------------------
  /** Advance clocks (every frame, cheap). */
  tick(dt) {
    this.t += dt;
    if (this.bootT > 0) this.bootT -= dt;
    if (this.volT > 0) this.volT -= dt;
    if (this.show.active) this.show.t += dt;
  }

  /**
   * Draw one frame. f = { plan, time, tuning, ghost, hour, stationLabel }
   * (plan = the radio programme item, or null for dead air).
   */
  draw(f) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    const A = this.avg;
    if (this.bootT > 0) {
      g.fillStyle = '#1430c4';
      g.fillRect(0, 0, W, H);
      this._osd('AV1');
      g.drawImage(this.osdCan, 18, 18);
      A[0] = 0.08;
      A[1] = 0.19;
      A[2] = 0.77;
      this.level = 0.8;
      this.texture.needsUpdate = true;
      return;
    }
    const plan = f.plan;
    if (!plan || f.tuning) {
      this._drawStatic(f);
    } else {
      this._updateSong(plan);
      const S = this.show;
      // the album takes over during DJ breaks and instrumental bridges (never during the father's song)
      const want = this._wantShow(plan, f.time);
      if (!this.song?.quiet && want && !S.active && this.t - S.lastEnd > 6) this.startSlideshow(S.count++ % 3 === 0);
      if (S.active && (this.song?.quiet || (!want && S.t > SLIDE_DUR * 2 - 0.2))) this._endShow();
      if (S.active) this._drawSlideshow();
      else if (plan.kind === 'talk' || plan.kind === 'dj') this._drawTalk(plan, f);
      else this._drawKaraoke(plan, f.time);
      if (f.ghost > 0.08) this._interference(f.ghost);
    }
    // corner OSD: clock (every mode), volume bar after switching on
    this._clock(f.hour);
    g.globalAlpha = 0.9;
    g.drawImage(this.clockCan, 8, 6);
    g.globalAlpha = 1;
    if (this.volT > 0) this._drawVolume();
    g.drawImage(this.overlay, 0, 0);
    if (this.glitchFrames > 0) {
      this.glitchFrames--;
      this._tear();
    }
    this.texture.needsUpdate = true;
  }

  /** The album takes over in DJ breaks, instrumental bridges, and now and then on the dhamma station. */
  _wantShow(plan, time) {
    if (plan.kind === 'dj') return time > 0.3;
    if (plan.kind === 'talk') return this.t % 80 > 62;
    if (plan.father || time < 0) return false;
    const barDur = plan.barDur || (60 / (plan.bpm || 120)) * 4;
    return sectionAt(plan, Math.floor(time / barDur)).name === 'inst';
  }

  _endShow() {
    const S = this.show;
    S.active = false;
    S.lastEnd = this.t;
  }

  _updateSong(plan) {
    if (plan === this._planRef) return;
    this._planRef = plan;
    const key = plan.kind + ':' + plan.idx + ':' + (plan.title?.th || '') + ':' + plan.station;
    if (key === this.songKey) return;
    this.songKey = key;
    this.song = plan.kind === 'lukthung' || plan.kind === 'ballad' ? KARAOKE[plan.title?.th] || KARAOKE_FALLBACK : null;
    this.songSeed = (plan.idx * 3 + (plan.station || 1) * 5) | 0;
    this.fillCol = plan.voice?.gender === 'm' ? '#2f78ff' : '#ff3d9a';
    this._slotText[0] = this._slotText[1] = null;
    if (this.song) this._title(plan, this.song);
  }

  // ---- karaoke -----------------------------------------------------------------------------------------
  _drawKaraoke(plan, time) {
    const g = this.g;
    const song = this.song || KARAOKE_FALLBACK;
    this._kenBurns(this.t * 0.9, this.songSeed, song.quiet);
    const barDur = plan.barDur || (60 / (plan.bpm || 120)) * 4;
    const beatDur = barDur / 4;
    const tt = Math.max(0, time);
    const bar = Math.floor(tt / barDur);
    const beatInBar = (tt - bar * barDur) / beatDur;
    const sec = sectionAt(plan, bar);
    const father = !!plan.father;
    const phraseBars = father ? 4 : 2;
    // title card at the start of each song
    const introDur = plan.sections[0][0] === 'intro' ? plan.sections[0][1] * barDur : 0;
    const titleEnd = Math.min(7, Math.max(3.5, introDur - barDur * 0.8));
    if (time > -0.6 && time < titleEnd) {
      const k = clamp01((time + 0.6) / 0.45);
      const out = clamp01((titleEnd - time) / 0.5);
      const s = 1.25 - 0.25 * ease(k) + Math.sin(this.t * 3.1) * 0.012;
      g.save();
      g.globalAlpha = Math.min(k, out);
      g.translate(W / 2, H / 2);
      g.scale(s, s);
      g.drawImage(this.titleCan, -W / 2, -H / 2);
      g.restore();
      this._mixAvg(this.titleAvg, 0.55 * Math.min(k, out));
      if (time < 4) {
        const sec = Math.max(0, Math.floor(time + 1));
        if (sec !== this._osdSec) {
          this._osdSec = sec;
          this._osd('VCD  ▶ 00:0' + sec);
        }
        g.globalAlpha = 0.85;
        g.drawImage(this.osdCan, 300, 246);
        g.globalAlpha = 1;
      }
      return;
    }
    if (time < 0) return; // the last bars of the previous song (outro)
    // which lines: the current vocal phrase, or the next section's first two during the bar before it
    let lines = null, phrase = -1, prog = 0, pre = false, dotsLeft = 0;
    if (vocal(sec.name)) {
      lines = sec.name === 'B' && song.B ? song.B : song.A[sec.occ % song.A.length];
      const cyc = father ? 16 : 8;
      const beatInSec = (sec.local % cyc) * 4 + beatInBar;
      phrase = Math.floor(beatInSec / (phraseBars * 4));
      const notes = sec.name === 'B' ? plan.melB : plan.melA;
      prog = phraseProgress(notes, phrase * phraseBars * 4, (phrase + 1) * phraseBars * 4, beatInSec);
      phrase = Math.min(phrase, lines.length - 1);
    } else if (sec.local === sec.bars - 1 && sec.idx + 1 < plan.sections.length && vocal(plan.sections[sec.idx + 1][0])) {
      const nm = plan.sections[sec.idx + 1][0];
      let occ = 0;
      for (let j = 0; j <= sec.idx; j++) if (plan.sections[j][0] === nm) occ++;
      lines = nm === 'B' && song.B ? song.B : song.A[occ % song.A.length];
      phrase = 0;
      pre = true;
      dotsLeft = 4 - Math.floor(beatInBar);
    }
    if (!lines) return;
    const quiet = !!song.quiet;
    const scare = this.glitchFrames > 0 && this.glitchKind === 'text';
    // slot 0 (top, left-aligned) holds even phrases, slot 1 (bottom, right-aligned) odd ones
    const cur = phrase, nxt = phrase + 1;
    const top = cur % 2 === 0 ? cur : nxt, bot = cur % 2 === 0 ? nxt : cur;
    const sTop = top < lines.length ? this._slot(0, lines[top], quiet) : null;
    const sBot = bot < lines.length ? this._slot(1, lines[bot], quiet) : null;
    const pTop = pre ? 0 : top === cur ? prog : 0, pBot = pre ? 0 : bot === cur ? prog : 0;
    if (scare) {
      const sc = this._scare || (this._scare = this._line(SCARE_LINE, '#d4141c'));
      if (cur % 2 === 0) this._drawLine(sc, 20, 206, false, 1);
      else this._drawLine(sc, W - 20, 250, true, 1);
      if (cur % 2 === 0 && sBot) this._drawLine(sBot, W - 20, 250, true, 0);
      else if (sTop && cur % 2) this._drawLine(sTop, 20, 206, false, 0);
    } else {
      if (sTop) this._drawLine(sTop, 20, 206, false, pTop);
      if (sBot) this._drawLine(sBot, W - 20, 250, true, pBot);
    }
    if (dotsLeft > 0) {
      g.fillStyle = this.fillCol;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      for (let i = 0; i < dotsLeft; i++) {
        g.beginPath();
        g.arc(30 + i * 18, 176, 6, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    // the bootleg watermark
    if (!quiet) {
      g.globalAlpha = 0.6;
      g.drawImage(this.wmCan, W - 64 - this.wmCan.width, 6);
      g.globalAlpha = 1;
    }
  }

  _slot(i, text, quiet) {
    if (this._slotText[i] !== text) {
      this._slotText[i] = text;
      this._slotSpr[i] = this._line(text, this.fillCol, quiet);
    }
    return this._slotSpr[i];
  }

  _drawLine(s, x, y, right, prog) {
    const g = this.g;
    const k = s.w > MAXW ? MAXW / s.w : 1;
    const dw = s.w * k, dh = s.h * k;
    const x0 = right ? x - dw : x;
    const y0 = y - dh / 2;
    g.drawImage(s.base, x0, y0, dw, dh);
    if (prog > 0.001) {
      const px = Math.min(s.w, s.pad + (s.w - s.pad * 2) * prog);
      g.drawImage(s.fill, 0, 0, px, s.h, x0, y0, px * k, dh);
    }
  }

  _kenBurns(t, seed, dim) {
    const g = this.g;
    const list = this.lib.scenery;
    const n = list.length;
    if (!n) {
      // painted dusk until the photos are in
      const grd = this._dusk || (this._dusk = (() => {
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, '#2d2a5a');
        gr.addColorStop(0.55, '#d0704a');
        gr.addColorStop(1, '#3a2418');
        return gr;
      })());
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      this._setAvg(0.5, 0.33, 0.3);
      return;
    }
    const k = Math.floor(t / KB_SEG);
    const f = (t - k * KB_SEG) / KB_SEG;
    const e0 = list[(k + seed) % n];
    this._kbImage(e0, k, f, 1);
    this._setAvg(e0.avg[0], e0.avg[1], e0.avg[2]);
    const fadeStart = 1 - KB_FADE / KB_SEG;
    if (f > fadeStart && n > 1) {
      const a = (f - fadeStart) / (1 - fadeStart);
      const e1 = list[(k + 1 + seed) % n];
      this._kbImage(e1, k + 1, f - 1, a);
      this._mixAvg(e1.avg, a);
    }
    g.globalAlpha = 1;
    // cheap VCD colour: a warm lift, washed blacks
    g.fillStyle = dim ? 'rgba(10,8,6,0.32)' : 'rgba(255,214,170,0.07)';
    g.fillRect(0, 0, W, H);
  }

  _kbImage(e, k, f, alpha) {
    const g = this.g;
    const h1 = hash(k * 1.37 + 0.5), h2 = hash(k * 2.11 + 3.1), h3 = hash(k * 0.73 + 9.7);
    const cover = Math.max(W / e.w, H / e.h);
    const zin = (k & 1) === 0;
    const z0 = 1.05 + h3 * 0.05, z1 = z0 + 0.13;
    const z = zin ? z0 + (z1 - z0) * f : z1 - (z1 - z0) * f;
    const sw = W / (cover * z), sh = H / (cover * z);
    const mx = e.w - sw, my = e.h - sh;
    const dx = h1 * 2 - 1, dy = h2 * 2 - 1;
    const px = 0.5 + dx * (f - 0.5) * 0.9, py = 0.5 + dy * (f - 0.5) * 0.6;
    const sx = Math.max(0, Math.min(mx, mx * px)), sy = Math.max(0, Math.min(my, my * py));
    g.globalAlpha = alpha;
    g.drawImage(e.img, sx, sy, sw, sh, 0, 0, W, H);
  }

  // ---- cat album -------------------------------------------------------------------------------------
  _drawSlideshow() {
    const g = this.g;
    const S = this.show;
    // slide index from the show clock (the intro card counts as slide 0)
    const si = Math.floor(S.t / SLIDE_DUR);
    if (si !== S.slide) {
      S.slide = si;
      const slot = (this.slideCur = 1 - this.slideCur);
      const intro = S.intro && si === 0;
      if (!intro) this.catCursor++;
      this._composeSlide(slot, this.catCursor, intro || !this.lib.cats.length);
      this.slideTrans[slot] = hash(this.catCursor * 3.3) * 3;
      // stop after 2-4 photos when nothing asks for the album any more (draw() decides)
    }
    const lt = S.t - si * SLIDE_DUR;
    g.drawImage(this.albumBg, 0, 0);
    const cur = this.slideCur, prev = 1 - cur;
    const tr = clamp01(lt / SLIDE_TRANS);
    if (tr < 1 && si > 0) this._drawSlide(prev, 1, 0, lt + SLIDE_DUR);
    // transition in: star iris / push from the right / fade
    const kind = this.slideTrans[cur] | 0;
    if (tr < 1 && si > 0) {
      const e = ease(tr);
      if (kind === 0) {
        g.save();
        g.beginPath();
        starburst(g, W / 2, H / 2, e * W * 0.9, e * W * 0.55, 5);
        g.clip();
        g.drawImage(this.albumBg, 0, 0);
        this._drawSlide(cur, 1, 0, lt);
        g.restore();
      } else if (kind === 1) {
        g.save();
        g.translate((1 - e) * W, 0);
        g.drawImage(this.albumBg, 0, 0);
        this._drawSlide(cur, 1, 0, lt);
        g.restore();
      } else this._drawSlide(cur, e, 0, lt);
    } else this._drawSlide(cur, 1, 0, lt);
    const a = this.slideAvg[cur];
    this._setAvg(a[0], a[1], a[2]);
  }

  _drawSlide(slot, alpha, dx, lt) {
    const g = this.g;
    const z = 1 + Math.min(lt, SLIDE_DUR) * 0.012; // slow push-in
    g.save();
    g.globalAlpha = alpha;
    g.translate(W / 2 + dx, H / 2);
    g.scale(z, z);
    g.drawImage(this.slideCan[slot], -W / 2, -H / 2);
    // scare: the cat becomes a pale face for a frame or two
    if (this.glitchFrames > 0 && this.glitchKind === 'face' && slot === this.slideCur) {
      const r = this.slideRect[slot];
      if (r[2] > 0) {
        g.translate(r[0] - W / 2, r[1] - H / 2);
        g.rotate(r[4]);
        g.beginPath();
        g.rect(-r[2] / 2, -r[3] / 2, r[2], r[3]);
        g.clip();
        g.fillStyle = '#121414';
        g.fillRect(-r[2] / 2, -r[3] / 2, r[2], r[3]);
        const fs = r[3] * 1.15;
        g.drawImage(this.face, -fs / 2, -fs * 0.52, fs, fs);
      } else g.drawImage(this.face, -W / 2 + W * 0.3, -H / 2, H, H);
    }
    g.restore();
    g.globalAlpha = 1;
  }

  // ---- talk / DJ ---------------------------------------------------------------------------------------
  _drawTalk(plan, f) {
    this._kenBurns(this.t * 0.7, plan.station === 4 ? 2 : this.songSeed, plan.station === 4);
    const header = plan.station === 4 ? 'ธรรมะยามดึก' : '';
    this._textBlock(plan.text || '', header);
    this.g.drawImage(this.textCan, 0, H - 104);
    void f;
  }

  // ---- static, interference, glitch ---------------------------------------------------------------------
  _drawStatic(f) {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const n = this.noise[(Math.random() * 3) | 0];
    const ox = (Math.random() * 40) | 0, oy = (Math.random() * 20) | 0;
    g.drawImage(n, ox, oy, 88, 52, 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    // rolling bar
    const y = ((this.t * 90) % (H + 80)) - 40;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, y, W, 40);
    this._setAvg(0.42, 0.42, 0.44);
    if (f.tuning) {
      const st = f.stationLabel || '';
      this._osd(st);
      g.drawImage(this.osdCan, 18, H - 60);
    }
  }

  _interference(v) {
    const g = this.g;
    g.globalAlpha = Math.min(0.75, v * 0.8);
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'screen';
    g.drawImage(this.noise[(Math.random() * 3) | 0], (Math.random() * 40) | 0, 0, 88, 72, 0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    if (Math.random() < v * 0.5) {
      const y = (Math.random() * H) | 0, h = 6 + ((Math.random() * 24) | 0);
      g.globalAlpha = 1;
      g.drawImage(this.canvas, 0, y, W, h, (Math.random() - 0.5) * 50 * v, y, W, h);
    }
    g.globalAlpha = 1;
  }

  _tear() {
    const g = this.g;
    for (let i = 0; i < 6; i++) {
      const y = (Math.random() * H) | 0, h = 4 + ((Math.random() * 30) | 0);
      g.drawImage(this.canvas, 0, y, W, h, (Math.random() - 0.5) * 70, y, W, h);
    }
    g.globalCompositeOperation = 'difference';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(0, (Math.random() * H) | 0, W, 3 + ((Math.random() * 6) | 0));
    g.globalCompositeOperation = 'saturation';
    g.fillStyle = 'rgba(128,128,128,0.6)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    this._setAvg(0.6, 0.62, 0.66);
  }

  _drawVolume() {
    const g = this.g;
    const a = clamp01(this.volT / 0.4);
    g.globalAlpha = a * 0.9;
    g.fillStyle = 'rgba(16,40,170,0.82)';
    g.fillRect(W / 2 - 120, H - 52, 240, 30);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 16; i++) {
      if (i < 11) g.fillRect(W / 2 - 104 + i * 13, H - 44, 9, 14);
      else g.fillRect(W / 2 - 104 + i * 13, H - 39, 9, 4);
    }
    g.globalAlpha = 1;
  }

  _setAvg(r, gg, b) {
    this.avg[0] = r;
    this.avg[1] = gg;
    this.avg[2] = b;
    this.level = 1;
  }
  _mixAvg(c, k) {
    const A = this.avg;
    A[0] += (c[0] - A[0]) * k;
    A[1] += (c[1] - A[1]) * k;
    A[2] += (c[2] - A[2]) * k;
  }

  /** Black, for switching off (one upload). */
  clear() {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);
    this.avg[0] = this.avg[1] = this.avg[2] = 0;
    this.level = 0;
    this.texture.needsUpdate = true;
    this._endShow();
  }

  dispose() {
    this.texture.dispose();
  }
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  g.closePath();
}

function sparklePath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x, y, x + s, y);
  g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y);
  g.quadraticCurveTo(x, y, x, y - s);
  g.closePath();
}

function starburst(g, x, y, r0, r1, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r1 : r0;
    if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** A heart traced with a fingertip: wobbly, pressure varies, the end overshoots or stops short. */
function fingerHeart(g, rng, x, y, s) {
  const N = 46;
  const end = rng.range(0.9, 1.06);
  const wob = rng.range(0.6, 1.4);
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle;
  let px = 0, py = 0;
  for (let i = 0; i <= N; i++) {
    const t = ((i / N) * end) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const qx = x + (hx / 16) * s + Math.sin(i * 0.9 * wob) * s * 0.03, qy = y + (hy / 16) * s + Math.cos(i * 0.7 * wob) * s * 0.03;
    if (i) {
      g.lineWidth = s * (0.2 + 0.07 * Math.sin(i * 0.33 + wob));
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(qx, qy);
      g.stroke();
    }
    px = qx;
    py = qy;
  }
  g.restore();
}
