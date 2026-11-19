// Optional side moments on the way to a pickup: Auntie Lek's noodle stall, the memorial at the
// Hundred Corpses Curve, the salas. Passing near one, Ton notices it; the objective becomes a
// checklist with the pickup and an optional stop ("ไม่บังคับ"), ticked when he stops there.
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { setChecklist, tickObjective } from './Objectives.js';

const SPOTS = [
  { key: 'noodleShop', th: '(ไม่บังคับ) แวะร้านก๋วยเตี๋ยวป้าเล็ก', thought: 'ร้านป้าเล็กยังเปิดอยู่… แวะซดน้ำซุปร้อน ๆ สักหน่อยดีไหม' },
  { key: 'accidentCurve', th: '(ไม่บังคับ) แวะศาลข้างโค้งร้อยศพ', thought: 'พวงมาลัยเต็มราวกันตกเลย… ใครกันที่ตายตรงนี้' },
  { key: 'sala1', th: '(ไม่บังคับ) แวะศาลาริมทาง', thought: 'ศาลาเก่าริมทาง… เหมือนมีใครนั่งรออยู่' },
  { key: 'sala2', th: '(ไม่บังคับ) แวะศาลาริมทาง', thought: 'ศาลาหลังนี้… ไฟยังติดอยู่' },
];
let cur = null;

function tick() {
  const r = g.ride;
  if (!g.fsm?.is('shift') || !r || r.phase !== 'approach' || !g.actions?.inTaxi) {
    cur = null;
    return;
  }
  const f = (g.save.flags ||= {});
  const pos = g.taxi.root.position;
  const L = g.world?.landmarks || {};
  if (!cur) {
    for (const sp of SPOTS) {
      const lm = L[sp.key];
      if (!lm?.pos || f['night.side.' + sp.key] || f['night.sideSeen.' + sp.key]) continue;
      if (lm.pos.distanceTo(pos) < 110) {
        cur = sp;
        f['night.sideSeen.' + sp.key] = true;
        g.dialogue?.play?.([{ who: 'player', th: sp.thought, en: '', tone: 'thought' }]);
        setChecklist({ th: 'ขับไปรับลูกค้า', en: 'Drive to the customer' }, [{ id: 'pickup', th: 'รับลูกค้า', en: 'Pick up the customer' }, { id: 'side', th: sp.th, en: '(optional) a stop on the way' }]);
        break;
      }
    }
    return;
  }
  const lm = L[cur.key];
  if (lm?.pos && lm.pos.distanceTo(pos) < 22 && Math.abs(g.taxi.speedKmh) < 3) {
    f['night.side.' + cur.key] = true;
    tickObjective('side');
    bus.emit('side:visited', { key: cur.key });
  }
}

let installed = false;
bus.on('game:state', () => {
  if (installed || !g.engine) return;
  installed = true;
  g.engine.onUpdate(tick, 39);
});
