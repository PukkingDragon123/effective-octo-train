// Ride 9 — 05:00–05:40 — สมชาย Somchai, Ton's father (GHOST → LEFT + the final rule test).
// Dawn mist, birdsong, monks on the alms round. He never says he recognises Ton, but talks
// about "his son in Bangkok", the sticker, washing the cab every morning. Early on he asks
// Ton to turn round ("หันมาให้พ่อเห็นหน้าหน่อย") — looking then costs only a sad line. At the
// mist gate he gets out and says from behind: "ไม่ต้องหันมานะลูก ... ขับไปเถอะ".
// Looking back THEN = ending 'endless'. Not looking = 'dawn'. All 7 memories = the
// forgiveness choice ('forgive'). Delivered RIGHT = 'wrong_home'.
import { P, Y, T, C, S } from '../lines.js';

export const RIDE_SOMCHAI = {
  id: 'somchai',
  order: 9,
  hour: 29,
  pickup: 'fatherLamp',
  characterId: 'somchai',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearRight', // directly behind the driver: "from behind you"
  destination: { th: 'บ้าน', en: 'Home' },
  clues: {
    reflection: 'delayed', shadow: false, breathFog: false, weightKg: 0, meter: 'oldDate',
    radioStatic: 0.15, blinks: false, feetFloat: false,
    payment: { type: 'none', amountTHB: 0, note: { th: 'ไม่มีค่ารถ มีแต่คำลา', en: 'No fare. Only a goodbye.' } },
    smell: 'motor-oil-tiger-balm',
    extra: ['Meter shows the date of the rainy-season night he died.', 'His mirror image moves half a second late.', 'Amulet warms with a soft gold glow, gentler than with other ghosts.'],
  },
  specialRules: [
    { rule: 'r3', phase: 'early', at: 0.06, lookBack: 'sad', setOnLookBack: { fatherSawFace: true }, note: 'He ASKS you to turn. Looking costs a sad line only (he means no harm). Plays dialogue.onLookBack.' },
    { rule: 'r3', phase: 'gate', lookBack: 'ending:endless', note: 'At the mist gate: rule 3 has no exception.' },
    { rule: 'r2', note: 'Ghost → LEFT. RIGHT plays ending wrong_home (counts as a death).' },
  ],
  encounters: [
    { id: 'monksAlms', at: 0.42 },
    { id: 'dawnBirds', at: 0.2, optional: true },
    { id: 'fatherCall', at: 1.0 },
  ],
  deathOnWrong: 'home',
  memoryHooks: ['m_photo', 'm_sticker', 'm_amulet', 'm_helmet', 'm_noodle', 'm_letter', 'm_song'],
  dialogue: {
    hail: [P('...แท็กซี่', '...taxi.', { tone: 'whisper', action: 'hail' })],
    greet: [
      P('ขอโทษนะ... รถคันนี้ยังวิ่งอยู่ไหม', 'Excuse me... is this cab still running?'),
      T('เสียงนี้...', 'That voice...', { pause: 1.0 }),
      P('รถสวยนะ ดูแลดีเหมือนเจ้าของเก่าเลย', "Nice cab. Looked after, the way its old owner did.", { emotion: 'smile' }),
    ],
    destination: [
      P('ไปส่งที่บ้านหน่อยนะ', 'Take me home, would you?'),
      P('เลยศาลเจ้าไป... เดี๋ยวบอกทางเอง', "Past the shrine... I'll show you the way."),
    ],
    beats: [
      {
        id: 'turnToMe',
        trigger: { type: 'progress', at: 0.06 },
        lines: [
          P('หันมาให้พ่อเห็นหน้าหน่อย', 'Turn so I can see your face.', { tone: 'whisper' }),
          T('ข้อสาม... ห้ามหัน ไม่ว่าจะได้ยินอะไร', "Rule three... never turn. Whatever you hear."),
        ],
        set: { fatherAskedToLook: true },
      },
      {
        id: 'mirrorWillDo',
        trigger: { type: 'after', beat: 'turnToMe', seconds: 9 },
        if: { flag: { fatherSawFace: false } },
        lines: [
          P('ไม่เป็นไร... ในกระจกก็ได้', "That's all right... the mirror will do.", { emotion: 'smile' }),
          T('ในกระจก... เขามองผมอยู่', 'In the mirror... he\'s looking at me.'),
        ],
      },
      {
        id: 'sticker',
        trigger: { type: 'progress', at: 0.16 },
        lines: [
          P('สติกเกอร์การ์ตูนตรงนั้น ลูกชายลุงแปะไว้ตอนเจ็ดขวบ', 'That cartoon sticker there. My son stuck it on when he was seven.', { emotion: 'smile', action: 'point' }),
          P('เมียบอกให้แกะออก ลุงไม่ยอม', 'My wife told me to peel it off. I wouldn\'t.'),
        ],
      },
      {
        id: 'washing',
        trigger: { type: 'progress', at: 0.26 },
        lines: [
          P('ลุงล้างรถคันนี้ทุกเช้าเลยนะ', 'I washed this cab every single morning.'),
          P('เผื่อลูกกลับบ้าน จะได้เห็นรถพ่อมันสะอาด', "In case my boy came home. So he'd see his dad's car clean.", { emotion: 'sad' }),
        ],
      },
      {
        id: 'sonBangkok',
        trigger: { type: 'progress', at: 0.34 },
        lines: [
          P('ลูกชายลุงอยู่กรุงเทพฯ ทำงานอะไรก็ไม่รู้', "My son's in Bangkok. Doing what, I couldn't tell you."),
          P('ทะเลาะกันครั้งสุดท้าย... เรื่องโง่ ๆ', 'Our last fight... over something stupid.'),
          P('ลุงพูดแรงไป... ไม่เคยได้ขอโทษมันเลย', 'I said harsh things... I never got to say sorry.', { emotion: 'sad', pause: 1.2 }),
          T('...ผมก็เหมือนกันครับ', '...neither did I.'),
        ],
      },
      {
        id: 'monks',
        trigger: { type: 'event', event: 'encounter:monksAlms' },
        lines: [
          P('พระออกบิณฑบาตแล้ว... เช้าแล้วสินะ', "The monks are out on alms... it's morning, then."),
          P('ลุงตักบาตรทุกเช้า ก่อนออกรถ', 'I gave alms every morning before my shift.'),
        ],
      },
      {
        id: 'song',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [
          P('เพลงนี้... เพลงโปรดลุงเลย', "This song... it's my favourite.", { emotion: 'smile' }),
          P('♪ ทางกลับบ้าน ไกลแค่ไหน ใจยังรอ... ♪', '♪ However long the road back home, my heart still waits... ♪', { tone: 'sing', action: 'sing' }),
        ],
      },
      {
        id: 'amulet',
        trigger: { type: 'progress', at: 0.55 },
        lines: [
          P('พระที่ห้อยอยู่นั่น เมียลุงให้ไว้', 'The amulet hanging there. My wife gave it to me.'),
          P('บอกให้ห้อยไว้ คุ้มครองคนขับ', 'Told me to keep it there. To protect whoever drives.'),
        ],
      },
      {
        id: 'photo',
        trigger: { type: 'progress', at: 0.66 },
        lines: [
          P('ที่บังแดดมีรูปเด็กอยู่ใบนึง... ยังอยู่ไหม', "There's a photo of a little boy in the sun visor... still there?"),
          C([
            { key: 'yes', th: 'ยังอยู่ครับ', en: "It's still there." },
            { key: 'silent', th: '(เงียบ)', en: '(say nothing)' },
          ], {
            timeout: 7,
            defaultKey: 'silent',
            branches: {
              yes: [P('ดีแล้ว... ดีแล้ว', 'Good... that\'s good.', { emotion: 'smile', pause: 1.0 })],
              silent: [P('คงยังอยู่แหละ ลุงไม่เคยเอาออก', "It'll be there. I never took it out.")],
            },
          }),
        ],
      },
      {
        id: 'whichWay',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [
          P('ลุงไม่แน่ใจแล้วว่าบ้านอยู่ทางไหน', "I'm not sure any more which way is home.", { tone: 'whisper' }),
          P('เอ็งเลือกเถอะ... เอ็งรู้ดีกว่าลุง', 'You choose... you know better than me.'),
        ],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้ว... ลุงลงตรงนี้แหละ', "This is it... I'll get out here.", { action: 'exitCar' }),
    ],
    arriveWrong: [
      P('ทางนี้... ทางเข้าหมู่บ้านเรานี่', 'This road... it goes to our village.', { emotion: 'surprise' }),
      P('บ้านเรา... ยังเหมือนเดิมเลย', 'Our house... still the same.', { emotion: 'smile' }),
      P('แต่พ่ออยู่ที่นี่ไม่ได้แล้วนะลูก', "But I can't stay here any more, son.", { emotion: 'sad', tone: 'whisper' }),
    ],
    idle: [
      P('หมอกลงหนาจัง', 'Thick fog this morning.'),
      P('นกกางเขนร้องแล้ว', 'The magpie-robins are singing.'),
      P('ถนนเส้นนี้ลุงขับมาสามสิบปี', 'Thirty years I drove this road.'),
      P('เบรกยังดื้อเหมือนเดิมนะ ต้องเหยียบลึก ๆ', 'Brakes still sticky, eh? You have to push them deep.', { emotion: 'smile' }),
    ],
    // Early look (phase 'early'): quiet, sad, no death.
    onLookBack: [
      P('เห็นแล้ว... ตาเหมือนแม่มันจริง ๆ', 'I see you... you really do have your mother\'s eyes.', { emotion: 'sad' }),
      P('แต่กฎก็คือกฎ... อย่าหันอีกนะ', "But rules are rules... don't turn again.", { tone: 'whisper' }),
    ],
    onFaceGaze: [],
  },

  /** The mist-gate finale (played by the ending director after he steps out). */
  finale: {
    stepOut: [
      S('somchai', 'ต้น...', 'Ton...', { tone: 'whisper' }),
      T('เขาเรียกชื่อผม', 'He said my name.', { pause: 1.0 }),
      S('somchai', 'ไม่ต้องหันมานะลูก... ขับไปเถอะ', "Don't turn around, son... just drive.", { tone: 'whisper', emotion: 'sad' }),
    ],
    // Only when all 7 memories are collected (saves.data.memories has every MEMORIES id).
    forgiveChoice: C([
      { key: 'sorry', th: 'ขอโทษครับพ่อ', en: "I'm sorry, Dad." },
      { key: 'drive', th: '(ขับต่อไป)', en: '(drive on)' },
    ], { timeout: 12, defaultKey: 'drive', prompt: { th: 'พูดอะไรกับพ่อสักคำ...', en: 'Say something to Dad...' } }),
    forgive: [
      Y('ขอโทษครับพ่อ', "I'm sorry, Dad.", { emotion: 'sad' }),
      S('somchai', '...พ่อก็ขอโทษนะลูก', "...I'm sorry too, son.", { pause: 1.2 }),
      S('somchai', 'พ่อไม่เคยโกรธต้นเลย ไม่เคยเลย', 'I was never angry with you, Ton. Never.'),
      S('somchai', 'กลับไปหาแม่นะ... แล้วล้างรถให้พ่อด้วย', 'Go home to your mum... and wash the car for me.', { emotion: 'smile' }),
      S('somchai', 'ไปเถอะลูก... พระอาทิตย์ขึ้นแล้ว', 'Go on, son... the sun is up.', { emotion: 'smile', pause: 2.0 }),
    ],
    // Didn't look back (with or without the choice): he walks into the mist.
    dawn: [
      S('somchai', 'พ่อภูมิใจในตัวลูกนะ', "I'm proud of you, son.", { tone: 'whisper', emotion: 'smile' }),
    ],
    // Looked back at the gate.
    endless: [
      S('somchai', '...ลูกพ่อ', '...my boy.', { tone: 'whisper', emotion: 'sad' }),
    ],
  },
};
