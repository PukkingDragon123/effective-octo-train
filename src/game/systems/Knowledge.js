// Knowledge (g.knowledge): what Ton keeps across the loop. Memories (the 7 + their hooks),
// pencil notes on the rules paper (per rule and per passenger), exposed clues, passengers
// identified, rules proven. Everything lives in the active save (g.save) and survives the
// restart (logic.clearNightFlags only clears night flags; this lives outside the flags).
//
//   g.knowledge.hasMemory(id) · collect(id, {silent}) -> Promise<bool> · memories()
//   g.knowledge.addNote(id) (PENCIL_NOTES key: 'r1'..'r16', 'p:<pid>', 'back', 'hidden') · hasNote(id)
//   g.knowledge.learnRule(ruleId) (rule proven: pencil note + tick) · learnPassenger(pid, identity)
//   g.knowledge.addClue(pid, tag) · clues(pid)
//   g.knowledge.paperData() -> { annotations:{id:{th,en}}, revealed:[ruleIds], hiddenLine:bool }
//   events: 'knowledge:memory' {id}, 'knowledge:note' {id}, 'knowledge:changed'
//
// Memory hooks (MEMORIES[].interactId / event / requires) are listened to here:
//   m_photo  interact 'taxi.sunVisor' (or the visor opening)   m_sticker interact 'taxi.sticker' / taxi:inspect
//   m_amulet first amulet:hold {active:true}                  m_letter  glovebox opened from 02:00
//   m_song   station 3 between 03:00 and 04:00 (audio:radio memory 'm_song'), heard for a while
//   m_helmet / m_noodle: Exploration.js (on foot, world.memorialHelmet / world.noodleCounter)
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { MEMORIES, MEMORY_IDS } from '../data/memories.js';
import { PENCIL_NOTES, RULE_IDS, HIDDEN_LINE } from '../data/rules.js';

const MEM_BY_ID = Object.fromEntries(MEMORIES.map((m) => [m.id, m]));

export class Knowledge {
  constructor() {
    this._offs = [];
    this._songT = 0;
    this._collecting = new Set();
    this._install();
  }

  // ------------------------------------------------------------------ storage
  get save() {
    return g.save || null;
  }
  _k() {
    const s = this.save;
    if (!s) return null;
    s.knowledge ||= {};
    const k = s.knowledge;
    k.notes ||= [];
    k.clues ||= {};
    k.passengers ||= {};
    s.memories ||= [];
    s.rulesLearned ||= [];
    return k;
  }
  _changed() {
    bus.emit('knowledge:changed', {});
    g.persist?.();
  }

  // ------------------------------------------------------------------ memories
  hasMemory(id) {
    return !!this.save?.memories?.includes(id);
  }
  memories() {
    return (this.save?.memories || []).filter((id) => MEMORY_IDS.includes(id));
  }
  get memoryCount() {
    return this.memories().length;
  }

  /**
   * Collect a memory: store it, play its moment (Ton's thoughts or the memory's speaker),
   * add its pencil note. Returns false when already known (or unknown id).
   */
  async collect(id, opts = {}) {
    const m = MEM_BY_ID[id];
    if (!m || !this._k() || this.hasMemory(id) || this._collecting.has(id)) return false;
    this._collecting.add(id);
    this.save.memories.push(id);
    this._changed();
    bus.emit('knowledge:memory', { id, memory: m });
    try {
      if (!opts.silent && g.dialogue) {
        g.audio?.play?.('paper_rustle', { volume: 0.25, bus: 'ui' });
        const who = m.speaker || 'player';
        const lines = (m.text || []).map((t) => ({ who, th: t.th, en: t.en, tone: who === 'player' ? 'thought' : 'normal', pause: 0.5 }));
        await g.dialogue.enqueue(lines);
      }
    } finally {
      this._collecting.delete(id);
    }
    this.addNote('mem:' + id, m.pencil);
    return true;
  }

  // ------------------------------------------------------------------ pencil notes
  hasNote(id) {
    return !!this._k()?.notes.includes(id);
  }
  /** Add a pencil note (PENCIL_NOTES key, or any id with an explicit {th,en}). */
  addNote(id, text = null) {
    const k = this._k();
    if (!k || !id || k.notes.includes(id)) return false;
    if (!text && !PENCIL_NOTES[id]) return false;
    k.notes.push(id);
    if (text) (k.noteText ||= {})[id] = { th: text.th, en: text.en };
    bus.emit('knowledge:note', { id, text: text || PENCIL_NOTES[id] });
    this._changed();
    return true;
  }
  /** A rule was proven (survived or died to it): tick + its pencil note. Back-of-paper rules add 'back'. */
  learnRule(ruleId) {
    const s = this.save;
    if (!s || !RULE_IDS.includes(ruleId)) return;
    this._k();
    if (!s.rulesLearned.includes(ruleId)) {
      s.rulesLearned.push(ruleId);
      this._changed();
    }
    this.addNote(ruleId);
    if (Number(ruleId.slice(1)) >= 11) this.addNote('back');
  }
  isRuleLearned(ruleId) {
    return !!this.save?.rulesLearned?.includes(ruleId);
  }
  /** The passenger's nature is now known (delivered, or died to them). */
  learnPassenger(pid, identity) {
    const k = this._k();
    if (!k) return;
    k.passengers[pid] = identity;
    this.addNote('p:' + pid);
    this._changed();
  }
  knowsPassenger(pid) {
    return this._k()?.passengers[pid] || null;
  }
  addClue(pid, tag) {
    const k = this._k();
    if (!k) return;
    const list = (k.clues[pid] ||= []);
    if (!list.includes(tag)) {
      list.push(tag);
      this._changed();
    }
  }
  clues(pid) {
    return this._k()?.clues[pid] || [];
  }

  /** Data for the rules paper (ui.drawRulesPaper / A's PlayerActions). */
  paperData() {
    const k = this._k();
    const annotations = {};
    if (k) {
      for (const id of k.notes) {
        const t = k.noteText?.[id] || PENCIL_NOTES[id];
        if (!t) continue;
        // memories are shown in the player's list (non-rule keys)
        annotations[id.startsWith('mem:') ? 'p:' + id.slice(4) : id] = { th: t.th, en: t.en };
      }
    }
    return {
      annotations,
      revealed: [...(this.save?.rulesLearned || [])],
      hiddenLine: (this.save?.loops || 0) >= (HIDDEN_LINE.minLoop ?? 1),
    };
  }

  // ------------------------------------------------------------------ hooks
  _install() {
    const on = (n, f) => this._offs.push(bus.on(n, f));
    const hour = () => g.clock?.hour ?? 21;
    const inHours = (m) => {
      const h = m.requires?.hours || m.where?.hours;
      return !h || (hour() >= h[0] && hour() < h[1]);
    };
    on('interact:use', ({ id } = {}) => {
      for (const m of MEMORIES) {
        if (!m.interactId || m.interactId !== id) continue;
        if (m.requires?.onFoot) continue; // Exploration handles the on-foot ones
        if (!inHours(m)) continue;
        if (m.id === 'm_photo') {
          // the visor flips down with this press (after the hand reach): the photo shows then
          setTimeout(() => (!g.taxi || g.taxi.state.visor) && this.collect(m.id), 900);
          continue;
        }
        if (m.id === 'm_letter') continue; // taxi:control glovebox below
        this.collect(m.id);
      }
    });
    // clues exposed by asking the right question (flags clue.<pid>.<tag>) are remembered
    on('dialogue:line', ({ line } = {}) => {
      if (!line?.set) return;
      for (const k of Object.keys(line.set)) {
        const m = /^clue\.([^.]+)\.(.+)$/.exec(k);
        if (m && line.set[k]) this.addClue(m[1], m[2]);
      }
    });
    on('taxi:inspect', (d) => {
      if (d?.what === 'sticker') this.collect('m_sticker');
    });
    on('amulet:hold', (d) => {
      if (d?.active) this.collect('m_amulet');
    });
    on('taxi:control', (d) => {
      if (d?.control === 'glovebox' && d.value === true && inHours(MEM_BY_ID.m_letter)) setTimeout(() => this.collect('m_letter'), 700);
    });
    on('audio:radio', (d) => {
      this._radioMemory = d?.memory === 'm_song';
    });
    // m_song: station 3 during 03:00–04:00, heard for a while (or the radio says it is the father's song)
    const tick = () => {
      if (!g.taxi || !this.save || this.hasMemory('m_song') || !g.fsm?.is('shift')) return;
      const st = g.taxi.state;
      const m = MEM_BY_ID.m_song;
      const ok = st.radioOn && (this._radioMemory || (st.radioStation === (m.requires?.station ?? 3) && inHours(m)));
      this._songT = ok ? this._songT + 0.5 : Math.max(0, this._songT - 1);
      if (this._songT >= 18) this.collect('m_song');
    };
    this._timer = setInterval(() => {
      if (g.engine && !g.engine.paused) tick();
    }, 500);
  }

  dispose() {
    for (const off of this._offs.splice(0)) off();
    clearInterval(this._timer);
  }
}
