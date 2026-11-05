# Vehicle models (Blender, headless)

The hero taxi, its exterior LOD and the intro motorbike are built entirely by Python scripts
run in Blender 4.2 LTS. Nothing is hand-edited, so every model can be rebuilt from this folder.

| file | builds |
|---|---|
| `vlib.py` | shared helpers: splines, grid / Coons-patch meshing, lathe / sweep, panel finishing (rolled edges + return flanges), booleans, materials, atlas unwrap, mask baking, GLB export + post-processing |
| `taxi_body.py` | parametric body surface traced from an orthographic E100-era sedan blueprint (sections, plan outline, hood / deck / roof heightfields, greenhouse) |
| `taxi_exterior.py` | cuts the surface into real panels (4 doors, hood, trunk lid, bumpers, fuel flap) with true gaps, rolled edges, arch lips, lamp openings; glass, sashes, seals, drip and belt mouldings |
| `taxi_parts.py` | lamps (housing, reflector bowl, bulb, fluted lens), grille + original badge, bumper inserts, plates, mirrors, handles, keyholes, mouldings, fuel filler, wipers, wheels (tread, steel rim, vented hubcap), TAXI-METER sign on a gutter rack, antenna, mud flaps, exhaust, underbody |
| `taxi_interior.py` | right-hand-drive interior: dashboard with binnacle hood, cluster (gauge faces + needles), centre stack, glovebox, 4-spoke wheel, stalks, ignition, meter box, vacant lamp, seats (bolsters, piping, stitched channels, wooden-bead cover on the driver seat), rear bench, door cards, pillars, sagging headliner, visors, mirror, belts, carpet, console, levers, pedals |
| `build_taxi.py` | assembles nodes / pivots / anchors, applies the triangle budget, unwraps atlases, bakes + paints them, exports `taxi.glb` and `taxi_lod.glb` (gltfpack) |
| `weather.py` | texture painter: bakes AO / curvature / cavity + position / normal / material-id maps, then paints the weathered albedo + ORM atlases (CC0 photo detail, chips, rust, grime, fading) and swaps in the export materials |
| `render_glb.py` | review renders of an exported GLB (`.shots/blender-<name>-<cam>.png`), exterior and cabin cameras |
| `build_moto.py` | intro step-through motorbike, exports `moto.glb` |
| `review.py` | studio lights + standard cameras for optional review renders (`.shots/blender-*.png`) |
| `check_glb.py` | node-free contract check of the exported GLBs (parses the JSON chunk) |

## Rebuild

```sh
# Blender 4.2 LTS (headless tarball) - e.g. into a scratch dir:
curl -LO https://download.blender.org/release/Blender4.2/blender-4.2.23-linux-x64.tar.xz
tar -xf blender-4.2.23-linux-x64.tar.xz
B=./blender-4.2.23-linux-x64/blender

$B -b --factory-startup -P tools/blender/build_taxi.py -- [--nobake] [--size 2048] [--samples 4] [--ao 8] [--nopack] [--out dir] [--blend out.blend]
$B -b --factory-startup -P tools/blender/build_moto.py -- [--nobake] [--size 2048] [--samples 4] [--ao 8] [--nopack]
$B -b --factory-startup -P tools/blender/render_glb.py -- --glb public/assets/vehicle/taxi.glb --cams front34,pov,back
python3 tools/blender/check_glb.py public/assets/vehicle/taxi.glb public/assets/vehicle/taxi_lod.glb public/assets/vehicle/moto.glb
```

Cycles CPU bakes the masks, numpy paints the atlases; copies land in `.shots/blender-bake/`
(ignored by git). `--nobake` is for quick geometry iterations (flat export materials). The
exports are post-processed with `npx gltfpack@0.21.0 -kn -km -ke -vpf -vtf` (vertex-cache order,
8-bit normals via KHR_mesh_quantization; positions and UVs stay float because the game rebuilds
glass and mirror geometry in place; no meshopt / Draco: the vehicle loader has no decoder).
Outputs go to `public/assets/vehicle/`.

## Frames and units

* Metres. Blender X = right, Y = forward, Z = up; the glTF exporter (+Y up) maps it to three.js
  `(x, y, z)_three = (x, z, -y)_blender`: **forward is -Z, up is +Y, the driver sits at +X**
  (right-hand drive, Thailand drives on the left).
* Taxi origin: on the ground under the middle of the body (bumpers at z = -2.135 / +2.135 in
  three.js). Wheelbase 2.465 (front axle z = -1.31, rear axle z = +1.155), track 1.46 / 1.45,
  wheel radius 0.292, length 4.27, width 1.69, roof 1.373 (TAXI-METER sign top ~1.58).
* Motorbike origin: on the ground at mid-wheelbase; wheelbase 1.22, wheel radius 0.276.

## Node contract (taxi.glb)

Hierarchy: `taxi` (root) > `body` and `wheel_*`. Everything else hangs under `body` except:
side glass, window cranks and the side-mirror surfaces under their door; `mirror_rear_surface`
under `rearview_mirror`. Extra (non-contract) nodes: `interior` (static interior mesh, child of
`body`), `cluster_glass` (instrument cover), `glass_ql` / `glass_qr` (fixed rear quarter glass in
the rear doors, glass ids `ql` / `qr`).

* Body and glass: `body`, `glass_windshield`, `glass_rear`, `glass_fl`, `glass_fr`, `glass_rl`,
  `glass_rr` (+ `glass_ql`, `glass_qr`). Side glass is parented to its door; slide it along the
  door's local -Y (down) to roll the window into the door (about 0.42 m of travel).
* Mirrors: `mirror_rear_surface`, `mirror_left_surface`, `mirror_right_surface` (flat reflector
  surfaces in front of the housings, `mirror` material, 0..1 UVs, u increases to the driver's right).
* Pivots (origin on the real pivot, **rest rotation is identity**). Each carries glTF extras
  (three.js `userData`): `pivotAxis` = unit axis in the node's local (= parent) three.js frame,
  `rangeDeg` = suggested [min, max], `pivotKind`. Positive angles open / press / raise:

  | node | axis (three.js) | range | meaning |
  |---|---|---|---|
  | `door_fr` `door_rr` | (0, 1, 0) | 0..70 | hinge at the front edge, swings out |
  | `door_fl` `door_rl` | (0, -1, 0) | 0..70 | same, mirrored |
  | `hood` | (1, 0, 0) | 0..55 | hinge at the cowl, front edge rises |
  | `trunk` | (-1, 0, 0) | 0..65 | hinge behind the rear window, rear edge rises |
  | `wheel_*` | (-1, 0, 0) | - | origin at the wheel centre, + = rolling forward |
  | `steering_wheel` | column axis toward the driver | -540..540 | + = turning left (CCW seen by the driver) |
  | `needle_*` | into the dash | 0..270 (fuel/temp 0..72) | rest on the zero mark, + = clockwise as the driver sees it |
  | `gear_lever` | (1, 0, 0) | -12..12 | pivot at the ball under the boot (tilt about local Z for the gate) |
  | `handbrake_lever` | (1, 0, 0) | 0..22 | + = pulled up |
  | `pedal_*` | (1, 0, 0) | 0..18 | hanging pedals, pivot under the dash, + = pressed |
  | `glovebox_lid` | (1, 0, 0) | 0..75 | hinge at the bottom edge |
  | `sun_visor_driver` | (1, 0, 0) | 0..95 | hinge along the header, + = folds down |
  | `window_crank_*` | across the door card | 0..3600 | about 10 turns for full glass travel |
  | `rearview_mirror` | (0, 1, 0) | -15..15 | ball joint |
  | `key_slot` | (1, 0, 0) | 0..90 | ignition cylinder (ACC / ON / START) |
  | `wiper_l` `wiper_r` | cowl normal at the spindle | 0..95 | parked along the base pointing left (RHD), + = sweeps up |

* Lights (separate lens meshes so they can glow): `light_head_l/r` (main headlamp lenses),
  `light_tail_l/r` (red tail band), `light_ind_fl/fr` (amber bumper lamps), `light_ind_rl/rr`
  (amber top strip of the tail units), `light_brake` (lower red segments, both sides),
  `light_reverse` (lower inner white segments, both sides), `roof_sign` (TAXI-METER box body),
  `vacant_lamp` (two faces: front and back of the dash sign, 0..1 UVs each; write "ว่าง").
  Housings, reflectors and bulbs are static geometry in `body`; corner (parking) lamps are clear
  lenses inside the headlamp housings (static).
* Display quads (clean 0..1 UVs, u to the viewer's right, v up; `display` material, the game
  skins them): `meter_display`, `radio_display`, `gauge_speedo`, `gauge_tacho`, `gauge_fuel`,
  `gauge_temp` (square, dial centre = quad centre = needle pivot, laid out for
  `VehicleTextures.gaugeTex`), `dome_light` (cabin lamp lens), `plate_front`, `plate_rear`
  (340 x 150 mm). Needles rest on the gauge's zero mark (7:30 o'clock on the big dials, E / C on
  the small ones) and sweep clockwise.
* Anchors: one empty per `TAXI_ANCHORS` key, named exactly like the key and tagged
  `userData.anchor = key`. `hood` and `trunk` exist both as the pivot meshes and as anchor
  empties (children of those meshes), so look anchors up by `userData.anchor`. Anchors that
  follow moving parts are parented to them (`hornPad`/`steeringWheel` > `steering_wheel`,
  `gloveBox` > `glovebox_lid`, `sunVisorDriver` > `sun_visor_driver`, `rearviewMirror`/`amuletHang`
  > `rearview_mirror`, `doorXX`/`mirrorLeft`/`mirrorRight` > doors, `windowCrankFL/FR` > cranks,
  `keySlot`, `gearKnob`, `handbrake`, `pedal*` > their levers, `hood`/`trunk` > lids). Positions
  follow this model, not the old procedural taxi.
* Not modelled on purpose: hanging amulets and the jasmine garland (game physics), the ignition
  key, the dashboard Buddha, the photo in the visor and the cartoon sticker (anchors provided).

## Motorbike contract (moto.glb)

`moto` (root) > `body`, `handlebar` (steering pivot, `pivotAxis` = steering axis pointing up,
range -38..38, + = turning left), `wheel_r`, `light_tail`; under `handlebar`: `wheel_f`,
`light_head` and the empties `handleL`, `handleR`, `headlight`. Root empties: `seat`, `footL`,
`footR`, `eye`. Wheels spin about local (-1, 0, 0) (+ = rolling forward).

## Materials and painted atlases

The build uses semantic materials (`paint_green`, `paint_yellow`, `chrome`, `rubber`, `plastic_dash`,
`vinyl_seat`, ...; `vlib.MAT_DEFS`). Each atlas is unwrapped (smart projection, uniform texel
density, concave packing), then `weather.py` bakes R = AO (0.45 m), G = edge / curvature, B = cavity,
plus world position / normal / material id, and paints per texel:

* **paint**: two-tone livery (yellow above the shoulder crease, green below) with CC0 photo
  streaks and water spots, faded chalky clearcoat on roof / bonnet / boot lid, chips to primer and
  bare metal on edges, fingernail scratches and chips in the door-handle cups, stone chips low and
  on the nose, scuffed bumper ends, rust bleeding out of seams in streaks, rust at the wheel arches
  and sills, road grime and mud low on the body, dust in every cavity;
* **trim**: pitted chrome, sun-faded black plastic, browned tyre sidewalls with dusty grooves,
  chipped and rusty black steel wheels, yellowed headlamp lenses;
* **cabin**: sun-bleached, cracked dash top, hand-polished edges and kick scuffs on the plastics,
  stained headliner (nicotine, water rings, sagging corner), worn and stained grey-blue seat
  fabric (pale bolsters and cushion centres), a bald carpet patch under the driver's heel, varnished
  beads.

Output per atlas: **albedo** (sRGB JPEG, `baseColorTexture`) and **ORM** (R = AO, G = roughness,
B = metalness; `occlusionTexture` + `metallicRoughnessTexture`). Export materials (11):

| export material | from | atlas |
|---|---|---|
| `paint` | paint_green, paint_yellow | ext_paint (2048) |
| `chrome` | chrome, metal_steel | ext_parts (2048) |
| `rubber_black` | rubber, plastic_black, paint_black | ext_parts |
| `lens` (blend 0.82) | lens_clear, lens_red, lens_amber | ext_parts |
| `sign_lamp` | sign_panel, sign_text (roof sign) | ext_parts |
| `plastic_dash` | plastic_dash | int_hard (2048) |
| `fabric_carpet` | fabric_headliner, carpet | int_hard |
| `vinyl_seat` | vinyl_seat (seat fabric), wood_beads | int_soft (1024) |
| `glass` | glass (removed / rebuilt by the game) | - |
| `display` | gauge / meter / radio / plate quads, dome lens (skinned by the game) | - |
| `mirror` | mirror surfaces (replaced by the game's mirrors) | - |

Lens and roof-sign nodes keep the atlas as `map`, so the game's emissive lens materials glow in
the painted colours. The bike uses `paint_moto`, `chrome`, `rubber_black`, `lens`, `vinyl_seat`
(cracked black vinyl), `glass`, `mirror` on one `moto` atlas.

## Triangle budget

`build_taxi.DECIMATE` collapses parts that are small on screen (wheels, grille, underbody, seals,
door cards, seats...) after modelling; panels, glass, lamps, displays, dash and cluster keep their
full meshes. The bead cover uses ~380 low dome beads. The LOD (`taxi_lod.glb`, exterior + a crude
cabin) is a decimated copy with 512 px atlases.

## Weathering in geometry

A small dent in the left rear door, a sagging headliner corner (rear left), a crack in the
passenger-side dash top pad. Everything else (rust, peeling, grime) belongs to the painterly
shaders driven by the masks.
