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

Hours are **game hours 21..30** (`24` = 00:00, `29` = 05:00, `30` = 06:00), the same scale as
`saves.data.hour` and `sky.setHour()`. Ranges are `[from, to)`.

| file | exports |
|---|---|
| `characters.js` | `CHARACTERS`, `PASSENGER_CHARACTER_IDS`, `speakerName(who, passengerCharacterId)` |
| `rules.js` | `RULES`, `RULE_PARAMS`, `HIDDEN_LINE`, `PAPER`, `PENCIL_NOTES`, `RULE_IDS`, `getRule(id)` |
| `passengers.js` (+ `rides/r1..r9_*.js`) | `PASSENGERS`, `PASSENGER_BY_ID`, `getPassenger(id)`, `DIALOGUE_EVENTS`, `DIALOGUE_EVENT_PARAMS`, `WRONG_FORK_DEATHS` |
| `encounters.js` | `ENCOUNTERS`, `ENCOUNTER_IDS`, `ENCOUNTER_DEATHS` |
| `memories.js` | `MEMORIES`, `MEMORY_IDS`, `MEMORY_COUNT`, `hasAllMemories(ids)` |
| `endings.js` | `ENDINGS`, `ENDING_IDS` |
| `ahkong.js` | `INTRO_BIKE`, `INTRO_GARAGE`, `TUTORIAL_STEPS`, `SEND_OFF`, `GARAGE_IDLE`, `RESTART_LINES`, `DEATH_HINTS`, `TIME_SKIP`, `RADIO_CAMEO`, `SHRINE_REVEAL`, `AH_KONG` |
| `radio.js` | `STATIONS`, `STATION_BY_ID`, `SONGS`, `FATHER_SONG`, `DJ_LINES`, `LATE_NIGHT_WHISPERS`, `SPECIAL_BROADCASTS` |
| `worldtext.js` | `GAME_TITLE`, `PHONE_MESSAGE`, `HOUR_WORDS`, `CHAPTERS`, `DEATH_CARDS`, `DEATH_FOOTER`, `SIGNS`, `SHOP_SIGNS`, `POSTERS`, `NOODLE_MENU`, `GARAGE_CALENDAR`, `TAXI_TEXT`, `PAPER_TITLE`, `LOADING_LINES`, `MENU_TEXT` |
| `credits.js` | `CREDITS_HEADLINE`, `CREDITS`, `CREDITS_CLOSING` |
| `lines.js` | `P Y T S C` line constructors (authoring helpers) |

## Line

```js
{ who, th, en, tone?, emotion?, action?, pause?, set?, choice?, speakerTH?, speakerEN? }
```

* `who`: `'passenger'` (the current ride's character) · `'player'` (Ton) · any `CHARACTERS` key
  (`'ahKong'`, `'somchai'`, `'auntieLek'`, `'monk'`, `'boyM'`, `'djNok'`, `'radio'`, `'voice'` …).
  Subtitle speaker label: `speakerName(who, ride.characterId)`; `speakerTH/EN` override it (radio hosts,
  the alms monks at dawn). The stock `Dialogue.js` labels lines from `setSpeaker(who)` only, so the
  runner (or a `dialogue:line` listener) must honour the override.
* `th` / `en`: always both. Thai ≤ ~14 words. `'…'` is allowed only as a choice prompt.
* `tone`: `normal | whisper | ghost | shout | thought | sing`. `thought` = Ton's inner voice
  (subtitle in italics, no TTS or a soft TTS). `ghost` = processed voice.
* `emotion`: `smile | sad | fear | anger | creepy | surprise` → `humanoid.setExpression`.
* `action`: humanoid action name (`hail wave wai smoke giveItem pay laugh point pray sing sleep
  stagger enterCar exitCar neckSnap reachOut nod …`, see `src/characters/index.js` `play()`).
* `pause`: extra seconds after the line (default gap `DIALOGUE_EVENT_PARAMS.lineGapSeconds`).
* `set`: `{ flag: value }` story flags set when the line plays (`saves.data.flags` for the ride).
* `choice`: `{ id, options:[{key, th, en}], defaultKey, timeout?, branches?, setOnPick? }` — exactly the
  shape `src/game/Dialogue.js` plays: it calls `ui.choice(line.choice)`, records
  `choices[choice.id] = key`, then plays `choice.branches[key]`. The line's own th/en is the prompt
  (`'…'` when there is none). `setOnPick: { key: {flag:value} }` is also baked into the first line of
  that branch as `set`, so the stock runner applies it. On timeout `ui.choice` resolves `defaultKey`,
  which is always the LAST option (the silent / do-nothing one). Every choice has a unique `id`
  (`sri_yaiSpeed boyM_turnAround monk_heavyHeart saman_riddle bua_thatsMe somchai_photo
  somchai_forgive nameCall timeSkip`).

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
  encounters: [{ id <ENCOUNTERS key>, at 0..1 (ride progress), optional? }],
  deathOnWrong: 'giantHand'|'trueForm'|'roadFold'|'windowAttack'|'dragBack'|'home',
  wrongAftermath?: encounter id played before the wrong-fork death (ride 4: 'reflectionStays'),
  memoryHooks: [memory ids the ride references], gives?: {item, flag},
  pacing: { cruiseKmh, minSeconds, stretch: 'none'|'fog'|'mist', speedCapKmh? },
  dialogue: { hail, greet, destination, beats, arriveCorrect, arriveWrong, idle, onLookBack, onFaceGaze, onFaceGazeWarn? },
  finale?: { stepOut, forgiveChoice, forgive, dawn, endless }   // Somchai only
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
  * `{ type:'progress', at: 0..1 }`
  * `{ type:'time', seconds }` since the passenger sat down
  * `{ type:'after', beat:<beat id>, seconds }` after another beat finished
  * `{ type:'event', event }` — `DIALOGUE_EVENTS` (`radioOn radioOff radioTune radioIgnored lookBack
    faceGaze faceGazeWarn cabinLightOn cabinLightOff cabinLightDies windowOpen windowClose wipersOn stopped
    speeding collision meterOn meterOffTooLong meterGlitch honkShrine amulet knock1 knock3 breathPassed
    nameCallAnswered nameCallIgnored yaiSpeed elephants forkApproach gateReached`) or
    `encounter:<id>` (encounter started) / `encounterEnd:<id>`.
* `if`: `{ taxi: { <taxi.state key>: value }, flag: { <flag>: value }, memories: [memory ids] }` — all
  must match; a missing flag counts as `false`; `memories` = every listed id is in
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
'ending:<ENDINGS key>' | 'scare:<name>'`. Ride-scheduled encounters ignore `chance`/`cooldown`.

## Tutorial step (`ahkong.js`)

`{ id, th, en, lines:[Line] | {auto,manual}, hint:{th,en,keys} | {auto,manual}, waitFor | {auto,manual}, after?, memory? }`
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
* `ENDINGS[id]`: `{ id, kind, titleTH, titleEN, condition, countsAsDeath, music, scenes:[{id, note, lines}],
  epilogue:[{th,en}], creditsExtra:[{th,en}], unlocks }`.
* `STATIONS[i].schedule[]`: `{ hours, songs:[id] | talk }`; `SONGS[id].lyrics:[{th,en}]`;
  `SPECIAL_BROADCASTS[]`: `{ id, station, hours, lines, then?: songId, memory?, ending? }`.
* `CHAPTERS[i]`: `{ hour, time, th, en }` → `ui.chapter()`. `DEATH_CARDS[type]`: `{ th, en, rule }`
  → `ui.deathCard()`; every `deathOnWrong`, `ENCOUNTER_DEATHS` and `DEATH_HINTS` key has a card.
* `RESTART_LINES`: pick the entry with the highest `minLoop ≤ saves.data.loops` (if that entry was
  already heard and it has `variants`, play a random variant instead); then
  `DEATH_HINTS[lastDeathType]`; then (if `loops ≥ TIME_SKIP.minDeaths` and the last death was
  after 21:00) `TIME_SKIP`.

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
