// Off-road crash detector. Running onto the verge, the shoulder or a shallow ditch is recoverable:
// slow down and back out (the taxi's automatic reverses when you hold the brake at a standstill;
// the bike paddles back). A crash (g.kill('offRoad') -> the crash, the TV news, back to the last
// checkpoint) happens only on
//   * a real fall: the vehicle well below the road surface beside it (off a bridge, over the edge
//     into a ravine, a big drop), or
//   * a high-speed impact: more than ~45 km/h straight into the brush wall / a tree line (taxi
//     'taxi:collision', bike 'bike:impact' with a hard outward component, not a scrape).
// Only while the player is in control (no autopilot, no cutscene).
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { kill } from '../death/index.js';
import '../death/offRoad.js';
import './FirstHints.js';
import './Jumpscare.js';
import './Aftermath.js';
import './DriveReactions.js';

const STATES = new Set(['intro', 'garage', 'tutorial', 'shift']);
const CFG = {
  fallDrop: 1.8, // m below the road surface beside it
  fallDwell: 0.18, // s
  impactKmh: 45,
  impactOutward: { taxi: 4.5, bike: 3.5 }, // m/s straight into it (a glancing scrape is less)
};
let installed = false;
let falling = 0;
let pr = null;
const lastKmh = { taxi: 0, bike: 0 };

function active() {
  return !!g.fsm && !!g.world?.road && STATES.has(g.fsm.currentName) && !g.isDying?.() && !g.godMode;
}
function controlled() {
  const v = g.player?.vehicle;
  if (!v) return null;
  if (v === g.bike && g.bike.controlsEnabled && !g.bike.autopilotSpec && !g.bike.crashed) return 'bike';
  if (v === g.taxi && g.taxi.controlsEnabled && !g.taxi.autopilotSpec && !g.taxi.physicsSim?.frozen) return 'taxi';
  return null;
}
function crash(kind, cause) {
  falling = 0;
  kill('offRoad', { vehicle: kind, noLastChance: true, cause });
}

function tick(dt) {
  const kind = active() ? controlled() : null;
  if (!(dt > 0) || !kind) {
    falling = 0;
    return;
  }
  const veh = kind === 'bike' ? g.bike : g.taxi;
  const pos = veh.root.position;
  pr = g.world.road.project(pos, veh.physics?.roadRef?.id ?? null, pr);
  const beyond = Math.abs(pr.lateral) > pr.width / 2 + 0.3;
  const drop = pr.y + 0.03 - pos.y;
  falling = beyond && drop > CFG.fallDrop ? falling + dt : 0;
  if (falling > CFG.fallDwell) return crash(kind, 'fall');
  lastKmh[kind] = Math.abs(veh.speedKmh || 0);
}

function onImpact(kind, kmhNow, outward) {
  if (!active() || controlled() !== kind) return;
  const kmh = Math.max(kmhNow || 0, lastKmh[kind]); // the speed going in, before the hit took it
  if (kmh > CFG.impactKmh && (outward ?? 0) > CFG.impactOutward[kind]) crash(kind, 'impact');
}

/** Install once (idempotent). */
export function ensureOffRoad() {
  if (installed || !g.engine) return;
  installed = true;
  if (!g.kill) g.kill = kill;
  g.engine.onUpdate(tick, 36);
  bus.on('taxi:collision', (e) => onImpact('taxi', 0, e?.speed ?? (e?.impulse ?? 0) / 1150));
  bus.on('bike:impact', (e) => onImpact('bike', e?.kmh, e?.outward));
}

bus.on('game:state', () => ensureOffRoad());
