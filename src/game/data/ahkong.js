// AH KONG (อากง): garage intro, the interactive tutorial, loop restarts, the time-skip
// offer, the keys (and the way out), his late-night radio cameo and the final reveal.
// He is an old Thai-Chinese man: gruff, dry humour, uses ลื้อ/อั๊ว (you/I), calls Ton
// "ไอ้หนุ่ม" (and, when he softens, the Teochew "อาตี๋"). He is secretly the shrine's
// guardian spirit — he never says so (he almost slips once), and he never gives a name.
// Thai-first: Ton answers him with short replies (C/O/SIL, see lines.js); almost no text otherwise.
//
// Exports
//   INTRO_BIKE: [{ id, at, lines:[Line] }]   Ton on the playable motorbike ride up the spur road;
//                                           `at` = progress along LAYOUT spline 'spur' (0..1)
//   INTRO_GARAGE: [Line]                    arrival cinematic, with Ton's replies (keys + paper mid-scene)
//   TUTORIAL_STEPS: [Step]                  in order. Step = {
//       id, lines:[Line] | {auto,manual}, hint: { th, en, keys } | {auto,manual} | null (no hint: his voice is enough),
//       waitFor: WaitFor | { auto, manual }, after?: [Line], memory?: memory id }
//     WaitFor types:
//       { type:'interact', id }                         interact:use with that id
//       { type:'enterVehicle' }                          player sits in the driver's seat
//       { type:'control', control, value }               taxi:control (value '*' = any change; valueNot: x = anything but x;
//                                                        min: n = numeric value >= n; path: read value[path] first)
//       { type:'drive', meters }                         distance driven
//       { type:'speedKmh', min?, max? }                  speed reached / dropped to
//       { type:'stop' }                                  speed < 1 km/h after moving
//       { type:'steer', amount }                         |steer| >= amount both left and right
//       { type:'look', target, seconds }                 taxi.getGazeTarget() === target for seconds
//       { type:'hold', item, seconds }                   e.g. amulet held this long
//       { type:'paper', seconds }                        rules paper raised this long
//   SEND_OFF: [Line]                        after the tutorial / after the keys on a restart
//   GARAGE_IDLE: [Line]                     random nudges if the player dawdles
//   RESTART_LINES: [{ minLoop, lines:[Line], variants?:[[Line]] }]  logic.byLoop(RESTART_LINES, loops);
//                                           when that entry was already heard, play a random `variants` item if any
//   DEATH_HINTS: { deathType: [Line] }      one short hint after a death of that type (after the restart line)
//   TIME_SKIP: { offer:Line, choice:Line(choice), accept:[Line], decline:[Line], minDeaths }
//   RESTART_KEYS: [Line]                    the keys, every restart (last). From loops >= 3 Ton may refuse:
//                                           flags.refusedShift → ending 'ride_away' if he rides the bike out
//   REFUSE_RETURN: [Line]                   he refused, then got into the taxi anyway
//   RADIO_CAMEO: { hours:[from,to], station, lines:[Line] }
//   SHRINE_REVEAL: [Line]                   final statue scene (forgive)
//
// Restart order (every death): RESTART_LINES → DEATH_HINTS[lastDeath] → TIME_SKIP (loops >= 2 and
// the death was after 21:00) → RESTART_KEYS → SEND_OFF. LOOP_STAGING (loop.js) changes the garage.
import { CHARACTERS } from './characters.js';

const K = (th, en, x = {}) => ({ who: 'ahKong', th, en, ...x });
const T = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });
const O = (key, th, en, x = {}) => ({ key, th, en, ...x });
const SIL = () => ({ key: 'silent', th: '…', en: '(say nothing)' });
/** Reply moment (same shape as lines.js C; setOnPick baked into the branch's first line). */
const R = (id, options, branches = {}, x = {}) => {
  const b = {};
  for (const [k, ls] of Object.entries(branches)) b[k] = ls.slice();
  for (const [k, flags] of Object.entries(x.setOnPick || {})) if (b[k]?.length) b[k][0] = { ...b[k][0], set: { ...(b[k][0].set || {}), ...flags } };
  const choice = { id, options, defaultKey: x.defaultKey ?? options[options.length - 1].key, branches: b };
  if (x.timeout !== 0) choice.timeout = x.timeout ?? 8;
  if (x.setOnPick) choice.setOnPick = x.setOnPick;
  const line = { who: 'player', th: '', en: '', tone: 'thought', choice };
  if (x.if) line.if = x.if;
  return line;
};

export const AH_KONG = CHARACTERS.ahKong;

export const INTRO_BIKE = [
  { id: 'forest', at: 0.2, lines: [T('เจ็ดปี... ไม่ได้กลับมาเลย', 'Seven years... I never came back.')] },
];

export const INTRO_GARAGE = [
  K('มาแล้วเหรอ... นึกว่าจะไม่มาซะแล้ว', "So you came... thought you wouldn't.", { action: 'smoke' }),
  K('ลื้อคือคนที่จะมาขับกะดึกใช่ไหม', "You're the one for the night shift?"),
  R('garage_hello', [O('yes', 'ครับ', 'Yes.'), O('money', 'ถ้าเงินดีครับ', "If the money's good."), SIL()], {
    yes: [K('ดี', 'Good.', { action: 'nod' })],
    money: [K('เงินน่ะได้... ถ้าอยู่ถึงเช้า', "Oh, you'll be paid... if you last till morning.", { emotion: 'smile' })],
    silent: [K('พูดน้อย... ดี อั๊วชอบ', 'Quiet type... good. I like that.')],
  }),
  K('ใคร ๆ ก็เรียกอั๊วว่าอากง', 'Everyone calls me Ah Kong.', { action: 'nod' }),
  K('หน้าตาลื้อ... คุ้น ๆ นะ', 'Your face... looks familiar.', { pause: 1.0 }),
  R('garage_face', [O('local', 'ผมโตแถวนี้ครับ', 'I grew up round here.'), O('no', 'คงจำผิดคนครับ', "You've got the wrong man."), SIL()], {
    local: [K('อ้อ...', 'Ah...', { pause: 0.8 }), K('งั้นก็กลับบ้านแล้วสินะ', "Then you've come home.", { emotion: 'smile' })],
    no: [K('นั่นสิ คนแก่ตาไม่ค่อยดี', "Must be. An old man's eyes.")],
    silent: [K('ช่างเถอะ คนแก่ตาไม่ค่อยดี', "Never mind. An old man's eyes.")],
  }),
  K('รถคันนั้น เขียวเหลือง เก่าหน่อยแต่ใจถึง', "That cab. Green and yellow. Old, but she's got heart.", { action: 'point' }),
  K('กุญแจ เอาไป', 'Keys. Take them.', { action: 'giveItem', set: { hasKeys: true } }),
  K('แล้วก็นี่... กฎ', 'And this... the rules.', { action: 'giveItem', set: { hasPaper: true } }),
  K('อ่านให้จำ อย่าทำหาย', "Learn them. Don't lose it."),
  K('ด้านหลังด้วยนะ อย่าลืมพลิกดู', "The back too. Don't forget to turn it over.", { tone: 'whisper' }),
  K('กะดึกเส้นนี้ ไม่ได้ยากเพราะถนนหรอก', "This shift isn't hard because of the road."),
  K('ยากเพราะคนที่โบกเรียกนั่นแหละ', "It's hard because of who flags you down."),
  R('garage_ask', [O('pay', 'ค่าแรงเท่าไหร่ครับ', "What's the pay?"), O('car', 'รถคันนี้ของใครครับ', 'Whose cab is this?'), O('fail', 'ถ้าผมพลาดล่ะครับ', 'And if I mess up?')], {
    pay: [K('ส่งครบทุกคนจนถึงเช้า ลื้อจะได้มากกว่าเงิน', "Get everyone where they're going till morning. You'll get more than money.")],
    car: [K('ของคนขับคนก่อน', "The last driver's."), K('เขาไม่ได้ใช้แล้ว', "He won't be needing it.", { pause: 1.0 })],
    fail: [K('ก็กลับมาเจออั๊วที่นี่ไง', 'Then you come back here. To me.', { emotion: 'smile', action: 'smoke', pause: 1.0 })],
  }, { timeout: 10 }),
  K('ซ้ายหรือขวา ส่งให้ถูกทาง อย่าซี้ซั้ว', 'Left or right. Take each one the right way. No careless guessing.'),
];

export const TUTORIAL_STEPS = [
  {
    id: 'readPaper',
    lines: [K('อ่านกฎก่อน ทุกข้อ ช้า ๆ', 'Read the rules first. Every one. Slowly.')],
    hint: { th: 'กระดาษกฎ', en: 'Rules paper', keys: ['Tab', 'J'] },
    waitFor: { type: 'paper', seconds: 3 },
    after: [K('ข้อสามสำคัญที่สุด จำไว้', 'Rule three matters most. Remember that.')],
  },
  {
    id: 'openDoor',
    lines: [K('ประตูคนขับอยู่ขวา รถพวงมาลัยขวา', "Driver's door is on the right. Right-hand drive.")],
    hint: { th: 'เปิดประตู', en: 'Open the door', keys: ['F'] },
    waitFor: { type: 'interact', id: 'taxi.door.fr.out' }, // vehicle: outside handle of the driver door (RHD)
  },
  {
    id: 'sit',
    lines: [K('ขึ้นไปนั่ง', 'Get in.')],
    hint: { th: 'ขึ้นรถ', en: 'Get in', keys: ['V'] },
    waitFor: { type: 'enterVehicle' },
  },
  {
    id: 'insertKey',
    lines: [K('กุญแจเสียบข้างพวงมาลัย ทางขวามือ', 'Key goes in right of the wheel.')],
    hint: { th: 'เสียบกุญแจ', en: 'Key in', keys: ['F'] },
    waitFor: { type: 'control', control: 'key', value: true },
  },
  {
    id: 'startEngine',
    lines: [K('บิดเลย ถ้าไม่ติดก็บิดอีกที รถมันขี้เกียจ', "Turn it. Doesn't catch, turn it again. She's lazy.")],
    hint: { th: 'สตาร์ท', en: 'Start', keys: ['F'] },
    waitFor: { type: 'control', control: 'ignition', value: 'start' },
    after: [K('ฟังเสียงเครื่องสิ ยังดีอยู่', 'Listen to that engine. Still sweet.', { emotion: 'smile' })],
  },
  {
    id: 'headlights',
    lines: [K('เปิดไฟหน้า ป่านี้มืดกว่าที่ลื้อคิด', 'Headlights. This forest is darker than you think.')],
    hint: { th: 'ไฟหน้า', en: 'Headlights', keys: ['L'] },
    waitFor: { type: 'control', control: 'headlights', valueNot: 'off' },
  },
  {
    id: 'handbrake',
    lines: [K('ปลดเบรกมือ', 'Handbrake off.')],
    hint: { th: 'เบรกมือ', en: 'Handbrake', keys: ['Space'] },
    waitFor: { type: 'control', control: 'handbrake', value: false },
  },
  {
    id: 'gear',
    lines: {
      auto: [K('เข้าเกียร์ D', 'Put her in D.')],
      manual: [K('เหยียบคลัตช์ เข้าเกียร์หนึ่ง', 'Clutch in. First gear.')],
    },
    hint: {
      auto: { th: 'เกียร์ D', en: 'Gear D', keys: ['X'] },
      manual: { th: 'เกียร์ ๑', en: '1st gear', keys: ['X', 'Z'] },
    },
    waitFor: {
      auto: { type: 'control', control: 'gear', value: 'D' },
      manual: { type: 'control', control: 'gear', value: '1' },
    },
  },
  {
    id: 'accelerate',
    lines: [K('ค่อย ๆ เหยียบคันเร่ง', 'Easy on the throttle.')],
    hint: { th: 'เร่ง', en: 'Throttle', keys: ['W'] },
    waitFor: { type: 'drive', meters: 12 },
  },
  {
    id: 'brake',
    lines: [K('เบรก!', 'Brake!', { tone: 'shout' })],
    hint: { th: 'เบรก', en: 'Brake', keys: ['S'] },
    waitFor: { type: 'stop' },
    after: [K('ดี เบรกมันดื้อ ต้องเหยียบลึก ๆ', 'Good. Brakes are sticky. Push them deep.')],
  },
  {
    id: 'steer',
    lines: [K('ลองเลี้ยวซ้ายขวาดู พวงมาลัยหนักหน่อย', 'Try steering left and right. The wheel\'s a bit heavy.')],
    hint: { th: 'เลี้ยว', en: 'Steer', keys: ['A', 'D'] },
    waitFor: { type: 'steer', amount: 0.6 },
  },
  {
    id: 'indicator',
    lines: [K('ไฟเลี้ยว จะจอดรับคนก็เปิดไฟเลี้ยวซ้าย', 'Indicator. Pulling in for a fare, signal left.')],
    hint: { th: 'ไฟเลี้ยว', en: 'Indicator', keys: ['1', '2'] },
    waitFor: { type: 'control', control: 'indicator', value: 'left' },
  },
  {
    id: 'wipers',
    lines: [K('ที่ปัดน้ำฝน คืนนี้ฝนตกแน่', "Wipers. It'll rain tonight, sure as anything.")],
    hint: { th: 'ที่ปัดน้ำฝน', en: 'Wipers', keys: ['3'] },
    waitFor: { type: 'control', control: 'wipers', min: 1 },
  },
  {
    id: 'cabinLight',
    lines: [K('ไฟในรถ เปิดดูซิ', 'Cabin light. Try it.')],
    hint: { th: 'ไฟในรถ', en: 'Cabin light', keys: ['C'] },
    waitFor: { type: 'control', control: 'cabinLight', value: true },
    after: [K('ไฟดวงนั้น บางทีมันก็ดับเองนะ...', 'That light... sometimes it goes out on its own.', { tone: 'whisper' })],
  },
  {
    id: 'radio',
    lines: [K('วิทยุ เปิดฟังเป็นเพื่อนได้', 'Radio. Keeps you company.')],
    after: [K('คลื่นสามน่ะ... ปกติมีแต่เสียงซ่า', 'Station three... mostly just static.', { tone: 'whisper' })],
    hint: { th: 'วิทยุ', en: 'Radio', keys: ['4', '5'] },
    waitFor: { type: 'control', control: 'radio', value: true },
  },
  {
    id: 'meterOn',
    lines: [
      K('มิเตอร์ รับคนแล้วต้องกดทุกครั้ง', 'The meter. Every fare, you press it.'),
      K('ไฟ "ว่าง" สีแดงหน้ากระจกจะดับ คนจะได้รู้ว่ารถไม่ว่าง', 'The red "vacant" lamp in the windscreen goes off, so people know you\'re taken.'),
    ],
    hint: { th: 'มิเตอร์', en: 'Meter', keys: ['M'] },
    waitFor: { type: 'control', control: 'meter', value: true },
  },
  {
    id: 'meterOff',
    lines: [K('กดอีกที ไฟว่างติด ออกไปหาผู้โดยสารได้', 'Press it again. Vacant lamp on. Ready for fares.')],
    hint: { th: 'มิเตอร์', en: 'Meter', keys: ['M'] },
    waitFor: { type: 'control', control: 'meter', value: false },
  },
  {
    id: 'window',
    lines: [K('กระจกต้องหมุนเอง รถเก่า', 'You crank the window yourself. Old car.')],
    hint: { th: 'หมุนกระจก', en: 'Window crank', keys: ['T', 'F'] },
    waitFor: { type: 'control', control: 'window', path: 'amount', min: 0.3 }, // taxi:control value {window, amount}
    after: [K('แต่ถ้ามีเสียงเรียกชื่อลื้อจากข้างนอก... อย่าเปิด', "But if a voice outside calls your name... don't open it.", { tone: 'whisper' })],
  },
  {
    id: 'mirrorRear',
    lines: [K('ดูกระจกหลัง', 'Check the rear-view mirror.')],
    hint: null, // his voice is enough
    waitFor: { type: 'look', target: 'mirror_rear', seconds: 0.8 },
  },
  {
    id: 'mirrorLeft',
    lines: [K('กระจกข้างซ้าย', 'Left side mirror.')],
    hint: { th: 'เอียงตัว', en: 'Lean', keys: ['Q'] },
    waitFor: { type: 'look', target: 'mirror_left', seconds: 0.8 },
  },
  {
    id: 'mirrorRight',
    lines: [K('ขวา', 'Right.')],
    hint: { th: 'เอียงตัว', en: 'Lean', keys: ['E'] },
    waitFor: { type: 'look', target: 'mirror_right', seconds: 0.8 },
    after: [K('จำไว้ อยากรู้ว่าข้างหลังมีอะไร ดูกระจก ห้ามหัน', 'Remember. Want to know what\'s behind you? Use the mirrors. Never turn round.')],
  },
  {
    id: 'amulet',
    lines: [K('พระที่ห้อยหน้ารถ ลองกำดู', 'The amulet on the mirror. Hold it.')],
    hint: { th: 'กำพระ', en: 'Amulet', keys: ['G'] },
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
  K('ผ่านศาลก็บีบแตรสองที', 'And honk twice at the shrines.'),
  R('garage_sendOff', [O('ok', 'ครับ', 'Okay.'), O('come', 'อากงไม่ไปด้วยเหรอ', "Aren't you coming?"), SIL()], {
    ok: [K('ไป', 'Go.', { action: 'wave' })],
    come: [
      K('อั๊วต้องเฝ้าศาล... เอ๊ย เฝ้าอู่', 'I have to mind the shrine... er, the garage.', { emotion: 'surprise' }), // his one slip
      K('ไปได้แล้ว', 'Off you go.', { action: 'smoke' }),
    ],
  }, { timeout: 6 }),
];

export const GARAGE_IDLE = [
  K('อาตี๋ ยืนทำอะไร รถไม่ขับตัวเองนะ', "What're you standing there for, kid? The cab won't drive itself."),
  K('ยุงเยอะ รีบ ๆ หน่อย', 'Mosquitoes are biting. Get a move on.'),
  K('ตุ๊กแกร้องแล้ว... สามทุ่มพอดี', "There goes the gecko... nine o'clock on the dot."),
];

/** Said when the loop restarts at 21:00 (logic.byLoop). Ton answers on some nights. */
export const RESTART_LINES = [
  {
    minLoop: 1,
    lines: [
      K('อีกรอบแล้วสินะ', 'Again, huh?', { action: 'smoke' }),
      R('restart_1', [O('dead', 'ผม... ตายแล้วเหรอครับ', 'Did I... just die?'), O('dream', 'ผมฝันไปใช่ไหม', 'I was dreaming, right?'), SIL()], {
        dead: [K('ตายก็กลับมาที่นี่', 'Die, and you come back here.'), K('คืนนี้ยังไม่จบ', "Tonight isn't over.")],
        dream: [K('จะคิดว่าฝันก็ได้... ถ้ามันทำให้ลื้อขับต่อได้', 'Call it a dream... if it keeps you driving.')],
        silent: [K('นั่งก่อน หายใจลึก ๆ', 'Sit. Breathe deep.')],
      }),
    ],
  },
  {
    minLoop: 2,
    lines: [
      K('ได้ยินไหม ตุ๊กแกร้องเจ็ดทีเหมือนเดิม', 'Hear that? The gecko. Seven calls, same as before.'),
      K('ไม่เป็นไร คืนนี้ยังยาว', "That's all right. The night's still long."),
    ],
  },
  {
    minLoop: 3,
    lines: [
      K('ลื้อตายเก่งกว่าคนขับคนก่อนอีกนะ', 'You die better than the last driver did.'),
      R('restart_3', [O('who', 'คนขับคนก่อนคือใครครับ', 'Who was the last driver?'), O('thanks', 'ขอบคุณครับ', 'Thanks.'), SIL()], {
        who: [
          K('คนที่เขียนด้านหลังกระดาษนั่นแหละ', 'The one who wrote on the back of that paper.', { pause: 1.0 }),
          K('หมึกแดงนั่น... ลายมือเขา', 'That red ink... his hand.'),
        ],
        thanks: [K('ไม่ได้ชม', "That wasn't a compliment.", { emotion: 'smile' })],
        silent: [K('...ไม่ได้ชมนะ', "...that wasn't a compliment.", { emotion: 'smile' })],
      }),
    ],
  },
  {
    minLoop: 4,
    lines: [
      K('อั๊วชงชาไว้ให้แล้ว รู้ว่าลื้อต้องกลับมา', "I made you tea. Knew you'd be back.", { action: 'giveItem' }),
      R('restart_4', [O('how', 'รู้ได้ไงครับ', 'How did you know?'), O('thanks', 'ขอบคุณครับอากง', 'Thank you, Ah Kong.'), SIL()], {
        how: [K('ทุกคนกลับมา', 'Everyone comes back.'), K('จนกว่าจะส่งครบ', "Until they've taken everyone home.")],
        thanks: [K('ดื่มซะ ร้อน ๆ', "Drink it while it's hot.", { emotion: 'smile' })],
      }, { timeout: 7 }),
    ],
  },
  {
    minLoop: 5,
    lines: [
      K('อ่านกฎอีกที ช้า ๆ ทุกบรรทัด', 'Read the rules again. Slowly. Every line.'),
      K('บางบรรทัดมันซ่อนอยู่ ต้องโดนน้ำหรือโดนไฟถึงจะเห็น', 'Some lines hide. Wet the paper, or hold it to the light.', { tone: 'whisper' }),
    ],
  },
  {
    minLoop: 6,
    lines: [
      K('คืนนี้เหมือนเดิมทุกอย่าง... ยกเว้นลื้อ', "Tonight's the same as every night... except you."),
      R('restart_6', [O('why', 'ทำไมมันวนแบบนี้ครับ', 'Why does it keep looping?'), SIL()], {
        why: [
          K('มีคนอยากนั่งรถกับลื้ออีกสักเที่ยว', 'Someone wants one more ride with you.', { tone: 'whisper', pause: 1.0 }),
          K('...ไปขับรถ', '...go and drive.'),
        ],
      }, { timeout: 7 }),
    ],
  },
  {
    minLoop: 7,
    lines: [
      K('ไม่ต้องรีบ อั๊วไม่ได้ไปไหน', "No rush. I'm not going anywhere."),
      K('คนที่รอลื้ออยู่ข้างหน้า... ก็ยังรออยู่', "And whoever's waiting for you up ahead... is still waiting.", { tone: 'whisper' }),
    ],
  },
  {
    minLoop: 8,
    lines: [
      K('ลื้อดื้อเหมือนพ่อลื้อเลย', "You're as stubborn as your father.", { emotion: 'smile', pause: 1.0 }),
      R('restart_8', [O('knew', 'อากงรู้จักพ่อผมเหรอ', 'You knew my dad?'), SIL()], {
        knew: [
          K('ใครจะไม่รู้จักไอ้ชาย', "Who didn't know Chai?", { emotion: 'smile' }),
          K('ขับกะนี้มาสิบปี ไม่เคยหันหลังสักครั้ง', 'Drove this shift ten years. Never once looked back.'),
        ],
      }, { timeout: 7 }),
    ],
  },
  {
    minLoop: 10,
    lines: [
      K('อาตี๋ เคยสงสัยไหม ทำไมอั๊วไม่แก่ไปกว่านี้', 'Ever wonder, kid, why I never get any older?', { emotion: 'smile' }),
      K('...ไม่ต้องตอบ ไปขับรถ', "...Don't answer. Go and drive."),
    ],
  },
  {
    minLoop: 12,
    lines: [K('มาแล้วเหรอ... ชาอยู่บนโต๊ะ กุญแจอยู่ในรถ', "Back, are you... Tea's on the table. Keys are in the car.", { action: 'smoke' })],
    variants: [
      [K('ลื้อจำกฎได้หมดแล้ว... ที่เหลือคือใจ', "You know every rule by now... what's left is the heart.")],
      [K('พ่อลื้อก็ดื้อแบบนี้แหละ ไม่ยอมแพ้อะไรง่าย ๆ', 'Your father was just as stubborn. Never gave up on anything.', { emotion: 'smile' })],
      [K('ไปเถอะ คืนนี้อาจเป็นคืนสุดท้ายก็ได้', 'Go on. Tonight might be the last one.', { tone: 'whisper' })],
    ],
  },
];

/** One short line after a death of that type (helps the player learn). */
export const DEATH_HINTS = {
  giantHand: [K('ทางซ้ายมีแต่คนตาย มือนั่นไม่เลือกหรอก', "The left road is for the dead. That hand doesn't choose.")],
  trueForm: [K('ไม่มีเงาในกระจก ห้ามมองหน้า', 'No reflection, no looking at the face.')],
  roadFold: [K('ถนนมันพับกลับ เพราะลื้อทิ้งใครไว้', 'The road folds back when you leave someone behind.')],
  windowAttack: [K('ผีที่ถูกพาไปทางคนเป็น มันโกรธนะ', 'A ghost taken down the road of the living gets angry.')],
  dragBack: [K('เด็กคนนั้นอยากกลับบ้าน... บ้านเขาอยู่ทางไหนล่ะ', 'That boy wanted to go home... which way is his home now?')],
  home: [K('บ้านไม่ใช่ที่ที่เราพาคนตายกลับไป', "Home isn't where we take the dead.", { emotion: 'sad' })],
  lookBack: [K('หันไปทำไม... ข้อสามไม่มีข้อยกเว้น', 'Why did you turn... rule three has no exceptions.')],
  ceilingCrawl: [K('ไฟดับเอง ก็ปล่อยให้มืดไป', 'If the light dies on its own, let it stay dark.')],
  trunk: [K('เคาะสามที ห้ามจอด', 'Three knocks, you do not stop.')],
  nameCall: [K('เสียงเหมือนคนที่เรารัก... แต่ไม่ใช่', 'It sounds like someone we love... it isn\'t.')],
  radio: [K('เด็กขอให้ปิด ก็ปิดสิ', 'The kid asked you to turn it off. So turn it off.')],
  breath: [K('กำพระให้แน่น มองถนน', 'Grip the amulet. Eyes on the road.')],
  yaiSpeed: [K('อย่าแข่งกับยายสปีด', 'Never race Yai Speed.')],
  crash: [K('ถนนมันลื่น ขับช้า ๆ ก็ถึง', "The road's slick. Drive slow, you still get there.")],
  roadFigure: [K('ยืนเฉย ๆ ไม่โบก... ไม่ใช่ผู้โดยสาร', "Standing, not waving... that's no fare.")],
  roofHanger: [K('เลือดก็ปล่อยให้ไหลไป อย่าไปปัด', "Blood, you let it run. Don't wipe.")],
  count444: [K('นับในใจ อย่านับออกเสียง', 'Count in your head. Never out loud.')],
  windowArm: [K('หลังเที่ยงคืน กระจกต้องปิด', 'After midnight, the glass stays up.')],
  extraPassenger: [K('ในกระจกเกินมาหนึ่ง... อย่าทัก', "One too many in the mirror... don't say a word.")],
};

/** From the 2nd death on (saves.data.loops >= minDeaths) when saves.data.deathHour > 21. */
export const TIME_SKIP = {
  minDeaths: 2,
  offer: K('จะกลับไปชั่วโมงที่หลงไหม', 'Go back to the hour you got lost in?'),
  choice: {
    who: 'player', th: '', en: '', tone: 'thought',
    choice: {
      id: 'timeSkip',
      options: [
        { key: 'accept', th: 'กลับไปครับ', en: 'Take me back.' },
        { key: 'decline', th: 'เริ่มใหม่ครับ', en: 'From the start.' },
      ],
      defaultKey: 'accept',
    },
  },
  accept: [K('หลับตา... นับหนึ่งถึงสาม', 'Close your eyes... count to three.', { tone: 'whisper' })],
  decline: [K('ก็ดี ค่อย ๆ ไปทีละก้าว', 'Good. One step at a time.')],
};

/**
 * The keys, at the end of every restart. From the 4th night (loops >= 3) Ton can refuse: then the
 * night is his to leave. Riding the motorbike out to spurStart = ending 'ride_away'
 * (gameplay sets flags.rodeAway). Getting into the taxi instead plays REFUSE_RETURN.
 */
export const RESTART_KEYS = [
  K('กุญแจ', 'Keys.', { action: 'giveItem' }),
  R('restart_keys', [
    O('take', 'ครับ', 'Okay.'),
    O('refuse', 'ผมไม่ขับแล้วครับ', "I'm not driving any more.", { if: { loopsGte: 3 } }),
    SIL(),
  ], {
    take: [K('ไป', 'Go.', { action: 'wave' })],
    refuse: [
      K('อืม...', 'Hm...', { pause: 1.2, action: 'smoke' }),
      K('ไม่มีใครบังคับลื้อหรอก', "Nobody's forcing you."),
      K('รถเครื่องลื้อยังจอดอยู่ตรงนั้น', "Your bike's still parked over there.", { action: 'point' }),
      K('ประตูไม่เคยล็อก', 'The gate was never locked.', { tone: 'whisper' }),
    ],
    silent: [K('ไป', 'Go.', { action: 'wave' })],
  }, { timeout: 10, setOnPick: { take: { hasKeys: true }, refuse: { refusedShift: true }, silent: { hasKeys: true } } }),
];

/** He refused the keys, then walked to the taxi anyway. */
export const REFUSE_RETURN = [
  K('เปลี่ยนใจแล้วสินะ', 'Changed your mind, then.', { emotion: 'smile', set: { refusedShift: false, hasKeys: true } }),
];

/** Ah Kong's voice on station 3, the dead frequency, after the father's song hour (04:00–05:00). */
export const RADIO_CAMEO = {
  hours: [28, 29],
  station: 3,
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
  K('ไปเถอะ ไปเปิดบ้านลื้อซะ', 'Go on. Go and open up your house.'),
];

// Convenience: every step also exposes th/en (its first instruction line; auto variant for
// transmission-dependent steps) so simple consumers can show one line per step.
for (const s of TUTORIAL_STEPS) {
  const first = Array.isArray(s.lines) ? s.lines[0] : s.lines.auto[0];
  s.th = first.th;
  s.en = first.en;
}
