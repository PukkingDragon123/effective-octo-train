// Off-road detector: riding the bike or driving the taxi past the shoulder into the ditch (or off a
// bridge, over the guardrail line) at speed kills Ton: g.kill('offRoad') -> the crash, the TV news,
// GAME OVER (see death/offRoad.js and DeathState). Only while the player is in control (no
// autopilot, no cutscene), never on a set-piece pad (the garage apron, the stalls), never at a
// road's open end. A slow roll onto the verge just meets the brush (the vehicles' own corridor).
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { LAYOUT } from '../../world/layout.js';
import { kill } from '../death/index.js';
import '../death/offRoad.js';

const STATES = new Set(['intro', 'garage', 'tutorial', 'shift']);
const CFG = {
  bike: { margin: 0.3, kmh: 10 },
  taxi: { margin: 0.32, kmh: 14 },
  dwell: 0.12, // s beyond the edge before it counts
};
let installed = false;
let over = 0;
let pr = null;

function onPad(x, z, grow) {
  const pads = g.world?.terrain?.pads || [];
  for (const p of pads) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.r + grow || Math.abs(dz) > p.r + grow) continue;
    const ux = dx * p.cos - dz * p.sin, uz = dx * p.sin + dz * p.cos;
    if (Math.abs(ux) <= p.hx + grow && Math.abs(uz) <= p.hz + grow) return true;
  }
  return false;
}

function controlled() {
  const v = g.player?.vehicle;
  if (!v) return null;
  if (v === g.bike && g.bike.controlsEnabled && !g.bike.autopilotSpec && !g.bike.crashed) return 'bike';
  if (v === g.taxi && g.taxi.controlsEnabled && !g.taxi.autopilotSpec && !g.taxi.physicsSim?.frozen) return 'taxi';
  return null;
}

function tick(dt) {
  if (!(dt > 0) || !g.fsm || !g.world?.road || !STATES.has(g.fsm.currentName) || g.isDying?.() || g.godMode) {
    over = 0;
    return;
  }
  const kind = controlled();
  if (!kind) {
    over = 0;
    return;
  }
  const veh = kind === 'bike' ? g.bike : g.taxi;
  const pos = veh.root.position;
  pr = g.world.road.project(pos, veh.physics?.roadRef?.id ?? null, pr);
  const sp = g.world.road.get(pr.id);
  const atEnd = sp && !sp.closed && (pr.s < 1 || pr.s > sp.length - 1);
  const C = CFG[kind];
  const edge = pr.width / 2 + LAYOUT.shoulder + C.margin;
  const out = !atEnd && Math.abs(pr.lateral) > edge && Math.abs(veh.speedKmh || 0) > C.kmh && !onPad(pos.x, pos.z, 1.2);
  over = out ? over + dt : Math.max(0, over - dt * 2);
  if (over < CFG.dwell) return;
  over = 0;
  kill('offRoad', { vehicle: kind, noLastChance: true, cause: 'offRoad' });
}

/** Install once (idempotent). */
export function ensureOffRoad() {
  if (installed || !g.engine) return;
  installed = true;
  if (!g.kill) g.kill = kill;
  g.engine.onUpdate(tick, 36);
}

bus.on('game:state', () => ensureOffRoad());
