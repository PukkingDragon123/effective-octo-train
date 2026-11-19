// New ride — 00:30 — พลทหารเด่น Private Den (GHOST → LEFT). Act 2, surreal.
// A young conscript walking back to a camp that closed decades ago, polite and homesick. He salutes
// the shrine, talks of a radio programme off the air for forty years, and his boots leave wet prints.
import { P, Y, C, O, SIL, tr } from '../lines.js';

export const RIDE_SOLDIER = {
  id: 'soldier',
  order: 12,
  hour: 24.5,
  pickup: 'bridge',
  pickupAt: 'soldierStop',
  characterId: 'soldier',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearRight',
  destination: { th: 'ค่ายทหารเก่า หลังเขา', en: 'The old army camp behind the hill' },
  clues: {
    reflection: 'delayed', shadow: false, breathFog: false, weightKg: 0, meter: 'normal', radioStatic: 0.5, blinks: false, feetFloat: false,
    payment: { type: 'coins', amountTHB: 0, note: { th: 'เหรียญสลึงสองอัน เขียวคราบสนิม', en: 'Two quarter-baht coins, green with age.' } },
    smell: 'river-mud',
    extra: ['His boots leave wet prints that do not dry.', 'Mentions a radio show that ended forty years ago.'],
  },
  specialRules: [{ rule: 'r3', lookBack: 'warn', note: 'He sits right behind you.' }, { rule: 'r6', note: 'If he asks for the radio off, turn it off.' }],
  encounters: [{ id: 'krasue', at: 0.5, optional: true }],
  deathOnWrong: 'dragBack',
  memoryHooks: [],
  pacing: { cruiseKmh: 42, minSeconds: 380, stretch: 'fog' },
  dialogue: {
    hail: [P('พี่ครับ! รบกวนหน่อยครับ', 'Sir! Sorry to trouble you!', { action: 'hail' })],
    askRide: [P('ไปค่ายหลังเขาได้ไหมครับ ผมกลับไม่ทันเวลา', 'Could you take me to the camp behind the hill? I’m late back.'), Y('ได้ครับ ขึ้นมา', 'Sure, get in.')],
    greet: [P('ขอบคุณครับพี่ เดินมาตั้งแต่สะพานแล้ว', 'Thank you, sir. I’ve walked from the bridge.'), P('รองเท้าเปียกหมดเลย ขอโทษนะครับ', 'My boots are soaked, sorry.')],
    destination: [P('ค่ายอยู่หลังเขาครับ เลยศาลไปทางซ้าย', 'The camp’s behind the hill. Past the shrine, on the left.')],
    beats: [
      {
        id: 'home', trigger: { type: 'progress', at: 0.2 },
        lines: [P('พี่มาจากกรุงเทพฯ เหรอครับ', 'Are you from Bangkok?'), C([O('yes', 'ครับ เพิ่งกลับมา', 'Yes, just came back.'), O('here', 'บ้านผมอยู่แถวนี้', 'I’m from round here.'), SIL()], {
          id: 'soldier_home', timeout: 8, setOnPick: { yes: tr('soldier', 'home'), here: tr('soldier', 'home') },
          branches: { yes: [P('ผมอยากไปสักครั้ง… แม่บอกว่าที่นั่นไฟสว่างทั้งคืน', 'I always wanted to go… Mum says the lights stay on all night there.')], here: [P('งั้นพี่คงรู้จักแม่ผม แม่ขายขนมจีนหน้าตลาด', 'Then you must know my mum. She sells noodles by the market.')], silent: [] },
        })],
      },
      { id: 'radio', trigger: { type: 'progress', at: 0.36 }, lines: [P('พี่เปิดรายการเพลงลูกทุ่งตอนเที่ยงคืนได้ไหมครับ รายการน้าเสถียร', 'Could you put on the midnight luk thung show? Uncle Sathian’s?'), Y('…รายการนั้นเลิกไปนานแล้วนะครับ', '…that show ended years ago.', { tone: 'thought' })] },
      {
        id: 'bridge', essential: true, trigger: { type: 'progress', at: 0.55 },
        lines: [
          P('คืนที่น้ำหลาก ผมกับเพื่อนสามคนข้ามสะพานกลับค่าย', 'The night of the flood, three mates and I crossed the bridge back to camp.'),
          P('สะพานมันหายไปตอนไหนก็ไม่รู้ ผมจำได้แค่น้ำเย็นมาก', 'I don’t know when the bridge went. I only remember how cold the water was.'),
          C([O('sorry', 'ผมเสียใจด้วยครับ', 'I’m sorry.'), O('friends', 'แล้วเพื่อนคุณล่ะครับ', 'And your friends?'), SIL()], {
            id: 'soldier_bridge', timeout: 9, setOnPick: { sorry: tr('soldier', 'kind'), friends: tr('soldier', 'kind') },
            branches: {
              sorry: [P('เสียใจทำไมครับ ผมแค่กลับค่ายสาย', 'Why sorry? I’m only late back to camp.', { emotion: 'surprise' })],
              friends: [P('พวกมันนั่งอยู่ข้างผมนี่ไงครับ พี่ไม่เห็นเหรอ', 'They’re sitting right next to me. Can’t you see?', { tone: 'whisper', emotion: 'creepy' })],
              silent: [P('ช่างมันเถอะครับ', 'Never mind.')],
            },
          }),
        ],
      },
      { id: 'salute', trigger: { type: 'event', event: 'forkApproach' }, lines: [P('ผมขอทำความเคารพศาลก่อนนะครับ', 'Let me salute the shrine first.'), P('ไปทางซ้ายครับพี่', 'Left, sir.')] },
    ],
    arriveCorrect: [P('ถึงแล้ว… ไฟค่ายยังเปิดอยู่เลย', 'Here… the camp lights are still on.', { emotion: 'smile' }), P('ขอบคุณครับพี่ ฝากบอกแม่ด้วยว่าผมกลับค่ายทันแล้ว', 'Thank you. Tell my mum I made it back in time.', { tone: 'whisper' })],
    arriveWrong: [P('นี่มันทางกลับบ้าน… ผมกลับบ้านไม่ได้ครับพี่', 'This is the way home… I can’t go home, sir.', { tone: 'ghost' }), P('แม่ผมจะเห็นว่าผมเปียกขนาดไหน', 'Mum will see how wet I am.', { tone: 'ghost', emotion: 'sad' })],
    idle: [P('ผมเหลือเวลาราชการอีกเดือนเดียวเองครับ', 'Only a month left of my service.'), P('น้ำหยดจากแขนเสื้อผม ขอโทษนะครับ เบาะเปียก', 'Water’s dripping off my sleeve, sorry about the seat.'), P('ข้างหลังนี่หนาวจังครับ', 'It’s so cold back here.')],
    onLookBack: [P('พี่อย่าหันมาครับ… เพื่อนผมไม่ชอบให้ใครมอง', 'Don’t turn round, sir… my mates don’t like being looked at.', { tone: 'ghost' })],
  },
};
