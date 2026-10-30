// Ride 6 — 02:00 — หลวงพี่ Luang Phi, wandering thudong monk (HUMAN → RIGHT).
// Calm phase begins. The ride of EXCEPTIONS: he asks for the radio ON (rule 6 still holds: nobody
// asks for it off); the meter rolls to ๔๔๔ and with a monk aboard the number means nothing (r11);
// after midnight he asks you to roll the window down for holy water, and that is allowed (r14).
// He blesses the car and, for a moment, every ghost along the road glows faintly.
// Replies: fare, radio, heavyHeart, 444, window (+ "last time I turned wrong" once you've died here).
import { P, Y, S, C, O, SIL, tr } from '../lines.js';

export const RIDE_MONK = {
  id: 'monk',
  order: 6,
  hour: 26,
  pickup: 'forestTemple',
  characterId: 'monk',
  identity: 'human',
  fork: 'right',
  seat: 'rearLeft',
  destination: { th: 'บ้านห้วยทราย (บิณฑบาตตอนเช้า)', en: 'Huai Sai Village (morning alms round)' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 63, meter: 'normal',
    radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'none', amountTHB: 0, note: { th: 'ไม่มีเงิน แต่ให้พรแทน', en: 'No money. A blessing instead.' } },
    smell: 'incense-sandalwood',
    extra: ['Amulet stays silent (cool) near him.', 'Present-day talk: mentions the dhamma radio schedule.'],
  },
  specialRules: [
    { rule: 'r6', exception: 'radioOnRequest', note: 'He asks for the radio ON. Dhamma talk on station 4 (AM 1080, audio/Radio.js).' },
    { rule: 'r11', at: 0.44, exception: 'monkAboard', note: 'Meter ๔๔๔ with a monk aboard: nothing counts. Stopping is harmless too.' },
    { rule: 'r14', at: 0.62, exception: 'monkAsks', note: 'He asks for the window down to sprinkle holy water: safe after midnight.' },
    { rule: 'r10', note: 'He approves loudly if you honk at the shrine.' },
    { rule: 'r3', lookBack: 'warn' },
  ],
  encounters: [
    { id: 'krahang', at: 0.28 },
    { id: 'meter444', at: 0.44 }, // outcome 'monkAboard': no voice, no count
    { id: 'strayDogs', at: 0.56 },
    { id: 'monkBlessing', at: 0.62 },
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 200, stretch: 'fog' }, // 1.3 km carrying ~2.5 min of talk + the blessing
  dialogue: {
    hail: [P('โยม... โยม', 'Layman... layman.', { action: 'hail' })],
    greet: [
      P('เจริญพร โยม', 'Blessings, layman.', { action: 'nod' }),
      P('หน้าโยมคุ้น ๆ นะ... เคยใส่บาตรอาตมาหรือเปล่า', 'Your face is familiar, layman... have you given me alms before?', { emotion: 'smile', if: { loopsGte: 1, loopsLt: 3 } }),
      P('โยมวนมาอีกแล้วสินะ... วัฏสงสารก็วนแบบนี้แหละ', 'Round again, layman? ...Samsara goes round just like this.', { emotion: 'smile', if: { loopsGte: 3 } }),
      P('อาตมาไม่มีตังค์นะโยม บอกไว้ก่อน', 'I have no money, layman. Just so you know.', { emotion: 'smile' }),
      C([
        O('free', 'ไม่เป็นไรครับ นิมนต์ครับ', "That's fine. Please, get in."),
        O('bless', 'ให้พรแทนก็ได้ครับ', 'A blessing will do.'),
        SIL(),
      ], {
        id: 'monk_fare',
        timeout: 7,
        setOnPick: { free: tr('monk', 'fare'), bless: tr('monk', 'fare') },
        branches: {
          free: [P('อนุโมทนาด้วยนะโยม ใจบุญจริง ๆ', 'Anumodana, layman. A kind heart.', { emotion: 'smile' })],
          bless: [P('เอ้า... โยมนี่ต่อรองเก่ง', 'Oh ho... a good bargainer, this one.', { emotion: 'smile', action: 'laugh' })],
          silent: [P('เงียบแปลว่าขึ้นได้นะโยม', 'Silence means I can get in, layman.', { emotion: 'smile' })],
        },
      }),
    ],
    destination: [
      P('ไปทางบ้านห้วยทรายนะโยม', 'Towards Huai Sai Village, layman.'),
      P('เช้านี้อาตมาจะไปบิณฑบาตที่นั่น', "I'll go on my alms round there at dawn."),
    ],
    beats: [
      {
        id: 'radioRequest',
        trigger: { type: 'progress', at: 0.17 },
        set: { monkWantsRadio: true },
        lines: [
          P('โยม เปิดวิทยุให้หน่อยได้ไหม', 'Layman, could you turn on the radio?'),
          P('ตีสองมีเทศน์ทางคลื่นสี่ อาตมาฟังทุกคืน', "There's a dhamma talk at two, on station four. I listen every night."),
          C([
            O('ok', 'ได้ครับหลวงพี่', 'Sure, Luang Phi.'),
            O('rule', 'เปิดได้เหรอครับ', 'Am I allowed?'),
            SIL(),
          ], {
            id: 'monk_radio',
            timeout: 7,
            setOnPick: { rule: { 'clue.monk.radio': true } },
            branches: {
              ok: [P('อนุโมทนา', 'Anumodana.', { action: 'nod' })],
              rule: [
                P('ขอให้เปิด ไม่ได้ขอให้ปิด', 'I asked for it on, not off.', { emotion: 'smile' }),
                P('ไม่ผิดกฎข้อไหนหรอกโยม', 'That breaks no rule, layman.'),
              ],
            },
          }),
        ],
      },
      {
        id: 'dhamma',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [
          S('radio', 'ทุกสิ่งเกิดขึ้น ตั้งอยู่ แล้วก็ดับไป...', 'All things arise, remain a while, and pass away...'),
          S('radio', 'อย่ายึดติดกับสิ่งที่ผ่านไปแล้วเลย', 'Do not cling to what has already passed.'),
          P('นั่นแหละโยม ฟังให้ดี', 'There you go, layman. Listen well.', { emotion: 'smile' }),
        ],
      },
      {
        id: 'noRadio',
        trigger: { type: 'time', seconds: 45 },
        if: { taxi: { radioOn: false } },
        lines: [P('ไม่เปิดก็ไม่เป็นไร... อาตมาเทศน์เองก็ได้', 'No radio? Never mind... I can preach myself.', { emotion: 'smile', action: 'laugh' })],
      },
      {
        id: 'krahang',
        trigger: { type: 'event', event: 'encounter:krahang' },
        lines: [
          P('อ้อ กระหัง... ไม่ต้องกลัวนะโยม', "Ah, a krahang... don't be afraid, layman."),
          P('เขาก็แค่หลงทาง เหมือนพวกเรานั่นแหละ', "He's only lost. Like the rest of us."),
        ],
      },
      {
        id: 'heavyHeart',
        essential: true, // seeds the forgiveness ending
        trigger: { type: 'progress', at: 0.33 },
        lines: [
          P('โยมดูเหมือนแบกอะไรหนัก ๆ ไว้ในใจนะ', 'You look like you carry something heavy in your heart.'),
          C([
            O('father', 'ผมทะเลาะกับพ่อ... แล้วพ่อก็ตาย', 'I fought with my dad... then he died.'),
            O('late', 'ผมกลับบ้านช้าไปครับ', 'I came home too late.'),
            SIL(),
          ], {
            id: 'monk_heavyHeart',
            timeout: 9,
            setOnPick: { father: { confidedInMonk: true, ...tr('monk', 'heart') }, late: { confidedInMonk: true, ...tr('monk', 'heart') } },
            branches: {
              father: [
                P('พ่อแม่คือพระในบ้านนะโยม', 'Parents are the Buddhas of the home, layman.'),
                P('ถึงเขาจะจากไปแล้ว ก็ยังขอโทษได้ ถ้าใจถึง', "Even if he's gone, you can still say sorry, if your heart is truly in it.", { emotion: 'smile' }),
              ],
              late: [
                P('ช้าก็ยังดีกว่าไม่มานะโยม', 'Late is still better than never, layman.'),
                P('คนที่รอ... เขายังรออยู่', 'Whoever was waiting... is still waiting.', { emotion: 'smile' }),
              ],
              silent: [P('ไม่มีอะไรก็ดีแล้ว... แต่ถ้ามี ก็วางลงบ้างนะ', 'Nothing is good... but if there is something, set it down now and then.')],
            },
          }),
        ],
      },
      {
        // r11 EXCEPTION: the meter shows 444 and the monk just laughs.
        id: 'meter444',
        trigger: { type: 'event', event: 'meter444' },
        lines: [
          P('เลขสวยนะโยม สี่สี่สี่', 'Pretty number, layman. Four-four-four.', { emotion: 'smile' }),
          P('ไม่ต้องจอดหรอก พระนั่งอยู่ทั้งองค์', "No need to stop. There's a whole monk sitting right here.", { action: 'laugh' }),
          C([
            O('sure', 'แน่ใจนะครับหลวงพี่', 'Are you sure, Luang Phi?'),
            O('stop', 'ผมขอจอดก่อนครับ', "I'd rather stop."),
            SIL(),
          ], {
            id: 'monk_444',
            timeout: 7,
            setOnPick: { sure: { 'clue.monk.444': true } },
            branches: {
              sure: [P('เลขก็แค่เลข ใจเราต่างหากที่นับ', "A number's just a number. It's the mind that counts.", { emotion: 'smile' })],
              stop: [P('ตามสบายโยม อาตมาจะได้ยืดขา', "As you like. I'll stretch my legs.", { action: 'laugh' })],
            },
          }),
        ],
      },
      {
        id: 'dogs',
        trigger: { type: 'event', event: 'encounter:strayDogs' },
        lines: [
          P('หมาวัดน่ะโยม มันวิ่งไล่รถทุกคัน', 'Temple dogs, layman. They chase every car.', { emotion: 'smile' }),
          P('อาตมาให้ข้าวมันทุกเช้า ไม่เคยขอบใจสักคำ', 'I feed them every morning. Not one word of thanks.', { action: 'laugh' }),
        ],
      },
      {
        // r14 EXCEPTION: a monk asks for the window. Rolling it down is safe.
        id: 'blessing',
        trigger: { type: 'event', event: 'encounter:monkBlessing' },
        lines: [
          P('เดี๋ยวอาตมาให้พรรถโยมหน่อยนะ', 'Let me bless your car a little.', { action: 'pray' }),
          P('ลดกระจกลงหน่อยโยม จะประพรมน้ำมนต์', "Roll your window down, layman. I'll sprinkle holy water."),
          C([
            O('ok', 'ครับหลวงพี่', 'Yes, Luang Phi.'),
            O('rule', 'หลังเที่ยงคืนห้ามลดนะครับ', 'No windows down after midnight...'),
            SIL(),
          ], {
            id: 'monk_window',
            timeout: 8,
            setOnPick: { rule: { 'clue.monk.window': true } },
            branches: {
              ok: [P('อนุโมทนา', 'Anumodana.', { action: 'nod' })],
              rule: [
                P('พระขอเอง ลดได้โยม', "A monk is asking. It's allowed, layman.", { emotion: 'smile' }),
                P('ไม่ลดก็ได้ บุญทะลุกระจกได้', "Or don't. Merit goes through glass.", { action: 'laugh' }),
              ],
              silent: [P('ไม่ลดก็ได้โยม บุญทะลุกระจกได้', "Leave it, then. Merit goes through glass.", { action: 'laugh' })],
            },
          }),
          P('ภะวะตุ สัพพะมังคะลัง... รักขันตุ สัพพะเทวะตา...', 'Bhavatu sabba-mangalam... rakkhantu sabba-devata...', { tone: 'sing', pause: 0.6 }),
          P('ขอให้โยมแคล้วคลาดปลอดภัย', 'May you pass safely through all dangers.', { pause: 1.0 }),
          P('ข้างทางมีคนมาฟังเยอะนะโยม ไม่ต้องกลัว', "Lots by the road came to listen, layman. Don't be afraid."),
        ],
      },
      {
        id: 'goRight',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [
          P('ทางแยกข้างหน้า ไปขวานะโยม อาตมายังไม่รีบไปทางซ้าย', "At the fork, go right. I'm in no hurry to go left.", { emotion: 'smile' }),
          C([O('sorry', 'ครั้งก่อนผมเลี้ยวผิดครับ', 'Last time I turned the wrong way.'), SIL()], {
            id: 'monk_lastTime',
            if: { diedOn: 'monk' },
            timeout: 6,
            branches: {
              sorry: [
                P('ครั้งก่อน?', 'Last time?', { emotion: 'surprise' }),
                P('อาตมาไม่ถือหรอก... แต่ขวานะโยม ขวา', "I don't hold grudges... but right, layman. RIGHT.", { action: 'laugh' }),
              ],
            },
          }),
        ],
      },
      {
        id: 'honk',
        trigger: { type: 'event', event: 'honkShrine' },
        lines: [P('ดี ๆ รู้จักขอทางเจ้าที่ โยมนี่ใช้ได้', "Good, good. You know to ask the spirits. You'll do.")],
      },
      {
        id: 'speeding',
        trigger: { type: 'event', event: 'speeding' },
        lines: [P('ช้า ๆ โยม รีบไปก็ถึงที่เดิมนั่นแหละ', "Slowly, layman. Rush, and you'll still arrive at the same place.")],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้ว ขอบใจโยมมาก', 'Here we are. Thank you, layman.'),
      P('อาตมาไม่มีเงิน แต่ให้พรได้', "I've no money, but I can give a blessing.", { action: 'pray' }),
      P('ขอให้โยมได้เจอสิ่งที่ตามหา', 'May you find what you are looking for.'),
      P('ขอให้ได้ขอโทษเขานะโยม', 'May you get to say your sorry, layman.', { if: { flag: { confidedInMonk: true } } }),
      Y('สาธุครับ', 'Sadhu.', { action: 'wai' }),
    ],
    arriveWrong: [
      P('โยม... ทางนี้ไม่ใช่ทางของคนเป็นนะ', "Layman... this road isn't for the living."),
      P('อาตมายังปลงไม่ได้ขนาดนั้นนะโยม', "I'm not quite that detached yet, layman.", { emotion: 'fear' }),
      P('นะโม ตัสสะ ภะคะวะโต อะระหะโต...', 'Namo tassa bhagavato arahato...', { tone: 'sing', action: 'pray' }),
    ],
    idle: [
      P('ป่าตอนกลางคืนนี่เงียบดีนะโยม', 'The forest at night is peaceful, layman.'),
      P('อาตมาเดินธุดงค์มาสามเดือนแล้ว', "I've been walking thudong for three months."),
      P('โยมกินข้าวหรือยัง', 'Have you eaten yet, layman?'),
      P('กลดอาตมารั่ว ฝนตกทีไรเปียกทุกที', 'My klot leaks. Every time it rains I get soaked.', { emotion: 'smile' }),
    ],
    onLookBack: [P('มองข้างหน้าโยม อาตมาไม่หายไปไหนหรอก', "Eyes ahead, layman. I'm not going anywhere.", { emotion: 'smile' })],
    onFaceGaze: [P('หน้าอาตมามีอะไรติดเหรอโยม', 'Is there something on my face, layman?', { emotion: 'surprise' })],
  },
};
