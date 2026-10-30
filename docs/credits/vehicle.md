# Vehicle asset credits

`public/assets/vehicle/taxi.glb`, `taxi_lod.glb` and `moto.glb` are **original models**,
built procedurally in code by `tools/blender/*.py` (Blender 4.2 LTS, headless). No third-party
mesh or scan is included. Their painted, weathered texture atlases (albedo + ORM) are baked by
`tools/blender/weather.py` from Cycles AO / curvature / cavity bakes of the models themselves,
procedural noise, and detail sampled from the game's own CC0 photo texture library (below).
Both vehicles are generic and unbadged: no manufacturer names, logos or badges. The grille
emblem (an oval ring around a stylised lotus bud) is an original fictional design.

Free-model check (owner's allowance): Poly Haven has no 1990s sedan (only a covered car),
OpenGameArt only offers low-poly / PSX car packs, and Sketchfab downloads need a login. None met
the quality bar, so nothing was downloaded or used.

## Look-only references (proportions, details; never shipped)

| reference | source | used for |
|---|---|---|
| Toyota Corolla (1992) orthographic blueprint (side, front, rear, top) | the-blueprints.com, https://www.the-blueprints.com/blueprints/cars/toyota/40022/view/toyota_corolla_1992/ | traced profile, plan outline, cross-sections, door / window / wheel positions |
| "1992-1993 Toyota Corolla (AE101) 1.6 GLi Sedan (26-02-2018)" 02-08 | Wikimedia Commons, https://commons.wikimedia.org/wiki/Category:Toyota_Corolla_(E100)_sedan | side / front / rear proportions of a Thai-market E100, lamps, grille, bumpers, mouldings |
| "1992-1993 Toyota Corolla (AE101) 1.6 GLi 4-Auto in Bang Pli Samutprakarn (19-12-2016)" 01-07 | Wikimedia Commons (same category) | three-quarter views, wheel covers, Thai plates |
| "1995-1996 Toyota Corolla (AE101) 1.6 GXi 4-Auto Sedan (28-06-2018)" 01-05 | Wikimedia Commons (same category) | later front / tail lamp details |
| "1991 Toyota Corolla (AE101) SEL Sedan" 01, 03, 04, 05 | Wikimedia Commons (same category) | right-hand-drive dashboard, binnacle, wheel, console, seats |
| "Taxi meter in thailands.jpg" (green-yellow owner-driver taxi with TAXI-METER sign), "Bangkok Toyota Corolla taxi.JPG", "Parked Toyota Corolla cab outside Central Chidlom.jpg", "Taxi-meter in Pattaya 03/04", "Taxi-meter in Udon Thani.JPG", "BKK Taxi.jpg", "Bangkok Taxi.jpg", "Taxis in Khon Kaen 01.jpg", "Taxi (2287388613).jpg" | Wikimedia Commons, https://commons.wikimedia.org/wiki/Category:Taxis_in_Bangkok and https://commons.wikimedia.org/wiki/Category:Taxis_in_Thailand | green-yellow livery split, roof sign shape and rack, plates, vacant lamp placement |
| Brief images `refs/1.jpg`-`5.jpg` | supplied by the game owner | mood (night drive from the driver's seat, worn lived-in materials) |

Real-world dimensions (length 4.27 m, width 1.69 m, height 1.38 m, wheelbase 2.465 m) are
public specifications of the 1990s compact sedan class.

## Photo texture detail (CC0, already in the repo)

The atlas painter samples these library textures (`public/assets/textures/`, built by
`tools/photobash/`; every source is CC0 1.0 and listed with author and source page in
`docs/credits/textures.md`). They are mixed with procedural wear, never shipped as separate files.

| library texture | CC0 sources (see textures.md) | used on |
|---|---|---|
| `vehicle/taxi_paint_yellow`, `vehicle/taxi_paint_green` | ambientCG Scratches001, Scratches004, SurfaceImperfections006, Leaking004, Rust004 | body paint streaks, scratches, water spots, sill rust |
| `built/rust` | Poly Haven rust_coarse_01, ambientCG Rust004 | rust bleed at seams / arches, chip cores, pitted chrome |
| `ground/soil` | Poly Haven red_laterite_soil_stones, forest_ground_04 | road grime and mud low on the body |
| `vehicle/dash_plastic` | ambientCG Plastic012A, Scratches001 | dash / trim plastic grain |
| `vehicle/fabric_seat` | ambientCG Fabric012 | woven seat fabric |
| `vehicle/leather_seat` | Poly Haven brown_leather | motorbike seat vinyl grain |
| `vehicle/headliner` | ambientCG Fabric062 | headliner cloth and water stains |
| `vehicle/carpet` | Poly Haven dirty_carpet | floor carpet, parcel shelf |

## Fonts

The raised "TAXI-METER" letters on the roof sign are geometry generated from Blender's built-in
font (Bfont, DejaVu Sans, Bitstream Vera licence: free use and modification, including
embedding as outlines).
