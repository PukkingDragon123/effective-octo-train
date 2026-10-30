// Schema validator for src/game/data (narrative). Pure JS, no DOM: used by the
// narrative sandbox and runnable from Node:
//   node -e "import('./src/sandbox/narrative-validate.js').then(m=>m.runNode())"
// validateNarrative({ data, layout, keyBindings? }) -> { errors:[], warnings:[], stats:{} }
//
// Besides the schema it checks the second-pass systems (SCHEMA.md): reply moments (3–6 per ride,
// 2–3 short Thai options, silent default last, setOnPick baked), conditions (`if` on beats / lines /
// options / ending scenes), flag conventions (trust.* / clue.* / k.* / ruleBreak / lure) and that every
// flag a condition reads is set somewhere (or by gameplay), loop variants, the r11–r16 encounters and
// RULE_BREAKS, LOOP_STAGING, and that every ending is reachable through logic.resolveEnding().

const TONES = ['normal', 'whisper', 'ghost', 'shout', 'thought', 'sing'];
const EMOTIONS = ['smile', 'sad', 'fear', 'anger', 'creepy', 'surprise'];
const ACTIONS = ['hail', 'wave', 'wai', 'smoke', 'giveItem', 'takeItem', 'sitDown', 'standUp', 'enterCar', 'exitCar', 'nod', 'shakeHead', 'laugh', 'cry', 'point', 'pray', 'shiver', 'neckSnap', 'crawlOverSeat', 'emergeFromBelow', 'pressFaceToGlass', 'ceilingCrawl', 'sprint', 'stagger', 'sing', 'knock', 'reachOut', 'lookAround', 'sleep', 'pay'];
const SEATS = ['rearLeft', 'rearRight', 'frontPassenger'];
const REFLECTION = ['normal', 'none', 'only', 'twisted', 'delayed'];
const METER = ['normal', 'glitch', 'backward', 'oldDate'];
const PAYMENT = ['coins', 'banknote', 'old_banknote', 'ghost_money', 'leaves', 'none'];
const GAZE = ['notLooking', 'mirrorOnly', 'sideWindow', 'any'];
const ENC_KINDS = ['scare', 'folklore', 'rule', 'beautiful', 'story'];
const OUTFITS = ['tshirt-pants', 'shirt-slacks', 'dress', 'school-uniform', 'monk-robe', 'sabai', 'taxi-uniform', 'market-vendor', 'tank-sarong', 'hoodie-jeans', 'old-woman-sarong', 'farmer', 'shroud', 'tank-pants', 'singer', 'tshirt-shorts'];
const HAIR = ['short', 'long', 'bob', 'bun', 'bald', 'shaved', 'gray-short', 'ponytail', 'messy', 'pompadour'];
const ACCESSORIES = ['glasses', 'cap', 'headscarf', 'garland', 'shoulder-bag', 'basket', 'amulet-necklace', 'helmet', 'cigarette', 'lunchbox', 'umbrella'];
const GHOST_EYES = ['normal', 'black', 'white', 'glow'];
const WAIT_TYPES = ['interact', 'enterVehicle', 'control', 'drive', 'speedKmh', 'stop', 'steer', 'look', 'hold', 'paper'];
const GAZE_TARGETS = ['windshield', 'rear', 'fl', 'fr', 'rl', 'rr', 'mirror_rear', 'mirror_left', 'mirror_right', 'interior'];
const DIALOGUE_KEYS = ['hail', 'greet', 'destination', 'beats', 'arriveCorrect', 'arriveWrong', 'idle', 'onLookBack', 'onFaceGaze'];
const VARIANT_KEYS = ['hail', 'greet', 'destination', 'arriveCorrect', 'arriveWrong', 'idle', 'onLookBack', 'onFaceGaze', 'onFaceGazeWarn'];
const ENDING_KINDS = ['good', 'bad', 'true', 'sad', 'bittersweet', 'dark', 'hopeful'];
const ENDING_MOMENTS = ['fork', 'gate', 'finalFork', 'garage'];
const DEJA_VU_TRIGGERS = ['seeTally', 'garageRadio', 'dog', 'calendar', 'enterTaxi'];
const THAI = /[฀-๿]/;
const KEY_LABEL = (k) => (/^[A-Z]$/.test(k) ? 'Key' + k : /^[0-9]$/.test(k) ? 'Digit' + k : k);
const SILENT_TH = /^[.…\s]+$/;

export function validateNarrative({ data, layout, keyBindings = null }) {
  const errors = [];
  const warnings = [];
  const stats = { lines: 0, thaiChars: 0, longest: null, perPassenger: {}, replies: 0, flagsSet: 0 };
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`);
  const {
    CHARACTERS, RULES, HIDDEN_LINE, RULE_PARAMS, RULE_BREAKS, PENCIL_NOTES, PASSENGERS, DIALOGUE_EVENTS, DIALOGUE_EVENT_PARAMS, WRONG_FORK_DEATHS, ENCOUNTERS, ENCOUNTER_DEATHS,
    ENCOUNTER_ESCALATIONS, MEMORIES, MEMORY_IDS, ENDINGS, ENDING_PRIORITY, STATIONS, SONGS, FATHER_SONG, DJ_LINES, LATE_NIGHT_WHISPERS, SPECIAL_BROADCASTS, CHAPTERS,
    DEATH_CARDS, DEATH_FOOTER, LOADING_LINES, HOUR_WORDS, SIGNS, POSTERS, NOODLE_MENU, CREDITS, CREDITS_HEADLINE, INTRO_GARAGE, TUTORIAL_STEPS, SEND_OFF, GARAGE_IDLE,
    RESTART_LINES, RESTART_KEYS, REFUSE_RETURN, DEATH_HINTS, TIME_SKIP, RADIO_CAMEO, SHRINE_REVEAL, LOOP_STAGING, DEJA_VU,
    COND_KEYS, GAMEPLAY_FLAGS, resolveLines, resolveEnding, checkCond,
  } = data;

  const landmarks = layout.landmarks;
  const ruleIds = new Set(RULES.map((r) => r.id));
  const passengerIds = new Set(PASSENGERS.map((p) => p.id));
  const encIds = new Set(Object.keys(ENCOUNTERS));
  const memIds = new Set(MEMORIES.map((m) => m.id));
  const speakers = new Set(['passenger', 'player', ...Object.keys(CHARACTERS)]);
  const choiceIds = new Set();
  const flagsSet = new Map(); // flag -> first path that sets it
  const flagsRead = []; // [{flag, path}]

  const isStr = (s) => typeof s === 'string' && s.trim().length > 0;
  const thaiLen = (s) => [...String(s || '').replace(/[♪\s.…?!,'"()]/g, '')].length;
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

  // ---------------------------------------------------------------- flags
  function noteSet(path, flags) {
    for (const [k, v] of Object.entries(flags || {})) {
      if (!flagsSet.has(k)) flagsSet.set(k, path);
      const m = /^(trust|clue)\.([^.]+)\.([^.]+)$/.exec(k);
      if (k.startsWith('trust.') || k.startsWith('clue.')) {
        if (!m) err(path, `flag "${k}": use trust.<passengerId>.<tag> / clue.<passengerId>.<tag>`);
        else if (!passengerIds.has(m[2])) err(path, `flag "${k}": unknown passenger ${m[2]}`);
        else if (m[1] === 'trust' && !(typeof v === 'number' && Number.isInteger(v) && v !== 0 && Math.abs(v) <= 3)) err(path, `trust delta ${k} must be a non-zero integer in -3..3`);
        else if (m[1] === 'clue' && v !== true) err(path, `clue flag ${k} must be true`);
      }
      if (k === 'ruleBreak' && !RULE_BREAKS?.[v]) err(path, `ruleBreak "${v}" has no RULE_BREAKS entry`);
      if (k === 'lure' && !['r3', 'r4'].includes(v)) err(path, `lure "${v}" must be 'r3' or 'r4'`);
      if (k.startsWith('k.') && !/^k\.[A-Za-z][\w]*$/.test(k)) err(path, `persistent flag "${k}" must look like k.<name>`);
      if (/\s/.test(k)) err(path, `flag "${k}" contains whitespace`);
    }
  }

  // ---------------------------------------------------------------- conditions
  function checkCondObj(path, cond, opts = {}) {
    if (cond == null) return;
    if (typeof cond !== 'object' || Array.isArray(cond)) return err(path, 'condition must be an object');
    for (const [k, v] of Object.entries(cond)) {
      if (!COND_KEYS.includes(k)) {
        err(path, `unknown condition key "${k}"`);
        continue;
      }
      const p = `${path}.${k}`;
      if (k === 'flag') {
        for (const [f, fv] of Object.entries(v || {})) {
          flagsRead.push({ flag: f, path: p });
          if (!['boolean', 'string', 'number'].includes(typeof fv)) err(p, `flag ${f} compares against ${typeof fv}`);
        }
      } else if (k === 'taxi') {
        if (!opts.allowTaxi) err(p, 'taxi conditions only work on ride beats (gameplay passes taxi.state)');
      } else if (k === 'memories') {
        if (!Array.isArray(v)) err(p, 'expected an array of memory ids');
        for (const m of v || []) if (!memIds.has(m)) err(p, `unknown memory ${m}`);
      } else if (k === 'allMemories') {
        if (typeof v !== 'boolean') err(p, 'expected boolean');
      } else if (['memoriesGte', 'loopsGte', 'loopsLt', 'kindnessGte'].includes(k)) {
        if (!(Number.isInteger(v) && v >= 0)) err(p, 'expected a non-negative integer');
      } else if (k === 'hourGte' || k === 'hourLt') {
        if (!(v >= 21 && v <= 30)) err(p, 'expected a game hour 21..30');
      } else if (k === 'diedOn') {
        for (const pid of [].concat(v)) if (!passengerIds.has(pid)) err(p, `unknown passenger ${pid}`);
      } else if (k === 'trustGte' || k === 'trustLt') {
        for (const [pid, n] of Object.entries(v || {})) {
          if (!passengerIds.has(pid)) err(p, `unknown passenger ${pid}`);
          if (typeof n !== 'number') err(p, `${pid}: expected a number`);
        }
      } else if (k === 'endingSeen') {
        for (const id of [].concat(v)) if (!ENDINGS[id]) err(p, `unknown ending ${id}`);
      } else if (k === 'not') checkCondObj(p, v, opts);
      else if (k === 'any') {
        if (!Array.isArray(v) || !v.length) err(p, 'expected a non-empty array of conditions');
        else v.forEach((c, i) => checkCondObj(`${p}[${i}]`, c, opts));
      }
    }
  }
  // flags (and trust pids) a condition reads, for the same-block ordering check
  const condFlags = (cond, out = new Set()) => {
    if (!cond) return out;
    for (const f of Object.keys(cond.flag || {})) out.add(f);
    for (const pid of Object.keys({ ...(cond.trustGte || {}), ...(cond.trustLt || {}) })) out.add(`trust.${pid}.*`);
    if (cond.kindnessGte != null) out.add('trust.*');
    if (cond.not) condFlags(cond.not, out);
    for (const c of cond.any || []) condFlags(c, out);
    return out;
  };
  const setMatches = (setSoFar, f) => {
    if (f === 'trust.*') return [...setSoFar].some((k) => k.startsWith('trust.'));
    if (f.endsWith('.*')) return [...setSoFar].some((k) => k.startsWith(f.slice(0, -1)));
    return setSoFar.has(f);
  };

  // ---------------------------------------------------------------- lines
  function checkText(path, o, { thaiRequired = true, allowEmpty = false } = {}) {
    const empty = allowEmpty && o.th === '' && o.en === '';
    if (!empty) {
      if (!isStr(o.th)) err(path, 'missing th');
      if (!isStr(o.en)) err(path, 'missing en');
    }
    if (isStr(o.th) && thaiRequired && !THAI.test(o.th) && !/^[♪.…\s—-]*$/.test(o.th)) warn(path, `th has no Thai: "${o.th}"`);
    if (isStr(o.en) && THAI.test(o.en)) err(path, `en contains Thai: "${o.en}"`);
  }
  /** ctx: { count, rideReplies, setSoFar:Set (flags set earlier in this block), noChoiceId, allowTaxi } */
  function checkLine(path, l, ctx = {}) {
    if (!l || typeof l !== 'object') return err(path, 'line is not an object');
    if (!speakers.has(l.who)) err(path, `unknown who "${l.who}"`);
    checkText(path, l, { thaiRequired: !/Namo|Iti pi|Yatha/.test(l.en || ''), allowEmpty: !!l.choice });
    if (l.tone && !TONES.includes(l.tone)) err(path, `bad tone ${l.tone}`);
    if (l.emotion && !EMOTIONS.includes(l.emotion)) err(path, `bad emotion ${l.emotion}`);
    if (l.action && !ACTIONS.includes(l.action)) err(path, `bad action ${l.action}`);
    if (l.pause != null && !(typeof l.pause === 'number' && l.pause >= 0 && l.pause < 10)) err(path, 'bad pause');
    if (l.if) {
      checkCondObj(`${path}.if`, l.if, ctx);
      if (ctx.setSoFar) for (const f of condFlags(l.if)) if (setMatches(ctx.setSoFar, f)) err(`${path}.if`, `reads ${f}, which an earlier line of the SAME block sets (conditions are evaluated when the block starts)`);
    }
    if (l.set) {
      if (typeof l.set !== 'object') err(path, 'set must be an object');
      else {
        noteSet(path, l.set);
        if (ctx.setSoFar) for (const k of Object.keys(l.set)) ctx.setSoFar.add(k);
      }
    }
    stats.lines++;
    if (isStr(l.th)) {
      stats.thaiChars += l.th.length;
      const len = thaiLen(l.th);
      if (len > 56 && !l.choice) warn(path, `long Thai line (${len} chars): "${l.th}"`);
      if (!stats.longest || len > stats.longest.len) stats.longest = { len, th: l.th, path };
    }
    if (ctx.count) ctx.count.n++;
    if (l.who === 'player' && !l.choice && ctx.ton) ctx.ton[l.tone === 'thought' ? 'thought' : 'said']++;
    if (l.choice) checkChoice(path, l, ctx);
  }
  function checkChoice(path, l, ctx) {
    const c = l.choice;
    stats.replies++;
    if (ctx.rideReplies && !l.if) ctx.rideReplies.n++;
    if (!Array.isArray(c.options) || c.options.length < 2) err(path, 'choice needs >= 2 options');
    if ((c.options || []).length > 4) err(path, 'ui.choice shows at most 4 options');
    const base = (c.options || []).filter((o) => !o.if);
    if (base.length > 3) warn(path, `${base.length} unconditional options (target 2–3)`);
    const keys = new Set();
    for (const [i, o] of (c.options || []).entries()) {
      const op = `${path}.choice[${i}]`;
      if (!isStr(o.key)) err(op, 'missing key');
      if (keys.has(o.key)) err(op, `duplicate key ${o.key}`);
      keys.add(o.key);
      checkText(op, o);
      if (isStr(o.th) && !SILENT_TH.test(o.th)) {
        const len = thaiLen(o.th);
        if (len > 30) warn(op, `reply "${o.th}" is long (${len} code points; replies are 2–7 words)`);
        if (!THAI.test(o.th)) err(op, `reply "${o.th}" has no Thai`);
      }
      if (o.if) checkCondObj(`${op}.if`, o.if, ctx);
    }
    if (c.defaultKey != null && !keys.has(c.defaultKey)) err(path, `defaultKey ${c.defaultKey} not an option`);
    if (c.timeout != null && !(c.timeout > 0)) err(path, 'bad choice timeout');
    const silent = (c.options || []).find((o) => SILENT_TH.test(o.th || ''));
    if (silent && c.options[c.options.length - 1] !== silent) err(path, 'the silent option (…) must be the LAST option');
    if (silent && c.defaultKey !== silent.key) warn(path, 'the silent option exists but is not the default');
    if (silent?.if) err(path, 'the silent option must be unconditional');
    if (c.defaultKey && (c.options || []).find((o) => o.key === c.defaultKey)?.if) err(path, 'defaultKey must be an unconditional option');
    // src/game/Dialogue.js plays `line.choice.branches[key]` and records choices[choice.id || index]
    if (l.branches) err(path, 'branches must live in line.choice.branches (Dialogue.js reads choice.branches)');
    if (l.setOnPick) err(path, 'setOnPick must live in line.choice.setOnPick');
    if (!ctx.noChoiceId && !isStr(c.id)) err(path, 'choice needs a stable id (Dialogue.play returns choices[id])');
    if (isStr(c.id)) {
      if (choiceIds.has(c.id)) err(path, `duplicate choice id ${c.id}`);
      choiceIds.add(c.id);
    }
    const before = ctx.setSoFar ? new Set(ctx.setSoFar) : null;
    for (const [k, ls] of Object.entries(c.branches || {})) {
      if (!keys.has(k)) err(path, `branch for unknown key ${k}`);
      const bctx = { ...ctx, setSoFar: before ? new Set(before) : null };
      checkLines(`${path}.branches.${k}`, ls, bctx);
      if (ctx.setSoFar && bctx.setSoFar) for (const f of bctx.setSoFar) ctx.setSoFar.add(f); // any branch may have run
    }
    for (const [k, flags] of Object.entries(c.setOnPick || {})) {
      if (!keys.has(k)) err(path, `setOnPick unknown key ${k}`);
      const first = c.branches?.[k]?.[0];
      if (!first) err(path, `setOnPick.${k} needs a non-empty branch (the stock Dialogue runner applies flags from the branch's first line)`);
      else if (!Object.keys(flags).every((f) => first.set && f in first.set)) err(path, `setOnPick.${k} not baked into the branch's first line`);
      noteSet(`${path}.setOnPick.${k}`, flags);
    }
    if (c.timeout && c.defaultKey !== c.options[c.options.length - 1].key) warn(path, 'timed choice: defaultKey should be the last (silent) option');
  }
  function checkLines(path, arr, ctx = {}) {
    if (!Array.isArray(arr)) return err(path, 'expected an array of lines');
    arr.forEach((l, i) => checkLine(`${path}[${i}]`, l, ctx));
  }
  /** A block = one array handed to dialogue.play(): conditions are evaluated at its start. */
  const checkBlock = (path, arr, ctx = {}) => checkLines(path, arr, { ...ctx, setSoFar: new Set() });

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
      if (e.type === 'flag') noteSet(`${path}.effects[${i}]`, { [e.name]: e.value });
      if (!['rule', 'taxi', 'item', 'encounter', 'sfx', 'flag'].includes(e.type)) err(`${path}.effects[${i}]`, `unknown effect type ${e.type}`);
    }
  }

  // ---------------------------------------------------------------- pacing
  // Spoken-line duration: the same estimate src/game/Dialogue.js uses, + the line's pause.
  const lineSeconds = (l) => {
    if (l.choice) return (l.choice.timeout ? Math.min(5, l.choice.timeout) : 5) + Math.max(0, ...Object.values(l.choice.branches || {}).map((b) => b.reduce((a, x) => a + lineSeconds(x), 0)));
    return Math.max(1.8, 1.1 + (l.th || '').length * 0.065 + (l.en || '').length * 0.012) + (l.pause ?? 0.4);
  };
  const linesSeconds = (ls) => (ls || []).reduce((a, l) => a + lineSeconds(l), 0);
  stats.pacing = {};
  function checkPacing(path, p, d) {
    const pc = p.pacing;
    if (!pc) return err(path, 'missing pacing { cruiseKmh, minSeconds, stretch }');
    if (!(pc.cruiseKmh >= 15 && pc.cruiseKmh <= 80)) err(path, 'pacing.cruiseKmh out of 15..80');
    if (!(pc.minSeconds > 0)) err(path, 'pacing.minSeconds');
    if (!['none', 'fog', 'mist'].includes(pc.stretch)) err(path, `pacing.stretch ${pc.stretch}`);
    if (pc.speedCapKmh != null && !(pc.speedCapKmh > pc.cruiseKmh * 0.8)) err(path, 'pacing.speedCapKmh too low');
    const lm = landmarks[p.pickup];
    if (!lm || lm.spline !== 'main') return;
    const routeM = (1 - lm.u) * layout.mainLength; // pickup -> fork (u = 1)
    const driveS = routeM / (pc.cruiseKmh / 3.6);
    const fastS = routeM / ((pc.speedCapKmh ?? 70) / 3.6); // a player in a hurry
    const rideS = Math.max(driveS, pc.minSeconds);
    const opening = linesSeconds(d.greet) + linesSeconds(d.destination);
    const progress = (d.beats || []).filter((b) => b.trigger.type === 'progress').sort((a, b) => a.trigger.at - b.trigger.at);
    const mainS = opening + (d.beats || []).filter((b) => b.trigger.type !== 'event').reduce((a, b) => a + linesSeconds(b.lines), 0);
    const essentialS = (d.beats || []).filter((b) => b.essential).reduce((a, b) => a + linesSeconds(b.lines), 0);
    stats.pacing[p.id] = { routeM: Math.round(routeM), driveS: Math.round(driveS), rideS: Math.round(rideS), mainDialogueS: Math.round(mainS), essentialS: Math.round(essentialS) };
    if (mainS > rideS * 0.85) warn(path, `pacing: ~${Math.round(mainS)} s of scripted talk in a ~${Math.round(rideS)} s ride (no room for silence)`);
    if (pc.stretch === 'none' && pc.minSeconds > fastS * 1.05) warn(path, `pacing: minSeconds ${pc.minSeconds} > a fast drive (${Math.round(fastS)} s) but stretch is 'none'`);
    // Timeline at the slowest legal pace: progress beats start at ≈ at * rideS (progress is
    // min(distance, time) based, see SCHEMA.md), scheduled encounters bring their reaction beat
    // ('encounter:<id>') at their own `at`, and 'after' beats follow their parent. Nothing may pile up.
    const items = progress.map((b) => ({ t: b.trigger.at * rideS, b, label: b.id }));
    for (const e of p.encounters || []) {
      const rb = (d.beats || []).find((b) => b.trigger.type === 'event' && (b.trigger.event === `encounter:${e.id}` || b.trigger.event === e.id));
      if (rb) items.push({ t: e.at * rideS, b: rb, label: `${rb.id} (encounter ${e.id}${e.optional ? ', optional' : ''})` });
    }
    items.sort((x, y) => x.t - y.t);
    let busyUntil = opening;
    const ends = {};
    for (const it of items) {
      let t = it.t;
      if (t < busyUntil - 0.5) warn(`${path}.beats.${it.label}`, `starts at ~${Math.round(t)} s while the previous talk runs until ~${Math.round(busyUntil)} s`);
      t = Math.max(busyUntil, t);
      busyUntil = t + linesSeconds(it.b.lines) + 1.5;
      ends[it.b.id] = busyUntil - 1.5;
      for (const ab of (d.beats || []).filter((x) => x.trigger.type === 'after' && x.trigger.beat === it.b.id)) {
        const at = ends[it.b.id] + ab.trigger.seconds;
        const next = items.find((x) => x.t > it.t && x !== it);
        if (next && at + linesSeconds(ab.lines) > next.t) warn(`${path}.beats.${ab.id}`, `'after' beat (~${Math.round(at)} s) runs into ${next.label} (~${Math.round(next.t)} s)`);
      }
    }
    if (busyUntil > rideS * (DIALOGUE_EVENT_PARAMS.forkApproachProgress ?? 0.9) + 2) warn(path, `pacing: progress beats run until ~${Math.round(busyUntil)} s, past forkApproach (~${Math.round(rideS * 0.9)} s)`);
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
      // characters/Head.js treats these as MULTIPLIERS around 1 (f.eyeSize ?? 1); 0..1 values shrink the features.
      for (const k of ['eyeSize', 'noseWidth', 'jaw', 'cheek']) {
        const val = a.face?.[k];
        if (val != null && !(val >= 0.8 && val <= 1.25)) err(p, `face.${k}=${val}: a multiplier around 1 (0.8..1.25) in characters/Head.js`);
      }
      for (const k of ['wrinkles', 'smile']) {
        const val = a.face?.[k];
        if (val != null && !(val >= 0 && val <= 1)) err(p, `face.${k} out of 0..1`);
      }
      // characters/Face.js only treats 'shaved' + 'monk-robe' as a monk (shaved brows, no stubble)
      if (a.outfit?.type === 'monk-robe' && a.hair?.style !== 'shaved') err(p, "monks need hair.style 'shaved' (Face.js shaves the brows)");
    }
  }

  // ---------------------------------------------------------------- rules
  if (RULES.length !== 16) err('RULES', `expected 16 rules (10 front + 6 back), got ${RULES.length}`);
  RULES.forEach((r, i) => {
    if (r.id !== `r${i + 1}`) err(`RULES[${i}]`, `id should be r${i + 1}`);
    checkText(`RULES.${r.id}`, r);
    if (!isStr(r.shortTH) || !isStr(r.shortEN)) err(`RULES.${r.id}`, 'missing short labels');
    const back = i >= 10;
    if (back && r.side !== 'back') err(`RULES.${r.id}`, "rules 11–16 are on the back of the paper (side:'back')");
    if (!back && r.side) err(`RULES.${r.id}`, 'front rules have no side');
    if (r.exception) checkText(`RULES.${r.id}.exception`, r.exception);
    if (back && r.id !== 'r16' && !r.exception) warn(`RULES.${r.id}`, 'back rules carry a learned exception');
  });
  checkText('HIDDEN_LINE', HIDDEN_LINE);
  for (const k of ['lookBackYawDeg', 'faceGazeSeconds', 'knockStopSpeedKmh', 'radioGraceSeconds', 'meter444CountSeconds', 'roadFigureNoBrakeMinKmh', 'bloodWiperGraceSeconds', 'windowOpenFailAmount', 'radioNameTuneSeconds', 'extraPassengerStopSpeedKmh', 'lureSeconds', 'windowCreepPerSec']) {
    if (RULE_PARAMS[k] == null) err('RULE_PARAMS', `missing ${k}`);
  }
  for (const [rid, b] of Object.entries(RULE_BREAKS || {})) {
    const p = `RULE_BREAKS.${rid}`;
    if (!ruleIds.has(rid)) err(p, 'unknown rule');
    if (b.death && !DEATH_CARDS[b.death]) err(p, `no death card ${b.death}`);
    if (b.escalate && !ENCOUNTER_ESCALATIONS.includes(b.escalate)) err(p, `unknown escalation ${b.escalate}`);
    if (!b.death && !b.escalate) err(p, 'needs death or escalate');
    const encs = Object.values(ENCOUNTERS).filter((e) => e.ruleId === rid && !e.exception);
    if (b.outcome) {
      if (!encs.length) err(p, `no (non-exception) encounter with ruleId ${rid}`);
      for (const e of encs) if (!e.outcomes?.[b.outcome]) err(p, `ENCOUNTERS.${e.id} has no outcome "${b.outcome}"`);
    }
  }
  for (const [k, n] of Object.entries(PENCIL_NOTES)) {
    if (!(ruleIds.has(k) || k === 'hidden' || k === 'back' || (k.startsWith('p:') && passengerIds.has(k.slice(2))))) err(`PENCIL_NOTES.${k}`, 'unknown key');
    checkText(`PENCIL_NOTES.${k}`, n);
  }

  // ---------------------------------------------------------------- passengers
  if (PASSENGERS.length !== 9) err('PASSENGERS', 'expected 9 rides');
  const seenP = new Set();
  const trustPids = new Set(); // passengers with at least one positive trust pick
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
    const app = CHARACTERS[p.characterId]?.appearance;
    if (app && c.blinks === false && !app.noBlink) warn(path, 'clues.blinks=false but appearance.noBlink is not set');
    if (p.identity === 'ghost' && ghostSigns < 3) err(path, `ghost shows only ${ghostSigns} ghost clues (need 3+)`);
    if (p.identity === 'human' && (c.reflection !== 'normal' || !c.shadow || !c.breathFog || c.weightKg === 0 || c.meter !== 'normal')) err(path, 'human with ghost clues');
    for (const r of p.specialRules || []) {
      if (!ruleIds.has(r.rule)) err(path, `specialRules unknown rule ${r.rule}`);
      if (r.setOnLookBack) noteSet(`${path}.specialRules.${r.rule}`, r.setOnLookBack);
      if (typeof r.lookBack === 'string' && r.lookBack.startsWith('ending:') && !ENDINGS[r.lookBack.slice(7)]) err(path, `specialRules lookBack ${r.lookBack}: unknown ending`);
    }
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
      if (enc.needsReflection && c.reflection === 'none') err(path, `encounter ${e.id} needs a reflection but this passenger has none`);
      const excepted = (p.specialRules || []).some((s) => s.rule === enc.ruleId && s.exception);
      for (const ch of excepted ? [] : enc.chains || []) {
        const ce = ENCOUNTERS[ch.id];
        if (ce && (!ch.if || checkCond(ch.if, { hour: p.hour })) && ![].concat(ce.where).some((w) => w === `ride:${p.id}` || w === 'any')) warn(path, `encounter ${e.id} chains ${ch.id}, whose where does not list ride:${p.id}`);
      }
    }
    if (!WRONG_FORK_DEATHS.includes(p.deathOnWrong)) err(path, `deathOnWrong ${p.deathOnWrong}`);
    for (const m of p.memoryHooks || []) if (!memIds.has(m)) err(path, `unknown memory ${m}`);
    const d = p.dialogue || {};
    for (const k of DIALOGUE_KEYS) if (!Array.isArray(d[k])) err(path, `dialogue.${k} missing`);
    const count = { n: 0 };
    const rideReplies = { n: 0 };
    const ton = { said: 0, thought: 0 };
    const lctx = { count, rideReplies, ton };
    for (const k of DIALOGUE_KEYS) if (k !== 'beats' && Array.isArray(d[k])) checkBlock(`${path}.dialogue.${k}`, d[k], lctx);
    if (d.onFaceGazeWarn) checkBlock(`${path}.dialogue.onFaceGazeWarn`, d.onFaceGazeWarn, lctx);
    // loopVariants: { blockKey: { minLoop: [Line] } } — the highest minLoop <= loops replaces the block
    for (const [k, byLoop] of Object.entries(d.loopVariants || {})) {
      const vp = `${path}.dialogue.loopVariants.${k}`;
      if (!VARIANT_KEYS.includes(k)) err(vp, `not a dialogue block (allowed: ${VARIANT_KEYS.join(' ')})`);
      for (const [n, ls] of Object.entries(byLoop || {})) {
        if (!(Number.isInteger(+n) && +n >= 1)) err(vp, `key ${n}: loop thresholds are integers >= 1`);
        checkBlock(`${vp}.${n}`, ls, { count, ton });
      }
    }
    const beatIds = new Set();
    for (const b of d.beats || []) {
      if (!isStr(b.id)) err(path, 'beat without id');
      if (beatIds.has(b.id)) err(path, `duplicate beat ${b.id}`);
      beatIds.add(b.id);
    }
    for (const b of d.beats || []) {
      const bp = `${path}.beats.${b.id}`;
      checkTrigger(bp, b.trigger, beatIds);
      if (b.set) noteSet(bp, b.set);
      checkBlock(`${bp}.lines`, b.lines, { ...lctx, allowTaxi: true });
      if (!b.lines?.length) err(bp, 'beat has no lines');
      checkEffects(bp, b.effects);
      if (b.essential != null && typeof b.essential !== 'boolean') err(bp, 'essential must be boolean');
      if (b.essential && b.if) warn(bp, 'essential beat with a condition: it may never play');
      if (b.if) checkCondObj(`${bp}.if`, b.if, { allowTaxi: true });
    }
    checkPacing(path, p, d);
    if (p.finale) for (const [k, v] of Object.entries(p.finale)) Array.isArray(v) ? checkBlock(`${path}.finale.${k}`, v, lctx) : checkBlock(`${path}.finale.${k}`, [v], lctx);
    stats.perPassenger[p.id] = { lines: count.n, beats: d.beats?.length || 0, replies: rideReplies.n, tonSays: ton.said, tonThinks: ton.thought };
    if (rideReplies.n < 3) err(path, `${rideReplies.n} reply moments (every ride needs 3–6)`);
    if (rideReplies.n > 7) warn(path, `${rideReplies.n} reply moments (target 3–6)`);
    if (count.n < 20 || count.n > 170) warn(path, `${count.n} lines incl. branches and variants (target ~25–150)`);
    if (ton.said > 4) warn(path, `Ton speaks ${ton.said} scripted lines outside replies (he answers through replies)`);
    if (ton.thought > 3) warn(path, `Ton has ${ton.thought} thought-subtitles (minimal text: let the world show it)`);
    // positive trust picks for kindness
    const scan = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(scan);
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith(`trust.${p.id}.`) && v > 0) trustPids.add(p.id);
        if (v && typeof v === 'object') scan(v);
      }
    };
    scan(d);
  });
  stats.kindnessPassengers = trustPids.size;
  if (trustPids.size < 6) err('PASSENGERS', `only ${trustPids.size} passengers can gain trust: kindness >= 4 (Somchai's takeOver reply) must be comfortably reachable`);

  // reply simulation: every unconditional reply moment keeps >= 2 options in every typical context
  const allMem = MEMORY_IDS.slice();
  const sampleCtxs = [];
  for (const loops of [0, 1, 3, 12]) {
    for (const died of [false, true]) {
      for (const mem of [[], allMem]) {
        for (const kind of [{}, Object.fromEntries(['sri', 'womanWhite', 'piak', 'boyM', 'nuan'].map((pid) => [`trust.${pid}.x`, 1]))]) {
          sampleCtxs.push({ loops, died, save: { loops, memories: mem, flags: { ...kind }, deaths: [], endingsSeen: [] } });
        }
      }
    }
  }
  const walkChoices = (lines, fn) => {
    for (const l of lines || []) {
      if (l.choice) {
        fn(l);
        for (const b of Object.values(l.choice.branches || {})) walkChoices(b, fn);
      }
    }
  };
  for (const p of PASSENGERS) {
    const d = p.dialogue;
    const blocks = [];
    for (const k of DIALOGUE_KEYS) if (k !== 'beats') blocks.push([k, d[k]]);
    for (const b of d.beats || []) blocks.push([`beats.${b.id}`, b.lines]);
    for (const [k, v] of Object.entries(p.finale || {})) blocks.push([`finale.${k}`, Array.isArray(v) ? v : [v]]);
    for (const [k, ls] of blocks) {
      walkChoices(ls, (l) => {
        if (l.if) return;
        for (const s of sampleCtxs) {
          const ctx = { save: { ...s.save, deaths: s.died ? [{ rideId: p.id, cause: 'x', hour: p.hour }] : [] } };
          const opts = l.choice.options.filter((o) => !o.if || checkCond(o.if, ctx));
          if (opts.length < 2) {
            err(`PASSENGERS.${p.id}.${k}`, `reply ${l.choice.id} collapses to ${opts.length} option(s) at loops=${s.loops} died=${s.died}`);
            return;
          }
        }
      });
    }
  }
  // resolveLines round-trip on one ride: the output must be plain Dialogue.js lines
  {
    const out = resolveLines(PASSENGERS[0].dialogue.beats[1].lines, { save: { loops: 3, flags: {}, memories: [], deaths: [{ rideId: PASSENGERS[0].id }] } });
    const bad = JSON.stringify(out).includes('"if"');
    if (bad) err('logic.resolveLines', 'resolved lines still carry `if`');
  }

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
    if (e.exception != null && typeof e.exception !== 'boolean') err(p, 'exception must be boolean');
    if (e.exception && !e.ruleId) err(p, 'an exception encounter names its ruleId');
    if (e.creature && !/^create[A-Z]/.test(e.creature) && !CHARACTERS[e.creature]) err(p, `creature ${e.creature}: a creatures/ factory or a CHARACTERS id`);
    for (const k of Object.keys(e.requires || {})) if (!['radioOn', 'passengerAboard'].includes(k)) err(p, `requires.${k}`);
    for (const [i, ch] of (e.chains || []).entries()) {
      if (!ENCOUNTERS[ch.id]) err(`${p}.chains[${i}]`, `unknown encounter ${ch.id}`);
      if (!(ch.atSecond >= 0)) err(`${p}.chains[${i}]`, 'atSecond');
      if (ch.if) checkCondObj(`${p}.chains[${i}].if`, ch.if);
    }
    if (e.broadcast && !SPECIAL_BROADCASTS.some((b) => b.id === e.broadcast)) err(p, `unknown broadcast ${e.broadcast}`);
    if (e.lines) checkLines(`${p}.lines`, e.lines);
    if (e.countLines) checkLines(`${p}.countLines`, e.countLines);
    if (e.whispers) checkLines(`${p}.whispers`, e.whispers);
    if (e.choice) {
      if (e.choice.prompt) checkLine(`${p}.choice.prompt`, e.choice.prompt);
      checkLine(`${p}.choice`, { who: 'player', th: '', en: '', choice: e.choice }, { noChoiceId: true });
      stats.lines--;
      // every spoken reply resolves to an outcome; silence may leave it to the rule's own check (e.g. retune in time)
      for (const o of e.choice.options) if (!SILENT_TH.test(o.th) && !e.outcomes?.[o.key]) err(p, `choice option ${o.key} has no outcome`);
    }
    for (const [k, o] of Object.entries(e.outcomes || {})) {
      checkLines(`${p}.outcomes.${k}.lines`, o.lines);
      const m = /^(safe|death:(\w+)|ending:(\w+)|scare:(\w+)|escalate:(\w+))$/.exec(o.result || '');
      if (!m) err(p, `outcome ${k} bad result ${o.result}`);
      else if (m[2] && !DEATH_CARDS[m[2]]) err(p, `outcome ${k}: no death card for ${m[2]}`);
      else if (m[3] && !ENDINGS[m[3]]) err(p, `outcome ${k}: unknown ending ${m[3]}`);
      else if (m[5] && !ENCOUNTER_ESCALATIONS.includes(m[5])) err(p, `outcome ${k}: unknown escalation ${m[5]}`);
      if (e.exception && /^death:/.test(o.result || '')) err(p, `exception encounter outcome ${k} must not kill`);
    }
    if (!isStr(e.staging)) warn(p, 'no staging notes');
  }
  for (const d of ENCOUNTER_DEATHS) if (!DEATH_CARDS[d]) err('ENCOUNTER_DEATHS', `no card for ${d}`);
  for (const d of WRONG_FORK_DEATHS) if (!DEATH_CARDS[d]) err('WRONG_FORK_DEATHS', `no card for ${d}`);
  // every GAME_DESIGN §6 encounter, plus one rule event (and its exception) per back-of-paper rule
  for (const id of ['treeWatcher', 'womanRunning', 'wireCrawler', 'salaShadows', 'upsideDownHead', 'fingersDoorFrame', 'faceAgainstGlass', 'roofCrawler', 'reflectionStays', 'twistedNeckReflection', 'somethingEnormous', 'yaiSpeed', 'krasue', 'krahang', 'phiTaiHong', 'nameCall', 'breathOnNeck', 'cabinLightDies', 'elephants', 'strayDogs', 'fireflies', 'monksAlms', 'monkBlessing', 'noodleShopOpen', 'trunkKnocks', 'meter444', 'roadFigure', 'bloodDrip', 'betelSpit', 'windowKnock', 'radioName', 'fatherDedication', 'extraPassenger']) {
    if (!ENCOUNTERS[id]) err('ENCOUNTERS', `missing design encounter ${id}`);
  }
  for (const r of RULES.filter((x) => x.side === 'back')) {
    const real = Object.values(ENCOUNTERS).filter((e) => e.ruleId === r.id && !e.exception);
    if (!real.length) err('ENCOUNTERS', `no encounter stages ${r.id}`);
    // scheduled = a non-optional ride encounter, or chained from one (chain.if true at that ride's hour)
    const scheduled = PASSENGERS.some((p) => p.encounters.some((x) => {
      if (x.optional) return false;
      if (real.some((e) => e.id === x.id)) return true;
      const enc = ENCOUNTERS[x.id];
      const excepted = (p.specialRules || []).some((s) => s.rule === enc?.ruleId && s.exception);
      return !excepted && (enc?.chains || []).some((ch) => real.some((e) => e.id === ch.id) && (!ch.if || checkCond(ch.if, { hour: p.hour })));
    }));
    if (!scheduled && !real.some((e) => [].concat(e.where).includes('freeDrive'))) err('ENCOUNTERS', `${r.id} never happens (not scheduled, not free-drive)`);
    if (!scheduled) warn('PASSENGERS', `${r.id} is only optional/free-drive (no guaranteed ride instance)`);
    if (r.exception) {
      const exRide = PASSENGERS.some((p) => (p.specialRules || []).some((s) => s.rule === r.id && s.exception));
      if (!exRide) err('PASSENGERS', `${r.id}'s exception is never staged in a ride (specialRules { rule, exception })`);
    }
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

  // ---------------------------------------------------------------- Ah Kong (before endings: they read his flags)
  checkBlock('INTRO_GARAGE', INTRO_GARAGE);
  checkBlock('SEND_OFF', SEND_OFF);
  checkLines('GARAGE_IDLE', GARAGE_IDLE);
  checkBlock('SHRINE_REVEAL', SHRINE_REVEAL);
  checkBlock('RESTART_KEYS', RESTART_KEYS);
  checkBlock('REFUSE_RETURN', REFUSE_RETURN);
  for (const b of data.INTRO_BIKE || []) {
    if (!(b.at >= 0 && b.at <= 1)) err(`INTRO_BIKE.${b.id}`, 'at must be 0..1 (spur progress)');
    checkBlock(`INTRO_BIKE.${b.id}`, b.lines);
  }
  if (!data.INTRO_BIKE?.length) warn('INTRO_BIKE', 'no motorbike-intro lines');
  checkBlock('RADIO_CAMEO', RADIO_CAMEO.lines);
  const stepIds = new Set();
  const checkWait = (p, w) => {
    if (!WAIT_TYPES.includes(w?.type)) err(p, `waitFor type ${w?.type}`);
    if (w?.type === 'look' && !GAZE_TARGETS.includes(w.target)) err(p, `look target ${w.target}`);
    if (w?.type === 'interact' && !isStr(w.id)) err(p, 'interact id');
    if (w?.type === 'control' && !isStr(w.control)) err(p, 'control name');
  };
  const checkHint = (p, h) => {
    if (h === null) return; // no hint: Ah Kong's voice is enough
    checkText(p, h);
    if (thaiLen(h.th) > 12) warn(p, `hint "${h.th}" is long (Thai-first: 1–3 words + keys)`);
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
    if (Array.isArray(s.lines)) checkBlock(`${p}.lines`, s.lines);
    else for (const v of ['auto', 'manual']) checkBlock(`${p}.lines.${v}`, s.lines?.[v]);
    if (s.hint?.auto) for (const v of ['auto', 'manual']) checkHint(`${p}.hint.${v}`, s.hint[v]);
    else if (s.hint === undefined) err(p, 'hint missing (use null for none)');
    else checkHint(`${p}.hint`, s.hint);
    if (s.waitFor?.auto) for (const v of ['auto', 'manual']) checkWait(`${p}.waitFor.${v}`, s.waitFor[v]);
    else checkWait(`${p}.waitFor`, s.waitFor);
    if (s.after) checkBlock(`${p}.after`, s.after);
    if (s.memory && !memIds.has(s.memory)) err(p, `memory ${s.memory}`);
  }
  for (const id of ['readPaper', 'openDoor', 'sit', 'insertKey', 'startEngine', 'headlights', 'handbrake', 'gear', 'accelerate', 'brake', 'steer', 'indicator', 'wipers', 'cabinLight', 'radio', 'meterOn', 'window', 'mirrorRear', 'amulet']) {
    if (!stepIds.has(id)) err('TUTORIAL_STEPS', `missing step ${id}`);
  }
  let lastLoop = 0;
  let restartReplies = 0;
  for (const r of RESTART_LINES) {
    if (!(r.minLoop > lastLoop)) err('RESTART_LINES', 'minLoop must ascend');
    lastLoop = r.minLoop;
    checkBlock(`RESTART_LINES.${r.minLoop}`, r.lines);
    restartReplies += r.lines.filter((l) => l.choice).length;
    (r.variants || []).forEach((v, i) => checkBlock(`RESTART_LINES.${r.minLoop}.variants[${i}]`, v));
  }
  if (restartReplies < 3) warn('RESTART_LINES', `${restartReplies} restarts let Ton answer (target 3+)`);
  for (const [k, ls] of Object.entries(DEATH_HINTS)) {
    if (!DEATH_CARDS[k]) err(`DEATH_HINTS.${k}`, 'no matching death card');
    checkBlock(`DEATH_HINTS.${k}`, ls);
    if (ls.length !== 1) warn(`DEATH_HINTS.${k}`, 'one short line per death');
  }
  for (const k of Object.keys(DEATH_CARDS)) if (!DEATH_HINTS[k]) warn('DEATH_HINTS', `no Ah Kong hint for ${k}`);
  checkLine('TIME_SKIP.offer', TIME_SKIP.offer);
  checkLine('TIME_SKIP.choice', TIME_SKIP.choice);
  checkBlock('TIME_SKIP.accept', TIME_SKIP.accept);
  checkBlock('TIME_SKIP.decline', TIME_SKIP.decline);
  // the way out (ending ride_away) must be offered exactly when that ending allows it
  const keysChoice = RESTART_KEYS.find((l) => l.choice)?.choice;
  const refuse = keysChoice?.options.find((o) => o.key === 'refuse');
  if (!refuse) err('RESTART_KEYS', "needs a 'refuse' option (ending ride_away)");
  else if (refuse.if?.loopsGte !== ENDINGS.ride_away?.when?.loopsGte) err('RESTART_KEYS', `'refuse' appears at loopsGte ${refuse.if?.loopsGte} but ride_away needs loopsGte ${ENDINGS.ride_away?.when?.loopsGte}`);

  // ---------------------------------------------------------------- loop staging
  for (const [k, table] of Object.entries(LOOP_STAGING || {})) {
    const p = `LOOP_STAGING.${k}`;
    if (!Array.isArray(table) || !table.length) {
      err(p, 'expected [{ minLoop, ... }]');
      continue;
    }
    if (table[0].minLoop !== 0) err(p, 'the first entry is minLoop 0 (the first night)');
    let last = -1;
    for (const r of table) {
      if (!(Number.isInteger(r.minLoop) && r.minLoop > last)) err(p, `minLoop must ascend (${r.minLoop})`);
      last = r.minLoop;
      if (k === 'radio' && r.song && !SONGS[r.song]) err(p, `unknown song ${r.song}`);
      if (k === 'radio' && r.station && !STATIONS.some((s) => s.index === r.station)) err(p, `unknown station ${r.station}`);
    }
  }
  for (const k of ['tally', 'calendar', 'radio', 'dog', 'ahKong']) if (!LOOP_STAGING?.[k]) err('LOOP_STAGING', `missing ${k}`);
  for (const [i, dv] of (DEJA_VU || []).entries()) {
    const p = `DEJA_VU[${i}]`;
    if (!DEJA_VU_TRIGGERS.includes(dv.trigger)) err(p, `trigger ${dv.trigger}`);
    if (!(dv.minLoop >= 1)) err(p, 'minLoop >= 1');
    checkBlock(`${p}.lines`, dv.lines);
  }

  // ---------------------------------------------------------------- endings
  const REQUIRED_ENDINGS = ['dawn', 'endless', 'forgive', 'wrong_home', 'ride_away', 'join_father', 'successor'];
  for (const id of REQUIRED_ENDINGS) if (!ENDINGS[id]) err('ENDINGS', `missing ${id}`);
  const prio = new Set(ENDING_PRIORITY || []);
  for (const id of Object.keys(ENDINGS)) if (!prio.has(id)) err('ENDING_PRIORITY', `missing ${id}`);
  if (prio.size !== (ENDING_PRIORITY || []).length) err('ENDING_PRIORITY', 'duplicates');
  for (const [k, e] of Object.entries(ENDINGS)) {
    const p = `ENDINGS.${k}`;
    if (e.id !== k) err(p, 'id');
    if (!isStr(e.titleTH) || !isStr(e.titleEN)) err(p, 'title');
    if (thaiLen(e.titleTH) > 14) warn(p, `title "${e.titleTH}" is long`);
    if (!ENDING_KINDS.includes(e.kind)) err(p, `kind ${e.kind}`);
    if (!ENDING_MOMENTS.includes(e.moment)) err(p, `moment ${e.moment}`);
    if (!e.when || !Object.keys(e.when).length) err(p, 'when: the data condition is required');
    checkCondObj(`${p}.when`, e.when);
    if (!isStr(e.condition)) err(p, 'condition (designer note) missing');
    if (typeof e.countsAsDeath !== 'boolean') err(p, 'countsAsDeath must be boolean');
    const sceneIds = new Set();
    for (const s of e.scenes || []) {
      if (sceneIds.has(s.id)) err(p, `duplicate scene ${s.id}`);
      sceneIds.add(s.id);
      if (!isStr(s.note)) err(`${p}.scenes.${s.id}`, 'note (staging) missing');
      if (s.if) checkCondObj(`${p}.scenes.${s.id}.if`, s.if);
      checkBlock(`${p}.scenes.${s.id}`, s.lines);
    }
    (e.epilogue || []).forEach((t, i) => {
      checkText(`${p}.epilogue[${i}]`, t);
      if (t.if) checkCondObj(`${p}.epilogue[${i}].if`, t.if);
      if (thaiLen(t.th) > 48) warn(`${p}.epilogue[${i}]`, 'epilogue card is long (one short line)');
    });
    if ((e.epilogue || []).filter((t) => !t.if).length > 2) warn(p, 'more than two epilogue cards');
    (e.creditsExtra || []).forEach((t, i) => checkText(`${p}.creditsExtra[${i}]`, t));
  }
  // reachability: enumerate the flag space the endings read and resolve each moment
  {
    const reached = new Set();
    const V = { somchaiFork: [undefined, 'left', 'right'], gateLookBack: [false, true], finalFork: [undefined, 'left', 'right'], forgave: [false, true], takeOver: [false, true], refusedShift: [false, true], rodeAway: [false, true] };
    const keys = Object.keys(V);
    const rec = (i, flags) => {
      if (i === keys.length) {
        for (const loops of [0, 3]) {
          for (const mem of [[], MEMORY_IDS.slice()]) {
            const ctx = { save: { loops, flags, memories: mem, deaths: [], endingsSeen: [] } };
            for (const m of ENDING_MOMENTS) {
              const e = resolveEnding(m, ctx);
              if (e) reached.add(e.id);
            }
            if (flags.finalFork && !resolveEnding('finalFork', ctx)) err('ENDINGS', `dead end: finalFork=${flags.finalFork} resolves no ending`);
            if (flags.somchaiFork === 'right' && resolveEnding('fork', ctx)?.id !== 'wrong_home') err('ENDINGS', 'somchaiFork right must resolve wrong_home');
            if (flags.gateLookBack && resolveEnding('gate', ctx)?.id !== 'endless') err('ENDINGS', 'gateLookBack must resolve endless');
          }
        }
        return;
      }
      for (const v of V[keys[i]]) rec(i + 1, v === undefined ? flags : { ...flags, [keys[i]]: v });
    };
    rec(0, {});
    for (const id of Object.keys(ENDINGS)) if (!reached.has(id)) err('ENDINGS', `${id} is unreachable through resolveEnding()`);
    stats.endings = [...reached];
  }

  // flags read by conditions must be set somewhere in the data (or by gameplay)
  for (const { flag, path } of flagsRead) {
    if (!flagsSet.has(flag) && !(flag in (GAMEPLAY_FLAGS || {}))) err(path, `reads flag "${flag}", which nothing sets (data or GAMEPLAY_FLAGS)`);
  }
  stats.flagsSet = flagsSet.size;

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
  // cross-file radio consistency: memory m_song, the father's broadcast and Ah Kong's cameo must agree
  // on the station NUMBER (1..4 = src/audio/Radio.js) and the hours.
  const songMem = MEMORIES.find((m) => m.id === 'm_song');
  const fatherSt = STATIONS.find((s) => (s.schedule || []).some((sch) => (sch.songs || []).includes(FATHER_SONG) && songMem && inHours(sch.hours, songMem.requires?.hours?.[0])));
  if (!fatherSt) err('STATIONS', `no station schedules ${FATHER_SONG} during m_song hours`);
  else if (songMem?.requires?.station !== fatherSt.index) err('MEMORIES.m_song', `requires.station ${songMem?.requires?.station} but ${FATHER_SONG} plays on station ${fatherSt.index}`);
  if (!STATIONS.some((s) => s.index === RADIO_CAMEO.station)) err('RADIO_CAMEO', `station ${RADIO_CAMEO.station} does not exist`);
  checkHours('RADIO_CAMEO.hours', RADIO_CAMEO.hours);
  for (const b of SPECIAL_BROADCASTS) {
    if (!stationIds.has(b.station)) err(`SPECIAL_BROADCASTS.${b.id}`, 'station');
    if (b.then && !SONGS[b.then]) err(`SPECIAL_BROADCASTS.${b.id}`, 'then song');
    if (b.memory && !memIds.has(b.memory)) err(`SPECIAL_BROADCASTS.${b.id}`, 'memory');
    checkLines(`SPECIAL_BROADCASTS.${b.id}`, b.lines);
  }
  const req = SPECIAL_BROADCASTS.find((b) => b.id === 'fatherRequest');
  if (!req || !req.lines.some((l) => /ต้น/.test(l.th))) err('SPECIAL_BROADCASTS.fatherRequest', 'must say "ต้น" (it is rule r15\'s exception)');

  // ---------------------------------------------------------------- world text
  for (let h = 21; h <= 30; h++) if (!CHAPTERS.find((c) => c.hour === h)) err('CHAPTERS', `missing hour ${h}`);
  CHAPTERS.forEach((c) => {
    checkText(`CHAPTERS.${c.hour}`, c);
    if (HOUR_WORDS && c.word !== HOUR_WORDS[c.hour]?.th) err(`CHAPTERS.${c.hour}`, `word "${c.word}" should be HOUR_WORDS[${c.hour}].th`);
    if (thaiLen(c.th) > 16) warn(`CHAPTERS.${c.hour}`, `title "${c.th}" is long (2–4 words)`);
  });
  for (const [k, c] of Object.entries(DEATH_CARDS)) {
    checkText(`DEATH_CARDS.${k}`, c);
    if (c.rule && !ruleIds.has(c.rule)) err(`DEATH_CARDS.${k}`, 'rule');
    if (thaiLen(c.th) > 26) warn(`DEATH_CARDS.${k}`, `"${c.th}" is long (one short line)`);
  }
  if (DEATH_FOOTER) checkText('DEATH_FOOTER', DEATH_FOOTER);
  LOADING_LINES.forEach((l, i) => checkText(`LOADING_LINES[${i}]`, l));
  for (const [k, s] of Object.entries(SIGNS)) (Array.isArray(s) ? s : [s]).forEach((x, i) => checkText(`SIGNS.${k}[${i}]`, x));
  for (const p of POSTERS) if (!Array.isArray(p.th) || p.th.length !== p.en.length) err(`POSTERS.${p.variant}`, 'th/en line count mismatch');
  for (const p of POSTERS) for (const w of p.where || []) if (!landmarks[w]) err(`POSTERS.${p.variant}`, `unknown landmark ${w}`);
  for (const it of NOODLE_MENU.items) {
    checkText('NOODLE_MENU', it);
    if (typeof it.price !== 'number') err('NOODLE_MENU', `price for ${it.en}`);
  }

  // ---------------------------------------------------------------- credits
  const creditsText = JSON.stringify(CREDITS) + JSON.stringify(CREDITS_HEADLINE);
  for (const must of ['Made by Pukking Dragon', 'Game by', 'three.js', 'MIT', 'Srisakdi', 'SIL Open Font License 1.1', 'procedurally generated']) {
    if (!creditsText.includes(must)) err('CREDITS', `missing "${must}"`);
  }

  // ---------------------------------------------------------------- generic deep {th,en} pairing
  const walk = (o, path, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 14) return;
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
  stats.choiceIds = choiceIds.size;
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
