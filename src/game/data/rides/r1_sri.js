// Ride 1 — 21:00 — ป้าศรี Auntie Sri (HUMAN → RIGHT). Schema: ../SCHEMA.md "Passenger".
// Dread phase. She teaches the clue language without knowing it (breath fog on the glass,
// the car sinks when she sits, her reflection, coins) and tells the legend of ยายสปีด.
import { P, Y, C } from '../lines.js';

export const RIDE_SRI = {
  id: 'sri',
  order: 1,
  hour: 21,
  pickup: 'sala1',
  characterId: 'sri',
  identity: 'human',
  fork: 'right',
  seat: 'rearLeft',
  destination: { th: 'บ้านห้วยทราย', en: 'Huai Sai Village' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 74, meter: 'normal',
    radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'coins', amountTHB: 85, note: { th: 'เหรียญสิบกับเหรียญห้า อุ่น ๆ จากมือ', en: 'Tens and fives, still warm from her hand.' } },
    smell: 'jasmine-fresh',
  },
  specialRules: [
    { rule: 'r1', note: 'First pickup; the tutorial already stopped you here.' },
    { rule: 'r10', note: 'She asks you to honk at the shrine approach; reward line on honkShrine.' },
    { rule: 'r3', lookBack: 'warn', note: 'Human passenger: looking back only earns a scolding.' },
  ],
  encounters: [
    { id: 'treeWatcher', at: 0.3 },
    { id: 'salaShadows', at: 0.61, optional: true }, // passing sala2
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: [],
  // Long first ride (sala1 → fork ≈ 2.8 km): no stretching needed. See SCHEMA.md "Pacing".
  pacing: { cruiseKmh: 45, minSeconds: 150, stretch: 'none' },
  dialogue: {
    hail: [P('แท็กซี่! แท็กซี่จ้ะ! จอดก่อน!', 'Taxi! Taxi, dear! Stop!', { tone: 'shout', action: 'hail' })],
    greet: [
      P('โอ๊ย ขอบใจนะหนุ่ม นึกว่าจะไม่มีรถผ่านแล้ว', 'Oh, thank you, dear. I thought no car would ever come.', { emotion: 'smile', action: 'enterCar' }),
      P('ยืนรอตั้งชั่วโมง ยุงกัดจนพรุนไปหมด', 'Stood there an hour. Mosquitoes ate me alive.', { pause: 0.4 }),
    ],
    destination: [
      P('ไปบ้านห้วยทรายจ้ะ เลยศาลเจ้าไปทางขวานะ', 'Huai Sai Village, dear. Past the shrine, keep right.'),
      P('กดมิเตอร์ด้วยนะ ป้าไม่เอาเหมา', 'Turn the meter on, okay? No flat fares for me.', { emotion: 'smile' }),
    ],
    beats: [
      {
        id: 'meterNag',
        trigger: { type: 'event', event: 'meterOffTooLong' },
        lines: [P('หนุ่ม มิเตอร์ล่ะ ลืมกดหรือเปล่า', 'Dear, the meter? Did you forget?')],
      },
      {
        id: 'newFace',
        trigger: { type: 'progress', at: 0.06 },
        lines: [
          P('หนุ่มเพิ่งมาขับแถวนี้ใช่ไหม หน้าไม่คุ้นเลย', "You're new round here, aren't you? Don't know your face."),
          Y('ครับ คืนแรก', 'Yeah. First night.'),
          P('ตายแล้ว คืนแรกก็โดนเส้นนี้เลยเหรอ', 'Oh dear. First night and they gave you this road?', { emotion: 'fear' }),
        ],
      },
      {
        id: 'yaiSpeedLegend',
        essential: true, // the legend must be heard before ride 3's Yai Speed encounter
        trigger: { type: 'progress', at: 0.14 },
        lines: [
          P('รู้จักยายสปีดไหม', 'Ever heard of Yai Speed?'),
          C([
            { key: 'yes', th: 'เคยได้ยินครับ', en: "I've heard the name." },
            { key: 'no', th: 'ไม่ครับ', en: 'No.' },
          ], { id: 'sri_yaiSpeed', timeout: 6, defaultKey: 'no', branches: { yes: [P('ได้ยินแค่ชื่อไม่พอหรอก ฟังป้าให้ดี', "Hearing the name isn't enough. Listen.")] } }),
          P('ผียายแก่ ๆ วิ่งตามรถตอนกลางคืน', 'An old granny ghost. Chases cars at night.', { tone: 'whisper' }),
          P('ขับเร็วแค่ไหนแกก็วิ่งทัน ขาแกไม่เหมือนขาคน', "However fast you go, she keeps up. Her legs aren't human legs."),
          P('ถ้าเจอนะ ผ่อนคันเร่ง ปล่อยให้แกแซงไป', 'If you see her, ease off. Let her pass.'),
          P('อย่าไปจ้องหน้าแก แล้วอย่าไปแข่งกับแกเด็ดขาด', "Don't stare at her face. And never, ever race her."),
          P('ไอ้ทิดแดงข้างบ้านป้าไปแข่งกับแก... รถคว่ำเลย', 'Thit Daeng next door raced her once... flipped his truck.', { emotion: 'fear', pause: 0.6 }),
        ],
      },
      {
        id: 'treeWatcherReact',
        trigger: { type: 'event', event: 'encounter:treeWatcher' },
        lines: [
          P('หนุ่ม... เมื่อกี้เห็นอะไรในป่าไหม', 'Dear... did you see something in the trees just now?', { tone: 'whisper', emotion: 'fear' }),
          P('อย่าหันไปดูนะ ขับไปเรื่อย ๆ', "Don't look. Just keep driving.", { tone: 'whisper' }),
        ],
      },
      {
        id: 'jasmine',
        trigger: { type: 'progress', at: 0.38 },
        lines: [
          P('มาลัยมะลิพวกนี้ ป้าร้อยเองทั้งเย็นเลยนะ', 'I strung all these jasmine garlands myself. All evening.', { emotion: 'smile' }),
          P('พรุ่งนี้เช้าเอาไปขายที่ตลาด พวงละยี่สิบ', "Tomorrow morning they go to market. Twenty baht each."),
        ],
      },
      {
        id: 'greenYellowTaxi',
        trigger: { type: 'progress', at: 0.5 },
        lines: [
          P('เมื่อก่อนมีแท็กซี่เขียวเหลืองวิ่งเส้นนี้คันนึง', 'There used to be a green-yellow cab on this road.'),
          P('คนขับใจดีมาก ไม่เคยโกงมิเตอร์ป้าเลย', 'Lovely driver. Never once fiddled my fare.', { emotion: 'smile' }),
          P('แต่ได้ข่าวว่า... เอ้อ ช่างมันเถอะ', 'But I heard that... oh, never mind.', { emotion: 'sad', pause: 0.8 }),
        ],
      },
      {
        id: 'foggedGlass',
        trigger: { type: 'progress', at: 0.62 },
        lines: [
          P('หนาวจัง กระจกฝ้าหมดแล้ว มองไม่เห็นอะไรเลย', "So cold. My window's all fogged, can't see a thing.", { action: 'reachOut' }),
          P('ลูกสาวป้าโทรตามแล้วเนี่ย ห่วงแม่จะแย่', "My daughter's calling again. Worried sick about her mum."),
        ],
      },
      {
        id: 'honkAsk',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [P('ใกล้ศาลแล้ว บีบแตรขอทางเจ้าที่ด้วยนะหนุ่ม', 'Nearly at the shrine. Honk to ask the spirits for passage, dear.')],
      },
      {
        id: 'honkThanks',
        trigger: { type: 'event', event: 'honkShrine' },
        lines: [P('ดีมาก เด็กดี เจ้าที่ท่านเอ็นดูแน่', "Good boy. The spirits will take a liking to you.", { emotion: 'smile' })],
      },
      {
        id: 'radioOn',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [P('เออ ดี มีเสียงเพลงค่อยหายกลัวหน่อย', 'Oh good. A bit of music helps with the fear.')],
      },
      {
        id: 'lightOn',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('เปิดไฟทำไมหนุ่ม ป้ายังไม่ได้แต่งหน้าเลย', "Why the light, dear? I haven't done my face!", { emotion: 'smile', action: 'laugh' })],
      },
      {
        id: 'speeding',
        trigger: { type: 'event', event: 'speeding' },
        lines: [P('ช้า ๆ หน่อยหนุ่ม ป้ายังไม่อยากเจอยายสปีด', "Slow down, dear. I'm not ready to meet Yai Speed.", { emotion: 'fear' })],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้ว ๆ ขอบใจมากนะหนุ่ม', 'Here we are. Thank you so much, dear.', { emotion: 'smile', action: 'pay' }),
      P('นี่จ้ะ แปดสิบห้า ไม่ต้องทอนนะ', "Here, eighty-five. Keep the change."),
      P('ขับดี ๆ ล่ะ อย่าลืมบีบแตรผ่านศาลนะลูก', "Drive safe now. Don't forget to honk at the shrines, love."),
    ],
    arriveWrong: [
      P('หนุ่ม... นี่มันทางซ้ายนะ', 'Dear... this is the left road.', { emotion: 'fear' }),
      P('ทางนี้มันทางคนตาย! กลับรถเดี๋ยวนี้!', "This is the road of the dead! Turn round, now!", { tone: 'shout', emotion: 'fear' }),
      P('ทำไมหมอกมันหนาขึ้น... มีอะไรอยู่ในหมอก', "Why's the fog getting thicker... something's in there.", { tone: 'whisper', emotion: 'fear' }),
    ],
    idle: [
      P('ถนนเส้นนี้ ไฟทางเสียมาเป็นปีแล้ว', 'The streetlights on this road have been broken a year.'),
      P('ได้ยินตุ๊กแกร้องไหม ป้านับได้เจ็ดทีแล้ว', 'Hear the gecko? I counted seven calls.'),
      P('เมื่อกี้ได้ยินเสียงอะไรไหม... หรือป้าหูฝาด', 'Did you hear that? Or am I hearing things?', { emotion: 'fear' }),
      P('มะลิหอมไหม ป้าเด็ดเองกับมือเลยนะ', 'Smell the jasmine? Picked it with my own hands.'),
    ],
    onLookBack: [P('หันมาทำไม! มองถนนสิหนุ่ม!', 'Why are you turning round? Eyes on the road!', { tone: 'shout', emotion: 'anger' })],
    onFaceGaze: [P('มองหน้าป้าทำไม มีอะไรติดหน้าเหรอ', "Why are you staring? Something on my face?", { emotion: 'surprise' })],
  },
};
