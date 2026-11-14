// A fair start, then a ramp.
//   * No deaths in the intro, the garage, the tutorial or ride 1: scares there are atmosphere only
//     (an off-road fall there just puts Ton back at the checkpoint, quietly).
//   * From ride 2: QTE windows generous early, tight late (difficulty()); a rule death always gets a
//     clear warning and a few seconds' grace first; a failed jumpscare QTE on the first two nights
//     costs a scare, not a death.
//   * Rules are given progressively: the paper starts with r3 (don't look back) and r2 (left for the
//     dead, right for the living); Ah Kong's hand adds more as the night goes on and across loops
//     (new lines marked "ใหม่"). Only rules Ton has been given are enforced.
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { clamp } from '../../core/math.js';

export const RULE_ORDER = ['r3', 'r2', 'r1', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r16'];
const START = 2; // r3 + r2
const flags = () => (g.save ? (g.save.flags ||= {}) : {});

export function rulesGiven() {
  const f = flags();
  if (!Array.isArray(f['k.rulesGiven'])) f['k.rulesGiven'] = RULE_ORDER.slice(0, START);
  return f['k.rulesGiven'];
}
export const isRuleGiven = (id) => !/^r\d+$/.test(id || '') || rulesGiven().includes(id);
/** Rules given but not yet seen on the paper (drawn with a "new" mark). */
export function rulesNew() {
  const seen = flags()['k.rulesSeen'] || [];
  return rulesGiven().filter((id) => !seen.includes(id));
}
export function markRulesSeen() {
  const f = flags();
  f['k.rulesSeen'] = rulesGiven().slice();
  g.persist?.();
}
/** Give the first n rules (in order); announces the new ones. */
export function giveRulesUpTo(n) {
  const have = rulesGiven();
  const add = RULE_ORDER.slice(0, clamp(n, START, RULE_ORDER.length)).filter((id) => !have.includes(id));
  if (!add.length) return [];
  have.push(...add);
  g.persist?.();
  g.actions?.refreshPaper?.();
  bus.emit('rules:given', { ids: add });
  try {
    g.audio?.play?.('paper_rustle', { volume: 0.5, rate: 0.9 });
    g.ui?.subtitle?.({ speakerTH: 'ต้น', speakerEN: 'Ton', th: 'กระดาษกฎ… มีลายมืออากงเขียนเพิ่มมาอีกข้อ', en: 'The rules paper… Ah Kong’s hand has added another line.', tone: 'thought', duration: 4.5 });
    g.ui?.hint?.({ th: 'กฎข้อใหม่', en: 'New rule', keys: ['Tab'], duration: 4, tutorial: true, force: true });
  } catch (e) {
    /* cosmetic */
  }
  return add;
}

/** 0 (ride 2, first night) .. 1 (late night, many loops). */
export function difficulty() {
  const ride = g.ride?.index ?? g.save?.rideIndex ?? 0;
  const loops = g.save?.loops || 0;
  return clamp((ride - 1) / 7 + loops * 0.08, 0, 1);
}
/** Deaths are off: intro, garage, tutorial, ride 1. */
export function protectedPhase() {
  const st = g.fsm?.currentName;
  if (['intro', 'garage', 'tutorial', 'menu'].includes(st)) return true;
  if (st === 'shift') return (g.ride?.index ?? g.save?.rideIndex ?? 0) === 0;
  return false;
}
/** Scale a QTE spec: generous windows early, tight late. */
export function scaleQTE(spec) {
  const d = difficulty();
  const calm = (g.prayCalm || 0) > (g.engine?.time || 0) ? 1.35 : 1; // a prayer just said loosens it
  const k = (1.9 - 0.9 * d) * calm; // 1.9x the time early, as designed late
  const s = { ...spec };
  if (s.time) s.time *= k;
  if (s.count) s.count = Math.max(3, Math.round(s.count * (0.55 + 0.45 * d)));
  if (s.decay) s.decay *= 0.5 + 0.5 * d;
  if (s.open) s.open *= 0.6 + 0.4 * d;
  return s;
}

// ---- the gate in front of every death (death/index.js kill) -------------------------------------
const RULE_DEATH = new Set(['lookBack', 'roadFold', 'dragBack', 'trueForm', 'home', 'windowAttack', 'giantHand', 'ceilingCrawl', 'trunk', 'nameCall', 'radio', 'breath', 'roadFigure', 'roofHanger', 'count444', 'windowArm', 'extraPassenger']);
let softBusy = false;
/**
 * -> 'avert' (no death: a scare instead), 'grace' (warn, wait, maybe kill), or 'kill'.
 * opts.cause may name the rule ('r3').
 */
export function fairGate(type, opts = {}) {
  if (opts.debug || opts.fair) return 'kill';
  const rule = /^r\d+$/.test(opts.cause || '') ? opts.cause : null;
  if (protectedPhase()) return 'avert';
  if (rule && !isRuleGiven(rule)) return 'avert';
  if (opts.cause === 'jumpscare' && (g.save?.loops || 0) < 2) return 'avert';
  if (rule || RULE_DEATH.has(type)) return 'grace';
  return 'kill';
}
/** The near miss instead of a death: a jolt, a sting, nothing more (off-road: back to the checkpoint). */
export function avertDeath(type) {
  g.cameraRig?.shake?.(0.6);
  g.camfx?.flinch?.(0.8);
  g.audio?.play?.('sting_low', { volume: 0.7 });
  bus.emit('death:averted', { type, fair: true });
  if (type === 'offRoad' && !softBusy) {
    softBusy = true;
    import('./Checkpoint.js').then(async ({ restoreCheckpoint }) => {
      try {
        await g.cine.fade(1, 0.5);
        restoreCheckpoint();
      } finally {
        setTimeout(() => (softBusy = false), 3000);
      }
    });
  }
}
/** The warning and the grace before a rule death: true = still deadly afterwards. */
export async function graceWarn(type) {
  const p = g.postfx?.params;
  g.audio?.play?.('whisper', { volume: 0.9 });
  g.audio?.play?.('heartbeat', { volume: 0.7 });
  g.camfx?.flinch?.(0.5);
  try {
    g.ui?.hint?.({ th: type === 'lookBack' ? 'อย่าหันไป!' : 'ระวัง!', en: type === 'lookBack' ? 'Don’t look!' : 'Careful!', keys: [], duration: 2.6, tutorial: true, force: true });
  } catch (e) {
    /* cosmetic */
  }
  const h0 = p?.horror ?? 0;
  if (p) p.horror = Math.max(h0, 0.6);
  const grace = 3.2 - difficulty() * 1.2;
  await new Promise((r) => setTimeout(r, grace * 1000));
  if (p) p.horror = h0;
  // looking back: turning to the road again in time saves him
  if (type === 'lookBack') return Math.abs(g.cameraRig?.yaw || 0) > (115 * Math.PI) / 180;
  return true;
}
void THREE;

// the schedule: two rules to begin with; two more each ride; two more for every loop survived
const START_FOR = () => START + 2 * (g.save?.loops || 0);
bus.on('ride:start', ({ index } = {}) => giveRulesUpTo(START_FOR() + 2 * (index || 0)));
bus.on('game:state', ({ state, params } = {}) => {
  if (state === 'garage' && params?.restart) {
    const before = rulesGiven().length;
    if (START_FOR() > before) giveRulesUpTo(START_FOR());
  }
});
