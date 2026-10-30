// Ride 2 — 22:00 — ผู้หญิงชุดขาว Woman in White (GHOST, no reflection → LEFT).
// Dread phase, the scariest ride. Rule-4 trap: she begs you to look at her ("ตรงไหนครับ?" is the
// dangerous reply: it lures your gaze). Rule 9: the cabin light dies by itself. Rule 13 (back of
// the paper): blood drips from the roof in the rain — and she asks you to use the wipers.
// Replies: hospital (exposes her outdated detail), year, lookAtMe (trap), thatNight.
import { P, S, C, O, SIL, tr } from '../lines.js';

const sorryLines = [P('รีบหน่อยนะคะ แฟนฉันรออยู่ห้องฉุกเฉิน', "Please hurry. My boyfriend's waiting in the ER.")];

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
    extra: ['Glass fogs from the OUTSIDE (cold), not from breath.', 'Wet patch stays on the seat after she leaves.', 'Outdated detail: the hospital closed 20 years ago (ask her: reply "closed").'],
  },
  specialRules: [
    { rule: 'r4', note: '"Look at me" trap. Face-gaze timer runs whenever you look straight at her. Reply "where" sets lure r4.' },
    { rule: 'r13', at: 0.4, note: 'Blood drips from the roof in the rain: wipers OFF. She asks you to wipe. Leads into the upside-down head.' },
    { rule: 'r9', at: 0.6, note: 'Cabin light dies by itself; switching it back on = ceiling crawl.' },
    { rule: 'r3', lookBack: 'death', note: 'Back-seat events: fingers, upside-down head, face on glass.' },
  ],
  encounters: [
    { id: 'fingersDoorFrame', at: 0.24 },
    { id: 'bloodDrip', at: 0.4 },
    { id: 'upsideDownHead', at: 0.48 },
    { id: 'cabinLightDies', at: 0.6 },
    { id: 'faceAgainstGlass', at: 0.7 },
  ],
  deathOnWrong: 'trueForm',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 130, stretch: 'none' }, // rain: the player drives slower anyway
  dialogue: {
    hail: [P('รอด้วยค่ะ... ช่วยด้วย...', 'Wait for me... please...', { tone: 'ghost', action: 'hail' })],
    greet: [
      P('ขอบคุณค่ะ... รอมานานมากแล้ว', "Thank you... I've waited so long.", { tone: 'whisper' }),
      P('ขอโทษนะคะ เบาะเปียกหมดเลย', "I'm sorry... I've soaked your seat.", { tone: 'whisper', emotion: 'sad' }),
    ],
    destination: [
      P('ไปโรงพยาบาลประจำจังหวัดค่ะ', 'The provincial hospital, please.'),
      C([
        O('closed', 'โรงพยาบาลนั้นปิดไปแล้วนะครับ', 'That hospital closed down.'),
        O('ok', 'ได้ครับ', 'Sure.'),
        SIL(),
      ], {
        id: 'ww_hospital',
        timeout: 7,
        setOnPick: { closed: { 'clue.womanWhite.hospital': true } },
        branches: {
          closed: [
            P('...ปิดแล้ว?', '...closed?', { tone: 'whisper', pause: 1.0 }),
            P('ไม่จริง แฟนฉันยังอยู่ในนั้น', "No. My boyfriend's still in there.", { emotion: 'anger' }),
          ],
          ok: sorryLines,
          silent: sorryLines,
        },
      }),
    ],
    loopVariants: {
      hail: {
        1: [P('รอด้วยค่ะ... คราวนี้อย่าทิ้งฉันนะ', "Wait for me... don't leave me this time.", { tone: 'ghost', action: 'hail' })],
      },
      greet: {
        1: [
          P('ขอบคุณค่ะ...', 'Thank you...', { tone: 'whisper' }),
          P('เราเคยเจอกันใช่ไหมคะ... ในฝน', "We've met before, haven't we... in the rain?", { tone: 'whisper' }),
        ],
        3: [
          P('คุณอีกแล้ว...', 'You again...', { tone: 'whisper' }),
          P('คืนนี้คุณจะมองหน้าฉันไหมคะ', 'Will you look at my face tonight?', { tone: 'whisper', emotion: 'creepy' }),
        ],
      },
    },
    beats: [
      {
        id: 'jasmine',
        trigger: { type: 'progress', at: 0.12 },
        lines: [
          P('แถวนี้หอมดอกมะลิจังเลยนะคะ', 'It smells so strongly of jasmine round here.', { if: { flag: { boughtJasmine: false } } }),
          P('มะลิพวงนั้น... ใครให้มาคะ', 'That jasmine garland... who gave it to you?', { tone: 'whisper', if: { flag: { boughtJasmine: true } } }),
          P('วันนั้นฉันก็ทัดมะลิ', 'I wore jasmine in my hair that day too.', { tone: 'whisper', emotion: 'sad', if: { flag: { boughtJasmine: true } } }),
        ],
      },
      {
        id: 'whatYear',
        trigger: { type: 'progress', at: 0.2 },
        lines: [
          P('ตอนนี้... พ.ศ. อะไรแล้วคะ', 'What year... is it now?', { pause: 1.0 }),
          C([
            O('long', 'นานแล้วครับ... นานมาก', "It's been a long time... a very long time."),
            O('why', 'ถามทำไมครับ', 'Why do you ask?'),
            SIL(),
          ], {
            id: 'ww_year',
            timeout: 7,
            setOnPick: { long: { 'clue.womanWhite.year': true, ...tr('womanWhite', 'year') } },
            branches: {
              long: [P('...นานขนาดนั้นเลยเหรอคะ', '...has it really been that long?', { tone: 'whisper', emotion: 'sad' })],
              why: [P('ฉันรอนานจนลืมนับ', "I've waited so long I lost count.", { tone: 'whisper' })],
              silent: [P('ไม่เป็นไรค่ะ ฉันจำอะไรไม่ค่อยได้แล้ว', "Never mind. I don't remember much any more.")],
            },
          }),
        ],
      },
      {
        id: 'fingers',
        trigger: { type: 'event', event: 'encounter:fingersDoorFrame' },
        lines: [P('อย่ามองข้างนอกเลยค่ะ... มองฉันดีกว่า', "Don't look outside... look at me instead.", { tone: 'whisper', emotion: 'creepy' })],
      },
      {
        id: 'lookAtMe',
        essential: true, // the rule-4 trap is the point of this ride
        trigger: { type: 'progress', at: 0.32 },
        lines: [
          P('พี่คะ... มองหน้าฉันหน่อยสิคะ', 'Hey... look at me.', { tone: 'whisper', emotion: 'creepy' }),
          P('หน้าฉันเป็นแผลหรือเปล่าคะ... ช่วยดูให้หน่อย', 'Is my face cut? ...Please, look for me.', { tone: 'whisper', emotion: 'sad', pause: 1.0 }),
          C([
            O('where', 'ตรงไหนครับ', 'Where?'), // the trap: it lures your eyes to her face
            O('cant', 'ผมมองไม่ได้ครับ', "I can't look."),
            O('lastTime', 'ครั้งก่อนผมมองไปแล้ว', 'I looked last time.', { if: { diedOn: 'womanWhite' } }),
            SIL(),
          ], {
            id: 'ww_lookAtMe',
            timeout: 8,
            setOnPick: { where: { lure: 'r4' }, lastTime: { trapDefused: true } },
            branches: {
              where: [P('ตรงนี้ไงคะ... หันมาสิ', 'Right here... turn around.', { tone: 'whisper', emotion: 'creepy' })],
              cant: [P('...ทำไมล่ะคะ', '...why not?', { emotion: 'anger', tone: 'ghost' })],
              lastTime: [
                P('...จำได้ด้วยเหรอ', '...you remember?', { tone: 'ghost', emotion: 'anger' }),
                P('งั้นก็นั่งเงียบ ๆ ไปเถอะค่ะ', 'Then we just sit quietly.', { tone: 'whisper', emotion: 'sad' }),
              ],
              silent: [P('ไม่มีใครยอมมองฉันเลย...', 'Nobody will ever look at me...', { emotion: 'sad' })],
            },
          }),
        ],
      },
      {
        id: 'whyNotLook',
        trigger: { type: 'progress', at: 0.44 },
        if: { flag: { trapDefused: false } },
        lines: [P('ทำไมไม่มองฉันล่ะ... คนอื่นเขาก็มองกันทั้งนั้น', "Why won't you look at me... everyone else did.", { emotion: 'anger', tone: 'ghost' })],
      },
      {
        // r13: in the rain the wipers are probably on. She wants them on.
        id: 'bloodAsk',
        trigger: { type: 'event', event: 'encounter:bloodDrip' },
        lines: [P('ฝนตกหนักนะคะ... ปัดน้ำฝนสิคะ', 'Such heavy rain... use the wipers.', { tone: 'whisper', emotion: 'creepy' })],
      },
      {
        id: 'bloodWiped',
        trigger: { type: 'event', event: 'wipersOn' },
        if: { flag: { bloodOnGlass: true } },
        lines: [P('อีกสิคะ... ปัดอีก', 'More... wipe more.', { tone: 'ghost', emotion: 'creepy' })],
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
        lines: [P('มืด ๆ แบบนี้แหละค่ะ... ดีแล้ว', "Dark like this... that's better.", { tone: 'whisper', emotion: 'smile' })],
      },
      {
        id: 'thatNight',
        essential: true,
        trigger: { type: 'progress', at: 0.76 },
        lines: [
          P('คืนนั้นฝนตกหนักเหมือนคืนนี้เลยค่ะ', 'It rained hard that night too. Just like tonight.', { emotion: 'sad' }),
          P('มอเตอร์ไซค์ลื่นตรงโค้งนั้น...', 'The motorbike slid on that curve...'),
          P('รถพยาบาลมารับเขาไป... ไม่มีใครมารับฉันเลย', 'The ambulance took him... nobody came for me.', { tone: 'whisper' }),
          C([
            O('came', 'ผมมารับแล้วไงครับ', 'Well, I came for you.'),
            O('sorry', 'เสียใจด้วยครับ', "I'm sorry."),
            SIL(),
          ], {
            id: 'ww_thatNight',
            timeout: 8,
            setOnPick: { came: tr('womanWhite', 'came', 2), sorry: tr('womanWhite', 'sorry') },
            branches: {
              came: [
                P('คุณ... มารับฉันเหรอคะ', 'You... came for me?', { tone: 'whisper', emotion: 'surprise', pause: 1.0 }),
                P('ขอบคุณค่ะ', 'Thank you.', { emotion: 'smile' }),
              ],
              sorry: [P('ขอบคุณค่ะ... ที่ฟัง', 'Thank you... for listening.', { emotion: 'sad' })],
              silent: [P('ฉันก็เลยรออยู่ตรงนั้น... รอมาตลอด', 'So I waited right there... I have been waiting ever since.', { pause: 1.0 })],
            },
          }),
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
      P('ขอบคุณที่มารับฉันนะคะ', 'Thank you for coming for me.', { emotion: 'smile', if: { trustGte: { womanWhite: 2 } } }),
      P('ขอบคุณนะคะ ที่ไม่มองหน้าฉัน', 'Thank you... for not looking at my face.', { tone: 'whisper', emotion: 'sad', if: { trustLt: { womanWhite: 2 } } }),
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
