# Character system (`src/characters/glb/`)

People are **MakeHuman bodies** (CC0) re-posed into the Quaternius T-pose, so the CC0 Quaternius *Universal
Animation Library* clips play on them unchanged. Faces, eyes, teeth, hair cards, brows and lashes are real
MakeHuman geometry with photo-based CC0 skins; clothes are shells cut from the body surface and dressed by the
procedural atlas painters. The older Quaternius bodies stay as an automatic fallback (if the pack is missing or
a build throws). See `docs/credits/characters.md` for sources and licences.

## Pipeline (reproducible, `tools/characters/`)
```
# headless Blender 4.2 + the MPFB2 extension + MakeHuman asset packs in a private user dir
BLENDER_USER_RESOURCES=<dir> blender --background --python tools/characters/build_mh.py
python3 tools/characters/textures.py          # skins, hair, parts atlas, eyes -> public/assets/characters/mh/tex
```
* `cast.py`: the body basis — one MakeHuman body per cast member (age, sex, build, Thai race mix, face targets,
  height solved by the height macro) plus background archetypes (tall lanky man, pot-bellied man, stocky man,
  old balding man, young / middle-aged / old / plump old women, children). Also the face-detail axes, the ghost
  "uncanny" morph recipe, the ARKit face units kept, and the hair / brow / lash proxies.
* `build_mh.py`: neutral body B0 → T-pose (limbs aligned to the Quaternius joints; spine, neck and head untouched),
  bodies as int16 deltas + 65 Quaternius-named joints, body render mesh (MakeHuman UVs), MPFB "game engine" weights
  renamed to the Quaternius bones, vertex masks (lips, scalp, ears, nails, head), sparse morphs, proxies bound to
  base vertices (mhclo-style), landmarks. Output: `public/assets/characters/mh/mh.json` + `mh.bin`.
* `shells.py`: clothing cut from B0's surface (tops t/u/l/j, sleeves cap/short/rolled/long, bottoms
  shorts/knee/trousers/loose, tube skirts knee/wrap/wrapknee/long, closed shoes, sandals with a real sole and thong)
  with ease, cloth bridging over hollows, clean planar hems with a turned-back lip, atlas UVs matching `layout.js`,
  and the list of body triangles each garment hides (no skin poking through). Plus the wet-hair veil.

## Runtime
* `mhpack.js` loads the pack and every texture (`loadCharacterAssets()` awaits it).
* `mhrecipe.js`: spec → recipe. Cast ids (`src/game/data/characters.js` and the PRESETS aliases) use their own body;
  other ids blend 2–3 archetypes of the same sex and age band (seeded by the id) plus face-detail axes. Hair styles:
  `long bob bobPlain bobShort ponytail bun braid short crop messy swept shag curls` and `shaved`, `bald`, plus the old
  names (`gray-short` → permed grey curls for women / a thinning crop for men, `pompadour` → swept, `messy` → shaggy
  under 40, unkempt over). The bun (combed-back strands + a twisted knot) is our own geometry; thinning and balding
  are shader effects on any style. Encounter ids get defaults (`yaiSpeed`, `nangTani`, `windowGhost`, `phiTaiHong`).
* `mhperson.js`: builds the person (blended positions, joints, fitted proxies, one merged skinned geometry, the
  expression morph texture, the low-poly LOD from MakeHuman's proxy body) and a skeleton template compatible with
  the rest of the code (rig, IK, look-at, actions, ghost layer, PlayerBody). People with the same recipe share it.
* `mhmaterials.js`: body material (skin / clothes / hair / brows / lashes / teeth / tongue / veil) and eye material,
  plus `driveMHFace` (expressions → 20 morph channels).

### `randomPerson(seed, opts)` (exported from `src/characters/index.js`)
Returns an appearance spec for `createHumanoid` — varied, believable background people:
`opts = { age, sex: 'm'|'f', role: 'market'|'villager'|'monk'|'figure', ghost: false|true|'emaciated'|'hunched'|'child'|'drowned'|'crushed'|'hairOverFace', id }`.
It picks blended bodies, face axes, skin tone (Thai range), hair style and colour by age, stubble / moustache /
moles, posture, outfit by role and, for ghosts, the variant's look and motion.

### Spec additions (all optional)
* `posture: 'normal'|'stoop'|'slouch'|'upright'|'hunch'|'child'`, `tremor: 0..1` (default from age).
* `mh: { body, bodies: [[name, w]], face: { axis: -1..1 }, hair, brows, look: { stubble, moustache, thin, bald,
  shaved, sweat, marks: [['mole'|'scar', anchor, size]], posture } }` for exact control.
* `ghost: { type: 'emaciated'|'hunched'|'child'|'drowned'|'crushed'|'hairOverFace', veins, pupils, hairOverFace,
  veilGap, uncanny, blinkDesync, snapTilts, stutter, breathStop, crush }` besides `pale eyes wet decay bloodStains`.
  `eyes` may be `normal | black | glow | milky`.

## API (unchanged contract, `src/characters/index.js`)
Humanoid: `root, bones (contract names + Quaternius names; jaw/eyeL/eyeR helpers), mode, expression, ghost,
headPosition, eyePosition`, `setMode, walkTo, stopWalking, lookAt, setHandTarget, setFootTarget, sitAt, detach,
setTalking, setExpression, setGhost, play, stop, setLayer, createReflectionDouble (+ setFollow, setOverrides),
setVisible, setOpacity, setGroundFn, update, dispose`, `setGore`, `holdItem`, `dropItem`, `onFootstep`, `onExhale`.

### Ghost layer (`setGhost(params, speed)`)
Existing: `neckTwist headRoll headPitch backbend armTwist limbBreak jitter levitate stretch mouthStretch stare
unlimited noBlink still`. Added (wrongness the eye catches before the brain does):

| param | range | effect |
|---|---|---|
| `uncanny` | 0..1 | eyes a few percent further apart and larger, mouth wider, neck longer (a morph), fingers longer |
| `blinkDesync` | 0..1 | the eyes blink out of sync; one eye may close slowly while the other stares (also with `noBlink`) |
| `snapTilts` | 0..1 | micro head tilts that hold, then snap to a new angle with no transition |
| `stutter` | 0..1 | stutter-frame motion: the whole body holds a pose, then jumps to the live one |
| `breathStop` | 0..1 | breathing stops |
| `veins` | 0..1 | visible blue-grey veins under the pale skin (adds to the look's) |
| `pupils` | -1..1 | pinprick (-1) to fully dilated (1) pupils |
| `hairOverFace` | 0..1 | wet clumps of hair hang over the face (long-haired / ghost looks carry the veil) |
| `veilGap` | -1..1 | a gap in that hair over the left (-) or right (+) eye |

Ghost skin (from the spec's `ghost`): grey-white translucent pallor, veins, bloodless grey-violet lips, dark
sockets, wet sheen, decay mottling, blood stains; `setGore` adds bleeding eyes / mouth and neck / head / chest
wounds, `crush` the caved-in face. Calm ghosts get a little `uncanny` and `blinkDesync` by default (scaled by pallor).

## Performance
Per person: one draw call for skin + clothes + hair + brows + lashes + teeth + tongue (+ veil), one for the eyes,
one for worn accessories. About 26.8k body triangles + teeth 7.1k + eyes 2k + hair 1–8.6k + clothes 4–12k
(the body triangles under clothes are dropped). Expressions use a per-person float texture (only face / proxy rows).
Geometry and template are cached per recipe; textures are shared (6 skins, 14 hair styles, one parts atlas, one eye).
Beyond 25 m the body switches to MakeHuman's low-poly proxy body (~3.2k triangles) with the same clothes and hair.

## Sandbox
`src/sandbox/characters-glb.js`: `view=lineup|faces|single|actions|ghost|gore|mirror|fp|variety|uncanny`.
