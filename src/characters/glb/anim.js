// Base layer: AnimationMixer over the shared retargeted UAL clips. Modes map to clips with
// crossfades; locomotion is speed-synced; talking blends the talking variants in.
//   stand/idle  Idle_Loop            talk          Idle_Talking_Loop / Sitting_Talking_Loop
//   walk        Walk_Loop | Walk_Formal_Loop (elderly / formal)     run  Jog_Fwd_Loop   sprint Sprint_Loop
//   sit         Sitting_Idle_Loop    sitCar        SitCar (Driving legs + Sitting upper body, derived)
//   drive/ride  Driving_Loop         crouch        Crouch_Idle_Loop / Crouch_Fwd_Loop
//   lie         Death01 (held at its end)          float / crawl / ceiling / hang: procedural over Idle
import * as THREE from 'three';
import { clamp } from '../../core/math.js';

const LOWER = new Set(['pelvis', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']);

/** derived clips (cached per template) */
function derived(t) {
  if (t._derived) return t._derived;
  const mk = (name, upperClip, lowerClip, dur) => {
    const up = t.clips.get(upperClip), lo = t.clips.get(lowerClip);
    if (!up || !lo) return null;
    const tracks = [];
    for (const tr of up.tracks) if (!LOWER.has(tr.name.split('.')[0])) tracks.push(tr.clone());
    for (const tr of lo.tracks) if (LOWER.has(tr.name.split('.')[0])) tracks.push(tr.clone());
    return new THREE.AnimationClip(name, dur ?? up.duration, tracks);
  };
  t._derived = {
    SitCar: mk('SitCar', 'Sitting_Idle_Loop', 'Driving_Loop'),
    SitCarTalk: mk('SitCarTalk', 'Sitting_Talking_Loop', 'Driving_Loop'),
    IdleUpperDriveLegs: mk('IdleUpperDriveLegs', 'Idle_Loop', 'Driving_Loop'),
  };
  return t._derived;
}

const MODE_CLIP = {
  stand: 'Idle_Loop', idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  sit: 'Sitting_Idle_Loop', sitCar: 'SitCar', drive: 'Driving_Loop', ride: 'Driving_Loop',
  crouch: 'Crouch_Idle_Loop', lie: 'Death01', float: 'Idle_Loop', crawl: 'Crouch_Idle_Loop', ceiling: 'Crouch_Idle_Loop', hang: 'Idle_Loop',
};
const TALK_CLIP = { Idle_Loop: 'Idle_Talking_Loop', Sitting_Idle_Loop: 'Sitting_Talking_Loop', SitCar: 'SitCarTalk' };
// clip ground speed (m/s) for the 1.81 m template body
const LOCO_SPEED = { Walk_Loop: 1.42, Walk_Formal_Loop: 1.25, Jog_Fwd_Loop: 3.3, Sprint_Loop: 5.6, Crouch_Fwd_Loop: 0.9 };

export class AnimController {
  constructor(h) {
    this.h = h;
    this.t = h.t;
    this.mixer = new THREE.AnimationMixer(h.inner);
    this.acts = new Map();
    this.w = new Map(); // current weights
    this.want = new Map();
    this.mode = 'stand';
    this.blend = 0.4;
    this.speed = 0; // measured ground speed (m/s)
    this.talk = 0;
    this.talking = false;
    this.formal = false;
    this.phase = 0;
    this.clip = 'Idle_Loop';
    this.timeOffset = (h.look.seed % 1000) / 1000;
  }
  clipOf(name) { return this.t.clips.get(name) || derived(this.t)[name] || null; }
  action(name) {
    let a = this.acts.get(name);
    if (a) return a;
    const clip = this.clipOf(name);
    if (!clip) return null;
    a = this.mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    a.time = (this.timeOffset * clip.duration) % clip.duration;
    if (name === 'Death01') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    this.acts.set(name, a);
    this.w.set(name, 0);
    return a;
  }
  setMode(mode, opts = {}) {
    if (mode === 'idle') mode = 'stand';
    this.mode = mode;
    this.blend = opts.blend ?? (mode === 'sit' || mode === 'sitCar' ? 0.6 : 0.35);
    if (opts.formal !== undefined) this.formal = opts.formal;
    this.gait = opts.gait || null;
    if (mode === 'lie') { const a = this.action('Death01'); if (a) { a.reset(); a.play(); } }
  }
  /** base clip for the current mode/speed */
  baseClip() {
    const m = this.mode;
    if (m === 'walk') {
      if (this.gait === 'sprint') return 'Sprint_Loop';
      if (this.gait === 'run') return 'Jog_Fwd_Loop';
      return this.formal || this.h.look.old > 0.4 ? 'Walk_Formal_Loop' : 'Walk_Loop';
    }
    if (m === 'run') return this.gait === 'sprint' ? 'Sprint_Loop' : 'Jog_Fwd_Loop';
    if (m === 'sprint') return 'Sprint_Loop';
    if (m === 'crouch' && this.speed > 0.2) return 'Crouch_Fwd_Loop';
    return MODE_CLIP[m] || 'Idle_Loop';
  }
  update(dt) {
    const base = this.baseClip();
    this.clip = base;
    const kt = 1 - Math.exp(-dt / Math.max(0.05, this.blend) * 3);
    this.talk += ((this.talking ? 1 : 0) - this.talk) * (1 - Math.exp(-dt * 3));
    const talkClip = TALK_CLIP[base];
    this.want.clear();
    if (talkClip && this.talk > 0.01) {
      this.want.set(base, 1 - this.talk * 0.85);
      this.want.set(talkClip, this.talk * 0.85);
    } else this.want.set(base, 1);
    if (!this.acts.has(base)) this.action(base);
    if (talkClip && this.talk > 0.01 && !this.acts.has(talkClip)) this.action(talkClip);
    let total = 0;
    for (const [name, a] of this.acts) {
      const target = this.want.get(name) ?? 0;
      let w = this.w.get(name) ?? 0;
      w += (target - w) * kt;
      if (w < 0.002 && target === 0) w = 0;
      this.w.set(name, w);
      a.enabled = w > 0;
      a.setEffectiveWeight(w);
      total += w;
      // locomotion: speed-synced playback
      const ls = LOCO_SPEED[name];
      if (ls) {
        const s = this.h.scale || 1;
        a.timeScale = clamp(this.speed / (ls * s), 0.35, 2.2) * (this.h._gaitScale || 1);
      } else if (name !== 'Death01') a.timeScale = this.h._animRate || 1;
    }
    // normalise if blending left a gap (keeps the pose from sagging toward rest)
    if (total > 0 && total < 0.999) for (const [name, a] of this.acts) { const w = this.w.get(name); if (w > 0) a.setEffectiveWeight(w / total); }
    this.mixer.update(dt);
  }
  /** weight of locomotion clips (0..1) */
  get moving() {
    let w = 0;
    for (const n of ['Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop']) w += this.w.get(n) || 0;
    return clamp(w, 0, 1);
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.h.inner); }
}
