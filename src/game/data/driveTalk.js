// Ton's own voice while driving, and the passengers' reactions to how he drives.
//   TON_REACT[ev]   hardBrake, swerve, nearCrash, nearFall      (gasps, curses: rude, never slurs)
//   TON_MUTTER      nervous mutters when the night presses in
//   PAX_REACT       human / ghost reactions (per-passenger overrides in PAX_REACT_BY)
//   RESPAWN_WHISPER the radio after he comes back
const Y = (th, en, x = {}) => ({ who: 'player', th, en, ...x });
const P = (th, en, x = {}) => ({ who: 'passenger', th, en, ...x });

export const TON_REACT = {
  hardBrake: [Y('เฮ้ย!', 'Whoa!', { tone: 'shout' }), Y('ชิบหายแล้ว…', 'Holy shit…'), Y('เกือบไปแล้ว…', 'That was close…')],
  swerve: [Y('ไอ้เหี้ย!', 'Fuck!', { tone: 'shout' }), Y('อะไรวะนั่น', 'What the hell was that')],
  nearCrash: [Y('ตายห่าแล้ว!', 'Oh, hell!', { tone: 'shout' }), Y('ใจเย็น ๆ… ใจเย็น', 'Easy… easy now')],
  nearFall: [Y('เกือบลงข้างทางแล้ว…', 'Nearly went off the road…'), Y('มือสั่นไปหมดแล้วเนี่ย', 'My hands are shaking')],
};
export const TON_MUTTER = [
  Y('ใจเย็น ๆ ต้น… ขับไปเรื่อย ๆ', 'Calm down, Ton… just keep driving', { tone: 'whisper' }),
  Y('อย่ามองข้างหลัง… อย่ามอง', 'Don’t look back… don’t', { tone: 'whisper' }),
  Y('ถนนเส้นนี้มันยาวกว่าเมื่อกี้หรือเปล่า', 'Is this road longer than before?', { tone: 'whisper' }),
  Y('อีกนิดเดียว… อีกนิดเดียว', 'Nearly there… nearly', { tone: 'whisper' }),
];
export const PAX_REACT = {
  human: [P('โอ๊ย! ขับดี ๆ หน่อยสิ', 'Ow! Drive properly!', { tone: 'shout' }), P('ใจหายหมดเลย', 'My heart nearly stopped'), P('ช้า ๆ ก็ได้นะ', 'Slow down a bit, would you')],
  ghost: [P('…ช้า ๆ ก็ได้ ยังไงก็ไปถึง', '…No need to rush. We’ll get there anyway.', { tone: 'whisper' }), P('…', '…'), P('ครั้งที่แล้วก็แบบนี้', 'It was like this last time too', { tone: 'whisper' })],
};
export const PAX_REACT_BY = {
  sri: [P('ตายแล้ว! พ่อหนุ่ม ป้าใจจะวาย', 'Good grief! Young man, my heart!', { tone: 'shout' }), P('ตะกร้าป้าหกหมดแล้ว', 'My basket’s spilt everywhere')],
  piak: [P('เฮ้ย! ลุงยังไม่อยากตายนะเว้ย', 'Hey! I don’t want to die yet!', { tone: 'shout' })],
  bua: [P('ค่อย ๆ หน่อยลูก ยายกระดูกไม่ดี', 'Gently, dear. My old bones')],
  monk: [P('สติ โยม สติ', 'Mindfulness. Mindfulness.')],
};
export const RESPAWN_WHISPER = [{ who: 'radio', th: 'ต้น… เมื่อกี้เจ็บไหม', en: 'Ton… did that hurt?', tone: 'whisper' }, { who: 'radio', th: 'ครั้งหน้า… ไม่ต้องกลับมาก็ได้', en: 'Next time… you needn’t come back.', tone: 'whisper' }];
