// Dialogue runner: plays arrays of line objects (schema: src/game/data/SCHEMA.md)
//   { who, th, en, tone?, emotion?, action?, pause?, choice?, set?, speakerTH?, speakerEN? }
// For each line it shows a subtitle, speaks it (Thai TTS or murmur via audio.voice),
// animates the speaker (talking jaw, expression, action) and waits.
//
// ALWAYS resolve a block with g.data.logic (dialogueBlock / resolveLines / endingFor) before
// playing it: this runner plays lines as given (it does not read `if` or `loopVariants`).
//
// API (engineer B extended the stock runner, same names and shapes):
//   setSpeaker(id, spec) / removeSpeaker(id)        spec {nameTH, nameEN, voice, humanoid, object}
//   alias(who, speakerId)                           e.g. alias('somchai', 'passenger') during ride 9
//   play(lines, opts) -> {completed, choices:{choiceId:key}, stoppedAt}
//        opts { onLine(line, i, depth), startAt (top-level index to resume from) }
//        A new play() interrupts the running one (rule events cut small talk).
//   enqueue(lines, opts) -> same result, but waits until nothing else is playing
//   interrupt()                                     stop now (closes an open reply with its default)
//   speakPlayer(text)                               Ton's voice, no subtitle (picked replies)
//   busy / idle
// Events: 'dialogue:line' {line, index, depth} (before the line plays; line.set already applied),
//         'dialogue:choice' {id, key, option}, 'dialogue:end' {completed}.
// Speaker labels honour line.speakerTH / speakerEN; unknown `who` ids fall back to
// CHARACTERS (data) for the name and voice. A picked reply is voiced in Ton's voice (never '…').
import { g } from './context.js';
import { wait, until } from './util.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';
import { CHARACTERS } from './data/characters.js';
import { DIALOGUE_EVENT_PARAMS } from './data/passengers.js';
import { ACTIONS } from '../characters/index.js';

// data action names the humanoid does not have as procedural actions
// (hail is owned by the ride's Passenger: it loops until the taxi stops)
const ACTION_ALIASES = { pray: 'wai', reachOut: 'point', enterCar: null, exitCar: null, sleep: null, cough: null, hail: null };
const actionName = (a) => {
  if (!a || a in ACTION_ALIASES && !ACTION_ALIASES[a]) return null;
  if (ACTIONS && ACTIONS[a]) return a;
  const m = ACTION_ALIASES[a];
  return m && ACTIONS?.[m] ? m : null;
};

const estDuration = (line) => Math.max(1.8, 1.1 + (line.th || '').length * 0.065 + (line.en || '').length * 0.012);
const NEUTRAL = { smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 };
const isSilentText = (t) => !t || /^[\s.…]*$/.test(t);

export class Dialogue {
  constructor() {
    this.speakers = new Map(); // id -> {nameTH, nameEN, voice, humanoid, object}
    this.aliases = new Map();
    this.token = 0;
    this.busy = false;
    this.current = null;
    this._chain = Promise.resolve();
  }

  /** Register / update a speaker. who-ids: 'player', 'ahKong', 'passenger', 'somchai', 'radio', 'voice', or any character id. */
  setSpeaker(id, spec) {
    this.speakers.set(id, { ...(this.speakers.get(id) || {}), ...spec });
  }

  removeSpeaker(id) {
    this.speakers.delete(id);
  }

  /** Route a `who` id to another registered speaker (null removes the alias). */
  alias(who, speakerId) {
    if (speakerId) this.aliases.set(who, speakerId);
    else this.aliases.delete(who);
  }

  get idle() {
    return !this.busy;
  }

  _speaker(who) {
    const id = this.aliases.get(who) || who;
    const reg = this.speakers.get(id);
    if (reg) return reg;
    const c = CHARACTERS[id];
    if (c) {
      const sp = { nameTH: c.nameTH, nameEN: c.nameEN, voice: c.voice || {}, humanoid: null, object: null };
      this.speakers.set(id, sp);
      return sp;
    }
    return this.speakers.get('voice') || { nameTH: '', nameEN: '', voice: {} };
  }

  _cancelChoice() {
    this._choiceOpen = false;
    try {
      g.ui?.choiceUI?.active?.cancel?.();
    } catch (e) {
      /* ignore */
    }
  }

  /** Stop whatever is playing (rule events interrupt small talk). */
  interrupt() {
    this.token++;
    try {
      g.audio?.voice?.stop?.();
    } catch (e) {
      /* ignore */
    }
    g.ui?.clearSubtitle?.();
    this._cancelChoice();
    if (this.current?.humanoid) this.current.humanoid.setTalking(false);
    this.current = null;
    this.busy = false;
  }

  /** Ton says a picked reply aloud (no subtitle). Never voices '…'. */
  async speakPlayer(text, token = this.token) {
    if (isSilentText(text)) return;
    if (settings.get('voice') === 'off' || !g.audio?.voice) return;
    const sp = this._speaker('player');
    const line = { th: text, en: '' };
    const t0 = g.engine.realTime;
    try {
      await Promise.race([g.audio.voice.speak({ th: text, en: '', voice: sp.voice || {}, object: sp.object || null, tone: 'normal' }), wait(estDuration(line) + 4)]);
    } catch (e) {
      /* voice failure never blocks */
    }
    if (token !== this.token) return;
    const spoken = g.engine.realTime - t0;
    if (spoken < 0.6) await wait(Math.min(1.4, 0.4 + text.length * 0.05));
  }

  /**
   * Play lines in order. Returns {completed, choices:{choiceId: key}, stoppedAt}.
   * opts: { onLine(line, i, depth), startAt }
   */
  async play(lines, opts = {}) {
    const choices = {};
    if (!lines || !lines.length) return { completed: true, choices, stoppedAt: -1 };
    const token = ++this.token;
    // a reply left open by the play we just cut must not linger on screen
    if (this._choiceOpen) this._cancelChoice();
    this.busy = true;
    const state = { choices, top: opts.startAt || 0 };
    let completed = false;
    try {
      completed = await this._run(lines, opts, token, 0, state, opts.startAt || 0);
    } catch (e) {
      console.error('[dialogue] play failed', e);
      completed = false;
    }
    if (token === this.token) {
      this.busy = false;
      this.current = null;
    }
    bus.emit('dialogue:end', { completed });
    return { completed, choices, stoppedAt: completed ? -1 : state.top };
  }

  /** Play after whatever is running now (and anything queued before) has finished. */
  enqueue(lines, opts = {}) {
    const run = async () => {
      await until(() => !this.busy);
      return this.play(lines, opts);
    };
    const p = this._chain.then(run, run);
    this._chain = p.catch(() => {});
    return p;
  }

  async _run(lines, opts, token, depth, state, start = 0) {
    for (let i = start; i < lines.length; i++) {
      if (token !== this.token) return false;
      if (depth === 0) state.top = i;
      const line = lines[i];
      if (!line) continue;
      if (line.set && g.save) Object.assign((g.save.flags ||= {}), line.set);
      const sp = this._speaker(line.who);
      this.current = sp;
      try {
        opts.onLine?.(line, i, depth);
      } catch (e) {
        console.error(e);
      }
      bus.emit('dialogue:line', { line, index: i, depth });
      const nameTH = line.speakerTH ?? sp.nameTH;
      const nameEN = line.speakerEN ?? sp.nameEN;

      if (line.choice) {
        const c = line.choice;
        if (line.th || line.en) g.ui.subtitle({ speakerTH: nameTH, speakerEN: nameEN, th: line.th, en: line.en, tone: line.tone, duration: 30 });
        this._choiceOpen = true;
        let key;
        try {
          key = await g.ui.choice(c);
        } finally {
          if (token === this.token) this._choiceOpen = false;
        }
        if (token !== this.token) return false;
        if (c.id) state.choices[c.id] = key;
        else state.choices[`${depth}:${i}`] = key;
        g.ui.clearSubtitle();
        const option = (c.options || []).find((o) => o.key === key) || null;
        bus.emit('dialogue:choice', { id: c.id || null, key, option });
        // Ton says what he picked (silence is silent)
        if (option && key !== 'silent') await this.speakPlayer(option.th, token);
        if (token !== this.token) return false;
        const branch = c.branches?.[key];
        if (branch && branch.length) {
          const ok = await this._run(branch, opts, token, depth + 1, state, 0);
          if (!ok) return false;
        }
        continue;
      }

      const hum = sp.humanoid;
      if (hum && !hum.disposed) {
        if (line.emotion) hum.setExpression({ ...NEUTRAL, [line.emotion]: 1 });
        const act = actionName(line.action);
        if (act) {
          try {
            // looping actions (sing, stagger...) last as long as the line
            const loops = ACTIONS[act]?.dur === 0;
            hum.play(act, loops ? { loop: false, duration: estDuration(line) + 1 } : {})?.catch?.(() => {});
          } catch (e) {
            /* unknown action */
          }
        }
        hum.setTalking(true, line.tone === 'whisper' ? 0.4 : line.tone === 'shout' ? 1 : 0.8);
      }
      const duration = estDuration(line);
      if (line.th || line.en) g.ui.subtitle({ speakerTH: nameTH, speakerEN: nameEN, th: line.th, en: line.en, tone: line.tone || 'normal', duration: duration + 1.5 });
      const voiceMode = settings.get('voice');
      const voice = { ...(sp.voice || {}), ...(line.tone === 'whisper' ? { whisper: true } : {}), ...(line.tone === 'ghost' ? { ghost: Math.max(0.6, sp.voice?.ghost || 0) } : {}) };
      const t0 = g.engine.realTime;
      const speakable = !isSilentText(line.th) && line.tone !== 'thought' && line.who !== 'player_thought';
      if (voiceMode !== 'off' && g.audio?.voice && speakable) {
        try {
          await Promise.race([
            g.audio.voice.speak({ th: line.th, en: line.en, voice, object: sp.object || hum?.root || null, tone: line.tone }),
            wait(duration + 6),
          ]);
        } catch (e) {
          /* voice failure must never block dialogue */
        }
      }
      if (token !== this.token) {
        if (hum && !hum.disposed) hum.setTalking(false);
        return false;
      }
      const spoken = g.engine.realTime - t0;
      if (spoken < duration * 0.6) await wait(duration - spoken);
      if (hum && !hum.disposed) {
        hum.setTalking(false);
        if (line.emotion) hum.setExpression({ [line.emotion]: 0.25 });
      }
      if (token !== this.token) return false;
      await wait(line.pause ?? DIALOGUE_EVENT_PARAMS.lineGapSeconds ?? 0.4);
    }
    return token === this.token;
  }
}
