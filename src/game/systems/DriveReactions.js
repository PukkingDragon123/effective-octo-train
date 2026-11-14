// How Ton and his passengers feel the driving: a gasp or a curse on hard braking, a swerve, a near
// crash, a near fall off the edge; nervous mutters when the night presses in; passengers lurch in
// their seats and complain (the dead are quietly unsettling about it).
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { TON_REACT, TON_MUTTER, PAX_REACT, PAX_REACT_BY } from '../data/driveTalk.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
let tonCd = 0, paxCd = 0, mutterT = 70;
let lastV = 0;

function tonSays(ev) {
  if (tonCd > 0 || g.dialogue?.busy) return;
  tonCd = 7;
  g.dialogue?.play?.([pick(TON_REACT[ev])]);
}
function paxReacts(ev, kick) {
  const r = g.ride;
  const p = r?.passenger;
  if (!r || !p?.aboard || paxCd > 0) return;
  paxCd = 9;
  // the body lurches (forward on the brake, sideways in a swerve), then settles
  const h = p.humanoid;
  if (h) {
    const L = (h.bodyLean = h.bodyLean?.isVector2 ? h.bodyLean : new THREE.Vector2());
    L.set(kick.x, kick.y);
    let t = 0;
    const off = g.engine.onUpdate((dt) => {
      t += dt;
      L.multiplyScalar(Math.exp(-dt * 3.5));
      if (t > 1.6 || h.disposed) {
        L.set(0, 0);
        off();
      }
    }, 14);
  }
  if (r.playing || g.dialogue?.busy) return;
  const set = PAX_REACT_BY[r.data?.id] || (r.data?.identity === 'ghost' ? PAX_REACT.ghost : PAX_REACT.human);
  r.playLines?.([pick(set)], { front: true });
  void ev;
}

function tick(dt) {
  if (!(dt > 0) || !g.fsm || !['shift', 'tutorial', 'intro'].includes(g.fsm.currentName) || g.isDying?.()) return;
  tonCd = Math.max(0, tonCd - dt);
  paxCd = Math.max(0, paxCd - dt);
  const v = g.player?.vehicle;
  const taxi = v === g.taxi && g.taxi?.controlsEnabled;
  const bike = v === g.bike && g.bike?.controlsEnabled;
  if (!taxi && !bike) return;
  const veh = taxi ? g.taxi : g.bike;
  const kmh = Math.abs(veh.speedKmh || 0);
  if (taxi) {
    const sim = g.taxi.physicsSim;
    if ((sim.accLong ?? 0) < -6.2 && kmh > 22) {
      tonSays('hardBrake');
      paxReacts('hardBrake', { x: 0, y: 0.22 });
    } else if (Math.abs(sim.accLat ?? 0) > 6.5 && kmh > 30) {
      tonSays('swerve');
      paxReacts('swerve', { x: Math.sign(sim.accLat) * -0.2, y: 0 });
    }
    if ((sim.wallContact || 0) > 0.2 && kmh > 25) {
      tonSays('nearCrash');
      paxReacts('nearCrash', { x: 0.15, y: 0.15 });
    }
  } else {
    const dv = (Math.abs(g.bike.v) - lastV) / dt;
    lastV = Math.abs(g.bike.v);
    if (dv < -5.5 && kmh > 18) tonSays('hardBrake');
  }
  // the edge: off the asphalt, the ground already falling away below
  const pr = g.world?.road?.project(veh.root.position);
  if (pr && Math.abs(pr.lateral) > pr.width / 2 + 0.5 && pr.y - veh.root.position.y > 0.7 && kmh > 10) tonSays('nearFall');
  // nervous mutters while the rules bite
  mutterT -= dt * (0.4 + (g.rules?.threat || 0) * 1.6);
  if (mutterT <= 0 && !g.dialogue?.busy && g.ride?.passenger?.aboard) {
    mutterT = 70 + Math.random() * 50;
    g.dialogue?.play?.([pick(TON_MUTTER)]);
  }
}

let installed = false;
bus.on('game:state', () => {
  if (installed || !g.engine) return;
  installed = true;
  g.engine.onUpdate(tick, 38);
  bus.on('bike:impact', (e) => {
    tonSays('nearCrash');
    if (e?.rail && e.point) {
      try {
        g.particles?.emit?.('sparks', { position: e.point, burst: true, autoDispose: true, count: 30 });
        g.audio?.play?.('scratch_glass', { position: e.point, volume: 0.7, rate: 0.55 });
      } catch (err) {
        /* cosmetic */
      }
      g.cameraRig?.shake?.(0.35);
    }
  });
  bus.on('taxi:collision', (e) => {
    if ((e?.speed || 0) < 2) return;
    tonSays('nearCrash');
    paxReacts('crash', { x: 0.1, y: 0.28 });
  });
  // a new night: the taxi comes back straight from Ah Kong's hammer
  bus.on('game:state', ({ state, params } = {}) => {
    if (state === 'garage' && (params?.restart || params?.newNight)) g.taxi?.damage?.repair?.();
  });
});
