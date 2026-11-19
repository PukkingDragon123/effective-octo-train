// New ride — 04:30 — เจ้าสาว The Bride (GHOST → LEFT). Act 3, the beautiful sad one before dawn.
// Died on this road on her wedding morning thirty years ago (the same morning as Somchai's crash),
// still dressed for the ceremony, garland in hand. She asks Ton to promise he will go home.
import { P, Y, C, O, SIL, tr } from '../lines.js';

export const RIDE_BRIDE = {
  id: 'bride',
  order: 14,
  hour: 28.5,
  pickup: 'sala2',
  pickupAt: 'brideStop',
  characterId: 'bride',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearLeft',
  destination: { th: 'บ้านเจ้าบ่าว ท้ายทุ่ง', en: 'The groom’s house, past the fields' },
  clues: {
    reflection: 'only', shadow: false, breathFog: false, weightKg: 0, meter: 'oldDate', radioStatic: 0.2, blinks: false, feetFloat: true,
    payment: { type: 'garland', amountTHB: 0, note: { th: 'พวงมาลัยมะลิเหี่ยว ๆ วางบนเบาะ', en: 'A wilted jasmine garland on the seat.' } },
    smell: 'jasmine-old',
    extra: ['Visible only in the mirror.', 'The meter shows the date of the old crash.'],
  },
  specialRules: [{ rule: 'r16', note: 'Count the mirror: she is there, the seat is empty.' }, { rule: 'r3', lookBack: 'warn' }],
  encounters: [],
  deathOnWrong: 'home',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 360, stretch: 'mist' },
  dialogue: {
    hail: [P('รบกวนด้วยค่ะ… ฉันจะไปไม่ทันฤกษ์', 'Please… I’ll miss the auspicious hour.', { tone: 'whisper', action: 'hail' })],
    askRide: [Y('ขึ้นมาครับ', 'Get in.')],
    greet: [P('วันนี้วันแต่งงานของฉันค่ะ', 'Today is my wedding day.', { emotion: 'smile' }), P('ทุกคนรออยู่ที่บ้านเจ้าบ่าว', 'Everyone is waiting at the groom’s house.')],
    destination: [P('บ้านเจ้าบ่าวอยู่ท้ายทุ่ง ทางซ้ายที่ศาลค่ะ', 'His house is past the fields. Left at the shrine.')],
    beats: [
      { id: 'mirror', trigger: { type: 'progress', at: 0.2 }, lines: [P('อย่าหันมานะคะ ดูในกระจกก็พอ', 'Don’t turn round. The mirror is enough.', { tone: 'whisper' })] },
      {
        id: 'morning', essential: true, trigger: { type: 'progress', at: 0.4 },
        lines: [
          P('เช้าวันนั้นฝนตก ฉันนั่งรถแท็กซี่สีเขียวเหลืองไปบ้านเขา', 'That morning it rained. I rode a green-and-yellow taxi to his house.'),
          P('คนขับใจดีมาก เขาบอกว่าลูกชายเขาจะกลับมาจากกรุงเทพฯ', 'The driver was so kind. He said his son was coming home from Bangkok.'),
          C([O('dad', 'คนขับคนนั้นคือพ่อผม', 'That driver was my father.', { if: { flag: { 'k.storySomchaiCrash': true } } }), O('then', 'แล้วเกิดอะไรขึ้นครับ', 'Then what happened?'), SIL()], {
            id: 'bride_morning', timeout: 10, setOnPick: { dad: { 'k.knowsBride': true, ...tr('bride', 'dad', 2) }, then: tr('bride', 'kind') },
            branches: {
              dad: [P('…ลูกชายเขากลับมาแล้ว', '…his son came home, then.', { tone: 'whisper', emotion: 'smile' }), P('เขาพูดถึงคุณตลอดทางเลยนะคะ', 'He talked about you the whole way.', { emotion: 'sad' })],
              then: [P('ที่โค้งนั้น… ฉันจำได้แค่กลิ่นมะลิกับเสียงเบรก', 'At that curve… all I remember is jasmine and the brakes.', { tone: 'whisper' })],
              silent: [],
            },
          }),
        ],
      },
      {
        id: 'promise', trigger: { type: 'progress', at: 0.7 },
        lines: [P('สัญญากับฉันได้ไหมคะ ว่าคุณจะได้กลับบ้าน', 'Will you promise me you’ll get home?'), C([O('yes', 'สัญญาครับ', 'I promise.'), O('try', 'ผมจะพยายามครับ', 'I’ll try.'), SIL()], {
          id: 'bride_promise', timeout: 9, setOnPick: { yes: { 'k.promisedBride': true }, try: tr('bride', 'try') },
          branches: { yes: [P('ดีค่ะ… มีคนรอคุณอยู่', 'Good… someone is waiting for you.', { emotion: 'smile' })], try: [P('พยายามก็พอค่ะ', 'Trying is enough.')], silent: [P('…', '…')] },
        })],
      },
      { id: 'fork', trigger: { type: 'event', event: 'forkApproach' }, lines: [P('ทางซ้ายค่ะ… ได้ยินเสียงแตรวงไหมคะ', 'Left… can you hear the wedding band?', { tone: 'whisper' })] },
    ],
    arriveCorrect: [P('เขารออยู่ตรงนั้น…', 'There he is, waiting…', { emotion: 'smile' }), P('ขอบคุณที่พามาส่งค่ะ ฝากพวงมาลัยไว้ให้คุณพ่อด้วย', 'Thank you for bringing me. Give the garland to your father.', { tone: 'whisper' })],
    arriveWrong: [P('ทางนี้ไม่มีงานแต่งงาน…', 'There is no wedding this way…', { tone: 'ghost' }), P('มีแต่โค้งนั้น… อีกแล้ว', 'Only that curve… again.', { tone: 'ghost', emotion: 'sad' })],
    idle: [P('ชุดนี้แม่ตัดให้ค่ะ ผ้าไหมทั้งตัว', 'Mum made this dress. Silk, all of it.'), P('มะลิเหี่ยวหมดแล้ว…', 'The jasmine has all wilted…', { tone: 'whisper' }), P('ฟ้าใกล้สางแล้ว ฉันต้องไปให้ทัน', 'It’s nearly dawn. I have to be in time.')],
    onLookBack: [P('ที่เบาะว่างเปล่า… ฉันอยู่ในกระจกค่ะ', 'The seat is empty… I am in the mirror.', { tone: 'ghost' })],
    onFaceGaze: [P('คุณมองฉันนานเกินไปแล้ว', 'You’ve looked at me too long.', { tone: 'ghost', emotion: 'creepy' })],
  },
};
