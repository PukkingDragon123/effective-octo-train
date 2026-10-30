// AUTHORITATIVE world layout. Every module that needs to know "where things are"
// reads this file; the world builder turns it into positions (world.landmarks).
//
// Road topology (driving on the LEFT, Thai style; s increases in travel direction):
//
//                 bike spur (intro, from the outside world)
//                        \
//   M (merge, s=0) ──────[junction u≈0.068]──garage──sala1── ... main loop ... ──F (fork, s=L)
//   ^                                                                             /   \
//   |                                                         ghost branch (LEFT)     human branch (RIGHT)
//   └─────────────────────────────────────────────────────────────────────────────┴─────┘
//                                                   both branches rejoin the main loop at M
//
// The shrine ศาลเจ้ามารวย stands in the wedge between the two branches at F,
// facing the oncoming main road. LEFT IS FOR GHOSTS, RIGHT IS FOR HUMANS.

export const LAYOUT = {
  seed: 9,
  // main loop (open spline M -> F), approximate target length in metres
  mainLength: 3400,
  ghostBranchLength: 330,
  humanBranchLength: 310,
  spurLength: 620,
  roadWidth: 6.2, // asphalt width (two narrow lanes)
  shoulder: 1.3, // gravel/grass shoulder each side before vegetation wall
  laneOffset: -1.55, // where traffic drives: left lane centre (negative lateral = left)
  minTurnRadius: 28,
  elevationRange: 18, // +/- metres of rolling hills along the road

  /**
   * Landmarks on a spline. `u` = fraction of that spline's length, `side` = 'L' | 'R'
   * relative to the travel direction, `offset` = metres beyond the road edge.
   * kind -> which prop factory / set piece builds it.
   */
  landmarks: {
    // --- main loop -----------------------------------------------------------
    spurJunction: { spline: 'main', u: 0.068, side: 'R', offset: 0, kind: 'junction' },
    garage: { spline: 'main', u: 0.08, side: 'L', offset: 2.5, kind: 'garage' },
    km9: { spline: 'main', u: 0.1, side: 'L', offset: 0.6, kind: 'km_marker', km: 9 },
    sala1: { spline: 'main', u: 0.17, side: 'L', offset: 2.2, kind: 'sala', variant: 1 },
    spiritCluster1: { spline: 'main', u: 0.235, side: 'R', offset: 1.8, kind: 'spirit_cluster' },
    sacredTree1: { spline: 'main', u: 0.25, side: 'L', offset: 4, kind: 'sacred_tree' },
    km10: { spline: 'main', u: 0.27, side: 'L', offset: 0.6, kind: 'km_marker', km: 10 },
    accidentCurve: { spline: 'main', u: 0.3, side: 'L', offset: 0.8, kind: 'accident_curve' },
    abandonedBuddha: { spline: 'main', u: 0.33, side: 'R', offset: 5, kind: 'buddha_statue' },
    bridge: { spline: 'main', u: 0.36, side: 'L', offset: 0, kind: 'bridge', length: 26 },
    hiddenPond: { spline: 'main', u: 0.375, side: 'R', offset: 14, kind: 'pond' },
    noodleShop: { spline: 'main', u: 0.42, side: 'L', offset: 2.5, kind: 'noodle_shop' },
    km11: { spline: 'main', u: 0.44, side: 'L', offset: 0.6, kind: 'km_marker', km: 11 },
    busStop: { spline: 'main', u: 0.48, side: 'L', offset: 1.5, kind: 'bus_stop' },
    bananaGrove: { spline: 'main', u: 0.55, side: 'L', offset: 2.5, kind: 'banana_grove' },
    sacredTree2: { spline: 'main', u: 0.585, side: 'R', offset: 4, kind: 'sacred_tree' },
    km12: { spline: 'main', u: 0.6, side: 'L', offset: 0.6, kind: 'km_marker', km: 12 },
    forestTemple: { spline: 'main', u: 0.62, side: 'R', offset: 3, kind: 'forest_temple' },
    sala2: { spline: 'main', u: 0.68, side: 'L', offset: 2.2, kind: 'sala', variant: 2 },
    elephantCrossing: { spline: 'main', u: 0.74, side: 'L', offset: 1, kind: 'elephant_crossing' },
    km13: { spline: 'main', u: 0.77, side: 'L', offset: 0.6, kind: 'km_marker', km: 13 },
    marketLamp: { spline: 'main', u: 0.8, side: 'L', offset: 1.5, kind: 'market_crossroad' },
    fatherLamp: { spline: 'main', u: 0.865, side: 'L', offset: 1.2, kind: 'lone_streetlight' },
    sacredTree3: { spline: 'main', u: 0.9, side: 'R', offset: 3.5, kind: 'sacred_tree' },
    shrineApproach: { spline: 'main', u: 0.93, side: 'L', offset: 0, kind: 'shrine_approach' }, // lanterns, smoke, fog
    // --- the fork -------------------------------------------------------------
    shrineMaRuay: { spline: 'main', u: 1.0, side: 'C', offset: 0, kind: 'shrine_maruay' },
    ghostGate: { spline: 'ghost', u: 0.45, side: 'C', offset: 0, kind: 'ghost_gate' }, // ghosts walk off into the mist here
    humanVillageStop: { spline: 'human', u: 0.42, side: 'L', offset: 1.5, kind: 'village_stop' }, // humans get off here
    // --- intro bike spur ------------------------------------------------------
    spurStart: { spline: 'spur', u: 0.0, side: 'C', offset: 0, kind: 'spur_start' },
    spurShrine: { spline: 'spur', u: 0.45, side: 'L', offset: 2, kind: 'spirit_house' },
  },

  // Ride order (see src/game/data/passengers.js). Each pickup is a landmark key; the
  // passenger waits at the landmark's "waitPos", the taxi should stop at "stopPos".
  pickups: ['sala1', 'accidentCurve', 'noodleShop', 'busStop', 'bananaGrove', 'forestTemple', 'sala2', 'marketLamp', 'fatherLamp'],

  // Background dressing densities (per 100 m of road)
  dressing: {
    polesPer100m: 2.4, // concrete electric poles (one side, switching sides occasionally)
    spiritHousesPer100m: 0.35,
    signsPer100m: 0.15,
    convexMirrorsAtSharpCurves: true,
    streetlightsAtLandmarks: true,
  },
};

/** Thai/English names for landmarks (UI, subtitles, signs). */
export const LANDMARK_NAMES = {
  garage: { th: 'อู่ กม.9', en: 'KM 9 Garage' },
  sala1: { th: 'ศาลาพักทาง', en: 'Roadside Sala' },
  accidentCurve: { th: 'โค้งร้อยศพ', en: 'Hundred Corpses Curve' },
  bridge: { th: 'สะพานห้วยเงียบ', en: 'Silent Creek Bridge' },
  noodleShop: { th: 'ร้านก๋วยเตี๋ยวเรือป้าเล็ก', en: "Auntie Lek's Boat Noodles" },
  busStop: { th: 'ป้ายรถเมล์ร้าง', en: 'Abandoned Bus Stop' },
  bananaGrove: { th: 'ดงกล้วย', en: 'Banana Grove' },
  forestTemple: { th: 'วัดป่าร้าง', en: 'Abandoned Forest Temple' },
  sala2: { th: 'ศาลาริมทาง', en: 'Second Sala' },
  elephantCrossing: { th: 'ทางช้างผ่าน', en: 'Elephant Crossing' },
  marketLamp: { th: 'สี่แยกตลาดเช้า', en: 'Morning Market Crossroad' },
  fatherLamp: { th: 'เสาไฟต้นสุดท้าย', en: 'The Last Streetlight' },
  shrineMaRuay: { th: 'ศาลเจ้ามารวย', en: 'Ma Ruay Shrine' },
  humanVillageStop: { th: 'บ้านห้วยทราย', en: 'Huai Sai Village' },
  ghostGate: { th: 'ประตูหมอก', en: 'The Mist Gate' },
};
