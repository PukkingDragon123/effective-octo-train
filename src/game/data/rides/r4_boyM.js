// Ride 4 — 00:00 — น้องเอ็ม Little M (GHOST, exists ONLY in reflections → LEFT).
// Surreal phase, and the saddest ride. Exception to rule 4: he HAS a reflection but he is a ghost.
// Rule 6: the radio switches itself on; he politely asks you to turn it off.
import { P, Y, T, C } from '../lines.js';

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
    extra: ['Door opens by itself; meter starts by itself.', 'Direct view: empty seat. Mirror: a boy in uniform.', 'Outdated detail: school uniform of an old pattern, lunchbox with a cartoon from years ago.'],
  },
  specialRules: [
    { rule: 'r1', note: 'Nobody visible hails: the empty bus stop IS the pickup. Driving past folds the road.' },
    { rule: 'r6', at: 0.22, note: 'Radio turns itself on (static + a warped children\'s tune); he asks for it off. Grace 8 s.' },
    { rule: 'r4', exception: 'hasReflection', note: 'He has a reflection but is a ghost: rule 4 does not identify him.' },
    { rule: 'r3', lookBack: 'warn', note: 'Turning round shows an empty seat; soft line, no death.' },
  ],
  encounters: [
    { id: 'krasue', at: 0.12 },
    { id: 'radioSelfOn', at: 0.22 },
    { id: 'somethingEnormous', at: 0.5, optional: true },
  ],
  wrongAftermath: 'reflectionStays',
  deathOnWrong: 'dragBack',
  memoryHooks: [],
  dialogue: {
    hail: [P('รอด้วยครับ...', 'Wait for me...', { tone: 'whisper' })],
    greet: [
      T('ไม่มีใครอยู่ที่ป้ายเลย... แต่ประตูเปิดเอง', "There's no one at the stop... but the door just opened."),
      T('มิเตอร์... เดินเองด้วย', 'And the meter... started on its own.'),
      P('สวัสดีครับ', 'Hello, mister.', { action: 'wai', emotion: 'smile' }),
      T('ในกระจก... มีเด็กนั่งอยู่', "In the mirror... there's a kid sitting there."),
    ],
    destination: [
      P('ไปบ้านผมครับ เลยศาลเจ้าไปนิดเดียว', "To my house, please. Just past the shrine."),
      P('แม่รอกินข้าวอยู่ครับ วันนี้แม่ทำไข่เจียว', "Mum's waiting with dinner. She's making omelette tonight.", { emotion: 'smile' }),
    ],
    beats: [
      {
        id: 'krasue',
        trigger: { type: 'event', event: 'encounter:krasue' },
        lines: [P('พี่ครับ มีไฟลอยอยู่ตรงต้นกล้วยแน่ะ... สวยจัง', 'Mister, there\'s a light floating by the banana trees... pretty.', { emotion: 'surprise' })],
      },
      {
        id: 'radioSelfOn',
        trigger: { type: 'event', event: 'encounter:radioSelfOn' },
        lines: [
          T('วิทยุ... เปิดเอง', 'The radio... turned itself on.'),
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
        id: 'meterBackward',
        trigger: { type: 'event', event: 'meterGlitch' },
        lines: [T('มิเตอร์... วิ่งถอยหลัง', "The meter's... running backwards.")],
      },
      {
        id: 'stars',
        trigger: { type: 'progress', at: 0.34 },
        lines: [
          P('วันนี้ครูให้ดาวผมตั้งสามดวงแน่ะ', 'Teacher gave me three stars today.', { emotion: 'smile' }),
          P('จะเอาไปอวดแม่', "I'm going to show Mum."),
        ],
      },
      {
        id: 'turnAround',
        trigger: { type: 'progress', at: 0.44 },
        lines: [
          P('พี่ครับ... ทำไมพี่ไม่หันมาคุยกับผมล่ะ', "Mister... why don't you turn round and talk to me?"),
          C([
            { key: 'driving', th: 'พี่ขับรถอยู่ไง', en: "I'm driving, kiddo." },
            { key: 'silent', th: '(เงียบ)', en: '(say nothing)' },
          ], {
            timeout: 7,
            branches: {
              driving: [P('อ๋อ จริงด้วย ขับรถต้องมองถนน ครูบอก', 'Oh, right. When you drive you watch the road. Teacher said.', { emotion: 'smile' })],
              silent: [P('ไม่เป็นไรครับ ผมชินแล้ว ไม่มีใครเห็นผมหรอก', "It's okay. I'm used to it. Nobody sees me anyway.", { emotion: 'sad' })],
            },
          }),
        ],
      },
      {
        id: 'theTruck',
        trigger: { type: 'progress', at: 0.56 },
        lines: [
          P('รถคันใหญ่ ๆ มันขับเร็วมากเลยครับ ไฟจ้ามาก', 'The big truck was going so fast. Its lights were so bright.', { emotion: 'sad' }),
          P('แล้วผมก็... หลับไป', 'And then I... fell asleep.', { tone: 'whisper', pause: 1.2 }),
        ],
      },
      {
        id: 'coldDinner',
        trigger: { type: 'progress', at: 0.7 },
        lines: [P('แม่คงรอนานแล้ว... ข้าวคงเย็นหมดแล้ว', "Mum must've waited ages... dinner must be cold by now.", { emotion: 'sad' })],
      },
      {
        id: 'tellMum',
        trigger: { type: 'progress', at: 0.84 },
        lines: [
          P('พี่ครับ ถ้าเจอแม่ผม บอกแม่ด้วยนะครับ...', 'Mister, if you ever see my mum, tell her...', { emotion: 'sad' }),
          P('ว่าผมไม่เจ็บแล้ว', "...that it doesn't hurt any more.", { tone: 'whisper', pause: 1.5 }),
          Y('...ได้ครับ', '...I will.'),
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
      P('ข้าวกล่องผมยังไม่ได้กินเลย แม่ทำให้', "I never ate my lunchbox. Mum made it."),
    ],
    onLookBack: [P('พี่หันมาก็ไม่เห็นผมหรอกครับ... ดูในกระจกสิ', "You won't see me if you turn round... look in the mirror.", { emotion: 'sad' })],
    onFaceGaze: [P('พี่มองผมในกระจกอยู่ใช่ไหม ผมเห็นนะ', "You're watching me in the mirror, aren't you? I can see you.", { emotion: 'smile' })],
  },
};
