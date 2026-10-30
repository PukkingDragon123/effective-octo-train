// Texture family registry: which generator produces which keys, and its default size.
import * as G from './mat_ground.js';

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
];
