// Garage interludes: after these rides Ton drives back to the KM 9 garage. Ah Kong comes out to the
// cab window: a piece of the story (Somchai, the loop, his own secret), an act card when the night
// turns, the next rule taught in person; and a detail in the garage to look at (optional).
//   INTERLUDES[afterRideId] = { act?: chapter card, lines: [Line], inspect?: { anchor, labelTH, labelEN, lines } }
const K = (th, en, x = {}) => ({ who: 'ahKong', th, en, ...x });
const T = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });

export const INTERLUDES = {
  sri: {
    lines: [K('กลับมาแล้วเหรอ รอดคันแรกได้ ก็ไม่เลว', 'Back, are you? Survived the first one. Not bad.'), K('ยังไม่จบนะ คืนนี้ยาว', 'It’s not over. Tonight is long.')],
  },
  kaew: {
    act: { time: '00:00', word: 'เที่ยงคืน', th: 'องก์สอง · ความแปลก', en: 'Act II · The Strangeness' },
    lines: [
      K('ส่งพยาบาลแก้วไปแล้วสินะ… แกขึ้นรถคันนี้ทุกคืนตั้งแต่ไฟไหม้', 'Dropped Nurse Kaew, did you… she rides this car every night since the fire.'),
      K('ลื้อสังเกตไหม มิเตอร์มันขึ้นวันที่เก่า ๆ', 'Did you notice? The meter shows old dates.'),
      K('ปฏิทินในอู่ก็เหมือนกัน มันไม่เคยเปลี่ยนหน้าเลยสามสิบปี', 'So does the calendar in here. Hasn’t turned a page in thirty years.', { tone: 'whisper' }),
    ],
    inspect: { anchor: 'calendarAnchor', labelTH: 'ดูปฏิทิน', labelEN: 'Look at the calendar', lines: [T('วันที่สิบสี่… ปีสองห้าสามหก', 'The fourteenth… of the year two-five-three-six.'), T('วันเดียวกับในมิเตอร์', 'The same date as on the meter.', { tone: 'whisper' })] },
  },
  nuan: {
    lines: [
      K('รูปบนหิ้งนั่น… ลื้อเห็นหรือยัง', 'The photo on the altar… have you seen it yet?'),
      K('ไอ้ชาย คนขับคนเก่า อั๊วเป็นคนให้มันออกกะคืนนั้นเอง', 'Chai, the driver before you. I’m the one who sent him out on the shift that night.', { emotion: 'sad' }),
      K('มันอยากกลับไปหาลูกที่กรุงเทพฯ อั๊วบอกว่าอีกคืนเดียว', 'He wanted to go to his son in Bangkok. I said, one more night.', { emotion: 'sad' }),
    ],
    inspect: { anchor: 'altarAnchor', labelTH: 'ดูรูปบนหิ้ง', labelEN: 'Look at the altar photo', lines: [T('ผู้ชายยิ้มข้างรถแท็กซี่สีเขียวเหลือง', 'A man smiling beside a green-and-yellow taxi.'), T('…ผมจำรอยยิ้มนี้ได้', '…I know that smile.', { tone: 'whisper' })] },
  },
  monk: {
    act: { time: '03:00', word: 'ตีสาม', th: 'องก์สาม · รุ่งสาง', en: 'Act III · Before Dawn' },
    lines: [K('ตีสามแล้ว ช่วงนี้ผีมันเหนื่อย คนก็เหนื่อย', 'Three o’clock. The ghosts get tired now. So do people.'), K('อีกไม่กี่คัน ฟ้าก็จะสาง ทนอีกหน่อย', 'A few more fares and it’ll be dawn. Hold on a bit longer.')],
  },
  bride: {
    lines: [
      K('ลื้อรู้แล้วใช่ไหม ว่าทำไมอั๊วส่งลื้อออกมา', 'You know now, don’t you, why I sent you out.'),
      K('อั๊วรอให้ลูกของไอ้ชายกลับมาบ้าน มาสามสิบปีแล้ว', 'I’ve waited thirty years for Chai’s son to come home.', { emotion: 'sad' }),
      K('คันสุดท้าย… ลื้อจะเจอใครก็ไม่รู้ จำกฎให้ดี แล้วตัดสินใจเอง', 'The last fare… I can’t say who you’ll meet. Remember the rules. Then decide for yourself.', { tone: 'whisper' }),
    ],
  },
};
