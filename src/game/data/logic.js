// LOGIC: pure helpers that turn the narrative data into what one moment of play needs.
// No engine imports. Gameplay calls these; the validator and the narrative sandbox use them too.
// Full conventions: ./SCHEMA.md ("Conditions", "Flags", "Replies", "Loop", "Endings").
//
//   ctx = { save, taxi?, hour?, passengerId? }
//     save  = saves.data ({ loops, flags, memories, deaths:[{rideId,cause,hour}], endingsSeen })
//     taxi  = taxi.state (only for `if.taxi`), hour = game hour 21..30 (only for `if.hourGte/Lt`)
//
// The stock src/game/Dialogue.js plays lines as given and applies `line.set` with
// Object.assign. It does NOT read `if` on lines/options or `loopVariants`, so gameplay MUST pass
// every block through `resolveLines()` / `dialogueBlock()` right before `dialogue.play()`.
// Conditions are evaluated once, when the block starts (never gate a line on a flag that an
// earlier line of the SAME block sets: the validator checks this).
import { MEMORY_IDS } from './memories.js';
import { ENDINGS, ENDING_PRIORITY } from './endings.js';

// ------------------------------------------------------------------ flags
/** Flag key builders (see SCHEMA.md "Flags"). */
export const FLAG = {
  trust: (pid, tag) => `trust.${pid}.${tag}`, // number, night-scoped; passenger trust = sum
  clue: (pid, tag) => `clue.${pid}.${tag}`, // true: a clue the player exposed by asking
  keep: (name) => `k.${name}`, // persists across loops (never cleared on restart)
};

/** The one-shot flag a reply sets when it breaks a rule by speaking. Value: a RULES id. */
export const RULE_BREAK_FLAG = 'ruleBreak';
/** The one-shot flag a reply sets when it invites a pull toward a forbidden look. Value: 'r3' | 'r4'. */
export const LURE_FLAG = 'lure';

/**
 * Flags that GAMEPLAY sets (not dialogue). Conditions may read them; the validator accepts them.
 * Everything else a condition reads must be set somewhere in the data.
 */
export const GAMEPLAY_FLAGS = {
  somchaiFork: "'left' | 'right': the fork result of ride 9 (Somchai)",
  gateLookBack: 'true when rule 3 fires at the mist gate (ride 9 specialRules gate phase setOnLookBack)',
  fatherSawFace: 'true when Ton looked back early in ride 9 (setOnLookBack, early phase)',
  fatherDelivered: 'true once Somchai has walked into the mist and Ton did not look back',
  finalFork: "'left' | 'right': the empty-taxi dawn fork after the gate (see ENDINGS moment 'finalFork')",
  rodeAway: 'true when the motorbike reaches spurStart after the shift was refused (ending ride_away)',
  bloodOnGlass: 'true while the r13 blood (bloodDrip) is on the windshield',
  piakAsleep: 'set by ride 3 lines; gameplay may read it',
  [RULE_BREAK_FLAG]: 'one-shot, set by a reply; gameplay clears it after handling (RULE_BREAKS)',
  [LURE_FLAG]: 'one-shot, set by a reply; gameplay clears it after the pull (RULE_PARAMS.lure*)',
};

/** Clear the night-scoped flags at a loop restart: keeps only `k.*` (persistent knowledge). */
export function clearNightFlags(flags = {}) {
  for (const k of Object.keys(flags)) if (!k.startsWith('k.')) delete flags[k];
  return flags;
}

/** Sum of every `trust.<pid>.*` flag this night. */
export function trustOf(flags = {}, pid) {
  let n = 0;
  const pre = `trust.${pid}.`;
  for (const [k, v] of Object.entries(flags)) if (k.startsWith(pre) && typeof v === 'number') n += v;
  return n;
}

/** How many passengers trust Ton (trust >= 1) this night. Gates Somchai's "I'll drive on" reply. */
export function kindness(flags = {}) {
  const pids = new Set();
  for (const k of Object.keys(flags)) {
    const m = /^trust\.([^.]+)\./.exec(k);
    if (m) pids.add(m[1]);
  }
  let n = 0;
  for (const pid of pids) if (trustOf(flags, pid) >= 1) n++;
  return n;
}

// ------------------------------------------------------------------ conditions
/** Keys a condition object may use (beats, lines, options, endings, scenes). */
export const COND_KEYS = ['taxi', 'flag', 'memories', 'allMemories', 'memoriesGte', 'loopsGte', 'loopsLt', 'diedOn', 'trustGte', 'trustLt', 'kindnessGte', 'hourGte', 'hourLt', 'endingSeen', 'not', 'any'];

/** True when every key of `cond` holds. A missing flag counts as `false`. */
export function checkCond(cond, ctx = {}) {
  if (!cond) return true;
  const save = ctx.save || {};
  const flags = save.flags || {};
  const mem = save.memories || [];
  const loops = save.loops || 0;
  for (const [k, v] of Object.entries(cond)) {
    switch (k) {
      case 'taxi':
        for (const [tk, tv] of Object.entries(v)) if ((ctx.taxi?.[tk] ?? false) !== tv) return false;
        break;
      case 'flag':
        for (const [fk, fv] of Object.entries(v)) if ((flags[fk] ?? false) !== fv) return false;
        break;
      case 'memories':
        if (!v.every((id) => mem.includes(id))) return false;
        break;
      case 'allMemories':
        if (MEMORY_IDS.every((id) => mem.includes(id)) !== v) return false;
        break;
      case 'memoriesGte':
        if (MEMORY_IDS.filter((id) => mem.includes(id)).length < v) return false;
        break;
      case 'loopsGte':
        if (!(loops >= v)) return false;
        break;
      case 'loopsLt':
        if (!(loops < v)) return false;
        break;
      case 'diedOn': {
        const ids = [].concat(v);
        if (!(save.deaths || []).some((d) => ids.includes(d.rideId))) return false;
        break;
      }
      case 'trustGte':
        for (const [pid, n] of Object.entries(v)) if (!(trustOf(flags, pid) >= n)) return false;
        break;
      case 'trustLt':
        for (const [pid, n] of Object.entries(v)) if (!(trustOf(flags, pid) < n)) return false;
        break;
      case 'kindnessGte':
        if (!(kindness(flags) >= v)) return false;
        break;
      case 'hourGte':
        if (!((ctx.hour ?? 21) >= v)) return false;
        break;
      case 'hourLt':
        if (!((ctx.hour ?? 21) < v)) return false;
        break;
      case 'endingSeen':
        if (![].concat(v).some((id) => (save.endingsSeen || []).includes(id))) return false;
        break;
      case 'not':
        if (checkCond(v, ctx)) return false;
        break;
      case 'any':
        if (!v.some((c) => checkCond(c, ctx))) return false;
        break;
      default:
        return false; // unknown key: never true (the validator reports it)
    }
  }
  return true;
}

// ------------------------------------------------------------------ lines
const stripIf = ({ if: _drop, ...rest }) => rest;

/**
 * Filter a block of lines for this moment: drops lines/options whose `if` fails, resolves
 * choice branches recursively and keeps `defaultKey` valid. Returns new plain line objects in
 * exactly the shape src/game/Dialogue.js plays. A choice left with one option plays that
 * option's branch inline (its flags still apply).
 */
export function resolveLines(lines, ctx = {}) {
  const out = [];
  for (const l of lines || []) {
    if (l.if && !checkCond(l.if, ctx)) continue;
    if (!l.choice) {
      out.push(stripIf(l));
      continue;
    }
    const c = l.choice;
    const options = c.options.filter((o) => !o.if || checkCond(o.if, ctx));
    if (options.length < 2) {
      const key = options[0]?.key ?? c.defaultKey;
      out.push(...resolveLines(c.branches?.[key] || [], ctx));
      continue;
    }
    const branches = {};
    for (const o of options) if (c.branches?.[o.key]) branches[o.key] = resolveLines(c.branches[o.key], ctx);
    const defaultKey = options.some((o) => o.key === c.defaultKey) ? c.defaultKey : options[options.length - 1].key;
    out.push({ ...stripIf(l), choice: { ...c, options: options.map(stripIf), branches, defaultKey } });
  }
  return out;
}

/**
 * One dialogue block of a ride for this loop: `ride.dialogue.loopVariants[key][n]` with the highest
 * n <= saves.data.loops replaces the base block, then `resolveLines`.
 *   dialogueBlock(PASSENGER_BY_ID.sri, 'greet', { save })
 */
export function dialogueBlock(ride, key, ctx = {}) {
  const d = ride?.dialogue || {};
  const variants = d.loopVariants?.[key];
  let lines = d[key];
  if (variants) {
    const loops = ctx.save?.loops || 0;
    const best = Object.keys(variants).map(Number).filter((n) => n <= loops).sort((a, b) => b - a)[0];
    if (best != null) lines = variants[best];
  }
  return resolveLines(lines || [], ctx);
}

/** Beats of a ride whose `if` holds right now (the beat's lines still go through resolveLines). */
export const beatAllowed = (beat, ctx) => checkCond(beat.if, ctx);

// ------------------------------------------------------------------ endings
/**
 * The ending reached at a `moment` ('fork' | 'gate' | 'finalFork' | 'garage'), or null.
 * ENDING_PRIORITY decides ties (first match wins).
 */
export function resolveEnding(moment, ctx = {}) {
  for (const id of ENDING_PRIORITY) {
    const e = ENDINGS[id];
    if (e.moment === moment && checkCond(e.when, ctx)) return e;
  }
  return null;
}

/** An ending's scenes and epilogue filtered for this save (scene/epilogue items may carry `if`). */
export function endingFor(id, ctx = {}) {
  const e = ENDINGS[id];
  if (!e) return null;
  return {
    ...e,
    scenes: e.scenes.filter((s) => checkCond(s.if, ctx)).map((s) => ({ ...s, lines: resolveLines(s.lines, ctx) })),
    epilogue: e.epilogue.filter((t) => checkCond(t.if, ctx)).map(stripIf),
  };
}

// ------------------------------------------------------------------ loop
/** Pick from a [{minLoop, ...}] table: the entry with the highest minLoop <= loops. */
export function byLoop(table, loops = 0) {
  let best = null;
  for (const r of table || []) if (r.minLoop <= loops && (!best || r.minLoop > best.minLoop)) best = r;
  return best;
}
