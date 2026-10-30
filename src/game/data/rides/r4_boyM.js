// Ride 4 — 00:00 — น้องเอ็ม Little M (GHOST, exists ONLY in reflections → LEFT).
// Surreal phase, and the saddest ride. Exception to rule 4: he HAS a reflection but he is a ghost.
// Rule 6: the radio switches itself on; he politely asks you to turn it off.
// Rule 16 (back of the paper): a second child sits beside him in the mirror — and HE asks you who
// she is. Asking is the break; telling M not to look is safe; silence is safe.
// Replies: hello, stars, turnAround, extra child (r16 trap), tellMum.
import { P, S, C, O, SIL, tr } from '../lines.js';

export const RIDE_BOY_M = {
  id: 'boyM',
  order: 4,
  hour: 24,
  pickup: 'busStop',
  characterId: 'boyM',
  identity: 'ghost',
  fork: 'left',
  seat: 'rearLeft',
  destination: { th: 'บ้านน้องเอ็ม', en: "M's house" },
  clues: {
    reflection: 'only', shadow: false, breathFog: false, weightKg: 0, meter: 'backward',
    radioStatic: 0.5, blinks: true, feetFloat: false,
    payment: { type: 'leaves', amountTHB: 10, note: { th: 'ในกระจกคือเหรียญสิบ บนเบาะจริงคือใบลีลาวดีแห้ง', en: 'In the mirror: a ten-baht coin. On the real seat: a dry frangipani leaf.' } },
    smell: 'rain-on-asphalt',
    extra: ['Door opens by itself; meter starts by itself.', 'Direct view: empty seat. Mirror: a boy in uniform.', 'Outdated detail: "I\'ve been in third grade for years" (ask his grade).'],
  },
  specialRules: [
    { rule: 'r1', note: 'Nobody visible hails: the empty bus stop IS the pickup. Driving past folds the road.' },
    { rule: 'r6', at: 0.22, note: 'Radio turns itself on (static + a warped children\'s tune); he asks for it off. Grace 8 s.' },
    { rule: 'r16', at: 0.63, note: 'A second child in the mirror only. M asks who she is: replying "who" = ruleBreak r16.' },
    { rule: 'r4', exception: 'hasReflection', note: 'He has a reflection but is a ghost: rule 4 does not identify him.' },
    { rule: 'r3', lookBack: 'warn', note: 'Turning round shows an empty seat; soft line, no death.' },
  ],
  encounters: [
    { id: 'krasue', at: 0.16 },
    { id: 'radioSelfOn', at: 0.22 },
    { id: 'somethingEnormous', at: 0.5, optional: true },
    { id: 'extraPassenger', at: 0.63 },
    { id: 'twistedNeckReflection', at: 0.9, optional: true }, // or as the rule-6 escalation
  ],
  wrongAftermath: 'reflectionStays',
  deathOnWrong: 'dragBack',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 150, stretch: 'fog' }, // from midnight on the road grows longer than it should
  dialogue: {
    hail: [P('รอด้วยครับ...', 'Wait for me...', { tone: 'whisper' })],
    // Nobody at the stop; the door opens by itself; a voice from an empty seat. The world says it, not text.
    greet: [
      P('สวัสดีครับ', 'Hello, mister.', { action: 'wai', emotion: 'smile' }),
      P('พี่... เคยมารับผมแล้วใช่ไหมครับ', "Mister... you've picked me up before, haven't you?", { emotion: 'surprise', if: { loopsGte: 1, loopsLt: 3 } }),
      P('พี่มาอีกแล้ว... คราวนี้พาผมกลับบ้านนะครับ', 'You came again... take me home this time, okay?', { emotion: 'sad', if: { loopsGte: 3 } }),
      C([
        O('hello', 'สวัสดีครับน้อง', 'Hello there, kiddo.'),
        O('who', 'ใครพูดน่ะ', 'Who said that?'),
        SIL(),
      ], {
        id: 'boyM_hello',
        timeout: 7,
        setOnPick: { hello: tr('boyM', 'hello') },
        branches: {
          hello: [P('พี่ใจดีจัง คันอื่นไม่ยอมจอดเลย', "You're nice, mister. The others never stop.", { emotion: 'smile' })],
          who: [
            P('ผมเองครับ... ข้างหลังนี่ไง', 'Me... back here.'),
            P('ดูในกระจกสิครับ', 'Look in the mirror.'),
          ],
          silent: [P('พี่ไม่ได้ยินผมเหรอครับ... ดูในกระจกสิ', "Can't you hear me, mister? ...Look in the mirror.", { emotion: 'sad' })],
        },
      }),
    ],
    destination: [
      P('ไปบ้านผมครับ เลยศาลเจ้าไปนิดเดียว', 'To my house, please. Just past the shrine.'),
      P('แม่รอกินข้าวอยู่ครับ วันนี้แม่ทำไข่เจียว', "Mum's waiting with dinner. She's making omelette tonight.", { emotion: 'smile' }),
    ],
    loopVariants: {
      hail: { 1: [P('พี่ครับ... รอผมด้วย', 'Mister... wait for me.', { tone: 'whisper' })] },
    },
    beats: [
      {
        id: 'krasue',
        trigger: { type: 'event', event: 'encounter:krasue' },
        lines: [P('พี่ครับ มีไฟลอยอยู่ตรงต้นกล้วยแน่ะ... สวยจัง', "Mister, there's a light floating by the banana trees... pretty.", { emotion: 'surprise' })],
      },
      {
        id: 'radioSelfOn',
        trigger: { type: 'event', event: 'encounter:radioSelfOn' },
        lines: [
          P('พี่ครับ... ปิดวิทยุได้ไหมครับ', 'Mister... could you turn off the radio?', { tone: 'whisper', emotion: 'fear' }),
          P('ผมไม่ชอบเสียงซ่า ๆ มันเหมือนคืนนั้น', "I don't like the crackling. It's like that night."),
        ],
        effects: [{ type: 'rule', id: 'r6', arm: true }],
      },
      {
        id: 'radioOffThanks',
        trigger: { type: 'event', event: 'radioOff' },
        lines: [P('ขอบคุณครับ', 'Thank you.', { emotion: 'smile' })],
      },
      {
        id: 'radioIgnored',
        trigger: { type: 'event', event: 'radioIgnored' },
        lines: [P('พี่ครับ... ปิด... วิทยุ...', 'Mister... TURN... IT... OFF...', { tone: 'ghost', emotion: 'anger' })],
      },
      {
        id: 'stars',
        trigger: { type: 'progress', at: 0.34 },
        lines: [
          P('วันนี้ครูให้ดาวผมตั้งสามดวงแน่ะ', 'Teacher gave me three stars today.', { emotion: 'smile' }),
          P('จะเอาไปอวดแม่', "I'm going to show Mum."),
          C([
            O('wow', 'เก่งมากเลย', 'Well done!'),
            O('grade', 'น้องเรียนชั้นไหนแล้ว', 'What grade are you in?'),
            SIL(),
          ], {
            id: 'boyM_stars',
            timeout: 7,
            setOnPick: { wow: tr('boyM', 'stars'), grade: { 'clue.boyM.grade': true } },
            branches: {
              wow: [P('แม่ต้องดีใจแน่ ๆ เลย', "Mum'll be so happy.", { emotion: 'smile' })],
              grade: [
                P('ป.สามครับ', 'Third grade.'),
                P('ป.สามมาหลายปีแล้ว...', "I've been in third grade for years...", { tone: 'whisper', emotion: 'sad', pause: 1.0 }),
              ],
              silent: [P('พี่ไม่ชอบคุยเหรอครับ', "Don't you like talking, mister?")],
            },
          }),
        ],
      },
      {
        id: 'turnAround',
        trigger: { type: 'progress', at: 0.45 },
        lines: [
          P('พี่ครับ... ทำไมพี่ไม่หันมาคุยกับผมล่ะ', "Mister... why don't you turn round and talk to me?"),
          C([
            O('driving', 'พี่ขับรถอยู่ไง', "I'm driving, kiddo."),
            O('mirror', 'พี่เห็นน้องในกระจก', 'I can see you in the mirror.'),
            SIL(),
          ], {
            id: 'boyM_turnAround',
            timeout: 7,
            setOnPick: { driving: tr('boyM', 'driving'), mirror: tr('boyM', 'mirror') },
            branches: {
              driving: [P('อ๋อ จริงด้วย ขับรถต้องมองถนน ครูบอก', 'Oh, right. When you drive you watch the road. Teacher said.', { emotion: 'smile' })],
              mirror: [
                P('จริงเหรอครับ!', 'Really?', { emotion: 'surprise' }),
                P('ผมโบกมือให้นะ เห็นไหม', "I'm waving, see?", { action: 'wave', emotion: 'smile' }),
              ],
              silent: [P('ไม่เป็นไรครับ ผมชินแล้ว ไม่มีใครเห็นผมหรอก', "It's okay. I'm used to it. Nobody sees me anyway.", { emotion: 'sad' })],
            },
          }),
        ],
      },
      {
        id: 'theTruck',
        trigger: { type: 'progress', at: 0.55 },
        lines: [
          P('รถคันใหญ่ ๆ มันขับเร็วมากเลยครับ ไฟจ้ามาก', 'The big truck was going so fast. Its lights were so bright.', { emotion: 'sad' }),
          P('แล้วผมก็... หลับไป', 'And then I... fell asleep.', { tone: 'whisper', pause: 1.2 }),
        ],
      },
      {
        // r16: one more in the mirror than got in. The temptation comes from the child you DO see.
        id: 'extraChild',
        trigger: { type: 'event', event: 'encounter:extraPassenger' },
        lines: [
          P('พี่ครับ...', 'Mister...', { tone: 'whisper' }),
          P('คนที่นั่งข้างผม... เป็นใครครับ', 'The girl sitting next to me... who is she?', { tone: 'whisper', emotion: 'fear' }),
          C([
            O('ask', 'ใครนั่งข้างน้อง', "Who's next to you?"),
            O('hush', 'อย่าหันไปนะน้อง', "Don't look at her, kiddo."),
            SIL(),
          ], {
            id: 'boyM_extra',
            timeout: 7,
            setOnPick: { ask: { ruleBreak: 'r16' }, hush: tr('boyM', 'hush') },
            branches: {
              ask: [
                S('extraChild', 'หนูเอง...', "It's me...", { tone: 'ghost' }),
                S('extraChild', 'พี่ถามถึงหนูแล้วนะ', 'You asked about me.', { tone: 'whisper' }),
              ],
              hush: [
                P('ครับ... ผมไม่หัน', "Okay... I won't look.", { tone: 'whisper' }),
                P('...เขายิ้มอยู่ครับพี่', "...she's smiling, mister.", { tone: 'whisper', emotion: 'fear' }),
              ],
            },
          }),
        ],
      },
      {
        id: 'extraGone',
        trigger: { type: 'event', event: 'encounterEnd:extraPassenger' },
        lines: [P('...เขาไปแล้วครับพี่', "...she's gone, mister.", { tone: 'whisper', pause: 0.8 })],
      },
      {
        id: 'coldDinner',
        trigger: { type: 'progress', at: 0.72 },
        lines: [P('แม่คงรอนานแล้ว... ข้าวคงเย็นหมดแล้ว', "Mum must've waited ages... dinner must be cold by now.", { emotion: 'sad' })],
      },
      {
        id: 'tellMum',
        essential: true,
        trigger: { type: 'progress', at: 0.8 },
        lines: [
          P('พี่ครับ ถ้าเจอแม่ผม บอกแม่ด้วยนะครับ...', 'Mister, if you ever see my mum, tell her...', { emotion: 'sad' }),
          P('ว่าผมไม่เจ็บแล้ว', "...that it doesn't hurt any more.", { tone: 'whisper', pause: 1.2 }),
          C([
            O('promise', 'พี่สัญญา', 'I promise.'),
            // learned from the drag-back: tell him where home is now
            O('left', 'บ้านน้องอยู่ทางซ้ายนะ', "Your home's down the left road.", { if: { diedOn: 'boyM' } }),
            SIL(),
          ], {
            id: 'boyM_tellMum',
            timeout: 8,
            // promisedM: the dawn endings stop at the KM 11 bus stop for his mother
            setOnPick: { promise: { promisedM: true, ...tr('boyM', 'promise') }, left: tr('boyM', 'home') },
            branches: {
              promise: [P('ขอบคุณครับพี่', 'Thank you, mister.', { emotion: 'smile' })],
              left: [
                P('...ทางซ้ายเหรอครับ', '...the left road?', { tone: 'whisper' }),
                P('ยายรออยู่ทางนั้นใช่ไหม', "Grandma's waiting down there, isn't she?", { emotion: 'smile' }),
              ],
              silent: [P('...นะครับ', '...please?', { tone: 'whisper', emotion: 'sad' })],
            },
          }),
        ],
      },
      {
        id: 'lightOn',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('เปิดไฟดีจังครับ ผมกลัวมืด', "The light's nice. I'm scared of the dark.", { emotion: 'smile' })],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้วครับ! ผมเห็นยายแล้ว ยายมารับ', "We're here! I can see Grandma. She came to get me!", { emotion: 'smile' }),
      P('บอกแม่ด้วยนะครับ ว่าไม่ต้องรอผมแล้ว', "Tell Mum she doesn't have to wait for me any more."),
      P('ขอบคุณที่มาส่งนะครับพี่', 'Thanks for taking me, mister.', { action: 'wai' }),
    ],
    arriveWrong: [
      P('นี่ไม่ใช่ทางบ้านผม...', "This isn't the way home..."),
      P('พี่ครับ ผมลงไม่ได้ ประตูไม่เปิด', "Mister, I can't get out. The door won't open.", { emotion: 'fear' }),
      P('พี่จะพาผมไปไหน... ผมจะกลับบ้าน!', 'Where are you taking me... I want to go HOME!', { tone: 'shout', emotion: 'fear' }),
    ],
    idle: [
      P('♪ หนึ่ง สอง สาม ข้ามถนน มองซ้ายมองขวา... ♪', '♪ One, two, three, cross the road, look left, look right... ♪', { tone: 'sing' }),
      P('ผมหิวแล้วครับ', "I'm hungry."),
      P('พี่มีลูกไหมครับ', 'Do you have kids, mister?'),
      P('ข้าวกล่องผมยังไม่ได้กินเลย แม่ทำให้', 'I never ate my lunchbox. Mum made it.'),
    ],
    onLookBack: [P('พี่หันมาก็ไม่เห็นผมหรอกครับ... ดูในกระจกสิ', "You won't see me if you turn round... look in the mirror.", { emotion: 'sad' })],
    onFaceGaze: [P('พี่มองผมในกระจกอยู่ใช่ไหม ผมเห็นนะ', "You're watching me in the mirror, aren't you? I can see you.", { emotion: 'smile' })],
  },
};
