// Pray, anytime (R · the touch "ไหว้" button): hands together round the amulet, the head bows, a
// whispered prayer; 25 s cooldown. For a while after it (g.prayCalm, engine time) ghosts settle:
// ambient encounters pause, a scare waits, QTE windows loosen (Fairness.scaleQTE). Passing a shrine
// on the shift (ride 2 on) asks for one: pass without praying and something answers (a scare).
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { input, KEY_BINDINGS } from '../../core/Input.js';
import { firstHint } from './FirstHints.js';

const COOLDOWN = 25;
const CALM = 14;
const SHRINES = ['shrineApproach', 'spiritCluster1', 'spurShrine', 'shrineMaRuay'];
let last = -1e9;
let busy = false;
const passed = new Set();

export const prayCalm = () => (g.prayCalm || 0) > (g.engine?.time || 0);

export async function pray() {
  const now = g.engine.time;
  if (busy || now - last < COOLDOWN || g.actions?.busy || g.isDying?.()) return false;
  if (g.player?.vehicle === g.bike) return false; // both hands are on the bars
  busy = true;
  last = now;
  g.prayCalm = now + CALM;
  bus.emit('player:pray', {});
  const A = g.actions;
  const rig = g.cameraRig;
  try {
    // the amulet between the palms, the head bows a little
    if (A?.inTaxi) A.holdAmulet?.(true, 'api');
    else g.player?.hold?.('amulet');
    g.audio?.play?.('amulet_hum', { volume: 0.35 });
    if (!g.dialogue?.busy) g.dialogue?.play?.([{ who: 'player', th: 'สาธุ… ขอให้ลูกช้างปลอดภัยด้วยเถิด', en: 'Sadhu… let me be safe.', tone: 'whisper' }]);
    const p0 = rig.pitch;
    let t = 0;
    await new Promise((res) => {
      const off = g.engine.onUpdate((dt) => {
        t += dt;
        const k = t < 0.5 ? t / 0.5 : t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 0.5) : 1;
        rig.pitch = p0 - 0.28 * k;
        if (t > 2.4) {
          off();
          rig.pitch = p0;
          res();
        }
      }, 46);
    });
    // the night holds its breath
    const wasActive = g.fsm?.is('shift');
    if (wasActive) {
      g.director?.setActive?.(false);
      setTimeout(() => g.fsm?.is('shift') && g.director?.setActive?.(true), CALM * 1000);
    }
  } finally {
    if (A?.inTaxi) A.holdAmulet?.(false);
    else if (g.player?.held === 'amulet') g.player.hold(null);
    busy = false;
  }
  return true;
}

function tick() {
  if (!g.fsm || !['intro', 'garage', 'tutorial', 'shift'].includes(g.fsm.currentName)) return;
  if (input.pressed('pray')) pray();
  // shrines on the way: they ask for a wai (ride 2 on)
  if (!g.fsm.is('shift') || !g.actions?.inTaxi) return;
  const L = g.world?.landmarks || {};
  const pos = g.taxi?.root?.position;
  for (const k of SHRINES) {
    const lm = L[k];
    if (!lm?.pos || !pos) continue;
    const d = lm.pos.distanceTo(pos);
    const key = k + ':' + (g.ride?.index ?? 0) + ':' + (g.save?.loops || 0);
    if (d < 40 && !passed.has(key + ':hint')) {
      passed.add(key + ':hint');
      firstHint('pray');
    }
    if (d < 12 && !passed.has(key)) {
      passed.add(key);
      setTimeout(() => {
        if ((g.ride?.index ?? 0) < 1 || prayCalm() || g.engine.time - last < 18) return;
        // passed the shrine without a wai
        g.audio?.play?.('whisper', { volume: 0.8 });
        import('./Jumpscare.js').then(({ jumpscare }) => jumpscare({ qte: true, death: 'giantHand', lull: 0.5, maxWait: 2500 }));
      }, 6000);
    }
  }
}

function touchButton() {
  if (!('ontouchstart' in window) || document.getElementById('dlb-pray-btn')) return;
  const b = document.createElement('button');
  b.id = 'dlb-pray-btn';
  b.textContent = 'ไหว้';
  b.setAttribute('aria-label', 'Pray');
  b.style.cssText = 'position:absolute;right:calc(env(safe-area-inset-right) + 16px);bottom:calc(env(safe-area-inset-bottom) + 250px);width:58px;height:58px;border-radius:50%;border:2px solid rgba(236,228,210,.55);background:rgba(20,18,16,.45);color:rgba(236,228,210,.92);font:inherit;font-size:16px;z-index:22;touch-action:none;';
  const down = (e) => {
    e.preventDefault();
    input.setVirtual('pray', true);
  };
  const up = () => input.setVirtual('pray', false);
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  (document.getElementById('ui') || document.body).appendChild(b);
}

let installed = false;
bus.on('game:state', () => {
  if (installed || !g.engine) return;
  installed = true;
  if (!KEY_BINDINGS.pray) KEY_BINDINGS.pray = ['KeyR'];
  g.engine.onUpdate(tick, 3);
  try {
    touchButton();
  } catch (e) {
    /* touch optional */
  }
});
