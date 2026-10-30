// Encounters defined by the director itself (not in src/game/data/encounters.js), same shape as
// ENCOUNTERS entries. `once: true` = at most once per night (the director's free-drive pool).
const V = (th, en, x = {}) => ({ who: 'voice', th, en, tone: 'ghost', ...x });

export const LOCAL_DEFS = {
  faceRat: {
    id: 'faceRat', nameTH: 'หนูผีหน้าคน', nameEN: 'The Face Rat', kind: 'scare',
    hours: [21, 26], where: ['freeDrive', 'ride:anyGhost'], gazeMode: 'notLooking', once: true,
    cooldownSec: 1800, chance: 0.07, durationSec: [6, 10],
    whispers: [V('แฮ่ก... แฮ่ก...', 'Hhh... hhh...', { tone: 'whisper' })],
    staging: 'A bandicoot rat with an uncanny man\'s face hides in the passenger footwell (or behind the passenger headrest when someone sits in front). Scratching, a wet sniff. When the player looks toward the noise (or after a while, from the edge of the view) it leaps at the camera screeching and clamps onto the face: QTE, one timed press to swat it off (slow motion). Swatted: flung against the passenger glass, gone. Missed: death faceRat. At most once per night.',
  },
  doorRattle: {
    id: 'doorRattle', nameTH: 'มือจับประตู', nameEN: 'The Door Handles', kind: 'scare',
    hours: [21, 27], where: ['freeDrive', 'ride:anyGhost'], gazeMode: 'any', once: true,
    cooldownSec: 1800, chance: 0.08, durationSec: [8, 12],
    staging: 'Car slow or stopped. The rear door handles clack one side then the other, the car rocks; a pale handprint blooms on the driver\'s glass; then the driver\'s handle is wrenched harder and harder. QTE: hold the lock (fills while held, drains when released; the door cracks open when let go). Held: the rattling stops dead, nails drag away along the door. Lost: the door is torn open (death doorRattle). At most once per night.',
  },
};
