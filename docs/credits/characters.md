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
