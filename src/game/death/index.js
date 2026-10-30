// Death (engineer B). kill(type, opts) is installed as g.kill. It plays the registered death
// cinematic for `type`, then fsm.go('death', {...}) → DeathState: the Thai death card and the
// loop restart (21:00 at the garage, knowledge kept).
//
//   kill(type, opts?) -> Promise<bool>     false when a death is already running
//     type: a WORLD_TEXT.DEATH_CARDS key (giantHand trueForm roadFold windowAttack dragBack home
//           lookBack ceilingCrawl trunk nameCall radio breath roadFigure roofHanger count444
//           windowArm extraPassenger crash yaiSpeed) or an alias (faceGaze → trueForm, knock → trunk)
//     opts: { cause, ending (e.g. 'wrong_home': counts as a death AND an ending seen), block (ride
//           dialogue block to play inside the cinematic, e.g. 'onFaceGaze'), keepDialogue, maxSeconds }
//   registerDeath(type, async (ctx) => {})  C registers the creature-heavy ones (giantHand,
//           ceilingCrawl, windowArm, trueForm...). An explicit registration always wins over
//           B's defaults (registerDefaultDeath), whatever the import order.
//   ctx = { type, opts, g, taxi, ride, passenger (ride Passenger | null), humanoid (its humanoid | null),
//           eye(): Vector3 driver eye, wait, during, tween, cine, scare(k), alive() }
//   isDying(), deathCardFor(type)
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { wait, during, tween } from '../util.js';
import { DEATH_CARDS } from '../data/worldtext.js';

const registry = new Map();
const defaults = new Map();

export const DEATH_ALIASES = { faceGaze: 'trueForm', knock: 'trunk', knocks: 'trunk', backSeat: 'lookBack', backSeatVoice: 'lookBack', fold: 'roadFold' };

let dying = false;

/** Register (or replace) the cinematic for a death type. fn(ctx) -> Promise. */
export function registerDeath(type, fn) {
  registry.set(type, fn);
}
/** B's built-in cinematics: used only when nobody registered that type. */
export function registerDefaultDeath(type, fn) {
  defaults.set(type, fn);
}
export const isDying = () => dying;
/** Called by DeathState once the loop has restarted. */
export function clearDying() {
  dying = false;
}

export function cardType(type) {
  if (DEATH_CARDS[type]) return type;
  const a = DEATH_ALIASES[type];
  if (a && DEATH_CARDS[a]) return a;
  return null;
}
/** The death card {th, en, rule} for a type (aliases resolved; a generic line otherwise). */
export function deathCardFor(type) {
  const k = cardType(type);
  return k ? DEATH_CARDS[k] : { th: 'คืนนี้ยังไม่จบ', en: 'The night is not over.', rule: null };
}

function pickCinematic(type) {
  const a = DEATH_ALIASES[type];
  return registry.get(type) || (a && registry.get(a)) || defaults.get(type) || (a && defaults.get(a)) || defaults.get('generic') || null;
}

const _eye = new THREE.Vector3();
function makeCtx(type, opts) {
  const ride = g.ride || null;
  const passenger = ride?.passenger || null;
  let alive = true;
  const ctx = {
    type,
    opts,
    g,
    taxi: g.taxi,
    ride,
    passenger,
    humanoid: passenger?.humanoid || null,
    wait,
    during,
    tween,
    cine: g.cine,
    alive: () => alive,
    eye(out = new THREE.Vector3()) {
      if (g.taxi?.anchors?.driverEye) return g.taxi.anchors.driverEye.getWorldPosition(out);
      return out.copy(g.engine.camera.position);
    },
    /** Shock: hit sound, shake, blood on the lens (gore-aware), red flash. k 0..1 */
    scare(k = 1) {
      g.audio?.play?.('scare_hit', { volume: 0.9 * k, bus: 'sfx' });
      g.cameraRig?.shake?.(0.6 * k);
      if (g.settings?.get('gore') !== 'off') g.postfx?.bloodSplash?.(0.8 * k);
      g.postfx?.flash?.(new THREE.Color(0.5, 0.02, 0.01), 0.35);
    },
  };
  ctx._end = () => (alive = false);
  return ctx;
}

/**
 * Kill the player: cinematic → DeathState (card) → loop restart.
 * Only engineer B's systems decide a death (rules, fork, encounter outcomes routed through g.rules).
 */
export async function kill(type = 'crash', opts = {}) {
  if (dying) return false;
  if (!g.fsm || g.fsm.is('death') || g.fsm.is('ending') || g.fsm.is('menu')) return false;
  dying = true;
  const ctx = makeCtx(type, opts);
  const from = g.fsm.currentName;
  bus.emit('death:start', { type, opts, from });
  try {
    g.rules?.suspend?.(true);
    g.ride?.halt?.();
    try {
      g.director?.stopAll?.();
    } catch (e) {
      console.warn('[death] director.stopAll failed', e);
    }
    if (!opts.keepDialogue) g.dialogue?.interrupt();
    g.ui?.hint?.(null);
    g.actions?.setEnabled?.(false); // paper down, amulet released (A re-enables them at the garage)
    g.taxi?.setControlsEnabled(false);
    g.ui?.setCrosshair?.(false);
    const fn = pickCinematic(type);
    if (fn) {
      try {
        await Promise.race([fn(ctx), wait(opts.maxSeconds ?? 16)]);
      } catch (e) {
        console.error(`[death] cinematic ${type} failed`, e);
      }
    }
  } finally {
    ctx._end();
  }
  const ride = g.ride;
  // the state machine moves on even if something above went wrong
  g.fsm.go('death', {
    type,
    cause: opts.cause || type,
    ending: opts.ending || null,
    rideId: ride?.data?.id ?? opts.rideId ?? null,
    rideIndex: ride?.index ?? opts.rideIndex ?? g.save?.rideIndex ?? 0,
    hour: g.clock?.hour ?? 21,
    from,
  });
  return true;
}
