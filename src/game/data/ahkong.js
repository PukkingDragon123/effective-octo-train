// AH KONG (อากง): garage intro, the interactive tutorial, loop restarts, the time-skip
// offer, his late-night radio cameo and the final reveal at Ma Ruay Shrine.
// He is an old Thai-Chinese man: gruff, dry humour, uses ลื้อ/อั๊ว (you/I), calls Ton
// "ไอ้หนุ่ม". He is secretly the shrine's guardian spirit — he never says so.
//
// Exports
//   INTRO_GARAGE: [Line]                    arrival cinematic (keys + paper are handed over mid-scene: see `action`/`set`)
//   TUTORIAL_STEPS: [Step]                  in order. Step = {
//       id, th, en (Ah Kong's instruction line(s): `lines` array of Line),
//       hint: { th, en, keys:[key labels] }, waitFor: WaitFor | { auto: WaitFor, manual: WaitFor } (transmission setting),
//       after?: [Line] (said when the step completes), skippable?: bool, memory?: memory id unlocked }
//     WaitFor types:
//       { type:'interact', id }                         interact:use with that id
//       { type:'enterVehicle' }                          player sits in the driver's seat
//       { type:'control', control, value }               taxi:control (value '*' = any change; valueNot: x = anything but x;
//                                                        min: n = numeric value >= n)
//       { type:'drive', meters }                         distance driven
//       { type:'speedKmh', min?, max? }                  speed reached / dropped to
//       { type:'stop' }                                  speed < 1 km/h after moving
//       { type:'steer', amount }                         |steer| >= amount both left and right
//       { type:'look', target, seconds }                 taxi.getGazeTarget() === target for seconds
//       { type:'hold', item, seconds }                   e.g. amulet held this long
//       { type:'paper', seconds }                        rules paper raised this long
//   SEND_OFF: [Line]
//   GARAGE_IDLE: [Line]                     random nudges if the player dawdles
//   RESTART_LINES: [{ minLoop, lines:[Line] }] pick the highest minLoop <= saves.data.loops
//   DEATH_HINTS: { deathType: [Line] }      one hint after a death of that type (said after the restart line)
//   TIME_SKIP: { offer:Line, choice:Line(choice), accept:[Line], decline:[Line], minDeaths }
//   RADIO_CAMEO: { hours:[from,to], station, lines:[Line] }
//   SHRINE_REVEAL: [Line]                   final statue scene (dawn/forgive)
import { CHARACTERS } from './characters.js';

const K = (th, en, x = {}) => ({ who: 'ahKong', th, en, ...x });
const Y = (th, en, x = {}) => ({ who: 'player', th, en, ...x });
const T = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });

export const AH_KONG = CHARACTERS.ahKong;

export const INTRO_GARAGE = [
  K('มาแล้วเหรอ... นึกว่าจะไม่มาซะแล้ว', "So you came... thought you wouldn't.", { action: 'smoke' }),
  K('ลื้อคือคนที่จะมาขับกะดึกใช่ไหม', "You're the one for the night shift?"),
  Y('ครับ ได้ข้อความมา', 'Yeah. I got a message.'),
  K('อั๊วชื่อกง เรียกอากงก็ได้', "Name's Kong. Call me Ah Kong.", { action: 'nod' }),
  K('หน้าตาลื้อ... คุ้น ๆ นะ', 'Your face... looks familiar.', { pause: 1.2 }),
  K('ช่างเถอะ คนแก่ตาไม่ค่อยดี', "Never mind. An old man's eyes."),
  K('รถคันนั้น เขียวเหลือง เก่าหน่อยแต่ใจถึง', 'That cab. Green and yellow. Old, but she\'s got heart.', { action: 'point' }),
  T('ทะเบียนนี้... คุ้นจัง', 'That number plate... feels familiar.'),
  K('กุญแจ เอาไป', 'Keys. Take them.', { action: 'giveItem', set: { hasKeys: true } }),
  K('แล้วก็นี่... กฎ', 'And this... the rules.', { action: 'giveItem', set: { hasPaper: true } }),
  K('อ่านให้จำ อย่าทำหาย', "Learn them. Don't lose it."),
  K('กะดึกเส้นนี้ ไม่ได้ยากเพราะถนนหรอก', "This shift isn't hard because of the road."),
  K('ยากเพราะคนที่โบกเรียกนั่นแหละ', "It's hard because of who flags you down."),
  Y('ค่าแรงเท่าไหร่ครับ', "What's the pay?"),
  K('ส่งครบทุกคนจนถึงเช้า ลื้อจะได้มากกว่าเงิน', "Get everyone where they're going till morning. You'll get more than money."),
  K('ซ้ายหรือขวา ส่งให้ถูกทาง อย่าพลาด', 'Left or right. Take each one the right way. Don\'t get it wrong.'),
  Y('...แล้วถ้าพลาดล่ะครับ', '...and if I do?'),
  K('ก็กลับมาเจออั๊วที่นี่ไง', "Then you come back here. To me.", { emotion: 'smile', action: 'smoke', pause: 1.0 }),
];

export const TUTORIAL_STEPS = [
  {
    id: 'readPaper',
    lines: [K('อ่านกฎก่อน ทุกข้อ ช้า ๆ', 'Read the rules first. Every one. Slowly.')],
    hint: { th: 'กด Tab หรือ J เพื่อยกกระดาษกฎขึ้นอ่าน', en: 'Press Tab or J to raise the rules paper', keys: ['Tab', 'J'] },
    waitFor: { type: 'paper', seconds: 3 },
    after: [K('ข้อสามสำคัญที่สุด จำไว้', 'Rule three matters most. Remember that.')],
  },
  {
    id: 'openDoor',
    lines: [K('ประตูคนขับอยู่ขวา รถพวงมาลัยขวา', "Driver's door is on the right. Right-hand drive.")],
    hint: { th: 'มองที่มือจับประตูแล้วกด F', en: 'Look at the door handle and press F', keys: ['F'] },
    waitFor: { type: 'interact', id: 'taxi.door_fr' },
  },
  {
    id: 'sit',
    lines: [K('ขึ้นไปนั่ง', 'Get in.')],
    hint: { th: 'กด V เพื่อขึ้นรถ', en: 'Press V to get in', keys: ['V'] },
    waitFor: { type: 'enterVehicle' },
    after: [T('เบาะ... ยุบเป็นรูปคนนั่งมานาน', 'The seat... worn into the shape of someone who sat here for years.')],
  },
  {
    id: 'insertKey',
    lines: [K('กุญแจเสียบข้างพวงมาลัย ทางขวามือ', 'Key goes in right of the wheel.')],
    hint: { th: 'มองที่รูกุญแจแล้วกด F', en: 'Look at the ignition and press F', keys: ['F'] },
    waitFor: { type: 'control', control: 'key', value: true },
  },
  {
    id: 'startEngine',
    lines: [K('บิดเลย ถ้าไม่ติดก็บิดอีกที รถมันขี้เกียจ', "Turn it. Doesn't catch, turn it again. She's lazy.")],
    hint: { th: 'กด F ที่กุญแจอีกครั้งเพื่อสตาร์ท', en: 'Press F on the key again to start the engine', keys: ['F'] },
    waitFor: { type: 'control', control: 'ignition', value: 'start' },
    after: [K('ฟังเสียงเครื่องสิ ยังดีอยู่', 'Listen to that engine. Still sweet.', { emotion: 'smile' })],
  },
  {
    id: 'headlights',
    lines: [K('เปิดไฟหน้า ป่านี้มืดกว่าที่ลื้อคิด', 'Headlights. This forest is darker than you think.')],
    hint: { th: 'กด L เพื่อเปิดไฟหน้า', en: 'Press L for the headlights', keys: ['L'] },
    waitFor: { type: 'control', control: 'headlights', valueNot: 'off' },
  },
  {
    id: 'handbrake',
    lines: [K('ปลดเบรกมือ', 'Handbrake off.')],
    hint: { th: 'กด Space เพื่อปลดเบรกมือ', en: 'Press Space to release the handbrake', keys: ['Space'] },
    waitFor: { type: 'control', control: 'handbrake', value: false },
  },
  {
    id: 'gear',
    lines: {
      auto: [K('เข้าเกียร์ดี', 'Put her in D.')],
      manual: [K('เหยียบคลัตช์ เข้าเกียร์หนึ่ง', 'Clutch in. First gear.')],
    },
    hint: {
      auto: { th: 'กด X เพื่อเข้าเกียร์ D', en: 'Press X to shift into D', keys: ['X'] },
      manual: { th: 'กด X เพื่อเข้าเกียร์ 1 (Z ลดเกียร์)', en: 'Press X for 1st gear (Z shifts down)', keys: ['X', 'Z'] },
    },
    waitFor: {
      auto: { type: 'control', control: 'gear', value: 'D' },
      manual: { type: 'control', control: 'gear', value: 1 },
    },
  },
  {
    id: 'accelerate',
    lines: [K('ค่อย ๆ เหยียบคันเร่ง', 'Easy on the throttle.')],
    hint: { th: 'กด W ค้างไว้เพื่อเร่ง', en: 'Hold W to accelerate', keys: ['W'] },
    waitFor: { type: 'drive', meters: 12 },
  },
  {
    id: 'brake',
    lines: [K('เบรก!', 'Brake!', { tone: 'shout' })],
    hint: { th: 'กด S เพื่อเบรก', en: 'Press S to brake', keys: ['S'] },
    waitFor: { type: 'stop' },
    after: [K('ดี เบรกมันดื้อ ต้องเหยียบลึก ๆ', 'Good. Brakes are sticky. Push them deep.')],
  },
  {
    id: 'steer',
    lines: [K('ลองเลี้ยวซ้ายขวาดู พวงมาลัยหนักหน่อย', 'Try steering left and right. The wheel\'s a bit heavy.')],
    hint: { th: 'A / D เพื่อเลี้ยว', en: 'A / D to steer', keys: ['A', 'D'] },
    waitFor: { type: 'steer', amount: 0.6 },
  },
  {
    id: 'indicator',
    lines: [K('ไฟเลี้ยว จะจอดรับคนก็เปิดไฟเลี้ยวซ้าย', 'Indicator. Pulling in for a fare, signal left.')],
    hint: { th: 'กด 1 เลี้ยวซ้าย / 2 เลี้ยวขวา', en: 'Press 1 for left / 2 for right indicator', keys: ['1', '2'] },
    waitFor: { type: 'control', control: 'indicator', value: 'left' },
  },
  {
    id: 'wipers',
    lines: [K('ที่ปัดน้ำฝน คืนนี้ฝนตกแน่', "Wipers. It'll rain tonight, sure as anything.")],
    hint: { th: 'กด 3 เพื่อเปิดที่ปัดน้ำฝน', en: 'Press 3 for the wipers', keys: ['3'] },
    waitFor: { type: 'control', control: 'wipers', min: 1 },
  },
  {
    id: 'cabinLight',
    lines: [K('ไฟในรถ เปิดดูซิ', 'Cabin light. Try it.')],
    hint: { th: 'กด C เพื่อเปิด/ปิดไฟในรถ', en: 'Press C for the cabin light', keys: ['C'] },
    waitFor: { type: 'control', control: 'cabinLight', value: true },
    after: [K('ไฟดวงนั้น บางทีมันก็ดับเองนะ...', 'That light... sometimes it goes out on its own.', { tone: 'whisper' })],
  },
  {
    id: 'radio',
    lines: [K('วิทยุ คลื่นสามเพลงเก่าเพราะ ๆ', 'Radio. Station three plays good old songs.')],
    hint: { th: 'กด 4 เปิดวิทยุ / 5 เปลี่ยนคลื่น', en: 'Press 4 for the radio / 5 to tune', keys: ['4', '5'] },
    waitFor: { type: 'control', control: 'radio', value: true },
  },
  {
    id: 'meterOn',
    lines: [
      K('มิเตอร์ รับคนแล้วต้องกดทุกครั้ง', 'The meter. Every fare, you press it.'),
      K('ไฟ "ว่าง" สีแดงบนหลังคาจะดับ คนจะได้รู้ว่ารถไม่ว่าง', 'The red "vacant" lamp on the roof goes off, so people know you\'re taken.'),
    ],
    hint: { th: 'กด M เพื่อกดมิเตอร์', en: 'Press M for the meter', keys: ['M'] },
    waitFor: { type: 'control', control: 'meter', value: true },
  },
  {
    id: 'meterOff',
    lines: [K('กดอีกที ไฟว่างติด ออกไปหาผู้โดยสารได้', 'Press it again. Vacant lamp on. Ready for fares.')],
    hint: { th: 'กด M อีกครั้ง', en: 'Press M again', keys: ['M'] },
    waitFor: { type: 'control', control: 'meter', value: false },
  },
  {
    id: 'window',
    lines: [K('กระจกต้องหมุนเอง รถเก่า', 'You crank the window yourself. Old car.')],
    hint: { th: 'กด T หรือมองที่มือหมุนแล้วกด F', en: 'Press T, or look at the crank and press F', keys: ['T', 'F'] },
    waitFor: { type: 'control', control: 'window', min: 0.3 },
    after: [K('แต่ถ้ามีเสียงเรียกชื่อลื้อจากข้างนอก... อย่าเปิด', "But if a voice outside calls your name... don't open it.", { tone: 'whisper' })],
  },
  {
    id: 'mirrorRear',
    lines: [K('ดูกระจกหลัง', 'Check the rear-view mirror.')],
    hint: { th: 'มองที่กระจกมองหลัง', en: 'Look at the rear-view mirror', keys: [] },
    waitFor: { type: 'look', target: 'mirror_rear', seconds: 0.8 },
  },
  {
    id: 'mirrorLeft',
    lines: [K('กระจกข้างซ้าย', 'Left side mirror.')],
    hint: { th: 'มองกระจกข้างซ้าย (Q เอียงตัว)', en: 'Look at the left side mirror (Q to lean)', keys: ['Q'] },
    waitFor: { type: 'look', target: 'mirror_left', seconds: 0.8 },
  },
  {
    id: 'mirrorRight',
    lines: [K('ขวา', 'Right.')],
    hint: { th: 'มองกระจกข้างขวา (E เอียงตัว)', en: 'Look at the right side mirror (E to lean)', keys: ['E'] },
    waitFor: { type: 'look', target: 'mirror_right', seconds: 0.8 },
    after: [K('จำไว้ อยากรู้ว่าข้างหลังมีอะไร ดูกระจก ห้ามหัน', 'Remember. Want to know what\'s behind you? Use the mirrors. Never turn round.')],
  },
  {
    id: 'amulet',
    lines: [K('พระที่ห้อยหน้ารถ ลองกำดู', 'The amulet on the mirror. Hold it.')],
    hint: { th: 'กด G ค้างไว้เพื่อกำพระ', en: 'Hold G to grip the amulet', keys: ['G'] },
    waitFor: { type: 'hold', item: 'amulet', seconds: 1.5 },
    memory: 'm_amulet',
    after: [
      K('ของเจ้าของรถคนเก่า... เขาฝากไว้', 'It belonged to the old owner... he left it in your care.'),
      K('ร้อนขึ้นมาเมื่อไหร่ แปลว่าคนข้างหลังไม่ใช่คน', 'If it ever grows warm, whoever\'s behind you isn\'t human.', { tone: 'whisper' }),
    ],
  },
];

export const SEND_OFF = [
  K('ไปได้แล้ว ไอ้หนุ่ม... อย่าลืมกฎล่ะ', "Off you go, young man... don't forget the rules.", { action: 'wave' }),
  K('ผ่านศาลก็บีบแตรสองที ขอทางเจ้าที่ด้วย', 'And honk twice at the shrines. Ask the spirits for passage.'),
];

export const GARAGE_IDLE = [
  K('ยืนทำอะไร รถไม่ขับตัวเองนะ', "What're you standing there for? The cab won't drive itself."),
  K('ยุงเยอะ รีบ ๆ หน่อย', 'Mosquitoes are biting. Get a move on.'),
  K('ตุ๊กแกร้องแล้ว... สามทุ่มพอดี', 'There goes the gecko... nine o\'clock on the dot.'),
];

/** Said when the loop restarts at 21:00. Pick the entry with the highest minLoop <= loops. */
export const RESTART_LINES = [
  { minLoop: 1, lines: [K('อีกรอบแล้วสินะ', 'Again, huh?', { action: 'smoke' }), K('นั่งก่อน หายใจลึก ๆ', 'Sit. Breathe deep.')] },
  { minLoop: 2, lines: [K('อีกรอบแล้วสินะ... ไม่เป็นไร คืนนี้ยังยาว', "Again, huh... that's all right. The night's still long.")] },
  { minLoop: 3, lines: [K('ลื้อตายเก่งกว่าคนขับคนก่อนอีกนะ', 'You die better than the last driver did.'), K('ไม่ได้ชมนะ', 'That wasn\'t a compliment.', { emotion: 'smile' })] },
  { minLoop: 4, lines: [K('อั๊วชงชาไว้ให้แล้ว รู้ว่าลื้อต้องกลับมา', 'I made you tea. Knew you\'d be back.', { action: 'giveItem' })] },
  {
    minLoop: 5,
    lines: [
      K('อ่านกฎอีกที ช้า ๆ ทุกบรรทัด', 'Read the rules again. Slowly. Every line.'),
      K('บางบรรทัดมันซ่อนอยู่ ต้องโดนน้ำหรือโดนไฟถึงจะเห็น', 'Some lines hide. Wet the paper, or hold it to the light.', { tone: 'whisper' }),
    ],
  },
  { minLoop: 8, lines: [K('ลื้อดื้อเหมือนพ่อลื้อเลย', "You're as stubborn as your father.", { emotion: 'smile', pause: 1.0 }), T('...พ่อ?', '...my father?')] },
];

/** One extra line after a death of that type (helps the player learn). */
export const DEATH_HINTS = {
  giantHand: [K('ทางซ้ายมีแต่คนตาย มือนั่นไม่เลือกหรอกว่าใคร', 'The left road is for the dead. That hand doesn\'t care who it takes.')],
  trueForm: [K('ไม่มีเงาในกระจก ห้ามมองหน้า... บอกแล้วไง', 'No reflection, don\'t look at the face... I told you.')],
  roadFold: [K('ถนนมันพับกลับ เพราะลื้อทิ้งใครไว้ข้างหลัง', 'The road folds back when you leave someone behind.')],
  windowAttack: [K('ผีที่ถูกพาไปทางคนเป็น มันโกรธนะ', 'A ghost taken down the road of the living gets angry.')],
  dragBack: [K('เด็กคนนั้นอยากกลับบ้าน... บ้านของเขาอยู่ทางไหนล่ะ', 'That boy wanted to go home... which way is his home now?')],
  home: [K('บ้านไม่ใช่ที่ที่เราพาคนตายกลับไป', 'Home isn\'t where we take the dead.', { emotion: 'sad' })],
  lookBack: [K('หันไปทำไม... ข้อสามไม่มีข้อยกเว้น', 'Why did you turn... rule three has no exceptions.')],
  ceilingCrawl: [K('ไฟมันดับเอง ก็ปล่อยให้มันมืดไป', 'If the light dies on its own, let it stay dark.')],
  trunk: [K('เคาะสามที ห้ามจอด ต่อให้ไฟแดงก็ห้าม', 'Three knocks, you don\'t stop. Not even for a red light.')],
  nameCall: [K('เสียงเหมือนคนที่เรารัก... แต่ไม่ใช่', 'It sounds like someone we love... it isn\'t.')],
  radio: [K('เด็กขอให้ปิด ก็ปิดสิ', 'The kid asked you to turn it off. So turn it off.')],
  breath: [K('กำพระให้แน่น มองถนน อย่าหัน', 'Grip the amulet, eyes on the road, don\'t turn.')],
  yaiSpeed: [K('อย่าแข่งกับยายสปีด ไม่มีใครชนะแก', 'Never race Yai Speed. Nobody beats her.')],
  crash: [K('ถนนมันลื่น ขับช้า ๆ ก็ถึง', 'The road\'s slick. Drive slow, you still get there.')],
};

/** From the 2nd death on (saves.data.loops >= minDeaths) when saves.data.deathHour > 21. */
export const TIME_SKIP = {
  minDeaths: 2,
  offer: K('จะกลับไปชั่วโมงที่หลงไหม', 'Go back to the hour you got lost in?'),
  choice: {
    who: 'player', th: 'กลับไปชั่วโมงที่หลง?', en: 'Go back to that hour?', tone: 'thought',
    choice: {
      options: [
        { key: 'accept', th: 'กลับไปครับ', en: 'Take me back.' },
        { key: 'decline', th: 'เริ่มใหม่ตั้งแต่สามทุ่ม', en: 'Start again from nine.' },
      ],
      defaultKey: 'accept',
    },
  },
  accept: [K('หลับตา... นับหนึ่งถึงสาม', 'Close your eyes... count to three.', { tone: 'whisper' })],
  decline: [K('ก็ดี ค่อย ๆ ไปทีละก้าว ไม่ต้องรีบ', 'Good. One step at a time. No hurry.')],
};

/** Ah Kong's voice on the static station late in the night (station 4, the empty frequency). */
export const RADIO_CAMEO = {
  hours: [27, 29],
  station: 4,
  lines: [
    K('ไอ้หนุ่ม... ได้ยินอั๊วไหม', 'Young man... can you hear me?', { tone: 'ghost' }),
    K('ขับดี ๆ นะ ใกล้เช้าแล้ว', 'Drive carefully. Morning\'s close.', { tone: 'ghost' }),
    K('คนสุดท้ายของคืนนี้... ส่งให้ถึงนะ', 'The last fare tonight... get him there.', { tone: 'ghost' }),
    K('แล้วอย่าลืม... ข้อสาม', 'And don\'t forget... rule three.', { tone: 'whisper' }),
  ],
};

/** Final shot at the shrine: the deity statue has Ah Kong's face (after dawn / forgive). */
export const SHRINE_REVEAL = [
  K('คืนนี้ยาวหน่อยนะ ไอ้หนุ่ม', 'Long night, eh, young man.', { tone: 'whisper' }),
  K('พ่อลื้อมาขออั๊วไว้... ขอนั่งรถกับลูกอีกสักเที่ยว', 'Your father came and asked me... for one more ride with his boy.'),
  K('อั๊วก็แค่ยืดคืนให้มันยาวขึ้นหน่อย', 'All I did was stretch the night a little.', { emotion: 'smile' }),
  K('ไปเถอะ แม่ลื้อรออยู่', "Go on. Your mother's waiting."),
];

// Convenience: every step also exposes th/en (its first instruction line; auto variant for
// transmission-dependent steps) so simple consumers can show one line per step.
for (const s of TUTORIAL_STEPS) {
  const first = Array.isArray(s.lines) ? s.lines[0] : s.lines.auto[0];
  s.th = first.th;
  s.en = first.en;
}
