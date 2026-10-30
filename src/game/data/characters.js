// CHARACTERS: everyone who speaks or appears as a person in the night shift.
//
// Schema (per entry):
// {
//   id: string (same as the key),
//   nameTH, nameEN: display names (subtitle speaker labels),
//   role: short note for designers,
//   voice: { gender:'m'|'f', age:number, pitch:0.5..1.5, rate:0.6..1.4, ghost:0..1, whisper:boolean },
//   appearance: createHumanoid spec (src/characters/index.js): { id, sex, age, height, build, skinTone,
//     hair:{style,color}, outfit:{type, top, bottom, accent, shoes}, accessories:[], face:{...},
//     ghost?:{ pale, eyes, wet, decay, bloodStains } } — null for voice-only speakers.
// }
// face: `wrinkles` and `smile` are 0..1; `eyeSize`, `noseWidth`, `jaw`, `cheek` are MULTIPLIERS
// around 1 (characters/Head.js: `(f.eyeSize ?? 1) * jitter`), keep them within ~0.85..1.15.
// `face.seed` drives the random facial structure: Ton and Somchai share one (family resemblance,
// visible when Ton catches his own face in the mirror).
// Colours are CSS hex strings. Ghost appearance params describe the *calm* look; gameplay
// pushes them further (true form) through humanoid.setGhost().

export const CHARACTERS = {
  player: {
    id: 'player',
    nameTH: 'ต้น',
    nameEN: 'Ton',
    role: 'You. 27, left home after a fight with his father; laconic.',
    voice: { gender: 'm', age: 27, pitch: 0.95, rate: 1.0, ghost: 0, whisper: false },
    appearance: {
      id: 'player', sex: 'm', age: 27, height: 1.72, build: 'thin', skinTone: 0.5,
      hair: { style: 'messy', color: '#1a1512' },
      outfit: { type: 'hoodie-jeans', top: '#3b4048', bottom: '#2a3140', accent: '#8a8f96', shoes: 'shoes' },
      accessories: [],
      face: { seed: 5601, wrinkles: 0.05, smile: 0.0, eyeSize: 1.0, noseWidth: 1.0, jaw: 1.02, cheek: 0.95 },
    },
  },

  ahKong: {
    id: 'ahKong',
    nameTH: 'อากง',
    nameEN: 'Ah Kong',
    role: 'Old Thai-Chinese garage keeper; secretly the guardian spirit of Ma Ruay Shrine.',
    voice: { gender: 'm', age: 78, pitch: 0.72, rate: 0.82, ghost: 0.05, whisper: false },
    appearance: {
      id: 'ahKong', sex: 'm', age: 78, height: 1.62, build: 'thin', skinTone: 0.32,
      hair: { style: 'gray-short', color: '#c9c4bb' },
      // white singlet + loose black silk trousers: the classic Thai-Chinese อากง look
      outfit: { type: 'tank-pants', top: '#e8e2d2', bottom: '#1d1e22', accent: '#7a2a1e', shoes: 'sandals' },
      accessories: ['cigarette', 'glasses'],
      face: { seed: 7801, wrinkles: 0.85, smile: 0.25, eyeSize: 0.9, noseWidth: 1.04, jaw: 0.98, cheek: 0.92 },
    },
  },

  somchai: {
    id: 'somchai',
    nameTH: 'สมชาย',
    nameEN: 'Somchai',
    role: "Ton's father, taxi owner-driver, died on this road last rainy season. Ride 9.",
    voice: { gender: 'm', age: 56, pitch: 0.82, rate: 0.9, ghost: 0.25, whisper: false },
    appearance: {
      id: 'somchai', sex: 'm', age: 56, height: 1.68, build: 'average', skinTone: 0.62,
      hair: { style: 'short', color: '#2b2722' },
      // the faded pale-blue driver's shirt he wore every day, sun-bleached at the shoulders
      outfit: { type: 'taxi-uniform', top: '#7d95a6', bottom: '#2e2c28', accent: '#6f8a5a', shoes: 'sandals' },
      accessories: ['amulet-necklace'],
      face: { seed: 5601, wrinkles: 0.5, smile: 0.35, eyeSize: 0.98, noseWidth: 1.05, jaw: 1.05, cheek: 1.0 }, // same seed as Ton
      ghost: { pale: 0.18, eyes: 'normal', wet: 0.15, decay: 0.0, bloodStains: 0.0 }, // a gentle ghost: barely paler than life
      noBlink: true,
    },
  },

  sri: {
    id: 'sri',
    nameTH: 'ป้าศรี',
    nameEN: 'Auntie Sri',
    role: 'Ride 1, human. 58, jasmine-garland vendor, chatty and nervous.',
    voice: { gender: 'f', age: 58, pitch: 1.12, rate: 1.15, ghost: 0, whisper: false },
    appearance: {
      id: 'sri', sex: 'f', age: 58, height: 1.53, build: 'heavy', skinTone: 0.6,
      hair: { style: 'bun', color: '#2a2420' },
      outfit: { type: 'market-vendor', top: '#c96f4a', bottom: '#3d3550', accent: '#e9e2c8', shoes: 'sandals' },
      accessories: ['basket', 'shoulder-bag'],
      face: { seed: 5801, wrinkles: 0.45, smile: 0.3, eyeSize: 1.0, noseWidth: 1.06, jaw: 0.98, cheek: 1.08 },
    },
  },

  womanWhite: {
    id: 'womanWhite',
    nameTH: 'หญิงชุดขาว',
    nameEN: 'Woman in White',
    role: 'Ride 2, ghost with no reflection. Wet hair, white dress, jasmine smell.',
    voice: { gender: 'f', age: 24, pitch: 1.05, rate: 0.78, ghost: 0.75, whisper: true },
    appearance: {
      id: 'womanWhite', sex: 'f', age: 24, height: 1.6, build: 'thin', skinTone: 0.2,
      hair: { style: 'long', color: '#0c0b0b' },
      outfit: { type: 'dress', top: '#e7e5dc', bottom: '#e1dfd6', accent: '#2a2622', shoes: 'barefoot' },
      accessories: [],
      face: { seed: 2402, wrinkles: 0.0, smile: 0.0, eyeSize: 1.04, noseWidth: 0.94, jaw: 0.92, cheek: 0.93 },
      ghost: { pale: 0.85, eyes: 'normal', wet: 0.9, decay: 0.1, bloodStains: 0.05 },
      noBlink: true,
    },
  },

  piak: {
    id: 'piak',
    nameTH: 'ลุงเปี๊ยก',
    nameEN: 'Uncle Piak',
    role: 'Ride 3, human. 60s, drunk, sings old luk thung, looks creepy but harmless.',
    voice: { gender: 'm', age: 63, pitch: 0.88, rate: 0.92, ghost: 0, whisper: false },
    appearance: {
      id: 'piak', sex: 'm', age: 63, height: 1.64, build: 'thin', skinTone: 0.68,
      hair: { style: 'messy', color: '#6d6862' },
      // stained singlet + a faded red-check ผ้าขาวม้า sarong: every village's drunk uncle
      outfit: { type: 'tank-sarong', top: '#d6d0bf', bottom: '#7a3434', accent: '#d9cfb8', shoes: 'sandals' },
      accessories: [],
      face: { seed: 6303, wrinkles: 0.7, smile: 0.4, eyeSize: 0.93, noseWidth: 1.08, jaw: 1.0, cheek: 0.9 },
    },
  },

  boyM: {
    id: 'boyM',
    nameTH: 'น้องเอ็ม',
    nameEN: 'Little M',
    role: 'Ride 4, ghost that exists ONLY in reflections (ผีตายโหง, road accident). 9 years old.',
    voice: { gender: 'm', age: 9, pitch: 1.42, rate: 0.95, ghost: 0.45, whisper: false },
    appearance: {
      id: 'boyM', sex: 'm', age: 9, height: 1.3, build: 'thin', skinTone: 0.5,
      hair: { style: 'short', color: '#141210' }, // the regulation schoolboy crop
      outfit: { type: 'school-uniform', top: '#f0eee6', bottom: '#2c3a5c', accent: '#2c3a5c', shoes: 'shoes' },
      accessories: ['lunchbox'],
      face: { seed: 904, wrinkles: 0.0, smile: 0.15, eyeSize: 1.06, noseWidth: 0.94, jaw: 0.95, cheek: 1.06 },
      ghost: { pale: 0.55, eyes: 'normal', wet: 0.3, decay: 0.0, bloodStains: 0.15 },
    },
  },

  nuan: {
    id: 'nuan',
    nameTH: 'คุณนวล',
    nameEN: 'Khun Nuan',
    role: 'Ride 5, ghost (นางตานี). Green sabai, no reflection, feet never touch the ground.',
    voice: { gender: 'f', age: 26, pitch: 1.0, rate: 0.72, ghost: 0.55, whisper: false },
    appearance: {
      id: 'nuan', sex: 'f', age: 26, height: 1.62, build: 'thin', skinTone: 0.4,
      hair: { style: 'bun', color: '#110f0d' },
      outfit: { type: 'sabai', top: '#3f6b3a', bottom: '#4a3a24', accent: '#c9a54a', shoes: 'barefoot' },
      accessories: [],
      face: { seed: 2605, wrinkles: 0.0, smile: 0.35, eyeSize: 1.02, noseWidth: 0.95, jaw: 0.94, cheek: 0.98 },
      ghost: { pale: 0.45, eyes: 'normal', wet: 0.0, decay: 0.0, bloodStains: 0.0 },
      noBlink: true,
    },
  },

  monk: {
    id: 'monk',
    nameTH: 'หลวงพี่',
    nameEN: 'Luang Phi',
    role: 'Ride 6, human. 40s, wandering thudong monk with a klot umbrella-tent. Calm, funny.',
    voice: { gender: 'm', age: 44, pitch: 0.86, rate: 0.85, ghost: 0, whisper: false },
    appearance: {
      id: 'monk', sex: 'm', age: 44, height: 1.7, build: 'thin', skinTone: 0.62,
      hair: { style: 'shaved', color: '#1a1714' }, // 'shaved' + monk-robe = shaved brows too (characters/Face.js)
      // forest monks dye their robes darker with jackfruit heartwood (สีกรัก)
      outfit: { type: 'monk-robe', top: '#8a4c1c', bottom: '#844819', accent: '#6a3a14', shoes: 'barefoot' },
      accessories: ['umbrella', 'shoulder-bag'],
      face: { seed: 4406, wrinkles: 0.3, smile: 0.45, eyeSize: 0.96, noseWidth: 1.02, jaw: 1.0, cheek: 0.96 },
    },
  },

  saman: {
    id: 'saman',
    nameTH: 'ลุงสมาน',
    nameEN: 'Uncle Saman',
    role: 'Ride 7, friendly ghost: long-dead luk thung singer in a sequinned jacket. No reflection.',
    voice: { gender: 'm', age: 50, pitch: 0.95, rate: 1.05, ghost: 0.35, whisper: false },
    appearance: {
      id: 'saman', sex: 'm', age: 50, height: 1.7, build: 'average', skinTone: 0.45,
      hair: { style: 'pompadour', color: '#0f0d0c' },
      outfit: { type: 'singer', top: '#b8902e', bottom: '#1d1b22', accent: '#d8c27a', shoes: 'shoes' }, // sequinned stage jacket
      accessories: ['cigarette'],
      face: { seed: 5007, wrinkles: 0.35, smile: 0.55, eyeSize: 1.0, noseWidth: 1.0, jaw: 1.04, cheek: 1.0 },
      ghost: { pale: 0.6, eyes: 'normal', wet: 0.0, decay: 0.05, bloodStains: 0.0 },
      noBlink: true,
    },
  },

  bua: {
    id: 'bua',
    nameTH: 'ยายบัว',
    nameEN: 'Grandma Bua',
    role: 'Ride 8, human. 80, flower-garland seller who knew Somchai.',
    voice: { gender: 'f', age: 80, pitch: 0.98, rate: 0.78, ghost: 0, whisper: false },
    appearance: {
      id: 'bua', sex: 'f', age: 80, height: 1.45, build: 'thin', skinTone: 0.58,
      hair: { style: 'gray-short', color: '#d6d1c8' },
      outfit: { type: 'old-woman-sarong', top: '#d9cfb4', bottom: '#5a3a4a', accent: '#e8e2cf', shoes: 'sandals' },
      accessories: ['basket', 'garland'],
      face: { seed: 8008, wrinkles: 0.95, smile: 0.55, eyeSize: 0.92, noseWidth: 1.04, jaw: 0.95, cheek: 0.92 },
    },
  },

  auntieLek: {
    id: 'auntieLek',
    nameTH: 'ป้าเล็ก',
    nameEN: 'Auntie Lek',
    role: 'Human. Runs the all-night boat-noodle stall. Memory m_noodle.',
    voice: { gender: 'f', age: 55, pitch: 1.08, rate: 1.1, ghost: 0, whisper: false },
    appearance: {
      id: 'auntieLek', sex: 'f', age: 55, height: 1.55, build: 'average', skinTone: 0.55,
      hair: { style: 'ponytail', color: '#231e1a' },
      outfit: { type: 'tshirt-pants', top: '#6f8aa0', bottom: '#2a2a30', accent: '#c94a3a', shoes: 'sandals' },
      accessories: ['headscarf'],
      face: { seed: 5509, wrinkles: 0.4, smile: 0.5, eyeSize: 0.98, noseWidth: 1.04, jaw: 0.98, cheek: 1.04 },
    },
  },

  mMother: {
    id: 'mMother',
    nameTH: 'แม่น้องเอ็ม',
    nameEN: "M's mother",
    role: "Human. Boy M's mother, still waiting at the KM 11 bus stop with dinner. Appears only in the dawn endings if Ton promised M (flags.promisedM).",
    voice: { gender: 'f', age: 38, pitch: 1.04, rate: 0.85, ghost: 0, whisper: false },
    appearance: {
      id: 'mMother', sex: 'f', age: 38, height: 1.56, build: 'thin', skinTone: 0.55,
      hair: { style: 'ponytail', color: '#1c1714' },
      outfit: { type: 'tshirt-pants', top: '#8c7a6a', bottom: '#2f2c34', accent: '#c9b89a', shoes: 'sandals' },
      accessories: [],
      face: { seed: 3811, wrinkles: 0.3, smile: 0.0, eyeSize: 0.98, noseWidth: 1.0, jaw: 0.96, cheek: 0.94 },
    },
  },

  extraChild: {
    id: 'extraChild',
    nameTH: '(เด็กในกระจก)',
    nameEN: '(the child in the mirror)',
    role: 'Rule r16: one more passenger in the rear-view mirror than got in. Seen ONLY in the mirror, never named.',
    voice: { gender: 'f', age: 8, pitch: 1.38, rate: 0.8, ghost: 0.8, whisper: true },
    appearance: {
      id: 'extraChild', sex: 'f', age: 8, height: 1.24, build: 'thin', skinTone: 0.3,
      hair: { style: 'bob', color: '#0e0c0b' }, // the old regulation schoolgirl bob
      // an older-pattern uniform than Boy M's: sun-yellowed blouse, faded navy pleated skirt
      outfit: { type: 'school-uniform', top: '#e6dfc8', bottom: '#2a3048', accent: '#2a3048', shoes: 'shoes' },
      accessories: [],
      face: { seed: 808, wrinkles: 0.0, smile: 0.4, eyeSize: 1.08, noseWidth: 0.92, jaw: 0.92, cheek: 1.04 },
      ghost: { pale: 0.8, eyes: 'black', wet: 0.4, decay: 0.15, bloodStains: 0.2 },
      noBlink: true,
    },
  },

  // --- voice-only speakers -----------------------------------------------------------
  radio: {
    id: 'radio',
    nameTH: 'วิทยุ',
    nameEN: 'Radio',
    role: 'Diegetic radio: DJs, songs, static voices.',
    voice: { gender: 'm', age: 40, pitch: 1.0, rate: 1.05, ghost: 0, whisper: false },
    appearance: null,
  },
  djNok: {
    id: 'djNok',
    nameTH: 'ดีเจนก',
    nameEN: 'DJ Nok',
    role: 'Cheerful late-night luk thung DJ on station 2.',
    voice: { gender: 'f', age: 35, pitch: 1.15, rate: 1.2, ghost: 0, whisper: false },
    appearance: null,
  },
  voice: {
    id: 'voice',
    nameTH: '(เสียง)',
    nameEN: '(a voice)',
    role: 'Disembodied voices: name-calling (rule 7), whispers, the loop itself.',
    voice: { gender: 'f', age: 30, pitch: 0.9, rate: 0.7, ghost: 0.9, whisper: true },
    appearance: null,
  },
};

/** Ordered list of characters who appear as passengers (matches PASSENGERS order). */
export const PASSENGER_CHARACTER_IDS = ['sri', 'womanWhite', 'piak', 'boyM', 'nuan', 'monk', 'saman', 'bua', 'somchai'];

/** Speaker label for a dialogue line's `who`. 'passenger' resolves to the current ride's characterId. */
export function speakerName(who, passengerCharacterId) {
  const id = who === 'passenger' ? passengerCharacterId : who;
  const c = CHARACTERS[id];
  return c ? { th: c.nameTH, en: c.nameEN } : { th: '', en: '' };
}
