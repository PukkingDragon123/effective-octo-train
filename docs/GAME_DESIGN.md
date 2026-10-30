# DON'T LOOK BACK IN HORROR — Game Design Bible

*A Thai supernatural psychological horror game. Made by Pukking Dragon.*

First-person, almost UI-less. You drive an old green-and-yellow Thai taxi through a
dense tropical forest on the night shift, 21:00 → 06:00, trapped in a loop. You pick
up passengers who may be human or ghost, and you must deliver each one to the fork at
**ศาลเจ้ามารวย (Ma Ruay Shrine)**: **LEFT is for ghosts, RIGHT is for humans**. The
night starts out terrifying. Hour by hour it turns strange, then funny and nostalgic,
and by sunrise it is peaceful and emotional.

---

## 0. Owner's standing directions

* **The game is 100 % Thai** (`settings.language = 'th'` by default) with **almost zero
  text**. Information comes through the world, voices, sound and the rules paper.
  English exists only as an optional helper (`language = 'both'`).
* **One typeface for everything: Srisakdi.**
* **Dialogue is interactive:** Ton replies through short Thai choices (with timeouts, and
  silence is a valid answer). Replies change what passengers say, reveal clues, can break
  rules (r7, r16), and decide the endings.
* **Several endings** (see §1 and `src/game/data/endings.js`).
* **Death = being stuck in the loop:** you wake again at 21:00 at the garage with déjà vu.
  Ah Kong, the passengers and the taxi (a tally of scratches on the dash) remember a
  little more each time.
* Super sharp, detailed, handmade visuals; never lazy primitive models (§9).

## 1. Premise and story

**You are ต้น (Ton), 27.** You left your hill-country hometown for Bangkok years ago
after a fight with your father, **สมชาย (Somchai)**, an owner-driver of a green-yellow
taxi. He died on this forest road last rainy season. You didn't come home for the
funeral. Tonight a text arrives from an unknown number: *"รับคนขับกะดึก ติดต่ออากงที่อู่ กม.9"*
(*"Night-shift driver wanted. See Ah Kong at the KM 9 garage."*). Broke and restless,
you ride your old motorbike into the forest.

**อากง (Ah Kong)** is an elderly Thai-Chinese man smoking beside a worn-out taxi in a
tiny garage lit by one flickering fluorescent tube. He gives you the keys and a folded,
handwritten list of rules. The taxi is your father's. You find out slowly: his
photo of you as a child is tucked in the sun visor, a faded cartoon sticker you stuck
on the dashboard at age seven is still there, and your mother's amulet hangs from the
mirror.

**The loop.** The night repeats from 21:00. Dying (or breaking a rule badly) sends you
back to the garage at 21:00. What you learned is kept. Ah Kong remembers too:
*"อีกรอบแล้วสินะ"* ("Again, huh?").

**The reveal (final ride, ~05:30).** Under the last streetlight a middle-aged taxi
driver in a faded shirt waits in the mist. It is your father, a ghost. He doesn't say
he recognises you, but he talks about his son in Bangkok, about washing this taxi every
morning in case the boy came home, about the cartoon sticker. He asks to go "home". The
loop is his unfinished business, and yours. Ah Kong is the guardian spirit of Ma Ruay
Shrine. In the final shot the shrine's deity statue has his face, with smoke curling
from its incense like his cigarette. He bent the night so a father and son could
share one last ride.

**Final rule test.** Somchai is a ghost, so LEFT. At the mist gate he steps out and
says from behind you: *"ไม่ต้องหันมานะลูก ... ขับไปเถอะ"* ("Don't turn around, son ...
just drive"). His voice calls your name from the back seat. Rule 3 says never look
back.

### Endings
Seven endings, decided by Ton's replies, the memories and the loop. The exact conditions and
priority order live in `src/game/data/endings.js` and `src/game/data/SCHEMA.md` (source of truth):
`wrong_home` บ้าน (sad), `endless` กะดึกนิรันดร์ (bad), `join_father` ตามพ่อไป (dark),
`forgive` ขอโทษครับพ่อ (true), `successor` รับกะ (hopeful), `dawn` รุ่งสาง (good), `ride_away`
ทางออก (bittersweet). After the mist gate the empty taxi reaches the shrine fork one last time,
and Ah Kong on the radio asks "ลื้อจะกลับบ้านทางไหน" (which road home?).

---|---|---|
| `dawn` | **รุ่งสาง — Dawn** (good) | Deliver Somchai LEFT and do **not** look back when he calls. You drive right into the sunrise. Monks are collecting alms; you stop, offer rice, and pour water for merit (กรวดน้ำ) for your father. The radio plays his favourite old song. Credits. |
| `endless` | **กะดึกนิรันดร์ — The Endless Shift** (bad) | You look back at the final moment. He smiles sadly and fades. Cut to: you, older, smoking at the garage as a young stranger rides up on a motorbike. You are the new Ah Kong. |
| `forgive` | **ขอโทษครับพ่อ — Forgiveness** (true) | Collect all 7 memories across loops, then deliver Somchai correctly. A choice appears at the mist gate: say *"ขอโทษครับพ่อ"* ("I'm sorry, Dad"). Somchai answers, the mist turns gold, and he says goodbye properly. Then the Dawn ending plays, with a final scene of Ah Kong's statue smiling. |
| `wrong_home` | **บ้าน — Home** (sad) | Deliver Somchai RIGHT (human road). He realises where he is; the taxi stops at your childhood house, now empty; he fades on the porch; the night loops. Counts as a death. |

---

## 2. Rules (the old man's handwritten paper)

Rules are **consistent**, but there are designed exceptions the player has to notice.
The paper is a physical prop (Tab/J or Y to raise it). Over the loops the player's own
pencil notes appear on it (persistent knowledge).

| id | Thai | English | Mechanic |
|---|---|---|---|
| `r1` | รับผู้โดยสารทุกคนที่โบกเรียก ไม่ว่าจะเป็นคนหรือไม่ใช่คน | Pick up everyone who hails you, human or not. | Driving past a hailing passenger makes the loop fold: the road brings you back to them. |
| `r2` | ทุกเส้นทางไปจบที่ศาลเจ้ามารวย ซ้ายสำหรับคนตาย ขวาสำหรับคนเป็น | Every road ends at Ma Ruay Shrine. Left for the dead, right for the living. | The core decision. |
| `r3` | ไม่ว่าจะได้ยินอะไรจากเบาะหลัง อย่าหันไปมองเด็ดขาด | Whatever you hear from the back seat, never turn around to look. | "Looking back" = camera yaw past ~115° toward the rear seats, or holding a direct view of the rear seat for more than 0.6 s *during a back-seat event*. Mirrors are allowed. |
| `r4` | ถ้าผู้โดยสารไม่มีเงาในกระจก ห้ามมองหน้าเขาตรง ๆ | If a passenger has no reflection in the mirror, never look at their face directly. | A face-gaze timer builds while you look straight at a reflection-less passenger (about 1.2 s): first a warning (whisper, cold), then the true form attacks. |
| `r5` | ถ้าได้ยินเสียงเคาะท้ายรถสามครั้ง ห้ามจอดเด็ดขาด | If you hear three knocks from the trunk, do not stop. | After the 3rd knock, speed under 2 km/h for 1.5 s means death. |
| `r6` | ถ้าผู้โดยสารขอให้ปิดวิทยุ ให้ปิดทันที | If a passenger asks you to turn off the radio, turn it off at once. | 8 s grace, then escalation. |
| `r7` | ถ้ามีเสียงเรียกชื่อจากข้างนอก อย่าขานรับ | If a voice outside calls your name, do not answer. | A choice prompt appears ("ครับ?" / stay silent). Answering, or stopping and opening the window, means death. |
| `r8` | ถ้ามีลมหายใจรดต้นคอ ให้กำพระไว้ แล้วมองตรงไปข้างหน้า | If breath touches your neck, hold the amulet and keep your eyes forward. | Hold amulet + look forward until it passes. |
| `r9` | ถ้าไฟในรถดับเอง อย่าเปิดมันอีก | If the cabin light goes out by itself, don't switch it back on. | Turning it on during that event triggers a ceiling-crawl attack. |
| `r10` | ผ่านศาลให้บีบแตรสองครั้ง ขอทางเจ้าที่ | Honk twice when you pass a shrine, to ask the spirits for passage. | A real Thai custom. Optional, but each honk earns "respect", which shortens and softens some encounters. |

**Back of the paper (r11–r16)**: written in smudged **red ink in a different, shakier
hand**. It is Somchai's handwriting, left for whoever drives next, revealed late in the night.
Ah Kong only says *"ด้านหลังด้วยนะ อย่าลืมพลิกดู"* ("Turn it over too"). All are active
from the start. Each has a learned exception that is not written down:

| id | Thai | English | Mechanic | Exception |
|---|---|---|---|---|
| `r11` | ถ้ามิเตอร์ขึ้นเลข ๔๔๔ ให้จอดทันที ก้มหน้า แล้วนับในใจถึงสิบ ห้ามมองกระจกบานไหนทั้งนั้น | Meter shows 444: stop, bow your head, count to ten, look at no glass. | Stop within 8 s, then keep your eyes off every mirror and window for 10 s (looking down is safe) while something counts along outside. | With a monk aboard, the number means nothing. |
| `r12` | ถ้ามีคนยืนกลางถนนแต่ไม่โบกรถ ห้ามเบรก ห้ามหักหลบ ขับทะลุไปเลย | Someone stands in the road but doesn't hail: don't brake, don't swerve, drive through. | Slowing under 15 km/h within 25 m, or swerving off the asphalt, lets it reach you. Passing through gives a cold flash and fogged glass, and it now stands behind you in the mirror. | If it's an animal (the elephants), stop and wait. |
| `r13` | ถ้ามีเลือดหยดลงกระจกหน้า ห้ามปัดน้ำฝน ปล่อยให้มันไหลไป | Blood drips on the windshield: no wipers, let it run. | Wipers off within 3 s. Wiping smears it and shows what hangs from the roof; 3 s of wiping and it slides down onto the glass. | Uncle Saman spitting betel juice (น้ำหมาก) out of the window: only betel. |
| `r14` | หลังเที่ยงคืน ห้ามลดกระจกให้ใครทั้งนั้น | After midnight, never roll a window down for anyone. | Something knocks and asks for a lighter or help. Opening a window past 30 % while it waits means an arm reaches in. | If the monk asks (holy-water blessing), roll it down. |
| `r15` | ถ้าวิทยุเรียกชื่อแก ให้เปลี่ยนคลื่นทันที ห้ามปิด | The radio says your name: retune at once, never switch it off. | Retune within 5 s. Switching off means the voice carries on from the back seat (a rule-3 test). | Somchai's 03:00 song dedication "…to his son, ต้น": listen to the end (memory m_song). |
| `r16` | ถ้านับคนในกระจกได้มากกว่าคนที่ขึ้นรถ อย่าทัก อย่าถาม อย่าจอด | One more person in the mirror than got in: say nothing, ask nothing, don't stop. | An extra figure appears in the rearview mirror only. A dialogue choice tempts you to ask "who is that?"; asking or stopping means it answers. | — |

**Hidden line** (only legible when the paper gets wet in the rain or held near the cabin
light, from loop 2 on): *"กฎทุกข้อมีข้อยกเว้น ยกเว้นข้อสาม"*. ("Every rule has an
exception, except rule three.")

**Designed exceptions:**
* The schoolboy (ride 4) appears **only** in reflections. He has a reflection, but
  he is a ghost.
* The monk (ride 6) asks you to turn the radio **on** (a dhamma talk). Rule 6
  still holds because nobody asks for it off.
* The woman in white (ride 2) says "look at me". It's a trick; rule 4 applies.
* Father (ride 9) **asks** you to look back once ("หันมาให้พ่อเห็นหน้าหน่อย", "turn
  so I can see your face") early in the ride, and later tells you **not** to. Rule
  3 has no exceptions. Looking back early only costs a quiet sad line, not death,
  because he means no harm. Looking back at the gate gives the `endless` ending.

---

## 3. Identification: how to tell a ghost from a human

Every passenger shows **3+ clues** through different channels, so attentive players
can always decide correctly:

| channel | human | ghost |
|---|---|---|
| rearview / side mirror | normal reflection | none, delayed, wrong pose, or *only* a reflection |
| direct look | visible | visible, or not (reflection-only ghosts) |
| shadow under cabin light | casts a shadow | none (needs cabin light on, which some ghosts hate) |
| breath on window glass | fogs the glass near their face | no breath fog |
| taxi suspension | car sinks a bit as they sit | car doesn't move |
| meter | normal | glitches, runs backward, shows old dates |
| radio | normal | static rises near them |
| speech | present-day details | outdated details (closed hospital, old prices, dead relatives) |
| body | blinks, fidgets | no blinking, too still, head angle subtly off |
| payment | coins / modern notes | old banknotes, ghost money (กงเต๊ก), leaves |
| amulet | silent | warms; faint gold glow when held |

---

## 4. Passengers (ride order = night progression)

Each slot is about an hour. The game clock eases through the hour while you drive.

| # | hour | pickup (layout key) | passenger | identity | the ride |
|---|---|---|---|---|---|
| 1 | 21:00 | `sala1` | **ป้าศรี Auntie Sri**, 58, market vendor with a jasmine-garland basket | human | Chatty and nervous. She tells you the legend of ยายสปีด. **First window scare** (figure among trees, side window only). Shows the clue language: reflection, breath fog, suspension sinks, pays with coins. → RIGHT |
| 2 | 22:00 | `accidentCurve` | **ผู้หญิงชุดขาว Woman in white**, 20s, wet hair, white dress (see reference image 4) | ghost (no reflection) | Asks for "โรงพยาบาลประจำจังหวัด", which closed 20 years ago. Jasmine smell, glass fogs with cold, radio static. Says "มองหน้าฉันสิ" ("look at me"): a rule-4 trap. **Fingers curl around the door frame**; **her head appears upside down outside the windshield**. → LEFT. Wrong → true form (neck snaps sideways, crawls over the seat). |
| 3 | 23:00 | `noodleShop` | **ลุงเปี๊ยก Uncle Piak**, 60s, drunk, sings old luk thung | human (looks creepy: pale, staggers, mumbles) | Comic relief inside horror. **Three knocks from the trunk** (rule 5) during his ride; he's asleep and snoring. Yai Speed may appear. His breath fogs the window; reflection fine. → RIGHT |
| 4 | 00:00 | `busStop` | **น้องเอ็ม Boy "M"**, 9, school uniform, lunchbox | ghost (**reflection only**, ผีตายโหง, road accident) | The door opens by itself and nobody is visible; the meter starts; he sits in the mirror. He asks politely to turn off the radio (rule 6). He talks about his mum waiting with dinner. Sad. → LEFT. Wrong → the boy's reflection stays in the seat after he's gone; the road folds; drag-back death. |
| 5 | 01:00 | `bananaGrove` | **คุณนวล Khun Nuan**, a beautiful woman in a green sabai | ghost (นางตานี), no reflection, feet don't touch the ground (seen from the side window) | Surreal and calm. **Krasue** floats through the banana trees. She leaves a banana leaf on the seat. Rule 4 temptation. → LEFT |
| 6 | 02:00 | `forestTemple` | **หลวงพี่ Luang Phi (monk)**, 40s, wandering ธุดงค์ monk with an umbrella-tent (กลด) | human | Calm and funny ("อาตมาไม่มีตังค์นะโยม", "I have no money, layman"). Asks for the radio ON (dhamma). He **blesses the car**, and for one moment all the ghosts around the road glow faintly. **Krahang** flies overhead. Stray dogs chase the taxi. → RIGHT |
| 7 | 03:00 | `sala2` | **ลุงสมาน Uncle Saman**, a long-dead luk thung singer in a sequinned jacket | ghost (friendly), no reflection, cigarette smoke passes through the glass | Funny. He requests songs and sings along off-key. Still has scares: his face presses against the glass from outside while he's also inside. → LEFT |
| 8 | 04:00 | `marketLamp` | **ยายบัว Grandma Bua**, 80, flower-garland seller | human | Emotional. She knew your father ("รถคันนี้เหมือนรถไอ้ชาย"). She gives you a garland for the dashboard. **Elephant family crossing**, with the baby following its mother. Blue hour begins. → RIGHT |
| 9 | 05:00–05:40 | `fatherLamp` | **สมชาย Somchai**, your father | ghost | The reveal (§1). Dawn mist, birdsong, monks walking at the roadside. → LEFT (+ the final rule test). |

**Dialogue style:** natural, colloquial Thai (ครับ/ค่ะ/จ้ะ/โยม, regional warmth),
English subtitles. Lines are short (≤ ~14 Thai words). Each passenger gets about
12–25 lines: greeting, destination, 3–6 ride beats tied to progress or events, reactions
to rule events, an arrival line, and a wrong-fork line.

---

## 5. Night structure and pacing

| phase | hours | mood | systems |
|---|---|---|---|
| **Dread** | 21:00–23:00 | Very scary. Oppressive silence, minimal music, rain, heavy fog. Brutal, unpredictable scares. | rain on, fog heavy, music `dread`/`silence`, encounter rate high |
| **Surreal** | 23:00–02:00 | Folklore and bizarre events: red moon, crimson lanterns, Krasue, Krahang, Nang Tani, wire crawler, forest giant | rain stops ~00:30, surreal tint, music `surreal` |
| **Calm** | 02:00–04:00 | Comfortable, sometimes funny: friendly ghosts, stray dogs, drunk uncle (earlier), noodle shop, radio songs. Still the odd surprise scare. | clear sky and stars, fireflies, music `calm`/`nostalgic` |
| **Dawn** | 04:00–06:00 | Beautiful and emotional: blue hour, morning mist, birds, monks collecting alms, elephants, golden sunrise | dawn lighting, music `dawn` |

**Ride loop:** drive to the pickup (the passenger hails; the ว่าง vacant lamp is red) →
stop near them (< 8 km/h within ~10 m) → they get in (door, seat, suspension) → the
player turns on the meter (taught in the tutorial) → greeting and destination →
drive (dialogue beats, encounters, rule events) → shrine approach (fog thickens,
lanterns, the ride slows) → **fork**: steer LEFT or RIGHT → resolve:
* **Correct:** the passenger leaves. Ghosts walk into the mist gate; humans get off at
  the village stop and pay. Chapter card for the next hour, autosave, back around the
  loop to the next pickup.
* **Wrong:** a unique death cinematic (giant hand, true form, road folding, window
  attack, dragged backward) → black → death card → 21:00 at the garage. From the 2nd
  death on, Ah Kong offers *"จะกลับไปชั่วโมงที่หลงไหม"* ("Go back to the hour you got
  lost in?"). Accepting time-skips to the start of the ride where you died, with
  everything learned kept.

**Free driving between rides** is where ambient folklore encounters, optional stops
(noodle shop coffee and snacks, shrine offerings, memories) and the beautiful
quiet driving happen.

---

## 6. Encounters (encounter director; gated by hour, location, gaze and state)

Window and mirror encounters use **actual gaze** (cameraRig.isLookingAt /
taxi.getGazeTarget) and reflection layers. They are not fixed jumpscares. Many
trigger **only when you aren't looking**, then reveal when you are.

* **Tree watcher** (21–23): a pale figure stands among trees, visible only through
  the side window. When you look straight at it, it's gone; it reappears farther ahead.
* **Woman running beside the car** (21–23): seen in the side mirror first, then
  through the side window. She keeps pace and her neck turns toward you.
* **Wire crawler** (22–01): a long-limbed thing crawls along the sagging electrical
  wires overhead, lit by flickering streetlights.
* **Shadows behind the sala** (21–24): figures move behind the pillars of roadside
  salas as you pass.
* **Upside-down head** (ride 2): a head slowly lowers into the top of the windshield
  from the roof.
* **Fingers on the door frame** (ride 2): long fingers curl around the window frame
  from outside while moving.
* **Face against the glass** (rides 2, 7): a face presses against the side glass and
  smears condensation.
* **Roof crawler** (22–02): seen through the top edge of the windshield, or as a dent
  sound and shadow.
* **Reflection that stays** (ride 4 aftermath / wrong): the passenger leaves, but the
  reflection remains seated.
* **Twisted-neck reflection** (any ghost ride, rare): direct view normal, reflection's
  neck bent 90°.
* **Something enormous** (23–01): a vast silhouette moves between trees, lit for a
  moment by a streetlight.
* **ยายสปีด Yai Speed** (23–01): a grandmother sprints alongside at any speed with an
  impossible gait, overtakes, and turns her head 180° while running. Slow down and
  she passes; stare and speed up and she lands on the hood (scare; the amulet repels
  her).
* **กระสือ Krasue** (00–02): a floating head with glowing entrails drifts through the
  banana trees.
* **กระหัง Krahang** (01–02): a man flying on winnowing-basket wings crosses the canopy.
* **ผีตายโหง Phi Tai Hong** (22, 00): a broken figure at the accident curve near the
  wreaths and the old crashed motorbike.
* **Voice calling "ต้น..."** (rule 7) and **breath on the neck** (rule 8) events.
* **Cabin light dies** (rule 9) event.
* **Beautiful encounters:** elephant family crossing (04), stray dogs chasing the taxi
  (02–03), drunk uncle singing (ride 3), noodle shop open all night (Auntie Lek is
  human; coffee and snacks), elderly flower seller, monk blessing, fireflies, monks
  collecting alms (05–06).

---

## 7. Memories (secret ending, 7 collectibles, persist across loops)

1. `m_photo`: photo of child-you in the driver's sun visor (look up and click the visor).
2. `m_sticker`: the faded cartoon sticker on the dashboard (lean in and inspect).
3. `m_amulet`: mum's amulet; hold it for the first time (tutorial).
4. `m_helmet`: your father's cracked helmet at the accident curve memorial (exit the
   taxi on free drive).
5. `m_noodle`: Auntie Lek at the noodle shop: "สมชายชอบกินเส้นเล็กน้ำตก" (buy a coffee).
6. `m_letter`: an unsent letter to you in the glovebox (open the glovebox; from 02:00).
7. `m_song`: tune the radio to station 3 at 03:00–04:00: his favourite song.

---

## 8. Opening, menu and tutorial

* **Main menu** (owner's direction): always a **live driving scene**. The old taxi drives
  itself through the night forest on autopilot while slow cinematic cameras cut between
  the cabin (over the empty driver's seat, the garland swinging), the headlights in the
  fog, and the mirrors. Now and then it reaches ศาลเจ้ามารวย and the incident plays: a
  human passenger walks down the LEFT road and the gigantic hand closes around them.
  Thai-only menu: เริ่มเกมใหม่ · เล่นต่อ · ตั้งค่า · ทีมผู้สร้าง (credits include
  **Made by Pukking Dragon**).
* **New Game** → slot picker → the camera dives into the fog and comes out on the
  motorbike. No loading cut.
* **Motorbike intro (playable)**: first-person hands on the handlebars of an old
  rusty motorbike on the spur road through the forest. Insects hit the headlight,
  dogs bark in the distance, a spirit house goes by. You ride to the garage; a
  flickering fluorescent tube; Ah Kong smoking beside the taxi.
* **Garage**: walk (full-body first person) to Ah Kong. Cinematic dialogue (soft zoom,
  letterbox, Thai voice + subtitles). He gives you the keys and the paper. Read it.
  Hold the amulet (memory 3).
* **Interactive tutorial** (Ah Kong talks you through it from outside the window):
  open the door → sit → insert the key → turn it (engine start) → headlights → release
  the handbrake → first gear (manual) or D (auto) → accelerate, brake, steer →
  indicator → wipers → cabin light → radio → meter and ว่าง lamp → window crank → look
  at the mirrors → amulet. Each step is a physical interaction (look + click, the hand
  reaches) with a hotkey alternative. Then *"ไปได้แล้ว ไอ้หนุ่ม ... อย่าลืมกฎล่ะ"* ("Off you
  go, young man ... don't forget the rules.") and the shift starts at 21:00.

---

## 9. Art direction

**Painterly semi-realistic 3D:** a handcrafted horror painting brought to life.
NOT photoreal, NOT cartoon, NOT low-poly or plastic.

**SUPER SHARP, detailed, handmade, polished** (owner's directive). The handmade feel
comes from hand-painted texture brushwork, fine modelled detail and colour grading,
**never from blur**:
* The painterly post filter is subtle and edge-preserving. It must never smear textures,
  foliage edges, signage text or faces. A contrast-adaptive sharpening pass runs after it.
* Full-resolution rendering on High/Ultra, crisp anti-aliasing, max anisotropic
  filtering, high-resolution textures where the eye lands (taxi interior, faces,
  signs, road surface).
* Lots of small crafted detail: bevels, chipped edges, cable ties, stitching, cracks,
  leaves and debris, readable decals. Check every screenshot at 100% zoom.

* Hand-painted procedural textures with visible but subtle brushwork. Rough, worn
  materials: cracked wet asphalt, moss-eaten concrete, rust, peeling paint, tropical
  bark.
* Restrained natural palette: deep teal-blue night, moss greens, sodium-orange and
  sickly fluorescent-white lights, crimson shrine lanterns, gold leaf.
* Volumetric fog with headlight beams, wet reflections (light streaks on the road),
  soft cinematic shadows, lots of particles (insects, moths, fireflies, rain, pollen,
  leaves, incense smoke and ash, sparks, mist).
* Post: painterly (Kuwahara-type) filter, bloom, cinematic grading per hour, film
  grain, vignette, subtle chromatic aberration.
* The forest is **dense and claustrophobic**: giant old trees (rain trees,
  dipterocarps, banyans with aerial roots and strangler figs), bamboo clumps, banana
  plants, ferns, tall grass, hanging vines, branches over the road. You can't see far
  past the headlights.
* **Trees like reference 6** (`refs/6.jpg`): slender multi-stem trunks forking low, long
  reaching branches, dense masses of small, individually readable leaves, pale green where
  the headlights hit and near-black behind. Foliage mixes **3D branches with hand-painted 2D
  leaf-cluster cards** (crisp alpha, translucency, per-card flutter) and **2D painted
  silhouette flats** layered in the fog like a stage set. **Banana plants** are a hero
  species: big torn, ribbed, drooping blades, dead hanging leaves, and banana flowers.
  Falling leaves, spores and insects drift through the headlight beams.
* Thai details everywhere: spirit houses (ศาลพระภูมิ) with red soda bottles, zebra
  figurines and garlands; Thai-Chinese shrines; sacred trees wrapped in tri-coloured
  cloth (ผ้าสามสี); KM markers; convex traffic mirrors at curves; tangled electrical
  wires on crooked concrete poles; old faded signs; ศาลา with cracked benches, dusty
  plastic chairs and old posters.
* References: `docs/references.md` (the images supplied with the brief: mossy
  pavilion and well; golden shrine in night mist from a car; night forest drive with a
  masked passenger in the mirror; woman in white beside a delineator-lit guardrail;
  a cluttered lived-in Thai room for Ah Kong's garage).

**Colour script:**
* 21–23 Dread: near-black teal, desaturated, cold, green-tinted fog, sodium orange accents.
* 23–02 Surreal: sickly green plus crimson (lanterns), a reddish moon, purple haze.
* 02–04 Calm: warmer amber cabin light, stars, fireflies, soft blue moonlight.
* 04–06 Dawn: indigo → cyan → peach; glowing mist; golden sunrise rays through the trees at 05:45.

## 9b. Blood and gore

The horror is graphic when it lands, and crafted and painterly, never cartoonish.
Setting `gore`: `full` (default) or `reduced` (darker, sparser, less saturated blood;
no lingering close-ups).
* **Ghost true forms:**
  * The woman in white's neck splits as it snaps, and dark blood runs down the white dress.
  * The ผีตายโหง at the accident curve is crushed, wet with blood, limbs bent wrong.
  * Boy M's reflection shows a blood-soaked school shirt.
* **In the taxi:**
  * Bloody handprints and finger-smears on the glass.
  * Blood dripping from the roof seam onto the dash.
  * Stains seeping into a seat after a ghost leaves.
  * Rule r13's blood on the windshield, which the wipers smear horribly.
* **On the road:** dried blood and skid marks at the accident curve; fresh pools in the
  headlights after certain encounters.
* **Deaths:** screen blood splatter and drips (postfx), blood particles, gore reveals in
  the death cinematics (giant hand, true form, window attack, dragged back).

## 10. Audio direction

Spatial and dynamic. Cicadas, frogs, crickets, the gecko's "ตุ๊กแก" call, distant dogs,
temple bells, owls, wind in leaves, branches cracking, 50 Hz electrical hum (100 Hz
buzz) at poles and transformers, rain on the roof, rattling dashboard decorations,
engine, wipers, indicator ticks, footsteps, whispers, unnatural breathing. **Minimal
music** in the dread phase. Gentle nostalgic Thai-inspired music later (ranat-like
mallets, khim, soft pads, a 7-tone Thai scale). The diegetic radio plays original
luk thung-style songs, DJ chatter and static.

Voice: **Thai speech through Web Speech when the OS has a Thai voice** (macOS Kanya,
Windows Pattara/Achara, Android). Otherwise a processed Thai-cadence murmur.
Subtitles in EN, TH, or both.
