# Prop model credits

Everything else in `src/props/` is procedural. The models below are optional real-world clutter
loaded at boot by `loadPropAssets()` (`src/props/lib/assets.js`) from `public/assets/props/<id>.glb`.
Every factory has a procedural fallback, so the game still works without them. In-engine they are
re-graded and given the painterly `paintedMaterial` (brush modulation, baked grime and moss vertex
colours, fog, wetness) so they don't read as photo-scanned.

All models are from [Poly Haven](https://polyhaven.com) and are **CC0 1.0** (public domain, no
attribution required; credited anyway). No NC, ND or unknown licences are used.

## Reused from เฮียผัด! (Hia Phat!)

These were reused from the same owner's game *เฮียผัด!* (`PukkingDragon123/special-telegram`,
`public/assets/gen/world/models/`), where they were downloaded from Poly Haven and optimised
(meshoptimizer simplification, meshopt geometry, WebP textures). Each one is listed as CC0 in
that repo's `CREDITS.md` / `manifest.json`. Its `_stall/` photo textures (some CC BY 2.0) were
**not** copied.

| model (`id`) | source | author(s) | licence |
|---|---|---|---|
| Plastic Monobloc Chair 01 (`plastic_monobloc_chair_01`) | https://polyhaven.com/a/plastic_monobloc_chair_01 | Kuutti Siitonen | CC0 |
| Old Tyre (`old_tyre`) | https://polyhaven.com/a/old_tyre | MP | CC0 |
| Wooden Crate 01 (`wooden_crate_01`) | https://polyhaven.com/a/wooden_crate_01 | James Ray Cock | CC0 |
| Plastic Crate 02 (`plastic_crate_02`) | https://polyhaven.com/a/plastic_crate_02 | Fabi_G | CC0 |
| Barrel_01 (`Barrel_01`) | https://polyhaven.com/a/Barrel_01 | Jorge Camacho | CC0 |
| Barrel 03 (`barrel_03`) | https://polyhaven.com/a/barrel_03 | Serhii Khromov | CC0 |
| Power Box 01 (`power_box_01`) | https://polyhaven.com/a/power_box_01 | Rico Cilliers, Yann Kervran | CC0 |
| Utility Box 01 (`utility_box_01`) | https://polyhaven.com/a/utility_box_01 | James Ray Cock | CC0 |
| Small Lpg Tank (`small_lpg_tank`) | https://polyhaven.com/a/small_lpg_tank | Ulan Cabanilla | CC0 |
| Propane Tank (`propane_tank`) | https://polyhaven.com/a/propane_tank | Slinc | CC0 |
| Cardboard Box 01 (`cardboard_box_01`) | https://polyhaven.com/a/cardboard_box_01 | Rahul Chaudhary | CC0 |
| Trashbag (`trashbag`) | https://polyhaven.com/a/trashbag | Benny Weimer | CC0 |
| Folding Wooden Stool (`folding_wooden_stool`) | https://polyhaven.com/a/folding_wooden_stool | Ulan Cabanilla | CC0 |
| Metal Stool 02 (`metal_stool_02`) | https://polyhaven.com/a/metal_stool_02 | Ulan Cabanilla | CC0 |
| Can Rusted (`can_rusted`) | https://polyhaven.com/a/can_rusted | Rahul Chaudhary | CC0 |
| Wicker Basket 01 (`wicker_basket_01`) | https://polyhaven.com/a/wicker_basket_01 | Kuutti Siitonen | CC0 |
| Wicker Basket 02 (`wicker_basket_02`) | https://polyhaven.com/a/wicker_basket_02 | Kuutti Siitonen | CC0 |
| Worn Metal Rack (`worn_metal_rack`) | https://polyhaven.com/a/worn_metal_rack | Luca B | CC0 |
| Steel Frame Shelves 02 (`steel_frame_shelves_02`) | https://polyhaven.com/a/steel_frame_shelves_02 | James Ray Cock | CC0 |
| Plastic Jerrycan (`plastic_jerrycan`) | https://polyhaven.com/a/plastic_jerrycan | Ulan Cabanilla | CC0 |
| Cement Bag (`cement_bag`) | https://polyhaven.com/a/cement_bag | PierreB3D | CC0 |
| Plastic Broom (`plastic_broom`) | https://polyhaven.com/a/plastic_broom | L | CC0 |
| Jug 01 (`jug_01`) | https://polyhaven.com/a/jug_01 | Kuutti Siitonen | CC0 |
| Hand Truck (`hand_truck`) | https://polyhaven.com/a/hand_truck | Mutanzom3D | CC0 |
| Multi Cleaner 5 Litre (`multi_cleaner_5_litre`) | https://polyhaven.com/a/multi_cleaner_5_litre | James Ray Cock | CC0 |
| Cleaner Tin 01 (`cleaner_tin_01`) | https://polyhaven.com/a/cleaner_tin_01 | Tom Phillips | CC0 |
| Ceramic Pot (`ceramic_pot`) | https://polyhaven.com/a/ceramic_pot | Aron Łyczek | CC0 |
| Dustpan (`dustpan`) | https://polyhaven.com/a/dustpan | Balen | CC0 |

## Fetched from Poly Haven for this game

Downloaded through the public API (`https://api.polyhaven.com/files/<id>`, glTF 1k). Textures
were downscaled to 512 px JPEG and each model was packed into a single GLB. `plastic_thermos`
was rejected because its texture carries a brand-like label.

| model (`id`) | source | author(s) | licence |
|---|---|---|---|
| Television 01 (`Television_01`) | https://polyhaven.com/a/Television_01 | Gabriel Radić | CC0 |
| Bench Vice 01 (`bench_vice_01`) | https://polyhaven.com/a/bench_vice_01 | Yann Kervran, Antanas Kep | CC0 |
| Brass Pot 01 (`brass_pot_01`) | https://polyhaven.com/a/brass_pot_01 | Rico Cilliers | CC0 |
| Ceramic Vase 01 (`ceramic_vase_01`) | https://polyhaven.com/a/ceramic_vase_01 | James Ray Cock | CC0 |
| Ceramic Vase 03 (`ceramic_vase_03`) | https://polyhaven.com/a/ceramic_vase_03 | James Ray Cock | CC0 |
| Chinese Stool (`chinese_stool`) | https://polyhaven.com/a/chinese_stool | Kirill Sannikov | CC0 |
| Chinese Tea Table (`chinese_tea_table`) | https://polyhaven.com/a/chinese_tea_table | Kirill Sannikov | CC0 |
| Combination Wrench (`combination_wrench`) | https://polyhaven.com/a/combination_wrench | BKS | CC0 |
| Cross Pein Hammer (`cross_pein_hammer`) | https://polyhaven.com/a/cross_pein_hammer | Tics | CC0 |
| Crowbar 01 (`crowbar_01`) | https://polyhaven.com/a/crowbar_01 | Alexander Otterbeck | CC0 |
| Flathead Screwdriver (`flathead_screwdriver`) | https://polyhaven.com/a/flathead_screwdriver | Dylan Detwiller | CC0 |
| Handsaw Wood (`handsaw_wood`) | https://polyhaven.com/a/handsaw_wood | Konrad Szałankiewicz | CC0 |
| Metal Tool Chest (`metal_tool_chest`) | https://polyhaven.com/a/metal_tool_chest | Yann Kervran, John Hutcheson | CC0 |
| Oil Tin (`oil_tin`) | https://polyhaven.com/a/oil_tin | Niklas | CC0 |
