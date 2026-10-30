// ENCOUNTERS: every scare, folklore sighting, rule event and "beautiful moment" the
// encounter director can stage (GAME_DESIGN §6). The director picks free-drive encounters
// by hour/where/chance/cooldown; ride encounters are scheduled by PASSENGERS[].encounters.
//
// ENCOUNTERS[id] = {
//   id, nameTH, nameEN,
//   kind: 'scare'|'folklore'|'rule'|'beautiful'|'story',
//   hours: [from, to] | [[from,to], ...]   game hours 21..30 (24 = 00:00, 30 = 06:00), `to` exclusive,
//   where: 'any' | 'freeDrive' | 'nearLandmark:<LAYOUT key>' | 'ride:<passengerId>' | 'ride:anyGhost'  (string or array: any match),
//   gazeMode: 'notLooking' (spawn only outside the view, reveal when looked at) | 'mirrorOnly' |
//             'sideWindow' (only visible through a side window) | 'any',
//   cooldownSec, chance (0..1 per director check, ~every 6 s while eligible; ride-scheduled ones ignore chance),
//   durationSec: [min,max], ruleId?: 'r1'..'r10' when it is a rule event,
//   creature?: creatures/ factory name, respectSoftens?: r10 respect shortens it, amuletRepels?: holding the amulet ends it,
//   needsReflection?: only for passengers whose clues.reflection is not 'none',
//   lines?: [Line] spoken when it starts, whispers?: [Line] random ambient whispers while it runs,
//   choice?: { prompt?:Line, id, options:[{key,th,en}], timeout, defaultKey },
//   outcomes?: { key: { lines:[Line], result:'safe'|'death:<type>'|'ending:<id>'|'scare:<name>'|'escalate:<name>' } },
//   exception?: true          this encounter is a rule's designed EXCEPTION (nothing bad happens; the rule
//                             "should" apply but does not: monk + 444, betel juice, the father's dedication),
//   requires?: { radioOn?: true, passengerAboard?: bool }  extra spawn gates (free drive),
//   chains?: [{ id, atSecond, if?: Condition }]  start another encounter while this one runs (444 → window knock),
//   broadcast?: SPECIAL_BROADCASTS id whose lines this encounter plays on the radio,
//   staging: designer notes for the director / creatures programmer,
// }
// Lines follow the Line schema (SCHEMA.md). who:'voice' = disembodied.
//
// WHO OWNS THE REPLY: an encounter's own `choice` is played by the encounter director, UNLESS the
// current ride has a beat on 'encounter:<id>' whose lines contain a reply moment: then the ride beat
// owns the talking (its options set flags.ruleBreak, see RULE_BREAKS) and the encounter only stages,
// whispers and resolves outcomes. Thai-first: most encounters say nothing at all on screen.

const V = (th, en, x = {}) => ({ who: 'voice', th, en, tone: 'ghost', ...x });
const W = (th, en) => ({ who: 'voice', th, en, tone: 'whisper' });
const S = (who, th, en, x = {}) => ({ who, th, en, ...x });

export const ENCOUNTERS = {
  // ---------------------------------------------------------------- dread 21–23
  treeWatcher: {
    id: 'treeWatcher', nameTH: 'คนยืนในป่า', nameEN: 'Tree Watcher', kind: 'scare',
    hours: [21, 23], where: ['freeDrive', 'ride:sri'], gazeMode: 'sideWindow',
    cooldownSec: 150, chance: 0.35, durationSec: [6, 14], creature: 'createWindowGhost', respectSoftens: true,
    staging: 'Pale figure 8–15 m off the road between trunks, visible only through a side window. When looked at directly (>0.4 s) it is gone; reappears 60–90 m ahead on the same side.',
  },
  womanRunning: {
    id: 'womanRunning', nameTH: 'ผู้หญิงวิ่งข้างรถ', nameEN: 'Woman Running Beside the Car', kind: 'scare',
    hours: [21, 23], where: 'freeDrive', gazeMode: 'mirrorOnly',
    cooldownSec: 240, chance: 0.2, durationSec: [8, 12], creature: 'createWindowGhost', amuletRepels: true,
    whispers: [W('รอด้วย...', 'Wait for me...'), W('ช้าหน่อย...', 'Slow down...')],
    staging: 'First only in the left side mirror, keeping pace at any speed; then through the side window. Her neck turns toward the driver while her body keeps running.',
  },
  salaShadows: {
    id: 'salaShadows', nameTH: 'เงาหลังศาลา', nameEN: 'Shadows Behind the Sala', kind: 'scare',
    hours: [21, 24], where: ['nearLandmark:sala1', 'nearLandmark:sala2', 'ride:sri'], gazeMode: 'notLooking',
    cooldownSec: 300, chance: 0.5, durationSec: [4, 7],
    staging: 'Two or three dark figures slip between the sala pillars as the taxi passes; never in full view.',
  },
  phiTaiHong: {
    id: 'phiTaiHong', nameTH: 'ผีตายโหง', nameEN: 'Phi Tai Hong', kind: 'folklore',
    hours: [[22, 23], [24, 25]], where: 'nearLandmark:accidentCurve', gazeMode: 'any',
    cooldownSec: 600, chance: 0.6, durationSec: [6, 10], creature: 'createPhiTaiHong', respectSoftens: true,
    whispers: [W('เจ็บ... เจ็บ...', 'It hurts... it hurts...'), W('ใครก็ได้... เรียกรถพยาบาลที', 'Someone... call an ambulance...')],
    staging: 'Broken, wet figure crouched by the wreaths and the old crashed motorbike, twitching. Stands up as the headlights pass.',
  },

  // ---------------------------------------------------------------- ride 2 set pieces
  fingersDoorFrame: {
    id: 'fingersDoorFrame', nameTH: 'นิ้วเกาะขอบประตู', nameEN: 'Fingers on the Door Frame', kind: 'scare',
    hours: [21, 30], where: 'ride:womanWhite', gazeMode: 'notLooking',
    cooldownSec: 0, chance: 1, durationSec: [5, 8], creature: 'createWindowGhost',
    staging: 'Long grey fingers curl around the rear-left window frame from outside while moving; they tighten when looked at, then slide away.',
  },
  upsideDownHead: {
    id: 'upsideDownHead', nameTH: 'หัวห้อยหน้ากระจก', nameEN: 'Upside-Down Head', kind: 'scare',
    hours: [21, 30], where: 'ride:womanWhite', gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [4, 6], creature: 'createWindowGhost',
    staging: 'Her head (wet hair hanging up) lowers slowly into the top of the windshield from the roof while she is still seated in the back. Wipers pass through the hair.',
  },
  faceAgainstGlass: {
    id: 'faceAgainstGlass', nameTH: 'หน้าแนบกระจก', nameEN: 'Face Against the Glass', kind: 'scare',
    hours: [21, 30], where: ['ride:womanWhite', 'ride:saman'], gazeMode: 'sideWindow',
    cooldownSec: 0, chance: 1, durationSec: [3, 5], creature: 'createWindowGhost',
    staging: 'A face presses against the side glass from outside and smears the condensation (taxi.addGlassMark face). In ride 7 it is Saman\'s own face, grinning, while he also sits inside.',
  },
  cabinLightDies: {
    id: 'cabinLightDies', nameTH: 'ไฟในรถดับเอง', nameEN: 'The Cabin Light Dies', kind: 'rule', ruleId: 'r9',
    hours: [21, 27], where: ['ride:womanWhite', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 600, chance: 0.15, durationSec: [10, 16],
    whispers: [W('ดีแล้ว... มืดดีแล้ว', "Good... the dark is good."), W('ข้างบน...', 'Up here...')],
    outcomes: {
      lightOn: { lines: [V('เห็นแล้ว...', 'I see you now...')], result: 'death:ceilingCrawl' },
      waited: { lines: [], result: 'safe' },
    },
    staging: 'If the cabin light is on it flickers and dies; if it is off, the dashboard dims too. Scratching across the headliner. Switching it back on = ceiling crawl.',
  },
  twistedNeckReflection: {
    id: 'twistedNeckReflection', nameTH: 'คอบิดในกระจก', nameEN: 'Twisted Neck in the Mirror', kind: 'scare',
    hours: [21, 30], where: 'ride:boyM', gazeMode: 'mirrorOnly', needsReflection: true,
    cooldownSec: 900, chance: 0.25, durationSec: [2, 4],
    staging: 'Only a passenger who HAS a reflection can do this (boy M exists only in the mirror). humanoid.createReflectionDouble({ neckTwist: 1.6 }): his head bent 90°, staring. Plays as the rule-6 escalation when the radio is left on (radioIgnored), or rarely when the player stares into the mirror. Snaps back when the player looks away.',
  },

  // ---------------------------------------------------------------- surreal 22–02
  wireCrawler: {
    id: 'wireCrawler', nameTH: 'ตัวอะไรบนสายไฟ', nameEN: 'Wire Crawler', kind: 'folklore',
    hours: [22, 25], where: ['freeDrive', 'ride:piak'], gazeMode: 'any',
    cooldownSec: 400, chance: 0.25, durationSec: [6, 10], creature: 'createWireCrawler',
    staging: 'Long-limbed thing crawling along the sagging wires overhead, lit in pulses by flickering streetlights; the wires bounce. Visible through the top of the windshield.',
  },
  roofCrawler: {
    id: 'roofCrawler', nameTH: 'อะไรอยู่บนหลังคา', nameEN: 'Roof Crawler', kind: 'scare',
    hours: [22, 26], where: 'freeDrive', gazeMode: 'any',
    cooldownSec: 500, chance: 0.18, durationSec: [5, 9], amuletRepels: true,
    staging: 'Dents and thumps on the roof, the headliner bulges, a shadow crosses the windshield top edge; a hand slaps the windshield once, then it leaps into the trees.',
  },
  somethingEnormous: {
    id: 'somethingEnormous', nameTH: 'ร่างยักษ์ในป่า', nameEN: 'Something Enormous', kind: 'folklore',
    hours: [23, 25], where: ['freeDrive', 'ride:piak', 'ride:boyM'], gazeMode: 'any',
    cooldownSec: 900, chance: 0.15, durationSec: [5, 8], creature: 'createForestGiant',
    staging: 'A vast silhouette moves between the trunks 40–80 m away, lit for a moment by a streetlight. The ground thuds faintly; the amulet warms.',
  },
  yaiSpeed: {
    id: 'yaiSpeed', nameTH: 'ยายสปีด', nameEN: 'Yai Speed', kind: 'folklore',
    hours: [23, 25], where: ['freeDrive', 'ride:piak'], gazeMode: 'any',
    cooldownSec: 600, chance: 0.3, durationSec: [10, 18], creature: 'createYaiSpeed', amuletRepels: true, respectSoftens: true,
    whispers: [V('หึ หึ หึ...', 'Heh heh heh...')],
    outcomes: {
      slowed: { lines: [], result: 'safe' },
      raced: { lines: [V('แข่งกับยายเหรอ...', 'Racing Granny, are we...')], result: 'scare:hood' },
    },
    staging: 'An old woman sprints alongside at any speed with an impossible gait, overtakes, turns her head 180° while running. Slow down (<35 km/h) and she passes. Stare + accelerate and she lands on the hood (scare, crack in the glass); holding the amulet throws her off.',
  },
  krasue: {
    id: 'krasue', nameTH: 'กระสือ', nameEN: 'Krasue', kind: 'folklore',
    hours: [24, 26], where: ['nearLandmark:bananaGrove', 'ride:boyM', 'ride:nuan'], gazeMode: 'any',
    cooldownSec: 600, chance: 0.6, durationSec: [8, 14], creature: 'createKrasue',
    staging: 'A floating woman\'s head with glowing entrails drifts through the banana trees, green-gold light on the leaves. It notices the car, then loses interest.',
  },
  krahang: {
    id: 'krahang', nameTH: 'กระหัง', nameEN: 'Krahang', kind: 'folklore',
    hours: [25, 27], where: ['freeDrive', 'ride:nuan', 'ride:monk'], gazeMode: 'any',
    cooldownSec: 600, chance: 0.4, durationSec: [6, 10], creature: 'createKrahang',
    staging: 'A man flying on winnowing-basket wings with a pestle tail crosses the canopy against the red moon; wing-beats like flapping rice baskets.',
  },
  radioSelfOn: {
    id: 'radioSelfOn', nameTH: 'วิทยุเปิดเอง', nameEN: 'The Radio Turns Itself On', kind: 'rule', ruleId: 'r6',
    hours: [21, 30], where: 'ride:boyM', gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [8, 20],
    lines: [{ who: 'radio', th: '♪ หนึ่ง... สอง... สาม... ข้ามถนน... ♪', en: '♪ One... two... three... cross the road... ♪', tone: 'ghost' }],
    outcomes: {
      off: { lines: [], result: 'safe' },
      ignored: { lines: [{ who: 'radio', th: 'ปิด... ปิด... ปิด...', en: 'Off... off... OFF...', tone: 'ghost' }], result: 'death:radio' },
    },
    staging: 'taxi.setControl("radio", true) by itself; static + a warped children\'s counting song. Boy M asks for it off; RULE_PARAMS.radioGraceSeconds then escalation.',
  },
  nameCall: {
    id: 'nameCall', nameTH: 'เสียงเรียกชื่อ', nameEN: 'A Voice Calls Your Name', kind: 'rule', ruleId: 'r7',
    hours: [22, 29], where: ['ride:nuan', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 900, chance: 0.12, durationSec: [8, 12],
    lines: [
      V('ต้น...', 'Ton...', { tone: 'whisper' }),
      V('ต้น... ลูก... แม่เอง', "Ton... sweetheart... it's Mum."),
      V('เปิดประตูให้แม่หน่อย แม่หนาว', "Open the door for Mum. I'm cold."),
    ],
    choice: {
      id: 'nameCall',
      options: [{ key: 'answer', th: 'ครับ?', en: 'Yes?' }, { key: 'silent', th: '…', en: '(stay silent)' }],
      timeout: 6, defaultKey: 'silent',
    },
    outcomes: {
      answer: { lines: [V('...ได้ยินแล้ว', '...I heard you.', { tone: 'whisper' })], result: 'death:nameCall' },
      silent: { lines: [V('ต้น... ต้น...', 'Ton... Ton...', { tone: 'whisper' })], result: 'safe' },
      windowOpened: { lines: [V('ขอบใจจ้ะ...', 'Thank you, dear...')], result: 'death:nameCall' },
    },
    staging: 'Voice moves around the car outside (HRTF), first sweet then wrong. Stopping + opening a window while it calls = death. Emits nameCallAnswered / nameCallIgnored.',
  },
  breathOnNeck: {
    id: 'breathOnNeck', nameTH: 'ลมหายใจรดต้นคอ', nameEN: 'Breath on the Neck', kind: 'rule', ruleId: 'r8',
    hours: [22, 28], where: ['ride:saman', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 900, chance: 0.1, durationSec: [5, 8], amuletRepels: true,
    whispers: [W('หันมาสิ...', 'Turn around...'), W('ข้างหลังนี่...', 'Right behind you...'), W('ฮืออ...', 'Hhhhh...')],
    outcomes: {
      held: { lines: [], result: 'safe' },
      failed: { lines: [V('เห็นหน้าแล้ว', 'Now I see your face.')], result: 'death:breath' },
    },
    staging: 'Cold breath sound right behind the driver\'s head, rear-right window fogs from inside, hairs on the neck (camera micro-shake). Hold amulet (gold aura) + look within RULE_PARAMS.breathLookForwardConeDeg. Emits breathPassed.',
  },
  trunkKnocks: {
    id: 'trunkKnocks', nameTH: 'เสียงเคาะท้ายรถ', nameEN: 'Three Knocks from the Trunk', kind: 'rule', ruleId: 'r5',
    hours: [22, 26], where: ['ride:piak', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 900, chance: 0.1, durationSec: [20, 30],
    lines: [],
    whispers: [V('เปิด... ให้หน่อย...', 'Let... me... out...')],
    outcomes: {
      kept: { lines: [V('...คราวหน้านะ', '...next time, then.', { tone: 'whisper' })], result: 'safe' },
      stopped: { lines: [V('จอดแล้ว...', 'You stopped...')], result: 'death:trunk' },
    },
    staging: 'knock ×3 (RULE_PARAMS.knockIntervalSeconds) from inside the trunk, emits knock1..knock3. Trunk lid rattles in the mirror. Stay above knockStopSpeedKmh for knockDangerSeconds.',
  },
  reflectionStays: {
    id: 'reflectionStays', nameTH: 'เงาในกระจกที่ไม่ยอมลง', nameEN: 'The Reflection That Stays', kind: 'scare',
    hours: [21, 30], where: 'ride:boyM', gazeMode: 'mirrorOnly', needsReflection: true,
    cooldownSec: 0, chance: 1, durationSec: [6, 10],
    lines: [{ who: 'boyM', th: 'พี่ครับ... ผมยังอยู่นี่', en: "Mister... I'm still here.", tone: 'ghost' }],
    staging: 'Wrong-fork aftermath for ride 4: the boy is gone, but his reflection remains seated and slowly turns to look at you; then the road folds (dragBack).',
  },

  // ---------------------------------------------------------------- calm & dawn (beautiful)
  strayDogs: {
    id: 'strayDogs', nameTH: 'หมาวัดวิ่งไล่รถ', nameEN: 'Temple Dogs Chase the Taxi', kind: 'beautiful',
    hours: [26, 28], where: ['nearLandmark:forestTemple', 'ride:monk', 'ride:saman'], gazeMode: 'any',
    cooldownSec: 400, chance: 0.5, durationSec: [8, 12],
    staging: '3–5 scruffy dogs (createQuadruped("dog")) burst out barking and chase the taxi for 100 m, then trot back proudly.',
  },
  monkBlessing: {
    id: 'monkBlessing', nameTH: 'หลวงพี่ให้พร', nameEN: "The Monk's Blessing", kind: 'story',
    hours: [21, 30], where: 'ride:monk', gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [10, 14],
    whispers: [W('สาธุ...', 'Sadhu...'), W('สาธุ...', 'Sadhu...'), W('สาธุ...', 'Sadhu...')],
    staging: 'While he chants, every ghost along the road (tree watcher, sala shadows, the woman in white far off, M at the bus stop) glows faintly gold and wai\'s the passing car. Music swells softly.',
  },
  fireflies: {
    id: 'fireflies', nameTH: 'หิ่งห้อย', nameEN: 'Fireflies', kind: 'beautiful',
    hours: [26, 29], where: 'any', gazeMode: 'any',
    cooldownSec: 300, chance: 0.4, durationSec: [20, 40],
    staging: 'Clouds of fireflies pulse in sync over the ditch and the banana leaves.',
  },
  noodleShopOpen: {
    id: 'noodleShopOpen', nameTH: 'ร้านป้าเล็กยังเปิด', nameEN: "Auntie Lek's Is Still Open", kind: 'beautiful',
    hours: [21, 30], where: 'nearLandmark:noodleShop', gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [0, 0],
    lines: [{ who: 'auntieLek', th: 'แวะก่อนไหมหนุ่ม กาแฟร้อน ๆ', en: 'Stopping by, dear? Hot coffee.' }],
    staging: 'Optional stop during free drive. Auntie Lek is human: coffee and snacks, memory m_noodle. See WORLD_TEXT.noodleMenu and MEMORIES.m_noodle.',
  },
  elephants: {
    id: 'elephants', nameTH: 'ช้างป่าข้ามถนน', nameEN: 'Elephant Family Crossing', kind: 'beautiful',
    hours: [28, 29], where: ['ride:bua', 'nearLandmark:elephantCrossing'], gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [20, 30],
    staging: 'Mother, aunt and a calf cross in the blue-hour mist; the calf stops to look at the headlights, then hurries after its mother. If the player honks they trumpet softly. Spawn on the road ahead of the taxi during ride 8 (the sign at elephantCrossing is behind the marketLamp pickup). Emits "elephants".',
  },
  dawnBirds: {
    id: 'dawnBirds', nameTH: 'นกเช้า', nameEN: 'Dawn Chorus', kind: 'beautiful',
    hours: [28, 30], where: 'any', gazeMode: 'any',
    cooldownSec: 120, chance: 0.6, durationSec: [30, 60],
    staging: 'Magpie-robins, bulbuls and roosters; a flock of egrets lifts off a paddy beyond the trees.',
  },
  monksAlms: {
    id: 'monksAlms', nameTH: 'พระบิณฑบาต', nameEN: 'Monks on the Alms Round', kind: 'beautiful',
    hours: [29, 30], where: ['ride:somchai', 'any'], gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [15, 25],
    staging: 'A line of barefoot monks in saffron walks single file along the misty roadside with alms bowls; villagers kneel with rice. One small novice waves.',
  },
  fatherCall: {
    id: 'fatherCall', nameTH: 'เสียงพ่อจากเบาะหลัง', nameEN: "Father's Voice from the Back Seat", kind: 'rule', ruleId: 'r3',
    hours: [29, 30], where: 'ride:somchai', gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [12, 20],
    outcomes: {
      lookedBack: { lines: [], result: 'ending:endless' },
      drove: { lines: [], result: 'safe' }, // → fatherDelivered: the empty dawn drive to the LAST fork (ENDINGS moment 'finalFork')
    },
    staging: 'At the mist gate he steps out; door closes; then his voice from the rear-right seat (RIDE_SOMCHAI.finale.stepOut), then the gate reply (finale.gateReply). Camera look limits stay open: the player must choose not to turn. A `wait` reply sets flags.lure = "r3": his voice moves right behind the headrest for RULE_PARAMS.lureSeconds.',
  },

  // ---------------------------------------------------------------- back of the paper (r11–r16)
  roadFigure: {
    id: 'roadFigure', nameTH: 'คนยืนกลางถนน', nameEN: 'Someone Standing in the Road', kind: 'rule', ruleId: 'r12',
    hours: [21, 29], where: ['ride:sri', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 700, chance: 0.12, durationSec: [6, 10], creature: 'createWindowGhost',
    whispers: [W('จอด...', 'Stop...'), W('ช่วยด้วย...', 'Help me...')],
    outcomes: {
      passed: { lines: [W('เย็น...', 'Cold...')], result: 'safe' },
      braked: { lines: [V('จอดให้แล้ว...', 'You stopped for me...')], result: 'death:roadFigure' },
      swerved: { lines: [V('หลบทำไม...', 'Why swerve...')], result: 'death:roadFigure' },
    },
    staging: 'A thin figure stands dead centre of the lane 80 m ahead, arms at its sides, NOT hailing, lit only by the headlights. It never moves. Slowing under RULE_PARAMS.roadFigureNoBrakeMinKmh within roadFigureDangerM, or leaving the asphalt, = it reaches the windshield. Driving through: a cold white flash, the glass fogs from outside, and for a few seconds it stands in the road BEHIND you in the rear-view mirror. In ride 1 Auntie Sri screams at you to brake (the temptation).',
  },
  bloodDrip: {
    id: 'bloodDrip', nameTH: 'เลือดหยดลงกระจก', nameEN: 'Blood on the Windshield', kind: 'rule', ruleId: 'r13',
    hours: [21, 27], where: ['ride:womanWhite', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 800, chance: 0.1, durationSec: [10, 16],
    whispers: [W('ปัดสิ...', 'Wipe it...'), W('ปัดให้หน่อย...', 'Wipe it for me...')],
    outcomes: {
      letRun: { lines: [], result: 'safe' },
      wiped: { lines: [V('เห็นแล้วใช่ไหม...', 'Now you see me...')], result: 'death:roofHanger' },
    },
    staging: 'Dark drops fall from the roof edge onto the top of the windshield, then thin runnels (gore setting). Wipers must be OFF within RULE_PARAMS.bloodWiperGraceSeconds — in the rain of ride 2 they are probably ON. Each wipe smears it and shows more of what hangs from the roof (wet hair, a hand); bloodWipeFailSeconds of wiping = it slides down onto the glass. Gameplay sets flags.bloodOnGlass while it runs. Leads into upsideDownHead in ride 2.',
  },
  betelSpit: {
    id: 'betelSpit', nameTH: 'น้ำหมาก', nameEN: 'Betel Juice', kind: 'rule', ruleId: 'r13', exception: true,
    hours: [27, 28], where: 'ride:saman', gazeMode: 'any',
    cooldownSec: 0, chance: 1, durationSec: [8, 12],
    outcomes: {
      wiped: { lines: [], result: 'safe' },
      letRun: { lines: [], result: 'safe' },
    },
    staging: 'r13 EXCEPTION. Uncle Saman spits betel juice "out of the window" straight through the closed glass (he is a ghost; rule 14 stays unbroken) and the wind spatters it red across the windshield. It looks exactly like the blood of r13, but it is only betel: wiping is safe. Not wiping is safe too; he teases you.',
  },
  meter444: {
    id: 'meter444', nameTH: 'มิเตอร์ ๔๔๔', nameEN: 'The Meter Shows 444', kind: 'rule', ruleId: 'r11',
    hours: [23, 29], where: ['ride:nuan', 'ride:monk', 'freeDrive'], gazeMode: 'any',
    cooldownSec: 900, chance: 0.1, durationSec: [14, 22],
    lines: [
      V('หนึ่ง...', 'One...', { tone: 'whisper' }),
      V('สอง...', 'Two...', { tone: 'whisper' }),
      V('สาม...', 'Three...', { tone: 'whisper' }),
      V('สี่...', 'Four...', { tone: 'whisper' }),
    ],
    choice: {
      prompt: V('นับถึงไหนแล้ว...', 'Where are you up to...?', { tone: 'whisper' }),
      id: 'count444',
      options: [{ key: 'answer', th: 'เจ็ด', en: 'Seven.' }, { key: 'silent', th: '…', en: '(keep counting in your head)' }],
      timeout: 6, defaultKey: 'silent',
    },
    outcomes: {
      answer: { lines: [V('แปด... เก้า... สิบ', 'Eight... nine... TEN.')], result: 'death:count444' },
      silent: { lines: [V('...สิบ', '...ten.', { tone: 'whisper' })], result: 'safe' },
      lookedAtGlass: { lines: [V('เห็นหน้าแล้ว...', 'I see your face...')], result: 'death:count444' },
      didntStop: { lines: [V('ไม่จอด... ก็นับต่อในรถ', "Won't stop? Then I'll count inside.")], result: 'death:count444' },
      monkAboard: { lines: [], result: 'safe' },
    },
    chains: [{ id: 'windowKnock', atSecond: 6, if: { hourGte: 24 } }],
    staging: 'The meter rolls to 444.00 and freezes; its digits glow red. Stop within RULE_PARAMS.meter444StopWithinSeconds, then for meter444CountSeconds keep the gaze off every mirror and window (looking DOWN at the dash or lap, pitch < meter444LookDownPitchDeg, is safe). A voice outside counts slowly along the car, one number per second, moving window to window; at four it stops and asks how far YOU have got. Counting is meant to be done in your head: answering aloud is the break. After midnight it chains windowKnock (something taps on the glass while you must not look at it). EXCEPTION: with the monk aboard nothing counts; the number is just a number (outcome monkAboard, no lines, no choice).',
  },
  windowKnock: {
    id: 'windowKnock', nameTH: 'มีคนเคาะกระจก', nameEN: 'A Knock at the Window', kind: 'rule', ruleId: 'r14',
    hours: [24, 30], where: ['ride:nuan', 'freeDrive'], gazeMode: 'sideWindow',
    cooldownSec: 900, chance: 0.12, durationSec: [10, 16], creature: 'createWindowGhost',
    lines: [
      V('พี่... มีไฟแช็กไหม', 'Hey... got a lighter?', { tone: 'whisper' }),
      V('ลดกระจกหน่อยสิ', 'Roll the window down a bit.', { tone: 'whisper' }),
    ],
    choice: {
      id: 'windowKnock',
      options: [{ key: 'invite', th: 'แป๊บนึงครับ', en: 'Hang on.' }, { key: 'no', th: 'ไม่มีครับ', en: "Don't have one." }, { key: 'silent', th: '…', en: '(say nothing)' }],
      timeout: 7, defaultKey: 'silent',
    },
    outcomes: {
      invite: { lines: [V('ขอบใจ...', 'Thanks...', { tone: 'whisper' })], result: 'escalate:windowCreep' },
      no: { lines: [V('...งั้นไม่เป็นไร', '...never mind, then.', { tone: 'whisper' })], result: 'safe' },
      silent: { lines: [], result: 'safe' },
      windowOpened: { lines: [V('ขอบใจนะ...', 'Thank you...')], result: 'death:windowArm' },
    },
    staging: 'Three soft knocks on the driver window (or the passenger\'s). Through the fogged glass: a dark shape with an unlit cigarette, too tall, its face never in focus. Asks politely, then less politely. Opening any window past RULE_PARAMS.windowOpenFailAmount while it waits = a long grey arm reaches in. Replying "แป๊บนึงครับ" is an invitation: the window starts winding itself down (RULE_BREAKS.r14 windowCreep) until you crank it up. EXCEPTION (not this encounter): the monk asking for the window is safe.',
  },
  radioName: {
    id: 'radioName', nameTH: 'วิทยุเรียกชื่อ', nameEN: 'The Radio Says Your Name', kind: 'rule', ruleId: 'r15',
    hours: [22, 29], where: ['ride:piak', 'freeDrive'], gazeMode: 'any', requires: { radioOn: true },
    cooldownSec: 900, chance: 0.15, durationSec: [8, 14],
    lines: [
      S('djNok', 'เพลงต่อไป... ขอมอบให้...', 'The next song... goes out to...'),
      S('radio', 'ต้น...', 'Ton...', { tone: 'ghost' }),
      S('radio', 'ต้น... ได้ยินพี่ไหม', 'Ton... can you hear me?', { tone: 'ghost' }),
    ],
    choice: {
      id: 'radioName',
      options: [{ key: 'answer', th: 'ครับ?', en: 'Yes?' }, { key: 'silent', th: '…', en: '(say nothing)' }],
      timeout: 5, defaultKey: 'silent',
    },
    outcomes: {
      retuned: { lines: [], result: 'safe' },
      answer: { lines: [S('voice', '...ได้ยินแล้ว', '...I heard you.', { tone: 'whisper' })], result: 'escalate:backSeatVoice' },
      switchedOff: { lines: [S('voice', 'ปิดทำไม... พี่อยู่ข้างหลังนี่เอง', "Why switch me off... I'm right behind you.", { tone: 'whisper' })], result: 'escalate:backSeatVoice' },
      ignored: { lines: [S('voice', 'ต้น...', 'Ton...', { tone: 'whisper' })], result: 'escalate:backSeatVoice' },
    },
    staging: "DJ Nok's cheerful voice slows and drops an octave mid-sentence and says the driver's name. Retune within RULE_PARAMS.radioNameTuneSeconds = safe (static, then an ordinary song). Switching OFF, answering, or doing nothing = the same voice continues from the back seat (escalate backSeatVoice: 'ต้น… หันมาสิ', a rule-3 test; looking back = death:lookBack). In ride 3 Uncle Piak has just asked for the radio. EXCEPTION (fatherDedication): at 03:00 on station 3 the name is said by Somchai's request — listen to the end.",
  },
  fatherDedication: {
    id: 'fatherDedication', nameTH: 'เพลงที่พ่อขอ', nameEN: "The Father's Request", kind: 'rule', ruleId: 'r15', exception: true,
    hours: [27, 28], where: ['ride:saman', 'freeDrive'], gazeMode: 'any', requires: { radioOn: true },
    cooldownSec: 0, chance: 1, durationSec: [40, 70], broadcast: 'fatherRequest',
    outcomes: {
      listened: { lines: [], result: 'safe' }, // memory m_song
      retuned: { lines: [], result: 'safe' }, // missed: nothing bad, the song is gone for this night
    },
    staging: 'r15 EXCEPTION. Station 3 at 03:00: an announcer reads one old request — from Somchai, for his son, ต้น. The radio says your name, but this is the one time you do not retune: listen to the end ("ทางกลับบ้าน", memory m_song). Switching off or retuning is safe, just a loss.',
  },
  extraPassenger: {
    id: 'extraPassenger', nameTH: 'คนเกินในกระจก', nameEN: 'One Too Many in the Mirror', kind: 'rule', ruleId: 'r16',
    hours: [22, 29], where: ['ride:boyM', 'freeDrive'], gazeMode: 'mirrorOnly',
    cooldownSec: 900, chance: 0.1, durationSec: [12, 20], creature: 'extraChild',
    choice: {
      id: 'extraPassenger',
      options: [{ key: 'asked', th: 'ใครน่ะ', en: "Who's there?" }, { key: 'silent', th: '…', en: '(say nothing)' }],
      timeout: 7, defaultKey: 'silent',
    },
    outcomes: {
      asked: { lines: [S('extraChild', 'หนูเอง...', "It's me...", { tone: 'ghost' }), S('extraChild', 'พี่ทักหนูแล้วนะ', 'You spoke to me.', { tone: 'whisper' })], result: 'death:extraPassenger' },
      stopped: { lines: [S('extraChild', 'จอดให้หนูลงเหรอ...', 'Stopping to let me out...?', { tone: 'whisper' })], result: 'death:extraPassenger' },
      silent: { lines: [], result: 'safe' },
    },
    staging: 'Only in the REAR-VIEW mirror: a small girl in an older-pattern school uniform (CHARACTERS.extraChild) sits beside the passenger (or alone, in free drive). Direct view: nobody. She does not move, does not blink, smiles a little wider each time you check. Asking, greeting or stopping = she answers, and then she is in the front seat. In ride 4 it is Boy M who asks you who she is (the temptation).',
  },
};

export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS);

/** Death ids produced by encounter outcomes ('death:<id>'); each has a card in WORLD_TEXT.deathCards. */
export const ENCOUNTER_DEATHS = ['ceilingCrawl', 'radio', 'nameCall', 'breath', 'trunk', 'roadFigure', 'roofHanger', 'count444', 'windowArm', 'extraPassenger'];

/** Escalations an outcome may request ('escalate:<name>'); see RULE_BREAKS in rules.js. */
export const ENCOUNTER_ESCALATIONS = ['windowCreep', 'backSeatVoice'];
