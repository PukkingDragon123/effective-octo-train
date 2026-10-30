// Owner's test panel: jump anywhere in the game without playing through it.
// Toggle with the small "ทดสอบ" button (top-left) or the ` key. Works with touch.
// Every action is defensive: missing systems just show a toast instead of crashing.
import { g } from '../game/context.js';
import { settings } from '../core/Settings.js';
import { input } from '../core/Input.js';

const CSS = `
.dlb-test-toggle { position: absolute; left: max(8px, env(safe-area-inset-left)); top: max(8px, env(safe-area-inset-top)); z-index: 60;
  pointer-events: auto; font: 700 13px var(--f-body); color: #f3e8d2; background: rgba(120,30,20,.75); border: 1px solid rgba(255,210,180,.5);
  border-radius: 999px; padding: 6px 12px; cursor: pointer; touch-action: manipulation; }
.dlb-test { position: absolute; left: max(8px, env(safe-area-inset-left)); top: calc(max(8px, env(safe-area-inset-top)) + 40px);
  bottom: max(8px, env(safe-area-inset-bottom)); width: min(380px, calc(100vw - 16px)); z-index: 60; pointer-events: auto; overflow-y: auto;
  background: rgba(10,12,11,.92); border: 1px solid rgba(236,228,210,.2); border-radius: 10px; padding: 10px 12px 16px;
  font: 400 14px var(--f-body); color: #ece4d2; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
.dlb-test[hidden], .dlb-test-fps[hidden] { display: none !important; }
.dlb-test h4 { margin: 12px 0 6px; font: 700 14px var(--f-body); color: #e7b48a; }
.dlb-test .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dlb-test button { font: 700 13px var(--f-body); color: #ece4d2; background: #1f2622; border: 1px solid #3a463f; border-radius: 6px;
  padding: 7px 9px; cursor: pointer; touch-action: manipulation; }
.dlb-test button.on { background: #6a2a1c; border-color: #c8735a; }
.dlb-test select, .dlb-test input[type=range] { font: 400 13px var(--f-body); max-width: 100%; }
.dlb-test select { background: #1f2622; color: #ece4d2; border: 1px solid #3a463f; border-radius: 6px; padding: 6px; flex: 1; min-width: 0; }
.dlb-test input[type=range] { flex: 1; min-width: 120px; }
.dlb-test .val { min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
.dlb-test .msg { margin-top: 10px; min-height: 18px; color: #e7b48a; font-size: 12px; }
.dlb-test-fps { position: absolute; left: calc(max(8px, env(safe-area-inset-left)) + 78px); top: max(10px, env(safe-area-inset-top)); z-index: 60;
  font: 700 12px monospace; color: #b7f0a8; background: rgba(0,0,0,.55); padding: 4px 7px; border-radius: 4px; pointer-events: none; }
`;

const DEATHS_FALLBACK = ['giantHand', 'trueForm', 'roadFold', 'windowAttack', 'dragBack', 'home', 'nameCall', 'count444', 'windowArm', 'extraPassenger', 'ceilingCrawl', 'lookBack', 'faceGaze', 'knock'];

export function installTestPanel(root) {
  if (document.getElementById('dlb-test-css')) return;
  const style = document.createElement('style');
  style.id = 'dlb-test-css';
  style.textContent = CSS;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.className = 'dlb-test-toggle';
  toggle.textContent = 'ทดสอบ';
  root.appendChild(toggle);
  const panel = document.createElement('div');
  panel.className = 'dlb-test';
  panel.hidden = true;
  root.appendChild(panel);
  const fps = document.createElement('div');
  fps.className = 'dlb-test-fps';
  fps.hidden = true;
  root.appendChild(fps);

  const msg = document.createElement('div');
  const say = (t) => {
    msg.textContent = t;
    console.info('[test]', t);
  };
  const safe = (label, fn) => async () => {
    try {
      say(label + '…');
      await fn();
      say(label + ' ✓');
    } catch (err) {
      console.error(err);
      say(`${label}: ${err?.message || err}`);
    }
  };
  const section = (title) => {
    const h = document.createElement('h4');
    h.textContent = title;
    panel.appendChild(h);
    const r = document.createElement('div');
    r.className = 'row';
    panel.appendChild(r);
    return r;
  };
  const btn = (row, label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
    return b;
  };
  const select = (row, options, onGo, goLabel = 'ไป') => {
    const s = document.createElement('select');
    for (const [v, t] of options) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      s.appendChild(o);
    }
    row.appendChild(s);
    btn(row, goLabel, () => onGo(s.value));
    return s;
  };
  const slider = (row, min, max, step, value, onInput, fmt = (v) => v) => {
    const r = document.createElement('input');
    r.type = 'range';
    r.min = min;
    r.max = max;
    r.step = step;
    r.value = value;
    const v = document.createElement('span');
    v.className = 'val';
    v.textContent = fmt(+value);
    r.addEventListener('input', () => {
      v.textContent = fmt(+r.value);
      onInput(+r.value);
    });
    row.appendChild(r);
    row.appendChild(v);
    return r;
  };
  const ensureSave = () => {
    if (!g.saves) return;
    if (!g.saves.data) g.saves.load(0) || g.saves.create(0);
    g.save = g.saves.data;
  };
  const go = (state, params = {}) => {
    ensureSave();
    g.ui?.hideMainMenu?.();
    return g.fsm.go(state, { debug: true, ...params });
  };

  // ---- jump -----------------------------------------------------------------------------
  let row = section('ไปที่ฉาก (Jump)');
  btn(row, 'เมนู', safe('เมนู', () => go('menu')));
  btn(row, 'มอเตอร์ไซค์', safe('มอเตอร์ไซค์', () => go('intro')));
  btn(row, 'อู่', safe('อู่', () => go('garage')));
  btn(row, 'สอนขับ', safe('สอนขับ', () => go('tutorial')));
  btn(row, 'ตายแล้ววน (อู่)', safe('วนลูป', () => go('garage', { restart: true })));
  row = section('รอบรับผู้โดยสาร (Rides)');
  const names = () => (g.data?.passengers?.PASSENGERS || []).map((p, i) => [i, `${i + 1}. ${g.data?.characters?.CHARACTERS?.[p.characterId]?.nameTH || p.id}`]);
  for (const [i, label] of names().length ? names() : Array.from({ length: 9 }, (_, i) => [i, `รอบ ${i + 1}`])) {
    btn(row, label, safe(label, () => go('shift', { ride: i, hour: 21 + i })));
  }
  btn(row, 'ขับเล่น (ไม่มีผู้โดยสาร)', safe('ขับเล่น', () => go('shift', { ride: 0, hour: 21, free: true })));
  row = section('ฉากจบ (Endings)');
  const endingIds = Object.keys(g.data?.endings?.ENDINGS || {});
  select(row, (endingIds.length ? endingIds : ['dawn', 'endless', 'forgive', 'wrong_home']).map((id) => [id, `${g.data?.endings?.ENDINGS?.[id]?.titleTH || ''} ${id}`]), (id) => safe('ฉากจบ ' + id, () => go('ending', { ending: id, id }))());
  row = section('ตาย (Deaths)');
  const deathIds = Object.keys(g.data?.worldtext?.DEATH_CARDS || {});
  select(row, (deathIds.length ? deathIds : DEATHS_FALLBACK).map((d) => [d, d]), (d) =>
    safe('ตาย ' + d, async () => {
      if (typeof g.kill === 'function') await g.kill(d, { debug: true });
      else await go('death', { type: d, death: d });
    })(),
  );

  // ---- world ---------------------------------------------------------------------------
  row = section('เวลาและอากาศ (Time & weather)');
  slider(row, 21, 30, 0.25, g.clock?.hour ?? 21, (h) => g.clock?.set(h), (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
  row = section('ฝน / หมอก');
  slider(row, 0, 1, 0.05, 0.5, (v) => {
    if (g.clock) g.clock.autoWeather = false;
    g.sky?.setWeather({ rain: v }, 0.5);
  }, (v) => `ฝน ${Math.round(v * 100)}`);
  slider(row, 0, 1.5, 0.05, 0.5, (v) => {
    if (g.clock) g.clock.autoWeather = false;
    g.sky?.setWeather({ fog: v }, 0.5);
    g.sky?.setFogBoost?.(v, 0.5);
  }, (v) => `หมอก ${Math.round(v * 100)}`);
  row = section('วาร์ปรถไปที่ (Teleport taxi)');
  const lmKeys = () => Object.keys(g.world?.landmarks || {});
  select(row, (lmKeys().length ? lmKeys() : ['garage']).map((k) => [k, k]), (k) =>
    safe('วาร์ป ' + k, () => {
      const lm = g.world.landmarks[k];
      const pos = lm.stopPos || lm.pos;
      g.taxi.setPose(pos, lm.stopYaw ?? lm.travelYaw ?? lm.yaw ?? 0);
    })(),
  );
  row = section('เหตุการณ์ผี (Encounters)');
  const encIds = (g.data?.encounters?.ENCOUNTERS || []).map((e) => e.id);
  select(row, (encIds.length ? encIds : ['none']).map((id) => [id, id]), (id) =>
    safe('เหตุการณ์ ' + id, () => {
      if (!g.director?.start) throw new Error('ระบบเหตุการณ์ยังไม่พร้อม');
      return g.director.start(id, { ride: g.ride, debug: true });
    })(),
  );

  // ---- toggles -------------------------------------------------------------------------
  row = section('โหมดทดสอบ (Cheats)');
  const god = btn(row, 'อมตะ (ไม่ตาย)', () => {
    g.godMode = !g.godMode;
    god.classList.toggle('on', g.godMode);
    if (g.godMode && typeof g.kill === 'function' && !g._killOrig) {
      g._killOrig = g.kill;
      g.kill = (type) => say(`อมตะ: ข้ามการตาย ${type}`);
    } else if (!g.godMode && g._killOrig) {
      g.kill = g._killOrig;
      g._killOrig = null;
    }
    say(g.godMode ? 'อมตะ เปิด' : 'อมตะ ปิด');
  });
  const fpsBtn = btn(row, 'FPS', () => {
    fps.hidden = !fps.hidden;
    fpsBtn.classList.toggle('on', !fps.hidden);
  });
  btn(row, 'ความทรงจำครบ', safe('ความทรงจำครบ', () => {
    ensureSave();
    const all = g.data?.memories?.MEMORIES || [];
    g.save.memories = all.map((m) => m.id);
    g.persist();
  }));
  btn(row, 'ลูป +1', safe('ลูป +1', () => {
    ensureSave();
    g.save.loops = (g.save.loops || 0) + 1;
    g.persist();
  }));
  btn(row, 'ล้างเซฟช่องนี้', safe('ล้างเซฟ', () => {
    if (g.saves?.activeSlot != null) g.saves.create(g.saves.activeSlot);
    g.save = g.saves?.data;
  }));
  row = section('ภาพ (Graphics)');
  for (const p of ['low', 'medium', 'high', 'ultra']) btn(row, p, () => settings.set('graphicsPreset', p));
  row = section('อื่น ๆ');
  btn(row, 'เลือด: เต็ม/ลด', () => settings.set('gore', settings.get('gore') === 'reduced' ? 'full' : 'reduced'));
  btn(row, 'ภาษา: ไทย/ไทย+อังกฤษ', () => settings.set('language', settings.get('language') === 'both' ? 'th' : 'both'));
  btn(row, 'ปุ่มมือถือ: เปิด/ปิด', () => settings.set('touchControls', settings.get('touchControls') === 'on' ? 'off' : 'on'));

  msg.className = 'msg';
  panel.appendChild(msg);

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.textContent = open ? 'ปิด' : 'ทดสอบ';
    if (open) input.setWantPointerLock(false);
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') setOpen(panel.hidden);
  });
  // keep keyboard/mouse from steering the game while using the panel
  panel.addEventListener('keydown', (e) => e.stopPropagation());

  let acc = 0;
  let frames = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    frames++;
    if (now - acc > 500 && !fps.hidden) {
      const r = g.engine?.renderer;
      const f = (frames * 1000) / (now - acc);
      fps.textContent = `${f.toFixed(0)} fps · ${r?.info.render.calls ?? 0} calls · ${((r?.info.render.triangles ?? 0) / 1e6).toFixed(2)}M tris`;
      acc = now;
      frames = 0;
    } else if (now - acc > 500) {
      acc = now;
      frames = 0;
    }
  };
  requestAnimationFrame(tick);
}
