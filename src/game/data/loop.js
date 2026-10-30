// THE LOOP: dying sends Ton back to 21:00 at the KM 9 garage. The night is the same night;
// what changes is small, physical and quiet — things the player can SEE, so the loop is told by
// the world, not by text. Gameplay reads these on every restart (saves.data.loops = deaths so far).
//
// LOOP_STAGING.<thing> = [{ minLoop, ...state }]  → logic.byLoop(LOOP_STAGING.<thing>, loops)
//   (the entry with the highest minLoop <= loops; each table starts at minLoop 0 = the first night)
// DEJA_VU = [{ minLoop, maxLoop?, trigger, lines:[Line] }]  optional one-off moments, at most ONE per
//   restart (the first whose trigger fires and whose loop range matches). Triggers:
//   'seeTally' (gaze rests on the dash tally 0.8 s), 'garageRadio' (within 6 m of the garage radio),
//   'calendar' (looks at the calendar), 'enterTaxi'. (No dog: the owner removed it from the game.)
// Lines that change with the loop live with their speakers:
//   Ah Kong: ahkong.js RESTART_LINES / RESTART_KEYS (refusal from loops >= 3 → ending ride_away)
//   passengers: rides/*.js `loopVariants` (whole block by loop) and line/option `if: { loopsGte, diedOn }`.
const T = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });

export const LOOP_STAGING = {
  /** A scratch tally on the dashboard, beside the blue-elephant sticker. One new mark per death. */
  tally: [
    { minLoop: 0, marks: 0 },
    { minLoop: 1, marks: 'loops', style: 'keyScratch', note: 'Scratched with a key into the dash vinyl, groups of five (four uprights, one across). Nobody is seen making them; each restart there is simply one more, fresh and pale.' },
    { minLoop: 6, marks: 'loops', style: 'keyScratch', olderMarks: 99, note: 'Under the fresh marks, older ones come into view, worn almost smooth: ninety-nine of them in another hand. (The curve tally reads ~~99~~ 100.)' },
  ],
  /** The red-and-gold tear-off calendar (worldtext GARAGE_CALENDAR), stuck on September. */
  calendar: [
    { minLoop: 0, page: 'September', circled: [14], note: 'ทำบุญ ๗ วัน ไอ้ชาย, as in GARAGE_CALENDAR.' },
    { minLoop: 2, page: 'September', circled: [14], pencilTicks: 'loops', note: 'Small pencil ticks beside the 14: one per night lived. Nobody admits to them.' },
    { minLoop: 5, page: 'September', circled: [14, 15], note: 'The 15th is circled too, in fresher red: "tomorrow" is being hoped for.' },
    { minLoop: 9, page: 'September', circled: 'all', note: 'Every day of the month is circled.' },
  ],
  /** The garage's own little radio on the tool chest. */
  radio: [
    { minLoop: 0, on: false },
    { minLoop: 1, on: true, station: 1, song: 'countryTears', fromLyric: 0, note: 'Already playing when Ton wakes on the stool: the same song, from the same line, every restart.' },
    { minLoop: 4, on: true, station: 1, song: 'countryTears', fromLyric: 2, note: 'It has moved on two lines. The night is wearing thin.' },
  ],
  /** Ah Kong himself. */
  ahKong: [
    { minLoop: 0, cigarette: 'fresh', tea: false, where: 'besideTaxi' },
    { minLoop: 1, cigarette: 'half', tea: false, where: 'besideTaxi', note: 'The ash is exactly as long every time.' },
    { minLoop: 4, cigarette: 'half', tea: true, where: 'stool', note: 'A glass of tea waits on the table for Ton (RESTART_LINES 4).' },
    { minLoop: 12, cigarette: 'half', tea: true, where: 'dark', note: 'The stool is empty when Ton wakes; Ah Kong steps out of the dark at the back of the garage.' },
  ],
  /** The gecko always calls seven times at 21:00 (Sri counts them too). */
  gecko: [{ minLoop: 0, calls: 7 }],
};

export const DEJA_VU = [
  { minLoop: 1, maxLoop: 1, trigger: 'seeTally', lines: [T('รอยนี้... เมื่อกี้ไม่มี', "This mark... it wasn't here before.")] },
  { minLoop: 1, maxLoop: 2, trigger: 'garageRadio', lines: [T('เพลงนี้... ท่อนเดิม', 'This song... the same verse.')] },
  { minLoop: 5, maxLoop: 5, trigger: 'seeTally', lines: [T('ห้ารอยแล้ว', 'Five marks now.')] },
];
