// Ride 5 — 01:00 — คุณนวล Khun Nuan (GHOST, นางตานี, no reflection, feet float → LEFT).
// Surreal and calm. She speaks old-fashioned Thai (จ้ะ/จ๊ะ, พ่อหนุ่ม, เกวียน).
// Rule 11 (back of the paper): the meter rolls to ๔๔๔ — she tells you to stop and bow your head;
// something outside counts and asks how far YOU have got; after midnight it also knocks on the
// glass for a lighter (rule 14). Later a voice calls Ton's name (rule 7) and she warns him.
// Replies: cart (exposes her outdated detail), face (r4 lure), promise (never promise a ghost:
// it persists across loops as k.promisedNuan) + the encounters' own replies (444, knock, name).
import { P, C, O, SIL, tr } from '../lines.js';

export const RIDE_NUAN = {
  id: 'nuan',
  order: 5,
  hour: 25,
  pickup: 'bananaGrove',
  characterId: 'nuan',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearLeft',
  destination: { th: 'ท่าน้ำใต้ต้นกล้วยตานี', en: 'The landing under the tani banana tree' },
  clues: {
    reflection: 'none', shadow: false, breathFog: false, weightKg: 0, meter: 'oldDate',
    radioStatic: 0.4, blinks: false, feetFloat: true,
    payment: { type: 'leaves', amountTHB: 0, note: { th: 'ใบตองสด ๆ หนึ่งใบวางอยู่บนเบาะ', en: 'One fresh banana leaf, left on the seat.' } },
    smell: 'banana-sap',
    extra: ['Seen from the side window at pickup: her feet hover above the grass.', 'Outdated speech: calls the car a cart (เกวียน), asks about oxen.', 'The meter shows a date 70 years ago, then ๔๔๔.'],
  },
  specialRules: [
    { rule: 'r4', note: 'Temptation: "don\'t you want to see my face?" Reply "want" sets lure r4.' },
    { rule: 'r11', at: 0.3, note: 'Meter ๔๔๔: stop, head down, count; the voice outside asks "นับถึงไหนแล้ว" (answering = death).' },
    { rule: 'r14', at: 0.3, note: 'Chained from the 444 stop: something knocks and asks for a lighter. Window stays up.' },
    { rule: 'r7', at: 0.56, note: 'Name call outside; she tells you not to answer.' },
    { rule: 'r3', lookBack: 'death' },
  ],
  encounters: [
    { id: 'krasue', at: 0.15 },
    { id: 'meter444', at: 0.3 }, // chains windowKnock (after midnight)
    { id: 'nameCall', at: 0.56 },
    { id: 'krahang', at: 0.76 },
  ],
  deathOnWrong: 'windowAttack',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 160, stretch: 'fog' }, // the 444 stop eats ~20 s
  dialogue: {
    hail: [P('แวะรับฉันหน่อยได้ไหมจ๊ะ', 'Would you stop for me?', { tone: 'whisper', action: 'hail' })],
    greet: [
      P('ขอบใจจ้ะ พ่อหนุ่ม', 'Thank you, young man.', { emotion: 'smile' }),
      P('เธอกลับมาจริง ๆ ด้วย... ตามสัญญา', 'You really came back... as you promised.', { tone: 'whisper', emotion: 'smile', if: { flag: { 'k.promisedNuan': true } } }),
      P('หน้าเธอคุ้นจัง... เคยผ่านมาทางนี้หรือจ๊ะ', 'Your face is familiar... have you passed this way before?', { if: { loopsGte: 1, loopsLt: 3 } }),
      P('มาอีกแล้วหรือจ๊ะ... คืนนี้ก็ยังไม่ได้กลับบ้านสินะ', "Back again? ...Still haven't made it home tonight, then.", { emotion: 'smile', if: { loopsGte: 3 } }),
      P('เกวียนสมัยนี้ไม่ต้องใช้วัวลากแล้วหรือจ๊ะ', "Don't carts need oxen to pull them any more?", { emotion: 'surprise' }),
      C([
        O('car', 'นี่รถยนต์ครับ ไม่ใช่เกวียน', "It's a car, not a cart."),
        O('joke', 'วัวลาออกไปแล้วครับ', 'The oxen quit.'),
        SIL(),
      ], {
        id: 'nuan_cart',
        timeout: 7,
        setOnPick: { car: { 'clue.nuan.cart': true }, joke: tr('nuan', 'joke') },
        branches: {
          car: [
            P('รถ... ยนต์', 'A... motor car.', { emotion: 'surprise' }),
            P('โลกเปลี่ยนไปมากนะ ตอนฉันหลับ', 'The world has changed so much while I slept.', { tone: 'whisper' }),
          ],
          joke: [P('ฮิ ๆ พ่อหนุ่มนี่ปากหวาน', 'Hee hee, what a smooth talker.', { emotion: 'smile' })],
          silent: [P('ไม่เป็นไรจ้ะ... ฉันไม่ค่อยได้ออกไปไหน', "Never mind... I don't get out much.")],
        },
      }),
    ],
    destination: [
      P('ไปส่งฉันที่ท่าน้ำนะ ตรงต้นกล้วยตานีต้นใหญ่', 'Take me to the landing, by the big tani banana tree.'),
      P('...เมื่อก่อนตรงนั้นมีท่าน้ำ', '...there used to be a landing there.', { emotion: 'smile', pause: 1.0 }),
    ],
    beats: [
      {
        id: 'krasue',
        trigger: { type: 'event', event: 'encounter:krasue' },
        lines: [
          P('อย่าตกใจไปเลย นั่นแค่เพื่อนบ้านฉัน', "Don't be frightened. That's only my neighbour.", { emotion: 'smile' }),
          P('นางออกมาหากินตอนดึก ๆ ทุกคืนแหละ', 'She comes out to feed late every night.'),
        ],
      },
      {
        // r11: fired when the meter rolls to 444 (before the counting starts, which waits for the stop).
        id: 'meter444',
        trigger: { type: 'event', event: 'meter444' },
        lines: [
          P('ตัวเลขนั้น... หยุดรถเถอะจ้ะ', 'That number... stop the car.', { tone: 'whisper' }),
          P('ก้มหน้าไว้ อย่ามองกระจกบานไหนนะ', "Keep your head down. Don't look at any glass.", { tone: 'whisper' }),
        ],
      },
      {
        id: 'knockWarn',
        trigger: { type: 'event', event: 'encounter:windowKnock' },
        lines: [P('ตรงนั้นไม่มีใครสูบบุหรี่หรอกจ้ะ', "Nobody out there smokes, dear.", { tone: 'whisper' })],
      },
      {
        id: 'redMoon',
        trigger: { type: 'progress', at: 0.38 },
        lines: [P('คืนนี้พระจันทร์สีแดงนะ... เห็นไหมจ๊ะ', 'The moon is red tonight... do you see?')],
      },
      {
        id: 'seeMyFace',
        trigger: { type: 'progress', at: 0.42 },
        lines: [
          P('พ่อหนุ่มไม่อยากเห็นหน้าฉันหรือจ๊ะ', "Don't you want to see my face, young man?", { tone: 'whisper', emotion: 'creepy' }),
          P('ผู้ชายทุกคนอยากเห็นทั้งนั้นแหละ', 'Every man always did.', { emotion: 'smile' }),
          C([
            O('want', 'อยากเห็นครับ', 'I do.'), // the lure
            O('no', 'ไม่ล่ะครับ', "I'd rather not."),
            O('know', 'ผมรู้ว่าคุณเป็นใคร', 'I know what you are.', { if: { diedOn: 'nuan' } }),
            SIL(),
          ], {
            id: 'nuan_face',
            timeout: 7,
            setOnPick: { want: { lure: 'r4' }, no: tr('nuan', 'face'), know: tr('nuan', 'face') },
            branches: {
              want: [P('งั้นก็มองสิจ๊ะ... ใกล้ ๆ', 'Then look... closer.', { tone: 'whisper', emotion: 'creepy' })],
              no: [P('ฮึ... ใจแข็งจริง', 'Hm... what a strong heart.', { emotion: 'smile' })],
              know: [
                P('...รู้แล้วก็ดี', '...good, then you know.', { tone: 'whisper' }),
                P('คนที่รู้ ไม่เคยมองฉันนานหรอก', 'Those who know never look at me for long.', { emotion: 'smile' }),
              ],
              silent: [P('เงียบ... ก็แปลว่าอยาก', 'Silence... means yes.', { tone: 'whisper', emotion: 'creepy' })],
            },
          }),
        ],
      },
      {
        id: 'promise',
        essential: true,
        trigger: { type: 'progress', at: 0.48 },
        lines: [
          P('ฉันรอคนคนหนึ่งอยู่ใต้ต้นกล้วยมานานแล้ว', "I've waited under the banana tree for someone, a long time.", { emotion: 'sad' }),
          P('เขาสัญญาว่าจะกลับมา แล้วก็ไม่เคยกลับ', 'He promised he would come back. He never did.'),
          C([
            O('promise', 'ผมจะแวะมาหาครับ', "I'll come and visit."),
            O('reason', 'เขาคงมีเหตุผลครับ', 'He must have had his reasons.'),
            SIL(),
          ], {
            id: 'nuan_promise',
            timeout: 8,
            // never promise a ghost: k.* flags survive the loop. She remembers on every later night.
            setOnPick: { promise: { 'k.promisedNuan': true, ...tr('nuan', 'promise') } },
            branches: {
              promise: [
                P('สัญญาแล้วนะจ๊ะ...', "That's a promise, then...", { tone: 'whisper', emotion: 'smile' }),
                P('ฉันจะรอ', 'I will wait.', { tone: 'ghost' }),
              ],
              reason: [P('เจ็ดสิบปี... ยังไม่เคยได้ฟังสักคำ', 'Seventy years... and not one word of it.', { emotion: 'sad' })],
              silent: [P('ผู้ชายก็งี้แหละจ้ะ ไปแล้วไปลับ', 'Men are like that, dear. Gone is gone.', { emotion: 'sad' })],
            },
          }),
        ],
      },
      {
        // r7: the encounter's own reply ("ครับ?" / …) plays after her warning.
        id: 'nameCallWarn',
        trigger: { type: 'event', event: 'encounter:nameCall' },
        lines: [P('อย่าขานนะจ๊ะ... นั่นไม่ใช่แม่เธอ', "Don't answer... that isn't your mother.", { tone: 'whisper' })],
      },
      {
        id: 'nameCallIgnored',
        trigger: { type: 'event', event: 'nameCallIgnored' },
        lines: [P('เก่งมาก... ป่านี้ชอบเลียนเสียงคนที่เรารัก', 'Well done... this forest likes to borrow the voices we love.', { emotion: 'smile' })],
      },
      {
        id: 'light',
        trigger: { type: 'progress', at: 0.66 },
        lines: [P('ฉันไม่เคยหนักอะไรเลยนะ... จะนั่งตรงไหนก็ตาม', 'I never weigh anything... wherever I sit.', { tone: 'whisper' })],
      },
      {
        id: 'krahang',
        trigger: { type: 'event', event: 'encounter:krahang' },
        lines: [P('กระหังบินต่ำคืนนี้... ฝนคงไม่ตกแล้วล่ะ', 'The krahang flies low tonight... no more rain, then.')],
      },
      {
        id: 'incense',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [P('กลิ่นธูปลอยมาแล้ว... ใกล้ถึงแล้วสินะ', 'I smell incense... we must be nearly there.', { emotion: 'smile' })],
      },
      {
        id: 'radioOn',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [P('เสียงใครร้องอยู่ในกล่องนั่นจ๊ะ', 'Whose voice is singing inside that box?', { emotion: 'surprise' })],
      },
      {
        id: 'lightOn',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('ตะเกียงดวงนี้สว่างกว่าที่บ้านฉันเยอะเลย', 'This lamp is so much brighter than ours at home.')],
      },
    ],
    arriveCorrect: [
      P('ท่าน้ำของฉัน... อยู่ในหมอกนั่นเอง', 'My landing... there it is, in the mist.', { emotion: 'smile' }),
      P('ฉันวางใบตองไว้ให้นะจ๊ะ เป็นค่ารถ', "I've left you a banana leaf. For the fare."),
      P('อย่าลืมสัญญานะจ๊ะ', "Don't forget your promise.", { tone: 'whisper', if: { flag: { 'k.promisedNuan': true } } }),
      P('ขอให้เธอได้กลับบ้านนะ พ่อหนุ่ม', 'I hope you make it home, young man.', { tone: 'whisper' }),
    ],
    arriveWrong: [
      P('ทางนี้มีแต่บ้านคน... ไม่มีต้นกล้วยของฉัน', "This way there's only houses... not my banana tree."),
      P('เธอก็เหมือนเขา... ผิดสัญญา', "You're just like him... you broke your promise.", { emotion: 'anger', tone: 'ghost' }),
      P('หน้าต่างทุกบาน... มีพวกเราอยู่', 'Every window... has one of us.', { tone: 'ghost', emotion: 'creepy' }),
    ],
    idle: [
      P('ฮึม... ฮึม ฮึ... ฮึม...', 'Hm... hm-hm... hmm...', { tone: 'sing' }),
      P('ลมพัดใบกล้วยดังเหมือนคนกระซิบนะ', 'The wind in the banana leaves sounds like whispering.'),
      P('เธอทำงานกลางคืนทุกคืนเลยหรือจ๊ะ', 'Do you work every night?'),
      P('ดอกกล้วยบานตอนกลางคืน ไม่มีใครเห็นหรอก', 'Banana flowers open at night. Nobody ever sees.'),
    ],
    onLookBack: [P('หันมาทำไมจ๊ะ... ฉันอยู่ทุกที่แหละ', "Why turn round? I'm everywhere.", { tone: 'ghost', emotion: 'creepy' })],
    onFaceGazeWarn: [P('มองอีกนิดสิจ๊ะ... อีกนิดเดียว', 'Look a little longer... just a little.', { tone: 'whisper', emotion: 'smile' })],
    onFaceGaze: [P('ทีนี้... เธอต้องอยู่กับฉันใต้ต้นกล้วยแล้วนะ', "Now... you'll stay with me under the banana tree.", { tone: 'ghost', emotion: 'creepy' })],
  },
};
