// Texture family registry: which generator produces which keys, and its default size.
import * as G from './mat_ground.js';
import * as N from './mat_nature.js';
import * as B from './mat_built.js';
import * as V from './mat_vehicle.js';
import * as C from './mat_body.js';
import * as D from './mat_data.js';
import * as F from './foliage.js';
import * as R from './road.js';

/** { keys:[...], gen:(size)=>{key: raw}, size: default px (scaled by quality) } */
export const FAMILIES = [
  { keys: ['asphalt', 'asphalt_normal', 'asphalt_rough', 'asphalt_height'], gen: G.genAsphalt, size: 1024 },
  { keys: ['concrete', 'concrete_normal', 'concrete_rough'], gen: G.genConcrete, size: 512 },
  { keys: ['concrete_moss', 'concrete_moss_normal', 'concrete_moss_rough'], gen: G.genConcreteMoss, size: 512 },
  { keys: ['moss', 'moss_normal'], gen: G.genMoss, size: 512 },
  { keys: ['soil', 'soil_normal'], gen: G.genSoil, size: 512 },
  { keys: ['rock', 'rock_normal'], gen: G.genRock, size: 512 },
  { keys: ['gravel', 'gravel_normal'], gen: G.genGravel, size: 512 },
  { keys: ['leaf_litter', 'leaf_litter_normal'], gen: G.genLeafLitter, size: 512 },
  { keys: ['puddle_mask'], gen: G.genPuddleMask, size: 512 },
  { keys: ['bark', 'bark_normal'], gen: N.genBark, size: 512 },
  { keys: ['bark_banyan', 'bark_banyan_normal'], gen: N.genBarkBanyan, size: 512 },
  { keys: ['rust', 'rust_normal', 'rust_rough'], gen: B.genRust, size: 512 },
  { keys: ['metal_painted', 'metal_painted_normal', 'metal_painted_rough'], gen: B.genMetalPainted, size: 512 },
  { keys: ['paint_peel_white', 'paint_peel_white_normal'], gen: B.genPaintPeelWhite, size: 512 },
  { keys: ['paint_peel_red', 'paint_peel_red_normal'], gen: B.genPaintPeelRed, size: 512 },
  { keys: ['wood_old', 'wood_old_normal', 'wood_planks', 'wood_planks_normal'], gen: B.genWoodOld, size: 512 },
  { keys: ['roof_tiles', 'roof_tiles_normal'], gen: B.genRoofTiles, size: 512 },
  { keys: ['roof_corrugated', 'roof_corrugated_normal', 'roof_corrugated_rough'], gen: B.genRoofCorrugated, size: 512 },
  { keys: ['gold_leaf', 'gold_leaf_normal', 'gold_leaf_rough'], gen: B.genGoldLeaf, size: 512 },
  { keys: ['red_lacquer', 'red_lacquer_normal', 'red_lacquer_rough'], gen: B.genRedLacquer, size: 512 },
  { keys: ['lantern_paper'], gen: B.genLanternPaper, size: 512 },
  { keys: ['incense_ash'], gen: B.genIncenseAsh, size: 512 },
  { keys: ['taxi_paint', 'taxi_paint_green', 'taxi_paint_yellow', 'taxi_paint_normal', 'taxi_paint_rough'], gen: V.genTaxiPaint, size: 1024 },
  { keys: ['chrome_dirty', 'chrome_dirty_normal', 'chrome_dirty_rough'], gen: V.genChromeDirty, size: 512 },
  { keys: ['rubber', 'rubber_normal'], gen: V.genRubber, size: 512 },
  { keys: ['leather_seat', 'leather_seat_normal', 'leather_seat_rough'], gen: V.genLeatherSeat, size: 512 },
  { keys: ['fabric_seat', 'fabric_seat_normal'], gen: V.genFabricSeat, size: 512 },
  { keys: ['dash_plastic', 'dash_plastic_normal', 'dash_plastic_rough'], gen: V.genDashPlastic, size: 512 },
  { keys: ['carpet', 'carpet_normal'], gen: V.genCarpet, size: 512 },
  { keys: ['headliner', 'headliner_normal'], gen: V.genHeadliner, size: 512 },
  { keys: ['glass_dirt', 'glass_dirt_windshield'], gen: V.genGlassDirt, size: 512 },
  { keys: ['skin', 'skin_normal', 'skin_rough'], gen: C.genSkin, size: 512 },
  { keys: ['hair_strands'], gen: C.genHairStrands, size: 512 },
  { keys: ['fabric_cotton', 'fabric_cotton_normal'], gen: C.genFabricCotton, size: 512 },
  { keys: ['fabric_silk', 'fabric_silk_normal', 'fabric_silk_rough'], gen: C.genFabricSilk, size: 512 },
  { keys: ['fabric_denim', 'fabric_denim_normal'], gen: C.genFabricDenim, size: 512 },
  { keys: ['monk_robe', 'monk_robe_normal'], gen: C.genMonkRobe, size: 512 },
  { keys: ['cloth_red', 'cloth_yellow', 'cloth_green', 'cloth_normal'], gen: C.genCloths, size: 512 },
  { keys: ['water_ripple', 'water_ripple_height'], gen: D.genWaterRipple, size: 512 },
  { keys: ['brush_noise'], gen: D.genBrushNoise, size: 512 },
  { keys: ['blue_noise'], gen: D.genBlueNoise, size: 64, fixed: true },
  { keys: ['leaf_tropical', 'leaf_tropical_normal'], gen: F.genLeafTropical, size: 1024 },
  { keys: ['leaf_banana', 'leaf_banana_normal'], gen: F.genLeafBanana, size: 1024 },
  { keys: ['leaf_fern', 'leaf_fern_normal'], gen: F.genLeafFern, size: 1024 },
  { keys: ['leaf_bamboo', 'leaf_bamboo_normal'], gen: F.genLeafBamboo, size: 1024 },
  { keys: ['leaf_palm', 'leaf_palm_normal'], gen: F.genLeafPalm, size: 1024 },
  { keys: ['grass_card', 'grass_card_normal'], gen: F.genGrassCard, size: 1024 },
  { keys: ['vine', 'vine_normal'], gen: F.genVine, size: 1024 },
  { keys: ['road_lines', 'road_lines_normal'], gen: R.genRoadLines, size: 512 },
  { keys: ['road_stencils'], gen: R.genRoadStencils, size: 1024, dom: true },
];
