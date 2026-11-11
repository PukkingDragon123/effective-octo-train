// The same KM post (rule 1): KM 13, the same white cloth tied round it, the same gecko call, three
// times in a row; the road has folded. The third time someone stands beside it, hailing. Rule 1:
// pick up everyone who hails you. Stop for her and the loop lets go (the next post reads KM 14).
// Drive past: once more, two of them now, the cloth soaked red; drive past again and you are folded
// in with them (death roadFold).
import * as THREE from 'three';
import { createSignPost } from '../../../props/index.js';
import { createCreatureHumanoid, CREATURE_SPECS, tubeGeometry } from '../../../creatures/index.js';
import { paintedMaterial } from '../../../render/index.js';
import { S, rand, g } from '../helpers.js';

export function canStart() {
  return S.cameraInside() && S.speedKmh() > 25 && !g.ride;
}

function makePost(E, km, bloody) {
  const sp = createSignPost('km_marker', { km, seed: 1313 });
  const root = new THREE.Group();
  root.add(sp.object);
  // a white cloth tied round the post, its tail hanging (red when the loop has gone wrong)
  const mat = paintedMaterial({ color: bloody ? 0x6a0d0b : 0xe8e4d8, roughness: 0.85, wet: bloody ? 0.9 : 0.4, brush: 0.5, puddles: 0 });
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.1, 0.78 + i * 0.002, Math.sin(a) * 0.1));
  }
  pts.push(new THREE.Vector3(0.12, 0.74, 0.02), new THREE.Vector3(0.16, 0.6, 0.04), new THREE.Vector3(0.17, 0.42, 0.03));
  const cloth = new THREE.Mesh(tubeGeometry(pts, (t) => (t < 0.8 ? 0.018 : 0.018 - (t - 0.8) * 0.05), 5), mat);
  root.add(cloth);
  S.engine.scene.add(root);
  E.cleanup(() => {
    root.removeFromParent();
    cloth.geometry.dispose();
    mat.dispose();
  });
  return root;
}

export async function run(E) {
  const lat = -(3.1 + 0.95);
  const spawn = (d, km, bloody) => {
    const r = S.roadAhead(d, lat);
    const post = makePost(E, km, bloody);
    post.position.copy(r.pos);
    post.rotation.y = r.yaw;
    return { post, pos: r.pos.clone(), r };
  };
  const hailers = [];
  const hailer = (spec, at, side) => {
    const h = E.track(createCreatureHumanoid(spec));
    S.engine.scene.add(h.root);
    const p = at.pos.clone().addScaledVector(at.r.tangent, side).addScaledVector(at.r.right, -0.6);
    p.y = S.ground(p.x, p.z, p.y);
    h.root.position.copy(p);
    h.root.rotation.y = Math.atan2(-at.r.right.x, -at.r.right.z); // facing the road
    h.setGhost({ stare: 1, noBlink: 1, headRoll: 0.08 }, 100);
    h.play('hail', { side: 'R', lookAt: E.taxi?.root });
    h.lookAt(S.engine.camera, { speed: 1, weight: 0.6 });
    hailers.push(h);
    return h;
  };
  let cur = null;
  for (let pass = 1; pass <= 4 && E.alive; pass++) {
    cur = spawn(pass === 1 ? 110 : 140, 13, pass === 4);
    if (pass >= 3) hailer(CREATURE_SPECS.windowWoman, cur, 0.8);
    if (pass === 4) hailer({ ...(S.CHARACTERS.extraChild?.appearance || CREATURE_SPECS.windowWoman), id: 'kmChild' }, cur, 1.6);
    if (pass === 3) {
      E.event('encounter:kmPostLoop');
      E.report('start', { outcome: null });
    }
    // the same gecko, the same moment, every time
    let gecko = false, stopT = 0;
    const res = await E.until((dt) => {
      const d = S.aheadOf(cur.pos);
      if (!gecko && d < 35) {
        gecko = true;
        S.sfx('gecko', { position: cur.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), volume: 0.8, rate: 1 });
        if (pass >= 2) g.audio?.radio?.setStatic?.(0.4);
      }
      if (hailers.length && S.distTo(cur.pos) < 13 && S.speedKmh() < 8) stopT += dt;
      else stopT = 0;
      if (stopT > 0.8) return 'stopped';
      return d < -6;
    }, 70);
    g.audio?.radio?.setStatic?.(0);
    if (!E.alive) return;
    if (!res) break; // they never came back round (timeout)
    if (hailers.length && stopT > 0.8) {
      // stopped for her: she is gone; the loop opens
      for (const h of hailers) h.setOpacity(0);
      await E.whisper(E.def.lines[0], cur.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
      E.outcome('stopped');
      E.report('resolved', { outcome: 'stopped' });
      const next = spawn(130, 14, false);
      await E.until(() => S.aheadOf(next.pos) < -8, 40);
      return;
    }
    // drove past: they vanish behind; the road folds once more
    for (const h of hailers.splice(0)) {
      E.whisperRandom(h.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
      h.setOpacity(0);
    }
    cur.post.visible = false;
    if (pass === 4) {
      E.violate('roadFold', 'droveBy');
      await E.wait(10);
      return;
    }
    if (pass >= 2) S.sfx('sting_low', { volume: 0.4 + pass * 0.1 });
  }
}
