// PASSENGERS: the nine rides of the night, in ride order (index = saves.data.rideIndex).
// Each ride lives in its own file under ./rides/ so writers can work on one at a time.
// Full schema: ./SCHEMA.md ("Passenger", "Beat", "Trigger", "Line").
//
// Quick reference:
// { id, order (1..9), hour (21..29; 24 = 00:00), pickup (LAYOUT.landmarks key),
//   characterId (CHARACTERS key), identity 'human'|'ghost', fork 'left'|'right',
//   seat 'rearLeft'|'rearRight'|'frontPassenger', destination {th,en},
//   clues { reflection 'normal'|'none'|'only'|'twisted'|'delayed', shadow, breathFog, weightKg,
//           meter 'normal'|'glitch'|'backward'|'oldDate', radioStatic 0..1, blinks, feetFloat,
//           payment {type, amountTHB, note{th,en}}, smell, extra[] },
//   specialRules [{ rule, at?, lookBack?, exception?, note }],
//   encounters [{ id (ENCOUNTERS key), at (ride progress 0..1), optional? }],
//   deathOnWrong 'giantHand'|'trueForm'|'roadFold'|'windowAttack'|'dragBack'|'home',
//   memoryHooks [memory ids], dialogue { hail, greet, destination, beats[], arriveCorrect,
//   arriveWrong, idle, onLookBack, onFaceGaze, onFaceGazeWarn?, loopVariants? }, finale? (Somchai only) }
//
// Thai-first replies: lines may carry `if` (Condition), reply options too. ALWAYS resolve a block with
// logic.dialogueBlock(ride, key, ctx) / logic.resolveLines(lines, ctx) before dialogue.play().
//
// Ride progress = distance driven since pickup / distance from the pickup's stopPos to the
// fork decision point (0 at pickup, 1 at the fork).
import { RIDE_SRI } from './rides/r1_sri.js';
import { RIDE_WOMAN_WHITE } from './rides/r2_womanWhite.js';
import { RIDE_PIAK } from './rides/r3_piak.js';
import { RIDE_BOY_M } from './rides/r4_boyM.js';
import { RIDE_NUAN } from './rides/r5_nuan.js';
import { RIDE_MONK } from './rides/r6_monk.js';
import { RIDE_SAMAN } from './rides/r7_saman.js';
import { RIDE_BUA } from './rides/r8_bua.js';
import { RIDE_SOMCHAI } from './rides/r9_somchai.js';
import { RIDE_CHUEN } from './rides/n1_chuen.js';
import { RIDE_KAEW } from './rides/n2_kaew.js';
import { RIDE_SOLDIER } from './rides/n3_soldier.js';
import { RIDE_SOMBAT } from './rides/n4_sombat.js';
import { RIDE_BRIDE } from './rides/n5_bride.js';

// The night in three acts (about 2 hours on a first playthrough; garage interludes in data/interludes.js):
//   I  dread   21:00–00:00  Sri · Chuen · Woman in White · Nurse Kaew                 (+ intro, garage, tutorial)
//   II surreal 00:00–03:00  Piak · Little M · Private Den · Khun Nuan · Luang Phi
//   III dawn   03:00–06:00  Saman · Mae Sombat · Grandma Bua · the Bride · Somchai
export const PASSENGERS = [RIDE_SRI, RIDE_CHUEN, RIDE_WOMAN_WHITE, RIDE_KAEW, RIDE_PIAK, RIDE_BOY_M, RIDE_SOLDIER, RIDE_NUAN, RIDE_MONK, RIDE_SAMAN, RIDE_SOMBAT, RIDE_BUA, RIDE_BRIDE, RIDE_SOMCHAI];
// rides last 6–7 minutes each: long enough for the talk, the clues and a calm stretch between scares
for (const p of PASSENGERS) {
  p.pacing = { ...(p.pacing || {}) };
  if (p.id !== 'somchai') p.pacing.minSeconds = Math.max(p.pacing.minSeconds || 0, 340);
  if (!p.pacing.stretch || p.pacing.stretch === 'none') p.pacing.stretch = 'fog';
}

export const PASSENGER_BY_ID = Object.fromEntries(PASSENGERS.map((p) => [p.id, p]));
export const getPassenger = (id) => PASSENGER_BY_ID[id] || null;

/** Event names a beat may listen to with { type:'event', event }. Also 'encounter:<id>' and 'encounterEnd:<id>'. */
export const DIALOGUE_EVENTS = [
  'radioOn', 'radioOff', 'radioTune', 'radioIgnored', // r6 grace expired without turning it off
  'lookBack', 'faceGaze', 'faceGazeWarn',
  'cabinLightOn', 'cabinLightOff', 'cabinLightDies',
  'windowOpen', 'windowClose', 'wipersOn',
  'stopped', 'speeding', 'collision',
  'meterOn', 'meterOffTooLong', 'meterGlitch',
  'meter444', // r11: the meter rolled to 444 (before the stop and the count)
  'honkShrine', 'amulet',
  'knock1', 'knock3',
  'breathPassed', 'nameCallAnswered', 'nameCallIgnored',
  'yaiSpeed', 'elephants',
  'forkApproach', 'gateReached',
];

/** Thresholds the gameplay layer uses to fire the generic events above. */
export const DIALOGUE_EVENT_PARAMS = {
  speedingKmh: 85, // 'speeding' fires once above this
  stoppedSeconds: 3, // 'stopped' after this long under 2 km/h mid-ride
  meterOffTooLongSeconds: 20,
  forkApproachProgress: 0.9, // 'forkApproach' fires at this ride progress
  idleGapSeconds: [28, 55], // random gap between idle lines when nothing else is playing
  lineGapSeconds: 0.35, // default pause between consecutive lines
};

/** Wrong-fork death cinematics (values of deathOnWrong). Every id has a card in WORLD_TEXT.deathCards. */
export const WRONG_FORK_DEATHS = ['giantHand', 'trueForm', 'roadFold', 'windowAttack', 'dragBack', 'home'];
