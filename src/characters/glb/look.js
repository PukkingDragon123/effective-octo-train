// Appearance spec (contract format, src/characters/index.js) -> normalized "look" for the GLB
// system: shells to merge, fabric/paint parameters, hair, face and ghost parameters.
import { makeRng, hashString, clamp } from '../../core/math.js';
import { mix, toHex } from './painter.js';

const SKIN_STOPS = [
  [0.0, '#e6bf9f'], [0.25, '#d6a582'], [0.45, '#c08a66'], [0.6, '#a9744f'], [0.8, '#8b5a3c'], [1.0, '#6a412a'],
];
export function skinHex(tone = 0.5) {
  const t = clamp(tone, 0, 1);
  for (let i = 0; i < SKIN_STOPS.length - 1; i++) {
    const [a, ca] = SKIN_STOPS[i], [b, cb] = SKIN_STOPS[i + 1];
    if (t <= b) return mix(ca, cb, (t - a) / (b - a));
  }
  return SKIN_STOPS[SKIN_STOPS.length - 1][1];
}
const hex = (c, d) => (c === undefined || c === null ? d : toHex(c));

// Outfit table. top: shell key ('u' hip-length, 't' tucked, 'l' loose long, 'j' jacket) | null;
// sleeve: 'cap'|'short'|'rolled'|'long'|null; bottom: shell/skirt key; collar; pattern ids for the painter.
const OUTFITS = {
  'tshirt-pants': (r, o) => ({ top: 'u', sleeve: 'short', bottom: 'trousers', collar: 'crew', topFab: 'jersey', botFab: 'twill', topCol: hex(o.top, r.pick(['#4a5560', '#6b5d4a', '#3e4a3a', '#7a7468'])), botCol: hex(o.bottom, r.pick(['#2c2f36', '#3b3a36', '#4a4234'])), shoes: o.shoes || 'sandals' }),
  'tshirt-shorts': (r, o) => ({ top: 'u', sleeve: 'short', bottom: 'knee', collar: 'crew', topFab: 'jersey', botFab: 'twill', topCol: hex(o.top, '#6b6f62'), botCol: hex(o.bottom, '#4a4a40'), shoes: o.shoes || 'sandals' }),
  'shirt-slacks': (r, o) => ({ top: 't', sleeve: o.sleeve || 'short', bottom: 'trousers', collar: 'shirt', topFab: 'plain', botFab: 'twill', placket: true, pocket: true, topCol: hex(o.top, '#d8d4c8'), botCol: hex(o.bottom, '#3a3833'), shoes: o.shoes || 'shoes' }),
  dress: (r, o) => ({ top: 'l', sleeve: 'cap', bottom: 'skirt_long', collar: 'scoop', topFab: 'linen', botFab: 'linen', dress: true, topCol: hex(o.top, '#e9e6dc'), botCol: hex(o.bottom ?? o.top, '#e9e6dc'), shoes: o.shoes || 'barefoot' }),
  'school-uniform': (r, o, s) => ({ top: 't', sleeve: 'short', bottom: s.sex === 'f' ? 'skirt_knee' : 'knee', collar: 'shirt', topFab: 'plain', botFab: 'twill', placket: true, pocket: true, school: true, topCol: hex(o.top, '#f1efe8'), botCol: hex(o.bottom, s.sex === 'f' ? '#1f2a4a' : '#26304f'), shoes: o.shoes || 'school' }),
  'monk-robe': (r, o) => ({ top: 'l', sleeve: null, bottom: 'skirt_wrap', collar: 'robe', topFab: 'linen', botFab: 'linen', robe: true, topCol: hex(o.top, '#c9671e'), botCol: hex(o.bottom, '#b85c1c'), shoes: o.shoes || 'barefoot' }),
  sabai: (r, o) => ({ top: 'u', sleeve: null, bottom: 'skirt_wrap', collar: 'sabai', topFab: 'sateen', botFab: 'sateen', sabai: true, topCol: hex(o.top, '#3f6b47'), botCol: hex(o.bottom, '#7a2e2a'), accent: hex(o.accent, '#c9a347'), shoes: o.shoes || 'barefoot' }),
  'taxi-uniform': (r, o) => ({ top: 't', sleeve: 'short', bottom: 'trousers', collar: 'shirt', topFab: 'plain', botFab: 'twill', placket: true, pocket: true, nameTag: true, faded: 0.5, topCol: hex(o.top, '#8fa5b5'), botCol: hex(o.bottom, '#34343a'), shoes: o.shoes || 'shoes' }),
  'market-vendor': (r, o) => ({ top: 'u', sleeve: 'short', bottom: 'skirt_wrap', collar: 'scoop', topFab: 'plain', botFab: 'plain', print: 'floral', apron: true, topCol: hex(o.top, '#b46a6a'), botCol: hex(o.bottom, '#4a3528'), accent: hex(o.accent, '#3e5c8a'), botPrint: 'batik', shoes: o.shoes || 'sandals' }),
  'tank-sarong': (r, o) => ({ top: 'u', sleeve: null, bottom: 'skirt_wrap', collar: 'tank', topFab: 'rib', botFab: 'plain', tank: true, topCol: hex(o.top, '#dcd8cc'), botCol: hex(o.bottom, '#3b4a72'), botPrint: 'plaid', accent: hex(o.accent, '#7a2a2a'), waistCloth: true, shoes: o.shoes || 'sandals' }),
  'tank-pants': (r, o) => ({ top: 'u', sleeve: null, bottom: 'trousers', collar: 'tank', topFab: 'rib', botFab: 'twill', tank: true, topCol: hex(o.top, '#e4e0d4'), botCol: hex(o.bottom, '#3a3a38'), shoes: o.shoes || 'sandals' }),
  'hoodie-jeans': (r, o) => ({ top: 'j', sleeve: 'long', bottom: 'trousers', collar: 'hood', topFab: 'knitL', botFab: 'twill', denim: true, topCol: hex(o.top, '#4a4f55'), botCol: hex(o.bottom, '#33465e'), shoes: o.shoes || 'shoes' }),
  'old-woman-sarong': (r, o) => ({ top: 'l', sleeve: 'rolled', bottom: 'skirt_wrap', collar: 'scoop', topFab: 'plain', botFab: 'plain', print: 'smallfloral', topCol: hex(o.top, '#d9d2c2'), botCol: hex(o.bottom, '#3c3a52'), botPrint: 'batik', accent: hex(o.accent, '#b08a4a'), shoes: o.shoes || 'sandals' }),
  farmer: (r, o) => ({ top: 'l', sleeve: 'rolled', bottom: 'loose', collar: 'mandarin', topFab: 'plain', botFab: 'plain', topCol: hex(o.top, '#2d3a55'), botCol: hex(o.bottom, '#2a3248'), waistCloth: true, accent: hex(o.accent, '#a8433a'), shoes: o.shoes || 'barefoot' }),
  shroud: (r, o) => ({ top: 'l', sleeve: 'long', bottom: 'skirt_long', collar: 'scoop', topFab: 'linen', botFab: 'linen', dress: true, shroud: true, topCol: hex(o.top, '#d6d2c4'), botCol: hex(o.bottom ?? o.top, '#d6d2c4'), shoes: 'barefoot' }),
  singer: (r, o) => ({ top: 'j', sleeve: 'long', bottom: 'trousers', collar: 'lapel', topFab: 'sateen', botFab: 'twill', sequin: true, topCol: hex(o.top, '#7a1d2a'), botCol: hex(o.bottom, '#232326'), accent: hex(o.accent, '#d8c890'), shoes: o.shoes || 'shoes' }),
};
export const OUTFIT_TYPES = Object.keys(OUTFITS);

export const BUILD = { thin: 0.15, average: 0.42, heavy: 0.85 };

/** spec -> look (deterministic) */
export function normalizeSpec(spec = {}) {
  const sex = spec.sex === 'f' ? 'f' : 'm';
  const age = spec.age ?? 30;
  const seed = spec.face?.seed ?? hashString(String(spec.id || 'anon'));
  const r = makeRng(seed ^ 0x5bd1e995);
  const o = spec.outfit || {};
  const type = OUTFITS[o.type] ? o.type : 'tshirt-pants';
  const outfit = { type, ...OUTFITS[type](r, o, { sex, age }) };
  if (o.sleeve) outfit.sleeve = o.sleeve === 'none' ? null : o.sleeve;
  const build = typeof spec.build === 'number' ? clamp(spec.build, 0, 1) : BUILD[spec.build] ?? 0.42;
  const child = clamp((16 - age) / 10, 0, 1);
  const old = clamp((age - 55) / 30, 0, 1);
  const height = spec.height ?? (child > 0 ? 1.1 + (age - 6) * 0.055 : sex === 'f' ? 1.57 : 1.68) * (1 - old * 0.03);
  const hairStyle = spec.hair?.style || (sex === 'f' ? 'long' : 'short');
  const hairCol = hex(spec.hair?.color, age > 70 ? '#b8b4ac' : age > 58 ? '#6a6660' : '#16120f');
  const ghost = spec.ghost ? { pale: 0, eyes: 'normal', wet: 0, decay: 0, bloodStains: 0, ...spec.ghost } : null;
  const face = {
    seed,
    wrinkles: spec.face?.wrinkles ?? clamp((age - 35) / 45, 0, 1),
    smile: spec.face?.smile ?? 0,
    eyeSize: spec.face?.eyeSize ?? 1,
    noseWidth: spec.face?.noseWidth ?? 1,
    jaw: spec.face?.jaw ?? 1,
    cheek: spec.face?.cheek ?? 1,
  };
  const acc = (spec.accessories || []).slice();
  return {
    id: spec.id || 'anon', sex, age, child, old, build, height, seed,
    skin: hex(spec.skinColor, skinHex(spec.skinTone ?? 0.5)), skinTone: spec.skinTone ?? 0.5,
    hair: { style: hairStyle, color: hairCol, wet: spec.hair?.wet ?? ghost?.wet ?? 0 },
    outfit, face, ghost, acc,
    noBlink: !!spec.noBlink,
    quality: spec.quality ?? 1,
    // variety (MakeHuman characters): posture 'normal'|'stoop'|'slouch'|'upright'|'hunch'|'child', hand / head tremor 0..1
    posture: spec.posture || null,
    tremor: spec.tremor ?? clamp((age - 68) / 20, 0, 1),
  };
}

/** Geometry-relevant key (shared look geometry cache). */
export function geometryKey(look, lod) {
  const o = look.outfit;
  return [look.sex, lod, o.top, o.sleeve, o.bottom, o.shoes, look.hair.style, look.acc.slice().sort().join('+'), o.apron ? 'apron' : '', o.waistCloth ? 'wc' : '', o.robe || o.sabai ? 'sash' : ''].join('|');
}
/** Texture key (atlas cache). */
export function atlasKey(look) {
  return JSON.stringify([look.sex, Math.round(look.age / 5), look.skin, look.outfit, look.hair, look.acc.slice().sort(), look.ghost, look.seed]);
}
