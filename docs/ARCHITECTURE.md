# Architecture & module contracts

Browser game: **Three.js 0.170 (WebGL2) + Vite**. No external runtime assets. Every
texture, mesh, animation, sound and piece of music is **generated procedurally in
code**. Fonts are bundled OFL fonts via `@fontsource/*`. Run with `npm run dev`; build
with `npm run build` (static `dist/`, relative paths).

## Directory ownership

| dir | owner | what |
|---|---|---|
| `src/core/` | orchestrator | engine loop, input, camera rig (gaze), interaction raycasts, colliders, settings, saves, math/noise, layers, events |
| `src/render/` | render | post-processing pipeline, painterly filter, sky/time-of-day, fog, global uniforms, material factory, light pool, particles |
| `src/textures/` | textures | procedural painted textures, Thai signage/decals/printed matter |
| `src/world/` | world | road network, terrain, forest generation (trees, bamboo, banana, ferns, grass, vines, banyans), placement of props along the road, streaming/culling, wind |
| `src/props/` | props | roadside props and set pieces (poles + wires, streetlights, spirit houses, salas, ศาลเจ้ามารวย, garage, bus stop, noodle stall, bridge, guardrails, statues, temple, memorial, mist gate, dressing) |
| `src/vehicle/` | vehicle | taxi exterior/interior, controls, glass (rain/condensation/refraction), mirrors, car physics, motorcycle |
| `src/characters/` | characters | procedural skinned humans, faces, rig, IK, procedural animation, player body and controller, quadrupeds |
| `src/creatures/` | creatures (later phase) | folklore entities and window-scare puppets built on characters |
| `src/audio/` | audio | procedural WebAudio: SFX, ambience, engine, radio, music, voice |
| `src/ui/` | ui | HTML/CSS overlay: menus, settings, slots, subtitles, prompts, chapter cards, credits |
| `src/game/` | gameplay (later phase) | state machine, intro, tutorial, shift, passengers, rules, encounters, fork, death, endings; `src/game/data/` = narrative data |
| `src/sandbox/` | everyone | **one file per module** (`<module>.js`, extra ones as `<module>-<topic>.js`): isolated test scenes for screenshots |
| `tools/` | orchestrator | `shot.mjs` screenshot harness |

**Every module's public API is defined in its `index.js`** (`src/render/index.js`,
`src/props/index.js`, ...). The stub implementations there are the **contract**. Keep
the exported names and signatures, replace the internals, and add new exports freely.
Split code into as many internal files as you like inside your own directory.
**Never edit files outside your directory.** If you need something from another module
that doesn't exist yet, write a small local helper and note it in your report.

## Conventions

* Units are **metres**, seconds, radians. **Y up.** Local "forward" for vehicles,
  characters and props is **−Z** (three.js camera convention). Yaw 0 = facing −Z;
  positive yaw turns left (counter-clockwise from above), same as `rotation.y`.
* **Thailand drives on the LEFT.** The taxi is **right-hand drive**: the driver sits at
  local +X. The road's `lateral` coordinate is **+ = right of travel direction**; the
  traffic lane centre is `LAYOUT.laneOffset` (−1.55 m, left lane).
* Thai side of the road for stopping and pickups = the LEFT edge.
* World layout is authoritative in `src/world/layout.js`. The built world exposes it as
  `world.landmarks[key] = { key, kind, pos, yaw, roadRef:{id,s}, side, waitPos, stopPos, facing, ...extra anchors }`.
* Use `paintedMaterial()` / `foliageMaterial()` / `skinMaterial()` from `src/render`
  for **every** mesh, or include three's fog chunks in custom ShaderMaterials, so fog,
  wetness, wind and the painterly look stay consistent. Custom shaders read
  `GLOBAL_UNIFORMS`.
* Deterministic generation: use `makeRng(seed)` / `noise` from `src/core/math.js`,
  never `Math.random()` for world content (it's fine for transient FX).
* Dispose what you create (`dispose()` on entities). No per-frame allocations in hot
  loops; reuse temp vectors.
* Text in the game is bilingual: `{ th, en }`. Thai text must be natural and correct.

## Render layers (`src/core/layers.js`)

| layer | main camera | mirror cameras | use |
|---|---|---|---|
| `DEFAULT` 0 | yes | yes | everything normal |
| `MAIN_ONLY` 1 | yes | **no** | ghosts with **no reflection** |
| `REFLECTION_ONLY` 2 | **no** | yes | things that exist **only in reflections** |
| `PLAYER_HEAD` 3 | **no** | yes | the player's head and hair (never clips into first-person view, but visible in mirrors) |
| `GLASS` 4 | separate glass pass | no | taxi glass. Rendered after the opaque pass, sampling `postfx.glassUniforms.tSceneColor` for refraction |
| `INTERACT` 5 | no | no | invisible raycast proxies |

Mirror cameras use `DEFAULT + REFLECTION_ONLY + PLAYER_HEAD`. A character's
`createReflectionDouble(overrides)` makes a REFLECTION_ONLY twin, so the original can
be set to MAIN_ONLY and the reflection can differ (twisted neck, a reflection that
stays seated, and so on).

## Frame order (`engine.onUpdate(fn, order)`)

`-100` input (inside engine.step) · `0` game logic and directors · `5` interact
raycast · `10` vehicle physics · `20` characters / animation · `40` world streaming ·
`50` camera rig · `60` audio listener · `80` render globals, sky, light pool,
particles · pre-render hooks (mirrors, reflections) · `engine.renderPipeline` (postfx).

`engine.paused` stops all updates except those registered with `{always:true}` (UI,
menu camera). `engine.timeScale` scales dt (slow motion in cinematics).

## Core API summary (already implemented)

* `engine`: `.renderer .scene .camera .time .dt .onUpdate(fn, order, {always}) .onPreRender(fn) .step(dt) .paused .timeScale`
* `input`: `.down(a) .pressed(a) .released(a) .consume(a) .axis{steer,throttle,brake,moveX,moveY,lean} .look{dx,dy} .setWantPointerLock(b) .lastDevice`
  * Actions: `forward back left right leanLeft leanRight run interact amulet paper
    handbrake gearUp gearDown indicatorLeft indicatorRight wipers radio radioTune
    headlights cabinLight meter window horn vehicle pause skip confirm back_ui debug`
* `cameraRig`: `.attach(eye, base, {yaw,pitch,limits}) .setLimits() .cinematic({position,lookAt,fov,roll,blend,cut}) .release(blend) .setFocus(target,strength) .shake(a) .isLookingAt(pos,deg,maxDist) .isOnScreen(pos) .angleTo(pos) .yaw .pitch .lookDirection .worldYaw .lookEnabled .fovOffset .extraOffset`
* `interact`: `.register({id, object, labelTH, labelEN, icon, reach, enabled(), onUse(ctx), onHold(dt,ctx), onRelease(ctx)}) .unregister(item) .unregisterPrefix(p) .current .enabled`
* `colliders`: `.addCircle(x,z,r,{tag}) .addBox(x,z,hx,hz,yaw,{tag}) .addObjectBounds(obj) .resolve(pos,r) .removeTag(tag)`
* `settings`: `.get(k) .set(k,v) .onChange(fn)`. Keys in `src/core/Settings.js`.
* `saves`: `.list() .create(i) .load(i) .write() .data .activeSlot .lastUsed()`
* `bus`: `.on(name,fn) .once .off .emit(name,data) .wait(name,pred)`
* `math`: `clamp lerp damp dampAngle smoothstep remap easeInOut easeOutCubic Spring makeRng hashString noise (SimplexNoise: noise2D, noise3D, fbm2, fbm3)`
* `loadFonts()` / `FONTS` (`src/ui/fonts.js`): `body` Sarabun, `sign` Kanit, `lcd` Chakra Petch, `hand` Mali, `title` Cormorant Garamond.

## Event names (bus)

| event | payload | emitted by |
|---|---|---|
| `settings:changed` | `{key,value,values}` | core |
| `engine:resize` | `{width,height,pixelRatio}` | core |
| `interact:target` | `{id,labelEN,labelTH,icon}` or `null` | core |
| `interact:use` | `{id}` | core |
| `taxi:control` | `{control, value}` | vehicle |
| `taxi:door` | `{door, open:0..1}` | vehicle |
| `taxi:engine` | `{on}` | vehicle |
| `taxi:collision` | `{impulse, point}` | vehicle |
| `taxi:gear` | `{gear}` | vehicle |
| `player:footstep` | `{surface:'asphalt'|'gravel'|'grass'|'wood'|'concrete'|'puddle', position}` | characters |
| `player:hold` | `{item}` | characters |
| `amulet:hold` | `{active:boolean}` | gameplay/characters |
| `subtitle` | line object | gameplay → ui |
| `game:state` | `{state}` | gameplay |
| `game:hour` | `{hour}` | gameplay |
| `audio:radio` | `{on, station, song}` | audio |

## Module contracts (beyond the JSDoc in each index.js)

### render (`src/render/index.js`)
* `installRendering(engine)` installs: ShaderChunk overrides (height fog with noise,
  headlight scattering in fog), `engine.renderPipeline` = PostFX, sky/time-of-day,
  light pool, particles, the per-frame global-uniform update.
* **PostFX pipeline:** scene → HalfFloat RT (MSAA where supported) with the camera's
  layers (GLASS excluded) → copy colour (+ a blurred mip/downsample for frosted or fogged
  glass) → render the `GLASS` layer on top with depth test, sampling
  `postfx.glassUniforms.tSceneColor/tSceneBlur` → painterly filter (Kuwahara-type,
  scaled by `settings.painterly` / `painterlyQuality`) → bloom → final grade
  (exposure, tone mapping, lift/gamma/gain, saturation, temperature, per-hour LUT-like
  curves, vignette, grain, chromatic aberration, letterbox, fade, horror
  distortion/desaturation, golden amulet aura) → sRGB → screen.
* `postfx.params` is animatable by gameplay (fade, letterbox, horror, amulet, blur,
  exposure, distortion). `postfx.flash(color, dur)`.
* `sky.setHour(h)` for h ∈ [21, 30] drives sky dome (stars, moon phases/colour, clouds,
  dawn gradient, sun), fog colour/density, ambient/hemi/moon/sun lights and grading
  targets per the colour script in GAME_DESIGN §9. `sky.setWeather({rain,fog,wind}, secs)`.
  `sky.setShadowFocus(v)`. Exposes `sky.sun`, `sky.moon` (DirectionalLights), `sky.surreal`.
* `lightPool.add(spec)`: many lamps, few real lights. Nearest N get real PointLights
  (N by quality); every lamp draws a glow sprite, a volumetric-ish cone/halo, and an
  optional ground light pool. Flicker presets: fluorescent (stutter and buzz-dim),
  sodium (slow warm-up wobble), dying (long blackouts), candle, neon.
* `particles.emit(type, opts)`: GPU instanced, wind-reactive; insects swarm lights
  and the taxi's headlight beams.

### textures (`src/textures/index.js`)
* `tex(key, {repeat})`: cached CanvasTexture/DataTexture. Required keys (at least):
  `asphalt asphalt_normal asphalt_rough road_lines concrete concrete_moss concrete_normal moss soil rock rock_normal
  bark bark_normal bark_banyan leaf_tropical leaf_banana leaf_fern leaf_bamboo leaf_palm grass_card vine
  rust metal_painted paint_peel_white paint_peel_red wood_old roof_tiles roof_corrugated gold_leaf red_lacquer
  taxi_paint taxi_paint_normal chrome_dirty rubber leather_seat fabric_seat dash_plastic carpet headliner
  skin skin_normal hair_strands fabric_cotton fabric_silk fabric_denim monk_robe cloth_red cloth_yellow cloth_green
  water_ripple glass_dirt brush_noise blue_noise puddle_mask lantern_paper incense_ash`.
  Foliage atlases have alpha. Painterly look: layered noise and brush-stroke stamping,
  limited palettes, hand-made imperfections. Normal maps are generated from height.
* `signTex(kind, opts)`: original fictional Thai designs (no real brands or logos).
* `canvasTexture(w,h,draw,opts)`, `fontsReady()`.

### world (`src/world/World.js`)
* `new World(); await world.build({onProgress, quality})` → `world.group` (add to scene).
* `world.road`: RoadNetwork with splines `main` (open M→F), `ghost` (F→M, left),
  `human` (F→M, right), `spur` (intro bike road ending at `spurJunction`). API:
  `sample(id,s,out)`, `project(pos, preferId)`, `length(id)`, `get(id)`,
  `connections`. Dense points ~1 m. Projection must be fast (spatial hash), because it
  is called every frame by car physics.
* `world.getHeight(x,z)`: ground/road surface height (road surface takes priority on
  the road and shoulders).
* `world.landmarks`, `world.pickups[rideKey]`, `world.fork = {pos, yaw, ghostSplineId:'ghost', humanSplineId:'human', decisionS (main s where the choice is made), shrine: <createShrineMaRuay result>}`.
* Each landmark entry carries the prop factory's anchors (e.g. `world.landmarks.garage.anchors.oldManSeat`).
* `world.update(dt, focusPos)`: chunk visibility, LOD, wind, streetlight assignment.
* `world.setDensity(f)`: rebuild or thin the forest (settings `foliageDensity`).
* `world.surfaceAt(x,z)` → `'asphalt'|'gravel'|'grass'|'wood'|'concrete'|'puddle'`.

### props (`src/props/index.js`)
Factories return `{ object, ...anchors }` in **local space** (the world places them).
Anchors are `Object3D`s so they follow the prop. Props register their own lights through
`lightPool` only when the caller passes `opts.lights !== false` and the prop is in the
scene. Factories also return `colliders: [{x,z,hx,hz,yaw}|{x,z,r}]` (local), which the
world converts to world space.

### vehicle (`src/vehicle/index.js`)
* `Taxi`: exterior and detailed interior, anchors (`TAXI_ANCHORS`), `state`, `physics`,
  `setControl()`, `openDoor()`, `getGazeTarget()`, `mirrors`, `glass`,
  `setSeatWeight()`, `setFog()`, `addGlassMark()`, `autopilot()`. It installs its own
  update (order 10) and registers its interactables (`taxi.*`) with core/interact
  when `setInteractionsEnabled(true)`.
* Mirrors: rearview + 2 side mirrors, correct planar reflections via virtual cameras
  (layers as above), resolution from `settings.mirrorResolution`, updated in
  `engine.onPreRender`. The side window glass shows a faint interior reflection when
  the cabin is lit (stronger at night with the cabin light on) and when you look
  toward it (gaze-gated, one window at a time).
* Glass: procedural raindrops and streaks (wiper-cleared on the windshield), dirt,
  condensation (fog mask that the player wipes with the hand: hold interact on glass),
  breath-fog spots, handprints and face marks, refraction through the drops. Windows
  roll down (crank) and the glass moves.
* Physics: arcade-realistic rear-wheel-drive sedan; manual 5-speed or auto (setting);
  rpm; handbrake; road-corridor constraint (vegetation walls slow you and scrape);
  suspension pitch/roll; bumps on cracks. Feeds `audio.engineSound`.
* `Motorcycle`: old rusty step-through motorbike for the intro, with headlight.

### characters (`src/characters/index.js`)
* Procedural **skinned** humans: SDF-sculpted bodies (smooth-union capsules and
  ellipsoids, surface-nets/marching-cubes meshing, normals, skin weights from bone
  distances), separate higher-res head and hands, painted face texture, eyes with
  iris/pupil and eyelids (blinking), jaw and lip corners, hair meshes (cards/shells),
  clothing via SDF shells and painted regions. Realistic proportions; slightly
  stylised shapes; NOT mannequins.
* **Bone names** (all humanoids): `hips spine chest neck head jaw eyeL eyeR
  clavicleL upperArmL forearmL handL thumb1L thumb2L index1L index2L middle1L middle2L
  ring1L ring2L pinky1L pinky2L` (same for R), `thighL shinL footL toeL` (same for R).
* Procedural animation layers: base pose/locomotion → actions → IK (two-bone arms and
  legs with pole vectors, hand grip curl) → look-at (head/neck/eyes) → breathing,
  weight shift, micro-motion → **ghost deformation layer** (neck twist past human
  limits, head rotating without the shoulders, spine backbend, limb breaks, jitter,
  levitation) → secondary physics (hair, cloth springs).
* `PlayerBody` + on-foot controller (WASD, collisions via `colliders`, ground height
  via `world.getHeight`, head bob, footstep events). In a vehicle the hands IK to the
  wheel/handlebars, feet to the pedals, the body reacts to acceleration, and `reach()`
  is used for every physical control interaction.

### audio (`src/audio/index.js`)
All sound is synthesised (noise, oscillators, FM, physical-ish models, convolution
reverb from generated impulse responses). Spatial via PannerNode (HRTF) following
`engine.camera`. Buses: master, music, sfx, ambience, voice, ui. Sound ids are
listed in `src/audio/index.js` (keep the list in sync).

### ui (`src/ui/index.js`)
DOM overlay in `#ui`. Elegant and minimal, Thai+English typography; no persistent HUD.
Full keyboard/gamepad navigation of menus.

## Performance budgets (High preset, mid-range GPU, 1080p, 60 fps)
* ≤ 450 draw calls in the forest; ≤ 2.5 M triangles; instanced foliage with LOD
  (cross-billboards beyond ~60 m) and distance culling, chunked by road segment.
* Real dynamic lights ≤ 6 (headlights spot ×1-2, cabin, 3–4 pooled streetlights).
  One shadow-casting spotlight (headlights) + sun at dawn.
* Mirrors: 3 × ≤ 384 px; glass reflection: one pane at a time, gaze-gated.
* Painterly filter at half resolution on Medium.

## Testing

`node tools/shot.mjs --sandbox=<name> --out=.shots/<name>.png [--size=960x540] [--frames=N] [--params="k=v&..."] [--eval="js"]`
starts its own Vite server, opens Chromium (SwiftShader WebGL2; slow but faithful),
waits for `window.__ready`, steps frames deterministically, saves a PNG, and prints
console errors. **Check screenshots visually (Read the PNG) and fix every console
error.** Sandboxes read URL params via `ctx.params` (e.g. `?hour=23`, `?cam=interior`).
SwiftShader is CPU-rendered: keep sandbox sizes modest (e.g. 960x540) and frames low.

### narrative data (`src/game/data/`)
Pure data modules (no engine imports) consumed by gameplay, ui and audio. Barrel:
`src/game/data/index.js`; full schema: `src/game/data/SCHEMA.md`. Key exports: `CHARACTERS`
(voice params + createHumanoid specs), `RULES`/`RULE_PARAMS`/`HIDDEN_LINE`/`PENCIL_NOTES`,
`PASSENGERS` (9 rides; one file each in `rides/`; dialogue beats triggered by ride progress,
time, other beats or bus-style events listed in `DIALOGUE_EVENTS`), `ENCOUNTERS`, `MEMORIES`,
`ENDINGS`, Ah Kong's `INTRO_GARAGE`/`TUTORIAL_STEPS`/`RESTART_LINES`/`DEATH_HINTS`/`TIME_SKIP`,
radio `STATIONS`/`SONGS`/`DJ_LINES`/`SPECIAL_BROADCASTS`, world text (`CHAPTERS`, `DEATH_CARDS`,
`SIGNS`, `POSTERS`, `NOODLE_MENU`, `LOADING_LINES`…) and `CREDITS`. Hours use the 21..30 scale.
Validate with `node -e "import('./src/sandbox/narrative-validate.js').then(m=>m.runNode())"` or the
`narrative` sandbox.
