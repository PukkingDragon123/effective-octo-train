// Appearance spec -> MakeHuman recipe (which bodies to blend, face-detail axes, hair, brows, clothes
// shells, skin texture and the shader "look": stubble, moustache, moles / scars, thinning and balding
// hair, sweat, posture), plus `randomPerson(seed, opts)` for varied background people.
//
// Cast members (src/game/data/characters.js ids and the PRESETS aliases) use their own MakeHuman body,
// so each is recognisable in silhouette and face. Any other spec (creatures, encounters, crowds)
// blends two or three archetype bodies of the same sex and age band, seeded by its id.
import { makeRng, clamp } from '../../core/math.js';
import { MH } from './mhpack.js';
import { shellKeys } from './geometry.js';

// spec id -> pack body
export const CAST_BODY = {
  player: 'ton', ton: 'ton', somchai: 'somchai', ahKong: 'ahKong', sri: 'sri', auntieSri: 'sri', womanWhite: 'womanWhite',
  womanInWhite: 'womanWhite', piak: 'piak', unclePiak: 'piak', boyM: 'boyM', nuan: 'nuan', khunNuan: 'nuan', nangTani: 'nuan',
  monk: 'monk', saman: 'saman', uncleSaman: 'saman', bua: 'bua', grandmaBua: 'bua', auntieLek: 'auntieLek', mMother: 'mMother',
  extraChild: 'extraChild', yaiSpeed: 'f_old',
};

// per-body look extras (shader) and posture
const BODY_LOOK = {
  ton: { stubble: 0.42, marks: [['mole', 'jawL', 0.0016]] },
  somchai: { stubble: 0.3, moustache: 0.5, marks: [['mole', 'cheekL', 0.0019]] },
  ahKong: { stubble: 0.22, thin: 0.5, bald: 0.55, marks: [['mole', 'chinR', 0.002], ['mole', 'templeL', 0.003]] },
  piak: { stubble: 0.85, thin: 0.3, sweat: 0.65, marks: [['scar', 'browL', 0.012]], posture: 'slouch' },
  monk: { bald: 1, shaved: true, posture: 'upright' },
  saman: { moustache: 0.85, marks: [['mole', 'lipL', 0.0022]], posture: 'upright' },
  bua: { thin: 0.15, posture: 'stoop' },
  sri: { sweat: 0.35, marks: [['mole', 'noseR', 0.0017]] },
  auntieLek: { sweat: 0.5 },
  nuan: { marks: [['mole', 'cheekR', 0.0012]], posture: 'upright' },
  womanWhite: {},
  mMother: { marks: [['mole', 'chinL', 0.0013]] },
  boyM: { posture: 'child' },
  extraChild: { posture: 'child' },
  m_old: { stubble: 0.5, thin: 0.6, bald: 0.85 },
  f_old: { thin: 0.3, posture: 'hunch' },
  f_old2: { posture: 'stoop' },
  m_potbelly: { stubble: 0.35, sweat: 0.6 },
  m_stocky: { stubble: 0.6 },
  m_tall: { stubble: 0.3 },
  m_young: { stubble: 0.25 },
  child_m: { posture: 'child' },
  child_f: { posture: 'child' },
};

// hair style names used by specs -> pack hair proxies
function hairFor(look, id) {
  const st = look.hair.style;
  const old = look.age > 60;
  switch (st) {
    case 'long': case 'longWild': case 'wild': case 'longStraight': return 'long';
    case 'bob': return look.age < 14 ? 'bob' : 'bobPlain';
    case 'bobShort': case 'bobPlain': return st;
    case 'ponytail': case 'pony': return 'ponytail';
    case 'bun': return 'bun';
    case 'braid': return 'braid';
    case 'short': return look.age < 14 ? 'crop' : 'short';
    case 'crop': case 'school': return 'crop';
    case 'messy': return look.age < 40 ? 'shag' : 'messy';
    case 'gray-short': return look.sex === 'f' ? 'curls' : 'crop';
    case 'curls': case 'perm': return 'curls';
    case 'pompadour': case 'swept': return 'swept';
    case 'shag': return 'shag';
    case 'bald': return 'crop';
    case 'shaved': case 'none': return null;
    default: return look.sex === 'f' ? (old ? 'curls' : 'long') : 'short';
  }
  void id;
}

const POOLS = {
  m: { child: ['child_m', 'boyM'], adult: ['m_young', 'm_tall', 'm_potbelly', 'm_stocky', 'ton', 'saman', 'monk'], old: ['m_old', 'ahKong', 'piak', 'somchai'] },
  f: { child: ['child_f', 'extraChild'], adult: ['f_young', 'f_mid', 'womanWhite', 'nuan', 'mMother', 'auntieLek'], old: ['f_old', 'f_old2', 'bua', 'sri'] },
};
const GENERIC = new Set(['child_m', 'child_f', 'm_young', 'm_tall', 'm_potbelly', 'm_stocky', 'm_old', 'f_young', 'f_mid', 'f_old', 'f_old2']);
const band = (age) => (age < 14 ? 'child' : age > 58 ? 'old' : 'adult');

const AXES = ['headRound', 'headOval', 'headSquare', 'headTri', 'headFat', 'noseWidth', 'noseLength', 'noseVolume', 'noseHump', 'noseFlare', 'noseTip',
  'eyeSize', 'eyeFold', 'eyeTilt', 'eyeBags', 'eyeDroop', 'jawWidth', 'chin', 'chinHeight', 'cheekBones', 'cheekFull', 'mouthWidth', 'lipsFull',
  'upperLip', 'mouthCorners', 'earSize', 'earFlap', 'earLobe', 'browHeight', 'neckDouble', 'laughLines', 'belly'];

/** blend of archetypes for a spec that has no cast body (deterministic by seed) */
function genericBodies(sex, age, build, seed) {
  const r = makeRng(seed ^ 0x2c1b3c6d);
  const pool = POOLS[sex][band(age)];
  const gen = pool.filter((n) => GENERIC.has(n) && MH.meta.bodies[n]);
  const all = pool.filter((n) => MH.meta.bodies[n]);
  const a = gen.length ? gen[Math.floor(r() * gen.length)] : all[0];
  let b = all[Math.floor(r() * all.length)];
  if (b === a) b = all[(all.indexOf(a) + 1) % all.length];
  const c = gen[Math.floor(r() * gen.length)] || a;
  const out = [[a, 0.5 + r() * 0.25], [b, 0.15 + r() * 0.25], [c, r() * 0.2]];
  // build: lean on the heavy / thin archetypes
  if (build > 0.7) out.push([sex === 'm' ? (age > 58 ? 'somchai' : 'm_potbelly') : age > 58 ? 'f_old2' : 'f_mid', 0.5]);
  if (build < 0.2) out.push([sex === 'm' ? (age > 58 ? 'ahKong' : 'm_tall') : age > 58 ? 'f_old' : 'womanWhite', 0.35]);
  return out.filter(([n, w]) => w > 0.01 && MH.meta.bodies[n]);
}

function randomAxes(seed, amt = 0.6) {
  const r = makeRng(seed ^ 0x51ed270b);
  const face = {};
  const n = 6 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const ax = AXES[Math.floor(r() * AXES.length)];
    if (ax === 'belly' || ax === 'neckDouble') continue;
    face[ax] = (face[ax] || 0) + (r() * 2 - 1) * amt;
  }
  return face;
}

/** Resolve a spec into the MakeHuman recipe + look extras. `look` is the normalized look (look.js). */
export function mhRecipe(spec, look) {
  const id = spec.id || 'anon';
  const mh = spec.mh || {};
  const castBody = mh.body || CAST_BODY[id];
  const ghost = look.ghost;
  const gtype = ghost?.type || null;
  let bodies;
  if (mh.bodies) bodies = mh.bodies;
  else if (castBody && MH.meta.bodies[castBody]) bodies = [[castBody, 1]];
  else bodies = genericBodies(look.sex, look.age, look.build, look.seed);
  if (gtype === 'emaciated') bodies = look.sex === 'f' ? [['f_young', 0.5], ['f_old', 0.3], ['womanWhite', 0.2]] : [['m_tall', 0.75], ['m_old', 0.25]];
  if (gtype === 'hunched' && !mh.bodies && !castBody) bodies = [['f_old', 1]];
  if (gtype === 'child' && !mh.bodies && !castBody) bodies = [[look.sex === 'f' ? 'extraChild' : 'child_m', 0.7], [look.sex === 'f' ? 'child_f' : 'boyM', 0.3]];
  // face axes: the spec's multipliers + the seed (non-cast) + ghost variants
  const face = { ...(mh.face || {}) };
  const f = look.face;
  const add = (k, v) => { if (Math.abs(v) > 1e-3) face[k] = clamp((face[k] || 0) + v, -1.2, 1.2); };
  add('noseWidth', (f.noseWidth - 1) * 4);
  add('jawWidth', (f.jaw - 1) * 4);
  add('cheekFull', (f.cheek - 1) * 4);
  add('eyeSize', (f.eyeSize - 1) * 4);
  if (!castBody && !mh.face) for (const [k, v] of Object.entries(randomAxes(look.seed, 0.55))) add(k, v);
  if (gtype === 'emaciated') { add('cheekFull', -1); add('headFat', -0.6); }
  if (gtype === 'drowned') { add('cheekFull', 0.35); add('headFat', 0.3); add('eyeBags', 0.6); }
  const base = (castBody && BODY_LOOK[castBody]) || BODY_LOOK[bodies[0]?.[0]] || {};
  const lx = { ...base, ...(mh.look || {}) };
  // hair, brows, lashes
  const hair = mh.hair !== undefined ? mh.hair : hairFor(look, id);
  const shaved = look.hair.style === 'shaved' || lx.shaved;
  const brows = mh.brows !== undefined ? mh.brows : shaved && look.outfit.robe ? null : look.sex === 'f' ? (look.age > 55 ? 'soft' : 'thin') : look.age < 14 ? 'soft' : look.seed % 3 === 0 ? 'thick' : 'medium';
  const lashes = look.sex === 'f' ? 'f' : 'm';
  // clothes shells (same keys as the Quaternius shells; sandals get a real sole + thong)
  const shells = shellKeys(look).filter((k) => k !== 'shell_shoe');
  if (look.outfit.shoes === 'shoes' || look.outfit.shoes === 'school') shells.push('shell_shoe');
  else if (look.outfit.shoes === 'sandals') shells.push('shell_sandal');
  const veil = !!(ghost && (ghost.hairOverFace !== undefined || gtype === 'drowned' || gtype === 'hairOverFace' || castBody === 'womanWhite' || (look.hair.style === 'long' && ghost.pale > 0.5)));
  // tops whose painted cut-outs reach far down (robe / sabai drape, tank armholes) keep the skin under them
  const o = look.outfit;
  const keepSkin = o.robe || o.sabai || o.tank || o.collar === 'robe' || o.collar === 'sabai' || o.collar === 'tank' ? shells.filter((k) => k.startsWith('shell_top_')) : [];
  const key = JSON.stringify([bodies.map(([n, w]) => [n, +w.toFixed(3)]), Object.entries(face).map(([k, v]) => [k, +v.toFixed(3)]).sort(), look.sex, hair, brows, lashes, shells, veil, keepSkin]);
  return { key, bodies, face, sex: look.sex, hair, brows, lashes, shells, veil, keepSkin, look: lx, castBody: castBody || null };
}

/** shader look values for a person (skin texture, colours, stubble, marks, posture) */
export function mhSkinKey(look) {
  const age = look.age;
  const s = look.sex === 'f' ? 'f' : 'm';
  return (age < 33 ? 'young_' : age < 60 ? 'middle_' : 'old_') + s;
}

// ------------------------------------------------------------------------------------ random people
const SKIN_RANGE = [0.3, 0.75];
const HAIR_YOUNG = ['#0d0b0a', '#16120f', '#1c1612', '#120f0d', '#2a1d16'];
const HAIR_MID = ['#1c1814', '#2a2622', '#3a3633', '#4a4540'];
const HAIR_OLD = ['#8a857e', '#a29d96', '#c9c4bb', '#d8d4cc', '#6d6862'];
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

const ROLE_OUTFITS = {
  market: { m: ['tshirt-pants', 'tshirt-shorts', 'farmer', 'tank-sarong', 'shirt-slacks'], f: ['market-vendor', 'old-woman-sarong', 'tshirt-pants', 'market-vendor'] },
  villager: { m: ['tshirt-pants', 'farmer', 'tank-pants', 'shirt-slacks', 'tank-sarong'], f: ['tshirt-pants', 'old-woman-sarong', 'market-vendor', 'dress'] },
  monk: { m: ['monk-robe'], f: ['monk-robe'] },
  figure: { m: ['shroud', 'tank-sarong', 'tshirt-pants'], f: ['dress', 'shroud', 'old-woman-sarong'] },
};
const TOPS = ['#6b5d4a', '#3e4a3a', '#7a7468', '#8a5a4a', '#4a5560', '#a8a090', '#6a7a8a', '#9a6a5a', '#c9c1ae', '#5a6a4a'];
const BOTTOMS = ['#2c2f36', '#3b3a36', '#4a4234', '#2a3248', '#3c3a52', '#5a3a2a'];

/**
 * A varied, believable background person: returns an appearance spec for createHumanoid.
 *   opts: { age, sex 'm'|'f', ghost: false | true | 'emaciated'|'hunched'|'child'|'drowned'|'crushed'|'hairOverFace',
 *           role: 'market'|'villager'|'monk'|'figure', id }
 */
export function randomPerson(seed = 1, opts = {}) {
  const r = makeRng((seed * 2654435761) ^ 0x9e3779b9);
  const role = opts.role || (opts.ghost ? 'figure' : 'villager');
  let sex = opts.sex || (role === 'monk' ? 'm' : r() < 0.5 ? 'm' : 'f');
  let age = opts.age ?? (role === 'monk' ? 20 + Math.floor(r() * 55) : r() < 0.12 ? 6 + Math.floor(r() * 8) : r() < 0.35 ? 60 + Math.floor(r() * 28) : 18 + Math.floor(r() * 42));
  const gtype = typeof opts.ghost === 'string' ? opts.ghost : null;
  if (gtype === 'hunched') { sex = 'f'; age = Math.max(age, 78); }
  if (gtype === 'child') age = Math.min(age, 11);
  const b = band(age);
  const old = clamp((age - 55) / 30, 0, 1);
  const build = r() < 0.2 ? 'heavy' : r() < 0.45 ? 'thin' : 'average';
  const height = (b === 'child' ? 1.05 + (age - 5) * 0.055 : sex === 'm' ? 1.6 + r() * 0.2 : 1.48 + r() * 0.16) * (1 - old * 0.04) * (gtype === 'emaciated' ? 1.12 : 1);
  const hairStyles = sex === 'm'
    ? (b === 'child' ? ['crop', 'short'] : b === 'old' ? ['crop', 'bald', 'messy', 'short', 'bald'] : ['short', 'messy', 'crop', 'swept', 'shag'])
    : (b === 'child' ? ['bob', 'ponytail', 'braid'] : b === 'old' ? ['bun', 'curls', 'bun', 'bobPlain'] : ['long', 'ponytail', 'bun', 'bob', 'bobShort', 'braid']);
  let hairStyle = pick(r, hairStyles);
  if (role === 'monk') hairStyle = 'shaved';
  if (gtype === 'drowned' || gtype === 'hairOverFace') hairStyle = 'long';
  if (gtype === 'hunched') hairStyle = r() < 0.5 ? 'longWild' : 'bun';
  const hairColor = b === 'old' ? pick(r, HAIR_OLD) : age > 45 ? pick(r, HAIR_MID) : pick(r, HAIR_YOUNG);
  const outfits = ROLE_OUTFITS[role] || ROLE_OUTFITS.villager;
  let otype = pick(r, outfits[sex]);
  if (b === 'child') otype = r() < 0.6 ? 'school-uniform' : 'tshirt-shorts';
  if (gtype === 'drowned' || gtype === 'hairOverFace') otype = sex === 'f' ? 'dress' : 'shroud';
  const outfit = { type: otype, top: pick(r, TOPS), bottom: pick(r, BOTTOMS), shoes: role === 'monk' || gtype ? 'barefoot' : r() < 0.7 ? 'sandals' : r() < 0.5 ? 'barefoot' : 'shoes' };
  if (otype === 'monk-robe') { outfit.top = pick(r, ['#c9671e', '#b85c1c', '#8a4c1c']); outfit.bottom = outfit.top; }
  if (otype === 'dress' || otype === 'shroud') { outfit.top = gtype ? '#d9d6cc' : pick(r, ['#e9e6dc', '#c9b8a0', '#8a9aa8']); outfit.bottom = outfit.top; }
  const accessories = [];
  if (role === 'market' && r() < 0.5) accessories.push(sex === 'f' ? 'basket' : 'shoulder-bag');
  if (role === 'monk') accessories.push('shoulder-bag');
  if (b === 'old' && r() < 0.3 && sex === 'm') accessories.push('glasses');
  const id = opts.id || 'rp' + seed;
  const spec = {
    id, sex, age, height, build, skinTone: SKIN_RANGE[0] + r() * (SKIN_RANGE[1] - SKIN_RANGE[0]),
    hair: { style: hairStyle, color: hairColor }, outfit, accessories,
    face: { seed: (seed * 7919) % 100000, wrinkles: clamp((age - 35) / 45, 0, 1), smile: r() * 0.4, eyeSize: 0.92 + r() * 0.16, noseWidth: 0.9 + r() * 0.2, jaw: 0.9 + r() * 0.2, cheek: 0.9 + r() * 0.2 },
    mh: {
      look: {
        stubble: sex === 'm' && age > 18 && role !== 'monk' ? r() * 0.8 : 0,
        moustache: sex === 'm' && age > 25 && r() < 0.25 ? 0.4 + r() * 0.5 : 0,
        thin: b === 'old' ? 0.2 + r() * 0.5 : 0,
        bald: sex === 'm' && b === 'old' && hairStyle !== 'messy' && r() < 0.6 ? 0.4 + r() * 0.6 : hairStyle === 'bald' ? 0.9 : role === 'monk' ? 1 : 0,
        shaved: role === 'monk',
        sweat: r() * 0.6,
        marks: r() < 0.5 ? [['mole', pick(r, ['cheekL', 'cheekR', 'chinL', 'lipL', 'noseR', 'jawL']), 0.0012 + r() * 0.0012]] : [],
        posture: b === 'child' ? 'child' : b === 'old' ? (r() < 0.6 ? 'stoop' : 'normal') : role === 'monk' ? 'upright' : r() < 0.15 ? 'slouch' : 'normal',
      },
    },
  };
  if (hairStyle === 'bald') spec.hair.style = 'bald';
  if (opts.ghost) {
    const g = { pale: 0.7 + r() * 0.25, eyes: r() < 0.25 ? 'black' : 'normal', wet: 0.2, decay: r() * 0.2, bloodStains: r() * 0.15 };
    if (gtype) g.type = gtype;
    if (gtype === 'drowned') Object.assign(g, { wet: 1, veins: 0.7, hairOverFace: 0.75, pale: 0.92 });
    if (gtype === 'hairOverFace') Object.assign(g, { wet: 0.8, hairOverFace: 1 });
    if (gtype === 'crushed') Object.assign(g, { bloodStains: 0.75, decay: 0.35, crush: 1 });
    if (gtype === 'emaciated') Object.assign(g, { uncanny: 0.8, veins: 0.5 });
    if (gtype === 'hunched') Object.assign(g, { uncanny: 0.4 });
    spec.ghost = g;
    spec.noBlink = true;
  }
  return spec;
}

// Defaults for the folklore / encounter ids that the game creates with a bare spec.
const ID_DEFAULTS = {
  yaiSpeed: { outfit: { type: 'old-woman-sarong', top: '#9a8f7a', bottom: '#2a2630' }, hair: { style: 'longWild', color: '#c9c4bb' }, ghost: { pale: 0.6, type: 'hunched', veins: 0.3 }, noBlink: true },
  nangTani: { outfit: { type: 'sabai', top: '#3f6b3a', bottom: '#4a3a24', accent: '#c9a54a', shoes: 'barefoot' }, hair: { style: 'bun', color: '#0e0c0b' }, ghost: { pale: 0.45 }, noBlink: true },
  windowGhost: { outfit: { type: 'dress', top: '#dcd9cf', shoes: 'barefoot' }, hair: { style: 'long', color: '#090807' }, ghost: { wet: 0.8, hairOverFace: 0.7, veilGap: 0.6, uncanny: 0.7, veins: 0.6, pupils: -0.8 }, noBlink: true },
  phiTaiHong: { outfit: { type: 'tshirt-pants', top: '#5a5a52', bottom: '#2c2f36', shoes: 'barefoot' }, ghost: { type: 'crushed' } },
};

/** fill in what a bare spec leaves out (outfit, hair, ghost style) for known encounter ids and ghost types */
export function mhDefaults(spec) {
  const d = ID_DEFAULTS[spec.id];
  const g = spec.ghost || null;
  let out = spec;
  if (d) {
    out = { ...d, ...spec };
    if (!spec.outfit) out.outfit = d.outfit;
    if (!spec.hair) out.hair = d.hair;
    if (d.ghost) out.ghost = { ...d.ghost, ...(spec.ghost || {}) };
  } else if (g && !spec.outfit) {
    out = { ...spec, outfit: { type: spec.sex === 'm' ? 'shroud' : 'dress', shoes: 'barefoot' } };
    if (!spec.hair && spec.sex !== 'm') out.hair = { style: 'long', color: '#0a0908' };
  }
  return out;
}
