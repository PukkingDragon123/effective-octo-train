// Encounters defined by the director itself (not in src/game/data/encounters.js), same shape as
// ENCOUNTERS entries. `once: true` = at most once per night (the director's free-drive pool).
const V = (th, en, x = {}) => ({ who: 'voice', th, en, tone: 'ghost', ...x });

export const LOCAL_DEFS = {
  faceRat: {
    id: 'faceRat', nameTH: 'หนูผีหน้าคน', nameEN: 'The Face Rat', kind: 'scare',
    hours: [21, 26], where: ['freeDrive', 'ride:anyGhost'], gazeMode: 'notLooking', once: true,
    cooldownSec: 1800, chance: 0.07, durationSec: [6, 10],
    whispers: [V('แฮ่ก... แฮ่ก...', 'Hhh... hhh...', { tone: 'whisper' })],
    staging: 'A bandicoot rat with an uncanny man\'s face hides in the passenger footwell (or behind the passenger headrest when someone sits in front). Scratching, a wet sniff. When the player looks toward the noise (or after a while, from the edge of the view) it leaps at the camera screeching; its face, fur and whiskers fill the view for 0.4 s; hand-held jolt; then it scrambles over the dash and out of an open window, or is gone. At most once per night.',
  },
};
