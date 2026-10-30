// Audio: WebAudio engine (contract: docs/ARCHITECTURE.md "audio").
//
// Two sources of sound, same API:
//  * RECORDED SAMPLES (preferred): licensed CC0/CC-BY recordings in public/assets/audio, described by
//    assets/audio/manifest.json ({ "<id>": { files, loop, gain, category, credits, loopSamples, replaces } }).
//    The manifest is fetched at start-up; files are fetched + decoded lazily on first use (likely-first ones
//    are prefetched after init), loudness-matched to the synth mix, and a random variant with a small pitch
//    variation is played. Seamless recorded loops serve loop(); one-shots of loop-only recordings play a slice.
//    Ambience beds (amb_* keys) are layered and crossfaded by ambience.set(); the engine layers a recorded
//    crank/catch, idle, gravel tyres and cabin road noise over its model; the radio uses recorded static, ching
//    and khaen/khim station idents; the music repitches recorded ranat strikes and ching/chap. See ./Samples.js.
//  * SYNTHESIS (fallback, and every id without a recording): pure-JS generators in ./Synth (noise,
//    oscillators, FM, filters, modal / Karplus-Strong / formant synthesis, granular smear), rendered in a
//    small pool of Web Workers and cached as AudioBuffers.
// A missing manifest, a 404 or a decode failure is harmless: that sound stays synthesized.
//
//   audio.init()                       call from the first user gesture (also auto-hooked); safe to repeat
//   audio.play(id, opts) -> handle     one-shot. opts { position: Vector3 | object: Object3D, volume=1, rate=1,
//                                      detune=0, bus='sfx'|'ambience'|'voice'|'music'|'ui', delay=0,
//                                      variant, count, interval (repeat N times), muffle (bool: through the
//                                      cabin low-pass), reverb (send 0..1), pan (-1..1 non-spatial), offset3
//                                      [x,y,z] local offset from object, refDistance, rolloff, mustPlay }
//   audio.loop(id, opts) -> handle     looping version (seamless buffer loop or retriggered hits).
//   handle: { stop(fade), setVolume(v, rampSec), setRate(r), setParam(name, v), setPosition(v3|obj), ended, duration }
//   audio.setBusVolume(bus, v)         gameplay mix multiplier per bus (on top of the player's volume settings)
//   audio.setMuffle(v)                 0 outdoors .. 1 sealed car cabin (low-pass + quieter outside world)
//   audio.duck(amount=0.5, except='voice')   duck(0) releases
//   audio.setEnvironment(kind)         outdoor reverb: 'forest' | 'garage' | 'shrine' | 'hall'
//   audio.playBuffer(audioBuffer, opts)
//   audio.samples                      SampleBank: .info(), .credits() (attribution list for the credits screen),
//                                      .covers(id, 'play'|'loop'), .enabled · audio.setSamplesEnabled(bool)
//                                      play/loop opts: synth:true (force synthesis), sample:'<key>', sampleVariant
//   audio.engineSound / audio.bikeSound  { setOn(on,{instant,stall,variant,crank}), setRPM, setLoad, setGear, setSpeed(kmh),
//                                      setSurface(kind), attach(obj, bodyObj), crankFail() (starter cranks, will not catch) }
//   audio.ambience.set({hour, rain, wind, insideCar, windowsOpen, nearWater, nearLights, forestDensity, dread, enabled, autoMuffle})
//   audio.music.setMood('silence'|'menu'|'dread'|'surreal'|'calm'|'nostalgic'|'dawn'|'ending'|'tension', {fade})
//   audio.radio { setOn, next, setStation(1..4), setStatic(0..1), attach(obj), setVolume, setHour, on, station, song }
//   audio.voice.speak({th, en, voice:{gender:'m'|'f'|'child', age, pitch, rate, ghost:0..1, whisper}, object|position,
//                      tone:'ghost'|'whisper'|'shout'|'sing'|'phone'|'radio', fx:'phone'|'radio', outside, volume}) -> Promise
//                                      (resolves when the words end). OS Thai TTS when available, else formant-synthesised
//                                      Thai; every line runs through the voice rack (./VoiceFX.js): reverb, proximity /
//                                      phone / radio tone, and for ghosts the octave-down double, the delayed whisper
//                                      behind your head, the reverse swell, flutter, mismatched breaths, sub hum.
//   audio.voice.stop() · .hasThaiVoice · .prepare(line) (pre-render the next line) · .info() (OS voices, path used)
//
// SOUND IDS (keep in sync with ./Synth/registry.js — `SOUND_IDS` exports the live list):
//  car/cabin   door_open door_close key_insert key_turn ignition engine_start engine_stall handbrake(variant 0 pull,
//              1 release) gear_shift indicator_tick(variant 0 tick, 1 tock; loop = flasher) wiper(loop = sweeping)
//              window_crank radio_click radio_tune meter_beep horn(loopable) glovebox switch_click seat_creak
//              collision_thud knock knock_trunk thump_roof scratch_glass rain_roof_start motorbike_pass
//  foley       footstep_asphalt footstep_gravel footstep_grass footstep_wood footstep_concrete footstep_puddle
//              coins paper_rustle paper_unfold lighter cigarette_inhale bush_scrape(loopable) branch_crack splash
//              bell_temple wind_chime alms_bowl garland_jingle
//  animals     dog_bark dog_howl dog_whine gecko owl koel rooster birds_dawn(stereo, loopable) elephant_trumpet
//              elephant_rumble frog_croak cicada_burst mosquito_buzz(stereo, near ear)
//  electric    electric_buzz transformer_hum fluorescent_flicker (all loopable) spark
//  horror      breath_neck(loopable) whisper heartbeat(loop = beating; setRate = bpm/70) sting_low sting_high
//              sting_reveal scare_hit giant_hand_rumble(loopable) bone_crack neck_snap scream_far child_laugh_far
//              giggle amulet_hum(loopable) monk_chant(loopable)
//  ui          ui_hover ui_select ui_back chapter_chime
//
// SAMPLE-ONLY IDS (playable with play()/loop() when the manifest provides them; no synth fallback):
//              dog_bark_far night_bird knock_window_seq key_remove engine_crank_fail engine_off engine_idle(loop)
//              engine_rev car_interior_cruise(loop) handbrake_pull handbrake_release indicator_loop(loop)
//              tyres_gravel(loop) tyres_gravel_roll bike_idle(loop) bike_ride_away gong wind_chime_loop(loop)
//              fluorescent_hum(loop) electric_arc(loop) breath scream_close rumble_rise drone_low(loop) rumble_sub
//              radio_static(loop) ranat_note khim_phrase khaen_phrase ching
// Served by recordings with the current manifest: 59 of the 80 ids above (engine_stall = engine_off pitched down,
// handbrake 0/1 = handbrake_pull/_release, wiper/heartbeat one-shots = one beat sliced from the loop recording).
// Still synthesized: key_turn radio_click radio_tune meter_beep switch_click seat_creak collision_thud
// rain_roof_start cigarette_inhale garland_jingle sting_low sting_high sting_reveal scare_hit neck_snap
// child_laugh_far amulet_hum ui_hover ui_select ui_back chapter_chime, the held horn / bush_scrape /
// fluorescent_flicker loops, and the music, radio programmes, voices and the engine model themselves.
import { engine } from '../core/Engine.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';
import { AudioCore, BUS_NAMES, noopHandle } from './Engine.js';
import { SOUND_IDS, SOUNDS } from './Synth/registry.js';
import { EngineSound } from './EngineSound.js';
import { Ambience } from './Ambience.js';
import { Music, MOODS } from './Music.js';
import { Radio, STATION_NAMES } from './Radio.js';
import { VoiceSystem } from './Voice.js';
import { SampleBank } from './Samples.js';

export { SOUND_IDS, MOODS, STATION_NAMES, SampleBank };

const SETTING_FOR_BUS = { music: 'volMusic', sfx: 'volSfx', ambience: 'volAmbience', voice: 'volVoice', ui: 'volSfx', radio: 'volSfx' };
const taper = (v) => Math.max(0, Math.min(1.5, v ?? 1)) ** 2;

// Sounds warmed in the background right after init (most likely needed first).
// Recordings fetched + decoded right after init (the first minutes: garage, ignition, the first drive).
const PREFETCH_FIRST = ['door_open', 'door_close', 'key_insert', 'ignition', 'engine_start', 'engine_stall', 'handbrake', 'gear_shift', 'indicator_tick', 'glovebox', 'window_crank', 'footstep_concrete', 'footstep_asphalt', 'footstep_gravel', 'paper_unfold', 'paper_rustle', 'coins', 'knock', 'whisper', 'wiper'];
const PREFETCH_LATER = ['footstep_grass', 'footstep_wood', 'footstep_puddle', 'knock_trunk', 'thump_roof', 'scratch_glass', 'branch_crack', 'bush_scrape', 'gecko', 'dog_bark', 'dog_howl', 'owl', 'frog_croak', 'horn', 'lighter', 'splash', 'bone_crack', 'breath', 'spark', 'fluorescent_flicker'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const WARM_FIRST = ['ui_hover', 'ui_select', 'ui_back', 'chapter_chime', 'door_open', 'door_close', 'key_insert', 'key_turn', 'ignition', 'engine_start', 'switch_click', 'handbrake', 'gear_shift', 'indicator_tick', 'seat_creak', 'radio_click', 'radio_tune', 'footstep_asphalt', 'footstep_gravel', 'footstep_concrete', 'knock', 'knock_trunk', 'whisper', 'scare_hit', 'sting_low', 'heartbeat'];

/** Deferred loop handle: records calls until the AudioContext exists. */
class PendingLoop {
  constructor(sys, id, opts) {
    this.sys = sys;
    this.id = id;
    this.opts = { ...opts };
    this.real = null;
    this.dead = false;
    this.ended = new Promise((r) => (this._end = r));
    this.duration = 0;
  }
  _realize() {
    if (this.dead) return;
    this.real = this.sys.core.loop(this.id, this.opts);
    this.real.ended.then(this._end);
  }
  stop(f) {
    this.dead = true;
    if (this.real) this.real.stop(f);
    else this._end();
  }
  setVolume(v, r) {
    this.opts.volume = v;
    this.real?.setVolume(v, r);
  }
  setRate(r) {
    this.opts.rate = r;
    this.real?.setRate(r);
  }
  setParam(n, v) {
    (this.opts.params ||= {})[n] = v;
    this.real?.setParam(n, v);
  }
  setPosition(p) {
    if (p?.isObject3D) this.opts.object = p;
    else this.opts.position = p;
    this.real?.setPosition(p);
  }
}

export class AudioSystem {
  /** opts.offline: build without global hooks (OfflineAudioContext tests). */
  constructor(opts = {}) {
    this.ready = false;
    this.ctx = null;
    this.core = null;
    this.offline = !!opts.offline;
    this.mix = {}; // gameplay bus multipliers
    this.engineSound = new EngineSound(this, 'car');
    this.bikeSound = new EngineSound(this, 'bike');
    this.ambience = new Ambience(this);
    this.music = new Music(this);
    this.radio = new Radio(this);
    this.voice = new VoiceSystem(this);
    this.samples = new SampleBank();
    this._pending = [];
    this._muffle = 0;
    this._duck = null;
    this._env = 'forest';
    this.sounds = SOUND_IDS;
    if (!this.offline) {
      // the manifest is tiny: fetch it now so recordings can serve the very first sounds
      if (typeof window !== 'undefined') this.samples.load();
      settings.onChange(() => this._applySettings());
      bus.on('game:hour', (e) => this.ambience.set({ hour: e?.hour ?? e }));
      engine.onUpdate((dt) => this.update(dt), 60, { always: true });
      if (typeof window !== 'undefined') {
        const gesture = () => this.init();
        for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, gesture, { capture: true, passive: true });
      }
    }
  }

  /** Create/resume the AudioContext. Must be called from a user gesture (first click). Safe to call repeatedly. */
  init() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume?.();
        return this;
      }
      const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
      if (!AC) return this;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.attachContext(ctx);
      if (ctx.state === 'suspended') ctx.resume?.();
    } catch (err) {
      console.warn('[audio] init failed', err);
    }
    return this;
  }

  /** Bind to any BaseAudioContext (AudioContext or OfflineAudioContext). opts: {sync} */
  attachContext(ctx, opts = {}) {
    this.ctx = ctx;
    this.samples.attach(ctx);
    this.core = new AudioCore(ctx, { samples: this.samples, ...opts });
    this._applySettings();
    this.core.setMuffle(this._muffle, 0.01);
    this.core.setEnvironment(this._env, 0.01);
    this.engineSound._attachCore(this.core);
    this.bikeSound._attachCore(this.core);
    this.ambience._attachCore(this.core);
    this.music._attachCore(this.core);
    this.radio._attachCore(this.core);
    this.voice._attachCore(this.core);
    if (this._duck) this.core.duck(...this._duck);
    for (const p of this._pending) p._realize();
    this._pending = [];
    this.ready = true;
    if (!this.offline && !this.core.sync) {
      // recordings first (manifest wait is bounded), then synthesize only what they do not cover
      const core = this.core;
      Promise.race([this.samples.ready, wait(2500)])
        .then(() => this.samples.prefetch(PREFETCH_FIRST, 1))
        .then(() => core.warm(WARM_FIRST, { variants: 2 }))
        .then(() => this.ambience.warm())
        .then(() => this.samples.prefetch(PREFETCH_LATER, 2, { maxFiles: 2 }))
        .then(() => core.warm(SOUND_IDS, { variants: 1, loops: true }))
        .catch((err) => console.warn('[audio] warm-up', err));
    }
    bus.emit('audio:ready', { sampleRate: ctx.sampleRate });
    return this;
  }

  _applySettings() {
    if (!this.core) return;
    this.core.setBusVolume('master', taper(settings.get('volMaster')) * (this.mix.master ?? 1));
    for (const b of BUS_NAMES) this.core.setBusVolume(b, taper(settings.get(SETTING_FOR_BUS[b])) * (this.mix[b] ?? 1));
  }

  /** One-shot sound. opts { position: Vector3 | object: Object3D, volume=1, rate=1, detune=0, bus='sfx'|'ambience'|'voice'|'music'|'ui', delay=0 } */
  play(id, opts = {}) {
    if (!this.core) return noopHandle();
    try {
      return this.core.play(id, opts);
    } catch (err) {
      console.warn('[audio] play failed', id, err);
      return noopHandle();
    }
  }
  /** Looping sound with same opts. Returns { stop(fade), setVolume(v, rampSec), setRate(r), setParam(name, v), setPosition(v) } */
  loop(id, opts = {}) {
    if (!this.core) {
      if (!SOUNDS[id] && (this.samples.state === 'ready' || this.samples.state === 'failed') && !this.samples.knows(id)) return noopHandle();
      const p = new PendingLoop(this, id, opts);
      this._pending.push(p);
      return p;
    }
    try {
      return this.core.loop(id, opts);
    } catch (err) {
      console.warn('[audio] loop failed', id, err);
      return noopHandle();
    }
  }
  /** Play an AudioBuffer you made yourself (same opts as play). */
  playBuffer(buffer, opts = {}) {
    if (!this.core || !buffer) return noopHandle();
    return this.core.playBuffer(buffer, opts);
  }
  setBusVolume(name, v) {
    this.mix[name] = v;
    this._applySettings();
  }
  /** 0 = outdoors, 1 = sealed car cabin (low-pass + quieter outside sounds) */
  setMuffle(v) {
    this._muffle = Math.max(0, Math.min(1, v || 0));
    this.core?.setMuffle(this._muffle);
  }
  get muffle() {
    return this._muffle;
  }
  /** Duck everything except `except` bus (e.g. during dialogue). duck(0) releases. */
  duck(amount = 0.5, except = 'voice') {
    this._duck = [amount, except];
    this.core?.duck(amount, except);
  }
  /** Prefer recorded samples (default) or force synthesis everywhere (A/B, low memory). */
  setSamplesEnabled(on) {
    this.samples.enabled = !!on;
  }
  setEnvironment(kind) {
    this._env = kind;
    this.core?.setEnvironment(kind);
  }
  stopAll(fade = 0.3) {
    this.core?.stopAll(fade);
    this.voice.fx?.stopAll(fade);
  }

  update(dt) {
    if (!this.core) return;
    try {
      this.core.update(dt, this.offline ? null : engine.camera);
      this.engineSound.update(dt);
      this.bikeSound.update(dt);
      this.ambience.update(dt);
      this.music.update(dt);
      this.radio.update(dt);
      this.voice.update(dt);
    } catch (err) {
      if (!this._errOnce) {
        this._errOnce = true;
        console.error('[audio] update failed', err);
      }
    }
  }
}

export const audio = new AudioSystem();
