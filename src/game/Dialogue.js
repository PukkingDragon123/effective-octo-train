// Dialogue runner: plays arrays of line objects (schema: src/game/data/SCHEMA.md)
//   { who, th, en, tone?, emotion?, action?, pause?, choice?: {options:[{key,th,en}], timeout?, defaultKey?}, set?: {flag: value} }
// For each line it shows a bilingual subtitle, speaks it (Thai TTS or murmur via
// audio.voice), animates the speaker (talking jaw, expression, action) and waits.
import { g } from './context.js';
import { wait } from './util.js';
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';

const estDuration = (line) => Math.max(1.8, 1.1 + (line.th || '').length * 0.065 + (line.en || '').length * 0.012);

export class Dialogue {
  constructor() {
    this.speakers = new Map(); // id -> {nameTH, nameEN, voice, humanoid, object}
    this.token = 0;
    this.busy = false;
    this.current = null;
  }

  /** Register / update a speaker. who-ids: 'player', 'ahKong', 'passenger', 'somchai', 'radio', 'voice', or any character id. */
  setSpeaker(id, spec) {
    this.speakers.set(id, { ...(this.speakers.get(id) || {}), ...spec });
  }

  removeSpeaker(id) {
    this.speakers.delete(id);
  }

  _speaker(who) {
    return this.speakers.get(who) || this.speakers.get('voice') || { nameTH: '', nameEN: '', voice: {} };
  }

  /** Stop whatever is playing (rule events interrupt small talk). */
  interrupt() {
    this.token++;
    g.audio?.voice?.stop?.();
    g.ui?.clearSubtitle?.();
    if (this.current?.humanoid) this.current.humanoid.setTalking(false);
    this.busy = false;
  }

  /**
   * Play lines in order. Returns {completed:boolean, choices:{lineIndexOrKey: chosenKey}}.
   * opts: { onLine(line, i), skippable=false }
   */
  async play(lines, opts = {}) {
    if (!lines || !lines.length) return { completed: true, choices: {} };
    const token = ++this.token;
    this.busy = true;
    const choices = {};
    for (let i = 0; i < lines.length; i++) {
      if (token !== this.token) return { completed: false, choices };
      const line = lines[i];
      if (line.set && g.save) Object.assign(g.save.flags, line.set);
      const sp = this._speaker(line.who);
      this.current = sp;
      opts.onLine?.(line, i);
      bus.emit('dialogue:line', { line, index: i });

      if (line.choice) {
        if (line.th || line.en) g.ui.subtitle({ speakerTH: sp.nameTH, speakerEN: sp.nameEN, th: line.th, en: line.en, tone: line.tone, duration: 30 });
        const key = await g.ui.choice(line.choice);
        if (token !== this.token) return { completed: false, choices };
        choices[line.choice.id || i] = key;
        g.ui.clearSubtitle();
        if (line.choice.branches && line.choice.branches[key]) {
          const r = await this.play(line.choice.branches[key], opts);
          Object.assign(choices, r.choices);
          if (!r.completed) return { completed: false, choices };
          this.token = token; // nested play bumped the token; restore ours
        }
        continue;
      }

      const hum = sp.humanoid;
      if (hum) {
        if (line.emotion) hum.setExpression({ smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0, [line.emotion]: 1 });
        if (line.action) hum.play(line.action).catch?.(() => {});
        hum.setTalking(true, line.tone === 'whisper' ? 0.4 : line.tone === 'shout' ? 1 : 0.8);
      }
      const duration = estDuration(line);
      g.ui.subtitle({ speakerTH: sp.nameTH, speakerEN: sp.nameEN, th: line.th, en: line.en, tone: line.tone || 'normal', duration: duration + 1.5 });
      const voiceMode = settings.get('voice');
      const voice = { ...(sp.voice || {}), ...(line.tone === 'whisper' ? { whisper: true } : {}), ...(line.tone === 'ghost' ? { ghost: Math.max(0.6, sp.voice?.ghost || 0) } : {}) };
      const t0 = g.engine.realTime;
      if (voiceMode !== 'off' && g.audio?.voice && line.who !== 'player_thought' && line.tone !== 'thought') {
        try {
          await Promise.race([
            g.audio.voice.speak({ th: line.th, en: line.en, voice, object: sp.object || hum?.root || null, tone: line.tone }),
            wait(duration + 6),
          ]);
        } catch (e) {
          /* voice failure must never block dialogue */
        }
      }
      const spoken = g.engine.realTime - t0;
      if (spoken < duration * 0.6) await wait(duration - spoken);
      if (hum) {
        hum.setTalking(false);
        if (line.emotion) hum.setExpression({ [line.emotion]: 0.25 });
      }
      if (token !== this.token) return { completed: false, choices };
      await wait(line.pause ?? 0.4);
    }
    if (token === this.token) {
      this.busy = false;
      this.current = null;
    }
    return { completed: true, choices };
  }
}
