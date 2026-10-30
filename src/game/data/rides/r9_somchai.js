// Ride 9 — 05:00–05:40 — สมชาย Somchai, Ton's father (GHOST → LEFT + the final rule test).
// Dawn mist, birdsong, monks on the alms round. He never says he recognises Ton, but talks
// about "his son in Bangkok", the sticker, washing the cab every morning. Early on he asks
// Ton to turn round ("หันมาให้พ่อเห็นหน้าหน่อย") — looking then costs only a sad line.
//
// THE REPLIES DECIDE THE ENDING (exact conditions: endings.js / SCHEMA.md "Endings"):
//   somchai_drive   "ผมจะขับต่อครับ" (only if kindness >= 4: four passengers trust Ton tonight)
//                   → takeOver → ending 'successor' (unless the forgiveness ending wins)
//   somchai_gate    at the mist gate, after "ไม่ต้องหันมานะลูก... ขับไปเถอะ":
//                   "ขอโทษครับพ่อ" (all 7 memories) → forgave → 'forgive'
//                   "พ่อ... อย่าเพิ่งไป" → lure r3: his voice comes right behind your head (look = 'endless')
//   then the empty dawn drive folds back to the shrine fork one last time (finale.lastFork):
//   RIGHT → forgive / successor / dawn · LEFT, alone → 'join_father'.
//   Delivered RIGHT in the first place = 'wrong_home' (counts as a death).
import { P, T, S, C, O, SIL, tr } from '../lines.js';

const FORGIVE = [
  S('somchai', '...พ่อก็ขอโทษนะลูก', "...I'm sorry too, son.", { tone: 'whisper', pause: 1.2 }),
  S('somchai', 'พ่อไม่เคยโกรธต้นเลย ไม่เคยเลย', 'I was never angry with you, Ton. Never.'),
  S('somchai', 'ไปไหว้แม่ที่วัดบ้างนะ... บอกแม่ว่าพ่อตามไปแล้ว', 'Visit your mum at the temple... tell her I have gone to find her.', { emotion: 'smile' }),
  S('somchai', 'แล้วล้างรถให้พ่อด้วยนะลูก', 'And wash the car for me, son.', { emotion: 'smile' }),
  S('somchai', 'ไปเถอะลูก... พระอาทิตย์ขึ้นแล้ว', 'Go on, son... the sun is up.', { emotion: 'smile', pause: 2.0 }),
];

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
    extra: ['Meter shows the date of the rainy-season morning he died.', 'His mirror image moves half a second late.', 'Amulet warms with a soft gold glow, gentler than with other ghosts.'],
  },
  specialRules: [
    { rule: 'r3', phase: 'early', at: 0.08, lookBack: 'sad', setOnLookBack: { fatherSawFace: true }, note: 'He ASKS you to turn. Looking costs a sad line only (he means no harm). Plays dialogue.onLookBack.' },
    { rule: 'r3', phase: 'gate', lookBack: 'ending:endless', setOnLookBack: { gateLookBack: true }, note: 'At the mist gate: rule 3 has no exception. The "wait" reply lures you (lure r3).' },
    { rule: 'r2', note: 'Ghost → LEFT. RIGHT sets somchaiFork:"right" and plays ending wrong_home (counts as a death).' },
  ],
  encounters: [
    { id: 'dawnBirds', at: 0.2, optional: true },
    { id: 'monksAlms', at: 0.44 },
    { id: 'fatherCall', at: 1.0 },
  ],
  deathOnWrong: 'home',
  memoryHooks: ['m_photo', 'm_sticker', 'm_amulet', 'm_helmet', 'm_noodle', 'm_letter', 'm_song'],
  // fatherLamp → fork is only ~460 m. The dawn mist folds the road (Ah Kong is stretching the
  // night) so the last ride lasts ~5 minutes; the sky still eases 05:00 → 05:40 over it.
  pacing: { cruiseKmh: 30, speedCapKmh: 35, minSeconds: 290, stretch: 'mist' },
  dialogue: {
    hail: [P('...แท็กซี่', '...taxi.', { tone: 'whisper', action: 'hail' })],
    greet: [
      P('ไปไหมครับ... ทางศาลเจ้า', 'Going my way...? Towards the shrine?'),
      T('เสียงนี้...', 'That voice...', { pause: 1.0 }),
      P('เราเคยนั่งรถคันนี้ด้วยกันแล้วใช่ไหม', "We've ridden in this cab together before, haven't we?", { tone: 'whisper', if: { loopsGte: 3 } }),
      P('รถสวยนะ ดูแลดีเหมือนเจ้าของเก่าเลย', 'Nice cab. Looked after, the way its old owner did.', { emotion: 'smile' }),
      C([
        O('know', 'รู้จักเจ้าของเก่าเหรอครับ', 'You knew the old owner?'),
        O('thanks', 'ขอบคุณครับ', 'Thanks.'),
        SIL(),
      ], {
        id: 'somchai_owner',
        timeout: 7,
        branches: {
          know: [P('รู้จักดีกว่าใครอีก', 'Better than anyone.', { emotion: 'smile', pause: 0.8 })],
          thanks: [P('เบรกยังดื้อเหมือนเดิมไหม', 'Brakes still sticky?', { emotion: 'smile' })],
        },
      }),
    ],
    destination: [
      P('ไปส่งที่บ้านหน่อยนะ', 'Take me home, would you?'),
      P('เลยศาลเจ้าไป... เดี๋ยวบอกทางเอง', "Past the shrine... I'll show you the way."),
    ],
    beats: [
      {
        id: 'turnToMe',
        essential: true,
        trigger: { type: 'progress', at: 0.11 },
        set: { fatherAskedToLook: true },
        lines: [
          P('หันมาให้พ่อเห็นหน้าหน่อย', 'Turn so I can see your face.', { tone: 'whisper' }),
          C([
            O('cant', 'ผมหันไม่ได้ครับ', "I can't turn round."),
            O('mirror', 'ในกระจกได้ไหมครับ', 'Will the mirror do?'),
            SIL(),
          ], {
            id: 'somchai_turn',
            timeout: 8,
            setOnPick: { cant: { dadReplied: true, ...tr('somchai', 'rules') }, mirror: { dadReplied: true, ...tr('somchai', 'mirror') } },
            branches: {
              cant: [P('กฎอากงสินะ... ดีแล้ว', "Ah Kong's rules... good.", { emotion: 'smile' })],
              mirror: [P('ได้สิ... ในกระจกก็ได้', 'Of course... the mirror will do.', { emotion: 'smile' })],
            },
          }),
        ],
      },
      {
        id: 'mirrorWillDo',
        trigger: { type: 'after', beat: 'turnToMe', seconds: 5 },
        if: { flag: { fatherSawFace: false, dadReplied: false } },
        lines: [P('ไม่เป็นไร... ในกระจกก็ได้', "That's all right... the mirror will do.", { emotion: 'smile' })],
      },
      {
        id: 'sticker',
        essential: true,
        trigger: { type: 'progress', at: 0.2 },
        lines: [
          P('สติกเกอร์การ์ตูนตรงนั้น ลูกชายลุงแปะไว้ตอนเจ็ดขวบ', 'That cartoon sticker there. My son stuck it on when he was seven.', { emotion: 'smile', action: 'point' }),
          P('เมียบอกให้แกะออก ลุงไม่ยอม', "My wife told me to peel it off. I wouldn't."),
        ],
      },
      {
        id: 'washing',
        essential: true,
        trigger: { type: 'progress', at: 0.26 },
        lines: [
          P('ลุงล้างรถคันนี้ทุกเช้าเลยนะ', 'I washed this cab every single morning.'),
          P('เผื่อลูกกลับบ้าน จะได้เห็นรถพ่อมันสะอาด', "In case my boy came home. So he'd see his dad's car clean.", { emotion: 'sad' }),
        ],
      },
      {
        id: 'sonBangkok',
        essential: true,
        trigger: { type: 'progress', at: 0.32 },
        lines: [
          P('ลูกชายลุงอยู่กรุงเทพฯ ทำงานอะไรก็ไม่รู้', "My son's in Bangkok. Doing what, I couldn't tell you."),
          P('ลุงอยากให้มันขับแท็กซี่ต่อ... มันไม่เอา', "I wanted him to take over the cab... he wouldn't have it."),
          P('ลุงด่ามันว่า ไปแล้วไม่ต้องกลับมา', "I told him: if you go, don't bother coming back.", { emotion: 'sad' }),
          P('แล้วมันก็ไม่กลับมาจริง ๆ... ลุงไม่เคยได้ขอโทษมันเลย', 'And he never did... I never got to say sorry.', { emotion: 'sad', pause: 1.2 }),
          C([
            O('soft', 'เขาก็คงอยากขอโทษเหมือนกันครับ', 'He probably wanted to say sorry too.'),
            O('call', 'ทำไมไม่โทรหาเขาล่ะครับ', "Why didn't you call him?"),
            SIL(),
          ], {
            id: 'somchai_son',
            timeout: 9,
            setOnPick: { soft: { softWithDad: true, ...tr('somchai', 'soft') }, call: { 'clue.somchai.calls': true } },
            branches: {
              soft: [
                P('งั้นเหรอ...', 'You think so...?', { tone: 'whisper', pause: 1.0 }),
                P('ถ้าเป็นงั้นก็ดี', "Then that's good.", { emotion: 'smile' }),
              ],
              call: [
                P('โทรแล้ว... ทุกวันเกิดมัน', 'I did... every birthday.', { emotion: 'sad' }),
                P('มันไม่เคยรับ', 'He never picked up.', { tone: 'whisper', pause: 1.2 }),
              ],
              silent: [T('...ผมก็เหมือนกันครับ', '...neither did I.')],
            },
          }),
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
      // --- these only play if Ton found that memory: the player's searching is answered
      {
        id: 'helmet',
        if: { memories: ['m_helmet'] },
        trigger: { type: 'progress', at: 0.48 },
        lines: [
          P('เช้ามืดวันนั้นฝนตกหนัก... ลุงไม่น่าขี่มอเตอร์ไซค์ออกไปเลย', 'That morning it poured... I should never have taken the bike out.', { emotion: 'sad' }),
          P('แค่จะไปซื้อพวงมาลัยใหม่มาแขวนหน้ารถ', 'Only to buy a fresh garland for the mirror.'),
        ],
      },
      {
        id: 'amulet',
        trigger: { type: 'progress', at: 0.55 },
        lines: [
          P('พระที่ห้อยอยู่นั่น เมียลุงให้ไว้', 'The amulet hanging there. My wife gave it to me.'),
          P('เขาไปก่อนลุงตั้งหลายปี... แต่พระยังห้อยอยู่ตรงนั้น', 'She went years before me... but the amulet stayed right there.', { emotion: 'sad' }),
          P('บอกให้ห้อยไว้ คุ้มครองคนขับ', 'She said keep it there. To protect whoever drives.'),
        ],
      },
      {
        id: 'noodle',
        if: { memories: ['m_noodle'] },
        trigger: { type: 'progress', at: 0.62 },
        lines: [
          P('หิวเส้นเล็กน้ำตกร้านป้าเล็กจัง', "What I wouldn't give for a bowl of Lek's thin noodles.", { emotion: 'smile' }),
          P('ไม่ใส่ถั่วงอกนะ... จำไว้', 'No bean sprouts... remember that.', { emotion: 'smile' }),
        ],
      },
      {
        id: 'photo',
        trigger: { type: 'progress', at: 0.67 },
        lines: [
          P('ที่บังแดดมีรูปเด็กอยู่ใบนึง... ยังอยู่ไหม', "There's a photo of a little boy in the sun visor... still there?"),
          C([
            O('yes', 'ยังอยู่ครับ', "It's still there."),
            O('teeth', 'เด็กฟันหลอสองซี่ใช่ไหมครับ', 'The kid with two front teeth missing?', { if: { memories: ['m_photo'] } }),
            SIL(),
          ], {
            id: 'somchai_photo',
            timeout: 7,
            setOnPick: { yes: tr('somchai', 'photo'), teeth: tr('somchai', 'photo') },
            branches: {
              yes: [P('ดีแล้ว... ดีแล้ว', "Good... that's good.", { emotion: 'smile', pause: 1.0 })],
              teeth: [
                P('เอ็งดูแล้วเหรอ', "You've looked at it?", { emotion: 'surprise' }),
                P('ฟันหลอ... ยิ้มกว้างที่สุดในโลก', 'Gap-toothed... the widest smile in the world.', { emotion: 'smile', pause: 1.0 }),
              ],
              silent: [P('คงยังอยู่แหละ ลุงไม่เคยเอาออก', "It'll be there. I never took it out.")],
            },
          }),
        ],
      },
      {
        id: 'letter',
        if: { memories: ['m_letter'] },
        trigger: { type: 'progress', at: 0.74 },
        lines: [
          P('ลุงเคยเขียนจดหมายถึงลูก... ลุงเขียนไม่เก่งหรอก', "I wrote my boy a letter once... I'm no good with words."),
          P('ไม่กล้าส่ง ยัดไว้ในลิ้นชักหน้ารถนั่นแหละ', 'Never had the nerve to send it. Stuffed it in the glovebox.'),
          C([O('read', 'ผมอ่านแล้วครับ', 'I read it.'), SIL()], {
            id: 'somchai_letter',
            timeout: 7,
            setOnPick: { read: tr('somchai', 'letter') },
            branches: {
              read: [
                P('...อ่านแล้ว', '...you read it.', { tone: 'whisper', pause: 1.2 }),
                P('ลายมือลุงอ่านยากนะ', "My handwriting's hard to read.", { emotion: 'smile' }),
              ],
            },
          }),
        ],
      },
      {
        // What Somchai always wanted. The option only exists if Ton was kind tonight (kindness >= 4).
        id: 'keepDriving',
        essential: true,
        trigger: { type: 'progress', at: 0.82 },
        lines: [
          P('เอ็งขับรถคันนี้คล่องนะ เหมือนเกิดมาขับ', 'You handle this cab well. Like you were born to it.', { emotion: 'smile' }),
          P('จะขับต่อไหม... หรือจะกลับกรุงเทพฯ', 'Will you keep driving... or go back to Bangkok?'),
          C([
            O('takeOver', 'ผมจะขับต่อครับ', "I'll keep driving.", { if: { kindnessGte: 4 } }),
            O('bangkok', 'ผมต้องกลับครับ', 'I have to go back.'),
            SIL(),
          ], {
            id: 'somchai_drive',
            timeout: 9,
            setOnPick: { takeOver: { takeOver: true, ...tr('somchai', 'drive') } },
            branches: {
              takeOver: [
                P('...จริงเหรอ', '...really?', { emotion: 'surprise', pause: 1.0 }),
                P('ลุงรอได้ยินคำนี้มาทั้งชีวิต', "I've waited my whole life to hear that.", { tone: 'whisper', emotion: 'smile' }),
              ],
              bangkok: [
                P('กลับไปเถอะ...', 'Go back, then...'),
                P('แต่กลับมาเยี่ยมบ้านบ้างนะ', 'But come home and visit sometimes.', { tone: 'whisper', emotion: 'sad' }),
              ],
              silent: [P('ไม่ต้องตอบหรอก... เอ็งเลือกเองได้', "No need to answer... it's your choice.")],
            },
          }),
        ],
      },
      {
        id: 'whichWay',
        essential: true,
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [
          P('ลุงไม่แน่ใจแล้วว่าบ้านอยู่ทางไหน', "I'm not sure any more which way is home.", { tone: 'whisper' }),
          P('เอ็งเลือกเถอะ... เอ็งรู้ดีกว่าลุง', 'You choose... you know better than me.'),
          // learned from taking him home (wrong_home): tell him where home is now
          C([O('left', 'บ้านลุงอยู่ทางซ้ายแล้วครับ', 'Your home is on the left now.'), SIL()], {
            id: 'somchai_whichWay',
            if: { diedOn: 'somchai' },
            timeout: 7,
            setOnPick: { left: tr('somchai', 'home') },
            branches: {
              left: [
                P('ทางซ้าย...', 'The left...', { tone: 'whisper', pause: 1.0 }),
                P('ใช่... บ้านจริง ๆ ของลุงอยู่ทางนั้นแล้ว', "Yes... that's where my real home is now.", { emotion: 'sad' }),
              ],
            },
          }),
        ],
      },
    ],
    arriveCorrect: [P('ถึงแล้ว... ลุงลงตรงนี้แหละ', "This is it... I'll get out here.", { action: 'exitCar' })],
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
      P('เห็นแล้ว... ตาเหมือนแม่มันจริง ๆ', "I see you... you really do have your mother's eyes.", { emotion: 'sad' }),
      P('แต่กฎก็คือกฎ... อย่าหันอีกนะ', "But rules are rules... don't turn again.", { tone: 'whisper' }),
    ],
    onFaceGaze: [],
  },

  /** The mist-gate finale (played by the ending director after he steps out). */
  finale: {
    stepOut: [
      S('somchai', 'ต้น...', 'Ton...', { tone: 'whisper', pause: 1.0 }),
      S('somchai', 'ไม่ต้องหันมานะลูก... ขับไปเถอะ', "Don't turn around, son... just drive.", { tone: 'whisper', emotion: 'sad' }),
    ],
    // Ton answers his father. Resolve with logic.resolveLines (the options depend on memories).
    gateReply: C([
      O('sorry', 'ขอโทษครับพ่อ', "I'm sorry, Dad.", { if: { allMemories: true } }),
      O('bye', 'ลาก่อนครับพ่อ', 'Goodbye, Dad.', { if: { allMemories: false } }),
      O('wait', 'พ่อ... อย่าเพิ่งไป', 'Dad... not yet.'), // dangerous: his voice comes closer (lure r3)
      SIL(),
    ], {
      id: 'somchai_gate',
      timeout: 12,
      setOnPick: { sorry: { forgave: true }, bye: { saidBye: true }, wait: { lure: 'r3' } },
      branches: {
        sorry: FORGIVE,
        bye: [
          S('somchai', '...ลูกพ่อ', '...my boy.', { tone: 'whisper', pause: 1.0 }),
          S('somchai', 'ลาก่อนนะต้น', 'Goodbye, Ton.', { tone: 'whisper', emotion: 'smile' }),
        ],
        wait: [
          S('somchai', 'พ่อไม่ได้ไปไหนหรอก', "I'm not going anywhere.", { tone: 'whisper' }),
          S('somchai', 'พ่ออยู่ข้างหลังลูกตรงนี้แหละ... อย่าหันนะ', "I'm right here behind you... don't turn.", { tone: 'whisper', emotion: 'sad' }),
        ],
      },
    }),
    forgive: FORGIVE, // reference copy of the 'sorry' branch
    // As he walks into the mist (every reply except 'sorry', which says it all).
    walkAway: [S('somchai', 'พ่อภูมิใจในตัวลูกนะ', "I'm proud of you, son.", { tone: 'whisper', emotion: 'smile' })],
    // Looked back at the gate (ending 'endless').
    endless: [S('somchai', '...ลูกพ่อ', '...my boy.', { tone: 'whisper', emotion: 'sad' })],
    // The empty dawn drive folds back to the shrine fork one last time. Ah Kong, through the radio.
    lastFork: [S('ahKong', 'เช้าแล้ว... ลื้อจะกลับบ้านทางไหน', 'Morning now... which way home will you take?', { tone: 'ghost' })],
  },
};
