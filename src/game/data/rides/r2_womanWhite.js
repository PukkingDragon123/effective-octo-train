// Ride 2 — 22:00 — ผู้หญิงชุดขาว Woman in White (GHOST, no reflection → LEFT).
// Dread phase, the scariest ride. Rule-4 trap: she begs you to look at her.
// Rule 9: the cabin light dies by itself during her ride.
import { P, Y, T, S } from '../lines.js';

export const RIDE_WOMAN_WHITE = {
  id: 'womanWhite',
  order: 2,
  hour: 22,
  pickup: 'accidentCurve',
  characterId: 'womanWhite',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearLeft',
  destination: { th: 'โรงพยาบาลประจำจังหวัด', en: 'The Provincial Hospital' },
  clues: {
    reflection: 'none', shadow: false, breathFog: false, weightKg: 0, meter: 'glitch',
    radioStatic: 0.7, blinks: false, feetFloat: false,
    payment: { type: 'old_banknote', amountTHB: 100, note: { th: 'แบงก์ร้อยรุ่นเก่า เปียกชุ่ม เลิกใช้ไปนานแล้ว', en: 'An old hundred-baht note, soaking wet, long out of circulation.' } },
    smell: 'jasmine-funeral',
    extra: ['Glass fogs from the OUTSIDE (cold), not from breath.', 'Wet patch stays on the seat after she leaves.', 'Outdated detail: the hospital closed 20 years ago.'],
  },
  specialRules: [
    { rule: 'r4', note: '"Look at me" trap. Face-gaze timer runs whenever you look straight at her.' },
    { rule: 'r9', at: 0.6, note: 'Cabin light dies by itself; switching it back on = ceiling crawl.' },
    { rule: 'r3', lookBack: 'death', note: 'Back-seat events: fingers, upside-down head, face on glass.' },
  ],
  encounters: [
    { id: 'fingersDoorFrame', at: 0.24 },
    { id: 'upsideDownHead', at: 0.46 },
    { id: 'cabinLightDies', at: 0.6 },
    { id: 'faceAgainstGlass', at: 0.7 },
    { id: 'twistedNeckReflection', at: 0.82, optional: true },
  ],
  deathOnWrong: 'trueForm',
  memoryHooks: [],
  dialogue: {
    hail: [P('รอด้วยค่ะ... ช่วยด้วย...', 'Wait for me... please...', { tone: 'ghost', action: 'hail' })],
    greet: [
      T('ไม่ได้ยินเสียงประตูเลย', "I didn't hear the door."),
      P('ขอบคุณค่ะ... รอมานานมากแล้ว', "Thank you... I've waited so long.", { tone: 'whisper' }),
      P('ขอโทษนะคะ เบาะเปียกหมดเลย', "I'm sorry... I've soaked your seat.", { tone: 'whisper', emotion: 'sad' }),
    ],
    destination: [
      P('ไปโรงพยาบาลประจำจังหวัดค่ะ', 'The provincial hospital, please.'),
      T('โรงพยาบาลนั่น... ปิดไปตั้งยี่สิบปีแล้วนี่', 'That hospital... it closed twenty years ago.'),
      P('รีบหน่อยนะคะ แฟนฉันรออยู่ห้องฉุกเฉิน', "Please hurry. My boyfriend's waiting in the ER."),
    ],
    beats: [
      {
        id: 'jasmine',
        trigger: { type: 'progress', at: 0.08 },
        lines: [
          P('แถวนี้หอมดอกมะลิจังเลยนะคะ', 'It smells so strongly of jasmine round here.'),
          T('มะลิ... กลิ่นเหมือนในงานศพ', 'Jasmine... like at a funeral.'),
        ],
      },
      {
        id: 'whatYear',
        trigger: { type: 'progress', at: 0.16 },
        lines: [
          P('ปีนี้... ปีอะไรแล้วคะ', 'What year... is it now?', { pause: 1.2 }),
          P('ไม่เป็นไรค่ะ ฉันจำอะไรไม่ค่อยได้แล้ว', "Never mind. I don't remember much any more."),
        ],
      },
      {
        id: 'meterGlitch',
        trigger: { type: 'event', event: 'meterGlitch' },
        lines: [T('มิเตอร์เพี้ยน... ตัวเลขกระโดดไปมา', "The meter's gone mad... the numbers keep jumping.")],
      },
      {
        id: 'fingers',
        trigger: { type: 'event', event: 'encounter:fingersDoorFrame' },
        lines: [P('อย่ามองข้างนอกเลยค่ะ... มองฉันดีกว่า', "Don't look outside... look at me instead.", { tone: 'whisper', emotion: 'creepy' })],
      },
      {
        id: 'lookAtMe',
        trigger: { type: 'progress', at: 0.34 },
        lines: [
          P('พี่คะ... มองหน้าฉันหน่อยสิคะ', 'Hey... look at me.', { tone: 'whisper', emotion: 'creepy' }),
          P('หันมามองฉันหน่อย... ฉันสวยไหมคะ', 'Turn and look at me... am I pretty?', { tone: 'whisper', emotion: 'smile', pause: 1.5 }),
          T('กระจก... ในกระจกไม่มีใครนั่งอยู่เลย', "The mirror... there's nobody in the mirror."),
        ],
      },
      {
        id: 'whyNotLook',
        trigger: { type: 'progress', at: 0.42 },
        lines: [P('ทำไมไม่มองฉันล่ะ... คนอื่นเขาก็มองกันทั้งนั้น', "Why won't you look at me... everyone else did.", { emotion: 'anger', tone: 'ghost' })],
      },
      {
        id: 'headReact',
        trigger: { type: 'event', event: 'encounter:upsideDownHead' },
        lines: [S('voice', 'เจอแล้ว...', 'Found you...', { tone: 'ghost' })],
      },
      {
        id: 'hatesLight',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('ปิดไฟเถอะค่ะ... แสบตา', 'Turn it off, please... it hurts my eyes.', { emotion: 'anger' })],
      },
      {
        id: 'lightDies',
        trigger: { type: 'event', event: 'cabinLightDies' },
        lines: [
          P('มืด ๆ แบบนี้แหละค่ะ... ดีแล้ว', "Dark like this... that's better.", { tone: 'whisper', emotion: 'smile' }),
          T('อย่าเปิด... ข้อเก้า อย่าเปิดมันอีก', "Don't. Rule nine. Don't turn it back on."),
        ],
      },
      {
        id: 'thatNight',
        trigger: { type: 'progress', at: 0.76 },
        lines: [
          P('คืนนั้นฝนตกหนักเหมือนคืนนี้เลยค่ะ', 'It rained hard that night too. Just like tonight.', { emotion: 'sad' }),
          P('มอเตอร์ไซค์ลื่นตรงโค้งนั้น...', 'The motorbike slid on that curve...'),
          P('เขาบอกให้ฉันรอตรงนี้ เดี๋ยวจะกลับมารับ', "He told me to wait right there. He'd come back for me.", { pause: 1.0 }),
        ],
      },
      {
        id: 'redLights',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [P('ไฟสีแดงข้างหน้า... นั่นโรงพยาบาลใช่ไหมคะ', 'The red lights ahead... is that the hospital?')],
      },
      {
        id: 'radioStatic',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [S('radio', '...ช่วย...ด้วย...', '...help...me...', { tone: 'ghost' })],
      },
    ],
    arriveCorrect: [
      P('ที่นี่... ไม่ใช่โรงพยาบาลนี่คะ', "This... isn't the hospital.", { tone: 'whisper' }),
      P('แต่ไม่เป็นไรค่ะ... ฉันได้ยินเสียงเขาเรียกแล้ว', "But it's all right... I can hear him calling me.", { emotion: 'smile' }),
      P('ขอบคุณนะคะ ที่ไม่มองหน้าฉัน', 'Thank you... for not looking at my face.', { tone: 'whisper', emotion: 'sad' }),
    ],
    arriveWrong: [
      P('ทางนี้... มีแต่คนเป็น', 'This road... is only for the living.', { tone: 'ghost' }),
      P('ฉันไปทางนี้ไม่ได้!', "I can't go this way!", { tone: 'shout', emotion: 'anger' }),
      P('มองฉันสิ! มองหน้าฉันเดี๋ยวนี้!', 'Look at me! LOOK AT ME!', { tone: 'shout', emotion: 'creepy', action: 'neckSnap' }),
    ],
    idle: [
      P('ฝนไม่หยุดเลยนะคะ', "The rain won't stop.", { tone: 'whisper' }),
      P('ได้ยินเสียงน้ำหยดไหมคะ ติ๋ง... ติ๋ง...', 'Do you hear the dripping? Drip... drip...', { tone: 'whisper' }),
      P('ฮืม... ฮืม... ฮือ...', 'Hmm... hmm... hmm...', { tone: 'sing' }),
      P('เขาไม่ลืมฉันหรอก... ใช่ไหมคะ', "He hasn't forgotten me... has he?", { emotion: 'sad' }),
    ],
    onLookBack: [P('หันมาแล้ว...', 'You turned around...', { tone: 'ghost', emotion: 'creepy' })],
    onFaceGazeWarn: [P('ใช่... มองแบบนั้นแหละค่ะ... อีกนิดเดียว', 'Yes... look at me like that... just a little longer.', { tone: 'whisper', emotion: 'creepy' })],
    onFaceGaze: [P('เห็นหน้าฉันแล้วสินะ', "Now you've seen my face.", { tone: 'ghost', emotion: 'creepy', action: 'neckSnap' })],
  },
};
