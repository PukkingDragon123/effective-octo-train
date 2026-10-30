// RULES: Ah Kong's handwritten paper + the tunable parameters behind each rule.
//
// RULES[i] = {
//   id: 'r1'..'r16' (r11-r16 are on the BACK of the paper: side:'back', red ink, Somchai's hand),
//   th, en: the full line as written on the paper,
//   shortTH, shortEN: compact label (pencil notes, debug HUD, death card references),
//   mechanic: one-line designer note,
//   params: numbers the gameplay rule system reads (all seconds / degrees / km/h / metres),
//   optional: true for custom rules that never kill (r10),
//   side: 'back' for r11-r16, exception: {th,en} the learned exception (not written on the paper),
// }
// HIDDEN_LINE = { th, en, minLoop, revealWhen:['wet','cabinLight'] }.
// RULE_PARAMS = flat map of every tunable used by the rule system (single source of truth).
// PAPER = header / footer text of the paper prop.

export const RULE_PARAMS = {
  // r1: pick up everyone
  hailStopSpeedKmh: 8, // counts as "stopped for the passenger" below this speed...
  hailStopRadiusM: 10, // ...within this distance of the pickup's stopPos
  passByFoldMeters: 60, // driving this far beyond a hailing passenger folds the road back
  // r2: the fork
  forkDecisionLateralM: 1.2, // lateral offset at decisionS that commits the choice
  // r3: never look back
  lookBackYawDeg: 115, // camera yaw relative to the car beyond this = looking back
  rearSeatStareSeconds: 0.6, // OR holding the rear seat in direct view this long during a back-seat event
  rearSeatStareConeDeg: 20,
  // r4: no reflection -> no face gaze
  faceGazeSeconds: 1.2, // continuous direct look at the face before the attack
  faceGazeWarnSeconds: 0.6, // warning (whisper, cold breath, glass fogs) after this
  faceGazeConeDeg: 11,
  faceGazeDecayPerSec: 0.8, // timer drains this fast when you look away
  // r5: three knocks
  knockCount: 3,
  knockIntervalSeconds: [1.1, 1.8], // random gap between knocks
  knockStopSpeedKmh: 2,
  knockStopSeconds: 1.5, // under knockStopSpeedKmh this long after the 3rd knock = death
  knockDangerSeconds: 25, // how long after the 3rd knock the rule stays armed
  // r6: radio off when asked
  radioGraceSeconds: 8,
  radioEscalateSeconds: 6, // after the grace: static voice, then attack after this many more seconds
  // r7: voice calling your name
  nameCallChoiceTimeout: 6, // seconds the choice prompt stays up; silence is the default
  nameCallStopSpeedKmh: 3, // stopping + opening the window while the voice calls = death
  // r8: breath on the neck
  breathDurationSeconds: [5, 8],
  breathMustHoldAmulet: true,
  breathLookForwardConeDeg: 35, // eyes must stay within this cone of the windshield centre
  breathFailSeconds: 2.0, // not holding the amulet / looking away this long = attack
  // r9: cabin light dies
  cabinLightEventSeconds: [10, 16],
  cabinLightAttackDelay: 0.8, // switching it back on -> ceiling crawl after this delay
  // r10: honk twice at shrines
  honkWindowSeconds: 1.6, // two honks within this window
  honkShrineRadiusM: 35,
  respectPerHonk: 1,
  respectMax: 6,
  respectEncounterSoften: 0.12, // each respect point shortens soft encounters by 12 %
  // --- back side of the paper (red ink, Somchai's handwriting) ---------------------
  // r11: meter shows 444
  meter444StopWithinSeconds: 8, // must be under meter444StopSpeedKmh within this
  meter444StopSpeedKmh: 3,
  meter444CountSeconds: 10, // then keep eyes off every mirror and window for this long
  meter444LookDownPitchDeg: -22, // looking down at the dash/lap (pitch below this) is always safe
  // r12: someone standing in the road who does NOT hail
  roadFigureNoBrakeMinKmh: 15, // dropping below this within roadFigureDangerM = it reaches you
  roadFigureDangerM: 25,
  roadFigureMaxSwerveLateralM: 2.6, // swerving off the asphalt to avoid it also counts as failing
  // r13: blood on the windshield
  bloodWiperGraceSeconds: 3, // wipers must be OFF within this after the first drip
  bloodWipeFailSeconds: 3, // wiping blood this long = what's on the roof slides down
  // r14: no window down after midnight
  windowRuleFromHour: 24,
  windowOpenFailAmount: 0.3, // rolled down more than 30 % while something is at the window
  // r15: the radio says your name
  radioNameTuneSeconds: 5, // change station within this; switching OFF instead escalates to a back-seat voice
  // r16: one more in the mirror than got in
  extraPassengerSeconds: [12, 20], // how long the extra reflection stays
  extraPassengerStopSpeedKmh: 3,
  // replies (see RULE_BREAKS and SCHEMA.md "Replies")
  lureSeconds: 2.5, // flags.lure = 'r3'|'r4': the camera drifts toward the forbidden look this long
  lureYawDegPerSec: 22, // drift speed; any deliberate look input cancels it
  windowCreepPerSec: 0.08, // r14 invite: the window winds itself down this fast...
  windowCreepCrankSeconds: 3, // ...until the player cranks it up again within this
};

export const RULES = [
  {
    id: 'r1',
    th: 'รับผู้โดยสารทุกคนที่โบกเรียก ไม่ว่าจะเป็นคนหรือไม่ใช่คน',
    en: 'Pick up everyone who hails you, human or not.',
    shortTH: 'รับทุกคนที่โบก',
    shortEN: 'Pick up everyone',
    mechanic: 'Driving past a hailing passenger folds the road: it brings you back to them.',
    params: { stopSpeedKmh: RULE_PARAMS.hailStopSpeedKmh, stopRadiusM: RULE_PARAMS.hailStopRadiusM, foldAfterM: RULE_PARAMS.passByFoldMeters },
  },
  {
    id: 'r2',
    th: 'ทุกเส้นทางไปจบที่ศาลเจ้ามารวย ซ้ายสำหรับคนตาย ขวาสำหรับคนเป็น',
    en: 'Every road ends at Ma Ruay Shrine. Left for the dead, right for the living.',
    shortTH: 'ซ้ายคนตาย ขวาคนเป็น',
    shortEN: 'Left: dead. Right: living.',
    mechanic: 'The core decision at the fork.',
    params: { decisionLateralM: RULE_PARAMS.forkDecisionLateralM },
  },
  {
    id: 'r3',
    th: 'ไม่ว่าจะได้ยินอะไรจากเบาะหลัง อย่าหันไปมองเด็ดขาด',
    en: 'Whatever you hear from the back seat, never turn around to look.',
    shortTH: 'ห้ามหันไปมองเบาะหลัง',
    shortEN: 'Never look back',
    mechanic: 'Yaw past ~115° toward the rear, or staring at the rear seat >0.6 s during a back-seat event. Mirrors are fine.',
    params: { yawDeg: RULE_PARAMS.lookBackYawDeg, stareSeconds: RULE_PARAMS.rearSeatStareSeconds, stareConeDeg: RULE_PARAMS.rearSeatStareConeDeg },
  },
  {
    id: 'r4',
    th: 'ถ้าผู้โดยสารไม่มีเงาในกระจก ห้ามมองหน้าเขาตรง ๆ',
    en: 'If a passenger has no reflection in the mirror, never look at their face directly.',
    shortTH: 'ไม่มีเงาในกระจก ห้ามมองหน้า',
    shortEN: 'No reflection? Don\'t look at the face',
    mechanic: 'Face-gaze timer (~1.2 s): warning first (whisper, cold), then the true form attacks.',
    params: { gazeSeconds: RULE_PARAMS.faceGazeSeconds, warnSeconds: RULE_PARAMS.faceGazeWarnSeconds, coneDeg: RULE_PARAMS.faceGazeConeDeg, decayPerSec: RULE_PARAMS.faceGazeDecayPerSec },
  },
  {
    id: 'r5',
    th: 'ถ้าได้ยินเสียงเคาะท้ายรถสามครั้ง ห้ามจอดเด็ดขาด',
    en: 'If you hear three knocks from the trunk, do not stop.',
    shortTH: 'เคาะสามที ห้ามจอด',
    shortEN: 'Three knocks: don\'t stop',
    mechanic: 'After the 3rd knock, under 2 km/h for 1.5 s = death.',
    params: { knocks: RULE_PARAMS.knockCount, stopSpeedKmh: RULE_PARAMS.knockStopSpeedKmh, stopSeconds: RULE_PARAMS.knockStopSeconds, armedSeconds: RULE_PARAMS.knockDangerSeconds },
  },
  {
    id: 'r6',
    th: 'ถ้าผู้โดยสารขอให้ปิดวิทยุ ให้ปิดทันที',
    en: 'If a passenger asks you to turn off the radio, turn it off at once.',
    shortTH: 'ขอให้ปิดวิทยุ ต้องปิดทันที',
    shortEN: 'Asked to kill the radio? Do it',
    mechanic: '8 s grace, then escalation (static voice, then attack).',
    params: { graceSeconds: RULE_PARAMS.radioGraceSeconds, escalateSeconds: RULE_PARAMS.radioEscalateSeconds },
  },
  {
    id: 'r7',
    th: 'ถ้ามีเสียงเรียกชื่อจากข้างนอก อย่าขานรับ',
    en: 'If a voice outside calls your name, do not answer.',
    shortTH: 'เสียงเรียกชื่อ อย่าขาน',
    shortEN: 'Voice calls your name: stay silent',
    mechanic: 'Choice prompt ("ครับ?" / stay silent). Answering, or stopping and opening the window = death.',
    params: { choiceTimeout: RULE_PARAMS.nameCallChoiceTimeout, stopSpeedKmh: RULE_PARAMS.nameCallStopSpeedKmh },
  },
  {
    id: 'r8',
    th: 'ถ้ามีลมหายใจรดต้นคอ ให้กำพระไว้ แล้วมองตรงไปข้างหน้า',
    en: 'If breath touches your neck, hold the amulet and keep your eyes forward.',
    shortTH: 'ลมหายใจรดคอ กำพระ มองหน้า',
    shortEN: 'Breath on the neck: amulet, eyes front',
    mechanic: 'Hold amulet + look forward until it passes.',
    params: { durationSeconds: RULE_PARAMS.breathDurationSeconds, coneDeg: RULE_PARAMS.breathLookForwardConeDeg, failSeconds: RULE_PARAMS.breathFailSeconds },
  },
  {
    id: 'r9',
    th: 'ถ้าไฟในรถดับเอง อย่าเปิดมันอีก',
    en: "If the cabin light goes out by itself, don't switch it back on.",
    shortTH: 'ไฟในรถดับเอง ห้ามเปิด',
    shortEN: 'Light dies on its own: leave it',
    mechanic: 'Turning it back on during the event triggers a ceiling-crawl attack.',
    params: { eventSeconds: RULE_PARAMS.cabinLightEventSeconds, attackDelay: RULE_PARAMS.cabinLightAttackDelay },
  },
  {
    id: 'r10',
    th: 'ผ่านศาลให้บีบแตรสองครั้ง ขอทางเจ้าที่',
    en: 'Honk twice when you pass a shrine, to ask the spirits for passage.',
    shortTH: 'ผ่านศาล บีบแตรสองที',
    shortEN: 'Honk twice at shrines',
    mechanic: 'Optional custom. Each honk earns respect, which shortens / softens some encounters.',
    optional: true,
    params: { windowSeconds: RULE_PARAMS.honkWindowSeconds, radiusM: RULE_PARAMS.honkShrineRadiusM, respectPerHonk: RULE_PARAMS.respectPerHonk, respectMax: RULE_PARAMS.respectMax },
  },
  // ---------------------------------------------------------------------------------
  // BACK OF THE PAPER: rules 11-16, in smudged RED ink and a DIFFERENT, shakier hand.
  // Ah Kong: "ด้านหลังด้วยนะ อย่าลืมพลิกดู" (Turn it over too). It is Somchai's
  // handwriting, left for whoever drives next (revealed late in the night).
  // ---------------------------------------------------------------------------------
  {
    id: 'r11',
    side: 'back',
    th: 'ถ้ามิเตอร์ขึ้นเลข ๔๔๔ ให้จอดทันที ก้มหน้า แล้วนับในใจถึงสิบ ห้ามมองกระจกบานไหนทั้งนั้น',
    en: 'If the meter shows 444, stop at once, bow your head and count to ten. Do not look at any glass.',
    shortTH: 'มิเตอร์ ๔๔๔ จอด ก้มหน้า นับสิบ',
    shortEN: 'Meter 444: stop, head down, count ten',
    mechanic: 'Meter glitches to 444.00. Stop within 8 s, then for 10 s keep the gaze off every mirror and window (looking down is safe). Something counts along with you outside.',
    params: { stopWithin: RULE_PARAMS.meter444StopWithinSeconds, stopSpeedKmh: RULE_PARAMS.meter444StopSpeedKmh, countSeconds: RULE_PARAMS.meter444CountSeconds, lookDownPitchDeg: RULE_PARAMS.meter444LookDownPitchDeg },
    exception: { th: 'มีพระอยู่ในรถ เลขนี้ไม่มีความหมาย', en: 'With a monk aboard, the number means nothing.' },
  },
  {
    id: 'r12',
    side: 'back',
    th: 'ถ้ามีคนยืนกลางถนนแต่ไม่โบกรถ ห้ามเบรก ห้ามหักหลบ ขับทะลุไปเลย',
    en: "If someone stands in the road but doesn't hail you, don't brake, don't swerve. Drive straight through.",
    shortTH: 'ยืนกลางถนนไม่โบก ขับทะลุ',
    shortEN: 'Standing, not hailing: drive through',
    mechanic: 'A figure in the lane. Slowing under 15 km/h within 25 m, or swerving off the asphalt, lets it reach you. Driving through = cold flash, glass fogs, it now stands behind you in the mirror.',
    params: { minKmh: RULE_PARAMS.roadFigureNoBrakeMinKmh, dangerM: RULE_PARAMS.roadFigureDangerM, maxSwerveM: RULE_PARAMS.roadFigureMaxSwerveLateralM },
    exception: { th: 'ถ้าเป็นสัตว์ ให้หยุดรอ', en: 'If it is an animal, stop and wait.' },
  },
  {
    id: 'r13',
    side: 'back',
    th: 'ถ้ามีเลือดหยดลงกระจกหน้า ห้ามปัดน้ำฝน ปล่อยให้มันไหลไป',
    en: 'If blood drips onto the windshield, do not use the wipers. Let it run.',
    shortTH: 'เลือดหยดกระจก ห้ามปัด',
    shortEN: 'Blood on the glass: no wipers',
    mechanic: 'Blood drips from the roof edge. Wipers must be OFF within 3 s; wiping smears it and shows what hangs above, and 3 s of wiping = it slides down onto the glass.',
    params: { graceSeconds: RULE_PARAMS.bloodWiperGraceSeconds, failSeconds: RULE_PARAMS.bloodWipeFailSeconds },
    exception: { th: 'ถ้าเป็นน้ำหมาก ก็แค่น้ำหมาก', en: 'If it is betel juice, it is only betel juice.' },
  },
  {
    id: 'r14',
    side: 'back',
    th: 'หลังเที่ยงคืน ห้ามลดกระจกให้ใครทั้งนั้น',
    en: 'After midnight, never roll your window down for anyone.',
    shortTH: 'หลังเที่ยงคืน ห้ามลดกระจก',
    shortEN: 'After midnight: windows stay up',
    mechanic: 'Something knocks and asks for help or a light. Opening a window past 30 % while it waits = an arm reaches in.',
    params: { fromHour: RULE_PARAMS.windowRuleFromHour, failAmount: RULE_PARAMS.windowOpenFailAmount },
    exception: { th: 'พระขอ ให้ลด', en: 'If a monk asks, roll it down.' },
  },
  {
    id: 'r15',
    side: 'back',
    th: 'ถ้าวิทยุเรียกชื่อแก ให้เปลี่ยนคลื่นทันที ห้ามปิด',
    en: 'If the radio says your name, change the station at once. Do not switch it off.',
    shortTH: 'วิทยุเรียกชื่อ เปลี่ยนคลื่น ห้ามปิด',
    shortEN: 'Radio says your name: retune, never off',
    mechanic: 'The DJ voice says "ต้น…". Retune within 5 s. Switching off instead = the same voice continues from the back seat (a rule-3 test).',
    params: { tuneSeconds: RULE_PARAMS.radioNameTuneSeconds },
    exception: { th: 'ถ้าเป็นเพลงที่พ่อขอ ฟังให้จบ', en: 'If it is a song your father requested, listen to the end.' },
  },
  {
    id: 'r16',
    side: 'back',
    th: 'ถ้านับคนในกระจกได้มากกว่าคนที่ขึ้นรถ อย่าทัก อย่าถาม อย่าจอด',
    en: 'If you count more people in the mirror than got in, say nothing, ask nothing, do not stop.',
    shortTH: 'ในกระจกเกินมาหนึ่ง อย่าทัก',
    shortEN: 'One too many in the mirror: say nothing',
    mechanic: 'An extra figure sits beside the passenger in the rearview mirror only. A dialogue choice tempts you to ask "who is that?"; asking or stopping = it answers.',
    params: { durationSeconds: RULE_PARAMS.extraPassengerSeconds, stopSpeedKmh: RULE_PARAMS.extraPassengerStopSpeedKmh },
  },
];

/**
 * What happens when a REPLY breaks a rule (flags.ruleBreak = rule id, set by a dialogue option).
 * Gameplay listens to bus 'dialogue:line' (line.set.ruleBreak), lets the rest of that branch play
 * (it is the thing's answer), then applies the entry and clears flags.ruleBreak:
 *   outcome   the ENCOUNTERS[...].outcomes key to play when the rule's encounter is running
 *   death     DEATH_CARDS key (death cinematic) — or, with `escalate`, the death if the escalation fails
 *   escalate  a rule escalation instead of instant death:
 *             'windowCreep'    the window winds itself down (RULE_PARAMS.windowCreep*); crank it up or die
 *             'backSeatVoice'  the radio voice moves to the back seat and calls "ต้น… หันมาสิ" (a rule-3 test)
 */
export const RULE_BREAKS = {
  r7: { outcome: 'answer', death: 'nameCall' },
  r11: { outcome: 'answer', death: 'count444' },
  r14: { outcome: 'invite', escalate: 'windowCreep', death: 'windowArm' },
  r15: { outcome: 'answer', escalate: 'backSeatVoice', death: 'lookBack' },
  r16: { outcome: 'asked', death: 'extraPassenger' },
};

/** Only legible when the paper is wet (rain) or held near the cabin light, from loop 2 on. */
export const HIDDEN_LINE = {
  th: 'กฎทุกข้อมีข้อยกเว้น ยกเว้นข้อสาม',
  en: 'Every rule has an exception, except rule three.',
  minLoop: 1, // saves.data.loops >= 1 (i.e. from the 2nd night)
  revealWhen: ['wet', 'cabinLight'],
};

/** Text on the paper prop around the rules. */
export const PAPER = {
  title: { th: 'กฎสำหรับคนขับกะดึก', en: 'Rules for the Night-Shift Driver' },
  subtitle: { th: '(อ่านให้จำ อย่าทำหาย)', en: '(Learn them. Don\'t lose this.)' },
  footer: { th: 'ขับดี ๆ นะ ไอ้หนุ่ม  — อากง', en: 'Drive carefully, young man.  — Ah Kong' },
  // the old man's hand-drawn sketch at the bottom: a fork with arrows
  forkSketch: { left: { th: 'ตาย', en: 'dead' }, right: { th: 'เป็น', en: 'living' } },
  // back side: red ink, a different (Somchai's) hand
  back: {
    title: { th: 'ที่อากงไม่ได้เขียน', en: "What Ah Kong didn't write" },
    footer: { th: 'ใครขับต่อจากฉัน… ขอให้ได้กลับบ้าน — ส.', en: 'Whoever drives after me… I hope you get home.  — S.' },
    ink: 'red',
    hand: 'somchai',
  },
  // Ending 'successor': a new line appears on the back, under Somchai's red ink, in Ah Kong's hand.
  successorNote: { th: 'กะนี้เป็นของลื้อแล้ว', en: 'This shift is yours now.' },
};

/**
 * Pencil annotations the PLAYER adds to the paper as they learn (persist across loops).
 * Keyed by an id the gameplay layer unlocks (rule id or 'p:<passengerId>').
 * Written in Ton's own terse hand.
 */
export const PENCIL_NOTES = {
  r1: { th: 'ขับผ่าน = ถนนพับกลับมาที่เดิม', en: 'drove past = road folds back' },
  r3: { th: 'ใช้กระจกได้ หันไม่ได้', en: 'mirrors OK. turning NOT' },
  r4: { th: 'ดูกระจกก่อนทุกครั้ง', en: 'check the mirror first. always' },
  r5: { th: 'เหยียบไว้ ห้ามแตะเบรก', en: 'keep your foot down. no brakes' },
  r6: { th: 'เด็กขอ...ปิดเลย', en: 'the kid asked... just turn it off' },
  r7: { th: 'เสียงเหมือนแม่ แต่ไม่ใช่แม่', en: "sounds like Mum. it isn't." },
  r8: { th: 'กำพระแน่น ๆ หายใจช้า ๆ', en: 'grip the amulet. breathe slow' },
  r9: { th: 'มืดก็ปล่อยให้มืด', en: 'if it goes dark, let it' },
  r10: { th: 'ปี๊น ปี๊น — เจ้าที่ใจดีขึ้น', en: 'beep beep. the spirits ease off' },
  r11: { th: 'ก้มหน้า นับช้า ๆ มีอะไรนับตามด้วย', en: 'head down. count slow. something counts with me' },
  r12: { th: 'อย่าเบรก ทะลุไปเลย มันเย็นมาก', en: "don't brake. go through. it's so cold" },
  r13: { th: 'ที่ปัด OFF! บนหลังคามีอะไรห้อยอยู่', en: 'wipers OFF! something hangs off the roof' },
  r14: { th: 'มันขอไฟแช็ก อย่าลดกระจก', en: "it asked for a lighter. window stays UP" },
  r15: { th: 'เปลี่ยนคลื่น อย่าปิด!', en: 'retune. never OFF!' },
  r16: { th: 'ในกระจกมีเด็กอีกคน... ไม่ถาม', en: "another kid in the mirror... didn't ask" },
  back: { th: 'ลายมือด้านหลัง... ลายมือพ่อ', en: "the handwriting on the back... it's Dad's" },
  hidden: { th: 'ข้อสาม... ไม่มีข้อยกเว้น', en: 'rule 3... no exceptions' },
  'p:sri': { th: 'ป้าศรี = คน (หายใจขึ้นกระจก)', en: 'Auntie Sri = human (breath on glass)' },
  'p:womanWhite': { th: 'ชุดขาว = ไม่มีเงา ห้ามมอง!', en: 'white dress = no reflection. DON\'T LOOK' },
  'p:piak': { th: 'ลุงขี้เมา = คน แค่น่ากลัว', en: 'drunk uncle = human. just scary' },
  'p:boyM': { th: 'เด็กนักเรียน = มีแต่ในกระจก', en: 'schoolboy = ONLY in the mirror' },
  'p:nuan': { th: 'ชุดเขียว = เท้าไม่แตะพื้น', en: 'green sabai = feet don\'t touch the floor' },
  'p:monk': { th: 'หลวงพี่ = คน ขอเปิดวิทยุได้', en: 'monk = human. radio ON is fine' },
  'p:saman': { th: 'ลุงนักร้อง = ผีใจดี ควันทะลุกระจก', en: 'singer = kind ghost. smoke through glass' },
  'p:bua': { th: 'ยายบัว = คน รู้จักพ่อ', en: 'Grandma Bua = human. knew Dad' },
  'p:somchai': { th: 'พ่อ... ซ้าย แล้วอย่าหัน', en: 'Dad... left. and don\'t turn around' },
};

export const RULE_IDS = RULES.map((r) => r.id);
export const getRule = (id) => RULES.find((r) => r.id === id) || null;
