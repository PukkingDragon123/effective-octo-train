// New ride — 03:30 — แม่สมบัติ Mae Sombat (HUMAN → RIGHT). Act 3 opens: calm, warm, revealing.
// A sticky-rice seller who has driven this road with her late husband for thirty years. She is the
// one who tells Ton plainly what happened to the green-and-yellow taxi and its driver, and what the
// old man at the garage has been doing every night since.
import { P, Y, C, O, SIL, tr } from '../lines.js';

export const RIDE_SOMBAT = {
  id: 'sombat',
  order: 13,
  hour: 27.5,
  pickup: 'noodleShop',
  pickupAt: 'sombatStop',
  characterId: 'sombat',
  identity: 'human',
  fork: 'right',
  seat: 'rearLeft',
  destination: { th: 'ตลาดเช้าห้วยทราย', en: 'Huai Sai morning market' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 82, meter: 'normal', radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'note', amountTHB: 60, note: { th: 'แบงก์ห้าสิบกับเหรียญสิบ อุ่น ๆ', en: 'A fifty and a ten, still warm.' } },
    smell: 'sticky-rice',
  },
  specialRules: [{ rule: 'r3', lookBack: 'warn' }],
  encounters: [],
  deathOnWrong: 'giantHand',
  memoryHooks: [],
  pacing: { cruiseKmh: 45, minSeconds: 360, stretch: 'fog' },
  dialogue: {
    hail: [P('แท็กซี่จ๊ะ ไปตลาดไหม', 'Taxi, love! Going to the market?', { action: 'hail' })],
    askRide: [P('ข้าวเหนียวมันจะเย็นซะก่อน ช่วยหน่อยนะ', 'The sticky rice will go cold. Help me out.'), Y('ขึ้นมาเลยครับป้า', 'Hop in, auntie.')],
    greet: [P('โอ้โห รถคันนี้… ยังวิ่งอยู่อีกเหรอเนี่ย', 'Goodness, this car… still on the road?', { emotion: 'surprise' })],
    destination: [P('ไปตลาดเช้านะ ทางขวาที่ศาล', 'The morning market, right at the shrine.')],
    beats: [
      {
        id: 'taxi', essential: true, trigger: { type: 'progress', at: 0.22 },
        lines: [
          P('รถคันนี้เป็นของไอ้ชายนะ คนขับเก่า', 'This was Chai’s car, you know. The old driver.'),
          P('สามสิบปีก่อน เช้ามืดแบบนี้แหละ รถตกโค้งร้อยศพ', 'Thirty years ago, a morning just like this, it went off at the Hundred Corpses Curve.'),
          C([O('dead', 'แล้วคนขับล่ะครับ', 'And the driver?'), O('car', 'แต่รถยังอยู่นี่นา', 'But the car’s right here.'), SIL()], {
            id: 'sombat_taxi', timeout: 9, setOnPick: { dead: { 'k.storySomchaiCrash': true }, car: { 'k.storySomchaiCrash': true } },
            branches: {
              dead: [P('ไม่รอด… ลูกชายเขาอยู่กรุงเทพฯ ยังไม่ทันได้ร่ำลา', 'He didn’t make it… his son was in Bangkok. Never got to say goodbye.', { emotion: 'sad' })],
              car: [P('นั่นแหละที่ป้าสงสัย อากงลากมันขึ้นมาซ่อมทั้งปี', 'That’s what I wonder. Ah Kong hauled it up and fixed it for a year.')],
              silent: [P('ป้าพูดมากไปละ', 'I talk too much.')],
            },
          }),
        ],
      },
      {
        id: 'kong', essential: true, trigger: { type: 'progress', at: 0.45 },
        lines: [
          P('ตั้งแต่นั้น อากงแกส่งคนขับออกมาทุกคืน', 'Ever since, the old man sends a driver out every night.'),
          P('คนแถวนี้ว่าแกกำลังรอใครสักคนกลับบ้าน', 'Folk round here say he’s waiting for someone to come home.'),
          C([O('who', 'รอใครครับ', 'Waiting for whom?'), O('why', 'ทำไมต้องเป็นผมด้วย', 'Why me?'), SIL()], {
            id: 'sombat_kong', timeout: 9, setOnPick: { who: tr('sombat', 'kong'), why: tr('sombat', 'kong') },
            branches: {
              who: [P('ป้าก็ไม่รู้ แต่ทุกคืนแกตั้งสำรับข้าวไว้สองที่', 'I don’t know. But every night he sets the table for two.', { tone: 'whisper' })],
              why: [P('หน้าเธอ… คล้ายไอ้ชายตอนหนุ่ม ๆ นะ', 'Your face… you look like Chai did when he was young.', { tone: 'whisper' })],
              silent: [],
            },
          }),
        ],
      },
      { id: 'rice', trigger: { type: 'progress', at: 0.66 }, lines: [P('เอ้า ข้าวเหนียวห่อนึง ไม่คิดเงิน', 'Here, a parcel of sticky rice. No charge.', { emotion: 'smile' }), Y('ขอบคุณครับป้า', 'Thank you, auntie.')] },
      { id: 'fork', trigger: { type: 'event', event: 'forkApproach' }, lines: [P('ทางขวานะ อย่าเผลอไปซ้าย', 'Right, now. Don’t drift left.')] },
    ],
    arriveCorrect: [P('ถึงตลาดแล้ว ขอบใจจ้ะ', 'Market’s here. Thank you, dear.'), P('ถ้าเจออากง บอกแกว่ากินข้าวบ้างนะ', 'If you see Ah Kong, tell him to eat something.')],
    arriveWrong: [P('นี่มันทางซ้าย! ป้ายังมีข้าวเหนียวต้องขายนะ', 'That’s the left road! I’ve rice to sell!', { tone: 'shout' })],
    idle: [P('ตีสามป้าก็ตื่นแล้ว นึ่งข้าวทุกวันไม่มีหยุด', 'Up at three every day, steaming rice, never a day off.'), P('สามีป้าเคยขับรถส่งของเส้นนี้', 'My husband used to drive deliveries on this road.'), P('ฟ้าจะสางแล้ว เห็นไหม ขอบฟ้าสีเทา', 'Dawn’s coming. See, the sky’s turning grey.')],
    onLookBack: [P('หันมาทำไมลูก ป้านั่งอยู่นี่', 'Why turn round, dear? I’m right here.')],
  },
};
