# GLB character system (`src/characters/glb/`)

Rigged human bodies and animation clips from the CC0 Quaternius *Universal Base Characters* and *Universal
Animation Library*, processed for Hia Phat (see `docs/credits/characters.md`). Everything else is generated
in code: faces, eyes, hair, fabrics, accessories, gore and the procedural animation layers.

## Switching the game to it
```js
import { loadCharacterAssets, createHumanoid, PlayerBody, createQuadruped, PRESETS, PASSENGERS } from './characters/glb/index.js';
await loadCharacterAssets();               // once at boot, before any character is created (~1-2 s)
const ahKong = createHumanoid({ id: 'ahKong', ...CHARACTERS.ahKong.appearance });
const player = new PlayerBody(CHARACTERS.player.appearance);
```
`createHumanoid` / `Humanoid` / `PlayerBody` are aliases of `createHumanoidGLB` / `HumanoidGLB` / `PlayerBodyGLB`,
so only the import path changes. The specs in `src/game/data/characters.js` work as they are.

## API (same as the contract in `src/characters/index.js`)
Humanoid: `root, bones (contract names + Quaternius names; jaw/eyeL/eyeR helpers), mode, expression, ghost,
headPosition, eyePosition`, `setMode, walkTo, stopWalking, lookAt, setHandTarget, setFootTarget, sitAt, detach,
setTalking, setExpression, setGhost, play, stop, setLayer, createReflectionDouble (+ setFollow, setOverrides),
setVisible, setOpacity, setGroundFn, update, dispose`.
Additions: `setGore({bleedEyes, bleedMouth, wound:'neck'|'head'|'chest'|null, amount, crush, speed})`,
`holdItem(kind, side)`, `dropItem(kind)`, `onFootstep(side)`, `onExhale(pos)` callbacks.

* Modes: `stand idle walk run sprint sit sitCar drive ride crouch lie float crawl ceiling hang`.
* `sitAt(anchor, {pose})`: anchor = seat surface point facing its −Z.
* `setHandTarget(side, target, opts)`: for an Object3D target with `orient`, the fingers point along its −Z and
  the palm faces its −Y. `opts.along/palm` (world dirs) and `fingers` ('grip','point','flat','pinch','spread','claw')
  are optional.
* Actions (`play(name, opts)` → Promise): `hail wai smoke giveItem pay nod laugh cry point sing stagger wave
  turnTo lookAround` and ghost actions `neckSnap crawlOverSeat emergeFromBelow pressFaceToGlass ceilingCrawl sprint`.
* Ghost layer (`setGhost`): `neckTwist headRoll headPitch backbend armTwist limbBreak jitter levitate stretch
  mouthStretch` + `stare unlimited noBlink still`. Neck twist is a post-skin shader twist (no collapse).
* Gore: `spec.ghost.bloodStains/decay` paint blood, road rash and decay into the atlases; `setGore` animates
  bleeding and wounds via uniforms. Settings key `gore = 'reduced'` darkens and halves it.

PlayerBody: `eye, base, root, mode ('foot'|'taxi'|'bike'), humanoid, headMesh`, `enterVehicle(vehicle)`
(taxi: `driverSeat steeringWheel pedalThrottle pedalClutch`, optional `vehicle.parts.steering.spin`; bike:
`seat handleL/R footL/R`), `exitVehicle, reach(target,{hand}), hold(item), wipe(point), setWalkEnabled,
setPosition, setGroundFn, setSurfaceFn, dispose`. The head, hair and eyes are on `LAYERS.PLAYER_HEAD`.
It runs its own update (engine order 15); attach the camera with `cameraRig.attach(player.eye, player.base)`.

## Performance
One draw call for body + clothes + hair, one for the eyes, one for worn accessories, plus held props.
Geometry is cached per look, clips are shared per sex, atlases per look hash (2048² colour, 1024² mask,
1024² face; `quality < 0.75` → 1024² colour). Beyond 25 m the low body is used, and far characters
update every 2nd to 6th frame.

## Sandbox
`src/sandbox/characters-glb.js`: `view=lineup|faces|single|actions|ghost|gore|mirror|fp`
(see the header comment for parameters).
