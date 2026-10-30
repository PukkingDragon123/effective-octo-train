// Derived world constants (tuning knobs). LAYOUT (layout.js) stays the authoritative contract;
// these are implementation details of the world builder.
import { LAYOUT } from './layout.js';

export const W = {
  terrainTile: 64, // m per terrain tile
  terrainRes: 1, // m between terrain vertices
  terrainLodDist: 120, // tiles beyond this use the 2 m index
  corridor: 92, // terrain/forest exists within this distance of any road centreline
  roadPiece: 48, // road ribbon chunk length (m)
  halfWidth: LAYOUT.roadWidth / 2,
  shoulder: LAYOUT.shoulder,
  laneOffset: LAYOUT.laneOffset,
  forestCell: 32, // spatial cell for instance selection
  forestUpdateMove: 2.5, // re-select instances after the focus moved this far (m)
  forestUpdateTurn: 0.35, // ... or after this many seconds
  // LOD distances (scaled by settings.drawDistance / 150)
  lod: {
    big0: 34, // full-detail big trees
    big1: 80, // mid-detail big trees, impostors beyond
    small0: 26, // understory full detail
    smallCull: 62, // understory culled
    groundCull: 38, // ferns / grass / ground cover culled
  },
  bridgeDeckDrop: 0, // deck top relative to road height
};

/** Yaw (three.js convention, 0 = facing -Z, + = left) that makes a prop's FRONT (+Z) face the road. */
export function faceRoadYaw(travelYaw, side) {
  if (side === 'L') return travelYaw + Math.PI / 2;
  if (side === 'R') return travelYaw - Math.PI / 2;
  return travelYaw; // 'C': +Z faces oncoming traffic
}

/** Yaw that makes a character (forward = -Z) at the roadside look at the road. */
export function lookAtRoadYaw(travelYaw, side) {
  if (side === 'L') return travelYaw - Math.PI / 2;
  if (side === 'R') return travelYaw + Math.PI / 2;
  return travelYaw + Math.PI;
}
