# Character asset credits

Base human meshes and animation clips reused from the same author's game *เฮียผัด! (Hia Phat!)*
(`PukkingDragon123/special-telegram`, `public/assets/gen/characters/`). All CC0.

| file | original source | author | licence |
|---|---|---|---|
| `public/assets/characters/body_m.glb`, `body_m.json` | "Universal Base Characters [Standard]" (Superhero_Male_FullBody, Godot/UE-style skeleton), https://quaternius.itch.io/universal-base-characters | Quaternius | CC0 1.0 |
| `public/assets/characters/body_f.glb`, `body_f.json` | "Universal Base Characters [Standard]" (Superhero_Female_FullBody), https://quaternius.itch.io/universal-base-characters | Quaternius | CC0 1.0 |
| `public/assets/characters/anims.glb` | "Universal Animation Library [Standard]" (UAL1_Standard.glb, 43 clips), https://quaternius.itch.io/universal-animation-library | Quaternius | CC0 1.0 |

Processing (done for Hia Phat in headless Blender, `scripts/characters/build_chars.py` there): seam weld,
muscle softening, eye sockets filled, eyes/brows/hair removed, decimated to 4.6k (hi) / 1.5k (lo) tris,
atlas-layout UVs, plane-cut clothing shells (tops, sleeves, bottoms, shoes, skirts) with transferred
weights, and measured torso/neck/head tables (`body_*.json`). The animation clips are unmodified.

## MakeHuman characters (`public/assets/characters/mh/`)

Built offline with headless Blender 4.2 and the MPFB2 extension (`tools/characters/build_mh.py`, `textures.py`).
MPFB2 (GPL code) is only used as a build tool; nothing from its code ships with the game. Everything below is CC0 1.0.

| asset | source | author | licence |
|---|---|---|---|
| base mesh, macro / detail targets, "game engine" rig weights (in `mh.bin`) | MPFB 2.0.18 data (https://extensions.blender.org/add-ons/mpfb/), MakeHuman system assets | MakeHuman team (Data Collection AB, Joel Palmius, Jonas Hauquier) | CC0 1.0 |
| skins `tex/skin_{young,middle,old}_{m,f}.jpg` (young/middleage/old asian male/female) | makehuman_system_assets_cc0.zip, https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html | MakeHuman team | CC0 1.0 |
| eyes (high-poly eyeball, brown iris `tex/eye.jpg`), teeth_base, tongue01, eyebrow001/003/006/010, eyelashes01/02 | makehuman_system_assets_cc0.zip | MakeHuman team | CC0 1.0 |
| hair long01, bob01, bob02, ponytail01, braid01, short01, short02, short03, short04, afro01 (`tex/hair_*.webp`) | makehuman_system_assets_cc0.zip | MakeHuman team | CC0 1.0 |
| hair cortu_short_messy_hair, toigo_blunt_bob_with_bangs | hair01 asset pack (hair01_cc0.zip), https://static.makehumancommunity.org/assets/assetpacks/hair01.html (both the pack metadata and the asset files say CC0) | Cortu Johnstone, Margaret Toigo (MRT) | CC0 1.0 |
| ARKit face units (expression morphs) | faceunits01 pack, https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html | Mika Suominen | CC0 1.0 |
| low-poly LOD bodies male1591 / female1605 | makehuman_system_assets_cc0.zip (proxymeshes) | MakeHuman team | CC0 1.0 |

Hair01 items whose files carry an AGPL3 MakeClothes header contradicting the pack's CC0 tag (e.g. the bun, the
culturalibre and sonntag78 styles) are deliberately not used.

Our own work (no third-party data): the clothing shells and their atlas UVs, the wet-hair veil, the hair bun, the body blends,
face-detail choices per cast member, the T-pose conversion, all shaders and runtime code. Hair, brow and lash
textures are converted to grey + alpha and tinted at runtime; skins are tinted to each character's skin tone.
