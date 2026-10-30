// Ride 7 — 03:00 — ลุงสมาน Uncle Saman, long-dead luk thung singer (friendly GHOST → LEFT).
// Funny: song requests, off-key singing, terrible jokes. Still scary: his face presses against
// the glass from outside while he is also inside; rule 8: something breathes on Ton's neck and
// Saman sings him through it. Two EXCEPTIONS: r13 — he spits betel juice "out of the window"
// (straight through the closed glass) and it spatters the windshield red: wiping is fine; r15 —
// at 03:00 station 3 plays Somchai's request "...ต้น" and Saman tells you to listen to the end.
// Replies: recognise, year (exposes "1983"), riddle, betel, dedication.
import { P, C, O, SIL, tr } from '../lines.js';

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
    extra: ['His cigarette smoke and his betel spit pass straight through the closed glass.', 'Outdated detail: booked for the fair "in 2526" (ask: reply "catch").', 'Sequins catch no light in the mirror: the seat is empty.'],
  },
  specialRules: [
    { rule: 'r13', at: 0.3, exception: 'betel', note: 'Betel juice on the windshield: only betel. Wiping is safe.' },
    { rule: 'r15', at: 0.52, exception: 'fatherDedication', note: 'Station 3 says "ต้น": it is Somchai\'s request. Listen to the end (memory m_song).' },
    { rule: 'r8', at: 0.74, note: 'Breath on the neck. Hold amulet + eyes front. Saman sings you through it.' },
    { rule: 'r4', note: 'Consistent rules: even a friendly ghost must not be stared at.' },
    { rule: 'r3', lookBack: 'warn', note: 'He is friendly: looking back gets a joke, but the breath event still counts.' },
  ],
  encounters: [
    { id: 'strayDogs', at: 0.1, optional: true },
    { id: 'betelSpit', at: 0.3 },
    { id: 'fatherDedication', at: 0.52, optional: true }, // requires the radio on (station 3)
    { id: 'faceAgainstGlass', at: 0.62 },
    { id: 'breathOnNeck', at: 0.74 },
  ],
  deathOnWrong: 'windowAttack',
  memoryHooks: ['m_song'],
  pacing: { cruiseKmh: 40, minSeconds: 200, stretch: 'fog' }, // ~1.1 km: the shrine fog stretches the road
  dialogue: {
    hail: [P('ฮัลโหล! แท็กซี่! ทางนี้ครับพี่น้อง!', 'Hello! Taxi! Over here, brothers and sisters!', { tone: 'shout', action: 'wave' })],
    greet: [
      P('สวัสดีครับ พ่อแม่พี่น้องแฟนเพลงทุกท่าน!', 'Good evening, ladies and gentlemen, my beloved fans!', { emotion: 'smile', action: 'wai' }),
      P('อ้าว แฟนเพลงคนเดียวเหรอ ไม่เป็นไร ๆ', 'Oh, just the one fan tonight? Never mind, never mind.'),
      P('เอ๊ะ แฟนคนนี้มาดูทุกรอบเลยนี่', 'Hey, this fan comes to every show!', { emotion: 'surprise', if: { loopsGte: 1, loopsLt: 3 } }),
      P('แฟนพันธุ์แท้มาอีกแล้ว! ลุงร้องได้แต่เพลงเดิมนะ', 'My number one fan, back again! I only know the one set, mind.', { emotion: 'smile', if: { loopsGte: 3 } }),
      P('ผมสมาน... สมาน เสียงทอง ไง จำไม่ได้เหรอ', "I'm Saman... Saman Golden-Voice! Don't you recognise me?"),
      C([
        O('no', 'ไม่รู้จักครับ', 'Never heard of you.'),
        O('dad', 'จำได้ครับ พ่อผมชอบ', 'I remember. My dad loved you.'),
        SIL(),
      ], {
        id: 'saman_recognise',
        timeout: 7,
        setOnPick: { dad: tr('saman', 'fan') },
        branches: {
          no: [P('เด็กสมัยนี้...', 'Kids these days...', { emotion: 'sad' })],
          dad: [P('เห็นไหม! พ่อเอ็งรสนิยมดี', 'See? Your old man had taste!', { emotion: 'smile', action: 'laugh' })],
          silent: [P('เด็กสมัยนี้...', 'Kids these days...', { emotion: 'sad' })],
        },
      }),
    ],
    destination: [
      P('ไปงานวัดครับ ผมมีคิวขึ้นเวทีตีสี่', "To the temple fair. I'm on stage at four."),
      P('เขาจ้างผมไว้ตั้งแต่ปีสองห้าสองหก... เอ๊ย ปีนี้แหละ', 'They booked me back in 2526... er, I mean this year.', { emotion: 'surprise' }),
      C([O('catch', 'สองห้าสองหก? สี่สิบกว่าปีแล้วนะลุง', '2526? That was over forty years ago, Uncle.'), SIL()], {
        id: 'saman_year',
        timeout: 6,
        setOnPick: { catch: { 'clue.saman.year': true } },
        branches: {
          catch: [
            P('สี่สิบกว่าปี...', 'Over forty years...', { tone: 'whisper' }),
            P('มิน่า คนดูรอนานจัง', "No wonder the crowd's been waiting so long.", { emotion: 'smile', action: 'laugh' }),
          ],
        },
      }),
    ],
    beats: [
      {
        id: 'station3',
        trigger: { type: 'progress', at: 0.12 },
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
        trigger: { type: 'progress', at: 0.2 },
        lines: [
          P('ทายซิ ผีอะไรชอบนั่งแท็กซี่', 'Riddle me this: what kind of ghost loves taxis?'),
          C([
            O('what', 'ผีอะไรครับ', 'What kind?'),
            O('you', 'ผีลุงไงครับ', 'You, Uncle.'),
            SIL(),
          ], {
            id: 'saman_riddle',
            timeout: 6,
            setOnPick: { what: tr('saman', 'riddle'), you: tr('saman', 'riddle') },
            branches: {
              what: [
                P('ผี...โดยสารไง! ฮ่า ๆ ๆ', 'A passen-GHOST! Ha ha ha!', { emotion: 'smile', action: 'laugh' }),
                P('...ไม่ขำเหรอ', '...not funny?', { pause: 1.0 }),
              ],
              you: [
                P('เฮ้ย!', 'Hey!', { emotion: 'surprise' }),
                P('...ก็ถูกของเอ็งนะ', "...well, you're not wrong.", { emotion: 'smile', action: 'laugh' }),
              ],
              silent: [
                P('ผี...โดยสารไง! ฮ่า ๆ ๆ', 'A passen-GHOST! Ha ha ha!', { emotion: 'smile', action: 'laugh' }),
                P('...ไม่ขำเหรอ', '...not funny?', { pause: 1.0 }),
              ],
            },
          }),
        ],
      },
      {
        // r13 EXCEPTION: red on the windshield, but it is only betel.
        id: 'betel',
        trigger: { type: 'event', event: 'encounter:betelSpit' },
        lines: [
          P('ขอบ้วนน้ำหมากหน่อยนะ ไม่ต้องเปิดกระจก', 'Mind if I spit my betel? No need to open the window.'),
          P('โทษที ๆ ปลิวไปโดนกระจกหน้า', 'Oops, sorry, it blew onto the windshield.', { emotion: 'surprise' }),
          P('ปัดเลย ๆ น้ำหมาก ไม่ใช่เลือด', "Go on, wipe it. It's betel, not blood."),
          C([
            O('sure', 'แน่นะลุง', 'You sure, Uncle?'),
            O('blood', 'นึกว่าเลือด', 'I thought it was blood.'),
            SIL(),
          ], {
            id: 'saman_betel',
            timeout: 6,
            setOnPick: { blood: { 'clue.saman.betel': true, ...tr('saman', 'betel') } },
            branches: {
              sure: [P('แน่สิ! เลือดลุงหมดตัวตั้งแต่ปีสองหกแล้ว', "Course I'm sure! I ran out of blood back in '83.", { emotion: 'smile', action: 'laugh' })],
              blood: [P('ถ้าเป็นเลือด ลุงไม่บอกให้ปัดหรอก', "If it was blood I'd never tell you to wipe.", { emotion: 'smile' })],
              silent: [P('ไม่ปัดก็ได้ แดง ๆ สวยดี', "Leave it, then. Red's pretty.", { emotion: 'smile' })],
            },
          }),
        ],
      },
      {
        id: 'mySong',
        essential: true, // points the player at station 3 and memory m_song
        trigger: { type: 'progress', at: 0.38 },
        lines: [
          P('ตีสามแล้ว... คลื่นสามจะเปิดเพลงผม', "Past three... station three'll play my song now."),
          P('เพลง "ทางกลับบ้าน" ผมร้องเอง', "'The Way Home'. I sang that one myself.", { emotion: 'smile' }),
          P('มีคนขับแท็กซี่คนนึงชอบมาก เปิดทุกเช้าเลย', 'A taxi driver I knew loved it. Played it every morning.'),
        ],
      },
      {
        id: 'smoke',
        trigger: { type: 'progress', at: 0.45 },
        lines: [P('ขอสูบบุหรี่หน่อยนะ ไม่ต้องเปิดกระจกหรอก', 'Mind if I smoke? No need to open the window.', { action: 'smoke' })],
      },
      {
        // r15 EXCEPTION: the radio says "ต้น" — and this once you do NOT retune.
        id: 'dedication',
        trigger: { type: 'event', event: 'encounter:fatherDedication' },
        lines: [
          P('ชู่ว์... ฟังให้จบนะไอ้หนู', 'Shh... listen to the end, kid.', { tone: 'whisper' }),
          P('เพลงนี้มีคนขอไว้นานแล้ว', 'Somebody requested this one a long time ago.'),
          C([O('who', 'ใครขอครับ', 'Who asked for it?'), SIL()], {
            id: 'saman_dedication',
            timeout: 6,
            setOnPick: { who: tr('saman', 'song') },
            branches: {
              who: [
                P('คนที่ชอบเพลงลุงนั่นแหละ', 'The one who loved my song.', { emotion: 'sad' }),
                P('ขอทุกคืน... ไม่เคยมีใครฟังจนจบ', 'Asked every night... nobody ever listened to the end.', { tone: 'whisper' }),
              ],
            },
          }),
        ],
      },
      {
        id: 'faceGlass',
        trigger: { type: 'event', event: 'encounter:faceAgainstGlass' },
        lines: [P('ใครน่ะ... หน้าเหมือนผมเลย หล่อดีนะ', "Who's that... looks just like me. Handsome fellow.", { emotion: 'creepy' })],
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
          P('เวทีอยู่ข้างหน้าแล้ว... เห็นไฟไหม', 'The stage is just ahead... see the lights?', { emotion: 'smile' }),
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
        lines: [P('เปิดทำไม ควันลุงมันออกไปเองได้', 'What for? My smoke finds its own way out.')],
      },
    ],
    arriveCorrect: [
      P('ถึงงานวัดแล้ว! ได้ยินเสียงแคนไหม', "We're at the fair! Hear the khaen?", { emotion: 'smile' }),
      P('นี่ค่ารถ แบงก์ร้อย... รุ่นนี้ยังใช้ได้อยู่ใช่ไหม', "Here's your fare, a hundred... these are still good, right?", { action: 'pay' }),
      P('เดี๋ยวลุงร้องให้พ่อเอ็งฟังเอง', "I'll sing for your old man myself.", { emotion: 'smile', if: { flag: { 'trust.saman.fan': 1 } } }),
      P('ขอบใจนะไอ้หนู ว่าง ๆ มาดูลุงร้องเพลงบ้าง', 'Thanks, kid. Come and watch me sing sometime.'),
    ],
    arriveWrong: [
      P('ทางนี้ไม่มีเวทีนี่... มีแต่บ้านคน', "There's no stage this way... just people's houses.", { emotion: 'sad' }),
      P('ลุงร้องให้คนเป็นฟังไม่ได้แล้วนะไอ้หนู', "I can't sing for the living any more, kid."),
      P('งั้นลุงเชิญคนดูของลุงมาหาเอ็งแทนนะ', "Then I'll bring my audience to you instead.", { tone: 'ghost', emotion: 'creepy' }),
    ],
    idle: [
      P('♪ ลา ลา ลา... ♪', '♪ La la la... ♪', { tone: 'sing' }),
      P('ไมค์ผมหายไปไหนนะ', "Where's my microphone got to?"),
      P('ผมเคยร้องให้คนดูเป็นพันเลยนะ', 'I once sang for thousands, you know.'),
      P('รู้ไหม ทำไมผีโกหกไม่เก่ง... เพราะคนมองทะลุหมด!', 'Know why ghosts are bad liars? ...You can see right through them!', { emotion: 'smile', action: 'laugh' }),
    ],
    onLookBack: [P('หันมาทำไม! ขอลายเซ็นเหรอ', 'Why turn round? Want an autograph?', { emotion: 'smile' })],
    onFaceGazeWarn: [P('อย่ามองหน้าลุงนานนักสิ... หน้าจริงลุงไม่ได้เป็นแบบนี้แล้ว', "Don't stare, kid... my real face isn't like this any more.", { tone: 'whisper', emotion: 'sad' })],
    onFaceGaze: [P('...ลุงเตือนแล้วนะ', '...I did warn you.', { tone: 'ghost', emotion: 'creepy' })],
  },
};
