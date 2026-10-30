// Ride 3 — 23:00 — ลุงเปี๊ยก Uncle Piak (HUMAN, looks creepy → RIGHT).
// Comic relief inside horror. Rule 5: three knocks from the trunk while he snores.
// Yai Speed may overtake. He sits up front so the player can see him breathe on the glass.
import { P, Y, T } from '../lines.js';

export const RIDE_PIAK = {
  id: 'piak',
  order: 3,
  hour: 23,
  pickup: 'noodleShop',
  characterId: 'piak',
  identity: 'human',
  fork: 'right',
  seat: 'frontPassenger',
  destination: { th: 'บ้านห้วยทราย', en: 'Huai Sai Village' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 58, meter: 'normal',
    radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'banknote', amountTHB: 100, note: { th: 'แบงก์ร้อยยับ ๆ กลิ่นเหล้าขาว', en: 'A crumpled hundred that smells of rice whisky.' } },
    smell: 'rice-whisky',
    extra: ['Pale, staggers, mumbles: looks like a ghost on purpose.', 'His breath fogs the side window in big blooms.', 'Car dips hard when he flops in.'],
  },
  specialRules: [
    { rule: 'r5', at: 0.62, note: 'Three knocks from the trunk while Piak sleeps. Do not stop for 25 s.' },
    { rule: 'r3', lookBack: 'warn' },
  ],
  encounters: [
    { id: 'wireCrawler', at: 0.14 },
    { id: 'yaiSpeed', at: 0.34 },
    { id: 'trunkKnocks', at: 0.62 },
    { id: 'somethingEnormous', at: 0.8, optional: true },
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: ['m_noodle'],
  pacing: { cruiseKmh: 45, minSeconds: 140, stretch: 'none' },
  dialogue: {
    hail: [
      P('เฮ้ย! แท็กซี่! หยุด ๆ ๆ', 'Oi! Taxi! Stop, stop, stop!', { tone: 'shout', action: 'hail' }),
      P('อึก... รอลุงด้วยยย', 'Hic... wait for meee...', { action: 'stagger' }),
    ],
    greet: [
      P('ฮิ้ว! รถเขียวเหลือง! เหมือนสมัยลุงยังหนุ่มเลย', 'Woo! A green-yellow cab! Just like when I was young!', { emotion: 'smile', action: 'laugh' }),
      P('ป้าเล็กไม่ยอมขายเหล้าให้ลุงแล้ว ใจร้ายจริง ๆ', "Auntie Lek won't sell me any more booze. So cruel."),
    ],
    destination: [
      P('ไปห้วยทราย... ไม่ใช่ ๆ... เออ ห้วยทรายนั่นแหละ', 'To Huai Sai... no, no... yeah. Huai Sai.'),
      P('เมียลุงรออยู่บ้าน... ถือไม้กวาดรอ', "My wife's waiting up... with a broom.", { emotion: 'fear' }),
    ],
    beats: [
      {
        id: 'song1',
        trigger: { type: 'progress', at: 0.05 },
        lines: [
          P('♪ น้ำตาหยดลง... กลางท้องนา... ♪', '♪ My tears fall down... into the paddy... ♪', { tone: 'sing', action: 'sing' }),
          P('ร้องเพราะไหมไอ้หนู ลุงเคยประกวดได้ที่สามนะ', 'Sounds good, eh, kid? I came third in a contest once.', { emotion: 'smile' }),
          P('...จากสามคน', '...out of three.', { pause: 0.5 }),
        ],
      },
      {
        id: 'wireThing',
        trigger: { type: 'event', event: 'encounter:wireCrawler' },
        lines: [
          P('นั่นอะไรบนสายไฟวะ... ลิงเหรอ', "What's that on the wires... a monkey?", { action: 'point' }),
          P('ช่างมัน ลุงเมา คืนนี้ลุงเห็นทุกอย่างแหละ', "Forget it. I'm drunk. I see everything tonight."),
        ],
      },
      {
        id: 'neverScared',
        trigger: { type: 'progress', at: 0.24 },
        lines: [
          P('รู้ไหม ลุงเห็นผีมาเยอะ ไม่เคยกลัวสักที', "You know, I've seen plenty of ghosts. Never once scared."),
          P('...เพราะเมาทุกที', '...because I was always drunk.', { emotion: 'smile', action: 'laugh' }),
        ],
      },
      {
        id: 'yaiSpeed',
        trigger: { type: 'event', event: 'yaiSpeed' },
        lines: [
          P('เฮ้ย ๆ ยายแก่วิ่งแซงรถ! เร็วกว่ารถอีก!', "Whoa! Granny's overtaking us! She's faster than the car!", { tone: 'shout', emotion: 'surprise', action: 'point' }),
          P('ยายครับ! จะไปไหนครับยาย!', "Granny! Where you off to, Granny?!", { tone: 'shout' }),
          P('...ไปแล้ว', '...gone.', { pause: 0.8 }),
          T('ผ่อนคันเร่ง... ปล่อยให้แกแซงไป', 'Ease off... let her pass.'),
        ],
      },
      {
        id: 'sleep',
        essential: true, // he must be asleep before the knocks (rule 5 at 0.62)
        trigger: { type: 'progress', at: 0.48 },
        lines: [
          P('ง่วงแล้ว... ขอลุงหลับแป๊บนะ', 'Sleepy... gonna rest my eyes a bit.', { action: 'sleep' }),
          P('ถึงแล้ว... ปลุก... ด้วย... ครอก...', 'Wake me... when we... zzz...', { set: { piakAsleep: true } }),
        ],
      },
      {
        id: 'knocks',
        trigger: { type: 'event', event: 'knock3' },
        lines: [
          T('เสียงเคาะ... ท้ายรถ... สามครั้ง', 'Knocking... from the trunk... three times.'),
          T('ห้ามจอด ห้ามจอดเด็ดขาด', "Don't stop. Whatever happens, don't stop."),
          P('ครอก... ฟี้...', 'Snrrk... fweee...', { tone: 'whisper' }),
        ],
      },
      {
        id: 'sleepTalk',
        trigger: { type: 'progress', at: 0.7 },
        if: { flag: { piakAsleep: true } },
        lines: [P('แม่... อย่าเปิดท้ายรถนะแม่...', "Mum... don't open the trunk, Mum...", { tone: 'whisper', emotion: 'fear' })],
      },
      {
        id: 'wakeUp',
        trigger: { type: 'progress', at: 0.86 },
        lines: [
          P('หือ? ถึงยัง... ฝันว่ามีคนเคาะท้ายรถ', "Huh? We there yet? Dreamt someone was knocking on the trunk.", { emotion: 'surprise', set: { piakAsleep: false } }),
          Y('...ฝันครับลุง', '...just a dream, Uncle.'),
        ],
      },
      {
        id: 'radioOn',
        trigger: { type: 'event', event: 'radioOn' },
        if: { flag: { piakAsleep: false } },
        lines: [P('เพลงนี้! เพลงนี้ลุงชอบ! เร่งเสียงเลย!', 'This song! I love this one! Turn it up!', { emotion: 'smile', action: 'sing' })],
      },
      {
        id: 'radioOff',
        trigger: { type: 'event', event: 'radioOff' },
        if: { flag: { piakAsleep: false } },
        lines: [P('เฮ้ย ปิดทำไม กำลังมันส์เลย', "Hey, why'd you kill it? It was just getting good.", { emotion: 'anger' })],
      },
      {
        id: 'lightOn',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('โอ๊ย แสบตา! ปิด ๆ ลุงหน้าโทรมอยู่', "Ow, my eyes! Off, off! I look a wreck.")],
      },
      {
        id: 'speeding',
        trigger: { type: 'event', event: 'speeding' },
        lines: [P('ขับเร็วงี้ ลุงจะอ้วกแล้วนะ...', "Drive like that and I'm gonna throw up...", { emotion: 'fear' })],
      },
      {
        id: 'windowOpen',
        trigger: { type: 'event', event: 'windowOpen' },
        lines: [P('เออ ดี ลมเย็น ๆ สร่างเมาหน่อย', 'Ahh, nice. Cool air sobers me up.')],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้วเหรอ ไวจัง', 'Here already? That was quick.'),
      P('นี่ร้อยนึง ไม่ต้องทอน... เอ๊ย ทอนด้วย ลุงไม่มีตังค์', "Here's a hundred. Keep the... no wait, I need change. I'm broke.", { action: 'pay', emotion: 'smile' }),
      P('ขอบใจนะไอ้หนู ขับดี ๆ ล่ะ', 'Thanks, kid. Drive safe.'),
    ],
    arriveWrong: [
      P('เฮ้ย... ทางนี้ไม่ใช่ทางบ้านลุงนี่', "Hey... this isn't the way to my place."),
      P('ทำไมหนาวจังวะ... ใครยืนอยู่ในหมอกน่ะ', "Why's it so cold... who's standing in the fog?", { emotion: 'fear' }),
      P('ไอ้หนู! ถอยรถ! ถอยเร็ว!', 'Kid! Reverse! Reverse, NOW!', { tone: 'shout', emotion: 'fear' }),
    ],
    idle: [
      P('อึก!', 'Hic!'),
      P('♪ ลาก่อนเด้อ... ควายเผือกของพี่... ♪', '♪ Farewell, my dear... my white buffalo... ♪', { tone: 'sing' }),
      P('ตอนหนุ่ม ๆ ลุงขับสิบล้อนะ รู้ไหม', 'When I was young I drove ten-wheelers, you know.'),
      P('ป้าเล็กแกใจดีนะ ให้ลุงกินก๋วยเตี๋ยวฟรี', 'Auntie Lek is kind, though. Gives me noodles for free.'),
    ],
    onLookBack: [P('มองหาอะไรข้างหลัง ลุงนั่งอยู่ข้างหน้านี่', "What're you looking for back there? I'm up front!", { emotion: 'surprise' })],
    onFaceGaze: [P('มองลุงทำไม ลุงหล่อเหรอ', 'Why you staring? Think I\'m handsome?', { emotion: 'smile', action: 'laugh' })],
  },
};
