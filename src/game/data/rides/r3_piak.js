// Ride 3 — 23:00 — ลุงเปี๊ยก Uncle Piak (HUMAN, looks creepy → RIGHT).
// Comic relief inside horror. Rule 5: three knocks from the trunk while he snores.
// Rule 15 (back of the paper): he asks for music, then the DJ says "ต้น…" — retune; answering is
// the break. Yai Speed may overtake. He sits up front so you can see him breathe on the glass.
// Replies: song, radioName (if it happens), ghosts, sleepy (+ "keep singing" once you've died here),
// wakeUp, fare.
import { P, S, C, O, SIL, tr } from '../lines.js';

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
    { rule: 'r15', at: 0.27, note: 'Only if the radio is on (he asks for music in greet): DJ Nok says "ต้น…". Retune within 5 s. Piak asks who she is calling; answering the radio is the break.' },
    { rule: 'r5', at: 0.62, note: 'Three knocks from the trunk while Piak sleeps. Do not stop for 25 s.' },
    { rule: 'r3', lookBack: 'warn' },
  ],
  encounters: [
    { id: 'wireCrawler', at: 0.2 },
    { id: 'radioName', at: 0.27, optional: true }, // requires the radio on
    { id: 'yaiSpeed', at: 0.42 },
    { id: 'trunkKnocks', at: 0.62 },
    { id: 'somethingEnormous', at: 0.84, optional: true },
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: ['m_noodle'],
  pacing: { cruiseKmh: 45, minSeconds: 120, stretch: 'none' },
  dialogue: {
    hail: [
      P('เฮ้ย! แท็กซี่! หยุด ๆ ๆ', 'Oi! Taxi! Stop, stop, stop!', { tone: 'shout', action: 'hail' }),
      P('อึก... รอลุงด้วยยย', 'Hic... wait for meee...', { action: 'stagger' }),
    ],
    greet: [
      P('ฮิ้ว! รถเขียวเหลือง! เหมือนสมัยลุงยังหนุ่มเลย', 'Woo! A green-yellow cab! Just like when I was young!', { emotion: 'smile', action: 'laugh' }),
      P('ป้าเล็กไม่ยอมขายเหล้าให้ลุงแล้ว ใจร้ายจริง ๆ', "Auntie Lek won't sell me any more booze. So cruel."),
      P('เปิดเพลงหน่อยไอ้หนู เงียบ ๆ ลุงกลัวผี', 'Put some music on, kid. Silence makes me scared of ghosts.', { emotion: 'smile' }),
    ],
    destination: [
      P('ไปห้วยทราย... ไม่ใช่ ๆ... เออ ห้วยทรายนั่นแหละ', 'To Huai Sai... no, no... yeah. Huai Sai.'),
      P('เมียลุงรออยู่บ้าน... ถือไม้กวาดรอ', "My wife's waiting up... with a broom.", { emotion: 'fear' }),
    ],
    loopVariants: {
      greet: {
        1: [
          P('ฮิ้ว! รถเขียวเหลือง!', 'Woo! A green-yellow cab!', { emotion: 'smile', action: 'laugh' }),
          P('เอ๊ะ ไอ้หนู... ลุงเคยนั่งรถเอ็งแล้วใช่ไหม', 'Hey, kid... have I ridden with you before?', { emotion: 'surprise' }),
          P('ช่างมัน ลุงเมา ลุงเห็นทุกอย่างซ้ำสองแหละ', "Ah, forget it. I'm drunk. I see everything twice.", { action: 'laugh' }),
          P('เปิดเพลงหน่อย', 'Put some music on.'),
        ],
        3: [
          P('ไอ้หนูคนเดิม! มาอีกแล้ว!', 'Same kid! Back again!', { emotion: 'smile', action: 'laugh' }),
          P('ลุงฝันถึงเอ็งทุกคืน... ฝันว่ามีคนเคาะท้ายรถ', 'I dream about you every night... someone knocking on the trunk.', { tone: 'whisper', emotion: 'fear' }),
          P('เปิดเพลงดัง ๆ เลย', 'Put the music on loud.'),
        ],
      },
    },
    beats: [
      {
        id: 'song1',
        trigger: { type: 'progress', at: 0.12 },
        lines: [
          P('♪ น้ำตาหยดลง... กลางท้องนา... ♪', '♪ My tears fall down... into the paddy... ♪', { tone: 'sing', action: 'sing' }),
          P('ร้องเพราะไหมไอ้หนู ลุงเคยประกวดได้ที่สามนะ', 'Sounds good, eh, kid? I came third in a contest once.', { emotion: 'smile' }),
          C([
            O('good', 'เพราะครับลุง', 'Lovely, Uncle.'),
            O('honest', 'ก็... พอได้ครับ', "Well... it's alright."),
            SIL(),
          ], {
            id: 'piak_song',
            timeout: 6,
            setOnPick: { good: tr('piak', 'song'), honest: tr('piak', 'song') },
            branches: {
              good: [P('เห็นไหม! ...จากสามคนนะ', 'See? ...out of three, mind you.', { emotion: 'smile', action: 'laugh' })],
              honest: [P('พอได้ก็พอแล้ว... แข่งสามคน ได้ที่สาม', "Alright's enough... three in the contest, I came third.", { action: 'laugh' })],
              silent: [P('...จากสามคน', '...out of three.', { pause: 0.5 })],
            },
          }),
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
        // r15: the radio says your name. This beat owns the reply (the encounter's own choice is skipped).
        id: 'radioName',
        trigger: { type: 'event', event: 'encounter:radioName' },
        lines: [
          P('เฮ้ย... ดีเจเรียกชื่อใครวะ', "Whoa... whose name is the DJ calling?", { emotion: 'surprise' }),
          C([O('answer', 'ครับ?', 'Yes?'), SIL()], {
            id: 'piak_radioName',
            timeout: 5,
            setOnPick: { answer: { ruleBreak: 'r15' } },
            branches: {
              answer: [
                S('voice', '...ได้ยินแล้ว', '...I heard you.', { tone: 'whisper' }),
                P('เอ็ง... ตอบวิทยุทำไมวะ', 'Why... why did you answer the radio?', { tone: 'whisper', emotion: 'fear' }),
              ],
              silent: [P('ขนลุกว่ะ... เปลี่ยนคลื่นเถอะไอ้หนู', 'Gives me the creeps... change the station, kid.', { tone: 'whisper', emotion: 'fear' })],
            },
          }),
        ],
      },
      {
        id: 'neverScared',
        trigger: { type: 'progress', at: 0.32 },
        lines: [
          P('รู้ไหม ลุงเห็นผีมาเยอะ ไม่เคยกลัวสักที', "You know, I've seen plenty of ghosts. Never once scared."),
          C([
            O('really', 'จริงเหรอครับ', 'Really?'),
            O('tonight', 'คืนนี้ผมก็เห็นครับ', 'I saw some tonight.'),
            SIL(),
          ], {
            id: 'piak_ghosts',
            timeout: 6,
            setOnPick: { tonight: tr('piak', 'ghosts') },
            branches: {
              really: [P('จริง! ...เพราะเมาทุกที', 'Really! ...because I was always drunk.', { emotion: 'smile', action: 'laugh' })],
              tonight: [
                P('...เห็นอะไร', '...saw what?', { emotion: 'fear' }),
                P('ไม่ต้องเล่า! ลุงยังเมาไม่พอ', "Don't tell me! I'm not drunk enough.", { emotion: 'fear', action: 'laugh' }),
              ],
              silent: [P('...เพราะเมาทุกที', '...because I was always drunk.', { emotion: 'smile', action: 'laugh' })],
            },
          }),
        ],
      },
      {
        id: 'yaiSpeed',
        trigger: { type: 'event', event: 'yaiSpeed' },
        lines: [
          P('เฮ้ย ๆ ยายแก่วิ่งแซงรถ! เร็วกว่ารถอีก!', "Whoa! Granny's overtaking us! She's faster than the car!", { tone: 'shout', emotion: 'surprise', action: 'point' }),
          P('ยายครับ! จะไปไหนครับยาย!', 'Granny! Where you off to, Granny?!', { tone: 'shout' }),
          P('...ไปแล้ว', '...gone.', { pause: 0.8 }),
        ],
      },
      {
        id: 'sleepy',
        essential: true, // he must be asleep (or singing) before the knocks (rule 5 at 0.62)
        trigger: { type: 'progress', at: 0.5 },
        lines: [
          P('ง่วงแล้ว... ขอลุงหลับแป๊บนะ', 'Sleepy... gonna rest my eyes a bit.', { action: 'sleep' }),
          C([
            O('sleep', 'หลับเถอะครับลุง', 'Get some sleep, Uncle.'),
            // learned from dying here: keep him awake and singing through the knocks
            O('sing', 'ร้องเพลงต่อสิครับลุง', 'Keep singing, Uncle.', { if: { diedOn: 'piak' } }),
            SIL(),
          ], {
            id: 'piak_sleepy',
            timeout: 6,
            setOnPick: { sleep: { piakAsleep: true }, sing: { piakAsleep: false, piakSinging: true, ...tr('piak', 'stayed') }, silent: { piakAsleep: true } },
            branches: {
              sleep: [P('ถึงแล้ว... ปลุก... ด้วย... ครอก...', 'Wake me... when we... zzz...')],
              sing: [
                P('ได้เลย! คอนเสิร์ตส่วนตัว!', 'You got it! Private concert!', { emotion: 'smile', action: 'sing' }),
                P('♪ ลาก่อนเด้อนาง... ลาก่อนควายเผือก... ♪', '♪ Farewell, my girl... farewell, my white buffalo... ♪', { tone: 'sing' }),
              ],
              silent: [P('ครอก... ฟี้...', 'Snrrk... fweee...', { tone: 'whisper' })],
            },
          }),
        ],
      },
      {
        id: 'knocks',
        trigger: { type: 'event', event: 'knock3' },
        lines: [
          P('ครอก... ฟี้...', 'Snrrk... fweee...', { tone: 'whisper', if: { flag: { piakSinging: false } } }),
          P('♪ ใครเคาะวะ... ช่างมัน! ♪', "♪ Who's knocking... who cares! ♪", { tone: 'sing', if: { flag: { piakSinging: true } } }),
          P('อย่าจอดนะไอ้หนู ลุงยังร้องไม่จบ', "Don't you stop, kid. I'm not done singing.", { if: { flag: { piakSinging: true } } }),
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
        trigger: { type: 'progress', at: 0.8 },
        if: { flag: { piakSinging: false } },
        lines: [
          P('หือ? ถึงยัง... ฝันว่ามีคนเคาะท้ายรถ', 'Huh? We there yet? Dreamt someone was knocking on the trunk.', { emotion: 'surprise', set: { piakAsleep: false } }),
          C([
            O('dream', 'ฝันครับลุง', 'Just a dream, Uncle.'),
            O('real', 'ไม่ได้ฝันครับ', "It wasn't a dream."),
            SIL(),
          ], {
            id: 'piak_wake',
            timeout: 6,
            setOnPick: { real: tr('piak', 'truth') },
            branches: {
              dream: [P('เออ ฝัน ๆ... ดีแล้ว', 'Yeah, a dream... good.')],
              real: [
                P('ลุงสร่างเมาเลยเนี่ย', "That's sobered me right up.", { emotion: 'fear' }),
                P('ขับต่อไป อย่าจอดนะ', "Keep driving. Don't stop.", { tone: 'whisper' }),
              ],
              silent: [P('ไม่ตอบแบบนี้ ลุงกลัวนะเว้ย', "Don't go quiet on me, I'm scared, damn it.", { emotion: 'fear' })],
            },
          }),
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
        lines: [P('โอ๊ย แสบตา! ปิด ๆ ลุงหน้าโทรมอยู่', 'Ow, my eyes! Off, off! I look a wreck.')],
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
      P('นี่ร้อยนึง... ทอนด้วยนะ ลุงไม่มีตังค์', "Here's a hundred... give me change, I'm skint.", { action: 'pay' }),
      C([
        O('free', 'ไม่ต้องจ่ายครับลุง', 'No charge, Uncle.'),
        O('change', 'ทอนให้ครับ', "Here's your change."),
        SIL(),
      ], {
        id: 'piak_fare',
        timeout: 6,
        setOnPick: { free: tr('piak', 'fare') },
        branches: {
          free: [
            P('จริงเหรอ! ใจดีเหมือนคนขับคันเขียวเหลืองคนเก่าเลย', 'Really? Kind as the old green-yellow cab driver!', { emotion: 'smile' }),
            P('เขาก็ไม่เคยเก็บตังค์ลุง', 'He never took my money either.'),
          ],
          change: [P('ขอบใจ ๆ ขับดี ๆ ล่ะไอ้หนู', 'Thanks, thanks. Drive safe, kid.')],
          silent: [P('ขอบใจนะไอ้หนู ขับดี ๆ ล่ะ', 'Thanks, kid. Drive safe.')],
        },
      }),
    ],
    arriveWrong: [
      P('เฮ้ย... ทางนี้ไม่ใช่ทางบ้านลุงนี่', "Hey... this isn't the way to my place."),
      P('ทำไมหนาวจังวะ... ใครยืนอยู่ในหมอกน่ะ', "Why's it so cold... who's standing in the fog?", { emotion: 'fear' }),
      P('ไอ้หนู! ถอยรถ! ถอยเร็ว!', 'Kid! Reverse! Reverse, NOW!', { tone: 'shout', emotion: 'fear' }),
    ],
    idle: [
      P('อึก!', 'Hic!'),
      P('♪ ลาก่อนเด้อนาง... ลาก่อนควายเผือก... ♪', '♪ Farewell, my girl... farewell, my white buffalo... ♪', { tone: 'sing' }),
      P('ตอนหนุ่ม ๆ ลุงขับสิบล้อนะ รู้ไหม', 'When I was young I drove ten-wheelers, you know.'),
      P('ป้าเล็กแกใจดีนะ ให้ลุงกินก๋วยเตี๋ยวฟรี', 'Auntie Lek is kind, though. Gives me noodles for free.'),
    ],
    onLookBack: [P('มองหาอะไรข้างหลัง ลุงนั่งอยู่ข้างหน้านี่', "What're you looking for back there? I'm up front!", { emotion: 'surprise' })],
    onFaceGaze: [P('มองลุงทำไม ลุงหล่อเหรอ', "Why you staring? Think I'm handsome?", { emotion: 'smile', action: 'laugh' })],
  },
};
