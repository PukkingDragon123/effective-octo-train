// WORLD TEXT: every piece of written Thai/English in the world and on screen that isn't
// dialogue: road and shop signs, posters, the noodle menu, the garage calendar, the phone
// message, chapter cards, death cards and loading lines. All names are fictional.
// Every text is { th, en } (en may be a translation note for purely Thai signage).
//
// Exports: GAME_TITLE, PHONE_MESSAGE, SIGNS, SHOP_SIGNS, POSTERS, NOODLE_MENU, GARAGE_CALENDAR,
//   TAXI_TEXT, PAPER_TITLE, CHAPTERS, CHAPTER_TITLE_MAX_LOOP, DEATH_CARDS, DEATH_FOOTER, LOADING_LINES,
//   MENU_TEXT, HOUR_WORDS
import { PAPER } from './rules.js';

export const GAME_TITLE = {
  en: "DON'T LOOK BACK IN HORROR",
  th: 'กะดึก ห้ามหันหลัง',
  taglineTH: 'ซ้ายสำหรับคนตาย ขวาสำหรับคนเป็น',
  taglineEN: 'Left for the dead. Right for the living.',
  studio: 'Pukking Dragon',
};

/** The text that starts it all (shown on Ton's cracked phone in the intro). */
export const PHONE_MESSAGE = {
  fromTH: 'ไม่ทราบหมายเลข', fromEN: 'Unknown number', time: '20:41',
  th: 'รับคนขับกะดึก ติดต่ออากงที่อู่ กม.9', en: 'Night-shift driver wanted. See Ah Kong at the KM 9 garage.',
};

/** Thai time words for each game hour (21..30). */
export const HOUR_WORDS = {
  21: { th: 'สามทุ่ม', en: '9 p.m.' }, 22: { th: 'สี่ทุ่ม', en: '10 p.m.' }, 23: { th: 'ห้าทุ่ม', en: '11 p.m.' },
  24: { th: 'เที่ยงคืน', en: 'Midnight' }, 25: { th: 'ตีหนึ่ง', en: '1 a.m.' }, 26: { th: 'ตีสอง', en: '2 a.m.' },
  27: { th: 'ตีสาม', en: '3 a.m.' }, 28: { th: 'ตีสี่', en: '4 a.m.' }, 29: { th: 'ตีห้า', en: '5 a.m.' }, 30: { th: 'หกโมงเช้า', en: '6 a.m.' },
};

/**
 * Chapter cards on each hour change: ui.chapter({ time, word, th, en }).
 * Thai-first and nearly wordless: the card is the hour (`word` + digits, the UI draws both) plus an
 * optional 2–4-word title (`th`). Show the title only while saves.data.loops <= CHAPTER_TITLE_MAX_LOOP;
 * on later nights the card is just the hour (the night is the same night).
 * Rule for writers: evoke the hour, never reveal the passenger's nature or the rule event.
 */
export const CHAPTER_TITLE_MAX_LOOP = 0;
export const CHAPTERS = [
  { hour: 21, time: '21:00', word: 'สามทุ่ม', th: 'กะดึก', en: 'Night Shift' },
  { hour: 22, time: '22:00', word: 'สี่ทุ่ม', th: 'กลิ่นมะลิ', en: 'Jasmine' },
  { hour: 23, time: '23:00', word: 'ห้าทุ่ม', th: 'ร้านไม่เคยปิด', en: 'The Stall That Never Closes' },
  { hour: 24, time: '00:00', word: 'เที่ยงคืน', th: 'ป้ายรถเมล์ร้าง', en: 'The Empty Bus Stop' },
  { hour: 25, time: '01:00', word: 'ตีหนึ่ง', th: 'ใต้ต้นกล้วย', en: 'Under the Banana Tree' },
  { hour: 26, time: '02:00', word: 'ตีสอง', th: 'เจริญพร', en: 'Blessings' },
  { hour: 27, time: '03:00', word: 'ตีสาม', th: 'เพลงเก่า', en: 'An Old Song' },
  { hour: 28, time: '04:00', word: 'ตีสี่', th: 'พวงมาลัย', en: 'A Garland' },
  { hour: 29, time: '05:00', word: 'ตีห้า', th: 'เสาไฟต้นสุดท้าย', en: 'The Last Streetlight' },
  { hour: 30, time: '06:00', word: 'หกโมงเช้า', th: 'รุ่งสาง', en: 'Dawn' },
];

/**
 * Death screen text: ui.deathCard(DEATH_CARDS[type]). ONE short Thai line each. `rule` names the
 * rule that was broken, if any. Every death sends the night back to 21:00 (DEATH_FOOTER).
 */
export const DEATH_CARDS = {
  giantHand: { th: 'ทางซ้าย ไม่ใช่ทางของคนเป็น', en: 'The left road is not for the living.', rule: 'r2' },
  trueForm: { th: 'คุณมองหน้าเขา', en: 'You looked at the face.', rule: 'r4' },
  roadFold: { th: 'ถนนพับกลับมาหาคนที่ถูกทิ้ง', en: 'The road folds back for the one you left.', rule: 'r1' },
  windowAttack: { th: 'คนตายไม่อยากไปทางคนเป็น', en: 'The dead will not take the road of the living.', rule: 'r2' },
  dragBack: { th: 'เขาแค่อยากกลับบ้าน', en: 'He only wanted to go home.', rule: 'r2' },
  home: { th: 'บ้านไม่ใช่ที่ของคนตาย', en: 'Home is no place for the dead.', rule: 'r2' },
  lookBack: { th: 'คุณหันไปมอง', en: 'You looked back.', rule: 'r3' },
  ceilingCrawl: { th: 'ความมืดไม่ได้ว่างเปล่า', en: 'The dark was not empty.', rule: 'r9' },
  trunk: { th: 'คุณจอด', en: 'You stopped.', rule: 'r5' },
  nameCall: { th: 'คุณขานรับ', en: 'You answered.', rule: 'r7' },
  radio: { th: 'เพลงนั้นไม่มีวันจบ', en: 'The song never ended.', rule: 'r6' },
  breath: { th: 'มันเห็นหน้าคุณแล้ว', en: 'It has seen your face.', rule: 'r8' },
  yaiSpeed: { th: 'ไม่มีใครวิ่งชนะยาย', en: 'Nobody outruns Granny.', rule: null },
  crash: { th: 'ถนนนี้ไม่ให้อภัยคนใจร้อน', en: 'This road does not forgive the hurried.', rule: null },
  roadFigure: { th: 'คุณจอดให้มัน', en: 'You stopped for it.', rule: 'r12' },
  roofHanger: { th: 'คุณปัดมันลงมาเอง', en: 'You wiped it down yourself.', rule: 'r13' },
  count444: { th: 'มันนับถึงสิบก่อนคุณ', en: 'It reached ten first.', rule: 'r11' },
  windowArm: { th: 'คุณเปิดกระจกให้มัน', en: 'You let it in.', rule: 'r14' },
  extraPassenger: { th: 'คุณทักมัน', en: 'You spoke to it.', rule: 'r16' },
};
/** Under every death card: the loop. */
export const DEATH_FOOTER = { th: 'สามทุ่ม… อีกครั้ง', en: "Nine o'clock… again" };

/** Road signs and set-dressing text (signTex kinds in parentheses). */
export const SIGNS = {
  kmMarker: { th: 'กม. {km}', en: 'KM {km}' }, // ('km_marker' {km})
  curveWarning: { th: 'โค้งอันตราย ลดความเร็ว', en: 'Dangerous curve. Slow down.' }, // ('curve_warning')
  accidentCurve: { th: 'โค้งร้อยศพ ขับช้า ๆ ได้ถึงบ้าน', en: 'Hundred Corpses Curve. Drive slow, get home.' }, // ('warning_sign')
  elephantCrossing: { th: 'ระวัง ช้างป่าข้ามถนน', en: 'Caution: wild elephants crossing' }, // ('elephant_crossing')
  speedLimit: { th: 'ความเร็วไม่เกิน ๖๐', en: 'Speed limit 60', kmh: 60 }, // ('speed_sign' {kmh})
  villageWelcome: { th: 'บ้านห้วยทราย ยินดีต้อนรับ', en: 'Welcome to Huai Sai Village' }, // ('village_sign')
  forkLeft: { th: 'ทางเก่า (ปิด)', en: 'Old road (closed)' }, // ('fork_sign' {side:'left'})
  forkRight: { th: 'บ้านห้วยทราย ๒ กม.', en: 'Huai Sai Village 2 km' }, // ('fork_sign' {side:'right'})
  forkAhead: { th: 'หยุด! ทางแยกศาลเจ้ามารวย', en: 'STOP! Ma Ruay Shrine junction ahead' },
  shrineBoard: { th: 'ศาลเจ้ามารวย', en: 'Ma Ruay Shrine', chinese: '財來廟' }, // ('shrine_board')
  shrineCouplets: [ // ('couplet' {text}) — "Ma Ruay" puns on มา (come) + รวย (rich)
    { th: 'มาไหว้แล้วรวย', en: 'Come to pray, leave rich' },
    { th: 'ผ่านทางปลอดภัย', en: 'Pass by in safety' },
  ],
  honkPlease: { th: 'ผ่านศาล โปรดบีบแตร', en: 'Passing the shrine? Please honk.' },
  busStop: { th: 'ป้ายหยุดรถประจำทาง สาย ๙ (งดให้บริการ)', en: 'Bus stop, Route 9 (service discontinued)' }, // ('bus_stop_sign')
  temple: { th: 'วัดป่าเงียบสงัด', en: 'Wat Pa Ngiap Sa-ngat (the Silent Forest Temple)' }, // ('temple_sign')
  garage: { th: 'อู่ กม.9 ซ่อมได้ทุกอย่าง ยกเว้นหัวใจ', en: 'KM 9 Garage — we fix everything but hearts' }, // ('garage_sign')
  garageNoSmoking: { th: 'ห้ามสูบบุหรี่', en: 'No smoking', note: 'Hangs right above where Ah Kong smokes.' },
  noLitter: { th: 'ห้ามทิ้งขยะ ผีเห็นนะ', en: 'No littering. The ghosts can see you.' },
  nightWalkers: { th: 'ระวังคนเดินข้ามถนน (ช่วงกลางคืน)', en: 'Watch for pedestrians (at night)' },
  bridge: { th: 'สะพานห้วยเงียบ', en: 'Silent Creek Bridge' },
  spurRoad: { th: 'ทางลัด กม.9 ←', en: '← Shortcut to KM 9' },
};

export const SHOP_SIGNS = {
  noodleShop: { th: 'ก๋วยเตี๋ยวเรือป้าเล็ก เปิด ๒๔ ชม.', en: "Auntie Lek's Boat Noodles — open 24 hrs" },
  morningMarket: { th: 'ตลาดเช้าห้วยทราย', en: 'Huai Sai Morning Market' },
  garlandStall: { th: 'พวงมาลัยยายบัว', en: "Grandma Bua's Garlands" },
  grocery: { th: 'ร้านชำเจ๊หมวย (ปิดกิจการ)', en: "Jae Muay's Grocery (closed down)" },
  ice: { th: 'น้ำแข็งหลอด', en: 'Tube ice' },
  massage: { th: 'นวดแผนไทย ชม.ละ ๒๐๐', en: 'Thai massage, 200 an hour' },
  lottery: { th: 'ลอตเตอรี่ งวดนี้ เลขเด็ด!', en: 'Lottery tickets — lucky numbers this draw!' },
  fuel: { th: 'ปั๊มหลอด น้ำมัน ลิตรละ', en: 'Hand-pump fuel, per litre' },
};

/** Faded posters on salas, the bus stop and poles. variant = signTex('poster', {variant}).
 *  { variant, where:[landmark keys], th:[lines], en:[lines], strike?:{th,en} (token drawn crossed out), note? } */
export const POSTERS = [
  {
    // A mother's hand-lettered appeal, sun-faded, re-taped many times (the truck never stopped).
    variant: 'witnessBoy', where: ['busStop', 'sala1'],
    th: ['แม่ขอร้อง', 'ใครเห็นรถบรรทุกที่ชนลูกแม่ แล้วหนีไป', 'ด.ช. เอ็ม อายุ ๙ ขวบ ป้ายรถเมล์ กม.11', 'ช่วยบอกแม่ด้วย'],
    en: ['A MOTHER BEGS YOU', 'Did you see the truck that hit my son and drove away?', 'Master M, age 9, KM 11 bus stop', 'Please, tell me'],
  },
  {
    variant: 'samanConcert', where: ['sala2', 'noodleShop'],
    th: ['คืนนี้! งานวัดประจำปี', 'สมาน เสียงทอง', 'พร้อมหางเครื่องเต็มวง', 'พ.ศ. ๒๕๒๖'],
    en: ['TONIGHT! Annual temple fair', 'Saman Golden-Voice', 'With full dancing troupe', '1983'],
  },
  {
    // The highway department's tally board at the curve: "99" crossed out in marker, "100" written beside it.
    variant: 'curveTally', where: ['accidentCurve'],
    th: ['โค้งนี้', 'มีผู้เสียชีวิตแล้ว', '๙๙ ๑๐๐ ราย', 'ขับช้า ๆ ได้ถึงบ้าน'],
    en: ['THIS CURVE', 'has claimed', '99 100 lives', 'Drive slow, get home'],
    strike: { th: '๙๙', en: '99' }, // painted number crossed out; the 100 beside it is newer, hand-written marker
    note: 'Somchai was the hundredth.',
  },
  {
    variant: 'driverWanted', where: ['sala1', 'garage'],
    th: ['รับคนขับกะดึก', 'ติดต่ออากง อู่ กม.9', 'ไม่ต้องมีประสบการณ์', 'ขอแค่ทำตามกฎ'],
    en: ['NIGHT-SHIFT DRIVER WANTED', 'See Ah Kong, KM 9 garage', 'No experience needed', 'Just follow the rules'],
  },
  {
    variant: 'templeFair', where: ['forestTemple', 'marketLamp'],
    th: ['ขอเชิญร่วมทำบุญ', 'ทอดผ้าป่าสามัคคี', 'วัดป่าเงียบสงัด'],
    en: ['You are invited to make merit', 'Community robe-offering ceremony', 'Wat Pa Ngiap Sa-ngat'],
  },
];

/** Auntie Lek's menu board (prices in baht). */
export const NOODLE_MENU = {
  titleTH: 'ก๋วยเตี๋ยวเรือป้าเล็ก', titleEN: "Auntie Lek's Boat Noodles",
  items: [
    { th: 'ก๋วยเตี๋ยวเรือน้ำตก', en: 'Boat noodles, nam tok', price: 40 },
    { th: 'เส้นเล็กน้ำตก', en: 'Thin rice noodles, nam tok', price: 40, note: "Somchai's usual (no bean sprouts)" },
    { th: 'บะหมี่ต้มยำ', en: 'Tom yum egg noodles', price: 45 },
    { th: 'เกาเหลา', en: 'Noodle soup, no noodles', price: 50 },
    { th: 'พิเศษ', en: 'Extra large', price: 10, prefix: '+' },
    { th: 'กาแฟโบราณ ร้อน', en: 'Old-style coffee, hot', price: 20 },
    { th: 'กาแฟโบราณ เย็น', en: 'Old-style coffee, iced', price: 25 },
    { th: 'โอเลี้ยง', en: 'Iced black coffee', price: 20 },
    { th: 'ปาท่องโก๋ (๓ ตัว)', en: 'Fried dough sticks (3)', price: 10 },
    { th: 'ขนมปังสังขยา', en: 'Toast with pandan custard', price: 25 },
    { th: 'ไข่ลวก', en: 'Soft-boiled eggs', price: 10 },
  ],
  footnote: { th: 'ไม่มีเหล้าขาย (ลุงเปี๊ยกไม่ต้องมาขอ)', en: 'No alcohol sold (Uncle Piak, don\'t even ask)' },
  coffeePrice: 20, // the m_noodle interaction costs this much
};

/** The old Thai-Chinese wall calendar in the garage: stuck on the month Somchai died. */
export const GARAGE_CALENDAR = {
  titleTH: 'ปฏิทินมงคล อู่ กม.9', titleEN: 'KM 9 Garage Lucky Calendar',
  monthTH: 'กันยายน', monthEN: 'September',
  circledDay: 14,
  noteTH: 'ทำบุญ ๗ วัน ไอ้ชาย', noteEN: "Chai's 7th-day merit-making",
  footerTH: 'ขอให้ร่ำรวย ปลอดภัย ตลอดปี', footerEN: 'Wealth and safety all year round',
  designNote: 'Red-and-gold tear-off calendar with a fictional wealth deity; pages not torn since September (the rainy season).',
};

/** Text on and in the taxi. */
export const TAXI_TEXT = {
  roofSign: { th: 'แท็กซี่มิเตอร์', en: 'TAXI-METER' },
  vacantLamp: { th: 'ว่าง', en: 'VACANT' },
  plate: { text: 'ทข ๑๔๔๑', province: 'วังเวง', th: 'ทข ๑๔๔๑ วังเวง', en: 'TK 1441, Wang Weng' },
  meter: { fareTH: 'ค่าโดยสาร', fareEN: 'FARE', unitTH: 'บาท', unitEN: 'THB', distTH: 'ระยะทาง', distEN: 'DIST', startFare: 35 },
  doorDecal: { th: 'ขับช้า ๆ ลูกเมียรออยู่', en: 'Drive slow, the family is waiting' },
  dashSticker: { variant: 'blueElephant', note: 'Faded blue baby-elephant cartoon (original design). Memory m_sticker.' },
  sunVisorPhoto: { back: { th: 'ไอ้ต้น ๗ ขวบ', en: 'Ton, age 7' } },
};

/** Title block of Ah Kong's rules paper (the rules themselves are in rules.js). */
export const PAPER_TITLE = PAPER.title;

/** Lines shown while loading (and, rarely, on the death card). Short, half-remembered wisdom. */
export const LOADING_LINES = [
  { th: 'กระจกไม่โกหก', en: 'Mirrors do not lie.' },
  { th: 'คนเป็นหายใจ กระจกถึงเป็นฝ้า', en: 'The living breathe, and the glass fogs.' },
  { th: 'พระร้อนในมือ... คนข้างหลังไม่ใช่คน', en: "The amulet grows warm... whoever's behind you isn't human." },
  { th: 'ผ่านศาล บีบแตรสองที', en: 'Passing a shrine? Two honks.' },
  { th: 'คนตายจำราคาเก่า', en: 'The dead remember old prices.' },
  { th: 'รถไม่ยุบ... ก็ไม่มีใครนั่ง', en: "The car doesn't sink... nobody's sitting there." },
  { th: 'ตุ๊กแกร้องเจ็ดที', en: 'The gecko calls seven times.' },
  { th: 'พลิกกระดาษดูด้วย', en: 'Turn the paper over.' },
  { th: 'อย่าหัน', en: "Don't look back." },
];

/** Optional labels the UI may use (it may also keep its own). */
export const MENU_TEXT = {
  newGame: { th: 'เริ่มเกมใหม่', en: 'NEW GAME' },
  resume: { th: 'เล่นต่อ', en: 'RESUME' },
  settings: { th: 'ตั้งค่า', en: 'SETTINGS' },
  credits: { th: 'ผู้สร้าง', en: 'CREDITS' },
  quit: { th: 'กลับเมนูหลัก', en: 'QUIT TO MENU' },
  saved: { th: 'บันทึกแล้ว', en: 'Saved' },
  loopCounter: { th: 'คืนที่ {n}', en: 'Night {n}' },
  memories: { th: 'ความทรงจำ {n}/7', en: 'Memories {n}/7' },
};
