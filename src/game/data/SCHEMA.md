# Narrative data — schema (`src/game/data/`)

Plain ES modules, named exports, no imports except between data files. Import everything
from the barrel: `import { PASSENGERS, RULES, ENCOUNTERS } from '../game/data/index.js'`.
Validate after every edit:

```
node -e "import('./src/sandbox/narrative-validate.js').then(m=>m.runNode())"
node tools/shot.mjs --sandbox=narrative --out=.shots/narrative.png --frames=1 --size=1280x720
#   views: --params="view=ride&id=<passengerId>" | view=tutorial | encounters | world | radio | endings
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
| `ahkong.js` | `INTRO_GARAGE`, `TUTORIAL_STEPS`, `SEND_OFF`, `GARAGE_IDLE`, `RESTART_LINES`, `DEATH_HINTS`, `TIME_SKIP`, `RADIO_CAMEO`, `SHRINE_REVEAL`, `AH_KONG` |
| `radio.js` | `STATIONS`, `STATION_BY_ID`, `SONGS`, `FATHER_SONG`, `DJ_LINES`, `LATE_NIGHT_WHISPERS`, `SPECIAL_BROADCASTS` |
| `worldtext.js` | `GAME_TITLE`, `PHONE_MESSAGE`, `HOUR_WORDS`, `CHAPTERS`, `DEATH_CARDS`, `DEATH_FOOTER`, `SIGNS`, `SHOP_SIGNS`, `POSTERS`, `NOODLE_MENU`, `GARAGE_CALENDAR`, `TAXI_TEXT`, `PAPER_TITLE`, `LOADING_LINES`, `MENU_TEXT` |
| `credits.js` | `CREDITS_HEADLINE`, `CREDITS`, `CREDITS_CLOSING` |
| `lines.js` | `P Y T S C` line constructors (authoring helpers) |

## Line

```js
{ who, th, en, tone?, emotion?, action?, pause?, set?, choice?, branches?, setOnPick?, speakerTH?, speakerEN? }
```

* `who`: `'passenger'` (the current ride's character) · `'player'` (Ton) · any `CHARACTERS` key
  (`'ahKong'`, `'somchai'`, `'auntieLek'`, `'monk'`, `'boyM'`, `'djNok'`, `'radio'`, `'voice'` …).
  Subtitle speaker label: `speakerName(who, ride.characterId)`; `speakerTH/EN` override it (radio hosts).
* `th` / `en`: always both. Thai ≤ ~14 words. `'…'` is allowed only as a choice prompt.
* `tone`: `normal | whisper | ghost | shout | thought | sing`. `thought` = Ton's inner voice
  (subtitle in italics, no TTS or a soft TTS). `ghost` = processed voice.
* `emotion`: `smile | sad | fear | anger | creepy | surprise` → `humanoid.setExpression`.
* `action`: humanoid action name (`hail wave wai smoke giveItem pay laugh point pray sing sleep
  stagger enterCar exitCar neckSnap reachOut nod …`, see `src/characters/index.js` `play()`).
* `pause`: extra seconds after the line (default gap `DIALOGUE_EVENT_PARAMS.lineGapSeconds`).
* `set`: `{ flag: value }` story flags set when the line plays (`saves.data.flags` for the ride).
* `choice`: `{ options:[{key, th, en}], timeout?, defaultKey }` → `ui.choice()`; the line's own
  th/en is the prompt. `branches: { key: [Line] }` play right after the pick;
  `setOnPick: { key: {flag:value} }`. On timeout use `defaultKey` (always the "silent" option).

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
  dialogue: { hail, greet, destination, beats, arriveCorrect, arriveWrong, idle, onLookBack, onFaceGaze, onFaceGazeWarn? },
  finale?: { stepOut, forgiveChoice, forgive, dawn, endless }   // Somchai only
}
```

**Ride progress** = distance since pickup ÷ distance from the pickup `stopPos` to the fork
`decisionS` (0 → 1). `hail` plays as the taxi approaches; `greet` once seated (door shut);
`destination` after `greet` (meter reminder via the `meterOffTooLong` event); `idle` lines fill
silences every `DIALOGUE_EVENT_PARAMS.idleGapSeconds`; `arriveCorrect` / `arriveWrong` after the
fork resolves (wrong → then `deathOnWrong` cinematic → `WORLD_TEXT.DEATH_CARDS[type]`).
`onLookBack` when rule 3's look-back fires (consequence from `specialRules[r3].lookBack`);
`onFaceGazeWarn` at `RULE_PARAMS.faceGazeWarnSeconds`, `onFaceGaze` at the attack.

### Beat

```js
{ id (unique in the ride), trigger, lines:[Line], once?=true, if?, set?, effects? }
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
* `if`: `{ taxi: { <taxi.state key>: value }, flag: { <flag>: value } }` — all must match; a missing
  flag counts as `false`.
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
* `RESTART_LINES`: pick the entry with the highest `minLoop ≤ saves.data.loops`; then
  `DEATH_HINTS[lastDeathType]`; then (if `loops ≥ TIME_SKIP.minDeaths` and the last death was
  after 21:00) `TIME_SKIP`.
