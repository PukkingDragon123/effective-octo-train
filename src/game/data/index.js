// Narrative data barrel: `import { PASSENGERS, RULES, ... } from './data/index.js'`.
// Schema documentation: ./SCHEMA.md. Every export is plain data (plus a few tiny lookup helpers).
export * from './characters.js';
export * from './rules.js';
export * from './passengers.js';
export * from './encounters.js';
export * from './memories.js';
export * from './endings.js';
export * from './radio.js';
export * from './worldtext.js';
export * from './credits.js';
export {
  INTRO_GARAGE, TUTORIAL_STEPS, SEND_OFF, GARAGE_IDLE, RESTART_LINES, DEATH_HINTS, TIME_SKIP, RADIO_CAMEO, SHRINE_REVEAL, AH_KONG,
} from './ahkong.js';
export { P, Y, T, S, C } from './lines.js';
