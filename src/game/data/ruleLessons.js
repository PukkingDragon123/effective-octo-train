// Ah Kong teaches each rule on its own, the moment it is given: the rule aloud, a short reason.
// (r3 in person at the garage; the rest over the old taxi CB at the start of each ride.)
const K = (th, en, x = {}) => ({ who: 'ahKong', th, en, ...x });

export const RULE_LESSONS = {
  r3: [K('ข้อแรก จำไว้ให้ขึ้นใจ ได้ยินอะไรจากเบาะหลังก็ตาม อย่าหันไปมอง', 'The first one, learn it by heart: whatever you hear from the back seat, don’t turn round.'), K('อยากรู้ก็ดูกระจก ห้ามหัน คนข้างหลังบางคนไม่อยากให้ใครเห็นหน้า', 'If you must know, use the mirror. Some back there don’t want their faces seen.')],
  r2: [K('ฟังนะ ทุกทางไปจบที่ศาลเจ้ามารวย ซ้ายสำหรับคนตาย ขวาสำหรับคนเป็น', 'Listen. Every road ends at the Ma Ruay shrine. Left for the dead, right for the living.'), K('ส่งผิดทางเมื่อไหร่ เขาไม่ได้ไปถึงที่ของเขา แล้วเขาจะกลับมาหาลื้อ', 'Send one the wrong way and they never get where they belong. And they come back for you.')],
  r1: [K('ใครโบกก็รับ คนหรือไม่ใช่คนก็รับ ห้ามขับผ่าน', 'Whoever waves, you stop. Living or not. Never drive past.'), K('คนที่ถูกทิ้งไว้ข้างทาง ถนนมันจะพับกลับมาหาเขา', 'Leave someone at the roadside and the road folds back to them.')],
  r4: [K('ถ้ามองในกระจกแล้วไม่เห็นเงาเขา อย่ามองหน้าเขาตรง ๆ', 'If they have no reflection in the mirror, don’t look them in the face.'), K('หน้าจริงของเขา ลื้อไม่อยากเห็นหรอก', 'You don’t want to see their real face.')],
  r5: [K('ได้ยินเคาะท้ายรถสามที ห้ามจอดเด็ดขาด', 'Three knocks on the boot: don’t you dare stop.'), K('ที่เคาะน่ะ ไม่ใช่คนที่อยากลง', 'Whatever knocks isn’t someone wanting to get out.')],
  r6: [K('ผู้โดยสารขอให้ปิดวิทยุ ปิดทันที อย่าถาม', 'A passenger asks for the radio off: off, at once. No questions.'), K('บางเพลงเขาฟังแล้วจำได้ว่าตัวเองตายยังไง', 'Some songs remind them how they died.')],
  r7: [K('มีเสียงเรียกชื่อลื้อจากข้างนอก อย่าขานรับ', 'A voice outside calls your name: don’t answer.'), K('ขานรับเมื่อไหร่ ก็เหมือนเปิดประตูให้เขา', 'Answer it and you’ve opened the door to it.')],
  r8: [K('ถ้ามีลมหายใจรดต้นคอ กำพระไว้ มองตรงไปข้างหน้า', 'Breath on the back of your neck: hold the amulet, eyes straight ahead.'), K('มันอยากเห็นหน้าลื้อ อย่าให้มันเห็น', 'It wants to see your face. Don’t let it.')],
  r9: [K('ไฟในรถดับเอง อย่าไปเปิดมันอีก', 'If the cabin light goes out by itself, don’t switch it back on.'), K('ความมืดในรถตอนนั้น ไม่ได้ว่างเปล่า', 'That dark in the car isn’t empty.')],
  r10: [K('ผ่านศาลข้างทาง บีบแตรสองที ขอทางเจ้าที่ ไหว้ด้วยก็ดี', 'Passing a roadside shrine: two honks to ask leave of the spirits. A wai too, if you can.'), K('เจ้าที่เขาดูแลถนน ไม่ขอทางก็เหมือนไม่ให้เกียรติ', 'They look after the road. Not asking is no respect.')],
  r11: [K('ถ้ามิเตอร์ขึ้นเลขสี่สี่สี่ จอดทันที ก้มหน้า นับในใจถึงสิบ ห้ามมองกระจก', 'If the meter shows four-four-four: stop, head down, count to ten. No mirrors.'), K('มันกำลังนับอยู่เหมือนกัน ลื้อต้องนับให้ทัน', 'It’s counting too. You have to keep up.')],
  r12: [K('มีคนยืนกลางถนนแต่ไม่โบก ห้ามเบรก ห้ามหักหลบ ขับทะลุไปเลย', 'Someone standing in the road, not waving: no brakes, no swerving. Drive straight through.'), K('ที่ยืนตรงนั้นไม่ใช่คน มันอยากให้ลื้อจอด', 'That isn’t a person. It wants you to stop.')],
  r13: [K('ถ้ามีเลือดหยดลงกระจกหน้า ห้ามปัดน้ำฝน ปล่อยให้มันไหลไป', 'If blood drips onto the windscreen, leave the wipers. Let it run.'), K('ข้างบนหลังคามันรอให้ลื้อปัดมันลงมา', 'What’s on the roof is waiting for you to wipe it down.')],
  r14: [K('หลังเที่ยงคืน ห้ามลดกระจกให้ใครทั้งนั้น', 'After midnight, don’t wind the window down for anyone.'), K('มือที่ยื่นเข้ามาตอนนั้น ไม่ได้มาจ่ายค่ารถ', 'Any hand that reaches in then isn’t paying a fare.')],
  r15: [K('ถ้าวิทยุเรียกชื่อลื้อ เปลี่ยนคลื่นทันที ห้ามปิด', 'If the radio says your name, change the station. Don’t switch it off.'), K('ปิดเมื่อไหร่ เสียงมันจะย้ายมาอยู่ข้างหูลื้อแทน', 'Switch it off and the voice moves next to your ear instead.')],
  r16: [K('นับคนในกระจกได้มากกว่าคนที่ขึ้นรถ อย่าทัก อย่าถาม อย่าจอด', 'If you count more people in the mirror than got in: don’t greet, don’t ask, don’t stop.'), K('คนเกินมานั่นแหละ อยากให้ลื้อทัก', 'The extra one wants you to speak to it.')],
};
