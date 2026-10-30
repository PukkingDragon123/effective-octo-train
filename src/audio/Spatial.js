// Spatialisation: PannerNode sources that follow Object3Ds (or sit at fixed
// positions), air absorption (distance low-pass), distance-scaled reverb sends,
// an HRTF budget (nearest sources get HRTF, the rest equal-power), and the
// listener driven from the camera's world matrix each frame.
const MAX_HRTF = 20;

export class Spatial {
  constructor(core) {
    this.core = core;
    this.ctx = core.ctx;
    this.sources = new Set();
    this.hrtfCount = 0;
    this.lx = 0;
    this.ly = 1.6;
    this.lz = 0;
    this._t = 0;
  }

  _srcPos(s) {
    const o = s.voice.opts;
    if (o.object) {
      const e = o.object.matrixWorld?.elements;
      if (e) {
        s.x = e[12];
        s.y = e[13];
        s.z = e[14];
      } else if (o.object.position) {
        s.x = o.object.position.x;
        s.y = o.object.position.y;
        s.z = o.object.position.z;
      }
      if (o.offset3 && e) {
        // local offset (e.g. a mouth above an anchor): transform by the matrix
        const [ox, oy, oz] = o.offset3;
        s.x += e[0] * ox + e[4] * oy + e[8] * oz;
        s.y += e[1] * ox + e[5] * oy + e[9] * oz;
        s.z += e[2] * ox + e[6] * oy + e[10] * oz;
      }
    } else if (o.position) {
      const p = o.position;
      s.x = p.x ?? p[0] ?? 0;
      s.y = p.y ?? p[1] ?? 0;
      s.z = p.z ?? p[2] ?? 0;
    }
  }

  createSource(voice, opts) {
    const ctx = this.ctx;
    const def = voice.def;
    const s = { voice, x: 0, y: 0, z: 0, tracked: !!opts.object || !!opts.track };
    this._srcPos(s);
    const dx = s.x - this.lx, dy = s.y - this.ly, dz = s.z - this.lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const p = ctx.createPanner();
    const wantHrtf = opts.hrtf ?? (d < 35 && this.hrtfCount < MAX_HRTF);
    p.panningModel = wantHrtf ? 'HRTF' : 'equalpower';
    if (wantHrtf) this.hrtfCount++;
    s.hrtf = wantHrtf;
    p.distanceModel = opts.distanceModel || 'inverse';
    p.refDistance = opts.refDistance ?? def.ref ?? 1.5;
    p.rolloffFactor = opts.rolloff ?? def.rolloff ?? 1;
    p.maxDistance = opts.maxDistance ?? 10000;
    if (opts.cone) {
      p.coneInnerAngle = opts.cone[0];
      p.coneOuterAngle = opts.cone[1];
      p.coneOuterGain = opts.cone[2];
    }
    this._setPos(p, s.x, s.y, s.z, true);
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.Q.value = 0.5;
    air.frequency.value = this._airF(d);
    air.connect(p);
    s.panner = p;
    s.air = air;
    s.input = air;
    s.output = p;
    s.ref = p.refDistance;
    s.roll = p.rolloffFactor;
    s.d = d;
    this.sources.add(s);
    return s;
  }

  _airF(d) {
    return Math.max(1500, Math.min(this.ctx.sampleRate * 0.48, 20000, 22000 * Math.exp(-d / 55)));
  }

  _setPos(p, x, y, z, immediate) {
    if (p.positionX) {
      if (immediate) {
        p.positionX.value = x;
        p.positionY.value = y;
        p.positionZ.value = z;
      } else {
        const t = this.ctx.currentTime;
        p.positionX.setTargetAtTime(x, t, 0.02);
        p.positionY.setTargetAtTime(y, t, 0.02);
        p.positionZ.setTargetAtTime(z, t, 0.02);
      }
    } else p.setPosition(x, y, z);
  }

  updateSource(s, immediate = false) {
    this._srcPos(s);
    this._setPos(s.panner, s.x, s.y, s.z, immediate);
    const dx = s.x - this.lx, dy = s.y - this.ly, dz = s.z - this.lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    s.d = d;
    const t = this.ctx.currentTime;
    s.air.frequency.setTargetAtTime(this._airF(d), t, 0.05);
    const v = s.voice;
    if (v.send) {
      // reverb falls off with distance, but much slower than the direct sound
      const soft = s.ref / (s.ref + 0.3 * s.roll * Math.max(0, d - s.ref));
      const base = v.opts.reverb ?? v.def.reverb ?? 0.12;
      v.send.gain.setTargetAtTime(base * soft, t, 0.05);
    }
  }

  release(s) {
    if (!this.sources.has(s)) return;
    this.sources.delete(s);
    if (s.hrtf) this.hrtfCount--;
    try {
      s.air.disconnect();
      s.panner.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  /** Listener pose from a camera (uses its world matrix; updates it first). */
  updateListener(camera) {
    camera.updateMatrixWorld?.();
    const e = camera.matrixWorld.elements;
    const L = this.ctx.listener;
    const x = e[12], y = e[13], z = e[14];
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    this.lx = x;
    this.ly = y;
    this.lz = z;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      const k = 0.015;
      L.positionX.setTargetAtTime(x, t, k);
      L.positionY.setTargetAtTime(y, t, k);
      L.positionZ.setTargetAtTime(z, t, k);
      L.forwardX.setTargetAtTime(fx, t, k);
      L.forwardY.setTargetAtTime(fy, t, k);
      L.forwardZ.setTargetAtTime(fz, t, k);
      L.upX.setTargetAtTime(ux, t, k);
      L.upY.setTargetAtTime(uy, t, k);
      L.upZ.setTargetAtTime(uz, t, k);
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /** Listener at an explicit pose (offline tests). */
  setListener(x, y, z, fx = 0, fy = 0, fz = -1) {
    this.lx = x;
    this.ly = y;
    this.lz = z;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = x;
      L.positionY.value = y;
      L.positionZ.value = z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  update() {
    for (const s of this.sources) if (s.tracked) this.updateSource(s);
  }
}
