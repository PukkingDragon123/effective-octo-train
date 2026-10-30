// ENDINGS (GAME_DESIGN §1 "Endings" + the second narrative pass). Thai-first, nearly wordless:
// the scenes are staged; lines are few and voiced; epilogue cards are one or two short Thai lines.
//
// ENDINGS[id] = {
//   id, kind: 'good'|'bad'|'true'|'sad'|'bittersweet'|'dark'|'hopeful',
//   titleTH, titleEN, subtitleTH?, subtitleEN?,
//   moment: WHEN gameplay asks (logic.resolveEnding(moment, ctx)):
//     'fork'       ride 9's fork resolved            (flags.somchaiFork)
//     'gate'       the mist-gate look-back test ended (flags.gateLookBack)
//     'finalFork'  the empty dawn taxi took the shrine fork one last time (flags.finalFork)
//     'garage'     the shift was refused and the motorbike reached spurStart (flags.rodeAway)
//   when: Condition (SCHEMA.md "Conditions") — the exact data trigger,
//   condition: the same in words (designer note),
//   countsAsDeath: boolean (wrong_home loops the night),
//   scenes: [{ id, note (staging for the cinematic director), lines:[Line], if?: Condition }],
//   epilogue: [{ th, en, if?: Condition }]   closing cards over black / sunrise before credits,
//   creditsExtra: [{ th, en }], music, unlocks?: string[] (save flags set when reached),
// }
// ENDING_PRIORITY: the order resolveEnding() tests (first match wins).
// Somchai's gate lines live in rides/r9_somchai.js (finale).

const N = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'whisper', ...x }); // Ton, aloud but quiet
const S = (who, th, en, x = {}) => ({ who, th, en, ...x });

const ALMS = {
  id: 'alms',
  note: 'The road opens onto Huai Sai at sunrise. A line of barefoot monks with alms bowls. Ton stops, kneels, offers sticky rice, then pours the water of merit (กรวดน้ำ) at the foot of a tree, sunlight in the stream.',
  lines: [
    S('monk', 'ยถา วาริวหา ปูรา ปริปูเรนฺติ สาครํ...', 'Yatha varivaha pura paripurenti sagaram...', { tone: 'sing', speakerTH: 'พระ', speakerEN: 'Monk' }),
    N('ไปสบายนะครับพ่อ', 'Go in peace, Dad.'),
  ],
};
// Promised Boy M (ride 4) "พี่สัญญา": on the way home Ton stops at the KM 11 bus stop.
const BUS_STOP = {
  id: 'busStop',
  if: { flag: { promisedM: true } },
  note: 'On the way home, the KM 11 bus stop in morning light. A woman in her thirties waits beside the faded witness poster, a covered dish in her hands. Ton stops.',
  lines: [
    N('น้องเอ็มฝากบอกว่า... ไม่เจ็บแล้วครับ', "M asked me to tell you... it doesn't hurt any more."),
    S('mMother', '...', '...', { pause: 2.0 }),
    S('mMother', 'ขอบคุณ... ขอบคุณจ้ะ', 'Thank you... thank you.', { tone: 'whisper', emotion: 'sad' }),
  ],
};

export const ENDINGS = {
  dawn: {
    id: 'dawn',
    kind: 'good',
    titleTH: 'รุ่งสาง',
    titleEN: 'Dawn',
    moment: 'finalFork',
    when: { flag: { finalFork: 'right' } },
    condition: 'Deliver Somchai LEFT, do not look back at the gate, then take the empty taxi RIGHT at the last fork.',
    countsAsDeath: false,
    music: 'song:wayHome',
    scenes: [
      {
        id: 'sunrise',
        note: 'RIGHT at the last fork. The mist thins; golden rays cut through the trees. The radio switches itself on: "ทางกลับบ้าน" (SPECIAL_BROADCASTS dawnSong). No words.',
        lines: [],
      },
      ALMS,
      BUS_STOP,
    ],
    epilogue: [
      { th: 'เช้านั้น ต้นล้างรถเขียวเหลืองคันเก่า', en: 'That morning, Ton washed the old green-and-yellow cab.' },
      { th: 'แล้วเปิดหน้าต่างบ้านหลังเก่า', en: 'Then he opened the windows of the old house.' },
    ],
    creditsExtra: [{ th: 'ทุกเส้นทางไปจบที่ศาลเจ้ามารวย', en: 'Every road ends at Ma Ruay Shrine.' }],
    unlocks: ['endingDawn'],
  },

  endless: {
    id: 'endless',
    kind: 'bad',
    titleTH: 'กะดึกนิรันดร์',
    titleEN: 'The Endless Shift',
    moment: 'gate',
    when: { flag: { gateLookBack: true } },
    condition: 'Look back at the mist gate when your father calls (rule 3 has no exception).',
    countsAsDeath: false,
    music: 'dread',
    scenes: [
      {
        id: 'fade',
        note: 'Ton turns. Somchai stands in the mist behind the car, smiling sadly (finale.endless). He fades like breath on glass. The mist swallows the road.',
        lines: [],
      },
      {
        id: 'years',
        note: 'Hard cut: the garage, fluorescent tube flickering. An older Ton (grey stubble) smokes beside the taxi. A motorbike headlight comes up the spur road. A young stranger rides in.',
        lines: [
          N('อีกคืนแล้วสินะ', 'Another night, then.', { action: 'smoke' }),
          S('player', 'มาขับกะดึกใช่ไหม... มาแล้วก็ดี', "Here for the night shift? ...Good. You came."),
          S('player', 'กุญแจอยู่นี่ กฎอยู่ในกระดาษ', 'Keys are here. Rules are on the paper.'),
          S('player', 'ข้อสาม... อย่าหัน', "Rule three... don't look back.", { tone: 'whisper' }),
        ],
      },
    ],
    epilogue: [
      { th: 'อู่ กม.9 มีคนเฝ้าคนใหม่', en: 'The KM 9 garage has a new keeper.' },
      { th: 'ที่ไม่เคยได้กลับบ้าน', en: 'One who never made it home.' },
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
    moment: 'finalFork',
    when: { flag: { forgave: true, finalFork: 'right' }, allMemories: true },
    condition: 'All 7 memories; Somchai LEFT; at the gate reply "ขอโทษครับพ่อ" (it only exists with all 7) and do not look back; then RIGHT at the last fork.',
    countsAsDeath: false,
    music: 'song:wayHome',
    scenes: [
      {
        id: 'goldMist',
        note: 'After the forgiveness exchange (gate reply "sorry") the mist turns gold. In the rear-view mirror Somchai raises a hand, the way taxi drivers greet each other on the road. Then he is light. No words.',
        lines: [],
      },
      ALMS,
      BUS_STOP,
      {
        id: 'statue',
        note: "Final shot: inside Ma Ruay Shrine. The deity statue has Ah Kong's face; incense smoke curls from its burner like his cigarette. The statue smiles (SHRINE_REVEAL plays here).",
        lines: [S('ahKong', 'ไปดีมาดีนะ ไอ้หนุ่ม', 'Go well, young man.', { tone: 'whisper', emotion: 'smile' })],
      },
      {
        // He forgave AND took over the cab: a coda from 'successor'.
        id: 'nextShift',
        if: { flag: { takeOver: true } },
        note: 'Coda: the next evening at the garage Ton switches on the red ว่าง lamp himself. Ah Kong\'s stool is empty; a cigarette still smokes in the tin.',
        lines: [S('ahKong', 'กะดึกเป็นของลื้อแล้ว อาตี๋', 'The night shift is yours now, kid.', { tone: 'whisper' })],
      },
    ],
    epilogue: [
      { th: 'บางคืนก็ยาวพอ ให้พ่อลูกได้นั่งรถด้วยกันอีกเที่ยว', en: 'Some nights are long enough for a father and son to share one more ride.' },
      { th: 'ต้นไปไหว้พ่อกับแม่ที่วัด และล้างรถทุกเช้า', en: 'Ton visited his parents at the temple, and washed the car every morning.' },
    ],
    creditsExtra: [{ th: 'ด้วยความระลึกถึงพ่อทุกคนที่พูดไม่เก่ง', en: 'For every father who was never good with words.' }],
    unlocks: ['endingForgive'],
  },

  wrong_home: {
    id: 'wrong_home',
    kind: 'sad',
    titleTH: 'บ้าน',
    titleEN: 'Home',
    moment: 'fork',
    when: { flag: { somchaiFork: 'right' } },
    condition: 'Deliver Somchai RIGHT (the road of the living). Counts as a death; the night loops.',
    countsAsDeath: true,
    music: 'nostalgic',
    scenes: [
      {
        id: 'house',
        note: "The human road bends into a village that should not be there: Ton's childhood house, wooden, shutters closed, empty. The taxi stops by itself.",
        lines: [],
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

  // ---------------------------------------------------------------- new endings (second pass)
  ride_away: {
    id: 'ride_away',
    kind: 'bittersweet',
    titleTH: 'ทางออก',
    titleEN: 'The Way Out',
    moment: 'garage',
    when: { loopsGte: 3, flag: { refusedShift: true, rodeAway: true } },
    condition: 'From the 4th night on (loops >= 3), refuse the keys at the restart ("ผมไม่ขับแล้วครับ", RESTART_KEYS), walk to the old motorbike and ride it back down the spur road to spurStart.',
    countsAsDeath: false,
    music: 'nostalgic',
    scenes: [
      {
        id: 'spur',
        note: 'Ton rides the rusty motorbike down the spur road. Behind him the garage tube flickers once and goes out. He passes the spirit house without slowing. Insects in the headlight. No words.',
        lines: [],
      },
      {
        // He has met his father on an earlier night: he knows who is waiting.
        id: 'mirror',
        if: { any: [{ diedOn: 'somchai' }, { memoriesGte: 4 }] },
        note: 'In the bike mirror, far back through the trees, a man in a faded blue shirt stands under the last streetlight and slowly lifts a hand, the way cabbies greet each other. Ton does not stop.',
        lines: [N('...ขอโทษครับ', "...I'm sorry.")],
      },
      {
        id: 'city',
        note: 'Cut: Bangkok, a rented room before dawn, traffic hiss. Ton asleep in his clothes. The phone clock reads 05:00. He wakes for no reason. The phone lights up: unknown number. He watches it ring out.',
        lines: [],
      },
    ],
    epilogue: [
      { th: 'ต้นไม่เคยกลับไปที่ป่านั้นอีก', en: 'Ton never went back to that forest.' },
      { th: 'แต่ทุกคืนตอนตีห้า เขาตื่นขึ้นมาโดยไม่รู้ว่าทำไม', en: 'But every night at five, he wakes and does not know why.' },
      { th: 'ใต้เสาไฟต้นสุดท้าย ยังมีคนรอรถอยู่', en: 'Under the last streetlight, someone is still waiting for a ride.', if: { any: [{ diedOn: 'somchai' }, { memoriesGte: 4 }] } },
    ],
    creditsExtra: [{ th: 'ประตูไม่เคยล็อก', en: 'The gate was never locked.' }],
    unlocks: ['endingRideAway'],
  },

  join_father: {
    id: 'join_father',
    kind: 'dark',
    titleTH: 'ตามพ่อไป',
    titleEN: 'Following Dad',
    moment: 'finalFork',
    when: { flag: { finalFork: 'left' } },
    condition: 'After the gate (no look-back), take the EMPTY taxi LEFT at the last fork at dawn: the road of the dead, by yourself.',
    countsAsDeath: false,
    music: 'surreal',
    scenes: [
      {
        id: 'left',
        note: 'LEFT, alone, the sunrise behind him. The red ว่าง lamp goes dark by itself; the meter starts on its own (the clue of a ghost passenger — and the only one aboard is Ton). The fog closes behind the taxi. No words.',
        lines: [],
      },
      {
        id: 'gate',
        note: 'The mist gate, gold and still. Somchai stands with his back to the car, at the edge of the light. He does not turn. Ton gets out; rule 3 no longer matters.',
        lines: [
          S('somchai', '...ต้น? มาทำไมลูก', '...Ton? Why are you here, son?', { tone: 'whisper', emotion: 'sad' }),
          S('somchai', 'พ่อบอกให้กลับบ้านไง...', 'I told you to go home...', { tone: 'whisper', emotion: 'sad', if: { flag: { forgave: true } } }),
          N('ผมไม่อยากให้พ่อไปคนเดียว', "I didn't want you to go alone."),
          S('somchai', '...งั้นมานั่งข้างพ่อ', '...then come and sit by me.', { tone: 'whisper', emotion: 'smile' }),
        ],
      },
      {
        id: 'backSeat',
        note: 'Last image: the two of them side by side on the back seat of the parked taxi in the gold mist, not looking at each other, the way men of their kind sit. Then only the empty cab.',
        lines: [],
      },
      {
        id: 'found',
        note: 'Morning. Villagers find the green-yellow taxi parked in front of Ma Ruay Shrine, engine still warm, keys in, nobody inside. Grandma Bua hangs a fresh garland on the mirror.',
        lines: [S('bua', 'ไอ้ชาย... ไอ้ต้น...', 'Chai... Ton...', { tone: 'whisper', emotion: 'sad' })],
      },
    ],
    epilogue: [
      { th: 'เช้านั้น มีคนพบแท็กซี่จอดอยู่หน้าศาลเจ้ามารวย', en: 'That morning someone found a taxi parked in front of Ma Ruay Shrine.' },
      { th: 'เครื่องยังอุ่น ไม่มีคนขับ', en: 'The engine was still warm. Nobody at the wheel.' },
    ],
    creditsExtra: [{ th: 'ซ้ายสำหรับคนตาย', en: 'Left is for the dead.' }],
    unlocks: ['endingJoinFather'],
  },

  successor: {
    id: 'successor',
    kind: 'hopeful',
    titleTH: 'รับกะ',
    titleEN: 'Taking the Shift',
    moment: 'finalFork',
    when: { flag: { takeOver: true, finalFork: 'right' } },
    condition: 'Be kind all night (trust >= 1 with at least 4 passengers: kindness >= 4), so that Somchai\'s question "จะขับต่อไหม" offers "ผมจะขับต่อครับ"; take it; deliver him LEFT, no look-back; RIGHT at the last fork. (With all 7 memories + "ขอโทษครับพ่อ" the forgiveness ending plays instead, with this as its coda.)',
    countsAsDeath: false,
    music: 'song:wayHome',
    scenes: [ALMS, BUS_STOP,
      {
        id: 'garage',
        note: "Evening. The KM 9 garage. Ah Kong's stool is empty; a cigarette still smokes in the tin; two glasses of tea, one untouched. On the driver's seat lies the rules paper. On the back, under Somchai's red ink, a new line in Ah Kong's hand (PAPER.successorNote).",
        lines: [S('ahKong', 'กะดึกเป็นของลื้อแล้ว อาตี๋', 'The night shift is yours now, kid.', { tone: 'whisper' })],
      },
      {
        id: 'vacant',
        note: '21:00. Ton switches on the red ว่าง lamp, honks twice at the spirit house, and pulls out onto the forest road. Far ahead in the headlights, someone hails. This time it is not a loop. It is a job.',
        lines: [S('sri', 'แท็กซี่! แท็กซี่จ้ะ!', 'Taxi! Taxi, dear!', { tone: 'shout' })],
      },
    ],
    epilogue: [
      { th: 'ต้นขับกะดึกต่อจากพ่อ', en: "Ton took over his father's night shift." },
      { th: 'ส่งทุกคนให้ถึงทาง แล้วล้างรถทุกเช้า', en: 'He took everyone the right way, and washed the car every morning.' },
    ],
    creditsExtra: [{ th: 'ใครโบก ก็รับ', en: 'Whoever waves, you stop.' }],
    unlocks: ['endingSuccessor'],
  },
};

/** resolveEnding() tests ENDINGS in this order; the first whose moment and `when` match wins. */
export const ENDING_PRIORITY = ['wrong_home', 'endless', 'join_father', 'forgive', 'successor', 'dawn', 'ride_away'];

export const ENDING_IDS = Object.keys(ENDINGS);
