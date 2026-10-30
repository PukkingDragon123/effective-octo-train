// Auntie Lek's stall is still open (any hour, near the noodle shop): she calls out as you slow
// down past her ("แวะก่อนไหมหนุ่ม กาแฟร้อน ๆ"). Human, warm, an optional stop.
import { S, THREE } from '../helpers.js';

export const stationary = true;

export function canStart() {
  return S.speedKmh() < 35;
}

export async function run(E) {
  const lm = S.landmark('noodleShop');
  const at = lm?.anchors?.vendorSpot || lm?.prop?.vendorSpot || null;
  const obj = at?.isObject3D ? at : null;
  const pos = obj ? obj.getWorldPosition(new THREE.Vector3()) : S.landmarkPos('noodleShop');
  if (pos && S.distTo(pos) > 60) return;
  E.event('encounter:noodleShopOpen');
  await E.say(E.def.lines, { object: obj });
}
