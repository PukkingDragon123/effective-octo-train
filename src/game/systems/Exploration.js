// Exploration (engineer B): optional stops on foot during the shift. Getting out and back in is
// A's PlayerActions (g.actions); these interactables only work while Ton is out of the cab.
//   * Auntie Lek's noodle stall (world.noodleCounter): buy a coffee (memory m_noodle the first time)
//   * the cracked helmet at the Hundred Corpses Curve memorial (world.memorialHelmet): memory m_helmet
//   * spirit houses and shrines along the road: a wai and an offering (rule r10 respect, once per
//     shrine per night; honking twice from the car is handled by g.rules)
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { LAYERS } from '../../core/layers.js';
import { createHumanoid } from '../../characters/index.js';
import { CHARACTERS } from '../data/characters.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { NOODLE_MENU } from '../data/worldtext.js';
import { RULE_PARAMS as RP } from '../data/rules.js';

const LEK = (th, en, x = {}) => ({ who: 'auntieLek', th, en, ...x });
// Auntie Lek after the first coffee (natural, warm, a little bossy)
const LEK_AGAIN = [
  [LEK('กาแฟโบราณร้อน ๆ จ้ะ ยี่สิบบาท', 'Hot old-style coffee, dear. Twenty baht.'), LEK('ระวังลวกปากนะ', "Careful, it's hot.")],
  [LEK('ปาท่องโก๋ด้วยไหม เพิ่งทอดเลย', 'Fried dough sticks too? Fresh out of the oil.', { emotion: 'smile' })],
  [LEK('ขับดี ๆ นะหนุ่ม คืนนี้หมอกลงหนา', "Drive carefully, dear. The fog's thick tonight.")],
  [LEK('กินอะไรรองท้องหน่อย หน้าซีดเชียว', "Eat something. You look pale.", { emotion: 'sad' })],
];

const SHRINE_KINDS = new Set(['spirit_cluster', 'sacred_tree', 'spirit_house', 'shrine_approach', 'shrine_maruay']);

export class Exploration {
  constructor() {
    this.items = [];
    this.proxies = [];
    this._offs = [];
    this.lek = null;
    this._lekGreeted = false;
    this._coffees = 0;
    this._offered = new Set();
    this._built = false;
    this._offs.push(bus.on('game:state', ({ state } = {}) => {
      if (state === 'shift') this.build();
    }));
    this._offUpdate = g.engine.onUpdate((dt) => this.update(dt), 3);
    if (g.fsm?.is('shift')) this.build();
  }

  /** Ton is out of the cab during the shift. */
  onFoot() {
    if (!g.taxi || !g.fsm?.is('shift') || g.cameraRig.inCinematic) return false;
    return g.actions ? !!g.actions.onFoot : !g.taxi.isCameraInside();
  }

  _proxy(pos, size, parent = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshBasicMaterial({ visible: false }));
    m.layers.set(LAYERS.INTERACT);
    if (parent) {
      parent.add(m);
      m.position.set(0, 0, 0);
    } else {
      m.position.copy(pos);
      g.engine.scene.add(m);
    }
    this.proxies.push(m);
    return m;
  }
  _register(spec) {
    const it = g.interact.register({ reach: 2.2, icon: 'hand', enabled: () => this.onFoot(), ...spec });
    this.items.push(it);
    return it;
  }

  /** Register the on-foot interactables (once; the shift calls it on enter). */
  build() {
    if (this._built || !g.world) return;
    this._built = true;
    const w = g.world;
    // ---- Auntie Lek's counter -------------------------------------------------------------------
    if (w.noodleCounter) {
      const p = this._proxy(null, [1.4, 0.5, 0.8], w.noodleCounter);
      this._register({ id: 'world.noodleCounter', object: p, labelTH: 'ซื้อกาแฟ', labelEN: 'Buy a coffee', icon: 'hand', onUse: () => this.buyCoffee() });
    }
    // ---- the memorial helmet ---------------------------------------------------------------------
    if (w.memorialHelmet) {
      const p = this._proxy(null, [0.45, 0.4, 0.45], w.memorialHelmet);
      this._register({ id: 'world.memorialHelmet', object: p, labelTH: 'หมวกกันน็อก', labelEN: 'The helmet', icon: 'eye', onUse: () => this.helmet() });
    }
    // ---- spirit houses: wai + offering --------------------------------------------------------------
    for (const s of this._shrines()) {
      const p = this._proxy(s.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), [1.0, 1.8, 1.0]);
      this._register({ id: 'world.shrine.' + s.id, object: p, labelTH: 'ไหว้', labelEN: 'Pay respects', icon: 'hand', reach: 2.6, onUse: () => this.offer(s) });
    }
  }

  _shrines() {
    const out = [];
    const w = g.world;
    for (const lm of Object.values(w.landmarks || {})) {
      if (!SHRINE_KINDS.has(lm.kind)) continue;
      const a = lm.anchors?.offering || lm.anchors?.incense;
      const pos = a ? a.getWorldPosition(new THREE.Vector3()) : (lm.centre || lm.pos).clone();
      out.push({ id: lm.key, pos });
    }
    for (const it of w.placement?.items || []) {
      if (it.type !== 'spirit') continue;
      try {
        out.push({ id: `spirit:${it.id}:${Math.round(it.s)}`, pos: w.road.get(it.id).pointAt(it.s, it.lat) });
      } catch (e) {
        /* ignore */
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ actions
  async buyCoffee() {
    if (this._busy) return;
    this._busy = true;
    try {
      this._ensureLek(true);
      this.lek?.lookAt(g.engine.camera, { speed: 4 });
      g.audio?.play?.('coins', { object: g.world.noodleCounter, volume: 0.7 });
      this._coffees++;
      if (!g.knowledge?.hasMemory('m_noodle')) {
        this.lek?.play?.('giveItem')?.catch?.(() => {});
        await g.knowledge?.collect('m_noodle');
      } else {
        const lines = LEK_AGAIN[(this._coffees - 1) % LEK_AGAIN.length];
        this.lek?.play?.('giveItem')?.catch?.(() => {});
        await g.dialogue.enqueue(lines);
      }
      // a hot coffee: the windshield clears a little, Ton's hands warm up
      g.taxi?.setFog('windshield', 0);
      g.player?.holdItem?.('coffee');
      bus.emit('exploration:bought', { item: 'coffee', price: NOODLE_MENU.coffeePrice ?? 20 });
    } finally {
      this._busy = false;
    }
  }

  async helmet() {
    if (this._busy) return;
    this._busy = true;
    try {
      g.audio?.play?.('wind_chime', { object: g.world.memorialHelmet, volume: 0.4 });
      if (!g.knowledge?.hasMemory('m_helmet')) await g.knowledge?.collect('m_helmet');
    } finally {
      this._busy = false;
    }
  }

  offer(shrine) {
    const pos = shrine.pos;
    g.audio?.play?.('bell_temple', { position: pos, volume: 0.45 });
    g.audio?.play?.('wind_chime', { position: pos, volume: 0.3, delay: 0.6 });
    bus.emit('player:wai', { at: pos });
    if (this._offered.has(shrine.id)) return;
    this._offered.add(shrine.id);
    if (g.rules) g.rules.respect = g.rules.respect + (RP.respectPerHonk || 1);
    g.knowledge?.learnRule('r10');
    bus.emit('rule:event', { ruleId: 'r10', phase: 'resolved', outcome: 'offering', shrine: shrine.id, respect: g.rules?.respect, source: 'rules' });
  }

  // ------------------------------------------------------------------ Auntie Lek
  _ensureLek(force = false) {
    if (this.lek && !this.lek.disposed) return this.lek;
    const lm = g.world.landmarks.noodleShop;
    if (!lm) return null;
    const near = g.engine.camera.position.distanceTo(lm.pos) < 70;
    if (!near && !force) return null;
    const ch = CHARACTERS.auntieLek;
    if (!ch?.appearance) return null;
    const h = createHumanoid({ id: 'auntieLek', ...ch.appearance });
    const spot = lm.anchors?.vendorSpot;
    const pos = spot ? spot.getWorldPosition(new THREE.Vector3()) : lm.pos.clone();
    pos.y = g.world.getHeight(pos.x, pos.z);
    h.root.position.copy(pos);
    h.root.rotation.set(0, lm.facing ?? lm.yaw ?? 0, 0);
    h.setGroundFn?.((x, z) => g.world.getHeight(x, z));
    g.engine.scene.add(h.root);
    g.dialogue.setSpeaker('auntieLek', { nameTH: ch.nameTH, nameEN: ch.nameEN, voice: ch.voice || {}, humanoid: h, object: h.root });
    this.lek = h;
    return h;
  }
  _dropLek() {
    if (!this.lek) return;
    g.dialogue.setSpeaker('auntieLek', { humanoid: null, object: null });
    this.lek.dispose?.();
    this.lek = null;
  }

  update(dt) {
    this._t = (this._t || 0) + dt;
    if (this._t < 0.5) return;
    this._t = 0;
    if (!g.fsm?.is('shift') || !g.world) {
      if (this.lek && !g.fsm?.is('shift')) this._dropLek();
      return;
    }
    const lm = g.world.landmarks.noodleShop;
    if (!lm) return;
    const d = g.engine.camera.position.distanceTo(lm.pos);
    if (d < 70) this._ensureLek();
    else if (d > 120) this._dropLek();
    if (this.lek && this.onFoot() && d < 10 && !this._lekGreeted) {
      this._lekGreeted = true;
      this.lek.lookAt(g.engine.camera, { speed: 3 });
      this.lek.play?.('wave')?.catch?.(() => {});
      g.dialogue.enqueue(ENCOUNTERS.noodleShopOpen?.lines || []);
    }
  }

  /** New night: Lek greets again, offerings count again. */
  resetNight() {
    this._lekGreeted = false;
    this._coffees = 0;
    this._offered.clear();
  }

  dispose() {
    for (const off of this._offs.splice(0)) off();
    this._offUpdate?.();
    for (const it of this.items) g.interact.unregister(it);
    for (const p of this.proxies) {
      p.removeFromParent();
      p.geometry.dispose();
      p.material.dispose();
    }
    this._dropLek();
  }
}
