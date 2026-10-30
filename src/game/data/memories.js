// MEMORIES: the 7 collectibles for the secret ending (GAME_DESIGN §7). They persist across
// loops in saves.data.memories. Collecting all 7, then delivering Somchai LEFT without
// looking back, unlocks the forgiveness choice at the mist gate.
//
// MEMORIES[i] = {
//   id: 'm_*', order,
//   titleTH, titleEN,
//   where: { landmark?: LAYOUT key | null, taxi?: interactable / anchor name, hours?: [from,to] },
//   how: { th, en }               short hint (debug / accessibility "memory hints" option),
//   interactId?: string|null      interact id to listen to (interact:use); null = use `event` + `requires` instead,
//   event?: bus event name that may complete it (amulet:hold, taxi:control),
//   requires?: { hours?:[from,to], station?:number, item?:string, onFoot?:boolean, stage?:string },
//   text: [{ th, en }]            the moment itself: shown as subtitles / Ton's thoughts when found,
//   pencil: { th, en }            Ton's pencil note added to the rules paper,
//   speaker?: CHARACTERS id       who speaks `text` (default: Ton thinking),
// }

export const MEMORIES = [
  {
    id: 'm_photo',
    order: 1,
    titleTH: 'รูปในที่บังแดด',
    titleEN: 'The Photo in the Sun Visor',
    where: { landmark: null, taxi: 'sunVisorDriver' },
    how: { th: 'เงยหน้ามองที่บังแดดฝั่งคนขับ แล้วกดดู', en: "Look up at the driver's sun visor and use it." },
    interactId: 'taxi.sunVisor',
    text: [
      { th: 'รูปเด็กผู้ชายยืนยิ้มข้างแท็กซี่คันนี้ ฟันหลอสองซี่', en: 'A little boy grinning beside this very taxi. Two front teeth missing.' },
      { th: 'ด้านหลังเขียนด้วยลายมือพ่อ "ไอ้ต้น ๗ ขวบ"', en: 'On the back, in Dad\'s handwriting: "Ton, age 7".' },
      { th: '...พ่อเก็บไว้ตรงนี้มาตลอดเลยเหรอ', en: '...he kept it here all this time?' },
    ],
    pencil: { th: 'รูปผมตอนเด็ก ในที่บังแดด', en: 'photo of me as a kid. sun visor.' },
  },
  {
    id: 'm_sticker',
    order: 2,
    titleTH: 'สติกเกอร์บนคอนโซล',
    titleEN: 'The Sticker on the Dashboard',
    where: { landmark: null, taxi: 'dashSticker' },
    how: { th: 'โน้มตัวเข้าไปดูสติกเกอร์ซีด ๆ บนคอนโซล', en: 'Lean in and inspect the faded sticker on the dashboard.' },
    interactId: 'taxi.sticker',
    text: [
      { th: 'สติกเกอร์ช้างน้อยสีฟ้า สีซีดจนเกือบขาว', en: 'A little blue elephant sticker, faded almost white.' },
      { th: 'ผมแปะเองตอนเจ็ดขวบ พ่อดุแทบตาย', en: 'I stuck it there when I was seven. Dad was furious.' },
      { th: 'แต่ยี่สิบปี... พ่อไม่เคยแกะมันออก', en: 'Twenty years... and he never peeled it off.' },
    ],
    pencil: { th: 'ช้างน้อยสีฟ้า ยังอยู่', en: 'little blue elephant. still there.' },
  },
  {
    id: 'm_amulet',
    order: 3,
    titleTH: 'พระของแม่',
    titleEN: "Mum's Amulet",
    where: { landmark: 'garage', taxi: 'amuletHang' },
    how: { th: 'กำพระที่ห้อยกระจกครั้งแรก (ช่วงสอนขับ)', en: 'Hold the amulet hanging from the mirror for the first time (tutorial).' },
    interactId: null, // fires on the first bus 'amulet:hold' {active:true} (tutorial step 'amulet')
    event: 'amulet:hold',
    requires: { stage: 'tutorial' },
    text: [
      { th: 'พระองค์เล็ก เลี่ยมกรอบทองเก่า ๆ อุ่นในมือ', en: 'A small amulet in an old gold frame. Warm in my hand.' },
      { th: 'แม่ห้อยให้พ่อตั้งแต่ก่อนผมเกิด', en: 'Mum hung it here for Dad before I was born.' },
      { th: 'แม่ไม่อยู่แล้ว... แต่พระของแม่ยังอยู่', en: "Mum's gone... but her amulet is still here." },
    ],
    pencil: { th: 'พระแม่ อุ่นเวลามีผี', en: "Mum's amulet. warms near ghosts." },
  },
  {
    id: 'm_helmet',
    order: 4,
    titleTH: 'หมวกกันน็อกที่โค้ง',
    titleEN: 'The Helmet at the Curve',
    where: { landmark: 'accidentCurve' },
    how: { th: 'ตอนขับเล่น ลงจากรถที่ศาลพวงหรีดตรงโค้งร้อยศพ', en: 'On a free drive, get out at the wreath memorial on Hundred Corpses Curve.' },
    interactId: 'world.memorialHelmet',
    requires: { onFoot: true },
    text: [
      { th: 'หมวกกันน็อกแตกร้าว วางอยู่ข้างพวงหรีด', en: 'A cracked helmet beside the wreaths.' },
      { th: 'สติกเกอร์ช้างน้อยสีฟ้า... แปะอยู่ที่หมวกด้วย', en: 'A little blue elephant sticker... on the helmet too.' },
      { th: 'คืนนั้นพ่อขี่มอเตอร์ไซค์... ไม่ได้ขับแท็กซี่', en: "That night Dad was on the motorbike... not in the taxi." },
    ],
    pencil: { th: 'หมวกพ่อ ที่โค้งร้อยศพ', en: "Dad's helmet. the curve." },
  },
  {
    id: 'm_noodle',
    order: 5,
    titleTH: 'เส้นเล็กน้ำตก',
    titleEN: 'Thin Noodles, Nam Tok',
    where: { landmark: 'noodleShop' },
    how: { th: 'แวะร้านป้าเล็ก ซื้อกาแฟสักแก้ว', en: "Stop at Auntie Lek's and buy a coffee." },
    interactId: 'world.noodleCounter',
    speaker: 'auntieLek',
    requires: { onFoot: true },
    text: [
      { th: 'ลูกไอ้ชายใช่ไหม หน้าเหมือนพ่อเลย', en: "You're Chai's boy, aren't you? Your dad's face exactly." },
      { th: 'สมชายชอบกินเส้นเล็กน้ำตก ไม่ใส่ถั่วงอก', en: 'Somchai always had thin noodles, nam tok. No bean sprouts.' },
      { th: 'กินไปก็คุยไป ว่าลูกชายเรียนเก่ง', en: 'Ate and bragged the whole time. Said his son was clever.' },
    ],
    pencil: { th: 'พ่อชอบเส้นเล็กน้ำตก ไม่งอก', en: 'Dad: thin noodles nam tok. no sprouts.' },
  },
  {
    id: 'm_letter',
    order: 6,
    titleTH: 'จดหมายที่ไม่ได้ส่ง',
    titleEN: 'The Unsent Letter',
    where: { landmark: null, taxi: 'gloveBox', hours: [26, 30] },
    how: { th: 'เปิดลิ้นชักหน้ารถ หลังตีสอง', en: 'Open the glovebox after 02:00.' },
    interactId: 'taxi.glovebox',
    requires: { hours: [26, 30] },
    text: [
      { th: '"ถึง ต้น"', en: '"To Ton,"' },
      { th: '"พ่อไม่รู้จะเริ่มยังไง พ่อพูดไม่เก่ง"', en: '"I don\'t know how to start. I was never good with words."' },
      { th: '"วันนั้นพ่อพูดแรงไป พ่อขอโทษ"', en: '"That day I said too much. I\'m sorry."' },
      { th: '"กลับบ้านเมื่อไหร่ พ่อจะล้างรถรอ"', en: '"Whenever you come home, I\'ll have the car washed and waiting."' },
      { th: '"— พ่อ"  (ไม่มีแสตมป์ ไม่ได้จ่าหน้า)', en: '"— Dad"  (no stamp, no address)' },
    ],
    pencil: { th: 'จดหมายพ่อ... พ่อขอโทษก่อน', en: "Dad's letter... he said sorry first." },
  },
  {
    id: 'm_song',
    order: 7,
    titleTH: 'เพลงโปรดของพ่อ',
    titleEN: "Dad's Favourite Song",
    where: { landmark: null, taxi: 'radioKnob', hours: [27, 28] },
    how: { th: 'จูนวิทยุไปคลื่นสามช่วงตีสามถึงตีสี่', en: 'Tune the radio to station 3 between 03:00 and 04:00.' },
    interactId: null, // fires when taxi.state.radioOn && radioStation === 3 during the hours (taxi:control radio / radioTune)
    event: 'taxi:control',
    requires: { hours: [27, 28], station: 3 },
    text: [
      { th: 'เพลง "ทางกลับบ้าน"... สมาน เสียงทอง', en: '"The Way Home"... Saman Golden-Voice.' },
      { th: 'เพลงนี้ดังในรถทุกเช้า ตอนพ่อไปส่งผมที่โรงเรียน', en: 'This played in the car every morning, when Dad drove me to school.' },
      { th: 'ผมยังร้องได้ทุกคำ', en: 'I still know every word.' },
    ],
    pencil: { th: 'คลื่น 3 ตีสาม เพลงพ่อ', en: 'station 3 at 3am. Dad\'s song.' },
  },
];

export const MEMORY_IDS = MEMORIES.map((m) => m.id);
export const MEMORY_COUNT = MEMORIES.length;
/** True when the save holds every memory (forgiveness ending available). */
export const hasAllMemories = (ids = []) => MEMORY_IDS.every((id) => ids.includes(id));
