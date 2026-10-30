// ENDINGS (GAME_DESIGN §1 "Endings").
//
// ENDINGS[id] = {
//   id: 'dawn'|'endless'|'forgive'|'wrong_home',
//   kind: 'good'|'bad'|'true'|'sad',
//   titleTH, titleEN, subtitleTH?, subtitleEN?,
//   condition: designer note,
//   countsAsDeath: boolean (wrong_home loops the night),
//   scenes: [{ id, note (staging for the cinematic director), lines:[Line] }]  epilogue in order,
//   epilogue: [{ th, en }]    the closing text cards shown over black / sunrise before credits,
//   creditsExtra: [{ th, en }] lines appended after the credits roll for this ending,
//   music: audio mood / radio song id to play under it,
//   unlocks?: string[]         save flags set when reached,
// }
// Line schema as in SCHEMA.md. 'somchai' lines at the gate live in rides/r9_somchai.js (finale).

const N = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });
const S = (who, th, en, x = {}) => ({ who, th, en, ...x });

export const ENDINGS = {
  dawn: {
    id: 'dawn',
    kind: 'good',
    titleTH: 'รุ่งสาง',
    titleEN: 'Dawn',
    condition: 'Deliver Somchai LEFT and do not look back when he calls.',
    countsAsDeath: false,
    music: 'song:wayHome',
    scenes: [
      {
        id: 'sunrise',
        note: 'Ton drives on alone; the mist thins and golden rays cut through the trees. The radio switches itself on: "ทางกลับบ้าน".',
        lines: [N('เบาะหลังว่างแล้ว... ผมรู้โดยไม่ต้องหัน', 'The back seat is empty now... I know without turning.')],
      },
      {
        id: 'alms',
        note: 'The road opens onto Huai Sai at sunrise. A line of monks with alms bowls. Ton stops, kneels, offers sticky rice.',
        lines: [
          S('monk', 'ยถา วาริวหา ปูรา...', 'Yatha varivaha pura...', { tone: 'sing' }),
          N('ผมกรวดน้ำให้พ่อ', 'I pour the water of merit for my father.'),
        ],
      },
      {
        id: 'pour',
        note: 'Close-up: water from a small bottle trickling onto the earth at the foot of a tree, sunlight in the stream.',
        lines: [N('ขอให้พ่อไปสบายนะครับ', 'Go peacefully, Dad.')],
      },
    ],
    epilogue: [
      { th: 'เช้านั้น ต้นล้างรถเขียวเหลืองคันเก่า', en: 'That morning, Ton washed the old green-and-yellow cab.' },
      { th: 'แล้วขับกลับไปหาแม่', en: 'Then he drove home to his mother.' },
    ],
    creditsExtra: [{ th: 'ทุกเส้นทางไปจบที่ศาลเจ้ามารวย', en: 'Every road ends at Ma Ruay Shrine.' }],
    unlocks: ['endingDawn'],
  },

  endless: {
    id: 'endless',
    kind: 'bad',
    titleTH: 'กะดึกนิรันดร์',
    titleEN: 'The Endless Shift',
    condition: 'Look back at the mist gate when your father calls.',
    countsAsDeath: false,
    music: 'dread',
    scenes: [
      {
        id: 'fade',
        note: 'Ton turns. Somchai stands in the mist behind the car, smiling sadly. He fades like breath on glass. The mist swallows the road.',
        lines: [N('ผมหันไป... แค่อยากเห็นหน้าพ่อ', 'I turned... I only wanted to see his face.')],
      },
      {
        id: 'years',
        note: 'Hard cut: the garage, fluorescent tube flickering. An older Ton (grey stubble) smokes beside the taxi. A motorbike headlight comes up the spur road. A young stranger rides in.',
        lines: [
          S('player', 'อีกรอบแล้วสินะ', 'Again, huh?', { tone: 'normal' }),
          S('player', 'กุญแจอยู่นี่ กฎอยู่ในกระดาษ อ่านให้จำ', 'Keys are here. Rules are on the paper. Learn them.', { tone: 'normal' }),
        ],
      },
    ],
    epilogue: [
      { th: 'มีคนขับกะดึกคนใหม่ที่อู่ กม.9', en: 'There is a new night-shift driver at the KM 9 garage.' },
      { th: 'และคนเฝ้าอู่คนใหม่ ที่ไม่เคยได้กลับบ้าน', en: 'And a new keeper, who never made it home.' },
    ],
    creditsExtra: [{ th: 'กฎทุกข้อมีข้อยกเว้น ยกเว้นข้อสาม', en: 'Every rule has an exception, except rule three.' }],
    unlocks: ['endingEndless'],
  },

  forgive: {
    id: 'forgive',
    kind: 'true',
    titleTH: 'ขอโทษครับพ่อ',
    titleEN: 'Forgiveness',
    subtitleTH: 'ตอนจบที่แท้จริง',
    subtitleEN: 'The True Ending',
    condition: 'All 7 memories, Somchai delivered LEFT, choose "ขอโทษครับพ่อ" at the gate and do not look back.',
    countsAsDeath: false,
    music: 'song:wayHome',
    scenes: [
      {
        id: 'goldMist',
        note: 'After the forgiveness exchange (RIDE_SOMCHAI.finale.forgive) the mist turns gold. In the rear-view mirror Somchai raises a hand, the way taxi drivers greet each other on the road. Then he is light.',
        lines: [N('ในกระจก... พ่อยกมือทักเหมือนคนขับแท็กซี่ทักกัน', 'In the mirror... Dad lifts a hand, the way cabbies greet each other.')],
      },
      {
        id: 'dawnPlays',
        note: 'Play the full dawn ending scenes (alms, merit water).',
        lines: [],
      },
      {
        id: 'statue',
        note: 'Final shot: inside Ma Ruay Shrine. The deity statue has Ah Kong\'s face; incense smoke curls from its burner like his cigarette. The statue smiles.',
        lines: [S('ahKong', 'ไปดีมาดีนะ ไอ้หนุ่ม', 'Go well, young man.', { tone: 'whisper', emotion: 'smile' })],
      },
    ],
    epilogue: [
      { th: 'บางคืนก็ยาวพอให้พ่อกับลูก ได้นั่งรถคันเดียวกันอีกครั้ง', en: 'Some nights are long enough for a father and son to share one more ride.' },
      { th: 'ต้นกลับบ้าน และล้างรถทุกเช้า', en: 'Ton went home, and washed the car every morning.' },
    ],
    creditsExtra: [
      { th: 'ด้วยความระลึกถึงพ่อทุกคนที่พูดไม่เก่ง', en: 'For every father who was never good with words.' },
    ],
    unlocks: ['endingForgive'],
  },

  wrong_home: {
    id: 'wrong_home',
    kind: 'sad',
    titleTH: 'บ้าน',
    titleEN: 'Home',
    condition: 'Deliver Somchai RIGHT (the road of the living). Counts as a death; the night loops.',
    countsAsDeath: true,
    music: 'nostalgic',
    scenes: [
      {
        id: 'house',
        note: 'The human road bends into a village that should not be there: Ton\'s childhood house, wooden, shutters closed, empty. The taxi stops by itself.',
        lines: [N('บ้านเรา... ไม่มีใครอยู่แล้ว', 'Our house... nobody lives here now.')],
      },
      {
        id: 'porch',
        note: 'Somchai (RIDE_SOMCHAI.dialogue.arriveWrong) walks to the porch, sits on the step where he used to wash the car, and fades with the sunrise. The light snaps back to 21:00 blue.',
        lines: [S('somchai', 'พ่ออยากอยู่ด้วยนะ... แต่ไม่ได้แล้ว', "I'd like to stay... but I can't.", { tone: 'whisper', emotion: 'sad' })],
      },
    ],
    epilogue: [{ th: 'บ้านไม่ใช่ที่ที่เราพาคนตายกลับไป', en: 'Home is not where we take the dead.' }],
    creditsExtra: [],
    unlocks: [],
  },
};

export const ENDING_IDS = Object.keys(ENDINGS);
