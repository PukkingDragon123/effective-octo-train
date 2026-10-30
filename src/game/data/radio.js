// RADIO: the taxi's old dashboard radio. All stations, hosts, songs and lyrics are original
// fiction (no real songs, artists or stations). The audio module synthesises the music;
// these are the titles, lyric snippets (for subtitles / humming / Web Speech) and talk.
//
// STATIONS[i] = { index (1..4 = audio/Radio.js station number), id, freq (dial label), nameTH, nameEN, kind:'dhamma'|'lukthung'|'oldies'|'static',
//                 host?: CHARACTERS id or {th,en}, schedule?: [{ hours:[from,to], songs:[songId] | talk:'id' }] }
// SONGS[id] = { id, titleTH, titleEN, artistTH, artistEN, year, station, mood:'happy'|'sad'|'nostalgic'|'eerie'|'comic'|'lullaby',
//               tempoBpm, lyrics: [{ th, en }] (sung lines, in order) }
// DJ_LINES[stationId] = [{ hours?:[from,to], who, th, en, tone? }]  host chatter between songs
// LATE_NIGHT_WHISPERS = [Line]   station 3 (the lost frequency) / static bleed between stations
// FATHER_SONG = SONGS id of Somchai's favourite (memory m_song: station 3, 03:00–04:00)
// SPECIAL_BROADCASTS = scheduled one-off announcements (the 03:00 request for "The Way Home").

export const STATIONS = [
  // Numbering, names and dial labels match src/audio/Radio.js (STATION_NAMES), which renders the sound.
  {
    index: 1, id: 'lukthung', freq: 'FM 91.5', kind: 'lukthung',
    nameTH: 'ลูกทุ่งยามดึก', nameEN: 'Late-Night Luk Thung',
    host: 'djNok',
    schedule: [
      { hours: [21, 24], songs: ['countryTears', 'buffaloFarewell', 'jasmineGirl'] },
      { hours: [24, 27], songs: ['countryTears', 'jasmineGirl', 'buffaloFarewell'] },
      { hours: [27, 30], songs: ['buffaloFarewell', 'jasmineGirl', 'countryTears'] },
    ],
  },
  {
    index: 2, id: 'oldies', freq: 'FM 97.25', kind: 'oldies',
    nameTH: 'เพลงเก่าเล่าความหลัง', nameEN: 'Old Songs, Old Stories',
    host: { th: 'ครูเอื้อน', en: 'Khru Uean' },
    schedule: [
      { hours: [21, 24], songs: ['streetlightsDie', 'closeYourEyes'] },
      { hours: [24, 27], songs: ['bloodMoon', 'streetlightsDie', 'closeYourEyes'] },
      { hours: [27, 30], songs: ['closeYourEyes', 'streetlightsDie'] },
    ],
  },
  {
    // The lost frequency: dead air, whispers and a warped children's song all night. Only between
    // 03:00 and 04:00 does it play "ทางกลับบ้าน", requested by Somchai (memory m_song); from 04:00
    // to 05:00 Ah Kong's voice comes through the static (ahkong.js RADIO_CAMEO).
    index: 3, id: 'lost', freq: 'FM 103.3', kind: 'static',
    nameTH: '…', nameEN: '…',
    schedule: [
      { hours: [21, 27], songs: ['crossTheRoad'] },
      { hours: [27, 28], songs: ['wayHome'] }, // memory m_song (SPECIAL_BROADCASTS.fatherRequest)
      { hours: [28, 29], talk: 'ahKongCameo' },
      { hours: [29, 30], songs: ['crossTheRoad'] },
    ],
  },
  {
    index: 4, id: 'dhamma', freq: 'AM 1080', kind: 'dhamma',
    nameTH: 'ธรรมะยามดึก', nameEN: 'Late-Night Dhamma',
    host: { th: 'พระอาจารย์', en: 'the teaching monk' },
    schedule: [{ hours: [21, 26], talk: 'chant' }, { hours: [26, 28], talk: 'sermon' }, { hours: [28, 30], talk: 'chant' }],
  },
];

export const SONGS = {
  wayHome: {
    id: 'wayHome', titleTH: 'ทางกลับบ้าน', titleEN: 'The Way Home',
    artistTH: 'สมาน เสียงทอง', artistEN: 'Saman Golden-Voice', year: 1983, station: 'lost',
    mood: 'nostalgic', tempoBpm: 72,
    lyrics: [
      { th: 'ทางกลับบ้าน ไกลแค่ไหน ใจยังรอ', en: 'However long the road back home, my heart still waits' },
      { th: 'ฝนจะตก ฟ้าจะมืด ก็ไม่ท้อ', en: 'Let the rain fall, let the sky go dark, I won\'t give up' },
      { th: 'เปิดไฟหน้าบ้าน ทิ้งไว้ทุกคืน', en: 'I leave the porch light burning every night' },
      { th: 'เผื่อลูกหลงทาง จะได้เห็นทางกลับคืน', en: 'So if my child is lost, he\'ll see the way back' },
      { th: 'ล้างรถไว้รอ ทุกเช้าไม่เคยขาด', en: 'I wash the car and wait, every morning, without fail' },
      { th: 'กลับมาเมื่อไร พ่อไม่เคยโกรธเลย', en: 'Whenever you come back, I was never angry' },
    ],
  },
  streetlightsDie: {
    id: 'streetlightsDie', titleTH: 'ไฟทางดับ', titleEN: 'When the Streetlights Die',
    artistTH: 'สมาน เสียงทอง', artistEN: 'Saman Golden-Voice', year: 1981, station: 'oldies',
    mood: 'sad', tempoBpm: 80,
    lyrics: [
      { th: 'ไฟทางดับ ใจพี่ก็ดับตาม', en: 'When the streetlights die, my heart goes dark too' },
      { th: 'ถนนสายเก่า ยังเฝ้าถาม', en: 'The old road keeps on asking' },
      { th: 'น้องอยู่ไหน ในคืนฝนพรำ', en: 'Where are you, on this drizzling night?' },
      { th: 'พี่ขับวนรอ จนฟ้าสาง', en: 'I drive in circles, waiting for the dawn' },
    ],
  },
  closeYourEyes: {
    id: 'closeYourEyes', titleTH: 'หลับตาเถิดหนา', titleEN: 'Close Your Eyes',
    artistTH: 'สมาน เสียงทอง', artistEN: 'Saman Golden-Voice', year: 1984, station: 'oldies',
    mood: 'lullaby', tempoBpm: 60,
    lyrics: [
      { th: 'หลับตาเถิดหนา ฟ้ายังไม่สาง', en: 'Close your eyes, my dear, the dawn is still far' },
      { th: 'พี่จะร้องกล่อม ตลอดคืนยาว', en: "I'll sing to you all through the long night" },
      { th: 'ผีป่าผีเขา อย่ามากวนใจ', en: 'Spirits of the forest, spirits of the hills, let her be' },
      { th: 'ตื่นมาเมื่อไหร่ ตะวันจะส่องทาง', en: 'When you wake, the sun will light the way' },
    ],
  },
  countryTears: {
    id: 'countryTears', titleTH: 'น้ำตาหยดลงนา', titleEN: 'Tears on the Paddy',
    artistTH: 'ทองใบ ใจงาม', artistEN: 'Thongbai Jai-ngam', year: 1990, station: 'lukthung',
    mood: 'sad', tempoBpm: 96,
    lyrics: [
      { th: 'น้ำตาหยดลง กลางท้องนา', en: 'My tears fall down into the paddy' },
      { th: 'คิดถึงแม่ คิดถึงบ้านนา', en: 'I miss my mother, I miss the fields' },
      { th: 'ทำงานในเมือง เหนื่อยแทบขาดใจ', en: 'Working in the city, worn down to the bone' },
      { th: 'เมื่อไหร่จะได้ กลับไปไถนา', en: 'When will I get to go home and plough?' },
    ],
  },
  buffaloFarewell: {
    id: 'buffaloFarewell', titleTH: 'ลาก่อนควายเผือก', titleEN: 'Farewell, White Buffalo',
    artistTH: 'ทองใบ ใจงาม', artistEN: 'Thongbai Jai-ngam', year: 1992, station: 'lukthung',
    mood: 'comic', tempoBpm: 128,
    lyrics: [
      { th: 'ลาก่อนเด้อนาง ลาก่อนควายเผือก', en: 'Farewell, my girl, farewell, my white buffalo' },
      { th: 'พี่ต้องไปเลือก ทางเดินในเมือง', en: 'I must go and find my way in town' },
      { th: 'ถ้ารวยเมื่อไหร่ จะกลับมาเยี่ยม', en: "When I'm rich, I'll come back to visit" },
      { th: 'ถ้าจนเหมือนเดิม ก็กลับมาเหมือนเดิม', en: "If I'm still broke... I'll come back anyway" },
    ],
  },
  jasmineGirl: {
    id: 'jasmineGirl', titleTH: 'สาวมาลัยมะลิ', titleEN: 'The Jasmine Garland Girl',
    artistTH: 'น้ำผึ้ง ดอกแก้ว', artistEN: 'Namphueng Dokkaew', year: 2004, station: 'lukthung',
    mood: 'happy', tempoBpm: 132,
    lyrics: [
      { th: 'สาวมาลัยมะลิ ยืนยิ้มริมทาง', en: 'The jasmine garland girl, smiling by the road' },
      { th: 'พวงละยี่สิบ หอมไปทั้งทาง', en: 'Twenty baht a string, the whole road smells sweet' },
      { th: 'แท็กซี่จอดซื้อ ทุกเช้าไม่ขาด', en: 'The taxi stops to buy one every single morning' },
      { th: 'ไม่ได้อยากได้มาลัย อยากได้ใจคนขาย', en: "He doesn't want the garland, he wants the girl who sells it" },
    ],
  },
  bloodMoon: {
    id: 'bloodMoon', titleTH: 'จันทร์สีเลือด', titleEN: 'Blood Moon',
    artistTH: 'วงดอกงิ้ว', artistEN: 'Dok Ngiw Band', year: 1979, station: 'oldies',
    mood: 'eerie', tempoBpm: 66,
    lyrics: [
      { th: 'จันทร์สีแดง แขวนอยู่กลางฟ้า', en: 'A red moon hangs in the middle of the sky' },
      { th: 'ใครเรียกหา ในป่าลึกนั่น', en: 'Who is calling, deep in that forest?' },
      { th: 'อย่าขานตอบ อย่าหันไปหามัน', en: "Don't answer, don't turn to look" },
      { th: 'รอตะวันขึ้น ทุกอย่างจะผ่านไป', en: 'Wait for the sun, and it will all pass' },
    ],
  },
  crossTheRoad: {
    id: 'crossTheRoad', titleTH: 'ข้ามถนน', titleEN: 'Crossing the Road',
    artistTH: '(ไม่ทราบชื่อ)', artistEN: '(unknown)', year: null, station: 'lost',
    mood: 'eerie', tempoBpm: 90,
    lyrics: [
      { th: 'หนึ่ง สอง สาม ข้ามถนน มองซ้ายมองขวา', en: 'One, two, three, cross the road, look left, look right' },
      { th: 'จับมือแม่ไว้ อย่าวิ่งไปหน้า', en: "Hold Mum's hand, don't run on ahead" },
      { th: 'รถคันใหญ่มา ให้หยุดรอก่อน', en: 'When a big truck comes, stop and wait' },
      { th: 'หนึ่ง... สอง... สาม...', en: 'One... two... three...' },
    ],
  },
};

/** Somchai's favourite song (memory m_song; plays in the dawn ending). */
export const FATHER_SONG = 'wayHome';

const D = (hours, th, en, x = {}) => ({ hours, who: 'djNok', th, en, ...x });
const U = (hours, th, en, x = {}) => ({ hours, who: 'radio', speakerTH: 'ครูเอื้อน', speakerEN: 'Khru Uean', th, en, ...x });
const M = (hours, th, en, x = {}) => ({ hours, who: 'radio', speakerTH: 'พระอาจารย์', speakerEN: 'Teaching monk', th, en, ...x });

export const DJ_LINES = {
  lukthung: [
    D([21, 24], 'สวัสดีค่ะพี่ ๆ คนทำงานกะดึก ดีเจนกอยู่เป็นเพื่อนจนเช้านะคะ', 'Hello to all you night-shift workers! DJ Nok keeps you company till morning.'),
    D([21, 30], 'ใครง่วงก็จอดพักนะคะ อย่าฝืน', 'Feeling sleepy? Pull over and rest. Don\'t push it.'),
    D([21, 24], 'แจ้งเตือนค่ะ ทางหลวงสายป่าแถว กม. 10 หมอกลงหนา ขับช้า ๆ นะคะ', 'Traffic alert: thick fog on the forest highway near KM 10. Drive slowly.'),
    D([23, 26], 'เพลงต่อไป มีคนขอให้คนขับแท็กซี่เขียวเหลือง... ไม่บอกชื่อ', 'Next song is dedicated to the driver of the green-yellow taxi... no name given.', { emotion: 'surprise' }),
    D([24, 27], 'อุ๊ย มีสายเข้ามาค่ะ... ฮัลโหล... ฮัลโหลคะ?', 'Oh, we have a caller... hello? Hello?', { emotion: 'fear' }),
    D([26, 28], 'ตีสามแล้วนะคะ ใครยังไม่นอนบ้าง ส่งข้อความมาคุยกันได้', "It's three a.m. Who's still up? Text in and say hi."),
    D([26, 29], 'ก๋วยเตี๋ยวเรือป้าเล็กเปิดทั้งคืนนะคะ ดีเจนกกินประจำ', "Auntie Lek's boat noodles are open all night. DJ Nok's a regular."),
    D([28, 30], 'ขอบคุณพี่ ๆ ที่ฟังกันมาทั้งคืนนะคะ... ฟ้าสางแล้ว', 'Thank you for listening all night... the sky\'s getting light.', { emotion: 'smile' }),
  ],
  oldies: [
    U([21, 30], 'สถานีเพลงเก่า... ใครคิดถึงใคร ฟังจบแล้วโทรหาเขานะครับ', "Old songs, old memories... if you're missing someone, call them when this ends."),
    U([21, 27], 'เพลงนี้ร้องโดยสมาน เสียงทอง ผู้ล่วงลับ', 'This one is by the late Saman Golden-Voice.'),
    U([24, 27], 'ดึกแล้ว เพลงเศร้าหน่อยนะครับ', "It's late. Something a little sad."),
    U([28, 30], 'อรุณสวัสดิ์ครับ... เช้าแล้ว ใครยังขับรถอยู่ ขับดี ๆ', 'Good morning... if you\'re still on the road, drive safe.'),
  ],
  dhamma: [
    M([21, 30], 'อิติปิ โส ภะคะวา อะระหัง สัมมาสัมพุทโธ...', 'Iti pi so bhagava araham sammasambuddho...', { tone: 'sing' }),
    M([21, 30], 'ความโกรธเหมือนกำถ่านร้อน คนที่ร้อนก่อนคือตัวเราเอง', 'Anger is like gripping a hot coal. The first one burned is yourself.'),
    M([21, 30], 'การให้อภัย คือการวางของหนักลงจากใจ', 'To forgive is to set a heavy thing down from the heart.'),
    M([21, 30], 'อย่ารอให้สาย กว่าจะบอกรักคนในบ้าน', "Don't wait until it's too late to tell your family you love them."),
    M([21, 30], 'ทุกสิ่งเกิดขึ้น ตั้งอยู่ แล้วก็ดับไป', 'All things arise, remain a while, and pass away.'),
  ],
  lost: [],
};

/** Whispers that bleed through the lost frequency (station 3) and between stations. */
export const LATE_NIGHT_WHISPERS = [
  { who: 'voice', th: 'ช่วยด้วย...', en: 'Help me...', tone: 'whisper' },
  { who: 'voice', th: 'หนาว... หนาวจัง...', en: "Cold... so cold...", tone: 'whisper' },
  { who: 'voice', th: 'ใครก็ได้... มารับที', en: 'Anyone... come and get me...', tone: 'whisper' },
  { who: 'voice', th: 'กม. เก้า... กม. เก้า...', en: 'KM nine... KM nine...', tone: 'whisper' },
  { who: 'voice', th: 'อย่าเลี้ยวขวา...', en: "Don't turn right...", tone: 'whisper' },
  { who: 'voice', th: 'ต้น... หันมาสิ...', en: 'Ton... turn around...', tone: 'ghost' },
  { who: 'voice', th: 'รถเขียวเหลือง... รอด้วย...', en: 'Green-yellow cab... wait for me...', tone: 'whisper' },
  { who: 'voice', th: 'หนึ่ง... สอง... สาม...', en: 'One... two... three...', tone: 'whisper' },
];

/** Scheduled one-offs. The gameplay layer plays each once per night when the station is on. */
export const SPECIAL_BROADCASTS = [
  {
    // On the lost frequency an announcer nobody recognises reads one request, then plays the song.
    // Staged by ENCOUNTERS.fatherDedication (rule r15's exception) during ride 7 or free drive.
    id: 'fatherRequest', station: 'lost', hours: [27, 28], memory: 'm_song', then: 'wayHome',
    lines: [
      { who: 'radio', speakerTH: '(เสียงผู้ประกาศ)', speakerEN: '(an announcer)', th: 'ตีสามตรงครับ เพลงต่อไปมีคนขอมานานแล้ว', en: "Three o'clock. The next song was requested a long time ago.", tone: 'ghost' },
      { who: 'radio', speakerTH: '(เสียงผู้ประกาศ)', speakerEN: '(an announcer)', th: 'คุณสมชาย คนขับแท็กซี่ ขอให้ลูกชายที่กรุงเทพฯ', en: 'From Somchai, a taxi driver, for his son in Bangkok.', tone: 'ghost' },
      // r15 says: the radio says your name → retune. Its unwritten exception: this one. Listen to the end.
      { who: 'radio', speakerTH: '(เสียงผู้ประกาศ)', speakerEN: '(an announcer)', th: 'ฝากบอกว่า... ต้น พ่อรออยู่นะลูก', en: "He asks us to say... Ton, Dad's waiting, son.", tone: 'ghost', pause: 1.2 },
      { who: 'radio', speakerTH: '(เสียงผู้ประกาศ)', speakerEN: '(an announcer)', th: 'เพลง ทางกลับบ้าน ครับ', en: '"The Way Home".', tone: 'ghost' },
    ],
  },
  {
    // Dawn ending: whatever station is on, Khru Uean plays the father's song (the radio switches itself on).
    id: 'dawnSong', station: 'oldies', hours: [29, 30], ending: 'dawn', then: 'wayHome',
    lines: [{ who: 'radio', speakerTH: 'ครูเอื้อน', speakerEN: 'Khru Uean', th: 'อรุณสวัสดิ์ครับ เพลงนี้สำหรับทุกคนที่กำลังกลับบ้าน', en: 'Good morning. This one is for everyone on their way home.' }],
  },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
