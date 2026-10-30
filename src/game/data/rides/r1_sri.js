// Ride 1 — 21:00 — ป้าศรี Auntie Sri (HUMAN → RIGHT). Schema: ../SCHEMA.md "Passenger".
// Dread phase. She teaches the clue language without knowing it (breath fog on the glass,
// the car sinks when she sits, her reflection, coins) and tells the legend of ยายสปีด.
// Rule r12 (back of the paper): someone stands in the road — and SHE screams at you to brake.
// Replies: newFace, yaiSpeed, garland, driver, roadFigure (+ loop/death-aware extras).
import { P, C, O, SIL, tr } from '../lines.js';

export const RIDE_SRI = {
  id: 'sri',
  order: 1,
  hour: 21,
  pickup: 'sala1',
  characterId: 'sri',
  identity: 'human',
  fork: 'right',
  seat: 'rearLeft',
  destination: { th: 'บ้านห้วยทราย', en: 'Huai Sai Village' },
  clues: {
    reflection: 'normal', shadow: true, breathFog: true, weightKg: 74, meter: 'normal',
    radioStatic: 0, blinks: true, feetFloat: false,
    payment: { type: 'coins', amountTHB: 85, note: { th: 'เหรียญสิบกับเหรียญห้า อุ่น ๆ จากมือ', en: 'Tens and fives, still warm from her hand.' } },
    smell: 'jasmine-fresh',
  },
  specialRules: [
    { rule: 'r1', note: 'First pickup; the tutorial already stopped you here.' },
    { rule: 'r12', at: 0.76, note: 'A figure stands in the lane, not hailing. Sri screams "brake!" — the rule says drive through.' },
    { rule: 'r10', note: 'She asks you to honk at the shrine approach; reward line on honkShrine.' },
    { rule: 'r3', lookBack: 'warn', note: 'Human passenger: looking back only earns a scolding.' },
  ],
  encounters: [
    { id: 'treeWatcher', at: 0.39 },
    { id: 'salaShadows', at: 0.6, optional: true }, // passing sala2
    { id: 'roadFigure', at: 0.76 },
  ],
  deathOnWrong: 'giantHand',
  memoryHooks: [],
  // Long first ride (sala1 → fork ≈ 2.8 km): no stretching needed. See SCHEMA.md "Pacing".
  pacing: { cruiseKmh: 45, minSeconds: 150, stretch: 'none' },
  dialogue: {
    hail: [P('แท็กซี่! แท็กซี่จ้ะ! จอดก่อน!', 'Taxi! Taxi, dear! Stop!', { tone: 'shout', action: 'hail' })],
    greet: [
      P('โอ๊ย ขอบใจนะหนุ่ม นึกว่าจะไม่มีรถผ่านแล้ว', 'Oh, thank you, dear. I thought no car would ever come.', { emotion: 'smile', action: 'enterCar' }),
      P('ยืนรอตั้งชั่วโมง ยุงกัดจนพรุนไปหมด', 'Stood there an hour. Mosquitoes ate me alive.', { pause: 0.4 }),
    ],
    destination: [
      P('ไปบ้านห้วยทรายจ้ะ เลยศาลเจ้าไปทางขวานะ', 'Huai Sai Village, dear. Past the shrine, keep right.'),
      P('กดมิเตอร์ด้วยนะ ป้าไม่เอาเหมา', 'Turn the meter on, okay? No flat fares for me.', { emotion: 'smile' }),
      // Died with her before (the giant hand on the left road): Ton can promise "right" this time.
      C([O('right', 'ขวาครับ คราวนี้ขวาแน่', 'Right. This time, definitely right.'), SIL()], {
        id: 'sri_right',
        if: { diedOn: 'sri' },
        timeout: 6,
        branches: {
          right: [
            P('คราวนี้? พูดอะไรของหนุ่ม', 'This time? What are you on about?', { emotion: 'surprise' }),
            P('ขนลุกเลย...', 'Gave me goosebumps...', { tone: 'whisper' }),
          ],
        },
      }),
    ],
    // The night repeats; so does she. Highest key <= saves.data.loops replaces the block.
    loopVariants: {
      greet: {
        1: [
          P('โอ๊ย ขอบใจนะหนุ่ม นึกว่าจะไม่มีรถผ่านแล้ว', 'Oh, thank you, dear. I thought no car would ever come.', { emotion: 'smile', action: 'enterCar' }),
          P('เอ๊ะ... เราเคยเจอกันที่ไหนนะ', 'Hm... have we met somewhere?', { emotion: 'surprise' }),
          P('หน้าคุ้น ๆ... ช่างเถอะ ป้าขี้ลืม', 'Familiar face... never mind, I forget things.'),
        ],
        3: [
          P('ขอบใจนะหนุ่ม...', 'Thank you, dear...', { action: 'enterCar' }),
          P('แปลกจัง ป้ารู้สึกเหมือนนั่งคันนี้มาหลายรอบแล้ว', "Funny. Feels like I've ridden in this cab many times.", { emotion: 'fear' }),
          P('เมื่อคืนป้าฝันว่ารถเลี้ยวซ้าย... แล้วมีมือโผล่มาจากหมอก', 'Last night I dreamt the car turned left... and a hand came out of the fog.', { tone: 'whisper', emotion: 'fear', if: { diedOn: 'sri' } }),
        ],
      },
    },
    beats: [
      {
        id: 'meterNag',
        trigger: { type: 'event', event: 'meterOffTooLong' },
        lines: [P('หนุ่ม มิเตอร์ล่ะ ลืมกดหรือเปล่า', 'Dear, the meter? Did you forget?')],
      },
      {
        id: 'newFace',
        trigger: { type: 'progress', at: 0.13 },
        lines: [
          P('หนุ่มเพิ่งมาขับแถวนี้ใช่ไหม หน้าไม่คุ้นเลย', "You're new round here, aren't you? Don't know your face."),
          C([
            O('first', 'ครับ คืนแรก', 'Yeah. First night.', { if: { loopsLt: 1 } }),
            O('again', 'คืนแรก... มั้งครับ', 'First night... I think.', { if: { loopsGte: 1 } }),
            O('home', 'ผมโตแถวนี้ครับ', 'I grew up round here.'),
            SIL(),
          ], {
            id: 'sri_newFace',
            timeout: 7,
            setOnPick: { home: tr('sri', 'home') },
            branches: {
              first: [P('ตายแล้ว คืนแรกก็โดนเส้นนี้เลยเหรอ', 'Oh dear. First night and they gave you this road?', { emotion: 'fear' })],
              again: [
                P('มั้ง? คืนแรกก็คืนแรกสิหนุ่ม', "'Think'? Either it's your first night or it isn't.", { emotion: 'surprise' }),
                P('...หน้าซีดเชียว', "...you've gone pale."),
              ],
              home: [
                P('อ้าว ลูกหลานแถวนี้เอง', 'Oh! A local boy.', { emotion: 'smile' }),
                P('กลับมาเยี่ยมบ้านล่ะสิ ดีจัง', "Come home to visit, eh? That's lovely."),
              ],
              silent: [P('พูดน้อยจัง... งั้นป้าพูดเอง', "Not much of a talker... then I'll do the talking.", { emotion: 'smile' })],
            },
          }),
        ],
      },
      {
        id: 'yaiSpeedLegend',
        essential: true, // the legend must be heard before ride 3's Yai Speed encounter
        trigger: { type: 'progress', at: 0.22 },
        lines: [
          P('รู้จักยายสปีดไหม', 'Ever heard of Yai Speed?'),
          C([
            O('yes', 'เคยได้ยินครับ', "I've heard of her."),
            O('who', 'ยายสปีดไหนครับ', 'Yai Speed who?'),
            SIL(),
          ], {
            id: 'sri_yaiSpeed',
            timeout: 6,
            setOnPick: { who: tr('sri', 'legend') }, // she loves telling it
            branches: {
              yes: [P('ได้ยินแค่ชื่อไม่พอหรอก ฟังป้าให้ดี', "Hearing the name isn't enough. Listen.")],
              who: [P('ตายแล้ว ไม่รู้จักยายสปีด! ฟังนะ', "Good grief, you don't know Yai Speed! Listen.", { emotion: 'surprise' })],
            },
          }),
          P('ผียายแก่ ๆ วิ่งตามรถตอนกลางคืน', 'An old granny ghost. Chases cars at night.', { tone: 'whisper' }),
          P('ขับเร็วแค่ไหนแกก็วิ่งทัน ขาแกไม่เหมือนขาคน', "However fast you go, she keeps up. Her legs aren't human legs."),
          P('ถ้าเจอนะ ผ่อนคันเร่ง ปล่อยให้แกแซงไป', 'If you see her, ease off. Let her pass.'),
          P('อย่าจ้องหน้าแก แล้วอย่าแข่งกับแกเด็ดขาด', "Don't stare at her face. And never, ever race her."),
          P('ไอ้ทิดแดงข้างบ้านไปแข่งกับแก... รถคว่ำเลย', 'Thit Daeng next door raced her once... flipped his truck.', { emotion: 'fear', pause: 0.6 }),
        ],
      },
      {
        id: 'treeWatcherReact',
        trigger: { type: 'event', event: 'encounter:treeWatcher' },
        lines: [
          P('หนุ่ม... เมื่อกี้เห็นอะไรในป่าไหม', 'Dear... did you see something in the trees just now?', { tone: 'whisper', emotion: 'fear' }),
          P('อย่าหันไปดูนะ ขับไปเรื่อย ๆ', "Don't look. Just keep driving.", { tone: 'whisper' }),
        ],
      },
      {
        id: 'garland',
        trigger: { type: 'progress', at: 0.44 },
        lines: [
          P('มาลัยพวกนี้ ป้าร้อยเองทั้งเย็นเลยนะ', 'I strung all these jasmine garlands myself. All evening.', { emotion: 'smile' }),
          P('แขวนหน้ารถสักพวงไหม ยี่สิบบาท', 'Hang one up front? Twenty baht.'),
          C([
            O('buy', 'เอาพวงนึงครับ', "I'll take one."),
            O('no', 'ไม่เป็นไรครับ', "I'm fine, thanks."),
            SIL(),
          ], {
            id: 'sri_garland',
            timeout: 7,
            // boughtJasmine: gameplay hangs a small jasmine garland on the mirror (the woman in white notices it)
            setOnPick: { buy: { boughtJasmine: true, ...tr('sri', 'garland') } },
            branches: {
              buy: [P('ขายดีจ้ะ! หักจากค่ารถเลยนะ', "Sold! I'll take it off the fare.", { emotion: 'smile', action: 'giveItem' })],
              no: [P('มีพระห้อยอยู่แล้วนี่ ก็ดี', "You've got an amulet up there already. That's good.")],
              silent: [P('เงียบแปลว่าไม่เอา... ป้าเข้าใจ', 'Silence means no... I get it.')],
            },
          }),
        ],
      },
      {
        id: 'greenYellowTaxi',
        trigger: { type: 'progress', at: 0.53 },
        lines: [
          P('เมื่อก่อนมีแท็กซี่เขียวเหลืองวิ่งเส้นนี้คันนึง', 'There used to be a green-yellow cab on this road.'),
          P('คนขับใจดีมาก ไม่เคยโกงมิเตอร์ป้าเลย', 'Lovely driver. Never once fiddled my fare.', { emotion: 'smile' }),
          P('แต่ได้ข่าวว่า... เอ้อ ช่างมันเถอะ', 'But I heard that... oh, never mind.', { emotion: 'sad' }),
          C([O('ask', 'ได้ข่าวว่าอะไรครับ', 'Heard what?'), SIL()], {
            id: 'sri_driver',
            timeout: 6,
            setOnPick: { ask: tr('sri', 'driver') },
            branches: {
              ask: [
                P('เขาตายตรงโค้งร้อยศพ หน้าฝนที่แล้ว', 'He died on Hundred Corpses Curve. Last rainy season.', { emotion: 'sad', tone: 'whisper' }),
                P('รถหน้าตาเหมือนคันนี้เลยนะหนุ่ม', 'His cab looked just like this one, dear.', { pause: 1.0 }),
              ],
            },
          }),
        ],
      },
      {
        id: 'foggedGlass',
        trigger: { type: 'progress', at: 0.66 },
        lines: [
          P('หนาวจัง กระจกฝ้าหมดแล้ว', "So cold. My window's all fogged up.", { action: 'reachOut' }),
          P('ลูกสาวป้าโทรตามอีกแล้ว ห่วงแม่จะแย่', "My daughter's calling again. Worried sick about her mum."),
        ],
      },
      {
        // r12: the temptation comes from a kind, frightened HUMAN.
        id: 'roadFigureBrake',
        trigger: { type: 'event', event: 'encounter:roadFigure' },
        lines: [
          P('หนุ่ม! คนยืนกลางถนน!', "Dear! Someone's in the road!", { tone: 'shout', emotion: 'fear', action: 'point' }),
          P('เบรกสิ! เบรก!', 'Brake! BRAKE!', { tone: 'shout', emotion: 'fear' }),
        ],
      },
      {
        id: 'roadFigureAfter',
        trigger: { type: 'event', event: 'encounterEnd:roadFigure' },
        lines: [
          P('ชน... ชนคนหรือเปล่า', 'Did... did we hit someone?', { emotion: 'fear' }),
          C([
            O('notHuman', 'นั่นไม่ใช่คนครับป้า', "That wasn't a person, Auntie."),
            O('noStop', 'ผมจอดไม่ได้ครับ', "I can't stop."),
            SIL(),
          ], {
            id: 'sri_roadFigure',
            timeout: 7,
            setOnPick: { notHuman: tr('sri', 'figure') },
            branches: {
              notHuman: [P('พุทโธ... พุทโธ...', 'Buddho... buddho...', { tone: 'whisper', action: 'pray' })],
              noStop: [
                P('ไม่ได้... ทำไมไม่ได้', "Can't... why can't you?", { emotion: 'fear' }),
                P('อย่าบอกป้านะ... ป้าไม่อยากรู้', "Don't tell me... I don't want to know.", { tone: 'whisper' }),
              ],
              silent: [P('ในกระจก... มันยังยืนอยู่ข้างหลัง', "In the mirror... it's still standing back there.", { tone: 'whisper', emotion: 'fear' })],
            },
          }),
        ],
      },
      {
        id: 'honkAsk',
        trigger: { type: 'event', event: 'forkApproach' },
        lines: [P('ใกล้ศาลแล้ว บีบแตรขอทางเจ้าที่ด้วยนะหนุ่ม', 'Nearly at the shrine. Honk to ask the spirits for passage, dear.')],
      },
      {
        id: 'honkThanks',
        trigger: { type: 'event', event: 'honkShrine' },
        lines: [P('ดีมาก เด็กดี เจ้าที่ท่านเอ็นดูแน่', 'Good boy. The spirits will take a liking to you.', { emotion: 'smile' })],
      },
      {
        id: 'radioOn',
        trigger: { type: 'event', event: 'radioOn' },
        lines: [P('เออ ดี มีเสียงเพลงค่อยหายกลัวหน่อย', 'Oh good. A bit of music helps with the fear.')],
      },
      {
        id: 'lightOn',
        trigger: { type: 'event', event: 'cabinLightOn' },
        lines: [P('เปิดไฟทำไมหนุ่ม ป้ายังไม่ได้แต่งหน้าเลย', "Why the light, dear? I haven't done my face!", { emotion: 'smile', action: 'laugh' })],
      },
      {
        id: 'speeding',
        trigger: { type: 'event', event: 'speeding' },
        lines: [P('ช้า ๆ หน่อยหนุ่ม ป้ายังไม่อยากเจอยายสปีด', "Slow down, dear. I'm not ready to meet Yai Speed.", { emotion: 'fear' })],
      },
    ],
    arriveCorrect: [
      P('ถึงแล้ว ๆ ขอบใจมากนะหนุ่ม', 'Here we are. Thank you so much, dear.', { emotion: 'smile', action: 'pay' }),
      P('นี่ร้อยนึง ไม่ต้องทอนนะ', "Here's a hundred. Keep the change.", { if: { trustGte: { sri: 2 } } }),
      P('นี่จ้ะ แปดสิบห้า', 'Here, eighty-five.', { if: { trustLt: { sri: 2 } } }),
      P('ขับดี ๆ ล่ะ อย่าลืมบีบแตรผ่านศาลนะลูก', "Drive safe now. Don't forget to honk at the shrines, love."),
    ],
    arriveWrong: [
      P('หนุ่ม... นี่มันทางซ้ายนะ', 'Dear... this is the left road.', { emotion: 'fear' }),
      P('ทางนี้มันทางคนตาย! กลับรถเดี๋ยวนี้!', 'This is the road of the dead! Turn round, now!', { tone: 'shout', emotion: 'fear' }),
      P('ทำไมหมอกมันหนาขึ้น... มีอะไรอยู่ในหมอก', "Why's the fog getting thicker... something's in there.", { tone: 'whisper', emotion: 'fear' }),
    ],
    idle: [
      P('ถนนเส้นนี้ ไฟทางเสียมาเป็นปีแล้ว', 'The streetlights on this road have been broken a year.'),
      P('ได้ยินตุ๊กแกร้องไหม ป้านับได้เจ็ดทีแล้ว', 'Hear the gecko? I counted seven calls.'),
      P('เมื่อกี้ได้ยินเสียงอะไรไหม... หรือป้าหูฝาด', 'Did you hear that? Or am I hearing things?', { emotion: 'fear' }),
      P('มะลิหอมไหม ป้าเด็ดเองกับมือเลยนะ', 'Smell the jasmine? Picked it with my own hands.'),
    ],
    onLookBack: [P('หันมาทำไม! มองถนนสิหนุ่ม!', 'Why are you turning round? Eyes on the road!', { tone: 'shout', emotion: 'anger' })],
    onFaceGaze: [P('มองหน้าป้าทำไม มีอะไรติดหน้าเหรอ', 'Why are you staring? Something on my face?', { emotion: 'surprise' })],
  },
};
