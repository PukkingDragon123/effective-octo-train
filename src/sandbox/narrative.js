// Narrative data sandbox: validates src/game/data and renders a readable script overview.
//   ?view=summary (default) | ride&id=<passengerId> | tutorial | encounters | world | radio | endings
// node tools/shot.mjs --sandbox=narrative --out=.shots/narrative.png --frames=1
// node tools/shot.mjs --sandbox=narrative --params="view=ride&id=somchai" --size=960x2400 --frames=1
// window.__narrative = { errors, warnings, stats } for --eval checks.
import * as DATA from '../game/data/index.js';
import { LAYOUT, LANDMARK_NAMES } from '../world/layout.js';
import { KEY_BINDINGS } from '../core/Input.js';
import { FONTS } from '../ui/fonts.js';
import { validateNarrative } from './narrative-validate.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
.nv{position:fixed;inset:0;overflow:auto;z-index:50;background:radial-gradient(ellipse at 30% 0%,#1b2421 0%,#0b0f0e 60%,#070908 100%);color:#d9d0bc;font:12px/1.42 ${FONTS.body};padding:14px 18px;box-sizing:border-box}
.nv h1{font:600 22px/1.1 ${FONTS.title};letter-spacing:.06em;margin:0 0 2px;color:#e9dcc0}
.nv h2{font:600 13px/1.2 ${FONTS.sign};letter-spacing:.04em;margin:10px 0 4px;color:#c9a35a;text-transform:uppercase}
.nv .sub{color:#8e9a8e;font-size:11px;margin-bottom:8px}
.nv .ok{color:#8fc28a}.nv .bad{color:#e0705a}.nv .warn{color:#d8b45a}
.nv table{border-collapse:collapse;width:100%;font-size:11px}
.nv td,.nv th{padding:2px 5px;border-bottom:1px solid #263029;vertical-align:top;text-align:left}
.nv th{color:#9fb0a0;font-weight:600}
.nv .ghost{color:#9fc4d8;white-space:nowrap}.nv .human{color:#e2c48a;white-space:nowrap}
.nv .cols{display:grid;grid-template-columns:1.25fr 1fr;gap:14px}
.nv .tag{display:inline-block;padding:0 4px;margin:0 2px 1px 0;border-radius:3px;background:#1e2a25;color:#b9c6b5;font-size:10px}
.nv .tag.g{background:#1c2c38;color:#9fc4d8}.nv .tag.r{background:#3a2420;color:#e3a08a}
.nv .line{margin:1px 0 3px;padding-left:8px;border-left:2px solid #2a3530}
.nv .line .who{color:#c9a35a;font-weight:600;margin-right:4px}
.nv .line .th{color:#efe5cf;font-size:13px}
.nv .line .en{color:#8fa094;font-style:italic;display:block}
.nv .line.thought{border-left-color:#5a6f8a}.nv .line.thought .th{color:#b9c8dc}
.nv .line.ghost .th,.nv .line.whisper .th{color:#a9c9cf}
.nv .line.choice{border-left-color:#c9a35a}
.nv .meta{color:#7f8c80;font-size:10px}
.nv .beat{margin:6px 0 2px;color:#9fb0a0;font-size:11px}
.nv ul{margin:2px 0 4px 16px;padding:0}
.nv .rules li{margin-bottom:2px}
.nv .hand{font-family:${FONTS.hand};color:#d8c79a}
`;

function lineHTML(l) {
  if (!l) return '';
  const who = l.who === 'passenger' ? 'P' : l.who === 'player' ? (l.tone === 'thought' ? 'ต้น (คิด)' : 'ต้น') : (DATA.CHARACTERS[l.who]?.nameTH || l.who);
  const extras = [l.tone && l.tone !== 'normal' && l.tone !== 'thought' ? l.tone : '', l.emotion, l.action ? '▸' + l.action : '', l.set ? 'set ' + Object.keys(l.set).join(',') : ''].filter(Boolean).join(' · ');
  let html = `<div class="line ${l.tone || ''} ${l.choice ? 'choice' : ''}"><span class="who">${esc(who)}</span><span class="th">${esc(l.th)}</span> <span class="meta">${esc(extras)}</span><span class="en">${esc(l.en)}</span>`;
  if (l.choice) {
    html += '<div class="meta">choice: ' + l.choice.options.map((o) => `[${esc(o.key)}] ${esc(o.th)} / ${esc(o.en)}`).join(' &nbsp; ') + (l.choice.timeout ? ` · ${l.choice.timeout}s, default ${esc(l.choice.defaultKey)}` : '') + '</div>';
    for (const [k, ls] of Object.entries(l.branches || {})) html += `<div class="beat">→ ${esc(k)}</div>` + ls.map(lineHTML).join('');
  }
  return html + '</div>';
}
const linesHTML = (ls) => (ls || []).map(lineHTML).join('');
const trigText = (t) => (t.type === 'progress' ? `@${Math.round(t.at * 100)}%` : t.type === 'time' ? `@${t.seconds}s` : t.type === 'after' ? `after ${t.beat} +${t.seconds}s` : `on ${t.event}`);

function clueTags(p) {
  const c = p.clues;
  const g = (cond, text) => `<span class="tag ${cond ? 'g' : ''}">${esc(text)}</span>`;
  return [
    g(c.reflection !== 'normal', 'mirror:' + c.reflection),
    g(!c.shadow, c.shadow ? 'shadow' : 'no shadow'),
    g(!c.breathFog, c.breathFog ? 'breath fog' : 'no breath'),
    g(c.weightKg === 0, c.weightKg + ' kg'),
    g(c.meter !== 'normal', 'meter:' + c.meter),
    g(c.radioStatic > 0, 'static ' + c.radioStatic),
    g(!c.blinks, c.blinks ? 'blinks' : 'no blink'),
    c.feetFloat ? g(true, 'feet float') : '',
    g(!['coins', 'banknote'].includes(c.payment.type), c.payment.type + ' ' + c.payment.amountTHB + '฿'),
  ].join('');
}

function summary(report) {
  const { PASSENGERS, RULES, HIDDEN_LINE, CHAPTERS, ENDINGS, MEMORIES, ENCOUNTERS, TUTORIAL_STEPS, SONGS, STATIONS } = DATA;
  const rows = PASSENGERS.map((p) => {
    const ch = DATA.CHARACTERS[p.characterId];
    const st = report.stats.perPassenger[p.id];
    return `<tr><td>${p.order}</td><td>${String(p.hour % 24).padStart(2, '0')}:00</td>
      <td><b class="${p.identity}">${esc(ch.nameTH)}</b><br><span class="meta">${esc(ch.nameEN)}</span></td>
      <td class="${p.identity}">${p.identity}<br>→ ${p.fork.toUpperCase()}</td>
      <td>${esc(LANDMARK_NAMES[p.pickup]?.th || p.pickup)}<br><span class="meta">${esc(p.pickup)} · ${p.seat}</span></td>
      <td>${clueTags(p)}</td>
      <td>${p.specialRules.map((r) => `<span class="tag r">${r.rule}</span>`).join('')}<br><span class="meta">${p.encounters.map((e) => e.id).join(', ')}</span></td>
      <td>${st.lines} / ${st.beats}b<br><span class="meta">${p.deathOnWrong}</span></td></tr>`;
  }).join('');
  const status = report.errors.length ? `<span class="bad">${report.errors.length} errors</span>` : '<span class="ok">schema OK</span>';
  return `
  <h1>DON'T LOOK BACK IN HORROR — narrative data</h1>
  <div class="sub">${status} · <span class="${report.warnings.length ? 'warn' : 'ok'}">${report.warnings.length} warnings</span> ·
   ${report.stats.lines} lines · ${report.stats.thaiChars.toLocaleString()} Thai chars · ${PASSENGERS.length} rides · ${Object.keys(ENCOUNTERS).length} encounters ·
   ${MEMORIES.length} memories · ${Object.keys(ENDINGS).length} endings · ${TUTORIAL_STEPS.length} tutorial steps · ${Object.keys(SONGS).length} songs / ${STATIONS.length} stations</div>
  ${report.errors.length ? '<ul class="bad">' + report.errors.slice(0, 12).map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>' : ''}
  ${report.warnings.length ? '<ul class="warn">' + report.warnings.slice(0, 6).map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>' : ''}
  <h2>The night · ride order</h2>
  <table><tr><th>#</th><th>hour</th><th>passenger</th><th>is</th><th>pickup · seat</th><th>clue language (blue = ghostly)</th><th>rules · encounters</th><th>lines</th></tr>${rows}</table>
  <div class="cols">
   <div><h2>Ah Kong's rules</h2><ol class="rules hand">${RULES.map((r) => `<li>${esc(r.th)} <span class="meta">— ${esc(r.en)}</span></li>`).join('')}</ol>
   <div class="hand" style="opacity:.8">(${esc(HIDDEN_LINE.th)}) <span class="meta">${esc(HIDDEN_LINE.en)}</span></div></div>
   <div><h2>Chapters</h2><table>${CHAPTERS.map((c) => `<tr><td>${c.time}</td><td>${esc(c.th)}</td><td class="meta">${esc(c.en)}</td></tr>`).join('')}</table>
   <h2>Endings</h2><table>${Object.values(ENDINGS).map((e) => `<tr><td><b>${esc(e.titleTH)}</b></td><td>${esc(e.titleEN)}</td><td class="meta">${esc(e.kind)} — ${esc(e.condition)}</td></tr>`).join('')}</table></div>
  </div>`;
}

function ride(id) {
  const p = DATA.getPassenger(id) || DATA.PASSENGERS[0];
  const ch = DATA.CHARACTERS[p.characterId];
  const d = p.dialogue;
  const sec = (title, ls) => (ls?.length ? `<h2>${title}</h2>${linesHTML(ls)}` : '');
  let html = `<h1>${p.order}. ${esc(ch.nameTH)} — ${esc(ch.nameEN)}</h1>
   <div class="sub"><span class="${p.identity}">${p.identity} → ${p.fork.toUpperCase()}</span> · ${String(p.hour % 24).padStart(2, '0')}:00 · ${esc(p.pickup)} · ${p.seat} · to ${esc(p.destination.th)} (${esc(p.destination.en)}) · wrong: ${p.deathOnWrong}</div>
   <div>${clueTags(p)}</div>
   <div class="meta">${(p.clues.extra || []).map(esc).join(' · ')}</div>
   <div class="meta">rules: ${p.specialRules.map((r) => `${r.rule}${r.at != null ? '@' + r.at : ''} ${esc(r.note || r.lookBack || '')}`).join(' | ')}</div>
   <div class="meta">encounters: ${p.encounters.map((e) => `${e.id}@${e.at}`).join(', ')}</div>`;
  html += '<div class="cols"><div>';
  html += sec('Hail', d.hail) + sec('Greet', d.greet) + sec('Destination', d.destination);
  html += '<h2>Beats</h2>' + d.beats.map((b) => `<div class="beat">◆ ${esc(b.id)} — ${esc(trigText(b.trigger))}${b.if ? ' if ' + esc(JSON.stringify(b.if)) : ''}</div>${linesHTML(b.lines)}`).join('');
  html += '</div><div>';
  html += sec('Arrive — correct', d.arriveCorrect) + sec('Arrive — wrong fork', d.arriveWrong) + sec('Idle', d.idle) + sec('On look back', d.onLookBack) + sec('Face gaze warning', d.onFaceGazeWarn) + sec('On face gaze', d.onFaceGaze);
  if (p.finale) for (const [k, v] of Object.entries(p.finale)) html += sec('Finale — ' + k, Array.isArray(v) ? v : [v]);
  return html + '</div></div>';
}

function tutorial() {
  const { INTRO_GARAGE, TUTORIAL_STEPS, SEND_OFF, RESTART_LINES, TIME_SKIP, RADIO_CAMEO, SHRINE_REVEAL, DEATH_HINTS } = DATA;
  let h = '<h1>อากง — Ah Kong</h1><div class="cols"><div><h2>Garage intro</h2>' + linesHTML(INTRO_GARAGE);
  h += '<h2>Tutorial</h2>' + TUTORIAL_STEPS.map((s, i) => {
    const w = s.waitFor.auto ? `auto ${JSON.stringify(s.waitFor.auto)} / manual ${JSON.stringify(s.waitFor.manual)}` : JSON.stringify(s.waitFor);
    const hint = s.hint.auto || s.hint;
    return `<div class="beat">${i + 1}. ${esc(s.id)} <span class="meta">[${hint.keys.join(' ')}] ${esc(hint.th)} · ${esc(w)}</span></div>` + linesHTML(Array.isArray(s.lines) ? s.lines : s.lines.auto) + linesHTML(s.after);
  }).join('');
  h += '</div><div><h2>Send-off</h2>' + linesHTML(SEND_OFF);
  h += '<h2>Restart (by loop)</h2>' + RESTART_LINES.map((r) => `<div class="beat">loop ≥ ${r.minLoop}</div>` + linesHTML(r.lines)).join('');
  h += '<h2>Time skip</h2>' + linesHTML([TIME_SKIP.offer, TIME_SKIP.choice, ...TIME_SKIP.accept, ...TIME_SKIP.decline]);
  h += '<h2>Death hints</h2>' + Object.entries(DEATH_HINTS).map(([k, ls]) => `<div class="beat">${k}</div>` + linesHTML(ls)).join('');
  h += '<h2>Radio cameo</h2>' + linesHTML(RADIO_CAMEO.lines) + '<h2>Shrine reveal</h2>' + linesHTML(SHRINE_REVEAL);
  return h + '</div></div>';
}

function encounters() {
  const rows = Object.values(DATA.ENCOUNTERS).map((e) => {
    const hrs = (Array.isArray(e.hours[0]) ? e.hours : [e.hours]).map((r) => `${r[0] % 24}–${r[1] % 24}`).join(', ');
    return `<tr><td><b>${esc(e.nameTH)}</b><br><span class="meta">${esc(e.nameEN)} · ${e.id}</span></td><td>${e.kind}${e.ruleId ? ' <span class="tag r">' + e.ruleId + '</span>' : ''}</td><td>${hrs}</td>
    <td class="meta">${esc([].concat(e.where).join(' '))}<br>${e.gazeMode} · cd ${e.cooldownSec}s · p ${e.chance}</td><td class="meta">${esc(e.staging)}</td></tr>`;
  }).join('');
  return `<h1>Encounters</h1><table><tr><th>name</th><th>kind</th><th>hours</th><th>where · gaze</th><th>staging</th></tr>${rows}</table>`;
}

function world() {
  const { MEMORIES, DEATH_CARDS, SIGNS, POSTERS, NOODLE_MENU, LOADING_LINES, GARAGE_CALENDAR, CREDITS, CREDITS_HEADLINE } = DATA;
  let h = '<h1>World text · memories · credits</h1><div class="cols"><div><h2>Memories</h2>';
  h += MEMORIES.map((m) => `<div class="beat">${m.order}. <b>${esc(m.titleTH)}</b> — ${esc(m.titleEN)} <span class="meta">${esc(m.how.en)}</span></div>` + m.text.map((t) => `<div class="line thought"><span class="th">${esc(t.th)}</span><span class="en">${esc(t.en)}</span></div>`).join('') + `<div class="hand meta">✎ ${esc(m.pencil.th)}</div>`).join('');
  h += '<h2>Death cards</h2><table>' + Object.entries(DEATH_CARDS).map(([k, c]) => `<tr><td class="meta">${k}</td><td>${esc(c.th)}</td><td class="meta">${esc(c.en)}</td></tr>`).join('') + '</table>';
  h += '</div><div><h2>Signs</h2><table>' + Object.entries(SIGNS).map(([k, s]) => `<tr><td class="meta">${k}</td><td>${esc((Array.isArray(s) ? s : [s]).map((x) => x.th).join(' / '))}</td></tr>`).join('') + '</table>';
  h += '<h2>Posters</h2>' + POSTERS.map((p) => `<div class="line"><span class="th">${esc(p.th.join(' · '))}</span><span class="en">${esc(p.en.join(' · '))}</span></div>`).join('');
  h += `<h2>${esc(NOODLE_MENU.titleTH)}</h2><table>` + NOODLE_MENU.items.map((i) => `<tr><td>${esc(i.th)}</td><td class="meta">${esc(i.en)}</td><td>${i.prefix || ''}${i.price}</td></tr>`).join('') + `</table><div class="meta">${esc(NOODLE_MENU.footnote.th)}</div>`;
  h += `<h2>Garage calendar</h2><div>${esc(GARAGE_CALENDAR.titleTH)} · ${esc(GARAGE_CALENDAR.monthTH)} ⭕${GARAGE_CALENDAR.circledDay} <span class="hand">${esc(GARAGE_CALENDAR.noteTH)}</span></div>`;
  h += '<h2>Loading</h2>' + LOADING_LINES.map((l) => `<div class="meta">${esc(l.th)} — ${esc(l.en)}</div>`).join('');
  h += `<h2>Credits</h2><div><b>${esc(CREDITS_HEADLINE.en)}</b></div>` + CREDITS.map((s) => `<div class="beat">${esc(s.titleEN)}</div>` + s.entries.map((e) => `<div class="meta">${esc(e.roleEN ? e.roleEN + ' — ' + e.name : e.en)}</div>`).join('')).join('');
  return h + '</div></div>';
}

function radio() {
  const { STATIONS, SONGS, DJ_LINES, SPECIAL_BROADCASTS, LATE_NIGHT_WHISPERS, FATHER_SONG } = DATA;
  let h = '<h1>Radio</h1><div class="cols"><div><h2>Stations</h2>' + STATIONS.map((s) => `<div class="beat">${s.index}. ${esc(s.freq)} — <b>${esc(s.nameTH)}</b> ${esc(s.nameEN)}</div>` + linesHTML(DJ_LINES[s.id] || [])).join('');
  h += '<h2>Specials</h2>' + SPECIAL_BROADCASTS.map((b) => `<div class="beat">${b.id} (${b.station}, ${b.hours.join('–')})</div>` + linesHTML(b.lines)).join('');
  h += '<h2>Whispers</h2>' + linesHTML(LATE_NIGHT_WHISPERS) + '</div><div><h2>Songs</h2>';
  h += Object.values(SONGS).map((s) => `<div class="beat">${s.id === FATHER_SONG ? '★ ' : ''}<b>${esc(s.titleTH)}</b> — ${esc(s.titleEN)} <span class="meta">${esc(s.artistTH)} · ${s.year ?? '?'} · ${s.mood}</span></div>` + s.lyrics.map((l) => `<div class="line"><span class="th">♪ ${esc(l.th)}</span><span class="en">${esc(l.en)}</span></div>`).join('')).join('');
  return h + '</div></div>';
}

function endingsView() {
  const { ENDINGS } = DATA;
  return '<h1>Endings</h1>' + Object.values(ENDINGS).map((e) => `<h2>${esc(e.titleTH)} — ${esc(e.titleEN)} (${e.kind})</h2><div class="meta">${esc(e.condition)}</div>` +
    e.scenes.map((s) => `<div class="beat">◆ ${esc(s.id)} — <span class="meta">${esc(s.note)}</span></div>` + linesHTML(s.lines)).join('') +
    e.epilogue.map((t) => `<div class="line thought"><span class="th">${esc(t.th)}</span><span class="en">${esc(t.en)}</span></div>`).join('')).join('');
}

export default async function ({ engine, params }) {
  if (engine.scene.background?.isColor) engine.scene.background.set(0x070908);
  const report = validateNarrative({ data: DATA, layout: LAYOUT, keyBindings: KEY_BINDINGS });
  window.__narrative = report;
  for (const e of report.errors) console.error('[narrative] ' + e);
  for (const w of report.warnings) console.warn('[narrative] ' + w);

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'nv';
  const view = params.get('view') || 'summary';
  const views = { summary: () => summary(report), ride: () => ride(params.get('id')), tutorial, encounters, world, radio, endings: endingsView };
  root.innerHTML = (views[view] || views.summary)();
  document.body.appendChild(root);
  await document.fonts.ready;
}
