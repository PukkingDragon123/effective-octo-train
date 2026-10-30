// Narrative data barrel: `import { PASSENGERS, RULES, ... } from './data/index.js'`.
// Schema documentation: ./SCHEMA.md. Every export is plain data, plus lookup helpers and the pure
// condition / reply / ending logic in ./logic.js (resolveLines, dialogueBlock, resolveEnding, trustOf...).
export * from './characters.js';
export * from './rules.js';
export * from './passengers.js';
export * from './encounters.js';
export * from './memories.js';
export * from './endings.js';
export * from './radio.js';
export * from './worldtext.js';
export * from './credits.js';
export * from './loop.js';
export * from './logic.js';
export {
  INTRO_BIKE, INTRO_GARAGE, TUTORIAL_STEPS, SEND_OFF, GARAGE_IDLE, RESTART_LINES, DEATH_HINTS, TIME_SKIP, RESTART_KEYS, REFUSE_RETURN,
  RADIO_CAMEO, SHRINE_REVEAL, AH_KONG,
} from './ahkong.js';
export { P, Y, T, S, C, O, SIL, tr } from './lines.js';
