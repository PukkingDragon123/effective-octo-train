// New ride — 21:30 — ลุงชื่น Uncle Chuen (HUMAN → RIGHT). Act 1, still dread.
// A rubber tapper on his way to tap before dawn. Jokes to hide how much this road scares him; his
// clues are the living ones (breath on the glass, weight, a torch that dies, a crumpled 20-baht note).
// Arc: small talk → the tapper's story of the woman in the rubber plantation → a test of Ton's nerve.
import { P, Y, C, O, SIL, tr } from '../lines.js';

export const RIDE_CHUEN = {
  id: 'chuen',
  order: 10,
  hour: 21.5,
  pickup: 'sala1', // (LAYOUT key for the validator; the real stop is pickupAt)
  pickupAt: 'chuenStop',
  characterId: 'chuen',
  identity: 'human',
  fork: 'right',
  seat: 'frontPassenger',
  destination: { th: 'สวนยางท้ายบ้านห้วยทราย', en: 'The rubber plantation past Huai Sai' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 62, meter: 'normal', radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'note', amountTHB: 20, note: { th: 'แบงก์ยี่สิบยับ ๆ กลิ่นน้ำยาง', en: 'A crumpled twenty, smelling of latex.' } },
    smell: 'latex',
  },
  specialRules: [{ rule: 'r3', lookBack: 'warn', note: 'He sits in front: nothing behind but empty seats.' }],
  encounters: [{ id: 'treeWatcher', at: 0.55, optional: true }],
  deathOnWrong: 'giantHand',
  memoryHooks: [],
  pacing: { cruiseKmh: 45, minSeconds: 390, stretch: 'fog' },
  dialogue: {
    hail: [P('เฮ้ย แท็กซี่! จอด ๆ', 'Oi, taxi! Stop, stop!', { tone: 'shout', action: 'hail' })],
    askRide: [
      P('ไปสวนยางท้ายห้วยทรายได้ไหม จ่ายยี่สิบนะ', 'Can you take me to the rubber past Huai Sai? Twenty baht.'),
      Y('ได้ครับลุง ขึ้นมาเลย', 'Sure, uncle. Get in.'),
      P('นั่งข้างหน้าละกัน ข้างหลังไม่ชอบ', 'I’ll sit up front. Don’t like the back.'),
    ],
    greet: [
      P('รถอากงใช่ไหมเนี่ย จำได้ ไฟว่างมันเอียง ๆ', 'This is Ah Kong’s car, isn’t it? I know that crooked vacant lamp.'),
      C([O('yes', 'ใช่ครับ ผมเพิ่งมาขับ', 'Yes, I just started.'), O('who', 'ลุงรู้จักอากงเหรอครับ', 'You know Ah Kong?'), SIL()], {
        id: 'chuen_kong', timeout: 8, setOnPick: { yes: tr('chuen', 'kong'), who: tr('chuen', 'kong') },
        branches: {
          yes: [P('คนใหม่อีกแล้ว… ไม่มีใครอยู่ได้นานหรอก', 'Another new one… nobody lasts long.', { pause: 0.6 })],
          who: [P('ใครไม่รู้จัก แกเฝ้าถนนนี้มาตั้งแต่ลุงยังเด็ก', 'Who doesn’t? He’s watched this road since I was a boy.')],
          silent: [P('เงียบ ๆ ก็ดี ลุงพูดเยอะอยู่แล้ว', 'Quiet’s fine. I talk enough for two.')],
        },
      }),
    ],
    destination: [P('ไปสวนยางนะ ตีสามต้องเริ่มกรีดแล้ว', 'The rubber trees. I start tapping at three.')],
    beats: [
      { id: 'torch', trigger: { type: 'progress', at: 0.18 }, lines: [P('ไฟฉายลุงดับอีกแล้ว ถ่านใหม่แท้ ๆ', 'My torch died again. New batteries, too.'), P('ในสวนยางน่ะ ไฟฉายดับบ่อยกว่าที่อื่น', 'In the plantation torches die more than anywhere.')] },
      {
        id: 'woman', essential: true, trigger: { type: 'progress', at: 0.36 },
        lines: [
          P('รู้ไหม ในสวนยางมีผู้หญิงคนหนึ่ง ยืนอยู่ระหว่างแถวต้นยาง', 'You know, there’s a woman in the plantation. She stands between the rows.'),
          P('ไม่เคยเดิน ไม่เคยพูด แต่เช้ามาต้นที่แกยืน น้ำยางเป็นสีแดง', 'Never walks, never speaks. But in the morning the tree she stood by bleeds red.'),
          C([O('scared', 'ลุงไม่กลัวเหรอครับ', 'Aren’t you scared?'), O('joke', 'แดงก็ขายได้ราคานะครับ', 'Red sells better, maybe.'), SIL()], {
            id: 'chuen_woman', timeout: 8, setOnPick: { scared: tr('chuen', 'woman'), joke: tr('chuen', 'joke', -1) },
            branches: {
              scared: [P('กลัวสิ แต่ลูกต้องกินข้าว', 'Course I am. But my kids have to eat.', { emotion: 'sad' })],
              joke: [P('ไอ้หนู อย่าเอาเรื่องนี้มาเล่น', 'Don’t joke about that, boy.', { emotion: 'anger' })],
              silent: [P('…ลุงก็ไม่รู้ว่าเล่าทำไม', '…don’t know why I told you that.')],
            },
          }),
        ],
      },
      { id: 'breath', trigger: { type: 'progress', at: 0.5 }, lines: [P('หนาวนะคืนนี้ กระจกฝ้าหมดเลย', 'Cold tonight. The glass is all fogged up.'), Y('ลุงเช็ดได้เลยครับ', 'Wipe it if you like.')] },
      {
        id: 'nerve', trigger: { type: 'progress', at: 0.7 },
        lines: [
          P('ถามจริง ขับรถคืนนี้ เห็นอะไรแปลก ๆ บ้างหรือยัง', 'Honestly now, seen anything strange yet tonight?'),
          C([O('yes', 'เห็นครับ', 'I have.'), O('no', 'ยังครับ', 'Not yet.'), SIL()], {
            id: 'chuen_nerve', timeout: 8, setOnPick: { yes: tr('chuen', 'honest'), no: tr('chuen', 'honest') },
            branches: {
              yes: [P('ดี พูดความจริงไว้ ถนนนี้ชอบคนโกหก', 'Good. Tell the truth. This road loves a liar.')],
              no: [P('เดี๋ยวก็เห็น…', 'You will…', { tone: 'whisper' })],
              silent: [P('ไม่ตอบก็แปลว่าเห็น', 'No answer means you have.')],
            },
          }),
        ],
      },
      { id: 'fork', trigger: { type: 'event', event: 'forkApproach' }, lines: [P('ถึงศาลแล้ว ไปทางขวานะ ทางคนเป็น', 'The shrine. Go right, the living’s way.')] },
    ],
    arriveCorrect: [P('ขอบใจนะไอ้หนู เอ้า ยี่สิบ', 'Thanks, boy. Here, twenty.'), P('ขับดี ๆ ล่ะ อย่าจอดให้ใครข้างสวนยาง', 'Drive safe. Don’t stop for anyone by the rubber trees.')],
    arriveWrong: [P('นี่มันทางซ้าย! ไอ้หนู พาลุงมาไหนวะ', 'This is the left road! Where’ve you brought me?', { tone: 'shout' }), P('…ลุงยังไม่ตายนะ', '…I’m not dead yet.', { tone: 'whisper' })],
    idle: [P('ฮัมเพลงหน่อยดีกว่า เงียบ ๆ แล้วขนลุก', 'I’ll hum something. Quiet gives me the creeps.', { tone: 'sing' }), P('ลูกสาวลุงจะสอบเข้ามหาลัยปีนี้', 'My daughter sits her university exam this year.'), P('ยางกิโลละไม่กี่บาท ไม่คุ้มเหนื่อยหรอก', 'Rubber pays next to nothing a kilo. Not worth it.')],
    onLookBack: [P('มองอะไรข้างหลัง ไม่มีใครหรอก… ใช่ไหม', 'What are you looking back at? Nobody there… right?', { tone: 'whisper' })],
  },
};
