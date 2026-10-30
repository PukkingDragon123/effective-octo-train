// Ride 7 — 03:00 — ลุงสมาน Uncle Saman, long-dead luk thung singer (friendly GHOST → LEFT).
// Funny: song requests, off-key singing, terrible jokes. Still scary: his face presses
// against the glass from outside while he is also inside. Rule 8: something breathes on
// Ton's neck and Saman talks him through it. He requests station 3 — at 03:00 it plays
// "ทางกลับบ้าน", which he sang and Somchai loved (memory m_song).
import { P, Y, T, C } from '../lines.js';

export const RIDE_SAMAN = {
  id: 'saman',
  order: 7,
  hour: 27,
  pickup: 'sala2',
  characterId: 'saman',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearLeft',
  destination: { th: 'งานวัด (เวทีลูกทุ่ง)', en: 'The temple fair (luk thung stage)' },
  clues: {
    reflection: 'none', shadow: false, breathFog: false, weightKg: 0, meter: 'glitch',
    radioStatic: 0.3, blinks: false, feetFloat: false,
    payment: { type: 'old_banknote', amountTHB: 100, note: { th: 'แบงก์ร้อยรุ่นเก่ามาก กระดาษนุ่มเหมือนผ้า', en: 'A very old hundred-baht note, soft as cloth.' } },
    smell: 'cigarette-hair-oil',
    extra: ['His cigarette smoke passes straight through the closed glass.', 'Outdated detail: booked for the fair "in 1983".', 'Sequins catch no light in the mirror: the seat is empty.'],
  },
  specialRules: [
    { rule: 'r8', at: 0.72, note: 'Breath on the neck. Hold amulet + eyes front. Saman sings you through it.' },
    { rule: 'r4', note: 'Consistent rules: even a friendly ghost must not be stared at.' },
    { rule: 'r3', lookBack: 'warn', note: 'He is friendly: looking back gets a joke, but the breath event still counts.' },
  ],
  encounters: [
    { id: 'strayDogs', at: 0.12, optional: true },
    { id: 'faceAgainstGlass', at: 0.6 },
    { id: 'breathOnNeck', at: 0.72 },
  ],
  deathOnWrong: 'windowAttack',
  memoryHooks: ['m_song'],
  pacing: { cruiseKmh: 40, minSeconds: 170, stretch: 'fog' }, // ~1.1 km: the shrine fog stretches the road
  dialogue: {
    hail: [P('ฮัลโหล! แท็กซี่! ทางนี้ครับพี่น้อง!', 'Hello! Taxi! Over here, brothers and sisters!', { tone: 'shout', action: 'wave' })],
    greet: [
      P('สวัสดีครับ พ่อแม่พี่น้องแฟนเพลงทุกท่าน!', 'Good evening, ladies and gentlemen, my beloved fans!', { emotion: 'smile', action: 'wai' }),
      P('อ้าว แฟนเพลงคนเดียวเหรอ ไม่เป็นไร ๆ', 'Oh, just the one fan tonight? Never mind, never mind.'),
      P('ผมสมาน... สมาน เสียงทอง ไง จำไม่ได้เหรอ', "I'm Saman... Saman Golden-Voice! Don't you recognise me?"),
      Y('ไม่ครับ', 'No.'),
      P('เด็กสมัยนี้...', 'Kids these days...', { emotion: 'sad' }),
    ],
    destination: [
      P('ไปงานวัดครับ ผมมีคิวขึ้นเวทีตีสี่', "To the temple fair. I'm on stage at four."),
      P('เขาจ้างผมไว้ตั้งแต่ปีสองห้าสองหก... เอ๊ย ปีนี้แหละ', 'They booked me back in 1983... er, I mean this year.', { emotion: 'surprise' }),
    ],
    beats: [
      {
        id: 'station3',
        trigger: { type: 'progress', at: 0.17 },
        lines: [P('เปิดวิทยุหน่อยพ่อหนุ่ม ขอคลื่นสามนะ', 'Put the radio on, young man. Station three, please.')],
      },
      {
        id: 'radioOn',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [
          P('นั่นแหละ! เพลงเก่า ๆ ผมร้องได้หมดทุกเพลง', "That's the one! Old songs. I know every single one.", { emotion: 'smile' }),
          P('♪ ไฟทางดับ ใจพี่ก็ดับตาม... ♪', '♪ When the streetlights die, my heart goes dark too... ♪', { tone: 'sing', action: 'sing' }),
        ],
      },
      {
        id: 'joke1',
        trigger: { type: 'progress', at: 0.24 },
        lines: [
          P('ทายซิ ผีอะไรชอบนั่งแท็กซี่', 'Riddle me this: what kind of ghost loves taxis?'),
          C([
            { key: 'what', th: 'ผีอะไรครับ', en: 'What kind?' },
            { key: 'silent', th: '(เงียบ)', en: '(say nothing)' },
          ], { id: 'saman_riddle', timeout: 5, defaultKey: 'silent' }),
          P('ผี...โดยสารไง! ฮ่า ๆ ๆ', 'A passen-GHOST! Ha ha ha!', { emotion: 'smile', action: 'laugh' }),
          P('...ไม่ขำเหรอ', '...not funny?', { pause: 1.0 }),
          P('ตอนผมยังมีชีวิต... เอ๊ย ตอนผมยังดัง คนดูขำนะ', 'Back when I was alive... er, I mean, famous, the crowd laughed.'),
        ],
      },
      {
        id: 'smoke',
        trigger: { type: 'progress', at: 0.4 },
        lines: [
          P('ขอสูบบุหรี่หน่อยนะ ไม่ต้องเปิดกระจกหรอก', "Mind if I smoke? No need to open the window.", { action: 'smoke' }),
          T('ควัน... ลอยทะลุกระจกออกไป', 'The smoke... drifts straight through the glass.'),
        ],
      },
      {
        id: 'faceGlass',
        trigger: { type: 'event', event: 'encounter:faceAgainstGlass' },
        lines: [
          T('หน้าที่กระจก... หน้าลุงสมาน', 'The face on the glass... it\'s Uncle Saman.'),
          P('ใครน่ะ... หน้าเหมือนผมเลย หล่อดีนะ', 'Who\'s that... looks just like me. Handsome fellow.', { emotion: 'creepy' }),
        ],
      },
      {
        id: 'mySong',
        essential: true, // points the player at memory m_song
        trigger: { type: 'progress', at: 0.5 },
        lines: [
          P('ตีสามแล้ว... คลื่นสามจะเปิดเพลงผม', "Past three... station three'll play my song now."),
          P('เพลง "ทางกลับบ้าน" ผมร้องเอง', "'The Way Home'. I sang that one myself.", { emotion: 'smile' }),
          P('มีคนขับแท็กซี่คนนึงชอบมาก เปิดทุกเช้าเลย', 'A taxi driver I knew loved it. Played it every morning.'),
        ],
      },
      {
        id: 'breath',
        trigger: { type: 'event', event: 'encounter:breathOnNeck' },
        lines: [
          P('ไอ้หนู... อย่าหันนะ', "Kid... don't turn around.", { tone: 'whisper' }),
          P('ที่หายใจรดคอเอ็งอยู่น่ะ... ไม่ใช่ลุงนะ', "Whatever's breathing on your neck... it isn't me.", { tone: 'whisper', emotion: 'fear' }),
          P('กำพระไว้ มองถนน เดี๋ยวลุงร้องเพลงกล่อมให้', "Hold your amulet, eyes on the road. I'll sing you through it."),
          P('♪ อย่าเหลียวหลังไป... ทางข้างหน้ายังรอ... ♪', "♪ Don't look behind you... the road ahead still waits... ♪", { tone: 'sing', action: 'sing' }),
        ],
      },
      {
        id: 'breathGone',
        trigger: { type: 'event', event: 'breathPassed' },
        lines: [P('ไปแล้ว... ผีพวกนี้ไม่มีมารยาทเลยจริง ๆ', 'Gone... honestly, these ghosts have no manners.', { emotion: 'smile' })],
      },
      {
        id: 'stage',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [
          P('เวทีอยู่ข้างหน้าแล้ว... เห็นไฟไหม', "The stage is just ahead... see the lights?", { emotion: 'smile' }),
          P('คนดูรอผมมาสี่สิบปีแล้วนะ', "The crowd's been waiting forty years for me."),
        ],
      },
      {
        id: 'spotlight',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('สปอตไลต์! ขอบคุณครับ ขอบคุณ!', 'A spotlight! Thank you, thank you!', { emotion: 'smile', action: 'wai' })],
      },
      {
        id: 'window',
        trigger: { type: 'event', event: 'windowOpen' },
        lines: [P('เปิดทำไม ควันลุงมันออกไปเองได้', "What for? My smoke finds its own way out.")],
      },
    ],
    arriveCorrect: [
      P('ถึงงานวัดแล้ว! ได้ยินเสียงแคนไหม', "We're at the fair! Hear the khaen?", { emotion: 'smile' }),
      P('นี่ค่ารถ แบงก์ร้อย... รุ่นนี้ยังใช้ได้อยู่ใช่ไหม', "Here's your fare, a hundred... these are still good, right?", { action: 'pay' }),
      P('ขอบใจนะไอ้หนู ว่าง ๆ มาดูลุงร้องเพลงบ้าง', "Thanks, kid. Come and watch me sing sometime."),
    ],
    arriveWrong: [
      P('ทางนี้ไม่มีเวทีนี่... มีแต่บ้านคน', "There's no stage this way... just people's houses.", { emotion: 'sad' }),
      P('ลุงร้องให้คนเป็นฟังไม่ได้แล้วนะไอ้หนู', "I can't sing for the living any more, kid."),
      P('งั้นลุงเชิญคนดูของลุงมาหาเอ็งแทนนะ', "Then I'll bring my audience to you instead.", { tone: 'ghost', emotion: 'creepy' }),
    ],
    idle: [
      P('♪ ลา ลา ลา... ♪', '♪ La la la... ♪', { tone: 'sing' }),
      P('ไมค์ผมหายไปไหนนะ', "Where's my microphone got to?"),
      P('ผมเคยร้องให้คนดูเป็นพันเลยนะ', "I once sang for thousands, you know."),
      P('รู้ไหม ทำไมผีโกหกไม่เก่ง... เพราะคนมองทะลุหมด!', "Know why ghosts are bad liars? ...You can see right through them!", { emotion: 'smile', action: 'laugh' }),
    ],
    onLookBack: [P('หันมาทำไม! ขอลายเซ็นเหรอ', 'Why turn round? Want an autograph?', { emotion: 'smile' })],
    onFaceGazeWarn: [P('อย่ามองหน้าลุงนานนักสิ... หน้าจริงลุงไม่ได้เป็นแบบนี้แล้ว', "Don't stare, kid... my real face isn't like this any more.", { tone: 'whisper', emotion: 'sad' })],
    onFaceGaze: [P('...ลุงเตือนแล้วนะ', '...I did warn you.', { tone: 'ghost', emotion: 'creepy' })],
  },
};
