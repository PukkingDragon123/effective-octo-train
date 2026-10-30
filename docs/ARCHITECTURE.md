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

#### render — implementation notes for integrators
* **Light calibration.** The grade runs night exposure ≈ 3.5 (dawn ≈ 1). Lights are three.js
  physical units: taxi headlight SpotLights ≈ 900–1500 cd, streetlights 250–450 cd
  (distance 18–22), shrine candles 5–15, cabin light 2–6. Set `GLOBAL_UNIFORMS.uHeadlightPos/
  uHeadlightDir/uHeadlightOn` every frame (midpoint of the two lamps, beam axis); the fog
  scattering colour/strength is `uHeadlightColor` (default warm, ×0.12).
* **Custom shaders**: `#include <dlb_common>`, `<dlb_globals>`, `<dlb_fog_common>`,
  `<dlb_headlight>` give hashes/noise, all `dlb*` global uniforms (aliases of
  GLOBAL_UNIFORMS, injected automatically into every material at compile time), and
  `dlbApplyFog(col, worldPos, gl_FragCoord.xy)`, `dlbFogTransmittance(wp)`,
  `dlbHeadlightAt(wp)`, `dlbLampLightAt(wp)`, `dlbEnvRadiance(dir, wp, rough)`. A ShaderMaterial
  with `fog:true` that includes three's fog chunks gets the full fog for free (it needs
  `UniformsLib.fog` in its uniforms like any three fog material). Additive materials with
  `fog:true` are only attenuated (never tinted toward the fog colour).
* **Sky alpha**: the sky dome writes alpha 0 into the scene target and PostFX uses
  `1 - alpha` as the sun-shaft occlusion mask, so opaque custom shaders must write alpha 1.
* **Glass pass**: rendered with the camera's layers set to `GLASS` only, autoClear off and
  shadow-map updates off. Lights owned by render (sky + pooled lights) also enable the GLASS
  layer; enable it on your own lights if lit glass needs them. `postfx.glass` = `'auto'`
  (scans for GLASS-layer meshes every 30 frames) | `true` | `false`.
  `glassUniforms.tSceneBlur` is a quarter-res blur of the opaque frame.
* **`postfx.params`**: `exposure, painterly, bloom, grain, vignette, chroma, saturation,
  contrast` are **multipliers** (1 = the player's settings / the hour's grade); `tint` is a
  colour multiplier; `temperature` is added; `letterbox, fade (+fadeColor), horror, amulet,
  blur, distortion` are absolute 0..1. `postfx.debugView = 'shafts'|'paint'|'bloom'|'tensor'|'scene'`.
* **Materials**: extra opts `roughnessMap, aoMap, normalScale, envMapIntensity, puddles (0
  disables), dirtHeight, mossColor, dirtColor, windHeightScale, flutter, envReflect, rim, sss`.
  `setPaintedParams(mat, {...})` changes them live (e.g. ghost `pale`). Wind-animated meshes
  that cast shadows: call `applyWindShadows(root)` once (sets matching depth materials).
  Wind height is measured from the mesh/instance origin, so put tree/grass pivots at the
  base (vines/cloth hang below their pivot).
* **Sky**: `sky.sunAzimuth` (deg, 0 = −Z, 90 = +X) aims the sunrise; `sky.setWetness(v)`;
  `sky.flash(k)` (lightning, auto during heavy dread rain; `sky.lightning=false` disables);
  `sky.overrides = {fogDensity}`; `sky.sunVisibility`, `sky.grade` (read by PostFX).
* **lightPool.add** extra spec: `groundY, poolRadius, poolIntensity, beam (true | {length, angle,
  intensity, direction}), onFlicker({type:'on'|'off'|'stutter'|'restrike'|'spark', handle,
  position}), scatter`. Handles also expose `level`, `position`, `setPosition(v)`, `beam`.
  The 4 nearest lamps feed fog in-scattering + reflections on wet surfaces.
* **particles.emit** extra opts: `height, groundY, seed, active, autoDispose`; handle
  `.burst(pos?)` re-triggers sparks. Camera-centred when no position/object: rain, splash,
  dust, pollen, mist. Rain/splash density follows `uRain`.
* **createVolumetricBeam({color, length, angle, intensity, noise, groundY})** → Mesh (apex at
  origin, beam along local −Z); `mesh.userData.setIntensity/setColor/setGroundY`.

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
* Additions (textures module):
  * Every surface has companions: `<key>_normal` (most), `<key>_rough` (asphalt, concrete, rust,
    metal_painted, roof_corrugated, gold_leaf, red_lacquer, chrome_dirty, leather_seat, dash_plastic,
    skin, fabric_silk, taxi_paint), `asphalt_height`, `water_ripple_height`. Data maps are NoColorSpace.
    `TEXTURE_KEYS` lists everything. Extra keys: `gravel leaf_litter wood_planks cloth_normal
    taxi_paint_green taxi_paint_yellow glass_dirt_windshield road_stencils`.
  * `taxi_paint` is a near-white weathering layer to multiply with `material.color`; the
    `_green` / `_yellow` variants are fully painted. Grime/mud collect toward v=0 (map v=0 to the sills).
  * Foliage atlases are RGBA (alphaTest 0.5, colour bled under alpha); `FOLIAGE_ATLAS[key].cells[]` =
    `{name, uv:[u0,v0,u1,v1], base, tip, tileU?, tileV?}` in three.js uv space (v up).
  * `ROAD_MARKINGS.road_lines.strips[name] = {uv, centerU, color, lineWidth, dash}`: 0.5 m-wide strips,
    12 m per v repeat (`centre_dashed_white centre_double_yellow edge_white centre_solid_yellow
    edge_white_dashed edge_yellow centre_dashed_yellow worn_white`); `ROAD_MARKINGS.road_stencils.cells`
    (ช้าลง / SLOW / arrows / zebra / stop line / chevrons). Use as alpha-blended decals.
  * `SIGN_KINDS` (opts + gallery variants). `signTex` result `userData = {kind, aspect, alpha, size:[m,m], normalMap?}`;
    `opts.weather` scales the ageing (0 pristine … 1.5 ruined).
  * `await preloadTextures(keys?, onProgress?)` generates families in a Web Worker pool (parallel, off the
    main thread); call it behind the loading screen **before** building the world. `preloadSigns(list)`,
    `setTextureQuality(q)` (low/medium = half resolution), `textureStats()`, `isTextureReady(key)`.
  * Sandboxes: `textures` (gallery: `mode=grid|key|atlas|signs|sign`), `textures-scene` (night road in context).

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

**Props implementation notes (props agent).** Full factory list + returned anchors are in the
header of `src/props/index.js`. Integration rules for the world / gameplay:
* **Facing:** every roadside prop's front is local **+Z**; `roadsideYaw(landmark.yaw, side)`
  gives the yaw that turns it toward the road (`'L'` → yaw + π/2, `'R'` → yaw − π/2, `'C'` →
  faces oncoming traffic). Poles/streetlights: place with yaw = travel yaw (wires run along ±Z,
  lamp arm toward +X·`lampSide`, so on the LEFT edge +X is over the road). Bridge: deck along
  local Z, top at y=0, place at the road centre with yaw = travel yaw (the world carves the creek;
  piers go `depth` m down). Ghost gate: spans local X across the ghost road.
* **Ma Ruay shrine:** origin = the fork point on the main road (layout `shrineMaRuay`, side C);
  the building stands `setback` (14 m) ahead in the wedge, signposts at `noseZ` (−6 m). Keep the
  branch roads outside `result.footprint`. `handSpawnAnchor` defaults to (−11, 0, −26): move it
  onto the real ghost spline if needed. `statueHead` is a separate Group (swap/animate it for the
  final reveal); `statueFaceAnchor` is a camera target.
* **Lights:** factories do NOT auto-register lights (the prop isn't placed yet). After placing,
  call `addPropLights(result)` (or create with `opts.lights === true`); emissive lamp meshes then
  follow the pooled light's live flicker level. `disposeProp(result)` removes lights + geometry.
* **Wires:** `connectPoles(poleA, poleB, {seed, messy})` wires two placed poles (pairs anchors by
  kind, returns a world-space Object3D). `wireSpan.userData.sample(i, t, out)` = point on cable i.
* **Raised floors:** `walkSurfaces` (local rects with a `y`, or ramps) for sala floor (0.16 m),
  shrine platform (0.42 m), forest temple stairs/platform (1.2 m), garage floor.
* **Pond:** water sits at y≈0.035 on flat ground inside a low rim: flatten terrain within
  `radius·1.35`.
* **LOD/perf:** offerings and clutter sit in a `THREE.LOD` child hidden beyond 30–45 m. Typical
  draw calls: plain pole 5–7, streetlight 6, spirit house ~15 (8 beyond LOD), sala ~20,
  garage ~40, shrine ~45 (hero pieces). All non-emissive materials are shared singletons with an
  identical attribute layout, so props can be merged per chunk by material.
* **Sandbox:** `?sandbox=props&item=<name|all>&hour=22&dist&yaw&h&ty&tx&tz&fov&fill&lights=0`.

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

Implementation notes (audio agent):
* Generators are pure JS (`src/audio/Synth/*`: modal, Karplus-Strong, Klatt-style formant
  voice, pulse-model engine, granular) rendered in 2 module Web Workers (`Gen.js`) and
  cached as AudioBuffers (LRU ~72 MB); everything is warmed in the background after
  `audio.init()`. `new AudioSystem({offline:true}).attachContext(offlineCtx, {sync:true})`
  runs the same code in an OfflineAudioContext (see `src/sandbox/audio.js`).
* `audio.init()` is also auto-hooked to the first pointerdown/keydown/touchstart. Calls
  before init are safe: `play()` is a no-op, `loop()` returns a pending handle that starts
  on init, subsystem state (engine/ambience/music/radio) is remembered and applied.
* Extra API: `audio.playBuffer(buf, opts)`, `audio.setEnvironment('forest'|'garage'|'shrine'|'hall')`,
  `audio.stopAll()`, play opts `variant`, `count`/`interval` (repeat), `muffle`, `reverb`,
  `pan`, `offset3`, `mustPlay`; `engineSound.setSpeed(kmh)`, `.setSurface(kind)`,
  `.setOn(on,{instant,stall})`, `.attach(engineObj, bodyObj)`; `ambience.set()` also
  takes `enabled`, `autoMuffle` (on by default: `insideCar`/`windowsOpen` drive `setMuffle`);
  `radio.setHour(h)` (also follows bus `game:hour`); `voice.estimate(line)`.
* Bus events: `audio:ready {sampleRate}`; `audio:radio {on, station, song, title, memory}` —
  `song` is `'lukthung_N'|'ballad_N'|'dj'|'dhamma'|'father_song'|'static'`, and
  `memory: 'm_song'` while station 3 plays the father's song (03:00–04:00).
* Mix: each sound id is loudness-normalised to a per-id target (`Synth/registry.js`
  `LOUD`); place cabin sounds at the taxi anchors (refDistance ~1 m), world sounds where
  they happen. Only a brick-wall limiter sits on the master (no glue compressor).

### ui (`src/ui/index.js`)
DOM overlay in `#ui`. Elegant and minimal, Thai+English typography; no persistent HUD.
Full keyboard/gamepad navigation of menus.
* `ui.init(root)` mounts (idempotent; any method lazily inits on `#ui`). Every screen is
  driven by `src/ui/nav.js`: mouse, keyboard (arrows/WASD, Enter/Space/F, Esc/Backspace,
  Q/E tabs, Del/X delete) and gamepad (d-pad/stick, A/B, LB/RB, X, Start).
* While a **modal** screen is open (menu, pause, settings, slots, credits, confirm, ending)
  the UI swallows its keys before core/Input, consumes every input action each frame
  (order −99) and blocks canvas clicks; buttons still held when it closes are drained until
  released. `bus 'ui:modal' {open}`; `ui.modalOpen`. Pointer lock is released on open; the
  game re-requests it (e.g. `input.requestPointerLock()` inside `onResume`).
* `choice()` is non-modal by default (driving continues; ←/→, 1–3, Enter, d-pad + A);
  focus starts on `defaultKey`; `{modal:true}` for paused dialogue.
* Extras beyond the stub: `confirm({th,en,subTh,subEn,yes,no,danger})`, `fade(on, secs)`,
  `setDevice('keyboard'|'gamepad')`, `pauseVisible`, `showPause({..., time, th, en})`
  (clock + ride shown top-right), `deathCard({..., sub, hold, keepBlack})`,
  `ending({..., credits, keepBlack})` (defaults come from `ENDINGS[id]`: title, subtitle,
  epilogue cards, creditsExtra), `subtitle({..., queue:true})`, `toast(th, en, {duration})`,
  exports `glyph(token)`, `DEFAULT_RULES`, `HIDDEN_LINE`.
* The crosshair is visible by default and auto-hides under menus / loading / death /
  ending; `setCrosshair(false)` for cinematics.
* `drawRulesPaper(ctx, w, h, data)`: await `loadFonts()` first. Outside the torn page is
  **transparent** (use `transparent`/`alphaTest`, or pass `data.background`). Annotation
  values may be strings or `{th, en}` (`PENCIL_NOTES`); keys that are not rule ids
  (e.g. `p:sri`) become the player's notes list; key `hidden` sits beside the hidden line.
  `revealed` rules get a pencil tick. Optional `hiddenAlpha` (0..1) fades the hidden line.
  Base layer cached per size; ~100–200 ms per redraw on CPU.
* Text sources: `GAME_TITLE.th`, `LOADING_LINES`, `PAPER`, `CREDITS*`, `DEATH_FOOTER`,
  `ENDINGS` from `src/game/data` (with built-in fallbacks).

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
Choice lines use exactly the shape `src/game/Dialogue.js` plays (`line.choice = {id, options,
defaultKey, timeout?, branches?, setOnPick?}`). Each ride has `pacing {cruiseKmh, minSeconds,
stretch:'none'|'fog'|'mist', speedCapKmh?}` and beats may be `essential` or gated with
`if.memories`: ride progress is `min(distance/route, time/minSeconds)` and the fork must not be
reached before essential beats have played (late routes are only 0.5–1 km long; the fog/mist
"stretches" the road). Radio station numbers 1..4 match `src/audio/Radio.js`. Story canon notes
are at the end of `SCHEMA.md`.
Validate with `node -e "import('./src/sandbox/narrative-validate.js').then(m=>m.runNode())"` or the
`narrative` sandbox (it also simulates each ride's dialogue timeline and warns on pile-ups).
