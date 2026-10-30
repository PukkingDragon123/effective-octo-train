// UI sandbox: every overlay screen over a dark, blurred, painted placeholder scene.
//   ?sandbox=ui&screen=loading|menu|slots|settings|credits|pause|subtitles|prompt|hint|
//                     chapter|choice|death|ending|paper|toast|hud
//   extra: device=gamepad, tab=0..3 (settings), tone=whisper|ghost|shout|thought,
//          icon=hand|grab|talk|eye|key|pray, stage=title|text|roll (ending),
//          notes=1 & hidden=1 (paper), full=1 (paper at 1:1), progress=0..1
import { ui } from '../ui/index.js';
import { loadFonts } from '../ui/fonts.js';
import { makeRng, noise } from '../core/math.js';

function paintBackdrop(kind = 'night') {
  // A defocused night-forest road (stand-in for the live 3D scene behind the menus).
  const W = 960;
  const H = 540;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rng = makeRng(77);
  const vx = W * 0.56;
  const vy = H * 0.56;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, kind === 'dawn' ? '#1b2433' : '#05080a');
  sky.addColorStop(0.45, kind === 'dawn' ? '#45506a' : '#0e1716');
  sky.addColorStop(0.58, kind === 'dawn' ? '#7a6d72' : '#1c2725');
  sky.addColorStop(0.7, '#0c1110');
  sky.addColorStop(1, '#040505');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const glow = (x, y, r, col, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col.replace('A', a));
    rg.addColorStop(1, col.replace('A', 0));
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // fog glow down the road
  glow(vx, vy, 420, 'rgba(96,124,114,A)', 0.28);
  glow(vx, vy + 10, 160, 'rgba(150,170,150,A)', 0.16);
  // tree walls: tall soft trunks converging on the vanishing point, darker when near
  for (let layer = 0; layer < 5; layer++) {
    const near = layer / 4;
    const n = 14 + layer * 4;
    for (let i = 0; i < n; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const spread = 0.06 + near * 0.55 + rng() * 0.18;
      const x = vx + side * W * spread;
      const w = 2 + near * near * 46 + rng() * 6;
      const l = Math.round(26 - near * 22);
      const tg = g.createLinearGradient(0, 0, 0, H);
      tg.addColorStop(0, `rgba(${l * 0.6 | 0},${l},${l * 0.9 | 0},0)`);
      tg.addColorStop(0.25, `rgba(${l * 0.6 | 0},${l},${l * 0.9 | 0},${0.5 + near * 0.5})`);
      tg.addColorStop(1, `rgba(${l * 0.5 | 0},${l * 0.8 | 0},${l * 0.7 | 0},${0.6 + near * 0.4})`);
      g.fillStyle = tg;
      const lean = (rng() - 0.5) * 0.08;
      g.beginPath();
      g.moveTo(x - w / 2, H);
      g.lineTo(x - w * 0.35 + lean * H, -10);
      g.lineTo(x + w * 0.35 + lean * H, -10);
      g.lineTo(x + w / 2, H);
      g.fill();
    }
    // canopy masses
    for (let i = 0; i < 26; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = vx + side * W * (0.1 + near * 0.6 + rng() * 0.3);
      const y = vy - H * (0.18 + rng() * 0.5 + near * 0.15);
      const r = 30 + near * 120 + rng() * 40;
      const l = Math.round(20 - near * 17);
      glow(x, y, r, `rgba(${l * 0.6 | 0},${l},${l * 0.85 | 0},A)`, 0.75);
    }
    // fog between layers
    glow(vx, vy, 300 - layer * 30, 'rgba(90,116,106,A)', 0.06);
  }
  // dark verges, then the wet road catching the fog light
  g.fillStyle = 'rgba(3,5,4,0.9)';
  g.fillRect(0, vy + 4, W, H - vy);
  const road = g.createLinearGradient(0, vy, 0, H);
  road.addColorStop(0, 'rgba(70,90,84,0.55)');
  road.addColorStop(0.4, 'rgba(34,44,42,0.6)');
  road.addColorStop(1, 'rgba(16,20,20,0.7)');
  g.fillStyle = road;
  g.beginPath();
  g.moveTo(vx - 6, vy + 4);
  g.lineTo(vx + 6, vy + 4);
  g.lineTo(W * 0.98, H);
  g.lineTo(W * 0.1, H);
  g.closePath();
  g.fill();
  // centre line dashes
  for (let i = 0; i < 8; i++) {
    const t0 = Math.pow(i / 8, 2);
    const t1 = Math.pow((i + 0.45) / 8, 2);
    const yA = vy + 4 + (H - vy) * t0;
    const yB = vy + 4 + (H - vy) * t1;
    const xA = vx + (W * 0.54 - vx) * t0;
    const xB = vx + (W * 0.54 - vx) * t1;
    g.strokeStyle = 'rgba(200,190,150,0.18)';
    g.lineWidth = 1 + t1 * 5;
    g.beginPath();
    g.moveTo(xA, yA);
    g.lineTo(xB, yB);
    g.stroke();
  }
  const sx = vx + 64;
  const sy = vy - 6;
  glow(sx, sy, 130, 'rgba(225,150,60,A)', 0.42);
  glow(sx, sy, 22, 'rgba(255,214,140,A)', 0.9);
  const refl = g.createLinearGradient(0, vy + 10, 0, H);
  refl.addColorStop(0, 'rgba(230,160,70,0.28)');
  refl.addColorStop(1, 'rgba(230,160,70,0)');
  g.fillStyle = refl;
  g.fillRect(sx - 7, vy + 10, 14, H);
  for (let i = 0; i < 6; i++) glow(sx - 50 + i * 21, sy - 14 + Math.sin(i * 1.7) * 4, 7, 'rgba(210,48,36,A)', 0.75);
  // bokeh dust
  for (let i = 0; i < 40; i++) glow(rng() * W, rng() * H, 3 + rng() * 10, 'rgba(180,200,180,A)', 0.04 + rng() * 0.05);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.8)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // pre-blur in canvas (a CSS filter on a full-screen layer is very slow in SwiftShader)
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const og = out.getContext('2d');
  og.filter = 'blur(5px)';
  og.drawImage(c, -12, -12, W + 24, H + 24);
  void noise;
  out.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:1;';
  document.body.insertBefore(out, document.getElementById('ui'));
}

function fakeSaves(saves) {
  const s0 = saves.create(0);
  Object.assign(s0, { stage: 'shift', hour: 26, rideIndex: 5, loops: 3, endingsSeen: ['endless'], memories: ['m_photo', 'm_sticker', 'm_amulet'], playTime: 4380 });
  saves.write();
  saves.delete(1);
  const s2 = saves.create(2);
  Object.assign(s2, { stage: 'tutorial', hour: 21, loops: 0, playTime: 610 });
  s2.updatedAt = Date.now() - 86400000 * 3;
  saves.write();
  saves.activeSlot = null;
}

export default async function ({ params, saves }) {
  await loadFonts();
  const screen = params.get('screen') || 'menu';
  if (params.get('bg') !== 'none') paintBackdrop(params.get('bg') || 'night');
  ui.init(document.getElementById('ui'));
  if (params.get('device')) ui.setDevice(params.get('device'));
  const speed = Number(params.get('speed') || 1);
  window.__ui = ui;
  // Freeze looping CSS animations once the screen has settled, so the headless
  // (SwiftShader) compositor goes idle and screenshots are quick. ?settle=0 disables.
  const settle = Number(params.get('settle') ?? 3000);
  if (settle > 0) {
    const st = document.createElement('style');
    st.textContent = '.dlb-still *, .dlb-still *::before, .dlb-still *::after { animation-play-state: paused !important; }';
    document.head.appendChild(st);
    setTimeout(() => document.getElementById('ui').classList.add('dlb-still'), settle);
  }

  switch (screen) {
    case 'loading':
      ui.showLoading(Number(params.get('progress') ?? 0.62), 'กำลังปลูกป่า', 'growing the forest');
      break;
    case 'menu':
      ui.showMainMenu({ canResume: params.get('resume') !== '0', onNew: () => ui.pickSlot('new') });
      break;
    case 'slots':
      fakeSaves(saves);
      ui.showMainMenu({ canResume: true });
      ui.pickSlot(params.get('mode') || 'new');
      break;
    case 'settings':
      ui.settingsPanel.tabIndex = Number(params.get('tab') || 0);
      ui.showMainMenu({ canResume: true });
      ui.showSettings();
      if (params.get('focus')) {
        const n = Number(params.get('focus'));
        for (let i = 0; i < n; i++) ui.nav.handle('down');
      }
      break;
    case 'credits':
      ui.showMainMenu({ canResume: true });
      ui.showCredits();
      break;
    case 'pause':
      ui.showPause({ time: '02:14', en: 'Luang Phi, the forest monk', onResume: () => {}, onQuitToMenu: () => {} });
      break;
    case 'subtitles':
      ui.setCrosshair(true);
      ui.subtitle({
        speakerTH: params.get('tone') === 'thought' ? null : 'ผู้หญิงชุดขาว', speakerEN: 'Woman in white',
        th: params.get('tone') === 'thought' ? 'เดี๋ยวนะ... เมื่อกี้กระจกไม่มีใครนี่' : params.get('tone') === 'shout' ? 'หยุดรถ! หยุดเดี๋ยวนี้!' : 'ไปโรงพยาบาลประจำจังหวัดค่ะ พี่รู้จักใช่ไหม',
        en: params.get('tone') === 'thought' ? 'Wait... there was no one in the mirror just now.' : params.get('tone') === 'shout' ? 'Stop the car! Stop it now!' : 'The provincial hospital, please. You know the one?',
        tone: params.get('tone') || 'normal', duration: 999,
      });
      break;
    case 'prompt':
      ui.setCrosshair(true);
      setTimeout(() => window.__game.bus.emit('interact:target', { id: 'taxi.door', labelTH: params.get('th') || 'เปิดประตู', labelEN: params.get('en') || 'Open the door', icon: params.get('icon') || 'hand' }), 300);
      break;
    case 'hint':
      ui.setCrosshair(true);
      ui.hint({ th: 'ค้างไว้เพื่อเช็ดไอน้ำบนกระจก', en: 'Hold to wipe the condensation off the glass', keys: ['interact'], duration: 0 });
      break;
    case 'chapter':
      ui.chapter({ time: params.get('time') || '23:00', th: 'ลุงเปี๊ยกกับเสียงเคาะท้ายรถ', en: 'Uncle Piak and the knocking trunk', duration: 999 });
      break;
    case 'choice':
      ui.setCrosshair(true);
      ui.subtitle({ th: 'ต้น... ต้นลูก...', en: 'Ton... Ton, my boy...', speakerTH: '???', speakerEN: 'a voice outside', tone: 'ghost', duration: 999 });
      ui.choice({ options: [{ key: 'answer', th: 'ครับ?', en: '“Yes?”' }, { key: 'silent', th: 'เงียบไว้', en: 'Stay silent' }], timeout: Number(params.get('timeout') || 12), defaultKey: 'silent' });
      break;
    case 'death':
      ui.deathCard({ th: 'คุณหันกลับไปมอง', en: 'You looked back.', hold: 999 });
      break;
    case 'ending': {
      const p = ui.ending({
        id: params.get('id') || 'dawn',
        th: 'แสงแรกของวันลอดผ่านแนวไม้ พระสงฆ์เดินบิณฑบาตอยู่ริมทาง คุณจอดรถ ใส่บาตร แล้วกรวดน้ำให้พ่อ วิทยุเปิดเพลงเก่าเพลงโปรดของเขา',
        en: 'The first light slips through the trees. Monks walk the roadside collecting alms. You stop, offer rice, and pour water for your father’s merit. The radio plays his favourite old song.',
        _speed: speed,
      });
      window.__endingDone = false;
      p.then(() => (window.__endingDone = true));
      break;
    }
    case 'toast':
      ui.toast('บันทึกแล้ว', 'Saved');
      setInterval(() => ui.toast('บันทึกแล้ว', 'Saved', { duration: 60 }), 50000);
      break;
    case 'hud':
      ui.setCrosshair(true);
      setTimeout(() => window.__game.bus.emit('interact:target', { id: 'taxi.radio', labelTH: 'เปิดวิทยุ', labelEN: 'Radio', icon: 'hand' }), 200);
      ui.subtitle({ speakerTH: 'ป้าศรี', speakerEN: 'Auntie Sri', th: 'ตรงไปเรื่อย ๆ เลยจ้ะ เดี๋ยวป้าบอกทางเอง', en: 'Just keep going, dear. I’ll tell you where.', duration: 999 });
      ui.hint({ th: 'เปิดมิเตอร์ก่อนออกรถ', en: 'Start the meter before you drive off', keys: ['meter'], duration: 0 });
      ui.toast('บันทึกแล้ว', 'Saved', { duration: 60 });
      break;
    case 'paper': {
      const full = params.get('full') === '1';
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 1408;
      const t0 = performance.now();
      const notesLevel = Number(params.get('notes') || 0);
      const N = window.__game?.narrative || null;
      void N;
      const PN = {
        r1: { th: 'ขับผ่าน = ถนนพับกลับมาที่เดิม', en: 'drove past = road folds back' },
        r3: { th: 'ใช้กระจกได้ หันไม่ได้', en: 'mirrors OK. turning NOT' },
        r4: { th: 'ดูกระจกก่อนทุกครั้ง', en: 'check the mirror first. always' },
        r5: { th: 'เหยียบไว้ ห้ามแตะเบรก', en: 'keep your foot down. no brakes' },
        r6: { th: 'เด็กขอ...ปิดเลย', en: 'the kid asked... just turn it off' },
        r7: { th: 'เสียงเหมือนแม่ แต่ไม่ใช่แม่', en: "sounds like Mum. it isn't." },
        r8: { th: 'กำพระแน่น ๆ หายใจช้า ๆ', en: 'grip the amulet. breathe slow' },
        r9: { th: 'มืดก็ปล่อยให้มืด', en: 'if it goes dark, let it' },
        r10: { th: 'ปี๊น ปี๊น — เจ้าที่ใจดีขึ้น', en: 'beep beep. the spirits ease off' },
        hidden: { th: 'ข้อสาม... ไม่มีข้อยกเว้น', en: 'rule 3... no exceptions' },
        'p:sri': { th: 'ป้าศรี = คน (หายใจขึ้นกระจก)', en: 'Auntie Sri = human (breath on glass)' },
        'p:womanWhite': { th: 'ชุดขาว = ไม่มีเงา ห้ามมอง!', en: "white dress = no reflection. DON'T LOOK" },
        'p:piak': { th: 'ลุงขี้เมา = คน แค่น่ากลัว', en: 'drunk uncle = human. just scary' },
        'p:boyM': { th: 'เด็กนักเรียน = มีแต่ในกระจก', en: 'schoolboy = ONLY in the mirror' },
        'p:nuan': { th: 'ชุดเขียว = เท้าไม่แตะพื้น', en: "green sabai = feet don't touch the floor" },
        'p:monk': { th: 'หลวงพี่ = คน ขอเปิดวิทยุได้', en: 'monk = human. radio ON is fine' },
      };
      const keys = Object.keys(PN);
      const pick = notesLevel >= 2 ? keys : notesLevel === 1 ? ['r3', 'r5', 'r7', 'p:sri', 'p:womanWhite'] : [];
      const annotations = Object.fromEntries(pick.map((k) => [k, PN[k]]));
      ui.drawRulesPaper(c.getContext('2d'), 1024, 1408, {
        hiddenLine: params.get('hidden') === '1',
        revealed: notesLevel ? ['r1', 'r3', 'r5', 'r6', 'r7'] : [],
        annotations,
      });
      console.log('[ui sandbox] rules paper drawn in', Math.round(performance.now() - t0), 'ms');
      window.__paperMs = Math.round(performance.now() - t0);
      c.style.cssText = full
        ? 'position:fixed;left:0;top:0;width:1024px;height:1408px;z-index:5;'
        : 'position:fixed;left:50%;top:50%;height:94vh;transform:translate(-50%,-50%) rotate(-2.2deg);z-index:5;filter:drop-shadow(0 18px 30px rgba(0,0,0,.65));';
      document.body.appendChild(c);
      break;
    }
    default:
      ui.showMainMenu({ canResume: true });
  }
}
