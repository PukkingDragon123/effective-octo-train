# Gameplay layer: contract for the three gameplay engineers

Everything here lives in `src/game/` (plus `src/creatures/`). The foundations are done:
render, textures, world, props, vehicle, characters, audio, ui and narrative data. Read
their `index.js` headers and `docs/ARCHITECTURE.md` instead of guessing.

## Shared context

`import { g } from './context.js'`, filled at boot by `src/game/Game.js`:
`g.engine g.cameraRig g.interact g.input g.bus g.settings g.saves g.colliders g.postfx
g.sky g.lightPool g.particles g.audio g.ui g.world g.taxi g.bike g.player g.ahKong g.clock
g.dialogue g.cine g.fsm g.data g.save g.persist()`.

* `g.data.<file>` holds every module in `src/game/data/` (`characters`, `rules`, `passengers`,
  `ahkong`, `encounters`, `memories`, `endings`, `radio`, `worldtext`, `credits`, `logic`, `loop`,
  `lines`).
* **`src/game/data/SCHEMA.md` is the source of truth** for lines, replies, flags, conditions,
  loop variants, beats, encounters, endings and rule breaks. **Always** resolve a block through
  `g.data.logic` (`dialogueBlock`, `resolveLines`, `checkCond`, `endingFor`, `byLoop`) before
  playing it.
* State machine `g.fsm` (`StateMachine.js`): a state is `{ name, enter(params), exit(), update(dt) }`
  with a per-state `scope` (`util.js` `Scope`) that is disposed on exit. Long `enter()`s must check
  `this.active` after every `await`.
* Helpers: `util.js` (`wait`, `waitReal`, `until`, `tween`, `during`, `Scope`), `Cinematic.js`
  (`g.cine.fade / letterbox / horror / amulet / blur / shot / release / converse / endConverse`),
  `Clock.js` (`g.clock.set / advanceTo / hour / phase / text`), `Dialogue.js` (`g.dialogue.play(lines)`).
* Debug entry: `?start=menu|intro|garage|tutorial|shift|death|ending&ride=N&hour=H&free=1&ending=id&death=type&slot=0`
  (see `Game.js`). Test with
  `node tools/shot.mjs --game --params="start=shift&ride=1" --out=.shots/x.png --frames=60 --timeout=900000`.
  The machine is shared and renders on the CPU, so take few screenshots (10–15 at most).

## Ownership (do not edit outside your files)

| engineer | owns |
|---|---|
| **A: opening and set pieces** | `src/game/states/MenuState.js`, `IntroState.js`, `GarageState.js`, `TutorialState.js`, `EndingState.js`, `src/game/opening/**`, `src/game/endings/**`, `src/game/systems/PlayerActions.js`, `src/game/systems/LoopStaging.js`, `src/sandbox/game-a*.js` |
| **B: shift, rides, rules, death, loop** | `src/game/states/ShiftState.js`, `DeathState.js`, `src/game/ride/**`, `src/game/fork/**`, `src/game/rules/**`, `src/game/death/**`, `src/game/systems/Knowledge.js`, `src/game/systems/Exploration.js`, `src/game/Dialogue.js` (B may extend it), `src/sandbox/game-b*.js` |
| **C: creatures, animals, encounters** | `src/creatures/**`, `src/game/encounters/**`, `src/sandbox/creatures*.js`, `src/sandbox/encounters*.js` |
| orchestrator | `src/game/Game.js`, `context.js`, `StateMachine.js`, `util.js`, `Cinematic.js`, `Clock.js`, `src/core/**`. If you need a change here, add a small hook in your own files and report it. |

Don't edit the foundation modules. Report what you need from them instead. Don't git commit.

## Cross-engineer interfaces

* **Death (B):** `src/game/death/index.js` exports `kill(type, opts)`, also installed as
  `g.kill`. `type` is a death key from `worldtext.DEATH_CARDS` or the rule-break table, e.g.
  `giantHand trueForm roadFold windowAttack dragBack home nameCall count444 windowArm extraPassenger
  ceilingCrawl lookBack faceGaze knock`. It plays the registered cinematic, then
  `fsm.go('death', {...})`, then the death card, then the **loop restart**:
  `fsm.go('garage', { restart: true })`.
  * Cinematics are registered with `registerDeath(type, async (ctx) => {})`. C registers the
    creature-heavy ones (giant hand, ceiling crawl, window arm, true forms) through it.
* **Rules (B):** `g.rules` (`src/game/rules/RuleMonitor.js`) watches all 16 rules from the
  player's gaze (`cameraRig`, `taxi.getGazeTarget()`), the taxi state and speed, and dialogue
  flags (`ruleBreak`, `lure`, see SCHEMA). Encounters arm a rule with
  `g.rules.arm(ruleId, { encounter, until, params })` and report through the bus:
  `bus.emit('rule:event', { ruleId, phase: 'start'|'warn'|'resolved'|'violated', encounterId })`.
  Only B decides a death, by calling `g.kill`.
* **Encounters (C):** `g.director` (`src/game/encounters/Director.js`):
  * `start(id, ctx) → handle { id, done: Promise<outcome>, outcome(key), stop() }`
  * `isRunning(id)`, `update(dt)`
  * It runs ambient encounters by itself, by hour, place, gaze and cooldown, per
    `data.encounters`. Rides schedule theirs with `g.director.start(id, { ride, passenger })` at
    the progress points in the ride data.
  * Rule events (knocks, breath, voice calling, cabin light, 444, figure in the road, blood from
    the roof, window visitor, radio saying your name, extra passenger) are encounters that arm rules.
* **Animals (C):** `createAnimal(kind)` in `src/creatures/` for `'elephant' | 'elephantCalf' | 'dog'`
  (the characters module's `createQuadruped` is only a placeholder).
* **Rides (B):** `g.ride` is the current Ride. Fields: `passenger` (humanoid + clue behaviours),
  `data` (the passenger entry), `progress` 0..1, `seat`, `phase`
  (`approach|pickup|riding|forkApproach|resolving`), and `emit(event)` for the dialogue events
  in `DIALOGUE_EVENTS`.
* **Player actions (A):** `src/game/systems/PlayerActions.js` (installed as `g.actions`):
  * raise the rules paper (Tab/J/Y), front and back, with live pencil notes from `Knowledge`
  * hold the amulet (RMB/G/X) with the golden aura and `bus 'amulet:hold'`
  * get out of the taxi and walk on foot, then get back in (V / door handle)
  * wipe condensation (hold interact on glass), inspect things (lean in)
  B and A both call these and never reimplement them.
* **Knowledge (B):** `g.knowledge` covers memories, pencil notes, clues and deaths, persisted in
  `g.save` (and `g.persist()`).
* **Loop staging (A):** on every restart, `LoopStaging.apply(loops)` places the garage changes
  from `data.loop.LOOP_STAGING`: dash tally scratches, calendar, radio song, dog, cigarette ash.

## Owner's standing directions (also in GAME_DESIGN.md §0)

* **100% Thai with almost no text.** Subtitles default to Thai only; prompts show no labels.
* **One typeface, Srisakdi** (`FONTS.*`).
* **Replies are interactive and meaningful**, and silence is a valid answer.
* **Several endings.**
* **Death means being stuck in the loop.**
* **Super sharp, beautiful, lots of fog and lighting, terrifying, polished.**
