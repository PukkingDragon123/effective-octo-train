// First-time control hints: a key glyph and two words, once per save, the first time each control
// is needed (drive, brake, reverse, talk, the mirror). The tutorial teaches driving itself, so the
// drive / brake hints wait for a moment outside it.
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { GLOBAL_UNIFORMS } from '../../render/index.js';
const GLOBAL_RAIN = () => GLOBAL_UNIFORMS?.uRain?.value || 0;

const HINTS = {
  drive: { th: 'เร่งเครื่อง', en: 'Throttle', keys: ['W'] },
  brake: { th: 'เหยียบเบรก', en: 'Brake', keys: ['S'] },
  reverse: { th: 'กดค้าง ถอยหลัง', en: 'Hold to reverse', keys: ['S'] },
  talk: { th: 'คุยด้วย', en: 'Talk', keys: ['F'] },
  mirror: { th: 'มองกระจก', en: 'Use the mirror', keys: ['Mouse'] },
  wipers: { th: 'ที่ปัดน้ำฝน', en: 'Wipers', keys: ['3'] },
  washer: { th: 'กดค้าง ฉีดน้ำ', en: 'Hold: washer', keys: ['3'] },
  pray: { th: 'ไหว้ขอพร', en: 'Pray', keys: ['R'] },
};

/** Show a hint once per save (k.hint.<id>). */
export function firstHint(id) {
  const f = g.save?.flags;
  const h = HINTS[id];
  if (!f || !h || f['k.hint.' + id]) return false;
  f['k.hint.' + id] = true;
  try {
    g.persist?.();
    g.ui?.hint?.({ ...h, duration: 4.5, tutorial: true, force: true });
  } catch (e) {
    /* hints are a nicety */
  }
  return true;
}

let idle = 0, stuck = 0, riding = 0;
function tick(dt) {
  if (!(dt > 0) || !g.fsm || !g.save) return;
  const st = g.fsm.currentName;
  if (!['intro', 'garage', 'tutorial', 'shift'].includes(st) || g.isDying?.()) return;
  const v = g.player?.vehicle;
  const taxi = v === g.taxi && g.taxi?.controlsEnabled && !g.taxi.autopilotSpec;
  const bike = v === g.bike && g.bike?.controlsEnabled && !g.bike.autopilotSpec;
  if (taxi || bike) {
    const veh = taxi ? g.taxi : g.bike;
    const kmh = Math.abs(veh.speedKmh || 0);
    const running = taxi ? !!g.taxi.state.engineOn : true;
    idle = kmh < 1 && running ? idle + dt : 0;
    if (st !== 'tutorial' && idle > 2.5) firstHint('drive');
    if (st !== 'tutorial' && kmh > 25) firstHint('brake');
    const edge = taxi ? (g.taxi.physicsSim.wallContact || 0) > 0 || (g.taxi.physicsSim.offRoad || 0) > 0.4 : !!g.bike._offRoad;
    stuck = edge && kmh < 2 ? stuck + dt : 0;
    if (stuck > 1.2) firstHint('reverse');
  } else idle = stuck = 0;
  // a dirty windshield: the wipers, then the washer
  if (taxi) {
    const ws = g.taxi.glass?.panes?.windshield;
    const dirty = (ws?.uniforms?.uBloodOn?.value || 0) > 0 || (GLOBAL_RAIN() > 0.3);
    if (dirty) firstHint(g.taxi.state.wipers ? 'washer' : 'wipers');
  }
  const r = g.ride;
  riding = r && r.phase === 'riding' && r.passenger?.aboard ? riding + dt : 0;
  if (riding > 10) firstHint('talk');
  if (riding > 25 && r?.data?.seat && r.data.seat !== 'frontPassenger') firstHint('mirror');
}

let installed = false;
bus.on('game:state', () => {
  if (installed || !g.engine) return;
  installed = true;
  g.engine.onUpdate(tick, 37);
});
