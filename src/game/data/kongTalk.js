// Ah Kong's own voice outside the scripted scenes: idle chatter while he smokes, grumbling, little
// reactions to what Ton does, and scolding that escalates in three levels when Ton is slow or gets
// it wrong (level 3: he grabs the task and does it himself). An old Teochew-Thai garage man: ลื้อ/อั๊ว,
// harsh and rude, never slurs. Lines follow SCHEMA.md ({ who, th, en, tone?, emotion? }).
//
//   KONG_IDLE        while he waits or watches (one at a time, between his cigarettes)
//   KONG_REACT[ev]   chips (Ton ate his crisps), shrineWrong, stall,
//                    bump (the taxi hit something), offRoadScrape
//   KONG_SCOLD[ctx]  [level1[], level2[], level3[]]  ctx: slow, wrong, stall, badDrive
//   KONG_TAKEOVER[task]  what he says as he does it himself (shrine, offering, cloth, tutorial, park)
const K = (th, en, x = {}) => ({ who: 'ahKong', th, en, ...x });

export const KONG_IDLE = [
  K('ยุงเยอะชิบหาย ยาจุดกันยุงก็ไม่ช่วยอะไร', 'Damn mosquitoes. The coil does nothing.'),
  K('สมัยก่อนถนนเส้นนี้รถวิ่งทั้งคืน เดี๋ยวนี้มีแต่ผี', 'This road used to have traffic all night. Now it’s only ghosts.'),
  K('หลอดไฟนี่ก็เหมือนอั๊ว ติด ๆ ดับ ๆ แต่ยังไม่ตาย', 'That tube’s like me. Flickers, but not dead yet.'),
  K('บุหรี่ซองสุดท้ายแล้ว ต้องไปซื้อที่ตลาด', 'Last pack. I’ll have to go to the market.'),
  K('ลื้อหน้าเหมือนใครคนนึง… ช่างเถอะ', 'You look like someone I knew… never mind.'),
  K('เครื่องคันนี้อั๊วยกเองกับมือ ยี่สิบปีแล้วยังวิ่งดี', 'I rebuilt that engine with my own hands. Twenty years and it still runs.'),
  K('คืนนี้ลมนิ่งผิดปกติ ไม่ชอบเลย', 'The air’s too still tonight. I don’t like it.'),
  K('อย่ามัวแต่ยืนเกาหัว งานมันไม่ทำตัวเองหรอก', 'Don’t just stand there scratching your head. Work doesn’t do itself.'),
];

export const KONG_REACT = {
  chips: [K('ขนมกรุบกรอบของอั๊วหายไปไหน… ลื้อกินใช่มั้ย ไอ้เด็กบ้า', 'Where did my crisps go… you ate them, didn’t you, you little fool.', { emotion: 'anger' })],
  shrineWrong: [K('โง่เป็นควาย! บอกแล้วว่าห้ามข้ามขั้น', 'Thick as a buffalo! I told you not to skip a step.', { emotion: 'anger', tone: 'shout' })],
  stall: [K('ดับอีกแล้ว! เหยียบคลัตช์ให้มันสุดสิวะ', 'Stalled again! Push the clutch all the way down!', { emotion: 'anger' })],
  bump: [K('ไอ้เวร! รถอั๊วนะเว้ย ไม่ใช่รถชน', 'You wretch! That’s my cab, not a bumper car!', { emotion: 'anger', tone: 'shout' })],
};

export const KONG_SCOLD = {
  slow: [
    [K('ชักช้าอยู่ได้', 'Dawdling again.'), K('เร็ว ๆ หน่อย อั๊วไม่ได้มีเวลาทั้งคืน', 'Hurry up. I don’t have all night.')],
    [K('ไอ้เด็กบ้า ช้าเป็นเต่าคลานเลย', 'You daft kid, slow as a crawling turtle.', { emotion: 'anger' }), K('ทำแค่นี้ทำไม่เป็นเหรอ ลูกใครวะเนี่ย', 'Can’t even do this much? Whose son are you?', { emotion: 'anger' })],
    [K('พอ ๆ หลบไป! อั๊วทำเองก็ได้', 'Enough! Out of the way! I’ll do it myself.', { emotion: 'anger', tone: 'shout' })],
  ],
  wrong: [
    [K('ไม่ใช่แบบนั้น ดูดี ๆ', 'Not like that. Look properly.')],
    [K('โง่เป็นควายจริง ๆ บอกแล้วยังทำผิด', 'Thick as a buffalo. Told you, and still wrong.', { emotion: 'anger' })],
    [K('ไอ้เวรเอ๊ย! เอามานี่ อั๊วทำเอง', 'Damn you! Give it here, I’ll do it.', { emotion: 'anger', tone: 'shout' })],
  ],
  stall: [
    [K('ดับอีกละ ค่อย ๆ ปล่อยคลัตช์', 'Stalled. Let the clutch out slowly.')],
    [K('รถดับเป็นรอบที่เท่าไหร่แล้ว ไอ้เด็กบ้า', 'How many times is that now, you daft kid?', { emotion: 'anger' })],
    [K('พอเลย! ขับรถแบบนี้ไปตายที่ไหนก็ไม่รู้', 'That’s it! Drive like that and you’ll die out there.', { emotion: 'anger', tone: 'shout' })],
  ],
  badDrive: [
    [K('เฮ้ย ระวัง! ถนนอยู่ตรงกลาง ไม่ใช่ข้างทาง', 'Hey, careful! The road’s in the middle, not the verge.')],
    [K('ไอ้เวร! ขับรถหรือไถนาวะ', 'You wretch! Are you driving or ploughing?', { emotion: 'anger', tone: 'shout' })],
    [K('จอด! อั๊วจอดให้เอง ดูไว้', 'Stop! I’ll park it myself. Watch.', { emotion: 'anger', tone: 'shout' })],
  ],
};

export const KONG_TAKEOVER = {
  shrine: [K('ดูไว้ จุดสามดอก ไหว้ แล้วค่อยปัก ไม่ยากเลย', 'Watch. Light three, wai, then plant. It’s not hard.')],
  offering: [K('ของแค่นี้ยกไม่ไหวรึไง', 'Can’t even carry this much?')],
  cloth: [K('ผูกผ้าแค่นี้ก็ไม่เป็น อนาถจริง', 'Can’t even tie a bit of cloth. Pathetic.')],
  tutorial: [K('ดูอั๊วทำ แล้วจำไว้', 'Watch me do it. And remember.')],
  park: [K('นี่ จอดแบบนี้ ไม่ใช่ทิ้งไว้กลางถนน', 'There. Park it like that, not in the middle of the road.')],
  done: [K('เห็นมั้ย ง่ายนิดเดียว', 'See? Easy as anything.'), K('คราวหน้าทำเองนะ ไอ้หนู', 'Next time you do it yourself, boy.')],
};

/** Ton asks him (interact on Ah Kong). `next` is filled in from the current task at the time. */
export const KONG_ASK = {
  options: { next: { th: 'ต้องทำอะไรต่อครับ', en: 'What do I do next?' }, whyPray: { th: 'ทำไมต้องไหว้ครับ', en: 'Why do I have to pray?' }, where: { th: 'อากงไปไหนมาครับ', en: 'Where were you, Ah Kong?' } },
  whyPray: [K('เจ้าที่เขาดูแลถนนเส้นนี้ ไม่ไหว้ก็เหมือนเข้าบ้านคนอื่นไม่ถอดรองเท้า', 'The spirits look after this road. Not praying is like walking into a house with your shoes on.'), K('คืนนี้ลื้อต้องพึ่งเขา จำไว้', 'Tonight you’ll need them. Remember that.')],
  where: [K('ไปส่งของให้ตาหวัดท้ายหมู่บ้าน… อย่าถามมาก', 'Taking something to old Wat at the end of the village… don’t ask so much.')],
  nothingLeft: [K('ไม่มีอะไรแล้ว ไปได้แล้ว', 'Nothing more. Go on, then.')],
  getIn: [K('ขึ้นรถสิ จะยืนรออะไร', 'Get in the car. What are you waiting for?')],
};
export const CHORES_ALREADY = [K('ทำเองหมดแล้วเหรอ… ไม่เลวนี่ไอ้หนู', 'Did it all yourself already… not bad, boy.', { emotion: 'smile' })];

/** One short Thai objective per task (ui Objective, top-left). */
export const OBJECTIVES = {
  ride: { th: 'ขี่ไปที่อู่ กม.๙', en: 'Ride to the KM 9 garage' },
  waitKong: { th: 'รออากง', en: 'Wait for Ah Kong' },
  talkKong: { th: 'คุยกับอากง', en: 'Talk to Ah Kong' },
  shrine: { th: 'ไหว้ศาลพระภูมิ', en: 'Pray at the spirit house' },
  offering: { th: 'วางน้ำแดงกับข้าวที่ประตู', en: 'Leave the soda and rice by the gate' },
  cloth: { th: 'ผูกผ้าสามสีที่กระจกรถ', en: 'Tie the cloth on the taxi mirror' },
  coins: { th: 'นับเหรียญในกระป๋อง', en: 'Count the coins in the tin' },
  keys: { th: 'รับกุญแจจากอากง', en: 'Take the keys from Ah Kong' },
  chores: { th: 'ทำตามที่อากงสั่ง', en: 'Do what Ah Kong asked' },
  getIn: { th: 'ขึ้นรถแท็กซี่', en: 'Get into the taxi' },
  pickup: { th: 'ขับไปรับลูกค้า', en: 'Drive to the customer' },
  deliver: { th: 'ไปส่งที่ {dest}', en: 'Take them to {dest}' },
  fork: { th: 'เลือกทาง ซ้ายหรือขวา', en: 'Choose: left or right' },
};
