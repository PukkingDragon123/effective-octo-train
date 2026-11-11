// Encounters defined by the director itself (not in src/game/data/encounters.js), same shape as
// ENCOUNTERS entries. `once: true` = at most once per night (the director's free-drive pool).
import { TAXI_TEXT } from '../data/worldtext.js';

const V = (th, en, x = {}) => ({ who: 'voice', th, en, tone: 'ghost', ...x });
const W = (th, en, x = {}) => ({ who: 'voice', th, en, tone: 'whisper', ...x });
const P = (th, en, x = {}) => ({ who: 'passenger', th, en, ...x });
const R = (th, en, x = {}) => ({ who: 'radio', th, en, tone: 'ghost', ...x });
const C = (who, th, en, x = {}) => ({ who, th, en, ...x });
const PLATE = TAXI_TEXT?.plate || { th: 'ทข ๑๔๔๑ วังเวง', en: 'TK 1441, Wang Weng' };

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

  // ------------------------------------------------------------------ the rules, tested (new set)
  lagReflection: {
    id: 'lagReflection', nameTH: 'เงาช้ากว่าตัว', nameEN: 'The Late Reflection', kind: 'rule', ruleId: 'r4', tiesTo: 'r4',
    hours: [21, 28], where: ['ride:anyGhost'], gazeMode: 'mirrorOnly', once: true, cooldownSec: 1500, chance: 0.22, durationSec: [16, 22],
    lines: [
      P('ฉันมีเงาแล้วนะ... เห็นไหม', 'I have a reflection now... see?', { tone: 'whisper' }),
      P('งั้นก็หันมามองหน้าฉันตรง ๆ สิ', 'Then turn and look me in the face.', { tone: 'whisper', emotion: 'creepy', set: { lure: 'r4' } }),
    ],
    staging: 'A no-reflection passenger suddenly has one, a second late, copying her late; then it stops copying, turns its head and smiles in the mirror while she looks away. She asks to be looked at (lure r4). A reflection does not make her alive: B\'s face-gaze rule decides (trueForm).',
  },
  funeralProcession: {
    id: 'funeralProcession', nameTH: 'ขบวนศพข้ามถนน', nameEN: 'The Funeral Procession', kind: 'rule', ruleId: 'r12', tiesTo: 'r12', exception: true,
    hours: [[21, 24], [26, 28.5]], where: ['freeDrive'], gazeMode: 'any', once: true, cooldownSec: 2400, chance: 0.12, durationSec: [40, 60],
    lines: [W('จอดก่อนลูก... ดับเครื่องด้วย', 'Stop, child... and switch the engine off.')],
    staging: 'r12 says drive through a figure STANDING in the road; a procession WALKS. Monk with the white thread, four bearers with a gilded coffin, mourners. Stop before them and switch the engine off (hold to turn the key) until the last has crossed. Drive into them, move off, or keep the engine on when the coffin crosses your lane: every face turns to you (death procession).',
  },
  bootChild: {
    id: 'bootChild', nameTH: 'เสียงเด็กในท้ายรถ', nameEN: 'The Child in the Boot', kind: 'rule', ruleId: 'r5', tiesTo: 'r5',
    hours: [21, 26], where: ['freeDrive'], gazeMode: 'any', once: true, cooldownSec: 1800, chance: 0.12, durationSec: [22, 30],
    lines: [
      C('bootChild', 'พี่ครับ...', 'Mister...', { tone: 'whisper' }),
      C('bootChild', 'ในนี้มืดมากเลยครับ', "It's so dark in here."),
      C('bootChild', 'เปิดให้ผมหน่อยได้ไหม หายใจไม่ออก', "Can you let me out? I can't breathe."),
      C('bootChild', 'จอดแป๊บเดียวก็ได้ครับ', 'Just stop for a second.', { tone: 'whisper' }),
    ],
    choice: {
      id: 'bootChild',
      options: [{ key: 'open', th: 'เดี๋ยวพี่เปิดให้', en: "I'll let you out." }, { key: 'no', th: 'ไม่มีใครอยู่ในนั้น', en: "There's nobody in there." }, { key: 'silent', th: '…', en: '(say nothing)' }],
      timeout: 6, defaultKey: 'silent',
    },
    outcomes: {
      open: { lines: [V('ขอบใจ...', 'Thank you...', { tone: 'ghost' })], result: 'scare:bootLid' },
      no: { lines: [C('bootChild', '...', '...', { tone: 'whisper' })], result: 'safe' },
      silent: { lines: [], result: 'safe' },
      opened: { lines: [V('ออกมาแล้ว', "I'm out.")], result: 'death:trunk' },
      stopped: { lines: [], result: 'death:trunk' },
      dragged: { lines: [], result: 'death:trunk' },
    },
    staging: 'Small knocks and a child\'s voice from the boot. Rule 5: whatever knocks from the trunk, never stop. Promise to open it and the lid unlatches by itself, something heavy drags the car: keep your foot down (QTE). Then three hard knocks arm r5 (B: stopping = death trunk).',
  },
  plateRadio: {
    id: 'plateRadio', nameTH: 'วิทยุอ่านทะเบียนรถ', nameEN: 'The Radio Reads Your Plate', kind: 'rule', ruleId: 'r15', tiesTo: 'r15',
    hours: [23, 28.5], where: ['freeDrive'], gazeMode: 'any', once: true, cooldownSec: 2400, chance: 0.12, durationSec: [14, 20],
    lines: [
      R('ประกาศ... ประกาศจากศูนย์วิทยุ', 'Announcement... from the radio centre.'),
      R('แท็กซี่สีเขียวเหลือง ทะเบียน ' + PLATE.th, 'A green-and-yellow taxi, plate ' + PLATE.en + '.'),
      R('ประสบอุบัติเหตุที่โค้งร้อยศพ คืนนี้ ตีสี่สี่สิบสี่', 'Crashed at the Hundred Corpses Curve tonight, at 4:44 a.m.'),
      R('คนขับเสียชีวิตคาที่... ชื่อต้น', 'The driver died at the scene... his name was Ton.'),
    ],
    staging: 'The radio clicks on and tunes itself through static to a flat announcer reading this taxi\'s plate, tonight\'s crash at 04:44, and your name. Rule 15: retune at once, never switch it off (B arms r15 on the name).',
  },
  kmPostLoop: {
    id: 'kmPostLoop', nameTH: 'หลัก กม. เดิม', nameEN: 'The Same KM Post', kind: 'rule', ruleId: 'r1', tiesTo: 'r1',
    hours: [22, 28.5], where: ['freeDrive'], gazeMode: 'any', once: true, cooldownSec: 2400, chance: 0.1, durationSec: [90, 120],
    lines: [W('ขอบใจที่จอดนะ', 'Thank you for stopping.')],
    whispers: [W('รอด้วย...', 'Wait for me...')],
    staging: 'The same KM 13 post, the same white cloth, the same gecko call, three times in a row. The third time someone stands by it, hailing. Rule 1: pick up everyone who hails. Stop for her and the loop opens (the next post reads KM 14). Drive past and it comes round again with two of them and the cloth soaked red; drive past again and the road folds (death roadFold).',
  },
  bootWoman: {
    id: 'bootWoman', nameTH: 'ผู้หญิงบนฝาท้าย', nameEN: 'The Woman on the Boot', kind: 'rule', ruleId: 'r3', tiesTo: 'r3',
    hours: [22, 27], where: ['freeDrive', 'ride:anyGhost'], gazeMode: 'mirrorOnly', once: true, cooldownSec: 1800, chance: 0.12, durationSec: [14, 20],
    lines: [W('ต้น...', 'Ton...'), W('หันมามองฉันหน่อย', 'Turn around and look at me.')],
    staging: 'Only in the mirrors: a woman sits on the boot lid with her back to the car, wringing out her long wet hair. She turns, leans to the rear glass, a hand flat on it, and asks you to turn around. Rule 3: never look back (B arms r3, death lookBack). Direct view: nothing there.',
  },
  rearSlap: {
    id: 'rearSlap', nameTH: 'มือตบกระจกหลัง', nameEN: 'Hands on the Rear Window', kind: 'rule', ruleId: 'r14', tiesTo: 'r14',
    hours: [24, 27.5], where: ['freeDrive', 'ride:anyGhost'], gazeMode: 'any', once: true, cooldownSec: 1800, chance: 0.12, durationSec: [12, 18],
    lines: [W('ฝนตกหนักเหลือเกิน... ให้ขึ้นไปด้วยคน', "It's pouring... let me in."), W('ลดกระจกหน่อย หนาว', "Wind the window down. I'm cold.")],
    staging: 'Wet hands slap the rear window, more and more of them, prints running in the rain; then the side windows; then the driver\'s window starts winding itself down. Rule 14: after midnight never open a window for anyone. Crank it back up (QTE mash) or the arm comes in (death windowArm).',
  },
  krathongFlood: {
    id: 'krathongFlood', nameTH: 'กระทงบนน้ำท่วม', nameEN: 'Krathong on the Flood', kind: 'rule', ruleId: 'r10', tiesTo: 'r10',
    hours: [26, 29], where: ['freeDrive'], gazeMode: 'any', once: true, cooldownSec: 2400, chance: 0.15, durationSec: [30, 45],
    lines: [W('ขอทางก่อนสิ...', 'Ask for passage first...')],
    staging: 'The road dips under black flood water; a slow drift of krathong, candles and incense lit, crosses it. Rule 10: honk twice to ask the spirits for passage: the krathong part and the candles flare. Drive in without asking: the candles gutter out and pale hands rise and hold the wheels: rev free (QTE mash) or the water keeps you (death flood).',
  },
  meterBackward: {
    id: 'meterBackward', nameTH: 'มิเตอร์วิ่งถอยหลัง', nameEN: 'The Meter Runs Backwards', kind: 'rule', ruleId: 'r2', tiesTo: 'r2',
    hours: [22, 29.5], where: ['ride:anyGhost'], gazeMode: 'any', once: true, cooldownSec: 1800, chance: 0.2, durationSec: [20, 26],
    lines: [P('หมดพอดีเลยนะ...', "That's it, all used up..."), P('จอดตรงนี้แหละ ฉันลงตรงนี้', "Stop right here. I'll get off here.", { tone: 'whisper' })],
    choice: {
      id: 'meterBackward',
      options: [{ key: 'stop', th: 'ได้ครับ จอดให้', en: 'Sure, stopping.' }, { key: 'shrine', th: 'ไปส่งที่ศาลครับ', en: "I'll take you to the shrine." }, { key: 'silent', th: '…', en: '(say nothing)' }],
      timeout: 6, defaultKey: 'silent',
    },
    outcomes: {
      stop: { lines: [P('ขอบใจจ้ะ...', 'Thank you, dear...', { tone: 'whisper' })], result: 'death:dragBack' },
      stopped: { lines: [], result: 'death:dragBack' },
      shrine: { lines: [P('...ใช่ ทุกทางไปจบที่ศาล', '...Yes. Every road ends at the shrine.', { tone: 'whisper' })], result: 'safe' },
      silent: { lines: [], result: 'safe' },
    },
    staging: 'With a ghost aboard the meter runs backwards to 0.00, then shows a date long past: the fare is used up, she is already dead. She asks to be let off here, in the forest. Rule 2: every road ends at Ma Ruay Shrine. Stopping for her = the door opens by itself and she takes you with her (death dragBack).',
  },
  phiPopGrin: {
    id: 'phiPopGrin', nameTH: 'ผีปอบในกระจกข้าง', nameEN: 'Phi Pop in the Side Mirror', kind: 'rule', ruleId: 'r8', tiesTo: 'r8',
    hours: [22, 27.5], where: ['freeDrive', 'ride:anyGhost'], gazeMode: 'mirrorOnly', once: true, cooldownSec: 1800, chance: 0.12, durationSec: [16, 22],
    lines: [W('หิว...', 'Hungry...')],
    staging: 'Only in the right side mirror: an old village woman crouched by the car, grinning, red eyes, licking her lips; nearer and wider-mouthed each time you look. Then her breath is on your neck. Rule 8: hold the amulet and keep your eyes forward (QTE still) or she feeds (death breath).',
  },
};
