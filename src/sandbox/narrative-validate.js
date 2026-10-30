// Schema validator for src/game/data (narrative). Pure JS, no DOM: used by the
// narrative sandbox and runnable from Node:
//   node -e "import('./src/sandbox/narrative-validate.js').then(m=>m.runNode())"
// validateNarrative({ data, layout, keyBindings? }) -> { errors:[], warnings:[], stats:{} }

const TONES = ['normal', 'whisper', 'ghost', 'shout', 'thought', 'sing'];
const EMOTIONS = ['smile', 'sad', 'fear', 'anger', 'creepy', 'surprise'];
const ACTIONS = ['hail', 'wave', 'wai', 'smoke', 'giveItem', 'takeItem', 'sitDown', 'standUp', 'enterCar', 'exitCar', 'nod', 'shakeHead', 'laugh', 'cry', 'point', 'pray', 'shiver', 'neckSnap', 'crawlOverSeat', 'emergeFromBelow', 'pressFaceToGlass', 'ceilingCrawl', 'sprint', 'stagger', 'sing', 'knock', 'reachOut', 'lookAround', 'sleep', 'pay'];
const SEATS = ['rearLeft', 'rearRight', 'frontPassenger'];
const REFLECTION = ['normal', 'none', 'only', 'twisted', 'delayed'];
const METER = ['normal', 'glitch', 'backward', 'oldDate'];
const PAYMENT = ['coins', 'banknote', 'old_banknote', 'ghost_money', 'leaves', 'none'];
const GAZE = ['notLooking', 'mirrorOnly', 'sideWindow', 'any'];
const ENC_KINDS = ['scare', 'folklore', 'rule', 'beautiful', 'story'];
const OUTFITS = ['tshirt-pants', 'shirt-slacks', 'dress', 'school-uniform', 'monk-robe', 'sabai', 'taxi-uniform', 'market-vendor', 'tank-sarong', 'hoodie-jeans', 'old-woman-sarong', 'farmer', 'shroud'];
const HAIR = ['short', 'long', 'bob', 'bun', 'bald', 'shaved', 'gray-short', 'ponytail', 'messy'];
const ACCESSORIES = ['glasses', 'cap', 'headscarf', 'garland', 'shoulder-bag', 'basket', 'amulet-necklace', 'helmet', 'cigarette', 'lunchbox', 'umbrella'];
const GHOST_EYES = ['normal', 'black', 'white', 'glow'];
const WAIT_TYPES = ['interact', 'enterVehicle', 'control', 'drive', 'speedKmh', 'stop', 'steer', 'look', 'hold', 'paper'];
const GAZE_TARGETS = ['windshield', 'rear', 'fl', 'fr', 'rl', 'rr', 'mirror_rear', 'mirror_left', 'mirror_right', 'interior'];
const DIALOGUE_KEYS = ['hail', 'greet', 'destination', 'beats', 'arriveCorrect', 'arriveWrong', 'idle', 'onLookBack', 'onFaceGaze'];
const THAI = /[฀-๿]/;
const KEY_LABEL = (k) => (/^[A-Z]$/.test(k) ? 'Key' + k : /^[0-9]$/.test(k) ? 'Digit' + k : k);

export function validateNarrative({ data, layout, keyBindings = null }) {
  const errors = [];
  const warnings = [];
  const stats = { lines: 0, thaiChars: 0, longest: null, perPassenger: {} };
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`);
  const {
    CHARACTERS, RULES, HIDDEN_LINE, RULE_PARAMS, PENCIL_NOTES, PASSENGERS, DIALOGUE_EVENTS, WRONG_FORK_DEATHS, ENCOUNTERS, ENCOUNTER_DEATHS,
    MEMORIES, ENDINGS, STATIONS, SONGS, FATHER_SONG, DJ_LINES, LATE_NIGHT_WHISPERS, SPECIAL_BROADCASTS, CHAPTERS, DEATH_CARDS, LOADING_LINES,
    SIGNS, POSTERS, NOODLE_MENU, CREDITS, CREDITS_HEADLINE, INTRO_GARAGE, TUTORIAL_STEPS, SEND_OFF, GARAGE_IDLE, RESTART_LINES, DEATH_HINTS,
    TIME_SKIP, RADIO_CAMEO, SHRINE_REVEAL,
  } = data;

  const landmarks = layout.landmarks;
  const ruleIds = new Set(RULES.map((r) => r.id));
  const passengerIds = new Set(PASSENGERS.map((p) => p.id));
  const encIds = new Set(Object.keys(ENCOUNTERS));
  const memIds = new Set(MEMORIES.map((m) => m.id));
  const speakers = new Set(['passenger', 'player', ...Object.keys(CHARACTERS)]);

  const isStr = (s) => typeof s === 'string' && s.trim().length > 0;
  const checkHours = (path, h) => {
    const ranges = Array.isArray(h) && Array.isArray(h[0]) ? h : [h];
    for (const r of ranges) {
      if (!Array.isArray(r) || r.length !== 2 || !(r[0] >= 21 && r[1] <= 30 && r[0] < r[1])) err(path, `bad hours ${JSON.stringify(h)}`);
    }
  };
  const inHours = (h, hour) => {
    const ranges = Array.isArray(h[0]) ? h : [h];
    return ranges.some((r) => hour >= r[0] && hour < r[1]);
  };

  // ---------------------------------------------------------------- lines
  function checkText(path, o, { thaiRequired = true } = {}) {
    if (!isStr(o.th)) err(path, 'missing th');
    if (!isStr(o.en)) err(path, 'missing en');
    if (isStr(o.th) && thaiRequired && !THAI.test(o.th) && !/^[♪.…\s—-]*$/.test(o.th)) warn(path, `th has no Thai: "${o.th}"`);
    if (isStr(o.en) && THAI.test(o.en)) err(path, `en contains Thai: "${o.en}"`);
  }
  function checkLine(path, l, ctx = {}) {
    if (!l || typeof l !== 'object') return err(path, 'line is not an object');
    if (!speakers.has(l.who)) err(path, `unknown who "${l.who}"`);
    checkText(path, l, { thaiRequired: !/Namo|Iti pi|Yatha/.test(l.en || '') });
    if (l.tone && !TONES.includes(l.tone)) err(path, `bad tone ${l.tone}`);
    if (l.emotion && !EMOTIONS.includes(l.emotion)) err(path, `bad emotion ${l.emotion}`);
    if (l.action && !ACTIONS.includes(l.action)) err(path, `bad action ${l.action}`);
    if (l.pause != null && !(typeof l.pause === 'number' && l.pause >= 0 && l.pause < 10)) err(path, 'bad pause');
    if (l.set && typeof l.set !== 'object') err(path, 'set must be an object');
    stats.lines++;
    if (isStr(l.th)) {
      stats.thaiChars += l.th.length;
      const len = [...l.th.replace(/[♪\s.…]/g, '')].length;
      if (len > 56 && !l.choice) warn(path, `long Thai line (${len} chars): "${l.th}"`);
      if (!stats.longest || len > stats.longest.len) stats.longest = { len, th: l.th, path };
    }
    if (ctx.count) ctx.count.n++;
    if (l.choice) {
      const c = l.choice;
      if (!Array.isArray(c.options) || c.options.length < 2) err(path, 'choice needs >= 2 options');
      const keys = new Set();
      for (const [i, o] of (c.options || []).entries()) {
        if (!isStr(o.key)) err(`${path}.choice[${i}]`, 'missing key');
        if (keys.has(o.key)) err(`${path}.choice[${i}]`, `duplicate key ${o.key}`);
        keys.add(o.key);
        checkText(`${path}.choice[${i}]`, o);
      }
      if (c.defaultKey != null && !keys.has(c.defaultKey)) err(path, `defaultKey ${c.defaultKey} not an option`);
      if (c.timeout != null && !(c.timeout > 0)) err(path, 'bad choice timeout');
      for (const [k, ls] of Object.entries(l.branches || {})) {
        if (!keys.has(k)) err(path, `branch for unknown key ${k}`);
        checkLines(`${path}.branches.${k}`, ls, ctx);
      }
      for (const k of Object.keys(l.setOnPick || {})) if (!keys.has(k)) err(path, `setOnPick unknown key ${k}`);
    }
  }
  function checkLines(path, arr, ctx = {}) {
    if (!Array.isArray(arr)) return err(path, 'expected an array of lines');
    arr.forEach((l, i) => checkLine(`${path}[${i}]`, l, ctx));
  }
  function checkTrigger(path, t, beatIds) {
    if (!t || typeof t !== 'object') return err(path, 'missing trigger');
    if (t.type === 'progress') {
      if (!(t.at >= 0 && t.at <= 1)) err(path, `progress at ${t.at} not in 0..1`);
    } else if (t.type === 'time') {
      if (!(t.seconds > 0)) err(path, 'time trigger needs seconds > 0');
    } else if (t.type === 'after') {
      if (!beatIds.has(t.beat)) err(path, `after: unknown beat ${t.beat}`);
      if (!(t.seconds >= 0)) err(path, 'after: needs seconds');
    } else if (t.type === 'event') {
      const m = /^(encounter|encounterEnd):(.+)$/.exec(t.event || '');
      if (m) {
        if (!encIds.has(m[2])) err(path, `event references unknown encounter ${m[2]}`);
      } else if (!DIALOGUE_EVENTS.includes(t.event)) err(path, `unknown event "${t.event}"`);
    } else err(path, `unknown trigger type ${t.type}`);
  }
  function checkEffects(path, effects) {
    for (const [i, e] of (effects || []).entries()) {
      if (e.type === 'rule' && !ruleIds.has(e.id)) err(`${path}.effects[${i}]`, `unknown rule ${e.id}`);
      if (!['rule', 'taxi', 'item', 'encounter', 'sfx', 'flag'].includes(e.type)) err(`${path}.effects[${i}]`, `unknown effect type ${e.type}`);
    }
  }

  // ---------------------------------------------------------------- characters
  for (const [key, c] of Object.entries(CHARACTERS)) {
    const p = `CHARACTERS.${key}`;
    if (c.id !== key) err(p, 'id must equal key');
    if (!isStr(c.nameTH) || !isStr(c.nameEN)) err(p, 'missing nameTH/nameEN');
    const v = c.voice || {};
    if (!['m', 'f'].includes(v.gender)) err(p, 'voice.gender');
    if (!(v.pitch >= 0.5 && v.pitch <= 1.5)) err(p, 'voice.pitch out of 0.5..1.5');
    if (!(v.rate >= 0.6 && v.rate <= 1.4)) err(p, 'voice.rate out of 0.6..1.4');
    if (!(v.ghost >= 0 && v.ghost <= 1)) err(p, 'voice.ghost out of 0..1');
    if (typeof v.whisper !== 'boolean') err(p, 'voice.whisper must be boolean');
    const a = c.appearance;
    if (a) {
      if (!['m', 'f'].includes(a.sex)) err(p, 'appearance.sex');
      if (!(a.age >= 6 && a.age <= 90)) err(p, 'appearance.age');
      if (!['thin', 'average', 'heavy'].includes(a.build)) err(p, 'appearance.build');
      if (!(a.skinTone >= 0 && a.skinTone <= 1)) err(p, 'appearance.skinTone');
      if (!HAIR.includes(a.hair?.style)) err(p, `hair.style ${a.hair?.style}`);
      if (!OUTFITS.includes(a.outfit?.type)) err(p, `outfit.type ${a.outfit?.type}`);
      if (!['sandals', 'shoes', 'barefoot'].includes(a.outfit?.shoes)) err(p, 'outfit.shoes');
      for (const acc of a.accessories || []) if (!ACCESSORIES.includes(acc)) err(p, `accessory ${acc}`);
      if (a.ghost && !GHOST_EYES.includes(a.ghost.eyes)) err(p, 'ghost.eyes');
    }
  }

  // ---------------------------------------------------------------- rules
  if (RULES.length !== 10) err('RULES', `expected 10 rules, got ${RULES.length}`);
  RULES.forEach((r, i) => {
    if (r.id !== `r${i + 1}`) err(`RULES[${i}]`, `id should be r${i + 1}`);
    checkText(`RULES.${r.id}`, r);
    if (!isStr(r.shortTH) || !isStr(r.shortEN)) err(`RULES.${r.id}`, 'missing short labels');
  });
  checkText('HIDDEN_LINE', HIDDEN_LINE);
  for (const k of ['lookBackYawDeg', 'faceGazeSeconds', 'knockStopSpeedKmh', 'radioGraceSeconds']) if (typeof RULE_PARAMS[k] !== 'number') err('RULE_PARAMS', `missing ${k}`);
  for (const [k, n] of Object.entries(PENCIL_NOTES)) {
    if (!(ruleIds.has(k) || k === 'hidden' || (k.startsWith('p:') && passengerIds.has(k.slice(2))))) err(`PENCIL_NOTES.${k}`, 'unknown key');
    checkText(`PENCIL_NOTES.${k}`, n);
  }

  // ---------------------------------------------------------------- passengers
  if (PASSENGERS.length !== 9) err('PASSENGERS', 'expected 9 rides');
  const seenP = new Set();
  PASSENGERS.forEach((p, i) => {
    const path = `PASSENGERS.${p.id}`;
    if (seenP.has(p.id)) err(path, 'duplicate id');
    seenP.add(p.id);
    if (p.order !== i + 1) err(path, `order ${p.order} != ${i + 1}`);
    if (p.hour !== 20 + p.order) err(path, `hour ${p.hour} should be ${20 + p.order}`);
    if (!landmarks[p.pickup]) err(path, `pickup ${p.pickup} not in LAYOUT.landmarks`);
    if (layout.pickups[i] !== p.pickup) err(path, `pickup ${p.pickup} != LAYOUT.pickups[${i}] (${layout.pickups[i]})`);
    if (!CHARACTERS[p.characterId]) err(path, `unknown characterId ${p.characterId}`);
    if (!['human', 'ghost'].includes(p.identity)) err(path, 'identity');
    if ((p.identity === 'ghost') !== (p.fork === 'left')) err(path, `fork ${p.fork} contradicts identity ${p.identity}`);
    if (!SEATS.includes(p.seat)) err(path, `seat ${p.seat}`);
    checkText(`${path}.destination`, p.destination || {});
    const c = p.clues || {};
    if (!REFLECTION.includes(c.reflection)) err(path, `clues.reflection ${c.reflection}`);
    if (!METER.includes(c.meter)) err(path, `clues.meter ${c.meter}`);
    if (!(c.radioStatic >= 0 && c.radioStatic <= 1)) err(path, 'clues.radioStatic');
    for (const b of ['shadow', 'breathFog', 'blinks', 'feetFloat']) if (typeof c[b] !== 'boolean') err(path, `clues.${b} must be boolean`);
    if (!(c.weightKg >= 0)) err(path, 'clues.weightKg');
    if (!PAYMENT.includes(c.payment?.type)) err(path, `payment.type ${c.payment?.type}`);
    if (typeof c.payment?.amountTHB !== 'number') err(path, 'payment.amountTHB');
    if (c.payment?.note) checkText(`${path}.payment.note`, c.payment.note);
    const ghostSigns = [c.reflection !== 'normal', !c.shadow, !c.breathFog, c.weightKg === 0, c.meter !== 'normal', c.radioStatic > 0, !c.blinks, c.feetFloat, !['coins', 'banknote'].includes(c.payment?.type)].filter(Boolean).length;
    if (p.identity === 'ghost' && ghostSigns < 3) err(path, `ghost shows only ${ghostSigns} ghost clues (need 3+)`);
    if (p.identity === 'human' && (c.reflection !== 'normal' || !c.shadow || !c.breathFog || c.weightKg === 0 || c.meter !== 'normal')) err(path, 'human with ghost clues');
    for (const r of p.specialRules || []) if (!ruleIds.has(r.rule)) err(path, `specialRules unknown rule ${r.rule}`);
    for (const e of p.encounters || []) {
      if (!encIds.has(e.id)) {
        err(path, `unknown encounter ${e.id}`);
        continue;
      }
      if (!(e.at >= 0 && e.at <= 1)) err(path, `encounter ${e.id} at ${e.at}`);
      const enc = ENCOUNTERS[e.id];
      const where = [].concat(enc.where);
      const ok = where.some((w) => w === `ride:${p.id}` || w === 'any' || (w === 'ride:anyGhost' && p.identity === 'ghost'));
      if (!ok) warn(path, `encounter ${e.id} where=${JSON.stringify(enc.where)} does not list ride:${p.id}`);
      if (!inHours(enc.hours, p.hour)) warn(path, `encounter ${e.id} hours ${JSON.stringify(enc.hours)} exclude ride hour ${p.hour}`);
    }
    if (!WRONG_FORK_DEATHS.includes(p.deathOnWrong)) err(path, `deathOnWrong ${p.deathOnWrong}`);
    for (const m of p.memoryHooks || []) if (!memIds.has(m)) err(path, `unknown memory ${m}`);
    const d = p.dialogue || {};
    for (const k of DIALOGUE_KEYS) if (!Array.isArray(d[k])) err(path, `dialogue.${k} missing`);
    const count = { n: 0 };
    for (const k of DIALOGUE_KEYS) if (k !== 'beats' && Array.isArray(d[k])) checkLines(`${path}.dialogue.${k}`, d[k], { count });
    if (d.onFaceGazeWarn) checkLines(`${path}.dialogue.onFaceGazeWarn`, d.onFaceGazeWarn, { count });
    const beatIds = new Set();
    for (const b of d.beats || []) {
      if (!isStr(b.id)) err(path, 'beat without id');
      if (beatIds.has(b.id)) err(path, `duplicate beat ${b.id}`);
      beatIds.add(b.id);
    }
    for (const b of d.beats || []) {
      const bp = `${path}.beats.${b.id}`;
      checkTrigger(bp, b.trigger, beatIds);
      checkLines(`${bp}.lines`, b.lines, { count });
      if (!b.lines?.length) err(bp, 'beat has no lines');
      checkEffects(bp, b.effects);
    }
    if (p.finale) for (const [k, v] of Object.entries(p.finale)) Array.isArray(v) ? checkLines(`${path}.finale.${k}`, v, { count }) : checkLine(`${path}.finale.${k}`, v, { count });
    stats.perPassenger[p.id] = { lines: count.n, beats: d.beats?.length || 0 };
    if (count.n < 15 || count.n > 60) warn(path, `${count.n} lines (target 15–30 core + reactions)`);
    // `who` must not reference another passenger's character
    const playerLines = JSON.stringify(d).split('"who":"player"').length - 1;
    if (playerLines > 12) warn(path, `Ton speaks/thinks ${playerLines} times (he is laconic)`);
  });

  // ---------------------------------------------------------------- encounters
  for (const [key, e] of Object.entries(ENCOUNTERS)) {
    const p = `ENCOUNTERS.${key}`;
    if (e.id !== key) err(p, 'id must equal key');
    if (!isStr(e.nameTH) || !isStr(e.nameEN)) err(p, 'names');
    if (!ENC_KINDS.includes(e.kind)) err(p, `kind ${e.kind}`);
    checkHours(p, e.hours);
    for (const w of [].concat(e.where)) {
      if (w === 'any' || w === 'freeDrive' || w === 'ride:anyGhost') continue;
      const m = /^(nearLandmark|ride):(.+)$/.exec(w);
      if (!m) err(p, `bad where ${w}`);
      else if (m[1] === 'nearLandmark' && !landmarks[m[2]]) err(p, `unknown landmark ${m[2]}`);
      else if (m[1] === 'ride' && !passengerIds.has(m[2])) err(p, `unknown ride ${m[2]}`);
    }
    if (!GAZE.includes(e.gazeMode)) err(p, `gazeMode ${e.gazeMode}`);
    if (!(e.cooldownSec >= 0)) err(p, 'cooldownSec');
    if (!(e.chance >= 0 && e.chance <= 1)) err(p, 'chance');
    if (e.ruleId && !ruleIds.has(e.ruleId)) err(p, `ruleId ${e.ruleId}`);
    if (e.kind === 'rule' && !e.ruleId) err(p, 'rule encounter without ruleId');
    if (e.lines) checkLines(`${p}.lines`, e.lines);
    if (e.whispers) checkLines(`${p}.whispers`, e.whispers);
    if (e.choice) {
      checkLine(`${p}.choice.prompt`, e.choice.prompt);
      checkLine(`${p}.choice`, { who: 'player', th: 'เลือก', en: 'choose', choice: e.choice });
      stats.lines--;
    }
    for (const [k, o] of Object.entries(e.outcomes || {})) {
      checkLines(`${p}.outcomes.${k}.lines`, o.lines);
      const m = /^(safe|death:(\w+)|ending:(\w+)|scare:(\w+))$/.exec(o.result || '');
      if (!m) err(p, `outcome ${k} bad result ${o.result}`);
      else if (m[2] && !DEATH_CARDS[m[2]]) err(p, `outcome ${k}: no death card for ${m[2]}`);
      else if (m[3] && !ENDINGS[m[3]]) err(p, `outcome ${k}: unknown ending ${m[3]}`);
    }
    if (!isStr(e.staging)) warn(p, 'no staging notes');
  }
  for (const d of ENCOUNTER_DEATHS) if (!DEATH_CARDS[d]) err('ENCOUNTER_DEATHS', `no card for ${d}`);
  for (const d of WRONG_FORK_DEATHS) if (!DEATH_CARDS[d]) err('WRONG_FORK_DEATHS', `no card for ${d}`);
  // every GAME_DESIGN §6 encounter has an entry
  for (const id of ['treeWatcher', 'womanRunning', 'wireCrawler', 'salaShadows', 'upsideDownHead', 'fingersDoorFrame', 'faceAgainstGlass', 'roofCrawler', 'reflectionStays', 'twistedNeckReflection', 'somethingEnormous', 'yaiSpeed', 'krasue', 'krahang', 'phiTaiHong', 'nameCall', 'breathOnNeck', 'cabinLightDies', 'elephants', 'strayDogs', 'fireflies', 'monksAlms', 'monkBlessing', 'noodleShopOpen', 'trunkKnocks']) {
    if (!ENCOUNTERS[id]) err('ENCOUNTERS', `missing design encounter ${id}`);
  }

  // ---------------------------------------------------------------- memories
  if (MEMORIES.length !== 7) err('MEMORIES', 'expected 7');
  const seenM = new Set();
  for (const m of MEMORIES) {
    const p = `MEMORIES.${m.id}`;
    if (seenM.has(m.id)) err(p, 'duplicate');
    seenM.add(m.id);
    if (!isStr(m.titleTH) || !isStr(m.titleEN)) err(p, 'title');
    if (m.where?.landmark && !landmarks[m.where.landmark]) err(p, `unknown landmark ${m.where.landmark}`);
    checkText(`${p}.how`, m.how);
    checkText(`${p}.pencil`, m.pencil);
    (m.text || []).forEach((t, i) => checkText(`${p}.text[${i}]`, t));
    if (!m.text?.length) err(p, 'no text');
  }
  for (const id of ['m_photo', 'm_sticker', 'm_amulet', 'm_helmet', 'm_noodle', 'm_letter', 'm_song']) if (!memIds.has(id)) err('MEMORIES', `missing ${id}`);

  // ---------------------------------------------------------------- endings
  for (const id of ['dawn', 'endless', 'forgive', 'wrong_home']) if (!ENDINGS[id]) err('ENDINGS', `missing ${id}`);
  for (const [k, e] of Object.entries(ENDINGS)) {
    const p = `ENDINGS.${k}`;
    if (e.id !== k) err(p, 'id');
    if (!isStr(e.titleTH) || !isStr(e.titleEN)) err(p, 'title');
    for (const s of e.scenes || []) checkLines(`${p}.scenes.${s.id}`, s.lines);
    (e.epilogue || []).forEach((t, i) => checkText(`${p}.epilogue[${i}]`, t));
    (e.creditsExtra || []).forEach((t, i) => checkText(`${p}.creditsExtra[${i}]`, t));
  }

  // ---------------------------------------------------------------- radio
  const stationIds = new Set(STATIONS.map((s) => s.id));
  STATIONS.forEach((s, i) => {
    if (s.index !== i + 1) err(`STATIONS.${s.id}`, 'index order');
    for (const sch of s.schedule || []) {
      checkHours(`STATIONS.${s.id}.schedule`, sch.hours);
      for (const song of sch.songs || []) if (!SONGS[song]) err(`STATIONS.${s.id}`, `unknown song ${song}`);
    }
  });
  for (const [k, s] of Object.entries(SONGS)) {
    if (s.id !== k) err(`SONGS.${k}`, 'id');
    if (!stationIds.has(s.station)) err(`SONGS.${k}`, `station ${s.station}`);
    (s.lyrics || []).forEach((l, i) => checkText(`SONGS.${k}.lyrics[${i}]`, l));
  }
  if (!SONGS[FATHER_SONG]) err('FATHER_SONG', 'unknown');
  for (const [k, ls] of Object.entries(DJ_LINES)) {
    if (!stationIds.has(k)) err(`DJ_LINES.${k}`, 'unknown station');
    ls.forEach((l, i) => {
      checkLine(`DJ_LINES.${k}[${i}]`, l);
      checkHours(`DJ_LINES.${k}[${i}]`, l.hours);
    });
  }
  checkLines('LATE_NIGHT_WHISPERS', LATE_NIGHT_WHISPERS);
  for (const b of SPECIAL_BROADCASTS) {
    if (!stationIds.has(b.station)) err(`SPECIAL_BROADCASTS.${b.id}`, 'station');
    if (b.then && !SONGS[b.then]) err(`SPECIAL_BROADCASTS.${b.id}`, 'then song');
    if (b.memory && !memIds.has(b.memory)) err(`SPECIAL_BROADCASTS.${b.id}`, 'memory');
    checkLines(`SPECIAL_BROADCASTS.${b.id}`, b.lines);
  }

  // ---------------------------------------------------------------- world text
  for (let h = 21; h <= 30; h++) if (!CHAPTERS.find((c) => c.hour === h)) err('CHAPTERS', `missing hour ${h}`);
  CHAPTERS.forEach((c) => checkText(`CHAPTERS.${c.hour}`, c));
  for (const [k, c] of Object.entries(DEATH_CARDS)) {
    checkText(`DEATH_CARDS.${k}`, c);
    if (c.rule && !ruleIds.has(c.rule)) err(`DEATH_CARDS.${k}`, 'rule');
  }
  LOADING_LINES.forEach((l, i) => checkText(`LOADING_LINES[${i}]`, l));
  for (const [k, s] of Object.entries(SIGNS)) (Array.isArray(s) ? s : [s]).forEach((x, i) => checkText(`SIGNS.${k}[${i}]`, x));
  for (const p of POSTERS) if (!Array.isArray(p.th) || p.th.length !== p.en.length) err(`POSTERS.${p.variant}`, 'th/en line count mismatch');
  for (const p of POSTERS) for (const w of p.where || []) if (!landmarks[w]) err(`POSTERS.${p.variant}`, `unknown landmark ${w}`);
  for (const it of NOODLE_MENU.items) {
    checkText('NOODLE_MENU', it);
    if (typeof it.price !== 'number') err('NOODLE_MENU', `price for ${it.en}`);
  }

  // ---------------------------------------------------------------- Ah Kong
  checkLines('INTRO_GARAGE', INTRO_GARAGE);
  checkLines('SEND_OFF', SEND_OFF);
  checkLines('GARAGE_IDLE', GARAGE_IDLE);
  checkLines('SHRINE_REVEAL', SHRINE_REVEAL);
  checkLines('RADIO_CAMEO', RADIO_CAMEO.lines);
  const stepIds = new Set();
  const checkWait = (p, w) => {
    if (!WAIT_TYPES.includes(w?.type)) err(p, `waitFor type ${w?.type}`);
    if (w?.type === 'look' && !GAZE_TARGETS.includes(w.target)) err(p, `look target ${w.target}`);
    if (w?.type === 'interact' && !isStr(w.id)) err(p, 'interact id');
    if (w?.type === 'control' && !isStr(w.control)) err(p, 'control name');
  };
  const checkHint = (p, h) => {
    checkText(p, h);
    if (!Array.isArray(h.keys)) err(p, 'hint.keys');
    if (keyBindings) {
      const all = new Set(Object.values(keyBindings).flat());
      for (const k of h.keys || []) if (!all.has(KEY_LABEL(k))) err(p, `hint key ${k} is not bound to any action`);
    }
  };
  for (const s of TUTORIAL_STEPS) {
    const p = `TUTORIAL_STEPS.${s.id}`;
    if (stepIds.has(s.id)) err(p, 'duplicate');
    stepIds.add(s.id);
    checkText(p, s);
    if (Array.isArray(s.lines)) checkLines(`${p}.lines`, s.lines);
    else for (const v of ['auto', 'manual']) checkLines(`${p}.lines.${v}`, s.lines?.[v]);
    if (s.hint?.auto) for (const v of ['auto', 'manual']) checkHint(`${p}.hint.${v}`, s.hint[v]);
    else checkHint(`${p}.hint`, s.hint || {});
    if (s.waitFor?.auto) for (const v of ['auto', 'manual']) checkWait(`${p}.waitFor.${v}`, s.waitFor[v]);
    else checkWait(`${p}.waitFor`, s.waitFor);
    if (s.after) checkLines(`${p}.after`, s.after);
    if (s.memory && !memIds.has(s.memory)) err(p, `memory ${s.memory}`);
  }
  for (const id of ['readPaper', 'openDoor', 'sit', 'insertKey', 'startEngine', 'headlights', 'handbrake', 'gear', 'accelerate', 'brake', 'steer', 'indicator', 'wipers', 'cabinLight', 'radio', 'meterOn', 'window', 'mirrorRear', 'amulet']) {
    if (!stepIds.has(id)) err('TUTORIAL_STEPS', `missing step ${id}`);
  }
  let lastLoop = 0;
  for (const r of RESTART_LINES) {
    if (!(r.minLoop > lastLoop)) err('RESTART_LINES', 'minLoop must ascend');
    lastLoop = r.minLoop;
    checkLines(`RESTART_LINES.${r.minLoop}`, r.lines);
  }
  for (const [k, ls] of Object.entries(DEATH_HINTS)) {
    if (!DEATH_CARDS[k]) err(`DEATH_HINTS.${k}`, 'no matching death card');
    checkLines(`DEATH_HINTS.${k}`, ls);
  }
  for (const k of Object.keys(DEATH_CARDS)) if (!DEATH_HINTS[k]) warn('DEATH_HINTS', `no Ah Kong hint for ${k}`);
  checkLine('TIME_SKIP.offer', TIME_SKIP.offer);
  checkLine('TIME_SKIP.choice', TIME_SKIP.choice);
  checkLines('TIME_SKIP.accept', TIME_SKIP.accept);
  checkLines('TIME_SKIP.decline', TIME_SKIP.decline);

  // ---------------------------------------------------------------- credits
  const creditsText = JSON.stringify(CREDITS) + JSON.stringify(CREDITS_HEADLINE);
  for (const must of ['Made by Pukking Dragon', 'Game by', 'three.js', 'MIT', 'Sarabun', 'Kanit', 'Chakra Petch', 'Mali', 'Cormorant Garamond', 'SIL Open Font License 1.1', 'procedurally generated']) {
    if (!creditsText.includes(must)) err('CREDITS', `missing "${must}"`);
  }

  // ---------------------------------------------------------------- generic deep {th,en} pairing
  const walk = (o, path, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 12) return;
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    if ('th' in o !== 'en' in o) err(path, 'has th without en (or en without th)');
    if ('titleTH' in o !== 'titleEN' in o) err(path, 'titleTH/titleEN mismatch');
    if ('nameTH' in o !== 'nameEN' in o) err(path, 'nameTH/nameEN mismatch');
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') walk(v, `${path}.${k}`, depth + 1);
  };
  for (const [k, v] of Object.entries(data)) if (v && typeof v === 'object') walk(v, k);

  stats.passengers = PASSENGERS.length;
  stats.encounters = encIds.size;
  stats.songs = Object.keys(SONGS).length;
  return { errors, warnings, stats };
}

/** Node entry: prints the report and exits non-zero on errors. */
export async function runNode() {
  const data = await import('../game/data/index.js');
  const { LAYOUT } = await import('../world/layout.js');
  const KEY_BINDINGS = { forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'], leanLeft: ['KeyQ'], leanRight: ['KeyE'], interact: ['KeyF'], amulet: ['KeyG'], paper: ['Tab', 'KeyJ'], handbrake: ['Space'], gearUp: ['KeyX'], gearDown: ['KeyZ'], indicatorLeft: ['Digit1'], indicatorRight: ['Digit2'], wipers: ['Digit3'], radio: ['Digit4'], radioTune: ['Digit5'], headlights: ['KeyL'], cabinLight: ['KeyC'], meter: ['KeyM'], window: ['KeyT'], horn: ['KeyH'], vehicle: ['KeyV'] };
  const r = validateNarrative({ data, layout: LAYOUT, keyBindings: KEY_BINDINGS });
  console.log(JSON.stringify(r.stats, null, 1));
  for (const e of r.errors) console.log('ERROR', e);
  for (const w of r.warnings) console.log('warn ', w);
  console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
  if (r.errors.length && typeof process !== 'undefined') process.exitCode = 1;
}
