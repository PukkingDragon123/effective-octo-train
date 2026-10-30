// Ride 6 — 02:00 — หลวงพี่ Luang Phi, wandering thudong monk (HUMAN → RIGHT).
// Calm phase begins. Designed exception: he asks for the radio ON (a dhamma talk); rule 6
// still holds because nobody asks for it off. He blesses the car and, for a moment, every
// ghost along the road glows faintly. Krahang overhead, temple dogs chase the taxi.
import { P, Y, T, S, C } from '../lines.js';

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
    { rule: 'r10', note: 'He approves loudly if you honk at the shrine.' },
    { rule: 'r3', lookBack: 'warn' },
  ],
  encounters: [
    { id: 'krahang', at: 0.28 },
    { id: 'strayDogs', at: 0.52 },
    { id: 'monkBlessing', at: 0.76 },
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: [],
  pacing: { cruiseKmh: 40, minSeconds: 150, stretch: 'fog' }, // 1.3 km carrying ~2 min of talk + the blessing
  dialogue: {
    hail: [P('โยม... โยม', 'Layman... layman.', { action: 'hail' })],
    greet: [
      P('เจริญพร โยม', 'Blessings, layman.', { action: 'nod' }),
      P('อาตมาไม่มีตังค์นะโยม บอกไว้ก่อน', 'I have no money, layman. Just so you know.', { emotion: 'smile' }),
      Y('ไม่เป็นไรครับหลวงพี่ นิมนต์ขึ้นรถเลยครับ', "That's fine, Luang Phi. Please, come in."),
      P('อนุโมทนาด้วยนะโยม ใจบุญจริง ๆ', 'Anumodana, layman. A kind heart.', { emotion: 'smile' }),
    ],
    destination: [
      P('ไปทางบ้านห้วยทรายนะโยม', 'Towards Huai Sai Village, layman.'),
      P('เช้านี้อาตมาจะไปบิณฑบาตที่นั่น', "I'll go on my alms round there at dawn."),
    ],
    beats: [
      {
        id: 'radioRequest',
        trigger: { type: 'progress', at: 0.08 },
        lines: [
          P('โยม เปิดวิทยุให้หน่อยได้ไหม', 'Layman, could you turn on the radio?'),
          P('ตีสองมีเทศน์ทางคลื่นสี่ อาตมาฟังทุกคืน', "There's a dhamma talk at two, on station four. I listen every night."),
          T('ขอให้เปิด... ไม่ได้ขอให้ปิด ไม่ผิดกฎ', "He's asking for it ON... not off. That's allowed."),
        ],
        set: { monkWantsRadio: true },
      },
      {
        id: 'dhamma',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [
          S('radio', 'ทุกสิ่งเกิดขึ้น ตั้งอยู่ แล้วก็ดับไป...', 'All things arise, remain a while, and pass away...', { tone: 'normal' }),
          S('radio', 'อย่ายึดติดกับสิ่งที่ผ่านไปแล้วเลย', 'Do not cling to what has already passed.'),
          P('นั่นแหละโยม ฟังให้ดี', 'There you go, layman. Listen well.', { emotion: 'smile' }),
        ],
      },
      {
        id: 'noRadio',
        trigger: { type: 'time', seconds: 40 },
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
        trigger: { type: 'progress', at: 0.4 },
        lines: [
          P('โยมดูเหมือนแบกอะไรหนัก ๆ ไว้ในใจนะ', 'You look like you carry something heavy in your heart.'),
          C([
            { key: 'father', th: 'ผมทะเลาะกับพ่อครับ... แล้วพ่อก็ตาย', 'en': 'I fought with my father... then he died.' },
            { key: 'nothing', th: 'เปล่าครับ', en: "It's nothing." },
          ], {
            id: 'monk_heavyHeart',
            timeout: 8,
            defaultKey: 'nothing',
            setOnPick: { father: { confidedInMonk: true } },
            branches: {
              father: [
                P('พ่อแม่คือพระในบ้านนะโยม', 'Parents are the Buddhas of the home, layman.'),
                P('ถึงเขาจะจากไปแล้ว ก็ยังขอโทษได้นะโยม ถ้าใจเราถึง', "Even if he's gone, you can still say sorry, if your heart is truly in it.", { emotion: 'smile' }),
              ],
              nothing: [P('ไม่มีอะไรก็ดีแล้ว... แต่ถ้ามี ก็วางลงบ้างนะ', "Nothing is good... but if there is something, set it down now and then.")],
            },
          }),
        ],
      },
      {
        id: 'dogs',
        trigger: { type: 'event', event: 'encounter:strayDogs' },
        lines: [
          P('หมาวัดน่ะโยม มันวิ่งไล่รถทุกคัน', 'Temple dogs, layman. They chase every car.', { emotion: 'smile' }),
          P('อาตมาให้ข้าวมันทุกเช้า ไม่เคยขอบใจสักคำ', "I feed them every morning. Not one word of thanks.", { action: 'laugh' }),
        ],
      },
      {
        id: 'blessing',
        trigger: { type: 'event', event: 'encounter:monkBlessing' },
        lines: [
          P('เดี๋ยวอาตมาให้พรรถโยมหน่อยนะ', 'Let me bless your car a little.', { action: 'pray' }),
          P('ภะวะตุ สัพพะมังคะลัง... รักขันตุ สัพพะเทวะตา...', 'Bhavatu sabba-mangalam... rakkhantu sabba-devata...', { tone: 'sing', pause: 0.6 }),
          P('ขอให้โยมแคล้วคลาดปลอดภัย', 'May you pass safely through all dangers.', { pause: 1.0 }),
          T('ข้างทาง... มีคนยืนอยู่เต็มไปหมด', 'By the road... there are people everywhere.'),
          P('เขามาฟังเทศน์ด้วยน่ะโยม ไม่ต้องกลัว', "They came to hear the sermon too. Don't be afraid."),
        ],
      },
      {
        id: 'goRight',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [P('ทางแยกข้างหน้า ไปขวานะโยม อาตมายังไม่รีบไปทางซ้าย', "At the fork, go right. I'm in no hurry to go left.", { emotion: 'smile' })],
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
      P('กลดอาตมารั่ว ฝนตกทีไรเปียกทุกที', "My klot leaks. Every time it rains I get soaked.", { emotion: 'smile' }),
    ],
    onLookBack: [P('มองข้างหน้าโยม อาตมาไม่หายไปไหนหรอก', "Eyes ahead, layman. I'm not going anywhere.", { emotion: 'smile' })],
    onFaceGaze: [P('หน้าอาตมามีอะไรติดเหรอโยม', 'Is there something on my face, layman?', { emotion: 'surprise' })],
  },
};
