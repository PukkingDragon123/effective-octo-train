// Content for the taxi's dashboard monitor (HeadUnit.js): karaoke lyrics for the radio's
// original songs, the cheesy VCD title cards, Somchai's cat album captions, and the photo lists
// (real CC0 / public-domain photos in public/assets/textures/screens/, credited in
// docs/credits/screens.md).
//
// The radio sings vocalese (src/audio/Synth/songs.js renders melody notes, not words), so the
// words here are ORIGINAL lines written to the song titles the radio announces. Lyrics are keyed
// by the Thai title in the radio's programme plan. Each verse = 4 lines, one per 2-bar phrase
// (4-bar phrases for the father's song); the screen sweeps the colour across each line note by
// note in time with the plan's melody.

/** Lyrics by song title (th). A: verses (one per A section, cycling), B: chorus (every B section). */
export const KARAOKE = {
  // ---- station 1: luk thung ----
  'สาวนาคอยรัก': {
    artist: 'น้ำผึ้ง ดอกแก้ว',
    A: [
      ['ลมหนาวพัดมา ทุ่งนาเหลืองทอง', 'น้องยืนมองทาง ที่พี่จากไป', 'รับปากว่ากลับ หลังเกี่ยวข้าวใหม่', 'ข้าวเต็มยุ้งแล้ว พี่อยู่แห่งไหน'],
      ['จดหมายฉบับเก่า น้องอ่านทุกคืน', 'น้ำตามันซึม จนกระดาษยับ', 'ได้ข่าวว่าพี่ มีใครคนใหม่', 'น้องไม่เชื่อหรอก จนกว่าพี่จะบอก'],
    ],
    B: ['สาวนาคอยรัก คอยพี่ทุกวัน', 'ตะวันลับฟ้า น้องยังรำพัน', 'อย่าลืมคำมั่น ที่ให้กันไว้', 'กลับมาเถิดพี่ ก่อนน้องหมดใจ'],
  },
  'รถเมล์สายสุดท้าย': {
    artist: 'ทองใบ ใจงาม',
    A: [
      ['รถเมล์สายสุดท้าย ออกจากในเมือง', 'นั่งริมหน้าต่าง คิดถึงบ้านนา', 'เงินเดือนไม่กี่บาท ห่อไว้ให้แม่', 'ฝากความคิดถึง ไปกับลมฟ้า'],
      ['กระเป๋าใบเก่า มีขนมฝากน้อง', 'เสื้อตัวใหม่ ซื้อมาให้พ่อ', 'ป้ายรถเมล์หน้าบ้าน คงมีใครรอ', 'ใจมันเร่งรถ ให้ถึงเร็วกว่านี้'],
    ],
    B: ['รถเมล์สายสุดท้าย พาใจกลับบ้าน', 'ผ่านทุ่งผ่านป่า ผ่านคืนยาวนาน', 'คนขับก็ง่วง คนนั่งก็ฝัน', 'ถึงบ้านเมื่อไหร่ จะกอดแม่ให้นาน'],
  },
  'ฝนตกที่บ้านเกิด': {
    artist: 'น้ำผึ้ง ดอกแก้ว',
    A: [
      ['ฝนตกที่บ้านเกิด หรือเปล่าหนอ', 'หลังคาสังกะสี คงดังเปาะแปะ', 'แม่คงนั่งรอ หน้าประตูแง้ม', 'ส่วนลูกยังแบก ความฝันในเมือง'],
      ['กลิ่นดินหลังฝน ยังจำได้ดี', 'ปลาตัวเล็กตัวน้อย ในคูหลังบ้าน', 'เพื่อนเก่าคงแต่งงาน มีลูกหลายคน', 'เหลือแต่ฉันนี้ ยังคงหลงทาง'],
    ],
    B: ['ฝนเอ๋ยฝนตก ช่วยบอกแม่ที', 'ลูกยังสบายดี อย่าห่วงอะไร', 'ถึงตัวไม่กลับ แต่ใจกลับไป', 'ทุกหยาดฝนใส คือน้ำตาคิดถึง'],
  },
  'คิดถึงแม่ที่อีสาน': {
    artist: 'น้ำผึ้ง ดอกแก้ว',
    A: [
      ['โทรหาแม่ทีไร แม่ถามกินข้าวหรือยัง', 'ลูกตอบว่ากินแล้ว ทั้งที่ท้องยังว่าง', 'เก็บเงินทีละนิด ส่งไปให้ทางบ้าน', 'สงกรานต์ปีนี้ จะกลับไปหาแม่'],
      ['เสียงแคนแว่วมา ตอนดึกดื่น', 'น้ำตาก็ไหล ตื่นมาคนเดียว', 'เพื่อนร่วมห้อง หลับไปหมดแล้ว', 'เหลือแต่ดวงจันทร์ เป็นเพื่อนเหงา'],
    ],
    B: ['คิดถึงแม่ที่อีสาน ข้าวเหนียวส้มตำ', 'คิดถึงทุกคำ ที่แม่สอนไว้', 'ไม่ว่าลำบาก สักเท่าไร', 'รักของแม่ ไม่เคยหายไปไหน'],
  },
  // ---- station 2: old string-era ballads ----
  'ราตรีประดับดาว': {
    artist: 'สมาน เสียงทอง',
    A: [
      ['ราตรีประดับดาว พราวพร่างฟ้า', 'ลมพัดมา หอมกลิ่นราตรี', 'ใจพี่นั้นเฝ้า คะนึงถึงนาง', 'ไม่เคยจืดจาง แม้นานเท่าไร'],
      ['ดาวดวงไหน สุกใสเท่าเธอ', 'พี่เพ้อละเมอ ทุกคืนวันไป', 'หากดาวตกลง จะขอสิ่งใด', 'ขอเพียงหัวใจ เธอเท่านั้นเอง'],
    ],
  },
  'จันทร์เจ้าขา': {
    artist: 'สมาน เสียงทอง',
    A: [
      ['จันทร์เจ้าขา ช่วยฟังพี่หน่อย', 'ใจมันละห้อย คอยใครคนหนึ่ง', 'ส่องแสงนวลไป ถึงเรือนน้องที', 'บอกว่าคนดี ยังรักไม่คลาย'],
      ['จันทร์เจ้าเอ๋ย เคยเห็นเราสอง', 'นั่งเคียงกันมอง ฟ้าแสนกว้างไกล', 'คืนนี้จันทร์เพ็ญ เหมือนครั้งเก่าไหม', 'เหลือแต่เพียงใจ ที่ยังรอคอย'],
    ],
  },
  'ลมหนาวที่เชียงคาน': {
    artist: 'สมาน เสียงทอง',
    A: [
      ['ลมหนาวพัดผ่าน ริมโขงยามเช้า', 'หมอกขาวบางเบา คลุมบ้านไม้เก่า', 'เราเคยเดินจูง มือกันสองเรา', 'ป่านนี้เธอเล่า อยู่ไหนคนดี'],
      ['ข้าวเหนียวมูนร้อน ยังหอมเหมือนเดิม', 'ต่างกันเพียงเติม ความเหงาเข้าไป', 'หนาวนี้ไม่มี ใครให้ห่มใจ', 'ลมหนาวเอ๋ยไป บอกเธอให้ที'],
    ],
  },
  // ---- station 3, 03:00-04:00: the father's song (memory m_song). No cats, no starbursts. ----
  'ฝากรักไว้ที่ปลายทาง': {
    artist: '',
    quiet: true,
    A: [
      ['ถนนสายนี้ พ่อขับทุกคืน', 'ฝนตกแดดออก ก็ยังทนฝืน', 'ฝากรักไว้ที่ ปลายทางข้างหน้า', 'เผื่อลูกกลับมา จะได้เจอกัน'],
      ['ล้างรถทุกเช้า เผื่อลูกกลับบ้าน', 'เปิดไฟหน้าบ้าน ทิ้งไว้ทุกวัน', 'ถ้าวันหนึ่งพ่อ ไม่อยู่รอนั้น', 'ขอให้รู้ว่ารัก ไม่เคยจางหาย'],
    ],
  },
};

/** Used when the radio plays a title this table does not know. */
export const KARAOKE_FALLBACK = {
  artist: '',
  A: [['ขับรถยามดึก ฟังเพลงเบา ๆ', 'ไฟหน้ารถส่อง ทางที่ยาวไกล', 'ใครรออยู่บ้าน อย่าเพิ่งหลับไป', 'อีกไม่นานหรอก จะถึงปลายทาง']],
  B: ['ลา ลา ลา ลัน ลา ลา ลา', 'ร้องตามไปเถิด ไม่มีใครฟัง', 'ลา ลา ลา ลัน ลา ลา ลา', 'ถึงบ้านเมื่อไหร่ ค่อยร้องใหม่'],
};

/** The scare: for 2-3 frames the lyric line becomes this. */
export const SCARE_LINE = 'อย่าหันไปมอง';

/** The bootleg VCD the driver keeps in the slot (fictional label, no real brand). */
export const VCD = {
  series: 'ลูกทุ่งฮิตติดรถ ชุดที่ ๗',
  karaoke: 'คาราโอเกะ',
  genuine: 'แผ่นแท้ 100%',
  singer: 'ขับร้อง',
};

/** Cat album captions (Somchai's own words, typed on the head unit with one finger). */
export const ALBUM_TITLE = 'อัลบั้มแมว';
export const ALBUM_NOTE = 'ห้ามลบ!!';

/**
 * Photo lists. file = WebP in public/assets/textures/screens/ (512 px wide). For cats:
 * caption (Thai), date stamp (old-camera style 'YY M D), frame style.
 * Filled in from the credited downloads; the screen skips any file that fails to load.
 */
export const CAT_PHOTOS = [];
export const SCENERY_PHOTOS = [];

export const SCREEN_PATH = 'assets/textures/screens/';
