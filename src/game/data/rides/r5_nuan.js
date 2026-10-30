// Ride 5 — 01:00 — คุณนวล Khun Nuan (GHOST, นางตานี, no reflection, feet float → LEFT).
// Surreal and calm. She speaks old-fashioned Thai (จ้ะ/จ๊ะ, พ่อหนุ่ม, เกวียน). Krasue drifts
// through the banana trees; a voice outside calls Ton's name (rule 7) and she warns him.
import { P, Y, T } from '../lines.js';

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
    extra: ['Seen from the side window at pickup: her feet hover above the grass.', 'Outdated speech: calls the car a cart (เกวียน), asks about oxen.', 'The meter shows a date 70 years ago.'],
  },
  specialRules: [
    { rule: 'r4', note: 'Temptation: "don\'t you want to see my face?" Face-gaze timer active.' },
    { rule: 'r7', at: 0.52, note: 'Name call outside; she tells you not to answer.' },
    { rule: 'r3', lookBack: 'death' },
  ],
  encounters: [
    { id: 'krasue', at: 0.18 },
    { id: 'nameCall', at: 0.52 },
    { id: 'krahang', at: 0.72 },
  ],
  deathOnWrong: 'windowAttack',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 130, stretch: 'fog' },
  dialogue: {
    hail: [P('แวะรับฉันหน่อยได้ไหมจ๊ะ', 'Would you stop for me?', { tone: 'whisper', action: 'hail' })],
    greet: [
      T('เท้าเธอ... ไม่แตะพื้น', "Her feet... aren't touching the ground."),
      P('ขอบใจจ้ะ พ่อหนุ่ม', 'Thank you, young man.', { emotion: 'smile' }),
      P('เกวียนสมัยนี้ไม่ต้องใช้วัวลากแล้วหรือจ๊ะ', "Don't carts need oxen to pull them any more?", { emotion: 'surprise' }),
    ],
    destination: [
      P('ไปส่งฉันที่ท่าน้ำนะ ตรงต้นกล้วยตานีต้นใหญ่', 'Take me to the landing, by the big tani banana tree.'),
      T('แถวนี้ไม่มีท่าน้ำ', "There's no landing round here."),
      P('มีสิจ๊ะ... เมื่อก่อนมี', 'There is... there used to be.', { emotion: 'smile', pause: 1.0 }),
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
        id: 'redMoon',
        trigger: { type: 'progress', at: 0.27 },
        lines: [P('คืนนี้พระจันทร์สีแดงนะ... เห็นไหมจ๊ะ', 'The moon is red tonight... do you see?')],
      },
      {
        id: 'meterOldDate',
        trigger: { type: 'event', event: 'meterGlitch' },
        lines: [T('มิเตอร์ขึ้นวันที่... เจ็ดสิบปีก่อน', 'The meter shows a date... seventy years ago.')],
      },
      {
        id: 'seeMyFace',
        trigger: { type: 'progress', at: 0.32 },
        lines: [
          P('พ่อหนุ่มไม่อยากเห็นหน้าฉันหรือจ๊ะ', "Don't you want to see my face, young man?", { tone: 'whisper', emotion: 'creepy' }),
          P('ผู้ชายทุกคนอยากเห็นทั้งนั้นแหละ', 'Every man always did.', { emotion: 'smile' }),
          T('ในกระจก... เบาะว่าง ห้ามมองหน้าเธอ', "The mirror... empty seat. Don't look at her face."),
        ],
      },
      {
        id: 'promise',
        essential: true,
        trigger: { type: 'progress', at: 0.43 },
        lines: [
          P('ฉันรอคนคนหนึ่งอยู่ใต้ต้นกล้วยมานานแล้ว', "I've waited under the banana tree for someone, a long time.", { emotion: 'sad' }),
          P('เขาสัญญาว่าจะกลับมา แล้วก็ไม่เคยกลับ', 'He promised he would come back. He never did.'),
        ],
      },
      {
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
        trigger: { type: 'progress', at: 0.62 },
        lines: [P('ฉันไม่เคยหนักอะไรเลยนะ... จะนั่งตรงไหนก็ตาม', 'I never weigh anything... wherever I sit.', { tone: 'whisper' })],
      },
      {
        id: 'krahang',
        trigger: { type: 'event', event: 'encounter:krahang' },
        lines: [
          P('กระหังบินต่ำคืนนี้... ฝนคงไม่ตกแล้วล่ะ', 'The krahang flies low tonight... no more rain, then.'),
          Y('...ครับ', '...right.'),
        ],
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
