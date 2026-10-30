// Appearance specs for the cast (GAME_DESIGN §4). Gameplay can use these directly:
//   createHumanoid(PRESETS.auntieSri)
export const PRESETS = {
  ton: {
    id: 'ton', sex: 'm', age: 27, height: 1.72, build: 'thin', skinTone: 0.5,
    hair: { style: 'messy' }, outfit: { type: 'tshirt-pants', top: 0x4a5560, shoes: 'sandals' },
    face: { seed: 9101, jaw: 1.0 },
  },
  ahKong: {
    id: 'ahKong', sex: 'm', age: 78, height: 1.62, build: 'thin', skinTone: 0.28,
    hair: { style: 'gray-short' }, outfit: { type: 'tank-pants', shoes: 'sandals' },
    accessories: ['cigarette'], face: { seed: 4242, wrinkles: 0.9, eyeSize: 0.92 },
  },
  auntieSri: {
    id: 'auntieSri', sex: 'f', age: 58, height: 1.54, build: 'heavy', skinTone: 0.55,
    hair: { style: 'bun', color: 0x24201e }, outfit: { type: 'market-vendor', shoes: 'sandals' },
    accessories: ['basket'], face: { seed: 1201, smile: 0.35, wrinkles: 0.45 },
  },
  womanInWhite: {
    id: 'womanInWhite', sex: 'f', age: 24, height: 1.6, build: 'thin', skinTone: 0.32,
    hair: { style: 'long', color: 0x070606, wet: 1 }, outfit: { type: 'dress', shoes: 'barefoot' },
    face: { seed: 2202, eyeSize: 1.05 }, ghost: { pale: 0.65, wet: 0.7, eyes: 'normal' }, noBlink: true,
  },
  unclePiak: {
    id: 'unclePiak', sex: 'm', age: 63, height: 1.66, build: 'heavy', skinTone: 0.6,
    hair: { style: 'gray-short', color: 0x6a6660 }, outfit: { type: 'tank-sarong', shoes: 'sandals' },
    face: { seed: 3303, wrinkles: 0.7, noseWidth: 1.15 },
  },
  boyM: {
    id: 'boyM', sex: 'm', age: 9, height: 1.32, build: 'thin', skinTone: 0.48,
    hair: { style: 'short' }, outfit: { type: 'school-uniform' },
    accessories: ['lunchbox'], face: { seed: 4404 }, ghost: { pale: 0.35, bloodStains: 0.12 },
  },
  khunNuan: {
    id: 'khunNuan', sex: 'f', age: 25, height: 1.58, build: 'average', skinTone: 0.38,
    hair: { style: 'bun', color: 0x0a0807 }, outfit: { type: 'sabai' },
    accessories: ['garland'], face: { seed: 5505, smile: 0.25 }, ghost: { pale: 0.3 },
  },
  monk: {
    id: 'monk', sex: 'm', age: 42, height: 1.7, build: 'thin', skinTone: 0.6,
    hair: { style: 'shaved' }, outfit: { type: 'monk-robe' },
    accessories: ['shoulder-bag', 'umbrella'], face: { seed: 6606, smile: 0.3 },
  },
  uncleSaman: {
    id: 'uncleSaman', sex: 'm', age: 52, height: 1.68, build: 'average', skinTone: 0.5,
    hair: { style: 'pompadour', color: 0x0c0a09 }, outfit: { type: 'singer' },
    accessories: ['cigarette'], face: { seed: 7707, smile: 0.5 }, ghost: { pale: 0.3 },
  },
  grandmaBua: {
    id: 'grandmaBua', sex: 'f', age: 80, height: 1.47, build: 'thin', skinTone: 0.55,
    hair: { style: 'bun', color: 0xb8b4ac }, outfit: { type: 'old-woman-sarong' },
    accessories: ['basket', 'garland'], face: { seed: 8808, wrinkles: 1, smile: 0.3 },
  },
  somchai: {
    id: 'somchai', sex: 'm', age: 55, height: 1.7, build: 'average', skinTone: 0.6,
    hair: { style: 'short', color: 0x2a2826 }, outfit: { type: 'taxi-uniform' },
    face: { seed: 9101, wrinkles: 0.55, jaw: 1.04 }, ghost: { pale: 0.3 },
  },
};

/** Ride order (GAME_DESIGN §4). */
export const PASSENGERS = ['auntieSri', 'womanInWhite', 'unclePiak', 'boyM', 'khunNuan', 'monk', 'uncleSaman', 'grandmaBua', 'somchai'];
