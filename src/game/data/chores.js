// First-night chores and rituals at the KM 9 garage ("for safety"), voiced through the dialogue
// system (Line shape as in SCHEMA.md: { who, th, en, tone?, emotion? }). Ah Kong will not hand over
// the keys until the shrine, the offering by the gate and the cloth on the mirror are done. On
// restart nights he asks only for the shrine prayer.
//
//   CHORES_INTRO        after he arrives, before the keys (first night)
//   CHORES_RESTART      restart nights: the shrine only
//   CHORE_HINT[id]      when you talk to him with that chore still to do
//   CHORE_DONE[id]      once it is done (shrineWrong: a step was skipped, the smoke leans the wrong way)
//   CHORES_KEYS         the three required ones are done: the keys scene resumes
//   CHORES_GRUMBLE      3 minutes on, he does the rest himself
//   SHRINE_PRAYER       Ton's murmured prayer during the wai
//   COIN_COUNT          the count (one more coin than he counted)
//   PHONE_CALL          answering the phone while Ah Kong is away (a whisper says Ton's name)
//   Flags (night): chore.shrine ('done'|'wrong'), chore.offering, chore.cloth, chore.coins,
//   phoneAnswered, phoneIgnored. Kept across loops: k.phoneAnswered, k.extraCoins, k.shrineWrong.
const K = (th, en, x = {}) => ({ who: 'ahKong', th, en, ...x });
const T = (th, en, x = {}) => ({ who: 'player', th, en, ...x });
const TT = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });

export const CHORE_IDS = ['shrine', 'offering', 'cloth', 'coins'];
export const REQUIRED_CHORES = ['shrine', 'offering', 'cloth'];
export const CHORE_SKIP_SECONDS = 180;

export const CHORES_INTRO = [
  K('เดี๋ยวก่อน กุญแจยังไม่ให้', 'Not yet. No keys yet.'),
  K('ขับรถเส้นนี้ตอนกลางคืน ต้องทำของพวกนี้ให้ครบก่อน กันไว้ก่อน', 'You drive this road at night, you do these first. To be safe.'),
  K('อย่างแรก ไปไหว้ศาลพระภูมิหน้าอู่ จุดธูปสามดอก ไหว้ให้ดี แล้วค่อยปัก ห้ามข้ามขั้นตอน', 'First, the spirit house out front. Light three sticks, wai properly, then plant them. Skip nothing.'),
  K('แล้วเอาน้ำแดงกับข้าวไปวางไว้ที่ประตู ให้คนที่มาตอนเที่ยงคืน', 'Then put the red soda and the rice by the gate. For the one who comes at midnight.'),
  K('ผ้าสามสีบนโต๊ะ เอาไปผูกที่กระจกมองหลังในรถ', 'The three-colour cloth on the table. Tie it on the taxi’s mirror.'),
  K('เหรียญในกระป๋องค่าโดยสาร นับให้อากงด้วย', 'And count the coins in the fare tin for me.'),
];

export const CHORES_RESTART = [
  K('ก่อนเอากุญแจ ไปไหว้ศาลพระภูมิก่อน', 'Before the keys, go and pray at the spirit house.'),
  K('ธูปสามดอก จุด ไหว้ แล้วปัก เหมือนเดิม', 'Three sticks. Light, wai, plant. Same as always.'),
];

export const CHORE_HINT = {
  shrine: [K('ศาลพระภูมิก่อน อย่างอื่นค่อยว่ากัน', 'The spirit house first. The rest can wait.')],
  offering: [K('น้ำแดงกับข้าว อยู่บนโต๊ะช่าง เอาไปวางที่ประตู', 'The soda and the rice are on the workbench. By the gate.')],
  cloth: [K('ผ้าสามสี ผูกที่กระจกในรถ', 'The cloth. On the mirror in the taxi.')],
  coins: [K('กระป๋องเหรียญอยู่บนโต๊ะ นับซะ', 'The coin tin is on the table. Count it.')],
};

export const CHORE_DONE = {
  shrine: [K('ดี ควันลอยขึ้นตรง ๆ เจ้าที่รับแล้ว', 'Good. The smoke goes straight up. They accepted it.')],
  shrineWrong: [K('โง่เป็นควาย! ควันมันลอยเข้าอู่… ข้ามขั้นใช่มั้ย', 'Thick as a buffalo! The smoke’s drifting into the garage… you skipped a step, didn’t you.', { emotion: 'anger' }), K('ช่างมัน คืนนี้ระวังตัวไว้ก็แล้วกัน', 'Never mind. Just watch yourself tonight.')],
  offering: [K('วางไว้อย่างนั้นแหละ อย่าไปแตะอีก', 'Leave it like that. Don’t touch it again.')],
  cloth: [K('ผูกแน่น ๆ นะ หลุดเมื่อไหร่ให้รีบจอด', 'Tie it tight. If it ever comes loose, pull over.')],
  coins: [K('เกินมาเหรียญนึงทุกคืนแหละ', 'There’s always one too many.'), K('เหรียญนั้นอย่าเอาไปใช้ เก็บไว้ในกระป๋อง มันไม่ใช่ของเรา', 'Don’t spend that one. Keep it in the tin. It isn’t ours.')],
};

export const CHORES_KEYS = [K('เออ ครบแล้ว มานี่', 'Right, that’s done. Come here.')];

export const CHORES_GRUMBLE = [
  K('ช้าจริงเลยเรา… เดี๋ยวอากงทำเอง', 'So slow, you… I’ll do it myself.', { emotion: 'anger' }),
  K('สมัยอากงหนุ่ม ๆ ไม่ต้องให้ใครบอกสองรอบหรอก', 'In my day nobody had to be told twice.'),
];

export const SHRINE_PRAYER = [T('เจ้าที่เจ้าทาง ลูกช้างขออนุญาตนะครับ ช่วยคุ้มครองลูกช้างด้วย', 'Spirits of this place, with your leave. Please keep me safe.', { tone: 'whisper' })];

export const COIN_COUNT = {
  counted: [TT('…สิบเอ็ด สิบสอง ครบ', '…eleven, twelve. That’s all.')],
  extra: [TT('สิบ… สาม?', 'Thir… teen?')],
};

export const PHONE_CALL = {
  hello: [T('ฮัลโหล… อากงเหรอครับ', 'Hello… Ah Kong, is that you?')],
  whisper: [{ who: 'voice', th: 'ต้น…', en: 'Ton…', tone: 'whisper' }],
  after: [TT('…วางไปแล้ว', '…they hung up.')],
};
