// Dawn chorus (04–06): magpie-robins, bulbuls and a far rooster; a flock of egrets lifts off a
// paddy beyond the trees and crosses the brightening sky.
import { createEgretFlock } from '../../../creatures/index.js';
import { S, THREE, rand } from '../helpers.js';

export const stationary = true;

export async function run(E) {
  const chorus = E.track(S.sfxLoop('birds_dawn', { volume: 0.0, bus: 'ambience' }));
  E.frame((dt, el) => chorus?.setVolume?.(Math.min(0.8, el * 0.15) * Math.min(1, Math.max(0, (E.duration - el) / 4))));
  E.event('encounter:dawnBirds');
  await E.wait(rand(2, 5));
  if (!E.alive) return;
  S.sfx('rooster', { position: S.roadAhead(rand(80, 140), rand(-60, 60)).pos, volume: 0.5 });
  const side = Math.random() < 0.5 ? -1 : 1;
  const origin = S.roadAhead(rand(50, 70), side * rand(35, 50)).pos.add(new THREE.Vector3(0, 3, 0));
  const flock = E.track(createEgretFlock(7 + ((Math.random() * 5) | 0)));
  S.engine.scene.add(flock.root);
  const dir = S.roadAhead(0).right.clone().multiplyScalar(-side).addScaledVector(S.taxiForward(), 0.6).normalize();
  flock.takeOff(origin, dir);
  await E.wait(E.duration);
}
