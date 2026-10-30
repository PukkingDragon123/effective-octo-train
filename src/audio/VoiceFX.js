// Voice rack: the Web Audio chain every spoken line goes through. A small pool of racks is built once per
// AudioContext and reused line after line; a line only creates its buffer source, a channel splitter and (ghosts)
// a few oscillators, because Web Audio source nodes are single-use.
//
// A line arrives as one multi-channel AudioBuffer of time-aligned layers (Synth/speech.js renderVoiceLine):
//   main     the voice                       -> flutter (ring-mod + bit-crush bursts on stressed syllables)
//   sub      octave-down double (ghosts)        -> tone (high-pass, proximity shelf, presence, air / phone band,
//   breath   inhale before the line, or            drive) -> HRTF panner at the speaker's mouth (or the wrong ear
//            breaths that do not match the words      first) -> voice bus (direct, or "outside" = muffled by the
//   whisper  whispered double (ghosts)               car body) + cabin / outdoor reverb + ghost "impossible hall"
//   swell    reverse-reverb swell into the first word
// Ghost layers that live behind you: the whisper (delayed 90-250 ms), the ghost's breathing and part of the swell
// go to a second HRTF panner just behind the listener's head (the back seat). A sub-bass hum (two beating
// oscillators with a few harmonics, so small speakers still carry it) sits under a ghost's line.
//
// The rack also serves OS text-to-speech lines: the TTS audio itself cannot enter Web Audio, so the rack plays
// the "shadow" layers (breath / sub / whisper / swell, main muted) and Voice.js keeps them in step with the
// utterance's word-boundary events (sync()) and triggers flutter on words (flutterNow()).

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smoothstep = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

function staircase(bits = 4, n = 2049) {
  const c = new Float32Array(n);
  const L = 2 ** (bits - 1);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * L) / L;
  }
  return c;
}
function driveCurve(k, n = 1025) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

// object names that sit outside the cabin (the voice goes through the glass / car body)
const OUTSIDE_NAME = /mirror(left|right)|^door|trunk|rooftop|hood|headlight|taillight|outside/i;
const SELF_NAME = /player/i;

/** Mouth position helper: head bone of a humanoid, seat anchors raised to head height. Cached per object. */
const MOUTH = new WeakMap();
function mouthOf(obj) {
  let m = MOUTH.get(obj);
  if (m) return m;
  m = { node: obj, dy: 0, self: SELF_NAME.test(obj.name || ''), outside: OUTSIDE_NAME.test(obj.name || '') };
  let head = null;
  if (/^humanoid/i.test(obj.name || '') && obj.traverse) {
    obj.traverse((o) => {
      if (!head && o.isBone && /(^|[^a-z])head$/i.test(o.name || '')) head = o;
    });
  }
  if (head) {
    m.node = head;
    m.dy = 0.05;
  } else if (/seat$/i.test(obj.name || '')) m.dy = 0.64;
  MOUTH.set(obj, m);
  return m;
}

let rackSeq = 1;

export class VoiceRack {
  constructor(fx) {
    this.fx = fx;
    this.core = fx.core;
    const ctx = (this.ctx = fx.core.ctx);
    this.id = rackSeq++;
    this.active = false;
    this.until = 0;
    this.p = [0, 0, 0]; // speaker position (scratch)
    const G = (v = 1) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const F = (type, f, q = 0.7, gain = 0) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = Math.min(f, ctx.sampleRate * 0.45);
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    };
    const P = (ref, roll) => {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = roll;
      p.maxDistance = 10000;
      return p;
    };
    const bus = fx.core.buses.voice;
    // ---- layer inputs (fed by the per-line splitter) ----
    this.gate = G(1);
    this.inMain = G(1);
    this.inSub = G(1);
    this.inWhisper = G(1);
    this.inBreath = G(1);
    this.inSwell = G(1);
    this.subLP = F('lowpass', 1100, 0.5);
    this.inSub.connect(this.subLP);
    // ---- flutter: dry + (ring-mod -> bit-crush) wet, opened in short bursts ----
    this.sum = G(1);
    this.inMain.connect(this.sum);
    this.subLP.connect(this.sum);
    this.dry = G(1);
    this.ring = G(0); // gain driven at audio rate by a per-line oscillator = ring modulation
    this.crushPre = G(2.5);
    this.crush = ctx.createWaveShaper();
    this.crush.curve = fx.stairCurve;
    this.crushPost = G(0.45);
    this.wet = G(0);
    this.sum.connect(this.dry);
    this.sum.connect(this.ring);
    this.ring.connect(this.crushPre);
    this.crushPre.connect(this.crush);
    this.crush.connect(this.crushPost);
    this.crushPost.connect(this.wet);
    // ---- tone ----
    this.hp = F('highpass', 70, 0.7);
    this.prox = F('lowshelf', 220, 0.7, 0);
    this.pres = F('peaking', 2700, 0.9, 0);
    this.lp = F('lowpass', 16000, 0.6);
    this.drive = ctx.createWaveShaper();
    this.out = G(1);
    this.dry.connect(this.hp);
    this.wet.connect(this.hp);
    this.hp.connect(this.prox);
    this.prox.connect(this.pres);
    this.pres.connect(this.lp);
    this.lp.connect(this.drive);
    this.drive.connect(this.out);
    // breath / swell into the main path (after the flutter, never ring-modulated)
    this.breathMain = G(1);
    this.swellMain = G(0);
    this.inBreath.connect(this.breathMain);
    this.inSwell.connect(this.swellMain);
    this.breathMain.connect(this.hp);
    this.swellMain.connect(this.hp);
    // ---- placement ----
    this.spat = G(1);
    this.self = G(0); // the player's own voice: centred, no panner
    this.panner = P(1, 1.1);
    this.outDirect = G(1);
    this.outOutside = G(0);
    this.out.connect(this.spat);
    this.out.connect(this.self);
    this.spat.connect(this.panner);
    this.panner.connect(this.outDirect);
    this.panner.connect(this.outOutside);
    this.outDirect.connect(bus.direct);
    this.outOutside.connect(bus.outside);
    this.self.connect(bus.direct);
    this.revCab = G(0);
    this.revOut = G(0);
    this.revHall = G(0);
    this.out.connect(this.revCab);
    this.out.connect(this.revOut);
    this.out.connect(this.revHall);
    this.revCab.connect(bus.sendCab);
    this.revOut.connect(bus.sendOut);
    this.revHall.connect(fx.hallIn);
    // ---- behind the listener's head: whisper (delayed), ghost breath, swell ----
    this.whDelay = ctx.createDelay(1.2);
    this.whDelay.delayTime.value = 0.15;
    this.whHP = F('highpass', 260, 0.7);
    this.backIn = G(1);
    this.breathBack = G(0);
    this.swellBack = G(0);
    this.inWhisper.connect(this.whDelay);
    this.whDelay.connect(this.whHP);
    this.whHP.connect(this.backIn);
    this.inBreath.connect(this.breathBack);
    this.inSwell.connect(this.swellBack);
    this.breathBack.connect(this.backIn);
    this.swellBack.connect(this.backIn);
    this.backPanner = P(0.5, 1);
    this.backOut = G(1);
    this.backHall = G(0);
    this.backIn.connect(this.backPanner);
    this.backPanner.connect(this.backOut);
    this.backOut.connect(bus.direct);
    this.backIn.connect(this.backHall);
    this.backHall.connect(fx.hallIn);
    // ---- sub-bass hum ----
    this.humLP = F('lowpass', 150, 0.5);
    this.humGain = G(0);
    this.humLP.connect(this.humGain);
    this.humGain.connect(bus.direct);
    this._autos = [this.wet.gain, this.dry.gain, this.out.gain, this.humGain.gain, this.backOut.gain, this.gate.gain];
    this.src = null;
    this.split = null;
    this.oscs = [];
  }

  // ---------------------------------------------------------------------------------------------
  /**
   * Start a line. buf: AudioBuffer of layers, meta: renderVoiceLine meta (layout, speechStart, stress...).
   * o: { when, object, position, offset3, outside, self, fx:'phone'|'radio'|null, ghost 0..1, wrongEar, seed,
   *      volume, muteMain (OS-TTS shadow), ttsSync (flutter driven by word events, not pre-scheduled), child }
   * Returns { t0, speechStart, speechEnd, end } in context time.
   */
  play(buf, meta, o = {}) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t0 = Math.max(now + 0.015, o.when ?? 0);
    this._release();
    this.active = true;
    this.o = o;
    this.meta = meta;
    this.t0 = t0;
    let s = (o.seed >>> 0) || 1;
    const rnd = () => {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
      return (s >>> 8) / 16777216;
    };
    this.rnd = rnd;
    const g = clamp(o.ghost ?? 0);
    this.g = g;
    for (const p of this._autos) p.cancelScheduledValues(now);
    // ---- per-line routing gains ----
    const set = (param, v) => param.setValueAtTime(v, now);
    const vol = o.volume ?? 1;
    set(this.out.gain, vol);
    set(this.gate.gain, 1);
    set(this.inMain.gain, o.muteMain ? 0 : 1);
    set(this.wet.gain, 0);
    set(this.dry.gain, 1);
    const ghostly = g > 0.25 || o.muteMain;
    set(this.breathMain.gain, ghostly ? 0.3 : 1);
    set(this.breathBack.gain, ghostly ? 1 : 0);
    set(this.swellMain.gain, 0.45);
    set(this.swellBack.gain, 0.8);
    set(this.backOut.gain, 1);
    this.whDelay.delayTime.setValueAtTime(0.09 + rnd() * 0.16, now);
    set(this.revHall.gain, ghostly ? 0.12 + 0.3 * g : 0);
    set(this.backHall.gain, ghostly ? 0.15 + 0.25 * g : 0);
    // ---- tone: phone / radio band, or a natural close voice ----
    const fx = o.fx || null;
    this.fxKind = fx;
    if (fx === 'phone' || fx === 'radio') {
      const phone = fx === 'phone';
      set(this.hp.frequency, phone ? 330 : 240);
      set(this.hp.Q, 0.9);
      set(this.prox.gain, 0);
      set(this.pres.frequency, phone ? 1700 : 2200);
      set(this.pres.gain, phone ? 7 : 5);
      set(this.lp.frequency, phone ? 3300 : 4300);
      set(this.lp.Q, 0.9);
      this.drive.curve = phone ? this.fx.phoneCurve : this.fx.radioCurve;
      set(this.out.gain, vol * (phone ? 0.62 : 0.7));
    } else {
      set(this.hp.frequency, o.child ? 120 : 75);
      set(this.hp.Q, 0.7);
      set(this.pres.frequency, 2700);
      set(this.pres.gain, 1.5);
      set(this.lp.Q, 0.6);
      this.drive.curve = null;
    }
    // ---- position & routing ----
    const m = o.object ? mouthOf(o.object) : null;
    this.mouth = m;
    this.isSelf = !!(o.self || m?.self);
    this.isOutside = o.outside ?? m?.outside ?? null; // null = decide from distance
    set(this.spat.gain, this.isSelf ? 0 : 1);
    set(this.self.gain, this.isSelf ? 0.85 : 0);
    // a ghost line may begin in the wrong ear and slide to where the speaker really is
    this.we = o.wrongEar && !this.isSelf ? { start: t0 + Math.max(0, meta.speechStart - 0.35), dur: 0.6 + rnd() * 0.9, side: rnd() < 0.5 ? -1 : 1 } : null;
    this.backSide = rnd() < 0.5 ? -1 : 1;
    this.update(now, true);
    // ---- source ----
    const n = buf.numberOfChannels;
    const split = ctx.createChannelSplitter(n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gate);
    this.gate.connect(split);
    const IN = { main: this.inMain, sub: this.inSub, whisper: this.inWhisper, breath: this.inBreath, swell: this.inSwell };
    const layout = meta.layout || ['main'];
    for (let k = 0; k < n; k++) {
      const dst = IN[layout[k]];
      if (dst) split.connect(dst, k);
    }
    src.start(t0);
    this.src = src;
    this.split = split;
    this.pos = { at: t0, off: 0, rate: 1 };
    this.until = t0 + buf.duration + 0.5;
    // ---- ghost: flutter, hum ----
    if (ghostly) {
      const ring = ctx.createOscillator();
      ring.frequency.value = 60;
      ring.connect(this.ring.gain);
      ring.start(t0);
      this.oscs.push(ring);
      this.ringOsc = ring;
      if (!o.ttsSync) {
        const p = 0.25 + 0.6 * g;
        let last = -1;
        for (const ts of meta.stress || []) {
          if (rnd() > p) continue;
          const at = t0 + ts + 0.015;
          if (at < last + 0.06) continue;
          last = this._flutter(at, 0.07 + rnd() * 0.12, (0.5 + rnd() * 0.5) * (0.45 + 0.55 * g));
        }
      }
      this._hum(t0 + Math.max(0, meta.speechStart - 0.9), t0 + meta.speechEnd + 0.4, 0.035 + 0.075 * g);
    }
    return { t0, speechStart: t0 + meta.speechStart, speechEnd: t0 + meta.speechEnd, end: this.until };
  }

  /** A burst of ring-mod / crush on the voice (a stressed syllable). Returns the burst's end time. */
  _flutter(at, len, depth) {
    const rnd = this.rnd;
    if (this.ringOsc) this.ringOsc.frequency.setValueAtTime(rnd() < 0.75 ? 28 + rnd() * 110 : 380 + rnd() * 420, at);
    const w = this.wet.gain;
    const d = this.dry.gain;
    w.setValueAtTime(0, at);
    w.linearRampToValueAtTime(depth, at + 0.012);
    w.setValueAtTime(depth, at + len);
    w.linearRampToValueAtTime(0, at + len + 0.035);
    d.setValueAtTime(1, at);
    d.linearRampToValueAtTime(1 - 0.65 * depth, at + 0.012);
    d.setValueAtTime(1 - 0.65 * depth, at + len);
    d.linearRampToValueAtTime(1, at + len + 0.035);
    return at + len + 0.035;
  }

  /** Flutter now (OS-TTS word boundary). */
  flutterNow(depth = 0.7, len = 0.1) {
    if (!this.active || !this.ringOsc) return;
    const now = this.ctx.currentTime;
    if (now < (this._fl || 0)) return;
    this._fl = this._flutter(now + 0.01, len, depth);
  }

  _hum(start, end, level) {
    const ctx = this.ctx;
    const f = 34 + this.rnd() * 14;
    for (const [ratio, lvl] of [[1, 1], [1.013, 0.8]]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.fx.humWave);
      osc.frequency.value = f * ratio;
      osc.connect(this.humLP);
      osc.start(start);
      osc.stop(end + 2);
      this.oscs.push(osc);
    }
    const hg = this.humGain.gain;
    hg.setValueAtTime(0, start);
    hg.linearRampToValueAtTime(level, start + 1.1);
    hg.setValueAtTime(level, end);
    hg.linearRampToValueAtTime(0, end + 1.6);
    this.until = Math.max(this.until, end + 2);
  }

  // ---------------------------------------------------------------------------------------------
  /** Shadow position in buffer seconds (OS-TTS sync). */
  position(now = this.ctx.currentTime) {
    const p = this.pos;
    return p ? p.off + Math.max(0, now - p.at) * p.rate : 0;
  }
  /** Pull the shadow layers toward buffer time `target` (s): gentle rate change, or a jump when far off. */
  sync(target) {
    if (!this.active || !this.src) return;
    const now = this.ctx.currentTime;
    if (now < this.t0) return;
    const pos = this.position(now);
    const err = target - pos;
    if (Math.abs(err) > 0.35) {
      this.seek(Math.max(0, target));
      return;
    }
    const r = clamp(1 + err * 1.2, 0.82, 1.22);
    this.pos = { at: now, off: pos, rate: r };
    this.src.playbackRate.setTargetAtTime(r, now, 0.04);
  }
  /** Restart the layers at buffer time `off` (short dip so the swap does not click). */
  seek(off) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const buf = this.src?.buffer;
    if (!buf || off >= buf.duration - 0.05) return;
    const gg = this.gate.gain;
    gg.cancelScheduledValues(now);
    gg.setValueAtTime(gg.value, now);
    gg.linearRampToValueAtTime(0, now + 0.012);
    gg.linearRampToValueAtTime(1, now + 0.04);
    const old = this.src;
    try {
      old.stop(now + 0.014);
    } catch (e) {
      /* ignore */
    }
    setTimeout(() => {
      try {
        old.disconnect();
      } catch (e) {
        /* ignore */
      }
    }, 200);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gate);
    src.start(now + 0.012, off);
    this.src = src;
    this.pos = { at: now + 0.012, off, rate: 1 };
    this.until = Math.max(this.until, now + (buf.duration - off) + 0.5);
  }

  /** Fade the line out (interrupted, or the OS voice finished before the shadow). */
  stop(fade = 0.12) {
    if (!this.active) return;
    const now = this.ctx.currentTime;
    for (const p of [this.out.gain, this.backOut.gain, this.humGain.gain]) {
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    }
    this.until = Math.min(this.until, now + fade + 0.4);
  }

  _release() {
    for (const n of [this.src, ...this.oscs]) {
      if (!n) continue;
      try {
        n.stop();
      } catch (e) {
        /* ignore */
      }
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
    try {
      this.split?.disconnect();
      this.gate.disconnect();
    } catch (e) {
      /* ignore */
    }
    this.src = null;
    this.split = null;
    this.oscs.length = 0;
    this.ringOsc = null;
    this.active = false;
  }

  // ---------------------------------------------------------------------------------------------
  /** Per frame (only while active): panner positions, wrong-ear slide, distance tone, inside / outside routing. */
  update(now, immediate = false) {
    const o = this.o;
    const sp = this.core.spatial;
    const lx = sp.lx, ly = sp.ly, lz = sp.lz;
    const f = sp.lf, r = sp.lr, u = sp.lu;
    const P = this.p;
    if (this.mouth) {
      const node = this.mouth.node;
      const e = node.matrixWorld?.elements;
      if (e) {
        P[0] = e[12];
        P[1] = e[13] + this.mouth.dy;
        P[2] = e[14];
        if (o.offset3) {
          const [ox, oy, oz] = o.offset3;
          P[0] += e[0] * ox + e[4] * oy + e[8] * oz;
          P[1] += e[1] * ox + e[5] * oy + e[9] * oz;
          P[2] += e[2] * ox + e[6] * oy + e[10] * oz;
        }
      }
    } else if (o.position) {
      const p = o.position;
      P[0] = p.x ?? p[0] ?? 0;
      P[1] = p.y ?? p[1] ?? 0;
      P[2] = p.z ?? p[2] ?? 0;
    } else {
      // no position: a voice just in front of the listener
      P[0] = lx + f[0] * 0.9;
      P[1] = ly + f[1] * 0.9;
      P[2] = lz + f[2] * 0.9;
    }
    let x = P[0], y = P[1], z = P[2];
    const dx = x - lx, dy = y - ly, dz = z - lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (this.we) {
      const w = 1 - smoothstep((now - this.we.start) / this.we.dur);
      if (w > 0) {
        // mirror across the listener's median plane (or push to one side when straight ahead / behind)
        const side = dx * r[0] + dy * r[1] + dz * r[2];
        const shift = Math.abs(side) > 0.2 ? -2 * side : this.we.side * 0.7;
        x += r[0] * shift * w;
        y += r[1] * shift * w;
        z += r[2] * shift * w;
      } else if (now > this.we.start) this.we = null;
    }
    const tc = immediate ? 0 : 0.03;
    setPos(this.panner, x, y, z, now, tc);
    // the copy behind the head, a little to the side away from the speaker
    const side = dx * r[0] + dy * r[1] + dz * r[2];
    const bs = side > 0.15 ? -1 : side < -0.15 ? 1 : this.backSide;
    setPos(this.backPanner, lx - f[0] * 0.55 + r[0] * bs * 0.22 - u[0] * 0.04, ly - f[1] * 0.55 + r[1] * bs * 0.22 - u[1] * 0.04, lz - f[2] * 0.55 + r[2] * bs * 0.22 - u[2] * 0.04, now, tc);
    // own voice at very close range
    if (!this.isSelf && d < 0.28 && !o.position) {
      this.isSelf = true;
      this.spat.gain.setTargetAtTime(0, now, 0.02);
      this.self.gain.setTargetAtTime(0.85, now, 0.02);
    }
    // inside the cabin or outside it (through glass when the player sits in the closed car)
    const muffle = this.core.muffle || 0;
    const outside = this.isOutside ?? (muffle > 0.3 && d > 1.9);
    const set = (param, v) => (immediate ? param.setValueAtTime(v, now) : param.setTargetAtTime(v, now, 0.08));
    set(this.outDirect.gain, outside ? 0 : 1);
    set(this.outOutside.gain, outside ? 1 : 0);
    const ghostly = this.g > 0.25 || o.muteMain;
    const inCab = muffle > 0.3 && !outside;
    set(this.revCab.gain, this.isSelf ? 0.08 : inCab ? (ghostly ? 0.35 : 0.2) : 0.04);
    set(this.revOut.gain, this.isSelf ? 0 : inCab ? 0 : ghostly ? 0.4 : 0.22);
    // distance colour (normal voices): proximity warmth when very close, air loss far away
    if (!this.fxKind) {
      set(this.prox.gain, clamp((0.75 - d) / 0.5) * 3.5);
      set(this.lp.frequency, Math.min(this.ctx.sampleRate * 0.45, 16000 * Math.exp(-Math.max(0, d - 2) / 40)));
    }
  }
}

function setPos(p, x, y, z, now, tc) {
  if (p.positionX) {
    if (tc <= 0) {
      p.positionX.setValueAtTime(x, now);
      p.positionY.setValueAtTime(y, now);
      p.positionZ.setValueAtTime(z, now);
    } else {
      p.positionX.setTargetAtTime(x, now, tc);
      p.positionY.setTargetAtTime(y, now, tc);
      p.positionZ.setTargetAtTime(z, now, tc);
    }
  } else p.setPosition(x, y, z);
}

/** Pool of voice racks + the shared ghost hall reverb, bound to one AudioCore. */
export class VoiceFX {
  constructor(core, size = 3) {
    this.core = core;
    const ctx = core.ctx;
    this.ctx = ctx;
    this.stairCurve = staircase(4);
    this.phoneCurve = driveCurve(3.2);
    this.radioCurve = driveCurve(2.2);
    // hum timbre: fundamental + 2nd / 3rd harmonics (audible on laptop speakers)
    const re = new Float32Array([0, 0, 0, 0]);
    const im = new Float32Array([0, 1, 0.5, 0.22]);
    this.humWave = ctx.createPeriodicWave(re, im, { disableNormalization: false });
    // an impossible space: ghosts sound as if in a hall even inside the small cab
    this.hallIn = ctx.createGain();
    this.hall = core.makeReverb('hall');
    this.hallOut = ctx.createGain();
    this.hallOut.gain.value = 0.85;
    this.hallIn.connect(this.hall);
    this.hall.connect(this.hallOut);
    this.hallOut.connect(core.buses.voice.direct);
    this.racks = [];
    for (let i = 0; i < size; i++) this.racks.push(new VoiceRack(this));
  }

  /** A free rack (or the one that frees soonest). */
  acquire() {
    const now = this.ctx.currentTime;
    let best = null;
    for (const r of this.racks) {
      if (!r.active || now > r.until) {
        if (r.active) r._release();
        return r;
      }
      if (!best || r.until < best.until) best = r;
    }
    best.stop(0.05);
    best._release();
    return best;
  }

  get busy() {
    return this.racks.some((r) => r.active);
  }

  /** Per frame: move active racks, free finished ones. */
  update() {
    const now = this.ctx.currentTime;
    for (const r of this.racks) {
      if (!r.active) continue;
      if (now > r.until) {
        r._release();
        continue;
      }
      r.update(now, false);
    }
  }

  stopAll(fade = 0.12) {
    for (const r of this.racks) if (r.active) r.stop(fade);
  }
}

export { TAU };
