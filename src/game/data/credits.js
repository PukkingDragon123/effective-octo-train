// CREDITS: rolled from the main menu and after every ending (ENDINGS[id].creditsExtra is
// appended at the end). Sections render in order; each entry is a role/name pair or a
// plain line. Everything is bilingual. Keep "Made by Pukking Dragon" prominent.
//
// CREDITS = [{ id, titleTH, titleEN, entries: [{ roleTH?, roleEN?, name } | { th, en }] }]
// CREDITS_HEADLINE = { th, en }   big card shown first
// CREDITS_CLOSING = { th, en }    last card

export const CREDITS_HEADLINE = { th: 'สร้างโดย Pukking Dragon', en: 'Made by Pukking Dragon' };

export const CREDITS = [
  {
    id: 'game',
    titleTH: 'เกม',
    titleEN: 'Game',
    entries: [
      { th: 'DON\'T LOOK BACK IN HORROR', en: 'DON\'T LOOK BACK IN HORROR' },
      { roleTH: 'เกมโดย', roleEN: 'Game by', name: 'Pukking Dragon' },
      { roleTH: 'ออกแบบเกมและกำกับ', roleEN: 'Game Design & Direction', name: 'Pukking Dragon' },
      { roleTH: 'เรื่องและบท', roleEN: 'Story & Script', name: 'Pukking Dragon' },
      { roleTH: 'ภาพ เสียง และดนตรี', roleEN: 'Art, Sound & Music', name: 'Pukking Dragon' },
    ],
  },
  {
    id: 'cast',
    titleTH: 'ตัวละคร',
    titleEN: 'Characters',
    entries: [
      { roleTH: 'ต้น', roleEN: 'Ton', name: 'คนขับกะดึก · the night-shift driver' },
      { roleTH: 'อากง', roleEN: 'Ah Kong', name: 'คนเฝ้าอู่ กม.9 · keeper of the KM 9 garage' },
      { roleTH: 'สมชาย', roleEN: 'Somchai', name: 'พ่อ · father' },
      { roleTH: 'ป้าศรี', roleEN: 'Auntie Sri', name: 'แม่ค้ามาลัยมะลิ · jasmine-garland vendor' },
      { roleTH: 'หญิงชุดขาว', roleEN: 'The Woman in White', name: 'ผู้ที่ยังรอ · still waiting' },
      { roleTH: 'ลุงเปี๊ยก', roleEN: 'Uncle Piak', name: 'นักร้องสมัครเล่น · amateur singer' },
      { roleTH: 'น้องเอ็ม', roleEN: 'Little M', name: 'นักเรียน ป.๓ · third-grader' },
      { roleTH: 'คุณนวล', roleEN: 'Khun Nuan', name: 'นางตานี · the banana-tree spirit' },
      { roleTH: 'หลวงพี่', roleEN: 'Luang Phi', name: 'พระธุดงค์ · wandering monk' },
      { roleTH: 'ลุงสมาน', roleEN: 'Uncle Saman', name: 'สมาน เสียงทอง · Golden-Voice' },
      { roleTH: 'ยายบัว', roleEN: 'Grandma Bua', name: 'แม่ค้าพวงมาลัย · garland seller' },
      { roleTH: 'ป้าเล็ก', roleEN: 'Auntie Lek', name: 'ร้านก๋วยเตี๋ยวเรือ · boat-noodle stall' },
      { roleTH: 'ยายสปีด', roleEN: 'Yai Speed', name: 'ไม่มีใครวิ่งชนะ · undefeated' },
    ],
  },
  {
    id: 'tech',
    titleTH: 'เทคโนโลยีและสัญญาอนุญาต',
    titleEN: 'Technology & Licences',
    entries: [
      { roleTH: 'เอนจินสามมิติ', roleEN: '3D engine', name: 'three.js — MIT License' },
      { roleTH: 'เครื่องมือพัฒนา', roleEN: 'Build tooling', name: 'Vite — MIT License' },
      { roleTH: 'ฟอนต์', roleEN: 'Fonts', name: 'Srisakdi (Cadson Demak) — SIL Open Font License 1.1' },
      { th: 'ภาพ โมเดล พื้นผิว แอนิเมชัน เสียง และดนตรีทั้งหมด สร้างขึ้นด้วยโค้ดแบบโพรซีเดอรัล', en: 'All visuals, models, textures, animation, sound and music are procedurally generated in code.' },
      { th: 'เสียงพูดภาษาไทยใช้เสียงสังเคราะห์ของระบบปฏิบัติการ (ถ้ามี)', en: 'Thai speech uses your operating system\'s speech synthesis voice, when available.' },
    ],
  },
  {
    id: 'fiction',
    titleTH: 'หมายเหตุ',
    titleEN: 'Note',
    entries: [
      { th: 'ตัวละคร สถานที่ เพลง สถานีวิทยุ และร้านค้าทั้งหมดเป็นเรื่องสมมติ', en: 'All characters, places, songs, radio stations and shops are fictional.' },
      { th: 'ความเชื่อพื้นบ้านในเกมได้แรงบันดาลใจจากเรื่องเล่าผีไทย ด้วยความเคารพ', en: 'The folklore in this game is inspired by Thai ghost stories, told with respect.' },
    ],
  },
  {
    id: 'thanks',
    titleTH: 'ขอบคุณ',
    titleEN: 'Thanks',
    entries: [
      { th: 'คนขับแท็กซี่กะดึกทุกคน', en: 'Every night-shift taxi driver' },
      { th: 'ร้านก๋วยเตี๋ยวที่เปิดทั้งคืน', en: 'The noodle stalls that stay open all night' },
      { th: 'ยาย ๆ ที่ร้อยพวงมาลัยตั้งแต่ตีสี่', en: 'The grandmothers who string garlands from four in the morning' },
      { th: 'ทุกคนที่เล่าเรื่องผีให้ฟังตอนเด็ก ๆ', en: 'Everyone who told us ghost stories when we were small' },
      { th: 'และพ่อทุกคนที่พูดไม่เก่ง', en: 'And every father who was never good with words' },
      { th: 'ขอบคุณที่เล่นจนถึงเช้า', en: 'Thank you for playing until morning' },
    ],
  },
];

export const CREDITS_CLOSING = { th: 'Pukking Dragon · อย่าหันหลังกลับไปมอง', en: "Pukking Dragon · Don't look back" };
