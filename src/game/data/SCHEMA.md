# Narrative data — schema (`src/game/data/`)

Plain ES modules, named exports, no imports except between data files. Import everything
from the barrel: `import { PASSENGERS, RULES, ENCOUNTERS } from '../game/data/index.js'`.
Validate after every edit:

```
node -e "import('./src/sandbox/narrative-validate.js').then(m=>m.runNode())"
node tools/shot.mjs --sandbox=narrative --out=.shots/narrative.png --frames=1 --size=1280x720
#   views: --params="view=ride&id=<passengerId>" | view=tutorial | encounters | world | radio | endings
node tools/shot.mjs --sandbox=narrative-cast --out=.shots/narrative-cast.png --frames=2
#   the CHARACTERS appearance specs rendered through createHumanoid (&ids=a,b &cam=close &legacy=1)
```

## Thai first, almost no text

The game shows **Thai only** by default (`settings.language = 'th'`); every `en` stays in the data for
translators, debugging and `language: 'both'`. Write every line so it works in Thai alone. Information
comes through the world and the voices, not through text:
* Ton's thoughts (`tone:'thought'`, subtitle only, never voiced) are rare: ≤ 3 per ride (validator).
* Ton speaks through **replies** (see below), not scripted lines.
* Chapter cards: the hour (`word` + digits) plus an optional 2–4-word title shown only on the first night.
* Death cards: one short line. Tutorial hints: 1–3 words + keys (`hint: null` when Ah Kong's voice is enough).
* Epilogue cards: one or two short lines.

Hours are **game hours 21..30** (`24` = 00:00, `29` = 05:00, `30` = 06:00), the same scale as
`saves.data.hour` and `sky.setHour()`. Ranges are `[from, to)`.

| file | exports |
|---|---|
| `characters.js` | `CHARACTERS`, `PASSENGER_CHARACTER_IDS`, `speakerName(who, passengerCharacterId)` |
| `rules.js` | `RULES` (r1–r16), `RULE_PARAMS`, `RULE_BREAKS`, `HIDDEN_LINE`, `PAPER`, `PENCIL_NOTES`, `RULE_IDS`, `getRule(id)` |
| `passengers.js` (+ `rides/r1..r9_*.js`) | `PASSENGERS`, `PASSENGER_BY_ID`, `getPassenger(id)`, `DIALOGUE_EVENTS`, `DIALOGUE_EVENT_PARAMS`, `WRONG_FORK_DEATHS` |
| `encounters.js` | `ENCOUNTERS`, `ENCOUNTER_IDS`, `ENCOUNTER_DEATHS`, `ENCOUNTER_ESCALATIONS` |
| `memories.js` | `MEMORIES`, `MEMORY_IDS`, `MEMORY_COUNT`, `hasAllMemories(ids)` |
| `endings.js` | `ENDINGS`, `ENDING_PRIORITY`, `ENDING_IDS` |
| `ahkong.js` | `INTRO_BIKE`, `INTRO_GARAGE`, `TUTORIAL_STEPS`, `SEND_OFF`, `GARAGE_IDLE`, `RESTART_LINES`, `DEATH_HINTS`, `TIME_SKIP`, `RESTART_KEYS`, `REFUSE_RETURN`, `RADIO_CAMEO`, `SHRINE_REVEAL`, `AH_KONG` |
| `loop.js` | `LOOP_STAGING`, `DEJA_VU` (what the garage looks like on each loop) |
| `logic.js` | `checkCond`, `resolveLines`, `dialogueBlock`, `beatAllowed`, `resolveEnding`, `endingFor`, `byLoop`, `trustOf`, `kindness`, `clearNightFlags`, `FLAG`, `COND_KEYS`, `GAMEPLAY_FLAGS`, `RULE_BREAK_FLAG`, `LURE_FLAG` |
| `radio.js` | `STATIONS`, `STATION_BY_ID`, `SONGS`, `FATHER_SONG`, `DJ_LINES`, `LATE_NIGHT_WHISPERS`, `SPECIAL_BROADCASTS` |
| `worldtext.js` | `GAME_TITLE`, `PHONE_MESSAGE`, `HOUR_WORDS`, `CHAPTERS`, `CHAPTER_TITLE_MAX_LOOP`, `DEATH_CARDS`, `DEATH_FOOTER`, `SIGNS`, `SHOP_SIGNS`, `POSTERS`, `NOODLE_MENU`, `GARAGE_CALENDAR`, `TAXI_TEXT`, `PAPER_TITLE`, `LOADING_LINES`, `MENU_TEXT` |
| `credits.js` | `CREDITS_HEADLINE`, `CREDITS`, `CREDITS_CLOSING` |
| `lines.js` | `P Y T S C O SIL tr` line constructors (authoring helpers) |

## Line

```js
{ who, th, en, tone?, emotion?, action?, pause?, set?, choice?, if?, speakerTH?, speakerEN? }
```

* `who`: `'passenger'` (the current ride's character) · `'player'` (Ton) · any `CHARACTERS` key
  (`'ahKong'`, `'somchai'`, `'auntieLek'`, `'monk'`, `'boyM'`, `'djNok'`, `'radio'`, `'voice'`, `'extraChild'`,
  `'mMother'` …). Subtitle speaker label: `speakerName(who, ride.characterId)`; `speakerTH/EN` override it
  (radio hosts, the alms monks at dawn). The stock `Dialogue.js` labels lines from `setSpeaker(who)` only,
  so the runner (or a `dialogue:line` listener) must honour the override.
* `th` / `en`: always both. Thai ≤ ~14 words. A reply line (`choice`) has `th:'' en:''` (no prompt: the
  stock runner then shows no subtitle) unless it carries an explicit prompt.
* `tone`: `normal | whisper | ghost | shout | thought | sing`. `thought` = Ton's inner voice
  (subtitle in italics, no TTS). `ghost` = processed voice.
* `emotion`: `smile | sad | fear | anger | creepy | surprise` → `humanoid.setExpression`.
* `action`: humanoid action name (`hail wave wai smoke giveItem pay laugh point pray sing sleep
  stagger enterCar exitCar neckSnap reachOut nod …`, see `src/characters/index.js` `play()`).
* `pause`: extra seconds after the line (default gap `DIALOGUE_EVENT_PARAMS.lineGapSeconds`).
* `set`: `{ flag: value }` written into `saves.data.flags` when the line plays (`Object.assign`, see "Flags").
* `if`: a Condition (below). The line is dropped by `logic.resolveLines` when it fails.
* `choice`: a reply moment (below).

## Replies (Ton answers)

Ton is guarded and tired, back from Bangkok, but he answers. Every ride has **3–6 reply moments**
(validator), Ah Kong's garage and restarts have them too. A reply line:

```js
{ who:'player', tone:'thought', th:'', en:'', if?,
  choice: { id, options:[{ key, th, en, if? }], defaultKey, timeout?, branches:{ key:[Line] }, setOnPick?:{ key:{flag:value} } } }
```

* Author with `C(options, { id, timeout, branches, setOnPick, if })`, `O(key, th, en, { if })`, `SIL()`
  (`lines.js`). Options are **2–3 short colloquial Thai replies (2–7 words)**; `ui.choice` shows ≤ 4.
* **Silence is a choice.** `SIL()` = `{ key:'silent', th:'…' }` is always the LAST option and the
  `defaultKey`, so a timeout means Ton said nothing (rule r7's name call, r16's mirror, a grieving father).
* `branches[key]` play right after the pick: the passenger answers what Ton said. `setOnPick[key]` is baked
  into that branch's first line as `set` (so the stock runner applies it); an option with `setOnPick` must
  have a non-empty branch. Every choice `id` is unique across all data (`Dialogue.play()` returns
  `choices[id] = key`).
* **Conditional options** (`O(..., { if })`) exist only when their condition holds: replies that appear
  after you have died to that passenger (`if:{ diedOn:'womanWhite' }`), once you have a memory
  (`if:{ memories:['m_photo'] }`), from a loop count (`if:{ loopsGte:3 }`), or when the night's kindness
  allows (`if:{ kindnessGte:4 }`). A whole reply moment can be conditional too (`C(..., { if })`).
  The silent option and the `defaultKey` are never conditional.
* Gameplay should voice the picked option in Ton's voice (no subtitle; `…` is not spoken).
* What replies do (all through `set` flags, see "Flags"): change the next lines (branches), raise or lower
  trust, expose clues (`clue.*`), persist knowledge (`k.*`), lure a forbidden look (`lure`), or **break a
  rule by speaking** (`ruleBreak`). Somchai's replies decide the ending (see "Endings").

## Flags (`saves.data.flags`)

`Dialogue.js` applies `line.set` with `Object.assign(save.flags, set)`; every convention below works with it.

| key | value | meaning |
|---|---|---|
| `trust.<passengerId>.<tag>` | integer −3..3 | one reply's effect on that passenger's trust. A passenger's trust = the **sum** (`logic.trustOf(flags, id)`); each reply writes its own tag, so replaying a beat never double-counts. `logic.kindness(flags)` = passengers with trust ≥ 1. Read by `if.trustGte / trustLt / kindnessGte`. |
| `clue.<passengerId>.<tag>` | `true` | a clue the player exposed by asking the right question (the closed hospital, "1983", "third grade for years", the cart…). Gameplay may add a pencil note. |
| `k.<name>` | any | **persistent knowledge**: survives the loop. Example: `k.promisedNuan` (never promise a ghost: she remembers on every later night). |
| `ruleBreak` | rule id (`r7 r11 r14 r15 r16`) | **one-shot**: the reply broke a rule by speaking ("ครับ?" to a voice, asking who the extra child is, answering the 444 count, inviting the knocker, answering the radio). See `RULE_BREAKS`. |
| `lure` | `'r3'` \| `'r4'` | **one-shot**: the reply invited a forbidden look ("ตรงไหนครับ?" to the woman in white, "อยากเห็นครับ" to Nuan, "พ่อ... อย่าเพิ่งไป" at the gate). The camera drifts toward the face / the back seat for `RULE_PARAMS.lureSeconds` at `lureYawDegPerSec`; any deliberate look input cancels it. Failing still goes through the normal r3/r4 checks. |
| story flags | camelCase | e.g. `boughtJasmine`, `promisedM`, `buaKnowsTon`, `confidedInMonk`, `trapDefused`, `piakAsleep`, `piakSinging`, `softWithDad`, `takeOver`, `forgave`, `saidBye`, `refusedShift`, `hasKeys`… |
| gameplay flags | see `logic.GAMEPLAY_FLAGS` | set by gameplay, read by conditions: `somchaiFork`, `gateLookBack`, `fatherSawFace`, `fatherDelivered`, `finalFork`, `rodeAway`, `bloodOnGlass`. |

**Night-scoped.** On every restart gameplay calls `logic.clearNightFlags(save.flags)`: everything except
`k.*` is cleared. The validator checks that every flag a condition reads is set somewhere in the data or
listed in `GAMEPLAY_FLAGS`.

**Rule breaks** (`rules.js` `RULE_BREAKS`): gameplay listens to bus `'dialogue:line'`; when
`line.set.ruleBreak` appears it lets the rest of that branch play (it is the thing's answer), then applies
`RULE_BREAKS[id]` and deletes `flags.ruleBreak`:
`r7 → outcome 'answer', death nameCall` · `r11 → 'answer', death count444` ·
`r14 → 'invite', escalate windowCreep (the window winds itself down; crank it up within
RULE_PARAMS.windowCreepCrankSeconds or death windowArm)` · `r15 → 'answer', escalate backSeatVoice (the voice
moves to the back seat: "ต้น… หันมาสิ", a rule-3 test)` · `r16 → 'asked', death extraPassenger`.
`outcome` is the key to play on the rule's running encounter.

## Conditions (`if`, `when`)

One shape everywhere (beats, lines, options, reply moments, ending `when`, ending scenes and epilogue
cards, encounter `chains`). Every key must hold; a missing flag counts as `false`.

```js
{ flag:{ name:value }, taxi:{ key:value } /* ride beats only */, memories:[ids], allMemories:bool, memoriesGte:n,
  loopsGte:n, loopsLt:n, diedOn:pid | [pids], trustGte:{ pid:n }, trustLt:{ pid:n }, kindnessGte:n,
  hourGte:h, hourLt:h, endingSeen:id | [ids], not:Condition, any:[Condition] }
```

`loops` = `saves.data.loops` (deaths so far); `diedOn` reads `saves.data.deaths[].rideId`.
`logic.checkCond(cond, { save, taxi?, hour? })` evaluates it. **Conditions are evaluated once, when a block
starts** (`resolveLines` runs before `dialogue.play`): never gate a line on a flag set by an earlier line of
the same block (the validator rejects it).

**Gameplay must resolve every block before playing it:** `logic.dialogueBlock(ride, 'greet', ctx)` for the
ride blocks (applies `loopVariants`), `logic.resolveLines(beat.lines, ctx)` for beats, finale, Ah Kong,
restarts and ending scenes (`logic.endingFor(id, ctx)` filters scenes and epilogue cards). The stock
`Dialogue.js` would otherwise show every conditional option.

## Loop (dying = the same night again)

* `saves.data.loops` counts deaths; the night restarts at 21:00 in the garage. Night flags are cleared,
  `k.*`, memories, deaths and pencil notes stay.
* **Passengers half-remember** (two shapes, both resolved by `logic`):
  * `dialogue.loopVariants = { <block>: { <minLoop>: [Line] } }` — the highest `minLoop <= loops` replaces
    the whole block (`hail`, `greet`, `destination`, `arriveCorrect`, `arriveWrong`, `idle`, `onLookBack`,
    `onFaceGaze`, `onFaceGazeWarn`). Used for 1 and 3 ("เคยเจอกันที่ไหนนะ", then they feel the loop).
  * line-level `if:{ loopsGte:1, loopsLt:3 }` / `if:{ loopsGte:3 }` inside a block that also holds a reply.
  * **Extra replies after dying to them**: options with `if:{ diedOn:'<pid>' }` let the player use what
    they learned (promise Sri "right", stop the woman in white's trap, keep Piak singing through the knocks,
    tell M his home is on the left, tell Nuan you know what she is, apologise to the monk for the wrong turn,
    tell Somchai his home is on the left now).
* **Garage restarts** (`ahkong.js`): `RESTART_LINES` by loop with Ton's replies → `DEATH_HINTS[lastDeath]`
  (one line) → `TIME_SKIP` (loops ≥ 2) → `RESTART_KEYS` (from loops ≥ 3 Ton may refuse → ending
  `ride_away`) → `SEND_OFF`. Pick with `logic.byLoop(RESTART_LINES, loops)` (heard already + `variants` →
  random variant).
* **Physical changes** (`loop.js` `LOOP_STAGING`, each a `[{ minLoop, ... }]` table, `byLoop`): a new key
  scratch on the dashboard per death (`tally`; from loop 6 ninety-nine older marks appear beneath),
  the calendar (pencil ticks per night, then the 15th circled, then every day), the garage radio already
  playing `countryTears` from the same line, (no dog: removed by the owner),
  Ah Kong's half-smoked cigarette with the same ash, the tea from loop 4, the gecko's seven calls.
  `DEJA_VU` holds at most one short Ton thought per restart (`trigger`: `seeTally garageRadio calendar enterTaxi`).

## Passenger (ride)

```js
{ id, order 1..9, hour 21..29, pickup <LAYOUT.landmarks key == LAYOUT.pickups[order-1]>,
  characterId, identity 'human'|'ghost', fork 'left'|'right' (ghost ⇔ left),
  seat 'rearLeft'|'rearRight'|'frontPassenger', destination {th,en},
  clues: { reflection 'normal'|'none'|'only'|'twisted'|'delayed', shadow bool, breathFog bool, weightKg,
           meter 'normal'|'glitch'|'backward'|'oldDate', radioStatic 0..1, blinks bool, feetFloat bool,
           payment { type 'coins'|'banknote'|'old_banknote'|'ghost_money'|'leaves'|'none', amountTHB, note{th,en} },
           smell, extra[] (designer notes) },
  specialRules: [{ rule, at?, phase?, lookBack?: 'warn'|'death'|'sad'|'ending:<id>', exception?, setOnLookBack?, note }],
                // exception: names a rule's designed exception staged in this ride (monk + 444, betel, elephants…)
  encounters: [{ id <ENCOUNTERS key>, at 0..1 (ride progress), optional? }],
  deathOnWrong: 'giantHand'|'trueForm'|'roadFold'|'windowAttack'|'dragBack'|'home',
  wrongAftermath?: encounter id played before the wrong-fork death (ride 4: 'reflectionStays'),
  memoryHooks: [memory ids the ride references], gives?: {item, flag},
  pacing: { cruiseKmh, minSeconds, stretch: 'none'|'fog'|'mist', speedCapKmh? },
  dialogue: { hail, greet, destination, beats, arriveCorrect, arriveWrong, idle, onLookBack, onFaceGaze, onFaceGazeWarn?,
              loopVariants?: { <block>: { <minLoop>: [Line] } } },
  finale?: { stepOut, gateReply (reply line), forgive, walkAway, endless, lastFork }   // Somchai only
}
```

**Ride progress** = `min(distance since pickup ÷ route length, seconds since seated ÷ pacing.minSeconds)`
(0 → 1; route = pickup `stopPos` → fork `decisionS`).

**Pacing.** Pickups move toward the fork as the night goes on, so later routes are short
(sala1 ≈ 2.8 km … fatherLamp ≈ 0.46 km) while the late rides carry the most important talk.
`pacing.minSeconds` is how long the ride must last; `cruiseKmh` is the speed the scene is written
for; `speedCapKmh` (rides 8–9) is a soft throttle cap (an old woman aboard / dawn mist). When
the taxi would reach `forkApproach` before `minSeconds` (or before every `essential:true` beat has
played), `stretch` tells gameplay how the road lengthens: `'fog'` (from midnight on: the shrine fog
thickens and the approach quietly loops, the same fold as rule 1) or `'mist'` (dawn rides: glowing
mist, the last stretch folds back). `'none'` = the route is long enough. The narrative validator
simulates every ride at its slowest legal pace and warns when beats overlap (it uses the same
line-duration estimate as `Dialogue.js`). `hail` plays as the taxi approaches; `greet` once seated (door shut);
`destination` after `greet` (meter reminder via the `meterOffTooLong` event); `idle` lines fill
silences every `DIALOGUE_EVENT_PARAMS.idleGapSeconds`; `arriveCorrect` / `arriveWrong` after the
fork resolves (wrong → then `deathOnWrong` cinematic → `WORLD_TEXT.DEATH_CARDS[type]`).
`onLookBack` when rule 3's look-back fires (consequence from `specialRules[r3].lookBack`);
`onFaceGazeWarn` at `RULE_PARAMS.faceGazeWarnSeconds`, `onFaceGaze` at the attack.

### Beat

```js
{ id (unique in the ride), trigger, lines:[Line], once?=true, essential?, if?, set?, effects? }
```

* `trigger`:
  * `{ type:'progress', at: 0..1 }`  (`meter444` is also a `DIALOGUE_EVENTS` event: the meter rolled to ๔๔๔)
  * `{ type:'time', seconds }` since the passenger sat down
  * `{ type:'after', beat:<beat id>, seconds }` after another beat finished
  * `{ type:'event', event }` — `DIALOGUE_EVENTS` (`radioOn radioOff radioTune radioIgnored lookBack
    faceGaze faceGazeWarn cabinLightOn cabinLightOff cabinLightDies windowOpen windowClose wipersOn stopped
    speeding collision meterOn meterOffTooLong meterGlitch honkShrine amulet knock1 knock3 breathPassed
    nameCallAnswered nameCallIgnored yaiSpeed elephants forkApproach gateReached`) or
    `encounter:<id>` (encounter started) / `encounterEnd:<id>`.
* `if`: a Condition (see "Conditions"; `taxi` only here). E.g. `memories` = every listed id is in
  `saves.data.memories` (Somchai answers what the player found: helmet, noodles, letter).
* `essential: true`: story-critical; the fork must not be reached before it has played (see Pacing).
* `set`: flags set when the beat starts. `effects`: `[{type:'rule', id, arm:true} | {type:'taxi', control, value}
  | {type:'item', id, to} | {type:'encounter', id} | {type:'sfx', id} | {type:'flag', name, value}]`.
* Event beats may fire whenever their event happens during the ride (once by default). If two
  beats are due, progress/time beats queue; event beats interrupt idle lines only.

## Encounter

See the header of `encounters.js`. `where`: `'any'`, `'freeDrive'`, `'nearLandmark:<key>'`,
`'ride:<passengerId>'`, `'ride:anyGhost'` (string or array; any match). `gazeMode`: `notLooking |
mirrorOnly | sideWindow | any`. `outcomes[key].result`: `'safe' | 'death:<DEATH_CARDS key>' |
'ending:<ENDINGS key>' | 'scare:<name>' | 'escalate:<windowCreep|backSeatVoice>'`. Ride-scheduled encounters
ignore `chance`/`cooldown`/`requires` (they make `requires` true themselves: r15 clicks the radio on).
Extra fields: `exception:true` (a rule's designed exception: never kills), `requires` (free-drive gates),
`chains:[{ id, atSecond, if }]` (444 → window knock after midnight), `broadcast` (a `SPECIAL_BROADCASTS` id),
`countLines` (meter444: the counting voice, once stopped).

**Order and who owns the reply:** the encounter's own `lines` play first; then the ride's beat on
`'encounter:<id>'` (if any); then the encounter's `choice` — **unless that ride beat contains a reply
moment**, in which case the beat owns the talking (its options set `flags.ruleBreak`) and the encounter
only stages, whispers and resolves outcomes. A silent encounter option may have no outcome (the rule's
own check decides, e.g. retune in time).

**Back of the paper (r11–r16)** — one staged instance each, plus the exceptions:

| rule | encounter | ride (guaranteed) | the temptation | exception (ride) |
|---|---|---|---|---|
| r11 ๔๔๔ | `meter444` | 5 Nuan (01:00) | the voice asks "นับถึงไหนแล้ว" (answer = death) | `meter444` with the monk aboard (6): nothing counts |
| r12 road figure | `roadFigure` | 1 Sri (21:00) | Sri screams "เบรก!" | elephants (8): stop and wait |
| r13 blood | `bloodDrip` | 2 woman in white (22:00) | she asks you to use the wipers in the rain | `betelSpit` Saman (7): only betel |
| r14 window | `windowKnock` | 5 Nuan, chained from the 444 stop | "มีไฟแช็กไหม" — "แป๊บนึงครับ" invites it | monk's holy water (6) |
| r15 radio name | `radioName` | 3 Piak (23:00) | Piak: "ดีเจเรียกชื่อใครวะ" — "ครับ?" | `fatherDedication` (7, 03:00 station 3): listen to the end |
| r16 extra in mirror | `extraPassenger` | 4 Boy M (00:00) | M asks who the girl beside him is | — |

## Tutorial step (`ahkong.js`)

`{ id, th, en, lines:[Line] | {auto,manual}, hint:{th,en,keys} | {auto,manual} | null, waitFor | {auto,manual}, after?, memory? }`
— hints are 1–3 Thai words + key caps; `null` when Ah Kong's voice says enough.
— `waitFor` types: `interact {id}`, `enterVehicle`, `control {control, value | valueNot | min}`,
`control … path` (read `value[path]`), `drive {meters}`, `speedKmh {min?,max?}`, `stop`, `steer {amount}`, `look {target, seconds}`
(`taxi.getGazeTarget()` ids), `hold {item, seconds}`, `paper {seconds}`. `{auto, manual}` variants
follow `settings.get('transmission')`. Key labels in `hint.keys` are validated against `KEY_BINDINGS`.

Interact / control ids the tutorial and memories expect from **vehicle** (matching `src/vehicle/TaxiControls.js`):
`taxi.door.fr.out` (driver door from outside, RHD), `taxi.sunVisor`, `taxi.glovebox`, and **`taxi.sticker` (not yet
registered by vehicle: needs a dashboard-sticker interactable)**; `taxi:control` names `key ignition headlights
handbrake gear ('D' / '1') indicator wipers cabinLight radio meter window ({window, amount})`. The amulet memory
listens to `amulet:hold`.
From **world/props**: `world.memorialHelmet` (accident curve), `world.noodleCounter` (Auntie Lek).

## Other modules

* `MEMORIES[i]`: `{ id, order, titleTH, titleEN, where{landmark|taxi, hours?}, how{th,en}, interactId,
  requires?{hours, station, onFoot, stage}, text:[{th,en}], pencil{th,en}, speaker? }`.
* `ENDINGS[id]`: `{ id, kind, titleTH, titleEN, moment, when, condition, countsAsDeath, music,
  scenes:[{id, note, lines, if?}], epilogue:[{th,en,if?}], creditsExtra:[{th,en}], unlocks }` — see "Endings".
* `STATIONS[i].schedule[]`: `{ hours, songs:[id] | talk }`; `SONGS[id].lyrics:[{th,en}]`;
  `SPECIAL_BROADCASTS[]`: `{ id, station, hours, lines, then?: songId, memory?, ending? }`.
* `CHAPTERS[i]`: `{ hour, time, word, th, en }` → `ui.chapter({ time, word, th })`; `th` is the 2–4-word title,
  shown only while `loops <= CHAPTER_TITLE_MAX_LOOP` (later nights: just the hour). `DEATH_CARDS[type]`:
  `{ th, en, rule }` (one short line) → `ui.deathCard()` with `DEATH_FOOTER` ("สามทุ่ม… อีกครั้ง"); every
  `deathOnWrong`, `ENCOUNTER_DEATHS` and `DEATH_HINTS` key has a card.
* Restart order: `RESTART_LINES` (`byLoop`; heard already + `variants` → a random variant) →
  `DEATH_HINTS[lastDeathType]` → `TIME_SKIP` (if `loops ≥ TIME_SKIP.minDeaths` and the last death was after
  21:00) → `RESTART_KEYS` → `SEND_OFF`. Refusing the keys sets `refusedShift`; getting into the taxi anyway
  plays `REFUSE_RETURN`.

## Endings

`logic.resolveEnding(moment, { save })` returns the first ending in `ENDING_PRIORITY` whose `moment`
matches and whose `when` holds. Moments (gameplay sets the flag, then asks):

| moment | when gameplay asks | flag it sets first |
|---|---|---|
| `fork` | ride 9's fork resolved | `somchaiFork`: `'left'` / `'right'` |
| `gate` | the mist-gate look-back test ended | `gateLookBack: true` on look-back (specialRules gate `setOnLookBack`); else `fatherDelivered: true` |
| `finalFork` | after the gate the **empty** taxi drives on in the dawn mist; the road folds back to the shrine fork one last time (`finale.lastFork` plays: Ah Kong on the radio, "ลื้อจะกลับบ้านทางไหน") | `finalFork`: `'left'` / `'right'` |
| `garage` | the shift was refused and the motorbike reached `spurStart` | `rodeAway: true` |

| priority | id | kind | moment | `when` (exact) |
|---|---|---|---|---|
| 1 | `wrong_home` บ้าน | sad, counts as death | fork | `{ flag:{ somchaiFork:'right' } }` |
| 2 | `endless` กะดึกนิรันดร์ | bad | gate | `{ flag:{ gateLookBack:true } }` |
| 3 | `join_father` ตามพ่อไป | dark | finalFork | `{ flag:{ finalFork:'left' } }` |
| 4 | `forgive` ขอโทษครับพ่อ | true | finalFork | `{ flag:{ forgave:true, finalFork:'right' }, allMemories:true }` |
| 5 | `successor` รับกะ | hopeful | finalFork | `{ flag:{ takeOver:true, finalFork:'right' } }` |
| 6 | `dawn` รุ่งสาง | good | finalFork | `{ flag:{ finalFork:'right' } }` |
| 7 | `ride_away` ทางออก | bittersweet | garage | `{ loopsGte:3, flag:{ refusedShift:true, rodeAway:true } }` |

Where the flags come from: `forgave` ← gate reply "ขอโทษครับพ่อ" (`somchai_gate`, only offered with all 7
memories); `takeOver` ← "ผมจะขับต่อครับ" (`somchai_drive`, only offered when `kindness ≥ 4`: four
passengers trust Ton tonight); `refusedShift` ← "ผมไม่ขับแล้วครับ" (`restart_keys`, only from `loops ≥ 3`).
`forgive` + `takeOver` plays the forgiveness ending with the `nextShift` coda scene. The gate reply
"พ่อ... อย่าเพิ่งไป" sets `lure:'r3'` (his voice right behind you: the hardest moment not to look back).
Scenes and epilogue cards may carry `if` (Boy M's mother at the bus stop when `promisedM`; the man under
the last streetlight in `ride_away` once you have met your father) — use `logic.endingFor(id, ctx)`.

## Radio numbering (shared with `src/audio/Radio.js`)

`STATIONS[i].index` is the audio station number: **1** ลูกทุ่งยามดึก FM 91.5 (DJ Nok) · **2**
เพลงเก่าเล่าความหลัง FM 97.25 (Khru Uean) · **3** the lost frequency FM 103.3 (static and whispers;
03:00–04:00 only "ทางกลับบ้าน", memory `m_song`; 04:00–05:00 Ah Kong's `RADIO_CAMEO`) · **4**
ธรรมะยามดึก AM 1080 (the monk asks for it at 02:00). `MEMORIES.m_song.requires.station` and
`RADIO_CAMEO.station` use these numbers (the validator cross-checks them).

## Story canon (keep every file consistent)

* Ton's mother died years before the story (her amulet hangs from the mirror; the rule-7 voice
  borrows *her* voice; the childhood house is empty; her ashes are at the village temple).
* Ton and Somchai fought because Somchai wanted Ton to take over the taxi. Somchai said "if you
  go, don't come back". Ton never came back, not even for the funeral.
* Somchai died before dawn one rainy-season morning on the KM 10 curve (โค้งร้อยศพ), riding his
  **motorbike** to buy a fresh garland for the mirror. The taxi survived; the helmet is at the
  memorial. Its tally board reads ~~99~~ 100.
* The woman in white crashed on the same curve as a pillion passenger 20 years ago; the
  ambulance took her boyfriend and nobody came for her.
* Boy M was hit by a truck that never stopped, at the KM 11 bus stop. His mother still waits
  with dinner and put up a witness appeal.
* Ah Kong is the guardian spirit of Ma Ruay Shrine. He never gives a name and never says so.
* Chapter cards evoke the hour and never reveal what a passenger is.
* Somchai drove this night shift for Ah Kong for ten years before he died; the red ink on the back of the
  paper (r11–r16) is his, "for whoever drives next". Ah Kong almost slips once ("อั๊วต้องเฝ้าศาล... เอ๊ย เฝ้าอู่").
* Boy M's mother still waits at the KM 11 bus stop (`CHARACTERS.mMother`).
