// Talking with a passenger while they ride (src/game/ride/Talk.js). Look at them (or, for the back
// seat, at them in the rear-view mirror) and press interact: Ton picks one of 2–3 questions he has
// not asked yet (or says nothing). Their answers carry clues: the living answer like the living;
// the dead get the small things wrong (they have not been hungry for years, their name is on a
// wet wrist tag, the place they come from is a broken guardrail).
// Some passengers question YOU first ("asks", once, early in the ride): your reply changes their
// trust (trust.<pid>.talkAsk, summed by logic.trustOf like every other reply).
// Line shapes: see SCHEMA.md (P passenger, Y Ton aloud, C reply moment, O option, SIL silence).
import { P, Y, C, O, SIL, tr } from './lines.js';

export const TALK_QUESTIONS = {
  where: Y('จะไปไหนครับ', 'Where are you headed?'),
  name: Y('ชื่ออะไรครับ', 'What’s your name?'),
  eaten: Y('กินข้าวมาหรือยังครับ', 'Have you eaten?'),
  from: Y('มาจากไหนครับ', 'Where are you coming from?'),
};
export const TALK_LABELS = {
  where: { th: 'จะไปไหน', en: 'Where to?' },
  name: { th: 'ชื่ออะไร', en: 'Your name?' },
  eaten: { th: 'กินข้าวยัง', en: 'Eaten yet?' },
  from: { th: 'มาจากไหน', en: 'Where from?' },
};

const ask = (pid, line, opts, branches, deltas) =>
  [line, C(opts, { id: `talkAsk.${pid}`, timeout: 10, branches, setOnPick: Object.fromEntries(Object.entries(deltas).map(([k, n]) => [k, tr(pid, 'talkAsk', n)])) })];

export const TALK = {
  sri: {
    where: [P('กลับบ้านห้วยทรายจ้ะ เอาของไปส่งที่ตลาดมา', 'Home to Huai Sai, dear. I took my goods to the market.')],
    name: [P('ป้าชื่อศรีจ้ะ ใคร ๆ ก็เรียกป้าศรี', 'Sri, dear. Everyone calls me Auntie Sri.')],
    eaten: [P('กินแล้วจ้ะ ข้าวเหนียวหมูปิ้งหน้าวัด หิวก็มีในตะกร้านะ', 'I have. Sticky rice and grilled pork by the temple. There’s some in my basket if you’re hungry.')],
    from: [P('ป้าเกิดที่นี่แหละ อยู่มาหกสิบปีแล้ว', 'Born right here. Sixty years now.')],
    asks: ask('sri', P('ว่าแต่พ่อหนุ่มเป็นคนขับจริง ๆ ใช่ไหม ป้าไม่เคยเห็นหน้าเลย', 'You are a real driver, aren’t you? I’ve never seen your face.'),
      [O('kong', 'ครับ รถของอากงครับ', 'Yes. It’s Ah Kong’s cab.'), O('first', 'เพิ่งขับคืนแรกครับ', 'It’s my first night.'), SIL()],
      {
        kong: [P('อ้อ อู่อากง ค่อยสบายใจหน่อย', 'Oh, Ah Kong’s garage. That’s a relief.', { emotion: 'smile' })],
        first: [P('คืนแรกเลยเหรอ ขับช้า ๆ นะ ถนนนี้ไม่เหมือนที่อื่น', 'Your first night? Drive slowly. This road isn’t like the others.')],
        silent: [P('ไม่พูดไม่จาเลยนะ…', 'Not much of a talker…')],
      }, { kong: 1, first: 1, silent: -1 }),
  },
  womanWhite: {
    where: [P('โรงพยาบาลค่ะ… หนูต้องกลับไปห้องเดิม', 'The hospital… I have to go back to the same room.')],
    name: [P('หนูจำไม่ได้แล้วค่ะ ที่ข้อมือมีป้ายชื่อ แต่มันเปียก', 'I don’t remember. There’s a name tag on my wrist, but it’s wet.', { tone: 'whisper' })],
    eaten: [P('หนูไม่หิวมานานแล้วค่ะ', 'I haven’t been hungry for a long time.')],
    from: [P('จากโค้งข้างหลังค่ะ ตรงที่ราวกันตกหักน่ะ', 'From the curve back there. Where the guardrail is broken.')],
  },
  piak: {
    where: [P('ห้วยทราย บ้านเมียเก่า จะไปง้อเขาหน่อย', 'Huai Sai. My ex-wife’s place. Going to win her back.')],
    name: [P('เปี๊ยก ลุงเปี๊ยก หน้าโหดแต่ใจดีนะเว้ย', 'Piak. Uncle Piak. Scary face, soft heart.', { emotion: 'smile' })],
    eaten: [P('กินเหล้าแทนข้าว ฮ่า ๆ อย่าไปบอกใครล่ะ', 'Had whisky for dinner, ha. Don’t tell anyone.', { emotion: 'smile' })],
    from: [P('ไปตกปลาที่อ่างมา ได้ตัวเดียว เน่าแล้วด้วย', 'Fishing at the reservoir. Caught one. It’s gone off already.')],
    asks: ask('piak', P('เดี๋ยว ๆ ลื้อเป็นคนใช่มั้ยเนี่ย มาขับแท็กซี่ในป่าดึกดื่นแบบนี้', 'Hang on, you’re human, right? Driving a forest taxi this late?'),
      [O('human', 'คนครับ ตัวเป็น ๆ', 'Human. Flesh and blood.'), O('joke', 'ไม่แน่ใจเหมือนกันครับ', 'Not so sure myself.'), SIL()],
      {
        human: [P('เออ ดี ลุงกลัวผีจะตายอยู่แล้ว', 'Good. I’m scared stiff of ghosts.')],
        joke: [P('อย่ามาล้อเล่นแบบนี้นะเว้ย!', 'Don’t you joke like that!', { tone: 'shout' })],
        silent: [P('…เงียบแบบนี้ลุงไม่ชอบเลย', '…I don’t like that kind of quiet.')],
      }, { human: 1, joke: -1, silent: -1 }),
  },
  boyM: {
    where: [P('บ้านครับ แม่รออยู่ แม่รอนานมากแล้ว', 'Home. Mum’s waiting. She’s been waiting a long time.')],
    name: [P('เอ็มครับ… แม่เรียกเอ็ม แต่ไม่มีใครเรียกแล้ว', 'M… Mum calls me M. Nobody does any more.')],
    eaten: [P('ผมกินขนมที่เขาวางไว้ให้ที่ศาลครับ', 'I eat the sweets they leave for me at the shrine.')],
    from: [P('โรงเรียนครับ ผมรอรถรับส่งตั้งแต่บ่าย', 'School. I’ve been waiting for the school van since the afternoon.')],
  },
  nuan: {
    where: [P('ท่าน้ำใต้ต้นกล้วยตานีจ้ะ ที่นั่นเย็นดี', 'The landing under the tani banana tree, dear. It’s cool there.')],
    name: [P('นวลจ้ะพ่อหนุ่ม แต่ก่อนเขาเรียกกันว่าแม่นวล', 'Nuan, young man. They used to call me Mae Nuan.')],
    eaten: [P('ข้าวต้มมัดที่เขาเอามาไหว้ อร่อยดีจ้ะ', 'The banana-leaf rice cakes they bring me. Very good, dear.')],
    from: [P('จากหมู่บ้านริมคลองจ้ะ ตอนนั้นคนยังเดินทางด้วยเกวียนกันอยู่เลย', 'From the village by the canal. Back when people still travelled by ox cart.')],
  },
  monk: {
    where: [P('อาตมาจะไปห้วยทราย พรุ่งนี้เช้าจะบิณฑบาตที่นั่น', 'I am going to Huai Sai. In the morning I will go on alms round there.')],
    name: [P('ชื่อไม่สำคัญหรอกโยม เรียกหลวงพี่ก็พอ', 'The name does not matter. Call me Luang Phi.')],
    eaten: [P('อาตมาฉันเพลไปตั้งแต่เที่ยงแล้วโยม', 'I took my meal at noon.')],
    from: [P('เดินธุดงค์มาจากทางเหนือ เกือบเดือนแล้ว', 'On thudong from the north. Nearly a month now.')],
  },
  saman: {
    where: [P('งานวัด! เขารอลุงขึ้นเวทีอยู่ ไปช้าไม่ได้', 'The temple fair! They’re waiting for me on stage. Can’t be late.', { emotion: 'smile' })],
    name: [P('สมาน เสียงทองไง! ไม่รู้จักเหรอ สมัยก่อนดังมากนะ', 'Saman the Golden Voice! You don’t know me? I was famous back then.', { emotion: 'smile' })],
    eaten: [P('ไม่หิวเลย ตั้งแต่คืนที่รถบัสวงพลิก… เอ้ย ช่างมันเถอะ', 'Not hungry at all. Not since the night the band bus rolled… ah, never mind.')],
    from: [P('จากเวทีที่แล้ว ปี… ปีไหนนะ', 'From the last show. In… what year was it?')],
  },
  bua: {
    where: [P('ตลาดเช้าห้วยทราย ไปขายพวงมาลัยจ้ะ', 'Huai Sai morning market. To sell my garlands.')],
    name: [P('บัวจ้ะ ยายบัว ขายมาลัยมาสามสิบปีแล้ว', 'Bua. Grandma Bua. Thirty years selling garlands.', { emotion: 'smile' })],
    eaten: [P('ข้าวต้มไปถ้วยนึงแล้วจ้ะ หลานล่ะกินหรือยัง', 'A bowl of rice porridge. And you, dear? Have you eaten?')],
    from: [P('ยายอยู่ท้ายหมู่บ้าน ตื่นมาร้อยมาลัยตั้งแต่ตีสอง', 'I live at the end of the village. Up stringing garlands since two.')],
    asks: ask('bua', P('รถคันนี้… ทำไมมิเตอร์มันเป็นแบบนั้นล่ะลูก', 'This car… why is the meter like that, dear?'),
      [O('old', 'รถมันเก่าครับยาย', 'It’s an old car, Grandma.'), O('dunno', 'ผมก็ไม่รู้ครับ', 'I don’t know either.'), SIL()],
      {
        old: [P('อืม… เหมือนรถไอ้ชายเลย', 'Hm… just like Chai’s car.')],
        dunno: [P('ไม่รู้ก็ดีแล้ว อย่ารู้เลย', 'Better not to know.')],
        silent: [P('ไม่อยากตอบก็ไม่เป็นไรจ้ะ', 'If you don’t want to say, that’s all right.')],
      }, { old: 1, dunno: 1, silent: -1 }),
  },
  somchai: {
    where: [P('บ้าน… บ้านที่ลูกชายผมจะกลับมา', 'Home… the house my son is coming back to.')],
    name: [P('…สมชาย คนแถวนี้เรียกไอ้ชาย', '…Somchai. People round here call me Chai.')],
    eaten: [P('ผมรอกินข้าวพร้อมลูกครับ รอทุกเช้า', 'I wait to eat with my son. Every morning.')],
    from: [P('จากอู่อากง… ผมเคยขับคันนี้ทุกคืน', 'From Ah Kong’s garage… I used to drive this car every night.')],
    asks: ask('somchai', P('ใครให้คุณมาขับคันนี้ครับ', 'Who let you drive this car?'),
      [O('kong', 'อากงให้มาครับ', 'Ah Kong did.'), O('dad', 'เป็นรถของพ่อผมครับ', 'It was my father’s.'), SIL()],
      {
        kong: [P('อากง… ยังอยู่ดีสินะ', 'Ah Kong… still going, then.')],
        dad: [P('…อย่างนั้นเหรอ ดูแลมันดี ๆ นะ', '…Is that so. Take good care of it.')],
        silent: [P('…', '…')],
      }, { kong: 1, dad: 2, silent: 0 }),
  },
};
