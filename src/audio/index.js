// Audio: fully procedural WebAudio (contract: docs/ARCHITECTURE.md "audio").
// STUB IMPLEMENTATION — the audio agent replaces internals; signatures must stay.

const noopHandle = () => ({ stop() {}, setVolume() {}, setRate() {}, setParam() {}, setPosition() {} });

class AudioStub {
  constructor() {
    this.ready = false;
    this.ctx = null;
    this.engineSound = { setOn() {}, setRPM() {}, setLoad() {}, attach() {}, setGear() {} };
    this.bikeSound = { setOn() {}, setRPM() {}, setLoad() {}, attach() {} };
    this.ambience = { set() {} };
    this.music = { setMood() {}, mood: 'silence' };
    this.radio = { setOn() {}, next() {}, setStation() {}, setStatic() {}, attach() {}, on: false, station: 0, setVolume() {} };
    this.voice = {
      /** speak({ th, en, voice:{gender,age,pitch,rate,ghost,whisper}, object|position }) -> Promise */
      speak(line) { return new Promise((r) => setTimeout(r, Math.min(6000, 600 + (line.th || '').length * 70))); },
      stop() {},
      hasThaiVoice: false,
    };
  }
  /** Create/resume the AudioContext. Must be called from a user gesture (first click). Safe to call repeatedly. */
  init() { this.ready = true; }
  /** One-shot sound. opts { position: Vector3 | object: Object3D, volume=1, rate=1, detune=0, bus='sfx'|'ambience'|'voice'|'music'|'ui', delay=0 } */
  play(id, opts = {}) { return noopHandle(); }
  /** Looping sound with same opts. Returns { stop(fade), setVolume(v, rampSec), setRate(r), setParam(name, v), setPosition(v) } */
  loop(id, opts = {}) { return noopHandle(); }
  setBusVolume(bus, v) {}
  /** 0 = outdoors, 1 = sealed car cabin (low-pass + quieter outside sounds) */
  setMuffle(v) {}
  /** Duck everything except `except` bus (e.g. during dialogue). */
  duck(amount = 0.5, except = 'voice') {}
  update(dt) {}
}

export const audio = new AudioStub();
