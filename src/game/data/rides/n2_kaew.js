// New ride — 22:30 — พยาบาลแก้ว Nurse Kaew (GHOST → LEFT). Act 1 closes on her.
// A night-shift nurse from the old provincial hospital, still doing her rounds. Kind and tired,
// and wrong in small ways: a watch stopped at 02:14, a ward that burned down in 2528, she never
// breathes on the glass and the seat does not sink. She asks about patients who died decades ago.
import { P, Y, C, O, SIL, tr } from '../lines.js';

export const RIDE_KAEW = {
  id: 'kaew',
  order: 11,
  hour: 22.5,
  pickup: 'busStop',
  pickupAt: 'kaewStop',
  characterId: 'kaew',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearLeft',
  destination: { th: 'โรงพยาบาลประจำจังหวัด ตึกเก่า', en: 'The provincial hospital, the old wing' },
  clues: {
    reflection: 'none', shadow: false, breathFog: false, weightKg: 0, meter: 'normal', radioStatic: 0.3, blinks: false, feetFloat: false,
    payment: { type: 'note', amountTHB: 0, note: { th: 'ใบสั่งยาเก่า ลงวันที่ ๒๕๒๘', en: 'An old prescription slip dated 1985.' } },
    smell: 'antiseptic',
    extra: ['Her watch stopped at 02:14.', 'Talks of the ward that burned down as if it were open tonight.'],
  },
  specialRules: [{ rule: 'r4', note: 'No reflection: do not look at her face.' }, { rule: 'r3', lookBack: 'warn' }],
  encounters: [{ id: 'krahang', at: 0.6, optional: true }],
  deathOnWrong: 'dragBack',
  memoryHooks: [],
  pacing: { cruiseKmh: 42, minSeconds: 390, stretch: 'mist' },
  dialogue: {
    hail: [P('ขอโทษนะคะ… ไปโรงพยาบาลไหมคะ', 'Excuse me… are you going to the hospital?', { action: 'hail' })],
    askRide: [P('เข้าเวรดึกค่ะ สายแล้ว', 'Night shift. I’m late.'), Y('ขึ้นมาเลยครับ', 'Hop in.')],
    greet: [
      P('ขอบคุณค่ะ… คืนนี้คนไข้เยอะ', 'Thank you… so many patients tonight.', { emotion: 'sad' }),
      P('ตึกสามเพิ่งเปิดใหม่ เตียงไม่พอเลย', 'Ward three has only just opened. Not enough beds.'),
    ],
    destination: [P('ไปตึกเก่านะคะ ทางเข้าด้านหลัง', 'The old wing, please. The back entrance.')],
    beats: [
      {
        id: 'watch', trigger: { type: 'progress', at: 0.2 },
        lines: [P('นาฬิกาดิฉันตายอีกแล้ว ตีสองสิบสี่', 'My watch has stopped again. Two-fourteen.'), C([O('time', 'ตอนนี้สี่ทุ่มครึ่งครับ', 'It’s half past ten.'), O('ok', 'เดี๋ยวก็เดินเองครับ', 'It’ll start again.'), SIL()], {
          id: 'kaew_watch', timeout: 8, setOnPick: { time: { 'clue.kaew.watch': true } },
          branches: { time: [P('…สี่ทุ่มครึ่ง แต่ดิฉันเพิ่งออกเวรตอนตีสอง', '…half past ten. But I only came off duty at two.', { tone: 'whisper' })], ok: [P('ค่ะ… มันหยุดตรงนั้นทุกคืน', 'Yes… it stops there every night.')], silent: [] },
        })],
      },
      {
        id: 'patient', essential: true, trigger: { type: 'progress', at: 0.42 },
        lines: [
          P('คุณรู้จักคุณป้าเตียงเจ็ดไหมคะ ป้าเพ็ญ', 'Do you know the old lady in bed seven? Auntie Pen?'),
          P('ป้ารอลูกชายมาเยี่ยมทุกคืน ลูกเป็นคนขับรถ', 'She waits every night for her son. He drives for a living.'),
          C([O('who', 'ลูกชายแกชื่ออะไรครับ', 'What’s her son’s name?'), O('dead', 'ป้าเพ็ญยังอยู่เหรอครับ', 'Is Auntie Pen still alive?'), SIL()], {
            id: 'kaew_patient', timeout: 9, setOnPick: { who: tr('kaew', 'patient'), dead: { 'clue.kaew.dead': true } },
            branches: {
              who: [P('ชื่อชาย… ขับแท็กซี่สีเขียวเหลือง', 'Chai… he drives a green-and-yellow taxi.', { tone: 'whisper' }), Y('…', '…', { tone: 'thought' })],
              dead: [P('อยู่สิคะ ทุกคนในตึกนั้นยังอยู่ ไม่มีใครได้ออกไปเลย', 'Of course. Everyone in that wing is still there. Nobody ever got out.', { tone: 'ghost' })],
              silent: [P('ช่างเถอะค่ะ คุณคงไม่รู้จัก', 'Never mind. You wouldn’t know her.')],
            },
          }),
        ],
      },
      { id: 'smoke', trigger: { type: 'progress', at: 0.6 }, lines: [P('ได้กลิ่นควันไหมคะ', 'Can you smell smoke?', { tone: 'whisper' }), P('คืนนั้นก็กลิ่นแบบนี้แหละ', 'It smelled just like this that night.', { tone: 'whisper', emotion: 'sad' })] },
      { id: 'face', trigger: { type: 'progress', at: 0.76 }, lines: [P('อย่ามองหน้าดิฉันนะคะ… หน้าดิฉันไม่สวยแล้ว', 'Please don’t look at my face… it isn’t pretty any more.', { tone: 'whisper' })] },
      { id: 'fork', trigger: { type: 'event', event: 'forkApproach' }, lines: [P('ทางซ้ายค่ะ ตึกเก่าอยู่ทางนั้น', 'Left, please. The old wing is that way.')] },
    ],
    arriveCorrect: [P('ขอบคุณนะคะ… ดิฉันจะบอกป้าเพ็ญว่าคุณถามถึง', 'Thank you… I’ll tell Auntie Pen you asked after her.', { emotion: 'smile' }), P('ค่ารถ… ดิฉันไม่มีเงินจริง ๆ ขอโทษนะคะ', 'The fare… I really have no money. I’m sorry.')],
    arriveWrong: [P('ทางนี้ไม่ใช่โรงพยาบาล…', 'This isn’t the way to the hospital…', { tone: 'whisper' }), P('คนไข้รอดิฉันอยู่ คุณพาดิฉันไปไหน', 'My patients are waiting. Where are you taking me?', { tone: 'ghost', emotion: 'anger' })],
    idle: [P('เข็มฉีดยาสมัยนี้ใช้แล้วทิ้งแล้วเหรอคะ', 'Do they really throw needles away after one use now?'), P('ตึกสามมีหน้าต่างบานเดียว ชั้นบนสุด', 'Ward three has a single window, on the top floor.'), P('ดิฉันเหนื่อยมาก… เหนื่อยมานานแล้ว', 'I’m so tired… I have been for a long time.', { tone: 'whisper' })],
    onLookBack: [P('ดิฉันบอกแล้วไงคะ ว่าอย่ามอง', 'I asked you not to look.', { tone: 'ghost' })],
    onFaceGazeWarn: [P('อย่า… ค่ะ', 'Please… don’t.', { tone: 'whisper' })],
    onFaceGaze: [P('ไฟมันไหม้หน้าดิฉันก่อน…', 'The fire took my face first…', { tone: 'ghost', emotion: 'creepy' })],
  },
};
