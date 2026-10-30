// Third-party attributions for the credits rolls: the CC BY recorded sounds (from the audio
// sample manifest, audio.samples.credits(), else docs/credits/audio.md) and the CC0 models
// (docs/credits/polyhaven.md + props.md), added to the ui's credits roll as their own section.
import { g } from '../context.js';

let _audio = null;
let _models = null;

/** [{title, author, license, source}] for every CC BY recording (CC0 ones need no attribution). */
export async function audioAttributions() {
  if (_audio) return _audio;
  let list = [];
  try {
    list = (g.audio?.samples?.credits?.() || []).filter((c) => /BY/i.test(c.license || '') && !/CC0/i.test(c.license || ''));
  } catch (e) {
    list = [];
  }
  if (!list.length) {
    try {
      const md = (await import('../../../docs/credits/audio.md?raw')).default || '';
      const re = /^- "(.+?)" by (.+?) \((https?:\/\/[^)]+)\), licensed under (CC BY[^ (]*(?: [\d.]+)?)/gm;
      let m;
      while ((m = re.exec(md))) list.push({ title: m[1], author: m[2], source: m[3], license: m[4] });
    } catch (e) {
      /* docs not bundled */
    }
  }
  const seen = new Set();
  _audio = list.filter((c) => {
    const k = `${c.author}|${c.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return _audio;
}

/** Authors of the CC0 Poly Haven models (credited anyway). */
export async function modelAuthors() {
  if (_models) return _models;
  const names = new Set();
  for (const loader of [() => import('../../../docs/credits/characters.md?raw'), () => import('../../../docs/credits/polyhaven.md?raw'), () => import('../../../docs/credits/props.md?raw')]) {
    try {
      const md = (await loader()).default || '';
      for (const line of md.split('\n')) {
        const cells = line.split('|').map((x) => x.trim());
        if (cells.length < 5 || !/CC0/.test(line) || /author/i.test(line)) continue;
        const author = cells[3];
        if (author && /[A-Za-z]/.test(author) && !/^https?:/.test(author)) for (const a of author.replace(/\(.*?\)/g, '').split(/,\s*/)) if (a.trim()) names.add(a.trim());
      }
    } catch (e) {
      /* docs not bundled */
    }
  }
  _models = [...names].sort();
  return _models;
}

function el(tag, cls, text, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  return e;
}

/** A credits section in the ui roll's own markup. */
function section(th, en, children) {
  const sec = el('div', 'dlb-cr-sec');
  const hd = el('div', 'dlb-cr-sec__h');
  hd.append(el('span', 'en', en), el('span', 'th', th, { lang: 'th' }));
  sec.append(hd, ...children);
  return sec;
}

/** Add the attribution sections to a credits roll element (before its closing card). */
export async function injectAttributions(roll) {
  if (!roll || roll.dataset.attributions) return;
  roll.dataset.attributions = '1';
  const [audio, models] = await Promise.all([audioAttributions(), modelAuthors()]);
  const secs = [];
  if (audio.length) {
    const items = audio.map((c) => {
      const p = el('p', 'dlb-cr-note');
      p.style.cssText = 'font-size:12px;line-height:1.45;margin:0.25em 0;opacity:.82';
      p.textContent = `“${c.title}” — ${c.author} · ${c.license}`;
      return p;
    });
    const note = el('p', 'dlb-cr-note', 'เสียงบันทึกจาก freesound.org ตัดต่อ ปรับระดับเสียง และแปลงไฟล์', { lang: 'th' });
    note.append(el('span', 'en', 'Recordings from freesound.org, trimmed, faded, loudness-normalised and converted.'));
    secs.push(section('เสียงบันทึก (CC BY)', 'Recorded sounds · CC BY', [note, ...items]));
  }
  if (models.length) {
    const p = el('p', 'dlb-cr-note');
    p.style.cssText = 'font-size:12.5px;line-height:1.6;opacity:.82';
    p.textContent = models.join(' · ');
    const note = el('p', 'dlb-cr-note', 'โมเดลและตัวละครพื้นฐานจาก Poly Haven, Quaternius และ MakeHuman (CC0)', { lang: 'th' });
    note.append(el('span', 'en', 'Base models and characters from Poly Haven, Quaternius and MakeHuman (CC0 1.0)'));
    secs.push(section('โมเดลสามมิติ', 'Third-party models', [note, p]));
  }
  if (!secs.length) return;
  const last = roll.lastElementChild;
  for (const s of secs) roll.insertBefore(s, last);
}

/** Find the most recent credits roll the ui put on screen and add the attributions to it. */
export function attachToLatestRoll(selector = '.dlb-ending .dlb-roll, .dlb-credits .dlb-roll') {
  const rolls = (g.ui?.layer || document).querySelectorAll(selector);
  const roll = rolls[rolls.length - 1];
  if (roll) injectAttributions(roll).catch((e) => console.warn('[credits] attributions', e));
}
