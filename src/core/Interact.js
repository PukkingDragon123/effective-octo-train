// Look-at-and-click interaction registry. Anything the player can physically use
// (door handles, ignition key, radio knob, window crank, shrine offering...) is
// registered here. Each frame we raycast from the view centre; the UI shows a
// minimal hint for the current target, and pressing `interact` calls onUse().
import * as THREE from 'three';
import { engine } from './Engine.js';
import { input } from './Input.js';
import { bus } from './Events.js';
import { cameraRig } from './CameraRig.js';

const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
const _center = new THREE.Vector2(0, 0);

class Interact {
  constructor() {
    this.items = new Set();
    this.current = null;
    this.currentHit = null;
    this.enabled = true;
    this.holding = null; // item whose onHold is running
  }

  install() {
    engine.onUpdate((dt) => this.update(dt), 5);
    return this;
  }

  /**
   * Register an interactable.
   * spec = {
   *   id: string, object: Object3D (meshes inside are raycast; invisible proxies are fine),
   *   labelEN: string, labelTH: string, icon?: 'hand'|'grab'|'talk'|'eye'|'key'|'pray',
   *   reach?: metres (default 1.5), enabled?: () => boolean,
   *   onUse?: (ctx:{item, point, hit}) => void,          // on press
   *   onHold?: (dt, ctx) => void, onRelease?: (ctx) => void  // while held
   * }
   * Returns the item (call interact.unregister(item) to remove).
   */
  register(spec) {
    const item = { reach: 1.5, icon: 'hand', enabled: () => true, ...spec };
    this.items.add(item);
    return item;
  }

  unregister(item) {
    this.items.delete(item);
    if (this.current === item) this._setCurrent(null, null);
  }

  /** Remove every item whose id starts with prefix (scene teardown). */
  unregisterPrefix(prefix) {
    for (const it of [...this.items]) if (it.id.startsWith(prefix)) this.unregister(it);
  }

  _setCurrent(item, hit) {
    if (item !== this.current) {
      this.current = item;
      bus.emit('interact:target', item ? { id: item.id, labelEN: item.labelEN, labelTH: item.labelTH, icon: item.icon } : null);
    }
    this.currentHit = hit;
  }

  update(dt) {
    if (!this.enabled || engine.paused || cameraRig.cineBlend > 0.5) {
      this._setCurrent(null, null);
      return;
    }
    raycaster.setFromCamera(_center, engine.camera);
    raycaster.far = 4;
    let best = null;
    let bestHit = null;
    const objs = [];
    const owners = new Map();
    for (const it of this.items) {
      let ok = false;
      try {
        ok = it.enabled();
      } catch (e) {
        ok = false;
      }
      if (!ok || !it.object) continue;
      objs.push(it.object);
      owners.set(it.object, it);
    }
    if (objs.length) {
      const hits = raycaster.intersectObjects(objs, true);
      for (const h of hits) {
        let o = h.object;
        let owner = null;
        while (o && !owner) {
          owner = owners.get(o) || null;
          o = o.parent;
        }
        if (owner && h.distance <= owner.reach) {
          best = owner;
          bestHit = h;
          break;
        }
      }
    }
    this._setCurrent(best, bestHit);

    if (best && input.pressed('interact')) {
      const ctx = { item: best, point: bestHit.point.clone(), hit: bestHit };
      bus.emit('interact:use', { id: best.id });
      try {
        best.onUse?.(ctx);
      } catch (err) {
        console.error('[interact] onUse failed', best.id, err);
      }
      if (best.onHold) this.holding = { item: best, ctx };
      input.consume('interact');
    }
    if (this.holding) {
      if (input.down('interact') || input.down('confirm')) {
        try {
          this.holding.item.onHold(dt, this.holding.ctx);
        } catch (err) {
          console.error(err);
        }
      } else {
        try {
          this.holding.item.onRelease?.(this.holding.ctx);
        } catch (err) {
          console.error(err);
        }
        this.holding = null;
      }
    }
  }
}

export const interact = new Interact();
