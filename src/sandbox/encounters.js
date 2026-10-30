// Encounters sandbox: a taxi on a test road at night with a minimal gameplay context; start any
// encounter (or a death cinematic) around it.
//   ?id=<encounter id> (default yaiSpeed; see g.director.list())   &death=<type> (play a death instead)
//   &hour=23 &speed=45 (autopilot km/h; 0 = parked) &ride=<passengerId> (fake ride context)
//   &delay=1.5 (seconds before start) &yaw=0 &pitch=-0.05 (driver look, radians) &ambient=1 (free-drive scheduler)
//   &rain=0.3 &fog=0.25 &gore=full|reduced
import * as THREE from 'three';
import { postfx, sky, lightPool, particles } from '../render/index.js';
import { loadCharacterAssets, createHumanoid } from '../characters/index.js';
import { Taxi, loadVehicleAssets } from '../vehicle/index.js';
import { audio } from '../audio/index.js';
import { ui } from '../ui/index.js';
import { buildTestSet, addStreetlight, applyEnv } from './vehicle-common.js';
import { g } from '../game/context.js';
import { Dialogue } from '../game/Dialogue.js';
import { CHARACTERS } from '../game/data/characters.js';
import { PASSENGER_BY_ID } from '../game/data/passengers.js';
import { installDirector } from '../game/encounters/Director.js';

function loadData() {
  const mods = import.meta.glob('../game/data/*.js', { eager: true });
  const data = {};
  for (const [path, mod] of Object.entries(mods)) data[path.replace('../game/data/', '').replace('.js', '')] = mod;
  return data;
}

export default async function (ctx) {
  const { engine, cameraRig, params, settings } = ctx;
  await loadCharacterAssets();
  if (params.get('procedural') !== '1') await loadVehicleAssets();
  if (params.get('gore')) settings.set('gore', params.get('gore'));
  const hour = Number(params.get('hour') ?? 23);
  applyEnv(params, { hour, rain: 0.3, fog: 0.25 });
  const { world, road } = buildTestSet(engine.scene);
  for (let i = 0; i < 6; i++) addStreetlight(engine.scene, road.sample(60 + i * 55).pos.clone().add(new THREE.Vector3(i % 2 ? 4.8 : -4.8, 0, 0)), i % 2 ? -1 : 1, 28);
  ui.init(document.getElementById('ui'));
  // minimal gameplay context
  Object.assign(g, ctx, { postfx, sky, lightPool, particles, audio, ui, world });
  g.data = loadData();
  g.clock = { hour, phase: null, set(h) { this.hour = h; sky.setHour(h); } };
  g.save = { flags: {}, loops: 0, deaths: [], memories: [] };
  g.dialogue = new Dialogue();
  g.dialogue.setSpeaker('player', { nameTH: 'ต้น', nameEN: 'Ton', voice: { gender: 'm', age: 27 } });
  g.dialogue.setSpeaker('voice', { nameTH: '', nameEN: '', voice: { gender: 'f', age: 30, ghost: 1, whisper: true } });
  g.fsm = { is: (s) => s === 'shift' };
  const taxi = new Taxi({ world });
  engine.scene.add(taxi.root);
  g.taxi = taxi;
  const speed = Number(params.get('speed') ?? 45);
  taxi.state.headlights = 'low';
  taxi.state.keyInserted = true;
  taxi.state.engineOn = true;
  if (speed > 0) taxi.autopilot({ splineId: 'main', speedKmh: speed, lane: -1.55, place: true, s: 20 });
  else taxi.setPose(road.sample(20).pos.clone().add(new THREE.Vector3(-1.55, 0, 0)), 0);
  cameraRig.attach(taxi.anchors.driverEye, taxi.bodyInner, { yaw: Number(params.get('yaw') ?? 0), pitch: Number(params.get('pitch') ?? -0.05) });
  // optional fake ride (the passenger seated, visible / reflection-less per its clues)
  const rideId = params.get('ride');
  if (rideId && PASSENGER_BY_ID?.[rideId]) {
    const data = PASSENGER_BY_ID[rideId];
    const h = createHumanoid({ ...(CHARACTERS[data.characterId]?.appearance || {}), id: data.characterId });
    const seat = taxi.seats[data.seat] || taxi.seats.rearLeft;
    h.sitAt(seat, { pose: 'sitCar' });
    g.dialogue.setSpeaker('passenger', { nameTH: CHARACTERS[data.characterId]?.nameTH, nameEN: CHARACTERS[data.characterId]?.nameEN, voice: CHARACTERS[data.characterId]?.voice, humanoid: h });
    g.ride = { data, passenger: h, seat: data.seat, phase: 'riding', progress: 0.5, emit: (e) => console.log('[ride event]', e) };
  }
  const director = installDirector();
  director.ambient = params.get('ambient') === '1';
  director.forceAmbient = director.ambient;
  window.__director = director;
  const id = params.get('id') || 'yaiSpeed';
  const death = params.get('death');
  const delay = Number(params.get('delay') ?? 1.5);
  let t = 0, started = false;
  const off = engine.onUpdate((dt) => {
    t += dt;
    if (started || t < delay) return;
    started = true;
    off();
    if (death) director.playDeath(death, { passengerId: rideId || undefined }).then(() => g.cine?.fade?.(0, 1) ?? (postfx.params.fade = 0));
    else if (!director.ambient) {
      const h = director.start(id, { ride: g.ride || undefined, passenger: g.ride?.passenger, scheduled: true });
      window.__encounter = h;
      h.done.then((r) => console.log('[encounter done]', JSON.stringify(r)));
    }
  }, 0);
  const warm = Number(params.get('warm') ?? 20);
  for (let i = 0; i < warm; i++) engine.step(1 / 30);
}
