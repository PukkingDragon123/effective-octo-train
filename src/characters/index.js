// Characters (contract: docs/ARCHITECTURE.md "characters").
//
// The game's character system is built on the CC0 Quaternius base bodies + Universal
// Animation Library (reused from เฮียผัด, see docs/credits/characters.md), with our
// procedural layers on top: painted faces, eyes, hair, clothing atlases, IK, look-at,
// Thai actions, the ghost deformation layer and gore. Implementation: ./glb/.
// Call `await loadCharacterAssets()` once at boot before creating any character.
//
// (An earlier signed-distance-field prototype was removed; it is in git history
//  before the commit that switched characters to GLB.)
export {
  loadCharacterAssets,
  createHumanoid,
  createHumanoidGLB,
  Humanoid,
  PlayerBody,
  HumanoidGLB,
  PlayerBodyGLB,
  createQuadruped,
  ACTIONS,
  OUTFIT_TYPES,
  LOD_DISTANCE,
  PRESETS,
  PASSENGERS,
} from './glb/index.js';
