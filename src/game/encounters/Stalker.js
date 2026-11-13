// The one who follows Ton across the night (night-long state shared by the 'stalker' encounter).
//
//  level 0–1  the tree line: it walks at the edge of the trees keeping pace (a real walk, never a
//             glide), peeks from behind trunks and poles, steps out of sight when looked at directly;
//             you pass it, and it is ahead again, a little nearer each time
//  level 2    the roadside: it stands on the shoulder and turns its head after you. Do not stop for it:
//             stop and it walks to your door
//  level 3    the back seat: for ONE rendered frame it sits behind you in the rear-view mirror, and the
//             car settles on its springs; rule 3: do not look back
//  level 4    the road: it stands in your lane (rule 12: do not brake, do not swerve); drive through it
//             and it lets you go until the next night
//  on foot    at the garage (from the second night on) and at every stop later in the night its
//             footsteps follow yours a beat late and stop a step after you; turn round and it is
//             peeking from behind a pole or a tree, and gone when you look straight at it
// The level rises with each sighting, capped by the hour (it cannot be in your lane at 21:00).
import * as THREE from 'three';
import { g } from '../context.js';
import { engine } from '../../core/Engine.js';
import { bus } from '../../core/Events.js';
import { cameraRig } from '../../core/CameraRig.js';
import { createCreatureHumanoid, CREATURE_SPECS } from '../../creatures/index.js';
import * as S from './stage.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

/** Nearest trunk / pole / post (world colliders) to hide behind, within maxDist of p. */
export function findOccluder(p, maxDist = 6, minR = 0.1) {
  const C = g.colliders;
  if (!C) return null;
  let best = null, bd = maxDist * maxDist;
  for (const c of C.circles || []) {
    if (c.r < minR || c.r > 2.5) continue;
    const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
    if (d < bd) {
      bd = d;
      best = { x: c.x, z: c.z, r: c.r };
    }
  }
  for (const b of C.boxes || []) {
    const r = Math.min(b.hx, b.hz);
    if (r < minR || Math.max(b.hx, b.hz) > 2) continue;
    const d = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
    if (d < bd) {
      bd = d;
      best = { x: b.x, z: b.z, r: Math.max(b.hx, b.hz) };
    }
  }
  return best;
}

/**
 * Put a humanoid behind an occluder as seen from `eye`, shifted sideways so one shoulder and half the
 * face peek out. Returns the hide point (fully behind it).
 */
export function peekBehind(h, occ, eye, side = Math.random() < 0.5 ? -1 : 1) {
  const dir = _v.set(occ.x - eye.x, 0, occ.z - eye.z).normalize();
  const perp = _v2.set(-dir.z, 0, dir.x);
  const behind = new THREE.Vector3(occ.x, 0, occ.z).addScaledVector(dir, occ.r + 0.32);
  const peek = behind.clone().addScaledVector(perp, side * (occ.r + 0.12));
  peek.y = behind.y = S.ground(behind.x, behind.z, eye.y - 1.5);
  h.root.position.copy(peek);
  h.root.rotation.y = Math.atan2(dir.x, dir.z); // facing the eye
  h.setGhost({ headRoll: -side * 0.22, backbend: -0.12 }, 4);
  return behind;
}

class StalkerState {
  constructor() {
    this.sightings = 0;
    this.done = false;
    this._installed = false;
    this.echo = { lastStep: -10, dist: 9, dir: new THREE.Vector3(0, 0, 1), lastPos: null, pending: [], extra: false, peekT: -1e9 };
    this.figure = null;
  }
  /** The hour's cap on how bold it is. */
  cap(h = S.hour()) {
    if (h >= 28.5) return -1; // dawn: gone
    return h < 22.5 ? 1 : h < 24 ? 2 : h < 26 ? 3 : 4;
  }
  get level() {
    const c = this.cap();
    if (c < 0 || this.done) return -1;
    return Math.min(c, Math.floor(this.sightings * 0.7));
  }
  advance() {
    this.sightings++;
  }
  reset() {
    this.sightings = 0;
    this.done = false;
    this.echo.pending.length = 0;
    this._dropFigure();
  }

  install() {
    if (this._installed) return this;
    this._installed = true;
    bus.on('game:state', (e) => {
      if (e?.state === 'garage' && (e?.params?.restart || e?.from === 'death' || e?.from === 'menu' || e?.from === 'intro')) this.reset();
      if (e?.state !== 'garage' && e?.state !== 'shift') this._dropFigure();
    });
    bus.on('player:footstep', (e) => this._onStep(e));
    engine.onUpdate((dt) => this._tick(dt), 1);
    return this;
  }

  // ---------------------------------------------------------------- footsteps on foot
  _followActive() {
    if (!g.fsm || !g.player || g.player.mode !== 'foot') return false;
    if (g.fsm.is('garage')) return (g.save?.loops ?? 0) >= 1 && S.hour() < 28.5;
    if (g.fsm.is('shift')) return this.level >= 1;
    return false;
  }
  _onStep(e) {
    if (!this._followActive() || !e?.position) return;
    const E = this.echo;
    const now = engine.time;
    if (E.lastPos) {
      const d = _v.copy(e.position).sub(E.lastPos).setY(0);
      if (d.lengthSq() > 1e-4) E.dir.lerp(d.normalize(), 0.5).normalize();
    }
    E.lastPos = e.position.clone();
    if (now - E.lastStep > 3) E.dist = rand(8, 11); // a new walk: it starts further back
    E.lastStep = now;
    E.dist = Math.max(3.6, E.dist - rand(0.1, 0.25)); // closing in, step by step
    E.extra = true;
    E.pending.push({ at: now + rand(0.26, 0.42), surface: e.surface || 'asphalt' });
  }
  _tick(dt) {
    const E = this.echo;
    const now = engine.time;
    if (!this._followActive()) {
      E.pending.length = 0;
      return;
    }
    const p = g.player?.root?.position;
    if (!p) return;
    const src = _v.copy(p).addScaledVector(E.dir, -E.dist);
    src.y = p.y;
    // looking back at it stops it dead (and sometimes it is peeking)
    if (cameraRig.isLookingAt(src, 40)) {
      if (E.pending.length || E.extra) {
        E.pending.length = 0;
        E.extra = false;
        if (now - E.peekT > 40 && Math.random() < 0.6) {
          E.peekT = now;
          this._peek(src.clone());
        }
      }
      return;
    }
    while (E.pending.length && E.pending[0].at <= now) {
      const st = E.pending.shift();
      S.sfx('footstep_' + st.surface, { position: src.clone(), volume: 0.42, rate: rand(0.92, 1.02) });
    }
    // one step more than you, after you stop
    if (E.extra && now - E.lastStep > 0.75 && now - E.lastStep < 1.0) {
      E.extra = false;
      S.sfx('footstep_' + (g.world?.surfaceAt?.(src.x, src.z) || 'gravel'), { position: src.clone(), volume: 0.48, rate: 0.95 });
    }
    // the peeking figure: gone the moment you look straight at it
    const F = this.figure;
    if (F) {
      F.t += dt;
      const head = F.h.headPosition;
      if (cameraRig.isLookingAt(head, 6)) F.seen += dt;
      if (F.seen > 0.2 || F.t > 2.6) this._dropFigure();
    }
  }
  _peek(near) {
    this._dropFigure();
    const occ = findOccluder(near, 7);
    if (!occ) return;
    const h = createCreatureHumanoid(CREATURE_SPECS.stalker);
    engine.scene.add(h.root);
    h.setGhost({ stare: 1, noBlink: 1, still: 1 }, 100);
    h.setGhostMotion?.('watcher');
    peekBehind(h, occ, engine.camera.position);
    h.lookAt(engine.camera, { speed: 3, weight: 0.8 });
    this.figure = { h, t: 0, seen: 0 };
  }
  _dropFigure() {
    if (this.figure) {
      this.figure.h.dispose();
      this.figure = null;
    }
  }
}

export const stalker = new StalkerState();
