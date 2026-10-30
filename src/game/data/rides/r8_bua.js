// Ride 8 — 04:00 — ยายบัว Grandma Bua, 80, flower-garland seller (HUMAN → RIGHT).
// Dawn phase begins (blue hour). Emotional: she knew Somchai ("ไอ้ชาย") and recognises
// the taxi. She gives Ton a garland for the dashboard. Elephant family crossing.
import { P, Y, T, C } from '../lines.js';

export const RIDE_BUA = {
  id: 'bua',
  order: 8,
  hour: 28,
  pickup: 'marketLamp',
  characterId: 'bua',
  identity: 'human',
  fork: 'right',
  seat: 'rearLeft',
  destination: { th: 'ตลาดเช้าห้วยทราย', en: 'Huai Sai morning market' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 42, meter: 'normal',
    radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'coins', amountTHB: 40, note: { th: 'เหรียญบาทกับเหรียญห้า นับทีละเหรียญ', en: 'One- and five-baht coins, counted one by one.' } },
    smell: 'marigold-jasmine',
    extra: ['Knees crack when she sits; car dips a little.', 'Present-day details: the market opens at five, her granddaughter sells online.'],
  },
  specialRules: [
    { rule: 'r3', lookBack: 'warn' },
    { rule: 'r10', note: 'She wai\'s the shrine as you pass.' },
  ],
  encounters: [
    { id: 'elephants', at: 0.34 },
    { id: 'fireflies', at: 0.12, optional: true },
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: ['m_photo', 'm_helmet'],
  gives: { item: 'garland', flag: 'garland', at: 'beat:garland' },
  dialogue: {
    hail: [P('พ่อคุณ... จอดให้ยายหน่อยลูก', 'Dear boy... stop for Grandma, love.', { action: 'hail' })],
    greet: [
      P('ขอบใจจ้ะลูก ยายเดินไม่ไหวแล้ว', "Thank you, love. Grandma's legs have given up.", { action: 'enterCar' }),
      P('ขึ้นรถทีไร เข่าลั่นทุกที', 'Every time I get in a car, my knees crack.', { emotion: 'smile' }),
      P('เอ๊ะ... รถคันนี้', 'Hm... this car...', { emotion: 'surprise', pause: 0.8 }),
      P('เหมือนรถไอ้ชายเลย', "It's just like Chai's car."),
    ],
    destination: [P('ไปตลาดเช้าห้วยทรายนะลูก ยายขายพวงมาลัย', 'To the morning market at Huai Sai, love. I sell garlands.')],
    beats: [
      {
        id: 'chai',
        trigger: { type: 'progress', at: 0.08 },
        lines: [
          P('ไอ้ชายมันขับแท็กซี่สีนี้แหละ มาซื้อมาลัยยายทุกเช้า', 'Chai drove a cab this colour. Bought my garlands every morning.'),
          P('พวงละยี่สิบ ให้ยายห้าสิบ ไม่เคยเอาทอน', 'Twenty baht a garland, he\'d hand me fifty. Never took change.', { emotion: 'smile' }),
          T('ไอ้ชาย... พ่อ', 'Chai... Dad.'),
        ],
      },
      {
        id: 'hisSon',
        trigger: { type: 'progress', at: 0.2 },
        lines: [
          P('มันชอบเอามาลัยแขวนหน้ารถ บอกว่าให้ลูกชายแคล้วคลาด', 'He hung it by the mirror. Said it was to keep his son safe.'),
          P('ลูกชายมันไปอยู่กรุงเทพฯ ไม่เคยกลับมาเลย', 'His son went off to Bangkok. Never came back.', { emotion: 'sad' }),
          C([
            { key: 'me', th: '...ผมเองครับยาย', en: "...that's me, Grandma." },
            { key: 'silent', th: '(เงียบ)', en: '(say nothing)' },
          ], {
            timeout: 8,
            defaultKey: 'silent',
            setOnPick: { me: { buaKnowsTon: true } },
            branches: {
              me: [
                P('ห๊ะ... ต้นเหรอ ไอ้ต้นลูกไอ้ชาย', 'Eh... Ton? Chai\'s boy, Ton?', { emotion: 'surprise' }),
                P('โตเป็นหนุ่มแล้ว... หน้าเหมือนพ่อเปี๊ยบเลย', 'All grown up... the spitting image of your dad.', { emotion: 'smile' }),
              ],
              silent: [
                P('เด็กสมัยนี้ก็งี้แหละ ใจร้อน', 'Young ones are like that. Hot-headed.'),
                P('แต่ไอ้ชายมันไม่เคยโกรธลูกเลยนะ', 'But Chai was never angry with his boy. Never.', { emotion: 'sad' }),
              ],
            },
          }),
        ],
      },
      {
        id: 'elephants',
        trigger: { type: 'event', event: 'elephants' },
        lines: [
          P('อุ๊ย ช้าง! จอดก่อนลูก จอด ๆ', 'Oh! Elephants! Stop, love, stop!', { emotion: 'surprise', action: 'point' }),
          P('ให้แม่ลูกเขาข้ามไปก่อน', 'Let the mother and her baby cross first.'),
          P('ดูลูกช้างสิ เดินตามแม่ต้อย ๆ', 'Look at the little one, trotting right behind its mum.', { emotion: 'smile' }),
          P('ลูกเดินหลงไปไกลแค่ไหน ก็ต้องมีคนรอ', 'However far a child wanders, someone is always waiting.', { pause: 1.0 }),
        ],
      },
      {
        id: 'garland',
        trigger: { type: 'progress', at: 0.52 },
        lines: [
          P('นี่ ยายให้พวงมาลัย เอาไปแขวนหน้ารถ', "Here. Grandma's giving you a garland. Hang it up front.", { action: 'giveItem' }),
          P('แทนพวงของไอ้ชายมันนะลูก', 'In place of Chai\'s, love.', { emotion: 'sad' }),
          Y('ขอบคุณครับยาย', 'Thank you, Grandma.', { action: 'wai' }),
        ],
        set: { garland: true },
        effects: [{ type: 'item', id: 'garland', to: 'dashboard' }],
      },
      {
        id: 'blueHour',
        trigger: { type: 'progress', at: 0.66 },
        lines: [P('ฟ้าเริ่มสางแล้ว... ไก่ขันแล้ว ได้ยินไหม', 'The sky\'s getting pale... hear the roosters?', { emotion: 'smile' })],
      },
      {
        id: 'funeral',
        trigger: { type: 'progress', at: 0.78 },
        lines: [
          P('ไอ้ชายมันเสียตอนหน้าฝน ตรงโค้งนั่นแหละ', 'Chai died in the rains. On that curve back there.', { emotion: 'sad' }),
          P('งานศพมันน่ะ... ลูกชายมันไม่มา', 'At his funeral... his son never came.'),
          P('แต่มันบอกยายตลอด ว่าลูกมันต้องกลับมา', 'But he always told me his boy would come home.', { tone: 'whisper', pause: 1.5 }),
        ],
      },
      {
        id: 'wai',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [P('ถึงศาลแล้ว ยายขอไหว้เจ้าพ่อหน่อย', 'The shrine. Let Grandma pay her respects.', { action: 'wai' })],
      },
      {
        id: 'lightOn',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('เปิดไฟดีแล้ว ยายจะได้นับเหรียญ', 'Good, a light. Now I can count my coins.')],
      },
      {
        id: 'speeding',
        trigger: { type: 'event', event: 'speeding' },
        lines: [P('ช้า ๆ ลูก กระดูกยายจะหลุดแล้ว', 'Slowly, love. My old bones are rattling loose.', { emotion: 'fear' })],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้ว... ขอบใจนะลูก', 'Here we are... thank you, love.', { emotion: 'smile' }),
      P('นี่สี่สิบบาท ยายนับแล้ว ครบนะ', "Forty baht. I counted. It's all there.", { action: 'pay' }),
      P('ว่าง ๆ ไปหาพ่อเอ็งบ้างนะลูก ที่วัดก็ยังดี', 'Go and see your dad sometime, love. Even just at the temple.', { emotion: 'sad' }),
    ],
    arriveWrong: [
      P('ลูก... ทางนี้มันทางไปป่าช้านะ', 'Love... this road goes to the graveyard.', { emotion: 'fear' }),
      P('ยายยังไม่อยากไปหาไอ้ชายตอนนี้...', "Grandma's not ready to go and join Chai yet..."),
      P('ในหมอกนั่น... มืออะไรน่ะลูก', "In the fog... what is that hand, love?", { tone: 'whisper', emotion: 'fear' }),
    ],
    idle: [
      P('ยายขายมาลัยมาห้าสิบปีแล้วนะ', "I've sold garlands for fifty years."),
      P('มะลิปีนี้ดอกเล็ก ฝนน้อย', 'Jasmine\'s small this year. Not enough rain.'),
      P('ลูกกินข้าวมาหรือยัง', 'Have you eaten yet, love?'),
      P('หลานยายมันขายมาลัยทางโทรศัพท์ ยายงงไปหมด', 'My granddaughter sells garlands on her phone now. Baffles me.', { emotion: 'smile' }),
    ],
    onLookBack: [P('หันมาทำไมลูก ยายยังอยู่ ไม่หายไปไหนหรอก', "Why turn round, love? Grandma's still here.", { emotion: 'smile' })],
    onFaceGaze: [P('มองหน้ายายทำไม ยายแก่แล้ว ไม่สวยแล้ว', "Why look at me? Grandma's old, not pretty any more.", { emotion: 'smile', action: 'laugh' })],
  },
};
